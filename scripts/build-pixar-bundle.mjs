// Bundle the Pixar orchestrator into a single dependency-free ESM file that
// ships inside Exodus (exodus/dist/pixar-orchestrator.js) and is dynamic-
// imported by `exodus pixar run`.
//
// The orchestrator source lives in ../scout/src/pixar/*. Its only npm import is
// the `logger` from `@trigger.dev/sdk/v3` (in utils/create-agent-doc.ts, which
// is shared by ~13 Trigger.dev pipelines and must NOT be edited in source). We
// alias that specifier to a console-backed shim at build time only. Everything
// else is Node builtins + global fetch, so the artifact has zero runtime deps.
//
// esbuild is a build-time devDependency of exodus/ — it is not shipped and does
// not affect Exodus's zero-runtime-dependency design.

import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";
import { mkdir } from "node:fs/promises";
import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const exodusRoot = resolve(here, "..");
const repoRoot = resolve(exodusRoot, "..");
const scoutSrc = resolve(repoRoot, "scout/src");

const entry = resolve(scoutSrc, "pixar/exodus-entry.ts");
const shim = resolve(scoutSrc, "pixar/_shims/trigger-logger.ts");
const outdir = resolve(exodusRoot, "dist");
const outfile = resolve(outdir, "pixar-orchestrator.js");

await mkdir(outdir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile,
  alias: { "@trigger.dev/sdk/v3": shim },
  metafile: true,
  logLevel: "warning",
});

// Guard the dependency-free invariant: if any bundled input came from
// node_modules, an npm package leaked into a bundle that is supposed to contain
// only Node builtins + local source. Fail loudly so packaging never ships a
// half-bundled artifact that would need an install on the student's machine.
const leaks = Object.keys(result.metafile.inputs).filter((p) => p.includes("node_modules"));
if (leaks.length > 0) {
  console.error("✖ pixar bundle pulled in npm packages (it must be dependency-free):");
  for (const l of leaks) console.error("   " + l);
  process.exit(1);
}

const moduleCount = Object.keys(result.metafile.inputs).length;
console.log(
  `✓ pixar orchestrator bundled → ${relative(repoRoot, outfile)} ` +
    `(${moduleCount} local modules, 0 npm deps)`,
);
