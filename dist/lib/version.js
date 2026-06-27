import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, parse } from "node:path";
export function getVersion() {
    let dir = dirname(fileURLToPath(import.meta.url));
    const { root } = parse(dir);
    for (;;) {
        try {
            const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
            if (typeof pkg.version === "string")
                return pkg.version;
        }
        catch {
        }
        if (dir === root)
            return "unknown";
        dir = dirname(dir);
    }
}
