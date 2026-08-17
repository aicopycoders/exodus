import fs from "node:fs";
import path from "node:path";
import { getVersion } from "../lib/version.js";
import { findParentRoot } from "../lib/layout.js";
import { run as runInit } from "./init.js";
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
function refuseRollback(root) {
    console.error("`--rollback` isn't something this version can do.");
    console.error("");
    console.error("Rolling back was a feature of the old downloadable Exodus. This");
    console.error("version installs fresh from npm every time you run it, so there is");
    console.error("no saved copy here for it to put back — and refreshing now would");
    console.error("overwrite your files again, which is the opposite of what you asked.");
    console.error("");
    const backupDir = path.join(root, ".backup");
    let stamps = [];
    try {
        stamps = fs
            .readdirSync(backupDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort()
            .reverse();
    }
    catch {
    }
    if (stamps.length > 0) {
        console.error("Your old CLI did leave saved copies here:");
        console.error(`  ${backupDir}`);
        console.error(`  newest first: ${stamps.slice(0, 3).join(", ")}`);
        console.error("");
        console.error("To put one back, copy it over by hand, for example:");
        console.error(`  cp -R "${path.join(backupDir, stamps[0], ".claude", "skills")}" "${path.join(root, ".claude")}/"`);
    }
    else {
        console.error(`No saved copies found at ${backupDir}.`);
    }
    process.exit(1);
}
export async function run(flags) {
    const root = typeof flags.root === "string" ? flags.root : findParentRoot();
    if (flags.rollback)
        refuseRollback(root);
    const rooted = typeof flags.root === "string" ? flags : { ...flags, root };
    console.log(`Exodus ${getVersion()} — refreshing workspace scaffold…`);
    await runInit(rooted);
}
