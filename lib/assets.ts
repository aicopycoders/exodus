import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The bundled assets/ dir ships at the package root (next to dist/). Source
// (lib/) and build (dist/lib/) sit at different depths, and an npx-cached
// install adds more — so walk up to the nearest dir that contains assets/,
// mirroring lib/version.ts's package.json walk. `override` is the search start
// (used by tests pointing at a temp tree).
export function assetsRoot(override?: string): string {
  let dir = override ?? path.dirname(fileURLToPath(import.meta.url));
  const { root } = path.parse(dir);
  for (;;) {
    const candidate = path.join(dir, "assets");
    if (fs.existsSync(candidate)) return candidate;
    if (dir === root) {
      throw new Error(
        `bundled assets not found (searched up from ${override ?? "module dir"}). ` +
          `Run \`npm run bundle-assets\` in dev, or reinstall the package.`,
      );
    }
    dir = path.dirname(dir);
  }
}

export function skillsDir(override?: string): string {
  return path.join(assetsRoot(override), "skills");
}

export function referencesDir(override?: string): string {
  return path.join(assetsRoot(override), "references");
}

export function docsDir(override?: string): string {
  return path.join(assetsRoot(override), "docs");
}
