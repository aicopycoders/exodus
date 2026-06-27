import fs from "node:fs";
import path from "node:path";
import { skillsDir, referencesDir } from "./assets.js";

// Comment-only .env — never ships a secret. The dashboard's "Copy .env block"
// fills the real values in below the marker line.
export const ENV_SCAFFOLD = `# Exodus config — paste your dashboard .env block below this line.
# Get it from your Exodus dashboard -> Settings -> Claude Code -> "Copy .env block".
# ONE key covers every brand you own; switch brands with brand subfolders or
# \`npx @aicopycoders/exodus brand use <slug>\`, never by editing this file.
`;

export function writeEnvScaffold(root: string): { created: boolean } {
  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) return { created: false };
  fs.writeFileSync(envPath, ENV_SCAFFOLD);
  return { created: true };
}

export function ensureGitignore(root: string): void {
  const giPath = path.join(root, ".gitignore");
  const lines = fs.existsSync(giPath)
    ? fs.readFileSync(giPath, "utf8").split("\n")
    : ["node_modules/", "output/*", "!output/.gitkeep"];
  if (!lines.some((l) => l.trim() === ".env")) lines.push(".env");
  fs.writeFileSync(giPath, lines.join("\n").replace(/\n+$/, "") + "\n");
}

export function writeSkills(root: string, srcOverride?: string): string[] {
  const src = skillsDir(srcOverride);
  const dest = path.join(root, ".claude", "skills");
  fs.mkdirSync(dest, { recursive: true });
  const names: string[] = [];
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(dest, entry.name);
    fs.rmSync(target, { recursive: true, force: true }); // refresh = overwrite
    fs.cpSync(path.join(src, entry.name), target, { recursive: true });
    names.push(entry.name);
  }
  return names;
}

export function writeReferences(root: string, srcOverride?: string): void {
  let src: string;
  try {
    src = referencesDir(srcOverride);
  } catch {
    return; // references are optional
  }
  if (!fs.existsSync(src)) return;
  const dest = path.join(root, "references");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

export function ensureBaseDirs(root: string): void {
  const out = path.join(root, "output");
  fs.mkdirSync(out, { recursive: true });
  const keep = path.join(out, ".gitkeep");
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, "");
  fs.mkdirSync(path.join(root, "state"), { recursive: true });
  const exodusDir = path.join(root, ".exodus");
  fs.mkdirSync(exodusDir, { recursive: true });
  const statePath = path.join(exodusDir, "state.json");
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify({ layoutVersion: 2 }, null, 2) + "\n");
  }
}
