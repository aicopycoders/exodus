import fs from "node:fs";
import path from "node:path";
import { getVersion } from "../lib/version.js";
import { findParentRoot } from "../lib/layout.js";
import { run as runInit } from "./init.js";

// "Update" is the word users reach for; init is the command that does it.
// Without this alias, "run an exodus update" has no real target — agents
// improvise with doctor, which reports version currency but never rewrites
// the scaffold, so skills silently stay stale (issue #588's live repro).
export const helpText = `
exodus update — refresh this workspace from the installed CLI (alias of init)

Re-runs the init refresh: rewrites .claude/skills/, the workspace docs
(CLAUDE.md, PIPELINES.md), and syncs brand folders from the package you
invoked. Your .env, state/, and outputs are left untouched.

Usage:
  exodus update

Note: the CLI itself updates because npx resolves your channel fresh on each
run — so invoke this as \`npx @aicopycoders/exodus update\` (or @beta on the
beta channel), not from a stale local install.
`.trim();

/**
 * The retired zip CLI printed `Roll back with: npx exodus update --rollback`
 * whenever its post-apply health check failed, and it really did restore from
 * `.backup/<timestamp>/`. This CLI has no rollback — nothing here writes those
 * snapshots. Silently ignoring the flag would run a scaffold REFRESH for someone
 * who asked for a RESTORE: the exact overwrite they were trying to undo. So
 * refuse, and point at the folder their old CLI left behind (#686).
 */
function refuseRollback(root: string): void {
  console.error("`--rollback` isn't something this version can do.");
  console.error("");
  console.error("Rolling back was a feature of the old downloadable Exodus. This");
  console.error("version installs fresh from npm every time you run it, so there is");
  console.error("no saved copy here for it to put back — and refreshing now would");
  console.error("overwrite your files again, which is the opposite of what you asked.");
  console.error("");
  const backupDir = path.join(root, ".backup");
  let stamps: string[] = [];
  try {
    stamps = fs
      .readdirSync(backupDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    /* no .backup/ — nothing to point at */
  }
  if (stamps.length > 0) {
    console.error("Your old CLI did leave saved copies here:");
    console.error(`  ${backupDir}`);
    console.error(`  newest first: ${stamps.slice(0, 3).join(", ")}`);
    console.error("");
    console.error("To put one back, copy it over by hand, for example:");
    console.error(`  cp -R "${path.join(backupDir, stamps[0], ".claude", "skills")}" "${path.join(root, ".claude")}/"`);
  } else {
    console.error(`No saved copies found at ${backupDir}.`);
  }
  process.exit(1);
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  // `init` targets the cwd, which is right for "set up a workspace HERE". Update
  // means "refresh the workspace I am IN", and a multi-brand install is worked
  // from inside a brand subfolder — those hold no .env/.exodus, so findParentRoot
  // walks up to the real root (lib/layout.ts). Without this, `update` run from a
  // brand folder scaffolds a SECOND workspace inside it and leaves the real one
  // stale — which is exactly what doctor's #588 nudge would have talked people
  // into. An explicit --root still wins.
  const root = typeof flags.root === "string" ? flags.root : findParentRoot();
  if (flags.rollback) refuseRollback(root);
  const rooted = typeof flags.root === "string" ? flags : { ...flags, root };
  console.log(`Exodus ${getVersion()} — refreshing workspace scaffold…`);
  await runInit(rooted);
}
