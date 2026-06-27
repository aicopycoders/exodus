import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, parse } from "node:path";

// package.json is not copied into dist/, so its depth relative to this module
// differs between source (lib/) and build (dist/lib/) — and again under an
// npx-cached install. Walk up to the nearest package.json instead of assuming
// a fixed "../package.json".
export function getVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  const { root } = parse(dir);
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (typeof pkg.version === "string") return pkg.version;
    } catch {
      // no package.json here (or unreadable) — keep walking up
    }
    if (dir === root) return "unknown";
    dir = dirname(dir);
  }
}
