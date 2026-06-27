import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function assetsRoot(override) {
    let dir = override ?? path.dirname(fileURLToPath(import.meta.url));
    const { root } = path.parse(dir);
    for (;;) {
        const candidate = path.join(dir, "assets");
        if (fs.existsSync(candidate))
            return candidate;
        if (dir === root) {
            throw new Error(`bundled assets not found (searched up from ${override ?? "module dir"}). ` +
                `Run \`npm run bundle-assets\` in dev, or reinstall the package.`);
        }
        dir = path.dirname(dir);
    }
}
export function skillsDir(override) {
    return path.join(assetsRoot(override), "skills");
}
export function referencesDir(override) {
    return path.join(assetsRoot(override), "references");
}
