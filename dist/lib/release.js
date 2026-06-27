import fs from "node:fs";
import path from "node:path";
export function compareVersions(a, b) {
    const parse = (v) => {
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
        if (av !== bv)
            return av < bv ? -1 : 1;
    }
    if (pa.pre === null && pb.pre === null)
        return 0;
    if (pa.pre === null)
        return 1;
    if (pb.pre === null)
        return -1;
    const sa = pa.pre.split(".");
    const sb = pb.pre.split(".");
    const slen = Math.max(sa.length, sb.length);
    for (let i = 0; i < slen; i++) {
        const x = sa[i];
        const y = sb[i];
        if (x === undefined)
            return -1;
        if (y === undefined)
            return 1;
        const xn = parseInt(x, 10);
        const yn = parseInt(y, 10);
        const bothNumeric = !Number.isNaN(xn) && !Number.isNaN(yn);
        if (bothNumeric) {
            if (xn !== yn)
                return xn < yn ? -1 : 1;
        }
        else if (x !== y) {
            return x < y ? -1 : 1;
        }
    }
    return 0;
}
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}
export function readPackageVersion(exodusDir) {
    try {
        return readJson(path.join(exodusDir, "package.json")).version ?? "0.0.0";
    }
    catch {
        return "0.0.0";
    }
}
export function readOwnedCommands(exodusDir) {
    const out = new Set();
    for (const tier of ["base", "custom"]) {
        const p = path.join(exodusDir, `.overlay-${tier}.json`);
        if (!fs.existsSync(p))
            continue;
        try {
            const m = JSON.parse(fs.readFileSync(p, "utf8"));
            if (Array.isArray(m.ownedCommands)) {
                for (const c of m.ownedCommands)
                    if (typeof c === "string")
                        out.add(c);
            }
        }
        catch {
        }
    }
    return [...out];
}
export function missingInstalledCommands(exodusDir, ownedCommands) {
    return ownedCommands.filter((c) => !fs.existsSync(path.join(exodusDir, "dist", "commands", `${c}.js`)));
}
