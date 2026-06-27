import fs from "node:fs";
import path from "node:path";

/**
 * Tiny zero-dependency .env loader.
 *
 * Walks up from process.cwd() looking for the nearest `.env`, parses simple
 * KEY=value lines, and writes them into `process.env` — but only when the
 * variable isn't already set, so shell exports always win.
 *
 * Why a custom loader instead of `dotenv`: exodus is intentionally
 * dependency-free at the CLI level (see exodus/package.json — empty
 * `dependencies`). Fifteen lines of parsing is cheaper than dragging in a
 * package + lockfile churn.
 *
 * Why walk up instead of just cwd: operators run `npx exodus …` from
 * subdirectories of the workspace (e.g. `workspace/scratch/` or, in the
 * multi-brand layout, from inside a brand subfolder). We want the shared
 * `.env` to keep working from anywhere inside the tree.
 *
 * Stops walking at the first `.env` found, or after 8 levels, whichever
 * comes first (8 not 5: brand subfolders add depth below the install
 * root). Silent on every failure mode — missing file, parse errors,
 * permission errors all return without throwing. The CLI continues without
 * the .env values; downstream code surfaces "missing key" errors when it
 * actually needs them.
 */
export function loadWorkspaceEnv(startDir: string = process.cwd()): void {
  const envPath = findEnvFile(startDir, 8);
  if (!envPath) return;

  let contents: string;
  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || /[^A-Za-z0-9_]/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    // Strip a single matching pair of surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function findEnvFile(startDir: string, maxLevels: number): string | null {
  let dir = startDir;
  for (let i = 0; i <= maxLevels; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
