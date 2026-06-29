import { apiGet, apiPost } from "./client.js";
import { formatError } from "./format.js";
function normalizeUrl(u) {
    return u.trim().replace(/\/+$/, "").toLowerCase();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function listAdLibrary() {
    const res = await apiGet("/api/v2/idea-bank?source=ad-library&limit=200");
    if (!res.ok)
        return [];
    return Array.isArray(res.data.ideas) ? res.data.ideas : [];
}
export async function captureSwipeAndWrite(urls, opts, rt = {}) {
    const wanted = urls.map((u) => u.trim()).filter(Boolean);
    if (wanted.length === 0)
        return { dispatched: [], bankedFailed: [] };
    const wantedNorm = new Map(wanted.map((u) => [normalizeUrl(u), u]));
    const before = new Set((await listAdLibrary()).map((r) => r.key).filter(Boolean));
    const ideate = await apiPost("/api/v2/idea-bank/ideate", { source: "ad-library", urls: wanted }, { ccCommand: rt.cc });
    if (!ideate.ok) {
        console.log(formatError(ideate));
        process.exit(1);
    }
    const TIMEOUT_MS = 5 * 60 * 1000;
    const INTERVAL_MS = 4_000;
    const start = Date.now();
    const found = new Map();
    process.stdout.write(`  scraping ${wanted.length} ad${wanted.length === 1 ? "" : "s"} into ideas`);
    while (found.size < wantedNorm.size && Date.now() - start < TIMEOUT_MS) {
        await sleep(INTERVAL_MS);
        process.stdout.write(".");
        for (const row of await listAdLibrary()) {
            if (!row.key || before.has(row.key) || found.has(normalizeUrl(row.sourceRef ?? "")))
                continue;
            const ref = row.sourceRef ? normalizeUrl(row.sourceRef) : "";
            if (ref && wantedNorm.has(ref))
                found.set(ref, row.key);
        }
    }
    process.stdout.write("\n");
    const bankedFailed = [...wantedNorm.entries()]
        .filter(([norm]) => !found.has(norm))
        .map(([, original]) => original);
    if (found.size === 0)
        return { dispatched: [], bankedFailed };
    const keys = [...found.values()];
    const steering = opts.steering?.trim();
    if (steering) {
        for (const key of keys) {
            const noted = await apiPost("/api/v2/idea-bank/notes", { key, notes: steering }, { ccCommand: rt.cc });
            if (!noted.ok)
                console.error(`  (couldn't attach steering to ${key}: ${formatError(noted)})`);
        }
    }
    const dispatch = await apiPost("/api/v2/idea-bank/dispatch", { keys, awarenessLevel: opts.awarenessLevel, variantCount: opts.variantCount, stopAtHooks: opts.stopAtHooks }, { ccCommand: rt.cc });
    if (!dispatch.ok) {
        console.log(formatError(dispatch));
        process.exit(1);
    }
    const keyToUrl = new Map([...found.entries()].map(([norm, key]) => [key, wantedNorm.get(norm)]));
    const dispatched = (dispatch.data.dispatched ?? []).map((d) => ({
        url: keyToUrl.get(d.key) ?? "",
        key: d.key,
        runId: d.runId,
    }));
    return { dispatched, bankedFailed };
}
