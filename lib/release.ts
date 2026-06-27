// Shared release + install-integrity helpers used by `doctor`. Kept in lib/
// (base-owned, ships in the base overlay) so the install-completeness probe is
// a pure, unit-testable function.
import fs from "node:fs";
import path from "node:path";

/**
 * Compare two CalVer strings (YYYY.M.DDNN). Returns -1 / 0 / 1. Tolerant of a
 * leading `v` and of the legacy 4-segment shape (2026.4.24.3), which sorts older
 * than any 3-segment patch because position 2 (24) < (2404).
 *
 * Prerelease-aware per semver: `2026.6.1200-beta.1` sorts BELOW `2026.6.1200`,
 * so a beta tester's stable-channel update picks up the matching stable release
 * the moment it ships.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = v.replace(/^v/, "");
    const dash = clean.indexOf("-");
    const main = dash === -1 ? clean : clean.slice(0, dash);
    const pre = dash === -1 ? null : clean.slice(dash + 1);
    return { nums: main.split(".").map((x) => parseInt(x, 10) || 0), pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < len; i++) {
    const av = pa.nums[i] ?? 0;
    const bv = pb.nums[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  // Numeric parts equal: a version WITHOUT a prerelease suffix is newer.
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  // Both prereleases: compare suffix segments (beta.1 < beta.2 < beta.10).
  const sa = pa.pre.split(".");
  const sb = pb.pre.split(".");
  const slen = Math.max(sa.length, sb.length);
  for (let i = 0; i < slen; i++) {
    const x = sa[i];
    const y = sb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = parseInt(x, 10);
    const yn = parseInt(y, 10);
    const bothNumeric = !Number.isNaN(xn) && !Number.isNaN(yn);
    if (bothNumeric) {
      if (xn !== yn) return xn < yn ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

/** Read the installed version from `<exodusDir>/package.json` (0.0.0 if absent). */
export function readPackageVersion(exodusDir: string): string {
  try {
    return readJson<{ version?: string }>(path.join(exodusDir, "package.json")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// ── Install-integrity probe ────────────────────────────────────────────
// A release overlay declares the commands its tier owns in
// `<exodusDir>/.overlay-<tier>.json`. After an update the union of those owned
// command lists is exactly what should be present on disk — so a partial apply
// (missing command files) is detectable by structure, no hardcoded list needed.

/**
 * The commands this install is supposed to carry: the union of `ownedCommands`
 * across the base overlay manifest and (if the install is entitled) the custom
 * overlay manifest. Returns `[]` when no manifest is present (legacy/pre-tier-
 * split install) — callers treat an empty list as "nothing to assert."
 */
export function readOwnedCommands(exodusDir: string): string[] {
  const out = new Set<string>();
  for (const tier of ["base", "custom"]) {
    const p = path.join(exodusDir, `.overlay-${tier}.json`);
    if (!fs.existsSync(p)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(p, "utf8")) as { ownedCommands?: unknown };
      if (Array.isArray(m.ownedCommands)) {
        for (const c of m.ownedCommands) if (typeof c === "string") out.add(c);
      }
    } catch {
      /* malformed manifest — treat as absent */
    }
  }
  return [...out];
}

/**
 * Of the given owned commands, which have no compiled file at
 * `<exodusDir>/dist/commands/<cmd>.js`. An empty result means every expected
 * command is installed; a non-empty result is a partial/failed apply.
 */
export function missingInstalledCommands(exodusDir: string, ownedCommands: string[]): string[] {
  return ownedCommands.filter(
    (c) => !fs.existsSync(path.join(exodusDir, "dist", "commands", `${c}.js`))
  );
}
