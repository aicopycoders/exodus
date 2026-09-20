export const COPY_FACE_MODULE_KEY = "copy-face";
export function runDisplayName(run) {
    return run.title || run.runTitle || run.workflowName || "";
}
export function runTypeWord(run) {
    return run.moduleKey === COPY_FACE_MODULE_KEY ? "Copy run" : "Workflow";
}
export function runHeadingWord(run) {
    return run.moduleKey === COPY_FACE_MODULE_KEY ? "Copy run" : "Workflow run";
}
