import { getVersion } from "../lib/version.js";
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

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  console.log(`Exodus ${getVersion()} — refreshing workspace scaffold…`);
  await runInit(flags);
}
