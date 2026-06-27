import fs from "node:fs";
import path from "node:path";
export const BRAND_MARKER_FILE = ".exodus-brand.json";
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
export function findParentRoot(startDir = process.cwd()) {
    let dir = startDir;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, ".env")) ||
            fs.existsSync(path.join(dir, ".exodus"))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return startDir;
}
function readStateFile(root) {
    const p = path.join(root, ".exodus", "state.json");
    if (!fs.existsSync(p))
        return {};
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    catch {
        return {};
    }
}
function readBrandMarker(dir) {
    const p = path.join(dir, BRAND_MARKER_FILE);
    if (!fs.existsSync(p))
        return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (typeof parsed.slug !== "string" || !parsed.slug.trim())
            return null;
        const slug = parsed.slug.trim();
        const name = typeof parsed.name === "string" && parsed.name.trim()
            ? parsed.name.trim()
            : slug;
        return { slug, name };
    }
    catch {
        return null;
    }
}
export function detectLayout(root = findParentRoot()) {
    if (readStateFile(root).layoutVersion === 2)
        return "v2";
    if (listBrandDirs(root).length > 0)
        return "v2";
    return "legacy";
}
export function listBrandDirs(root = findParentRoot()) {
    let entries;
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const out = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const dir = path.join(root, entry.name);
        const marker = readBrandMarker(dir);
        if (marker)
            out.push({ ...marker, dir });
    }
    out.sort((a, b) => a.slug.localeCompare(b.slug));
    return out;
}
export function brandDirNameForSlug(slug) {
    return RESERVED_DIR_NAMES.has(slug) ? `${slug}-brand` : slug;
}
export function brandDirFor(root, slug) {
    const existing = listBrandDirs(root).find((b) => b.slug === slug);
    if (existing)
        return existing.dir;
    return path.join(root, brandDirNameForSlug(slug));
}
export function ensureBrandDir(root, brand) {
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
export function findBrandDirFromCwd(cwd = process.cwd(), root = findParentRoot(cwd)) {
    let dir = cwd;
    for (let i = 0; i < 16; i++) {
        const marker = readBrandMarker(dir);
        if (marker)
            return { ...marker, dir };
        if (dir === root)
            break;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}
export function resolveActiveBrand(opts) {
    const cwd = opts?.cwd ?? process.cwd();
    const root = opts?.root ?? findParentRoot(cwd);
    const fromFolder = findBrandDirFromCwd(cwd, root);
    if (fromFolder)
        return { slug: fromFolder.slug, source: "folder" };
    const pointer = readStateFile(root).activeBrand;
    if (pointer)
        return { slug: pointer, source: "pointer" };
    return { slug: null, source: null };
}
export function brandStateDir(opts) {
    const cwd = opts?.cwd ?? process.cwd();
    const root = opts?.root ?? findParentRoot(cwd);
    if (detectLayout(root) === "v2") {
        const slug = opts?.slug ?? resolveActiveBrand({ cwd, root }).slug;
        if (slug)
            return path.join(brandDirFor(root, slug), "state");
    }
    return path.join(root, "state");
}
export function brandOutputDir(opts) {
    const cwd = opts?.cwd ?? process.cwd();
    const root = opts?.root ?? findParentRoot(cwd);
    if (detectLayout(root) === "v2") {
        const slug = opts?.slug ?? resolveActiveBrand({ cwd, root }).slug;
        if (slug)
            return path.join(brandDirFor(root, slug), "output");
    }
    return path.join(root, "output");
}
