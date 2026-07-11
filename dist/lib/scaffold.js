import fs from "node:fs";
import path from "node:path";
import { skillsDir, referencesDir, docsDir } from "./assets.js";
import { getChannel, stampChannel } from "./channel.js";
export const ENV_SCAFFOLD = `# Exodus config — paste your dashboard .env block below this line.
# Get it from your Exodus dashboard -> Settings -> Claude Code -> "Copy .env block".
# ONE key covers every brand you own; switch brands with brand subfolders or
# \`npx @aicopycoders/exodus brand use <slug>\`, never by editing this file.
`;
export function writeEnvScaffold(root, channel = getChannel()) {
    const envPath = path.join(root, ".env");
    if (fs.existsSync(envPath))
        return { created: false };
    fs.writeFileSync(envPath, stampChannel(ENV_SCAFFOLD, channel));
    return { created: true };
}
function stampTree(dir, channel) {
    if (channel !== "beta")
        return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            stampTree(p, channel);
            continue;
        }
        if (!entry.isFile())
            continue;
        const raw = fs.readFileSync(p, "utf8");
        const stamped = stampChannel(raw, channel);
        if (stamped !== raw)
            fs.writeFileSync(p, stamped);
    }
}
export function ensureGitignore(root) {
    const giPath = path.join(root, ".gitignore");
    const lines = fs.existsSync(giPath)
        ? fs.readFileSync(giPath, "utf8").split("\n")
        : ["node_modules/", "output/*", "!output/.gitkeep"];
    if (!lines.some((l) => l.trim() === ".env"))
        lines.push(".env");
    fs.writeFileSync(giPath, lines.join("\n").replace(/\n+$/, "") + "\n");
}
export function writeSkills(root, srcOverride, channel = getChannel()) {
    const src = skillsDir(srcOverride);
    const dest = path.join(root, ".claude", "skills");
    fs.mkdirSync(dest, { recursive: true });
    const names = [];
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const target = path.join(dest, entry.name);
        fs.rmSync(target, { recursive: true, force: true });
        fs.cpSync(path.join(src, entry.name), target, { recursive: true });
        stampTree(target, channel);
        names.push(entry.name);
    }
    return names;
}
export function writeReferences(root, srcOverride, channel = getChannel()) {
    let src;
    try {
        src = referencesDir(srcOverride);
    }
    catch {
        return;
    }
    if (!fs.existsSync(src))
        return;
    const dest = path.join(root, "references");
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    stampTree(dest, channel);
}
export function writeDocs(root, srcOverride, channel = getChannel()) {
    let src;
    try {
        src = docsDir(srcOverride);
    }
    catch {
        return [];
    }
    if (!fs.existsSync(src))
        return [];
    const names = [];
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md"))
            continue;
        const content = fs.readFileSync(path.join(src, entry.name), "utf8");
        fs.writeFileSync(path.join(root, entry.name), stampChannel(content, channel));
        names.push(entry.name);
    }
    return names.sort();
}
export function ensureBaseDirs(root) {
    const out = path.join(root, "output");
    fs.mkdirSync(out, { recursive: true });
    const keep = path.join(out, ".gitkeep");
    if (!fs.existsSync(keep))
        fs.writeFileSync(keep, "");
    fs.mkdirSync(path.join(root, "state"), { recursive: true });
    const exodusDir = path.join(root, ".exodus");
    fs.mkdirSync(exodusDir, { recursive: true });
    const statePath = path.join(exodusDir, "state.json");
    if (!fs.existsSync(statePath)) {
        fs.writeFileSync(statePath, JSON.stringify({ layoutVersion: 2 }, null, 2) + "\n");
    }
}
