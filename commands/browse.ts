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

interface Generation {
  _id?: string;
  id?: string;
  createdAt?: string | number;
  _creationTime?: number;
  agentName?: string;
  agent?: string;
  pipeline?: string;
  status?: string;
  googleDocUrl?: string;
  docUrl?: string;
}

interface GenesisRun {
  _id?: string;
  id?: string;
  createdAt?: string | number;
  _creationTime?: number;
  inputMethod?: string;
  awarenessLevel?: string;
  status?: string;
  googleDocUrl?: string;
  docUrl?: string;
}

interface PipelineRun {
  id?: string;
  _id?: string;
  _creationTime?: number;
  status?: string;
  accountId?: string;
  adAccountId?: string;
  mode?: string;
  runDate?: string | number;
  phase1DocUrl?: string;
  phase2DocUrl?: string;
  userPhase1DocUrl?: string;
  userPhase2DocUrl?: string;
  sheetUrl?: string;
  /** scout/scoutclone parent rows tag themselves so we can label each one
   *  correctly. Without this, both pipelines would render as "scout". */
  pipelineSlug?: string;
  /** creativeSuiteRuns rows carry their engine (native / copy-derived /
   *  ref-match / meme / …) — used to label meme runs distinctly so
   *  `--agent meme` filters work against the shared creative endpoint. */
  engine?: string;
  /** Most recent completed child idea's Doc URL — attached by
   *  convex/scout.listRunsInternal so browse doesn't N+1. */
  latestDocUrl?: string | null;
}

export function computeFetchLimit(userLimit: number, pipeline: string | undefined): number {
  if (!pipeline) return userLimit;
  const overfetch = Math.min(userLimit * 10, 100);
  return Math.max(userLimit, overfetch);
}

export function matchesPipeline(item: Record<string, unknown>, pipeline: string): boolean {
  const needle = pipeline.toLowerCase();
  const fields = ["pipeline", "agentName", "agent", "agentId"];
  for (const f of fields) {
    const v = item[f];
    if (typeof v !== "string") continue;
    const value = v.toLowerCase();
    // Exact match, or qualified-variant prefix (e.g. "genesis:awarenessLevel"
    // for needle "genesis"). Naive substring match would incorrectly match
    // "scoutclone" rows when the user filtered by "scout".
    if (value === needle || value.startsWith(`${needle}:`) || value.startsWith(`${needle}-`)) {
      return true;
    }
  }
  return false;
}

function normalizeCreatedAt(item: Record<string, unknown>): number {
  const raw = item["createdAt"] ?? item["_creationTime"];
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return new Date(raw).getTime();
  return 0;
}

// Pipelines whose runs don't live in the `generations` table. Browse must fetch
// these from their own list endpoints so `--agent creative` (etc.) returns rows.
// creative / template are the new-pipeline read endpoints (Max R3 #7);
// "creative" covers every creative-suite engine, including meme renders, since
// they share creativeSuiteRuns.
const EXTRA_PIPELINES = ["creative", "template"] as const;
type ExtraPipeline = (typeof EXTRA_PIPELINES)[number];

export function shouldFetchExtra(filter: string | undefined, pipeline: ExtraPipeline): boolean {
  if (!filter) return true;
  const needle = filter.toLowerCase();
  // creative endpoint also surfaces meme rows (shared creativeSuiteRuns).
  if (pipeline === "creative") return needle === "creative" || needle === "meme";
  return needle === pipeline;
}

export function resolvePipelineFilter(
  flags: Record<string, string | boolean>
): string | undefined {
  return (
    (flags["agent"] as string | undefined) ??
    (flags["pipeline"] as string | undefined)
  );
}

async function fetchExtraRuns(
  pipeline: ExtraPipeline,
  fetchLimit: number
): Promise<Record<string, unknown>[]> {
  const res = await apiGet<{ runs?: PipelineRun[] }>(`/api/v2/${pipeline}?limit=${fetchLimit}`);
  if (!res.ok) return [];
  const runs = res.data.runs ?? [];
  return runs.map((r) => {
    const doc =
      r.latestDocUrl ??
      r.phase2DocUrl ??
      r.userPhase2DocUrl ??
      r.phase1DocUrl ??
      r.userPhase1DocUrl ??
      r.sheetUrl ??
      undefined;
    // The creative endpoint's rows span every creative-suite engine:
    // meme runs label themselves "meme" so `--agent meme` works.
    const label =
      pipeline === "creative" && r.engine === "meme"
        ? "meme"
        : pipeline;
    return {
      ...r,
      _id: r.id ?? r._id,
      agentId: label,
      pipeline: label,
      ...(doc ? { googleDocUrl: doc } : {}),
    } as Record<string, unknown>;
  });
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  const limit = parseInt((flags["limit"] as string | undefined) ?? "20", 10);
  // Help text documents --agent; accept --pipeline as a hidden back-compat alias.
  const pipeline = resolvePipelineFilter(flags);
  const fetchLimit = computeFetchLimit(limit, pipeline);

  // Fetch modular generations
  const genRes = await apiGet<unknown>(`/api/v2/generations?limit=${fetchLimit}`);
  if (!genRes.ok) {
    console.log(formatError(genRes));
    process.exit(1);
  }

  // Handle both array and { generations: [...] } format
  let generations: Generation[] = [];
  if (Array.isArray(genRes.data)) {
    generations = genRes.data as Generation[];
  } else if (
    genRes.data &&
    typeof genRes.data === "object" &&
    Array.isArray((genRes.data as Record<string, unknown>)["generations"])
  ) {
    generations = (genRes.data as Record<string, unknown>)["generations"] as Generation[];
  }

  // Fetch genesis runs
  const genesisRes = await apiGet<{ runs?: GenesisRun[] }>(`/api/v2/genesis?limit=${fetchLimit}`);
  if (!genesisRes.ok) {
    console.log(formatError(genesisRes));
    process.exit(1);
  }
  const genesisRuns: GenesisRun[] = genesisRes.data.runs ?? [];

  // Normalize genesis runs to generation-like shape for formatBrowse
  const normalizedGenesis = genesisRuns.map((r) => ({
    ...r,
    agentName: r.inputMethod ? `genesis:${r.inputMethod}` : "genesis",
    pipeline: "genesis",
  }));

  // Fetch pipelines that don't live in the generations table. Skip any pipeline
  // the caller explicitly filtered away so we don't pay for calls we'll drop.
  const extraFetches = await Promise.all(
    EXTRA_PIPELINES.map((p) =>
      shouldFetchExtra(pipeline, p) ? fetchExtraRuns(p, fetchLimit) : Promise.resolve([])
    )
  );

  // Merge and sort by creation time descending
  const all: Record<string, unknown>[] = [
    ...generations.map((g) => g as Record<string, unknown>),
    ...normalizedGenesis.map((g) => g as Record<string, unknown>),
    ...extraFetches.flat(),
  ];

  all.sort((a, b) => normalizeCreatedAt(b) - normalizeCreatedAt(a));

  // Filter out stuck runs (running/pending for over 30 min) unless --all
  const showAll = flags["all"] === true;
  const STUCK_THRESHOLD_MS = 30 * 60 * 1000;
  const now = Date.now();
  const notStuck = showAll
    ? all
    : all.filter((g) => {
        const status = g["status"] as string | undefined;
        if (status !== "running" && status !== "pending") return true;
        const created = normalizeCreatedAt(g);
        return created > 0 && now - created < STUCK_THRESHOLD_MS;
      });

  // Filter by pipeline if specified
  const filtered = pipeline
    ? notStuck.filter((g) => matchesPipeline(g, pipeline))
    : notStuck;

  // Cap at user-requested limit after over-fetching for the pipeline filter.
  const capped = filtered.slice(0, limit);
  console.log(formatBrowse(capped));
}
