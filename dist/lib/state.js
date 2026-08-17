import fs from "node:fs";
import path from "node:path";
import { findParentRoot } from "./layout.js";
export function findWorkspaceRoot() {
    return findParentRoot();
}
function findStateDir(root) {
    return path.join(root ?? findWorkspaceRoot(), ".exodus");
}
function statePath(root) {
    return path.join(findStateDir(root), "state.json");
}
function readState(root) {
    const p = statePath(root);
    if (!fs.existsSync(p))
        return {};
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    catch {
        return {};
    }
}
function writeState(next, root) {
    const dir = findStateDir(root);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(statePath(root), JSON.stringify(next, null, 2) + "\n", "utf-8");
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
export function getScaffoldVersion(root) {
    return readState(root).scaffoldVersion ?? null;
}
export function setScaffoldVersion(version, root) {
    const s = readState(root);
    s.scaffoldVersion = version;
    writeState(s, root);
}
