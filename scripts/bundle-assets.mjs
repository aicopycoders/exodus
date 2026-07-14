// Copies the skill + reference sources from the monorepo into the package's
// assets/ dir so they ship inside the npm tarball. Run by `prepack` (before
// npm packs/publishes) and on demand via `npm run bundle-assets`.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exodusDir = dirname(dirname(fileURLToPath(import.meta.url))); // exodus/
const repoRoot = dirname(exodusDir);
const skillsSrc = join(repoRoot, "workspace", ".claude", "skills");
const refsSrc = join(repoRoot, "workspace", "references");
const docSrcs = [
  join(repoRoot, "workspace", "CLAUDE.md"),
  join(repoRoot, "workspace", "PIPELINES.md"),
];

const assetsDir = join(exodusDir, "assets");
const skillsDest = join(assetsDir, "skills");
const refsDest = join(assetsDir, "references");
const docsDest = join(assetsDir, "docs");

// ── Forbidden patterns (client-name leak-check) ───────────────────────────
const FORBIDDEN = [/grounding co\b/i, /grounding company/i, /matt beard/i];

// ── Member-facing references allowlist ────────────────────────────────────
// workspace/references/ doubles as a drop zone for internal research notes
// (wayfinder probes, vendor comparisons) that must never ship to members.
// Only the framework docs the workspace CLAUDE.md points members at are
// bundled; everything else is skipped by default (2026.7.200-beta.7 shipped
// five internal docs, one with client data, because this copied the whole dir).
const MEMBER_REFERENCES = new Set([
  "awareness-framework.md",
  "cast-video.md",
  "copy-blocks.md",
  "creative-strategy.md",
  "editing-rules.md",
  "hook-quality-checklist.md",
  "iterations.md",
  "scrawls.md",
  "segments.md",
]);

/** Recursively yield all file paths under dir. */
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

// ── Copy skills ──────────────────────────────────────────────────────────
if (!existsSync(skillsSrc)) {
  if (existsSync(skillsDest)) {
    // Public-repo layout: assets already bundled, no monorepo workspace present.
    console.log(
      "bundle-assets: source absent, assets already present — skipping copy"
    );
    // Fall through to leak-check below.
  } else {
    // Neither source nor existing assets: hard error.
    console.error(`bundle-assets: skill source not found at ${skillsSrc}`);
    process.exit(1);
  }
} else {
  // Monorepo layout: (re)build assets from source.
  rmSync(assetsDir, { recursive: true, force: true });
  mkdirSync(assetsDir, { recursive: true });

  cpSync(skillsSrc, skillsDest, { recursive: true });
  if (existsSync(refsSrc)) {
    mkdirSync(refsDest, { recursive: true });
    const skipped = [];
    for (const entry of readdirSync(refsSrc, { withFileTypes: true })) {
      if (entry.isFile() && MEMBER_REFERENCES.has(entry.name)) {
        cpSync(join(refsSrc, entry.name), join(refsDest, entry.name));
      } else {
        skipped.push(entry.name);
      }
    }
    if (skipped.length > 0) {
      console.log(
        `bundle-assets: skipped non-member references: ${skipped.join(", ")}`
      );
    }
  }

  mkdirSync(docsDest, { recursive: true });
  for (const docSrc of docSrcs) {
    if (existsSync(docSrc)) cpSync(docSrc, join(docsDest, basename(docSrc)));
  }

  console.log(`bundle-assets: copied skills + docs -> ${assetsDir}`);
}

// ── Leak-check: scan every file in assetsDir ────────────────────────────
const offenders = [];
if (existsSync(assetsDir)) {
  for (const filePath of walk(assetsDir)) {
    try {
      const text = readFileSync(filePath, "utf8");
      if (FORBIDDEN.some((re) => re.test(text))) {
        offenders.push(filePath);
      }
    } catch {
      // Binary or unreadable — skip.
    }
  }
}

if (offenders.length > 0) {
  console.error("bundle-assets: forbidden client literal found in bundled output:");
  for (const f of offenders) console.error("  " + f);
  console.error(
    "bundle-assets: forbidden client literal found in bundled output (see above) — neutralize before publishing"
  );
  process.exit(1);
}

console.log("bundle-assets: leak-check passed");
