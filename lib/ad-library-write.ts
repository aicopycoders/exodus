import { apiGet, apiPost } from "./client.js";
import { formatError } from "./format.js";

// Basic swipe — Facebook Ad Library URL → Idea Bank → Genesis. The single
// source-of-truth flow for writing ads from a pasted competitor ad. It reuses
// the SAME path the reel/organic capture uses — bank an idea (scrape → extract),
// then dispatch it brief-mode to the Genesis writer — so a swiped ad is just
// another Genesis input.
//
//   1. POST /api/v2/idea-bank/ideate  {source:"ad-library", urls}   (scrape+extract+bank)
//   2. poll  GET  /api/v2/idea-bank?source=ad-library               (until the new ideas land)
//   3. POST /api/v2/idea-bank/dispatch {keys, awarenessLevel, variantCount}  (brief-mode write)
//
// Capture is async on Trigger, so step 2 polls until the freshly-banked idea
// (matched by its `sourceRef` = the ad URL) appears, then writes from it.

/** A row from GET /api/v2/idea-bank (the list query returns sourceRef + status). */
interface AdLibraryIdeaRow {
  key?: string;
  source?: string;
  sourceRef?: string | null;
  status?: string;
}

export interface SwipeWriteResult {
  /** Ads that produced a banked idea AND a dispatched Genesis run. */
  dispatched: Array<{ url: string; key: string; runId: string }>;
  /** Ads that never produced an idea (inactive / image-only / not indexed / timed out). */
  bankedFailed: string[];
}

/** Normalize a URL for matching a banked idea's sourceRef back to its input ad. */
function normalizeUrl(u: string): string {
  return u.trim().replace(/\/+$/, "").toLowerCase();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function listAdLibrary(): Promise<AdLibraryIdeaRow[]> {
  const res = await apiGet<{ ideas?: AdLibraryIdeaRow[]; error?: string }>(
    "/api/v2/idea-bank?source=ad-library&limit=200",
  );
  if (!res.ok) return [];
  return Array.isArray(res.data.ideas) ? res.data.ideas : [];
}

/**
 * Capture Facebook Ad Library URL(s) as Idea Bank ideas and write each through
 * the Genesis writer (brief-mode). Prints capture progress; returns the
 * dispatched runs + the ads that failed to capture. Throws (via formatError +
 * non-zero exit by the caller) only on the ideate/dispatch HTTP calls themselves.
 */
export async function captureSwipeAndWrite(
  urls: string[],
  opts: { awarenessLevel: string; variantCount?: number; steering?: string; stopAtHooks?: boolean },
  rt: { cc?: string } = {},
): Promise<SwipeWriteResult> {
  const wanted = urls.map((u) => u.trim()).filter(Boolean);
  if (wanted.length === 0) return { dispatched: [], bankedFailed: [] };
  const wantedNorm = new Map(wanted.map((u) => [normalizeUrl(u), u]));

  // Snapshot existing ad-library keys so we only claim ideas this run created —
  // an ad banked in a prior run must not be re-dispatched here.
  const before = new Set((await listAdLibrary()).map((r) => r.key).filter(Boolean) as string[]);

  // 1. Capture (scrape → transcribe → extract → bank). Fire-and-forget on Trigger.
  const ideate = await apiPost<{ batchId?: string; error?: string }>(
    "/api/v2/idea-bank/ideate",
    { source: "ad-library", urls: wanted },
    { ccCommand: rt.cc },
  );
  if (!ideate.ok) {
    console.log(formatError(ideate));
    process.exit(1);
  }

  // 2. Poll until each ad's banked idea (matched by sourceRef) appears, or we
  //    time out. Extraction is a per-URL scrape + (optional) transcription + LLM
  //    call, so allow a generous window.
  const TIMEOUT_MS = 5 * 60 * 1000;
  const INTERVAL_MS = 4_000;
  const start = Date.now();
  const found = new Map<string, string>(); // normalized url -> key
  process.stdout.write(`  scraping ${wanted.length} ad${wanted.length === 1 ? "" : "s"} into ideas`);
  while (found.size < wantedNorm.size && Date.now() - start < TIMEOUT_MS) {
    await sleep(INTERVAL_MS);
    process.stdout.write(".");
    for (const row of await listAdLibrary()) {
      if (!row.key || before.has(row.key) || found.has(normalizeUrl(row.sourceRef ?? ""))) continue;
      const ref = row.sourceRef ? normalizeUrl(row.sourceRef) : "";
      if (ref && wantedNorm.has(ref)) found.set(ref, row.key);
    }
  }
  process.stdout.write("\n");

  const bankedFailed = [...wantedNorm.entries()]
    .filter(([norm]) => !found.has(norm))
    .map(([, original]) => original);
  if (found.size === 0) return { dispatched: [], bankedFailed };

  const keys = [...found.values()];

  // 2b. Steering: what the user said they want to model from the ad. Persisted
  //     as the idea's notes so dispatch folds it into the brief as a Direction
  //     block. Best-effort — a notes failure must not block the write.
  const steering = opts.steering?.trim();
  if (steering) {
    for (const key of keys) {
      const noted = await apiPost<{ ok?: boolean; error?: string }>(
        "/api/v2/idea-bank/notes",
        { key, notes: steering },
        { ccCommand: rt.cc },
      );
      if (!noted.ok) console.error(`  (couldn't attach steering to ${key}: ${formatError(noted)})`);
    }
  }

  // 3. Write each banked idea through Genesis (brief-mode → genesis-pipeline).
  const dispatch = await apiPost<{
    dispatched?: Array<{ key: string; runId: string }>;
    skipped?: Array<{ key: string; reason: string }>;
    error?: string;
  }>(
    "/api/v2/idea-bank/dispatch",
    { keys, awarenessLevel: opts.awarenessLevel, variantCount: opts.variantCount, stopAtHooks: opts.stopAtHooks },
    { ccCommand: rt.cc },
  );
  if (!dispatch.ok) {
    console.log(formatError(dispatch));
    process.exit(1);
  }

  // Map dispatched keys back to their ad URLs for reporting.
  const keyToUrl = new Map([...found.entries()].map(([norm, key]) => [key, wantedNorm.get(norm)!]));
  const dispatched = (dispatch.data.dispatched ?? []).map((d) => ({
    url: keyToUrl.get(d.key) ?? "",
    key: d.key,
    runId: d.runId,
  }));
  return { dispatched, bankedFailed };
}
