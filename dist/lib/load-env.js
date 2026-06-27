import fs from "node:fs";
import path from "node:path";
export function loadWorkspaceEnv(startDir = process.cwd()) {
    const envPath = findEnvFile(startDir, 8);
    if (!envPath)
        return;
    let contents;
    try {
        contents = fs.readFileSync(envPath, "utf8");
    }
    catch {
        return;
    }
    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#"))
            continue;
        const eq = line.indexOf("=");
        if (eq <= 0)
            continue;
        const key = line.slice(0, eq).trim();
        if (!key || /[^A-Za-z0-9_]/.test(key))
            continue;
        if (process.env[key] !== undefined)
            continue;
        let value = line.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}
function findEnvFile(startDir, maxLevels) {
    let dir = startDir;
    for (let i = 0; i <= maxLevels; i++) {
        const candidate = path.join(dir, ".env");
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}
