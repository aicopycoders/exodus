import { apiGet } from "../lib/client.js";
import { formatBrowse, formatError } from "../lib/format.js";
export const helpText = `
exodus browse — List recent pipeline runs (hooks, ads, image concepts, etc.)

Usage:
  exodus browse [options]

Options:
  --limit <n>            Max runs to list (default 20)
  --agent <name>         Filter by agent: genesis | creative | template | meme
`.trim();
export function computeFetchLimit(userLimit, pipeline) {
    if (!pipeline)
        return userLimit;
    const overfetch = Math.min(userLimit * 10, 100);
    return Math.max(userLimit, overfetch);
}
export function matchesPipeline(item, pipeline) {
    const needle = pipeline.toLowerCase();
    const fields = ["pipeline", "agentName", "agent", "agentId"];
    for (const f of fields) {
        const v = item[f];
        if (typeof v !== "string")
            continue;
        const value = v.toLowerCase();
        if (value === needle || value.startsWith(`${needle}:`) || value.startsWith(`${needle}-`)) {
            return true;
        }
    }
    return false;
}
function normalizeCreatedAt(item) {
    const raw = item["createdAt"] ?? item["_creationTime"];
    if (typeof raw === "number")
        return raw;
    if (typeof raw === "string")
        return new Date(raw).getTime();
    return 0;
}
const EXTRA_PIPELINES = ["creative", "template"];
export function shouldFetchExtra(filter, pipeline) {
    if (!filter)
        return true;
    const needle = filter.toLowerCase();
    if (pipeline === "creative")
        return needle === "creative" || needle === "meme";
    return needle === pipeline;
}
export function resolvePipelineFilter(flags) {
    return (flags["agent"] ??
        flags["pipeline"]);
}
async function fetchExtraRuns(pipeline, fetchLimit) {
    const res = await apiGet(`/api/v2/${pipeline}?limit=${fetchLimit}`);
    if (!res.ok)
        return [];
    const runs = res.data.runs ?? [];
    return runs.map((r) => {
        const doc = r.latestDocUrl ??
            r.phase2DocUrl ??
            r.userPhase2DocUrl ??
            r.phase1DocUrl ??
            r.userPhase1DocUrl ??
            r.sheetUrl ??
            undefined;
        const label = pipeline === "creative" && r.engine === "meme"
            ? "meme"
            : pipeline;
        return {
            ...r,
            _id: r.id ?? r._id,
            agentId: label,
            pipeline: label,
            ...(doc ? { googleDocUrl: doc } : {}),
        };
    });
}
export async function run(flags) {
    const limit = parseInt(flags["limit"] ?? "20", 10);
    const pipeline = resolvePipelineFilter(flags);
    const fetchLimit = computeFetchLimit(limit, pipeline);
    const genRes = await apiGet(`/api/v2/generations?limit=${fetchLimit}`);
    if (!genRes.ok) {
        console.log(formatError(genRes));
        process.exit(1);
    }
    let generations = [];
    if (Array.isArray(genRes.data)) {
        generations = genRes.data;
    }
    else if (genRes.data &&
        typeof genRes.data === "object" &&
        Array.isArray(genRes.data["generations"])) {
        generations = genRes.data["generations"];
    }
    const genesisRes = await apiGet(`/api/v2/genesis?limit=${fetchLimit}`);
    if (!genesisRes.ok) {
        console.log(formatError(genesisRes));
        process.exit(1);
    }
    const genesisRuns = genesisRes.data.runs ?? [];
    const normalizedGenesis = genesisRuns.map((r) => ({
        ...r,
        agentName: r.inputMethod ? `genesis:${r.inputMethod}` : "genesis",
        pipeline: "genesis",
    }));
    const extraFetches = await Promise.all(EXTRA_PIPELINES.map((p) => shouldFetchExtra(pipeline, p) ? fetchExtraRuns(p, fetchLimit) : Promise.resolve([])));
    const all = [
        ...generations.map((g) => g),
        ...normalizedGenesis.map((g) => g),
        ...extraFetches.flat(),
    ];
    all.sort((a, b) => normalizeCreatedAt(b) - normalizeCreatedAt(a));
    const showAll = flags["all"] === true;
    const STUCK_THRESHOLD_MS = 30 * 60 * 1000;
    const now = Date.now();
    const notStuck = showAll
        ? all
        : all.filter((g) => {
            const status = g["status"];
            if (status !== "running" && status !== "pending")
                return true;
            const created = normalizeCreatedAt(g);
            return created > 0 && now - created < STUCK_THRESHOLD_MS;
        });
    const filtered = pipeline
        ? notStuck.filter((g) => matchesPipeline(g, pipeline))
        : notStuck;
    const capped = filtered.slice(0, limit);
    console.log(formatBrowse(capped));
}
