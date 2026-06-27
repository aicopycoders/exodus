import fs from "node:fs";
import path from "node:path";
import { findParentRoot } from "./layout.js";
export function findWorkspaceRoot() {
    return findParentRoot();
}
function findStateDir() {
    return path.join(findWorkspaceRoot(), ".exodus");
}
function statePath() {
    return path.join(findStateDir(), "state.json");
}
function readState() {
    const p = statePath();
    if (!fs.existsSync(p))
        return {};
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    catch {
        return {};
    }
}
function writeState(next) {
    const dir = findStateDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(next, null, 2) + "\n", "utf-8");
}
export function getActiveBrand() {
    return readState().activeBrand ?? null;
}
export function setActiveBrand(slug) {
    const s = readState();
    s.activeBrand = slug;
    writeState(s);
}
export function clearActiveBrand() {
    const s = readState();
    delete s.activeBrand;
    writeState(s);
}
export function getLayoutVersion() {
    return readState().layoutVersion ?? null;
}
export function setLayoutVersion(version) {
    const s = readState();
    s.layoutVersion = version;
    writeState(s);
}
