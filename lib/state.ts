import fs from "node:fs";
import path from "node:path";
import { findParentRoot } from "./layout.js";

/**
 * Local CLI state. Holds the active brand slug (the "pointer" half of the
 * folder + pointer brand-routing model — see lib/layout.ts) so one account
 * key can target any brand the user owns via the X-Active-Brand header,
 * plus the layoutVersion marker that flags a multi-brand (v2) install
 * and the scaffoldVersion stamp that records which CLI last wrote the
 * scaffold.
 *
 * Lives in the same install folder as .env so it travels with the
 * customer install. Format: a tiny JSON file at `.exodus/state.json`
 * relative to wherever the .env was found (the same upward-search
 * client.ts does for .env).
 */

interface State {
  activeBrand?: string;
  layoutVersion?: number;
  /**
   * CLI version that last wrote `.claude/skills/` + the workspace docs
   * (issue #588). Doctor compares it to the running package version to catch
   * a workspace whose skills predate the installed CLI — a stale scaffold is
   * invisible otherwise, so a newly-bundled skill never shows up and every
   * doctor check still reports green. Written by scaffoldInit, never by hand.
   */
  scaffoldVersion?: string;
}

/**
 * Locates the install root. Kept as the legacy entry point — delegates to
 * layout.findParentRoot so every caller shares one definition.
 */
export function findWorkspaceRoot(): string {
  return findParentRoot();
}

// `root` is optional everywhere below: the interactive commands search upward
// for the install root, but scaffoldInit (and `init --root <dir>`) target an
// explicit folder that is NOT the cwd's parent chain — so those callers pass
// the root they are writing.
function findStateDir(root?: string): string {
  return path.join(root ?? findWorkspaceRoot(), ".exodus");
}

function statePath(root?: string): string {
  return path.join(findStateDir(root), "state.json");
}

function readState(root?: string): State {
  const p = statePath(root);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as State;
  } catch {
    return {};
  }
}

function writeState(next: State, root?: string): void {
  const dir = findStateDir(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(root), JSON.stringify(next, null, 2) + "\n", "utf-8");
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

export function getScaffoldVersion(root?: string): string | null {
  return readState(root).scaffoldVersion ?? null;
}

export function setScaffoldVersion(version: string, root?: string): void {
  // Read-modify-write, not an overwrite: an existing install already carries
  // activeBrand/layoutVersion here and a re-init must not drop them.
  const s = readState(root);
  s.scaffoldVersion = version;
  writeState(s, root);
}
