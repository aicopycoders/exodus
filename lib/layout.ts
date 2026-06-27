import fs from "node:fs";
import path from "node:path";

/**
 * Multi-brand parent-folder layout ("v2").
 *
 * v2 layout: ONE parent folder (customers usually call it "Exodus", but the
 * code never depends on the name) holds the shared install — .env, exodus/,
 * .claude/skills/, references/ — plus one subfolder per brand. Each brand
 * subfolder is identified by an explicit `.exodus-brand.json` marker file
 * (never by its folder name) and carries only brand-scoped content:
 *
 *   Exodus/
 *   ├── .env                      ← one account-level key
 *   ├── .exodus/state.json        ← { layoutVersion: 2, activeBrand?: slug }
 *   ├── exodus/  .claude/  references/   (shared)
 *   └── <brand>/
 *       ├── .exodus-brand.json    ← { slug, name }
 *       ├── state/brand-profile.md
 *       └── output/
 *
 * legacy layout: the original one-folder-per-brand install where state/ and
 * output/ live at the root. Supported indefinitely — nothing here ever
 * converts a legacy install (that's the opt-in `exodus migrate` command).
 *
 * Active-brand precedence (folder + pointer model):
 *   1. cwd inside a brand subfolder (marker found walking up) → that brand
 *   2. `.exodus/state.json` activeBrand pointer (set by `exodus brand use`)
 *   3. null → server falls back to the key's default brand
 */

export const BRAND_MARKER_FILE = ".exodus-brand.json";

/**
 * Directory names a brand subfolder may never claim — these are (or could
 * be) shared install dirs at the parent root. A colliding slug gets a
 * `<slug>-brand` folder; the marker file always carries the true slug.
 */
const RESERVED_DIR_NAMES = new Set([
  "exodus",
  "references",
  "output",
  "state",
  "docs",
  "workspace",
  "node_modules",
  ".claude",
  ".exodus",
  ".backup",
]);

export interface BrandDirInfo {
  slug: string;
  name: string;
  dir: string;
}

export type Layout = "v2" | "legacy";

export interface ActiveBrand {
  slug: string | null;
  source: "folder" | "pointer" | null;
}

/**
 * Locates the install root by searching upward for a `.env` file or an
 * `.exodus/` state dir. Brand subfolders contain neither, so running from
 * inside one walks through to the shared parent. 8 levels (vs the old 5)
 * because the brand subfolder adds depth below the root.
 *
 * Falls back to startDir when nothing is found, mirroring the old
 * findWorkspaceRoot() contract.
 */
export function findParentRoot(startDir: string = process.cwd()): string {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, ".env")) ||
      fs.existsSync(path.join(dir, ".exodus"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

interface StateFile {
  activeBrand?: string;
  layoutVersion?: number;
}

function readStateFile(root: string): StateFile {
  const p = path.join(root, ".exodus", "state.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as StateFile;
  } catch {
    return {};
  }
}

function readBrandMarker(dir: string): { slug: string; name: string } | null {
  const p = path.join(dir, BRAND_MARKER_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as {
      slug?: unknown;
      name?: unknown;
    };
    if (typeof parsed.slug !== "string" || !parsed.slug.trim()) return null;
    const slug = parsed.slug.trim();
    const name = typeof parsed.name === "string" && parsed.name.trim()
      ? parsed.name.trim()
      : slug;
    return { slug, name };
  } catch {
    return null;
  }
}

/**
 * Detects which layout the install root uses.
 *
 * v2 when `.exodus/state.json` says `layoutVersion: 2`, or (self-healing
 * fallback) when any direct child folder carries a brand marker. Everything
 * else — including a brand-new folder with nothing in it — is legacy, so
 * existing installs keep today's behavior byte-for-byte.
 */
export function detectLayout(root: string = findParentRoot()): Layout {
  if (readStateFile(root).layoutVersion === 2) return "v2";
  if (listBrandDirs(root).length > 0) return "v2";
  return "legacy";
}

/** Direct children of root that carry a parseable brand marker. */
export function listBrandDirs(root: string = findParentRoot()): BrandDirInfo[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: BrandDirInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const marker = readBrandMarker(dir);
    if (marker) out.push({ ...marker, dir });
  }
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

/** Folder name a brand slug maps to, avoiding reserved shared-dir names. */
export function brandDirNameForSlug(slug: string): string {
  return RESERVED_DIR_NAMES.has(slug) ? `${slug}-brand` : slug;
}

/**
 * Path of the brand's subfolder: an existing marker-matched dir wins (so a
 * customer renaming a brand folder doesn't orphan it); otherwise the
 * computed default path (which may not exist yet).
 */
export function brandDirFor(root: string, slug: string): string {
  const existing = listBrandDirs(root).find((b) => b.slug === slug);
  if (existing) return existing.dir;
  return path.join(root, brandDirNameForSlug(slug));
}

/**
 * Creates the brand subfolder (marker + state/ + output/) if missing.
 * Idempotent; refreshes the marker's display name when it changed.
 */
export function ensureBrandDir(
  root: string,
  brand: { slug: string; name?: string },
): { dir: string; created: boolean } {
  const dir = brandDirFor(root, brand.slug);
  const created = !fs.existsSync(path.join(dir, BRAND_MARKER_FILE));
  fs.mkdirSync(path.join(dir, "state"), { recursive: true });
  fs.mkdirSync(path.join(dir, "output"), { recursive: true });
  const marker = { slug: brand.slug, name: brand.name ?? brand.slug };
  const markerPath = path.join(dir, BRAND_MARKER_FILE);
  const existing = readBrandMarker(dir);
  if (!existing || existing.name !== marker.name || existing.slug !== marker.slug) {
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + "\n", "utf-8");
  }
  return { dir, created };
}

/**
 * Walks from cwd up to (and including) root looking for a brand marker —
 * "you're standing in a brand folder" detection.
 */
export function findBrandDirFromCwd(
  cwd: string = process.cwd(),
  root: string = findParentRoot(cwd),
): BrandDirInfo | null {
  let dir = cwd;
  for (let i = 0; i < 16; i++) {
    const marker = readBrandMarker(dir);
    if (marker) return { ...marker, dir };
    if (dir === root) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Resolves which brand a command targets: folder > pointer > key default.
 * In legacy layout there are no brand folders, so this reduces to the
 * pointer — exactly today's behavior.
 */
export function resolveActiveBrand(opts?: {
  cwd?: string;
  root?: string;
}): ActiveBrand {
  const cwd = opts?.cwd ?? process.cwd();
  const root = opts?.root ?? findParentRoot(cwd);

  const fromFolder = findBrandDirFromCwd(cwd, root);
  if (fromFolder) return { slug: fromFolder.slug, source: "folder" };

  const pointer = readStateFile(root).activeBrand;
  if (pointer) return { slug: pointer, source: "pointer" };

  return { slug: null, source: null };
}

/**
 * Where the active (or given) brand's `state/` lives.
 * v2 → `<root>/<brand-dir>/state`; legacy (or v2 with no resolvable brand)
 * → `<root>/state`, today's path.
 */
export function brandStateDir(opts?: {
  slug?: string;
  cwd?: string;
  root?: string;
}): string {
  const cwd = opts?.cwd ?? process.cwd();
  const root = opts?.root ?? findParentRoot(cwd);
  if (detectLayout(root) === "v2") {
    const slug = opts?.slug ?? resolveActiveBrand({ cwd, root }).slug;
    if (slug) return path.join(brandDirFor(root, slug), "state");
  }
  return path.join(root, "state");
}

/** Same resolution as brandStateDir, for the brand's `output/` folder. */
export function brandOutputDir(opts?: {
  slug?: string;
  cwd?: string;
  root?: string;
}): string {
  const cwd = opts?.cwd ?? process.cwd();
  const root = opts?.root ?? findParentRoot(cwd);
  if (detectLayout(root) === "v2") {
    const slug = opts?.slug ?? resolveActiveBrand({ cwd, root }).slug;
    if (slug) return path.join(brandDirFor(root, slug), "output");
  }
  return path.join(root, "output");
}
