import fs from "node:fs";
import { apiGet, getApiUrl, type ApiResponse } from "../lib/client.js";
import { formatApiError } from "../lib/format.js";
import { auth401Hint } from "../lib/backend-hint.js";
import { getChannel, type Channel } from "../lib/channel.js";
import { missingRouteLine } from "../lib/route-support.js";

export const helpText = `
exodus hooks — browse the Scout hook library (read-only)

Every organic reel the Scout captured for this brand becomes a HOOK CARD: the
outlier score with the sentence that justifies it, the three hooks (spoken,
on-screen, caption), the pattern behind them, and how far the pattern has been
validated. This family only READS that library — nothing here changes a card.
Promoting a hook into a brief or an Idea Bank card is a dashboard act, on
purpose: a hook card and an Idea Bank card are different objects.

Usage:
  exodus hooks list [filters] [--limit n] [--json]
  exodus hooks show <ref> [--json]
  exodus hooks find-similar <ref> [--json]
  exodus hooks explain-score <ref> [--json]
  exodus hooks export --csv|--json [filters] [--limit n] [--out <file>]

<ref> is a card id, an Instagram shortcode, or a full Instagram URL.

Filters (list + export):
  --min-score <n>        Only cards scoring at least n× the creator's own median
  --lane <x>             relative | absolute | velocity | evergreen
  --status <x>           unproven | corroborated | cross-validated | saturated | virgin-market
  --lifecycle <x>        new | reviewed | promoted | tested | killed
  --creator <handle>     One creator's cards (with or without the leading @)
  --language <xx>        Spoken/caption language code, e.g. en, es
  --market <xx>          Market code, e.g. US, MX
  --via <x>              paste | seed | expansion | spotter
  --days <n>             Captured within the last n days
  --extract <x>          pending | complete | partial | failed | skipped
  --has <x>              spoken | onscreen | caption — cards with that hook extracted
  --pattern "<text>"     Hook patterns containing this text

Other flags:
  --limit <n>            list: how many cards to show, 1–200 (default 50). A
                         filtered list keeps paging until it has that many, or
                         until it has searched the newest ~2000 cards — older
                         ones live behind \`export\`.
                         export: most rows to write, 1–5000 (default 5000).
  --json                 Machine-readable JSON instead of the human view
  --csv                  (export) Comma-separated rows, RFC-4180 quoted
  --out <file>           (export) Write to a file instead of stdout

Examples:
  exodus hooks list --min-score 10 --lane velocity
  exodus hooks list --has onscreen --language es --days 14
  exodus hooks show C9xAbCdEfGh
  exodus hooks explain-score https://www.instagram.com/reel/C9xAbCdEfGh/
  exodus hooks find-similar C9xAbCdEfGh
  exodus hooks export --csv --min-score 5 --out hooks.csv
`.trim();

// ── Server contract shapes (GET /api/v2/hooks*) ───────────────────────────
// exodus builds standalone, so these mirror the Convex validators rather than
// importing them at runtime. Every field is optional-tolerant: an older or
// newer backend must never crash the renderer.

export const LANES = ["relative", "absolute", "velocity", "evergreen"] as const;
export const VALIDATION_STATUSES = [
  "unproven",
  "corroborated",
  "cross-validated",
  "saturated",
  "virgin-market",
] as const;
export const LIFECYCLES = ["new", "reviewed", "promoted", "tested", "killed"] as const;
export const DISCOVERED_VIA = ["paste", "seed", "expansion", "spotter"] as const;
export const EXTRACT_STATUSES = ["pending", "complete", "partial", "failed", "skipped"] as const;
export const HAS_HOOKS = ["spoken", "onscreen", "caption"] as const;

// The server sends `null` (never an absent key) for anything it doesn't know —
// so every field below is `| null` AND optional: null for a current backend,
// absent for an older one that predates the field. Every renderer here treats
// both the same way, which is why nothing downstream has to care.

export interface ApiHookLane {
  lane?: string | null;
  reason?: string | null;
}

export interface ApiHookCorroboration {
  replicationCount?: number | null;
  /** A count on the shipped server; tolerate a language LIST from a future one. */
  languageSpread?: number | string[] | null;
  marketsSeen?: string[] | null;
  checkedAt?: number | null;
}

export interface ApiHookGate {
  verdict?: string | null;
  reasoning?: string | null;
  decidedAt?: number | null;
}

export interface ApiHookCard {
  id?: string | null;
  shortcode?: string | null;
  sourceUrl?: string | null;
  creatorHandle?: string | null;
  caption?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: number | null;
  capturedAt?: number | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  creatorTypicalViews?: number | null;
  baselineSampleSize?: number | null;
  baselineInsufficient?: boolean | null;
  viralScore?: number | null;
  scoreEvidence?: string | null;
  lanes?: ApiHookLane[] | null;
  hookSpoken?: string | null;
  hookOnScreen?: string | null;
  hookCaption?: string | null;
  hookPattern?: string | null;
  formatSkeleton?: string | null;
  extractStatus?: string | null;
  extractEvidence?: string | null;
  validationStatus?: string | null;
  corroboration?: ApiHookCorroboration | null;
  language?: string | null;
  market?: string | null;
  /** A relevance SCORE on the shipped server; a label on an older one. */
  relevanceTag?: string | number | null;
  lifecycle?: string | null;
  discoveredVia?: string | null;
  gate?: ApiHookGate | null;
  // `show` only:
  transcript?: string | null;
  metricSnapshots?: unknown[] | null;
  velocityPollCount?: number | null;
  citedStudy?: string | null;
  hookPatternKey?: string | null;
}

export interface HookListResponse {
  cards?: ApiHookCard[];
  cursor?: string | null;
  isDone?: boolean;
}

export interface HookShowResponse {
  card?: ApiHookCard;
}

export interface HookSimilarSubject {
  id?: string | null;
  shortcode?: string | null;
  creatorHandle?: string | null;
  hookPattern?: string | null;
  viralScore?: number | null;
  scoreEvidence?: string | null;
}

export interface HookSimilarResponse {
  card?: HookSimilarSubject;
  similar?: ApiHookCard[];
}

const LIST_PATH = "/api/v2/hooks";
const SHOW_PATH = "/api/v2/hooks/show";
const SIMILAR_PATH = "/api/v2/hooks/find-similar";

/** Hard stop on `export` so a runaway cursor can never spool forever. */
export const EXPORT_CAP = 5000;
/** Page size `export` asks for while walking the cursor (the server's max). */
export const EXPORT_PAGE_SIZE = 200;

/**
 * How many RAW rows `list` will page through before it stops looking.
 *
 * The server filters AFTER paging, so a selective filter (`--min-score 15`)
 * can return an empty page while matches sit further down the index — `list`
 * has to keep walking or it silently lies about an empty library. But a filter
 * that matches NOTHING would then walk the entire corpus on every invocation,
 * which is not what a browse verb is for. So `list` scans the newest ~2000
 * rows, says out loud when it stopped there, and points at `export` — the
 * full-corpus door, which has its own (much higher) cap.
 */
export const LIST_SCAN_CAP = 2000;

const VALUE_FLAGS = new Set([
  "min-score",
  "lane",
  "status",
  "lifecycle",
  "creator",
  "language",
  "market",
  "via",
  "days",
  "extract",
  "has",
  "pattern",
  "limit",
  "out",
]);

export interface FlowResult {
  code: number;
  /** Everything that belongs on stdout — and ONLY that. */
  lines: string[];
  /**
   * Advisory copy printed to STDERR. `export --json` and `export --csv` write a
   * machine-readable body to stdout; a prose note appended there would corrupt
   * the document for anything piping it into `jq` or a spreadsheet. Warnings
   * still reach the human on the terminal, just down the other pipe.
   */
  warnings?: string[];
}

export interface HooksDeps {
  get: (path: string) => Promise<ApiResponse<unknown>>;
  writeFile: (path: string, content: string) => void;
  channel: Channel;
  now: () => number;
  apiUrl: () => string;
}

const defaultDeps: HooksDeps = {
  get: (path) => apiGet<unknown>(path),
  writeFile: (path, content) => fs.writeFileSync(path, content, "utf-8"),
  channel: getChannel(),
  now: () => Date.now(),
  apiUrl: () => getApiUrl(),
};

// ── Flag parsing (pure) ───────────────────────────────────────────────────

export interface HookFilters {
  minScore?: number;
  lane?: string;
  status?: string;
  lifecycle?: string;
  creator?: string;
  language?: string;
  market?: string;
  via?: string;
  sinceDays?: number;
  extract?: string;
  has?: string;
  pattern?: string;
  limit?: number;
}

export type ParseResult =
  | { ok: true; filters: HookFilters }
  | { ok: false; message: string };

function str(flag: unknown): string | undefined {
  return typeof flag === "string" && flag.trim() ? flag.trim() : undefined;
}

function oneOf(
  flags: Record<string, string | boolean>,
  name: string,
  allowed: readonly string[],
): { ok: true; value?: string } | { ok: false; message: string } {
  const raw = flags[name];
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, message: `--${name} needs a value — one of: ${allowed.join(", ")}` };
  }
  const value = raw.trim();
  if (!allowed.includes(value)) {
    return {
      ok: false,
      message: `--${name} must be one of: ${allowed.join(", ")} (got "${value}")`,
    };
  }
  return { ok: true, value };
}

function positiveNumber(
  flags: Record<string, string | boolean>,
  name: string,
): { ok: true; value?: number } | { ok: false; message: string } {
  const raw = flags[name];
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, message: `--${name} must be a number (got "${String(raw)}")` };
  }
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) {
    return { ok: false, message: `--${name} must be a number 0 or greater (got "${raw}")` };
  }
  return { ok: true, value: n };
}

/**
 * Turn the raw flag bag into validated filters. Every enum is checked HERE,
 * before any request goes out — a typo'd `--lane velcoity` is the user's
 * mistake to see immediately, not a silent empty page from the server.
 *
 * `maxLimit` differs by verb: `list` pages at up to 200, `export` caps the
 * whole walk at EXPORT_CAP.
 */
export function parseHookFilters(
  flags: Record<string, string | boolean>,
  maxLimit: number,
): ParseResult {
  const filters: HookFilters = {};

  const minScore = positiveNumber(flags, "min-score");
  if (!minScore.ok) return { ok: false, message: minScore.message };
  if (minScore.value !== undefined) filters.minScore = minScore.value;

  const days = positiveNumber(flags, "days");
  if (!days.ok) return { ok: false, message: days.message };
  if (days.value !== undefined) {
    if (!Number.isInteger(days.value) || days.value < 1) {
      return { ok: false, message: `--days must be a whole number of days, 1 or more` };
    }
    filters.sinceDays = days.value;
  }

  const enums: Array<[keyof HookFilters, string, readonly string[]]> = [
    ["lane", "lane", LANES],
    ["status", "status", VALIDATION_STATUSES],
    ["lifecycle", "lifecycle", LIFECYCLES],
    ["via", "via", DISCOVERED_VIA],
    ["extract", "extract", EXTRACT_STATUSES],
    ["has", "has", HAS_HOOKS],
  ];
  for (const [key, flagName, allowed] of enums) {
    const parsed = oneOf(flags, flagName, allowed);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    if (parsed.value !== undefined) {
      (filters as Record<string, unknown>)[key] = parsed.value;
    }
  }

  // Free-text passthroughs. `--creator @acme` and `--creator acme` are the same
  // creator; strip the sigil so both spellings hit the same rows.
  const creator = str(flags["creator"]);
  if (creator) filters.creator = creator.replace(/^@+/, "");
  const language = str(flags["language"]);
  if (language) filters.language = language;
  const market = str(flags["market"]);
  if (market) filters.market = market;
  const pattern = str(flags["pattern"]);
  if (pattern) filters.pattern = pattern;

  const limitRaw = flags["limit"];
  if (limitRaw !== undefined) {
    if (typeof limitRaw !== "string" || limitRaw.trim() === "") {
      return { ok: false, message: `--limit must be a whole number 1–${maxLimit}` };
    }
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > maxLimit) {
      return { ok: false, message: `--limit must be a whole number 1–${maxLimit} (got "${limitRaw}")` };
    }
    filters.limit = n;
  }

  return { ok: true, filters };
}

/** Serialize filters as query params. `limit`/`cursor` are passed separately. */
export function filterQuery(
  filters: HookFilters,
  extra: { limit?: number; cursor?: string } = {},
): string {
  const params = new URLSearchParams();
  if (extra.limit !== undefined) params.set("limit", String(extra.limit));
  if (extra.cursor) params.set("cursor", extra.cursor);
  if (filters.minScore !== undefined) params.set("minScore", String(filters.minScore));
  if (filters.lane) params.set("lane", filters.lane);
  if (filters.status) params.set("status", filters.status);
  if (filters.lifecycle) params.set("lifecycle", filters.lifecycle);
  if (filters.creator) params.set("creator", filters.creator);
  if (filters.language) params.set("language", filters.language);
  if (filters.market) params.set("market", filters.market);
  if (filters.via) params.set("via", filters.via);
  if (filters.sinceDays !== undefined) params.set("sinceDays", String(filters.sinceDays));
  if (filters.extract) params.set("extract", filters.extract);
  if (filters.has) params.set("has", filters.has);
  if (filters.pattern) params.set("pattern", filters.pattern);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ── Rendering helpers (pure) ──────────────────────────────────────────────

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)),
  );
  const fmt = (row: string[]) =>
    row.map((cell, i) => (cell ?? "").padEnd(widths[i])).join("  ").trimEnd();
  return [
    fmt(headers),
    fmt(headers.map((h) => "-".repeat(h.length))),
    ...rows.map(fmt),
  ].join("\n");
}

/** "12.4×" for a real multiple, "—" when the card carries no score. */
export function formatScore(score: unknown): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "—";
  return `${score.toFixed(1)}×`;
}

function formatCount(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
}

/** Compact age for a table cell: "now", "4h", "3d", "2w", "5mo", "2y". */
export function shortAge(value: unknown, now: number): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  const diff = now - value;
  if (diff < 0) return "now";
  const min = Math.floor(diff / 60000);
  if (min < 60) return min < 1 ? "now" : `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(day / 365)}y`;
}

function isoOrEmpty(ms: unknown): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function dateOrDash(ms: unknown): string {
  const iso = isoOrEmpty(ms);
  return iso ? iso.slice(0, 10) : "—";
}

const LANE_SHORT: Record<string, string> = {
  relative: "rel",
  absolute: "abs",
  velocity: "vel",
  evergreen: "evg",
};

/** "rel,vel" — short codes so the lane column never dominates the table. */
export function laneCodes(lanes: ApiHookLane[] | null | undefined): string {
  if (!Array.isArray(lanes) || lanes.length === 0) return "—";
  const codes = lanes
    .map((l) => (typeof l?.lane === "string" ? (LANE_SHORT[l.lane] ?? l.lane) : ""))
    .filter(Boolean);
  return codes.length > 0 ? codes.join(",") : "—";
}

/** Collapse whitespace and cut on a word boundary when we can. */
export function truncate(text: unknown, max: number): string {
  if (typeof text !== "string") return "";
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body}…`;
}

const PATTERN_WIDTH = 44;

export function formatCardTable(cards: ApiHookCard[], now: number): string {
  return table(
    ["score", "creator", "hook pattern", "validation", "lanes", "captured"],
    cards.map((c) => [
      formatScore(c.viralScore),
      c.creatorHandle ? `@${c.creatorHandle.replace(/^@+/, "")}` : "—",
      truncate(c.hookPattern, PATTERN_WIDTH) || "(not extracted)",
      c.validationStatus ?? "—",
      laneCodes(c.lanes),
      shortAge(c.capturedAt, now),
    ]),
  );
}

const EMPTY_LIST_LINES = [
  "No hook cards match those filters.",
  "Loosen a filter, or see everything:  exodus hooks list",
];

const NARROW_OR_EXPORT =
  "Narrow it with --days or --creator, or pull everything:  exodus hooks export --csv --out hooks.csv";

/**
 * What the cursor walk in {@link listFlow} came back with. `more` and
 * `scanCapped` are two DIFFERENT unfinished endings and the footer must not
 * blur them: `more` means "your --limit filled first", `scanCapped` means "we
 * stopped looking before the library ran out".
 */
export interface ListWalk {
  cards: ApiHookCard[];
  more: boolean;
  scanCapped: boolean;
}

export function formatList(walk: ListWalk, now: number): string[] {
  const { cards, more, scanCapped } = walk;

  if (cards.length === 0) {
    if (scanCapped) {
      // NOT "no cards match" — we never looked at the whole library.
      return [
        `Nothing matched in the newest ~${LIST_SCAN_CAP} cards; older cards remain unscanned.`,
        NARROW_OR_EXPORT,
      ];
    }
    return [...EMPTY_LIST_LINES];
  }

  const count = `${cards.length} card${cards.length === 1 ? "" : "s"}`;
  const lines = [formatCardTable(cards, now), ""];
  if (scanCapped) {
    lines.push(`${count}. Searched the newest ~${LIST_SCAN_CAP} cards; older cards remain unscanned.`);
    lines.push(NARROW_OR_EXPORT);
  } else if (more) {
    lines.push(`${count} — more available; raise --limit (max 200) or use \`exodus hooks export\`.`);
  } else {
    lines.push(`${count}.`);
  }
  return lines;
}

function labelledHook(label: string, value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return `  ${label.padEnd(11)}${value.trim()}`;
  }
  return `  ${label.padEnd(11)}(none extracted)`;
}

function corroborationLines(
  c: ApiHookCorroboration | null | undefined,
  now: number,
): string[] {
  if (!c) return ["  (no corroboration run yet)"];
  const lines: string[] = [];
  lines.push(
    `  replications: ${typeof c.replicationCount === "number" ? c.replicationCount : "—"}`,
  );
  const spread = Array.isArray(c.languageSpread)
    ? c.languageSpread.join(", ")
    : typeof c.languageSpread === "number"
      ? String(c.languageSpread)
      : "—";
  lines.push(`  languages:    ${spread}`);
  lines.push(
    `  markets:      ${Array.isArray(c.marketsSeen) && c.marketsSeen.length > 0 ? c.marketsSeen.join(", ") : "—"}`,
  );
  lines.push(`  checked:      ${typeof c.checkedAt === "number" ? shortAge(c.checkedAt, now) + " ago" : "never"}`);
  return lines;
}

export function formatShow(card: ApiHookCard, now: number): string {
  const lines: string[] = [];
  const handle = card.creatorHandle ? `@${card.creatorHandle.replace(/^@+/, "")}` : "(unknown creator)";

  lines.push(`Hook card — ${handle}`);
  if (card.sourceUrl) lines.push(`url:       ${card.sourceUrl}`);
  lines.push(
    `views:     ${formatCount(card.viewCount)}  (likes ${formatCount(card.likeCount)} · comments ${formatCount(card.commentCount)})`,
  );
  lines.push(`score:     ${formatScore(card.viralScore)}`);
  if (card.scoreEvidence) lines.push(`           ${card.scoreEvidence}`);
  lines.push(
    `published: ${dateOrDash(card.publishedAt)} · captured ${shortAge(card.capturedAt, now)} ago`,
  );

  lines.push("");
  lines.push("Hooks");
  lines.push(labelledHook("spoken:", card.hookSpoken));
  lines.push(labelledHook("on-screen:", card.hookOnScreen));
  lines.push(labelledHook("caption:", card.hookCaption));

  lines.push("");
  lines.push("Pattern");
  lines.push(`  pattern:   ${card.hookPattern ?? "(not extracted yet)"}`);
  lines.push(`  skeleton:  ${card.formatSkeleton ?? "(not extracted yet)"}`);

  lines.push("");
  lines.push("Extraction");
  lines.push(`  status:    ${card.extractStatus ?? "unknown"}`);
  lines.push(`  evidence:  ${card.extractEvidence ?? "(none recorded)"}`);

  lines.push("");
  lines.push(`Validation — ${card.validationStatus ?? "unknown"}`);
  lines.push(...corroborationLines(card.corroboration, now));

  lines.push("");
  lines.push("Lanes");
  if (Array.isArray(card.lanes) && card.lanes.length > 0) {
    for (const lane of card.lanes) {
      lines.push(`  ${lane.lane ?? "?"} — ${lane.reason ?? "(no reason recorded)"}`);
    }
  } else {
    lines.push("  (no lane qualified this card)");
  }

  lines.push("");
  lines.push("Gate");
  if (card.gate && (card.gate.verdict || card.gate.reasoning)) {
    lines.push(`  verdict:   ${card.gate.verdict ?? "—"}`);
    lines.push(`  reasoning: ${card.gate.reasoning ?? "—"}`);
    if (typeof card.gate.decidedAt === "number") {
      lines.push(`  decided:   ${shortAge(card.gate.decidedAt, now)} ago`);
    }
  } else {
    lines.push("  (no gate decision recorded)");
  }

  lines.push("");
  lines.push("Provenance");
  lines.push(`  lifecycle:  ${card.lifecycle ?? "—"}`);
  lines.push(`  discovered: ${card.discoveredVia ?? "—"}`);
  lines.push(
    `  language:   ${card.language ?? "—"} · market ${card.market ?? "—"} · tag ${card.relevanceTag ?? "—"}`,
  );
  if (typeof card.velocityPollCount === "number") {
    lines.push(`  velocity:   ${card.velocityPollCount} poll(s) recorded`);
  }
  if (card.citedStudy) lines.push(`  cited:      ${card.citedStudy}`);
  lines.push(`  id:         ${card.id ?? "—"} · shortcode ${card.shortcode ?? "—"}`);
  if (card.hookPatternKey) lines.push(`  patternKey: ${card.hookPatternKey}`);

  // Transcript LAST — it is the longest block on the card, and burying the
  // structured fields under it would make `show` unusable in a terminal.
  lines.push("");
  lines.push("Transcript");
  if (typeof card.transcript === "string" && card.transcript.trim()) {
    for (const line of card.transcript.trim().split("\n")) lines.push(`  ${line}`);
  } else {
    lines.push("  (no transcript captured)");
  }

  return lines.join("\n");
}

export function formatExplainScore(card: ApiHookCard, now: number): string[] {
  const lines: string[] = [];
  // The evidence sentence FIRST — it is the whole point of this subcommand.
  lines.push(card.scoreEvidence?.trim() || "(this card carries no score evidence sentence)");
  lines.push("");
  lines.push(`score:              ${formatScore(card.viralScore)}`);
  lines.push(`views:              ${formatCount(card.viewCount)}`);
  lines.push(`creator's typical:  ${formatCount(card.creatorTypicalViews)}`);
  lines.push(
    `baseline sample:    ${typeof card.baselineSampleSize === "number" ? `${card.baselineSampleSize} post(s)` : "—"}`,
  );
  if (card.baselineInsufficient) {
    lines.push(
      "                    ⚠ thin baseline — too few posts to trust this multiple yet.",
    );
  }
  lines.push("");
  lines.push("Lanes");
  if (Array.isArray(card.lanes) && card.lanes.length > 0) {
    for (const lane of card.lanes) {
      lines.push(`  ${lane.lane ?? "?"} — ${lane.reason ?? "(no reason recorded)"}`);
    }
  } else {
    lines.push("  (no lane qualified this card)");
  }
  if (card.gate?.reasoning) {
    lines.push("");
    lines.push("Gate");
    lines.push(`  ${card.gate.verdict ? `${card.gate.verdict} — ` : ""}${card.gate.reasoning}`);
    if (typeof card.gate.decidedAt === "number") {
      lines.push(`  decided ${shortAge(card.gate.decidedAt, now)} ago`);
    }
  }
  return lines;
}

/** The --json shape for explain-score: only the fields the sentence rests on. */
export function explainScoreJson(card: ApiHookCard): Record<string, unknown> {
  return {
    id: card.id,
    shortcode: card.shortcode,
    viralScore: card.viralScore,
    scoreEvidence: card.scoreEvidence,
    viewCount: card.viewCount,
    creatorTypicalViews: card.creatorTypicalViews,
    baselineSampleSize: card.baselineSampleSize,
    baselineInsufficient: card.baselineInsufficient,
    lanes: card.lanes ?? [],
    gate: card.gate,
  };
}

// ── CSV (pure) ────────────────────────────────────────────────────────────

/** Stable column order — a saved spreadsheet must not reshuffle between runs. */
export const CSV_COLUMNS = [
  "id",
  "shortcode",
  "sourceUrl",
  "creatorHandle",
  "viralScore",
  "scoreEvidence",
  "viewCount",
  "likeCount",
  "commentCount",
  "creatorTypicalViews",
  "baselineSampleSize",
  "baselineInsufficient",
  "validationStatus",
  "lanes",
  "hookSpoken",
  "hookOnScreen",
  "hookCaption",
  "hookPattern",
  "formatSkeleton",
  "extractStatus",
  "language",
  "market",
  "lifecycle",
  "discoveredVia",
  "capturedAt",
  "publishedAt",
  "replicationCount",
  "languageSpread",
] as const;

/**
 * The characters a spreadsheet reads as "this cell is a FORMULA, run it".
 * A tab or carriage return counts because Excel skips leading whitespace before
 * deciding.
 */
const CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * RFC-4180: double every quote, wrap anything with a comma/quote/newline —
 * plus one thing RFC-4180 does NOT cover.
 *
 * **Formula injection.** Every caption and hook in this export is text a
 * stranger typed on Instagram, and Excel/Sheets EXECUTE a cell that starts with
 * `=`, `+`, `-` or `@`. A hostile reel caption like `=HYPERLINK(...)` would run
 * on the member's machine the moment they open the CSV we handed them. A single
 * leading apostrophe is the standard neutralizer: the spreadsheet shows the
 * text and never runs it.
 *
 * STRINGS ONLY. Numeric cells (viralScore, viewCount, replicationCount) arrive
 * here as numbers, so a negative score stays a bare number the sheet can sort
 * and total — quoting those would turn the whole score column into text.
 */
export function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s =
    typeof value === "string" && CSV_FORMULA_LEAD.test(value) ? `'${value}` : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvCell(card: ApiHookCard, column: string): unknown {
  switch (column) {
    case "lanes":
      return Array.isArray(card.lanes)
        ? card.lanes.map((l) => l?.lane ?? "").filter(Boolean).join("|")
        : "";
    case "capturedAt":
      return isoOrEmpty(card.capturedAt);
    case "publishedAt":
      return isoOrEmpty(card.publishedAt);
    case "replicationCount":
      return card.corroboration?.replicationCount;
    case "languageSpread": {
      const spread = card.corroboration?.languageSpread;
      return Array.isArray(spread) ? spread.join("|") : spread;
    }
    default:
      return (card as Record<string, unknown>)[column];
  }
}

/** RFC-4180 §2.1: records are separated by CRLF, not a bare LF. */
export const CSV_RECORD_SEP = "\r\n";

export function toCsv(cards: ApiHookCard[]): string {
  const rows = [CSV_COLUMNS.join(",")];
  for (const card of cards) {
    rows.push(CSV_COLUMNS.map((col) => csvEscape(csvCell(card, col))).join(","));
  }
  return rows.join(CSV_RECORD_SEP);
}

// ── Error rendering ───────────────────────────────────────────────────────

function asErrorResult(
  res: ApiResponse<unknown>,
  json: boolean,
  deps: HooksDeps,
): FlowResult {
  if (json) {
    return { code: 1, lines: [JSON.stringify({ ok: false, status: res.status, data: res.data })] };
  }
  const lines = [formatApiError(res)];
  if (res.status === 401 || res.status === 403) {
    lines.push("");
    lines.push(auth401Hint(deps.apiUrl()));
  } else if (res.status === 400 && /workspace|brand/i.test(lines[0])) {
    lines.push("No active brand. Pick one first:  exodus brand use <slug>");
  }
  return { code: 1, lines };
}

function notFoundResult(ref: string, res: ApiResponse<unknown>, json: boolean): FlowResult {
  if (json) {
    return { code: 1, lines: [JSON.stringify({ ok: false, status: res.status, data: res.data })] };
  }
  const server = formatApiError(res);
  const lines = [`No hook card matches "${ref}".`];
  if (server && server !== `HTTP ${res.status}`) lines.push(server);
  lines.push("Give a card id, an Instagram shortcode, or the reel URL — or browse: exodus hooks list");
  return { code: 1, lines };
}

/** Route every failed response through the one honest ladder. */
function errorFor(
  res: ApiResponse<unknown>,
  verb: string,
  json: boolean,
  deps: HooksDeps,
  ref?: string,
): FlowResult | undefined {
  if (res.ok) return undefined;
  const unsupported = missingRouteLine(res, verb, deps.channel);
  if (unsupported) return { code: 1, lines: [unsupported] };
  if (res.status === 404 && ref !== undefined) return notFoundResult(ref, res, json);
  return asErrorResult(res, json, deps);
}

// ── Flows (network, dependency-injected) ──────────────────────────────────

export async function listFlow(
  filters: HookFilters,
  json: boolean,
  deps: HooksDeps,
): Promise<FlowResult> {
  const limit = filters.limit ?? 50;
  const cards: ApiHookCard[] = [];
  let cursor: string | undefined;
  let requested = 0; // raw rows asked of the server, against LIST_SCAN_CAP
  let more = false;
  let scanCapped = false;
  let firstPage = true;

  // The server post-filters AFTER paging, so a page can come back short — even
  // empty — with `isDone:false` while matches sit deeper in the index. One GET
  // would tell a member with `--min-score 15` that they have no 15× hooks
  // simply because the newest 50 rows had none. So walk the cursor.
  for (;;) {
    const scanRemaining = LIST_SCAN_CAP - requested;
    if (scanRemaining <= 0) {
      scanCapped = true;
      break;
    }
    // First page asks for exactly what was requested, so the common case (a
    // loose filter on a healthy library) is still a single round-trip. Only a
    // filter that came back short escalates to full pages.
    const pageSize = Math.min(firstPage ? limit : EXPORT_PAGE_SIZE, scanRemaining);
    firstPage = false;
    requested += pageSize;

    const res = await deps.get(`${LIST_PATH}${filterQuery(filters, { limit: pageSize, cursor })}`);
    const err = errorFor(res, "hooks list", json, deps);
    if (err) return err;
    const data = (res.data ?? {}) as HookListResponse;
    const page = Array.isArray(data.cards) ? data.cards : [];

    // A 200-row page can over-fill the remainder — take only what was asked for
    // and remember that we left rows on the table.
    let dropped = 0;
    for (const card of page) {
      if (cards.length >= limit) {
        dropped++;
        continue;
      }
      cards.push(card);
    }

    const exhausted = data.isDone !== false;
    const next = data.cursor ?? undefined;

    if (cards.length >= limit) {
      // The ask is filled. Anything still out there — a row we dropped, or a
      // live cursor — means "more available", not "that's the lot".
      more = dropped > 0 || (!exhausted && !!next);
      break;
    }
    if (exhausted) break;
    if (!next) break; // a not-done page with no cursor can't advance — stop rather than loop
    cursor = next;
  }

  if (json) return { code: 0, lines: [JSON.stringify(cards)] };
  return { code: 0, lines: formatList({ cards, more, scanCapped }, deps.now()) };
}

export async function showFlow(
  ref: string,
  json: boolean,
  deps: HooksDeps,
): Promise<FlowResult> {
  const res = await deps.get(`${SHOW_PATH}?ref=${encodeURIComponent(ref)}`);
  const err = errorFor(res, "hooks show", json, deps, ref);
  if (err) return err;
  const card = ((res.data ?? {}) as HookShowResponse).card;
  if (!card) return { code: 1, lines: [`No hook card matches "${ref}".`] };
  if (json) return { code: 0, lines: [JSON.stringify(card)] };
  return { code: 0, lines: [formatShow(card, deps.now())] };
}

export async function explainScoreFlow(
  ref: string,
  json: boolean,
  deps: HooksDeps,
): Promise<FlowResult> {
  const res = await deps.get(`${SHOW_PATH}?ref=${encodeURIComponent(ref)}`);
  const err = errorFor(res, "hooks explain-score", json, deps, ref);
  if (err) return err;
  const card = ((res.data ?? {}) as HookShowResponse).card;
  if (!card) return { code: 1, lines: [`No hook card matches "${ref}".`] };
  if (json) return { code: 0, lines: [JSON.stringify(explainScoreJson(card))] };
  return { code: 0, lines: formatExplainScore(card, deps.now()) };
}

export async function findSimilarFlow(
  ref: string,
  json: boolean,
  deps: HooksDeps,
): Promise<FlowResult> {
  const res = await deps.get(`${SIMILAR_PATH}?ref=${encodeURIComponent(ref)}`);
  const err = errorFor(res, "hooks find-similar", json, deps, ref);
  if (err) return err;
  const data = (res.data ?? {}) as HookSimilarResponse;
  if (json) return { code: 0, lines: [JSON.stringify(data)] };

  const subject = data.card ?? {};
  const similar = Array.isArray(data.similar) ? data.similar : [];
  const handle = subject.creatorHandle
    ? `@${subject.creatorHandle.replace(/^@+/, "")}`
    : "(unknown creator)";

  const lines: string[] = [];
  lines.push(`Subject — ${handle}  ${formatScore(subject.viralScore)}`);
  lines.push(`pattern: ${subject.hookPattern ?? "(not extracted yet)"}`);
  if (subject.scoreEvidence) lines.push(`         ${subject.scoreEvidence}`);
  lines.push("");

  if (similar.length === 0) {
    lines.push("No other cards share this hook pattern.");
    if (!subject.hookPattern) {
      // Honesty: an empty result here is NOT evidence the pattern is unique —
      // extraction simply hasn't stamped a pattern on this card yet.
      lines.push(
        "This card has no extracted pattern yet, so there was nothing to match on — that's why the list is empty, not because the hook is one of a kind.",
      );
      lines.push("Check extraction:  exodus hooks show " + ref);
    }
    return { code: 0, lines };
  }

  lines.push(formatCardTable(similar, deps.now()));
  lines.push("");
  lines.push(
    similar.length === 1
      ? "1 card shares this pattern."
      : `${similar.length} cards share this pattern.`,
  );
  return { code: 0, lines };
}

export interface ExportOptions {
  format: "csv" | "json";
  out?: string;
}

export async function exportFlow(
  filters: HookFilters,
  options: ExportOptions,
  deps: HooksDeps,
): Promise<FlowResult> {
  const cap = Math.min(filters.limit ?? EXPORT_CAP, EXPORT_CAP);
  const cards: ApiHookCard[] = [];
  let cursor: string | undefined;
  let hitCap = false;
  let more = false;

  // Walk the cursor to completion. The server post-filters AFTER paging, so a
  // page can come back short — or empty — with isDone false; the ONLY stop
  // signals are isDone, a null cursor, or our own safety cap.
  for (;;) {
    const pageSize = Math.min(EXPORT_PAGE_SIZE, cap - cards.length);
    if (pageSize <= 0) {
      hitCap = true;
      break;
    }
    const res = await deps.get(`${LIST_PATH}${filterQuery(filters, { limit: pageSize, cursor })}`);
    const err = errorFor(res, "hooks export", options.format === "json", deps);
    if (err) return err;
    const data = (res.data ?? {}) as HookListResponse;
    const page = Array.isArray(data.cards) ? data.cards : [];
    for (const card of page) {
      if (cards.length >= cap) {
        hitCap = true;
        break;
      }
      cards.push(card);
    }
    if (hitCap) {
      more = true;
      break;
    }
    if (data.isDone !== false) break;
    const next = data.cursor ?? undefined;
    if (!next) break; // a not-done page with no cursor can't advance — stop rather than loop
    cursor = next;
  }

  const body = options.format === "csv" ? toCsv(cards) : JSON.stringify(cards, null, 2);
  const capNote =
    hitCap || more
      ? `Stopped at ${cards.length} cards (export cap ${cap}) — there are more in the library. Narrow the filters to get the rest.`
      : undefined;

  if (options.out) {
    // CRLF terminator for CSV (RFC-4180), plain LF for the JSON document.
    const terminator = options.format === "csv" ? CSV_RECORD_SEP : "\n";
    deps.writeFile(options.out, `${body}${terminator}`);
    return {
      code: 0,
      // The confirmation IS the output of a `--out` run, so it stays on stdout;
      // the cap note is advisory and goes to stderr with the rest.
      lines: [`Wrote ${cards.length} hook card${cards.length === 1 ? "" : "s"} to ${options.out}.`],
      warnings: capNote ? [capNote] : undefined,
    };
  }

  // No --out: stdout carries the DOCUMENT and nothing else, so it stays
  // pipeable into `jq` or a spreadsheet.
  return { code: 0, lines: [body], warnings: capNote ? [capNote] : undefined };
}

// ── Command dispatch ──────────────────────────────────────────────────────

/** parseArgs drops positionals; recover them (mirror bank.ts). */
export function parsePositional(args = process.argv.slice(3)): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2).split("=", 1)[0] ?? "";
      if (!arg.includes("=") && VALUE_FLAGS.has(key)) i += 2;
      else i++;
      continue;
    }
    out.push(arg);
    i++;
  }
  return out;
}

/** Exactly one of --csv/--json — an export with neither has no output shape. */
export function resolveExportFormat(
  flags: Record<string, string | boolean>,
): { ok: true; format: "csv" | "json" } | { ok: false; message: string } {
  const csv = flags["csv"] === true;
  const json = flags["json"] === true;
  if (csv && json) {
    return { ok: false, message: "pass either --csv or --json to export, not both." };
  }
  if (!csv && !json) {
    return { ok: false, message: "export needs an output shape: pass --csv or --json." };
  }
  return { ok: true, format: csv ? "csv" : "json" };
}

function printResult(result: FlowResult): void {
  for (const line of result.lines) console.log(line);
  // stderr, so a piped `export --json` stays valid JSON while the human still
  // sees the note on their terminal.
  for (const warning of result.warnings ?? []) console.error(warning);
  if (result.code !== 0) process.exit(result.code);
}

function usageError(message: string, usage: string): never {
  console.error(`Error: ${message}`);
  console.log(`Usage: ${usage}`);
  process.exit(1);
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  const positional = parsePositional();
  const [sub, ...rest] = positional;
  const json = flags["json"] === true;

  if (!sub || sub === "help") {
    console.log(helpText);
    return;
  }

  if (sub === "list") {
    const parsed = parseHookFilters(flags, 200);
    if (!parsed.ok) usageError(parsed.message, "exodus hooks list [filters] [--limit n] [--json]");
    return printResult(await listFlow(parsed.filters, json, defaultDeps));
  }

  if (sub === "show" || sub === "explain-score" || sub === "find-similar") {
    const ref = rest[0];
    if (!ref) usageError(`hooks ${sub} needs a card id, shortcode, or Instagram URL.`, `exodus hooks ${sub} <ref> [--json]`);
    if (sub === "show") return printResult(await showFlow(ref, json, defaultDeps));
    if (sub === "explain-score") return printResult(await explainScoreFlow(ref, json, defaultDeps));
    return printResult(await findSimilarFlow(ref, json, defaultDeps));
  }

  if (sub === "export") {
    const format = resolveExportFormat(flags);
    if (!format.ok) {
      usageError(format.message, "exodus hooks export --csv|--json [filters] [--out <file>]");
    }
    const parsed = parseHookFilters(flags, EXPORT_CAP);
    if (!parsed.ok) {
      usageError(parsed.message, "exodus hooks export --csv|--json [filters] [--out <file>]");
    }
    const out = typeof flags["out"] === "string" ? flags["out"] : undefined;
    return printResult(
      await exportFlow(parsed.filters, { format: format.format, out }, defaultDeps),
    );
  }

  console.error(`Unknown subcommand: "${sub}"\n`);
  console.log(helpText);
  process.exit(1);
}
