import fs from "node:fs";
import path from "node:path";
import { findParentRoot } from "./layout.js";

/**
 * Local CLI state. Holds the active brand slug (the "pointer" half of the
 * folder + pointer brand-routing model — see lib/layout.ts) so one account
 * key can target any brand the user owns via the X-Active-Brand header,
 * plus the layoutVersion marker that flags a multi-brand (v2) install.
 *
 * Lives in the same install folder as .env so it travels with the
 * customer install. Format: a tiny JSON file at `.exodus/state.json`
 * relative to wherever the .env was found (the same upward-search
 * client.ts does for .env).
 */

interface State {
  activeBrand?: string;
  layoutVersion?: number;
}

/**
 * Locates the install root. Kept as the legacy entry point — delegates to
 * layout.findParentRoot so every caller shares one definition.
 */
export function findWorkspaceRoot(): string {
  return findParentRoot();
}

function findStateDir(): string {
  return path.join(findWorkspaceRoot(), ".exodus");
}

function statePath(): string {
  return path.join(findStateDir(), "state.json");
}

function readState(): State {
  const p = statePath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as State;
  } catch {
    return {};
  }
}

function writeState(next: State): void {
  const dir = findStateDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(next, null, 2) + "\n", "utf-8");
}

export function getActiveBrand(): string | null {
  return readState().activeBrand ?? null;
}

export function setActiveBrand(slug: string): void {
  const s = readState();
  s.activeBrand = slug;
  writeState(s);
}

export function clearActiveBrand(): void {
  const s = readState();
  delete s.activeBrand;
  writeState(s);
}

export function getLayoutVersion(): number | null {
  return readState().layoutVersion ?? null;
}

export function setLayoutVersion(version: number): void {
  const s = readState();
  s.layoutVersion = version;
  writeState(s);
}
