import { apiGet } from "./client.js";
const DEFAULT_TERMINAL_STATUSES = ["completed", "failed"];
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function pollUntilDone(opts) {
    const { path, intervalMs = 3000, timeoutMs = 600_000, terminalStatuses, onProgress, isDone, } = opts;
    const terminal = new Set([...DEFAULT_TERMINAL_STATUSES, ...(terminalStatuses ?? [])]);
    const deadline = Date.now() + timeoutMs;
    while (true) {
        const res = await apiGet(path);
        if (onProgress) {
            onProgress(res.data);
        }
        const status = typeof res.data["status"] === "string" ? res.data["status"] : undefined;
        if (!res.ok) {
            return { ok: false, data: res.data, timedOut: false };
        }
        if (status === "failed") {
            return { ok: false, data: res.data, timedOut: false };
        }
        const statusTerminal = status ? terminal.has(status) : false;
        const customDone = isDone ? isDone(res.data) : true;
        if (statusTerminal && customDone) {
            return { ok: true, data: res.data, timedOut: false };
        }
        if (Date.now() + intervalMs > deadline) {
            return { ok: false, data: res.data, timedOut: true };
        }
        await delay(intervalMs);
    }
}
