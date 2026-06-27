import fs from "node:fs";
import path from "node:path";
import {
  writeEnvScaffold,
  ensureGitignore,
  writeSkills,
  writeReferences,
  ensureBaseDirs,
} from "../lib/scaffold.js";
import { loadWorkspaceEnv } from "../lib/load-env.js";
import { ensureBrandDir } from "../lib/layout.js";

export const helpText = `
exodus init — Set up (or refresh) an Exodus workspace in the current folder

Usage:
  npx @aicopycoders/exodus init        Scaffold the workspace + install skills
  npx @aicopycoders/exodus init --root <dir>   Target a specific folder

Run this in a fresh, empty folder. It creates the workspace layout, writes the
Exodus + Genesis skills into .claude/skills/, scaffolds a comment-only .env, and
prints the dashboard paste step. Safe to re-run: it never overwrites your .env
or brand folders — re-running refreshes the skills and catches up new brands.
`.trim();

export interface InitResult {
  existing: boolean;
  envCreated: boolean;
  skills: string[];
}

// Pure core: no console output, returns what happened. `root` is the workspace
// root (cwd for the real command).
export function scaffoldInit(root: string): InitResult {
  const existing = fs.existsSync(path.join(root, ".env"));
  ensureBaseDirs(root);
  const { created: envCreated } = writeEnvScaffold(root);
  ensureGitignore(root);
  const skills = writeSkills(root);
  writeReferences(root);
  return { existing, envCreated, skills };
}

export async function syncBrands(
  root: string,
): Promise<{ synced: string[] } | { skipped: "no-key" | "api-error" }> {
  loadWorkspaceEnv(root);
  if (!process.env.EXODUS_API_KEY) return { skipped: "no-key" };

  // Lazy-import the API-backed brand helpers so the no-key path stays offline.
  try {
    const { fetchMineOrThrow, refreshBrandProfileMd } = await import("./brand.js");
    const mine = await fetchMineOrThrow();
    const synced: string[] = [];
    for (const brand of mine.brands ?? []) {
      ensureBrandDir(root, { slug: brand.slug, name: brand.name });
      await refreshBrandProfileMd({ slug: brand.slug });
      synced.push(brand.slug);
    }
    return { synced };
  } catch {
    return { skipped: "api-error" };
  }
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  const root = typeof flags.root === "string" ? path.resolve(flags.root) : process.cwd();
  const r = scaffoldInit(root);

  console.log(
    `${r.existing ? "Refreshed" : "Initialized"} Exodus workspace at ${root}`,
  );
  console.log(`  Installed ${r.skills.length} skills into .claude/skills/`);

  const brands = await syncBrands(root);
  if ("synced" in brands && brands.synced.length) {
    console.log(`  Synced ${brands.synced.length} brand folder(s): ${brands.synced.join(", ")}`);
  } else if ("skipped" in brands && brands.skipped === "api-error") {
    console.log("  (Skipped brand sync — couldn't reach the API; check your key/URL, then re-run.)");
  }

  if (r.envCreated) {
    console.log("");
    console.log("NEXT STEP — add your keys:");
    console.log("  1. Open your Exodus dashboard -> Settings -> Claude Code.");
    console.log('  2. Click "Copy .env block".');
    console.log(`  3. Paste it into ${path.join(root, ".env")} below the comment, save.`);
    console.log("  4. Restart this Claude Code session (or /clear) so the skills load.");
  } else {
    console.log("  .env already present — left untouched.");
    console.log("  Restart the session (or /clear) to pick up refreshed skills.");
  }
}
