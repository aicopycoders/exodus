import fs from "node:fs";
import { apiGet, getApiUrl } from "../lib/client.js";
import { formatApiError } from "../lib/format.js";
import { auth401Hint } from "../lib/backend-hint.js";
import { getChannel } from "../lib/channel.js";
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
export const LANES = ["relative", "absolute", "velocity", "evergreen"];
export const VALIDATION_STATUSES = [
    "unproven",
    "corroborated",
    "cross-validated",
    "saturated",
    "virgin-market",
];
export const LIFECYCLES = ["new", "reviewed", "promoted", "tested", "killed"];
export const DISCOVERED_VIA = ["paste", "seed", "expansion", "spotter"];
export const EXTRACT_STATUSES = ["pending", "complete", "partial", "failed", "skipped"];
export const HAS_HOOKS = ["spoken", "onscreen", "caption"];
const LIST_PATH = "/api/v2/hooks";
const SHOW_PATH = "/api/v2/hooks/show";
const SIMILAR_PATH = "/api/v2/hooks/find-similar";
export const EXPORT_CAP = 5000;
export const EXPORT_PAGE_SIZE = 200;
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
const defaultDeps = {
    get: (path) => apiGet(path),
    writeFile: (path, content) => fs.writeFileSync(path, content, "utf-8"),
    channel: getChannel(),
    now: () => Date.now(),
    apiUrl: () => getApiUrl(),
};
function str(flag) {
    return typeof flag === "string" && flag.trim() ? flag.trim() : undefined;
}
function oneOf(flags, name, allowed) {
    const raw = flags[name];
    if (raw === undefined)
        return { ok: true };
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
function positiveNumber(flags, name) {
    const raw = flags[name];
    if (raw === undefined)
        return { ok: true };
    if (typeof raw !== "string" || raw.trim() === "") {
        return { ok: false, message: `--${name} must be a number (got "${String(raw)}")` };
    }
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0) {
        return { ok: false, message: `--${name} must be a number 0 or greater (got "${raw}")` };
    }
    return { ok: true, value: n };
}
export function parseHookFilters(flags, maxLimit) {
    const filters = {};
    const minScore = positiveNumber(flags, "min-score");
    if (!minScore.ok)
        return { ok: false, message: minScore.message };
    if (minScore.value !== undefined)
        filters.minScore = minScore.value;
    const days = positiveNumber(flags, "days");
    if (!days.ok)
        return { ok: false, message: days.message };
    if (days.value !== undefined) {
        if (!Number.isInteger(days.value) || days.value < 1) {
            return { ok: false, message: `--days must be a whole number of days, 1 or more` };
        }
        filters.sinceDays = days.value;
    }
    const enums = [
        ["lane", "lane", LANES],
        ["status", "status", VALIDATION_STATUSES],
        ["lifecycle", "lifecycle", LIFECYCLES],
        ["via", "via", DISCOVERED_VIA],
        ["extract", "extract", EXTRACT_STATUSES],
        ["has", "has", HAS_HOOKS],
    ];
    for (const [key, flagName, allowed] of enums) {
        const parsed = oneOf(flags, flagName, allowed);
        if (!parsed.ok)
            return { ok: false, message: parsed.message };
        if (parsed.value !== undefined) {
            filters[key] = parsed.value;
        }
    }
    const creator = str(flags["creator"]);
    if (creator)
        filters.creator = creator.replace(/^@+/, "");
    const language = str(flags["language"]);
    if (language)
        filters.language = language;
    const market = str(flags["market"]);
    if (market)
        filters.market = market;
    const pattern = str(flags["pattern"]);
    if (pattern)
        filters.pattern = pattern;
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
export function filterQuery(filters, extra = {}) {
    const params = new URLSearchParams();
    if (extra.limit !== undefined)
        params.set("limit", String(extra.limit));
    if (extra.cursor)
        params.set("cursor", extra.cursor);
    if (filters.minScore !== undefined)
        params.set("minScore", String(filters.minScore));
    if (filters.lane)
        params.set("lane", filters.lane);
    if (filters.status)
        params.set("status", filters.status);
    if (filters.lifecycle)
        params.set("lifecycle", filters.lifecycle);
    if (filters.creator)
        params.set("creator", filters.creator);
    if (filters.language)
        params.set("language", filters.language);
    if (filters.market)
        params.set("market", filters.market);
    if (filters.via)
        params.set("via", filters.via);
    if (filters.sinceDays !== undefined)
        params.set("sinceDays", String(filters.sinceDays));
    if (filters.extract)
        params.set("extract", filters.extract);
    if (filters.has)
        params.set("has", filters.has);
    if (filters.pattern)
        params.set("pattern", filters.pattern);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}
function table(headers, rows) {
    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)));
    const fmt = (row) => row.map((cell, i) => (cell ?? "").padEnd(widths[i])).join("  ").trimEnd();
    return [
        fmt(headers),
        fmt(headers.map((h) => "-".repeat(h.length))),
        ...rows.map(fmt),
    ].join("\n");
}
export function formatScore(score) {
    if (typeof score !== "number" || !Number.isFinite(score))
        return "—";
    return `${score.toFixed(1)}×`;
}
function formatCount(n) {
    return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
}
export function shortAge(value, now) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
        return "—";
    const diff = now - value;
    if (diff < 0)
        return "now";
    const min = Math.floor(diff / 60000);
    if (min < 60)
        return min < 1 ? "now" : `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24)
        return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7)
        return `${day}d`;
    const wk = Math.floor(day / 7);
    if (wk < 5)
        return `${wk}w`;
    const mo = Math.floor(day / 30);
    if (mo < 12)
        return `${mo}mo`;
    return `${Math.floor(day / 365)}y`;
}
function isoOrEmpty(ms) {
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0)
        return "";
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
function dateOrDash(ms) {
    const iso = isoOrEmpty(ms);
    return iso ? iso.slice(0, 10) : "—";
}
const LANE_SHORT = {
    relative: "rel",
    absolute: "abs",
    velocity: "vel",
    evergreen: "evg",
};
export function laneCodes(lanes) {
    if (!Array.isArray(lanes) || lanes.length === 0)
        return "—";
    const codes = lanes
        .map((l) => (typeof l?.lane === "string" ? (LANE_SHORT[l.lane] ?? l.lane) : ""))
        .filter(Boolean);
    return codes.length > 0 ? codes.join(",") : "—";
}
export function truncate(text, max) {
    if (typeof text !== "string")
        return "";
    const flat = text.replace(/\s+/g, " ").trim();
    if (flat.length <= max)
        return flat;
    const cut = flat.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(" ");
    const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
    return `${body}…`;
}
const PATTERN_WIDTH = 44;
export function formatCardTable(cards, now) {
    return table(["score", "creator", "hook pattern", "validation", "lanes", "captured"], cards.map((c) => [
        formatScore(c.viralScore),
        c.creatorHandle ? `@${c.creatorHandle.replace(/^@+/, "")}` : "—",
        truncate(c.hookPattern, PATTERN_WIDTH) || "(not extracted)",
        c.validationStatus ?? "—",
        laneCodes(c.lanes),
        shortAge(c.capturedAt, now),
    ]));
}
const EMPTY_LIST_LINES = [
    "No hook cards match those filters.",
    "Loosen a filter, or see everything:  exodus hooks list",
];
const NARROW_OR_EXPORT = "Narrow it with --days or --creator, or pull everything:  exodus hooks export --csv --out hooks.csv";
export function formatList(walk, now) {
    const { cards, more, scanCapped } = walk;
    if (cards.length === 0) {
        if (scanCapped) {
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
    }
    else if (more) {
        lines.push(`${count} — more available; raise --limit (max 200) or use \`exodus hooks export\`.`);
    }
    else {
        lines.push(`${count}.`);
    }
    return lines;
}
function labelledHook(label, value) {
    if (typeof value === "string" && value.trim()) {
        return `  ${label.padEnd(11)}${value.trim()}`;
    }
    return `  ${label.padEnd(11)}(none extracted)`;
}
function corroborationLines(c, now) {
    if (!c)
        return ["  (no corroboration run yet)"];
    const lines = [];
    lines.push(`  replications: ${typeof c.replicationCount === "number" ? c.replicationCount : "—"}`);
    const spread = Array.isArray(c.languageSpread)
        ? c.languageSpread.join(", ")
        : typeof c.languageSpread === "number"
            ? String(c.languageSpread)
            : "—";
    lines.push(`  languages:    ${spread}`);
    lines.push(`  markets:      ${Array.isArray(c.marketsSeen) && c.marketsSeen.length > 0 ? c.marketsSeen.join(", ") : "—"}`);
    lines.push(`  checked:      ${typeof c.checkedAt === "number" ? shortAge(c.checkedAt, now) + " ago" : "never"}`);
    return lines;
}
export function formatShow(card, now) {
    const lines = [];
    const handle = card.creatorHandle ? `@${card.creatorHandle.replace(/^@+/, "")}` : "(unknown creator)";
    lines.push(`Hook card — ${handle}`);
    if (card.sourceUrl)
        lines.push(`url:       ${card.sourceUrl}`);
    lines.push(`views:     ${formatCount(card.viewCount)}  (likes ${formatCount(card.likeCount)} · comments ${formatCount(card.commentCount)})`);
    lines.push(`score:     ${formatScore(card.viralScore)}`);
    if (card.scoreEvidence)
        lines.push(`           ${card.scoreEvidence}`);
    lines.push(`published: ${dateOrDash(card.publishedAt)} · captured ${shortAge(card.capturedAt, now)} ago`);
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
    }
    else {
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
    }
    else {
        lines.push("  (no gate decision recorded)");
    }
    lines.push("");
    lines.push("Provenance");
    lines.push(`  lifecycle:  ${card.lifecycle ?? "—"}`);
    lines.push(`  discovered: ${card.discoveredVia ?? "—"}`);
    lines.push(`  language:   ${card.language ?? "—"} · market ${card.market ?? "—"} · tag ${card.relevanceTag ?? "—"}`);
    if (typeof card.velocityPollCount === "number") {
        lines.push(`  velocity:   ${card.velocityPollCount} poll(s) recorded`);
    }
    if (card.citedStudy)
        lines.push(`  cited:      ${card.citedStudy}`);
    lines.push(`  id:         ${card.id ?? "—"} · shortcode ${card.shortcode ?? "—"}`);
    if (card.hookPatternKey)
        lines.push(`  patternKey: ${card.hookPatternKey}`);
    lines.push("");
    lines.push("Transcript");
    if (typeof card.transcript === "string" && card.transcript.trim()) {
        for (const line of card.transcript.trim().split("\n"))
            lines.push(`  ${line}`);
    }
    else {
        lines.push("  (no transcript captured)");
    }
    return lines.join("\n");
}
export function formatExplainScore(card, now) {
    const lines = [];
    lines.push(card.scoreEvidence?.trim() || "(this card carries no score evidence sentence)");
    lines.push("");
    lines.push(`score:              ${formatScore(card.viralScore)}`);
    lines.push(`views:              ${formatCount(card.viewCount)}`);
    lines.push(`creator's typical:  ${formatCount(card.creatorTypicalViews)}`);
    lines.push(`baseline sample:    ${typeof card.baselineSampleSize === "number" ? `${card.baselineSampleSize} post(s)` : "—"}`);
    if (card.baselineInsufficient) {
        lines.push("                    ⚠ thin baseline — too few posts to trust this multiple yet.");
    }
    lines.push("");
    lines.push("Lanes");
    if (Array.isArray(card.lanes) && card.lanes.length > 0) {
        for (const lane of card.lanes) {
            lines.push(`  ${lane.lane ?? "?"} — ${lane.reason ?? "(no reason recorded)"}`);
        }
    }
    else {
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
export function explainScoreJson(card) {
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
];
const CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;
export function csvEscape(value) {
    if (value === undefined || value === null)
        return "";
    const s = typeof value === "string" && CSV_FORMULA_LEAD.test(value) ? `'${value}` : String(value);
    if (/[",\r\n]/.test(s))
        return `"${s.replace(/"/g, '""')}"`;
    return s;
}
function csvCell(card, column) {
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
            return card[column];
    }
}
export const CSV_RECORD_SEP = "\r\n";
export function toCsv(cards) {
    const rows = [CSV_COLUMNS.join(",")];
    for (const card of cards) {
        rows.push(CSV_COLUMNS.map((col) => csvEscape(csvCell(card, col))).join(","));
    }
    return rows.join(CSV_RECORD_SEP);
}
function asErrorResult(res, json, deps) {
    if (json) {
        return { code: 1, lines: [JSON.stringify({ ok: false, status: res.status, data: res.data })] };
    }
    const lines = [formatApiError(res)];
    if (res.status === 401 || res.status === 403) {
        lines.push("");
        lines.push(auth401Hint(deps.apiUrl()));
    }
    else if (res.status === 400 && /workspace|brand/i.test(lines[0])) {
        lines.push("No active brand. Pick one first:  exodus brand use <slug>");
    }
    return { code: 1, lines };
}
function notFoundResult(ref, res, json) {
    if (json) {
        return { code: 1, lines: [JSON.stringify({ ok: false, status: res.status, data: res.data })] };
    }
    const server = formatApiError(res);
    const lines = [`No hook card matches "${ref}".`];
    if (server && server !== `HTTP ${res.status}`)
        lines.push(server);
    lines.push("Give a card id, an Instagram shortcode, or the reel URL — or browse: exodus hooks list");
    return { code: 1, lines };
}
function errorFor(res, verb, json, deps, ref) {
    if (res.ok)
        return undefined;
    const unsupported = missingRouteLine(res, verb, deps.channel);
    if (unsupported)
        return { code: 1, lines: [unsupported] };
    if (res.status === 404 && ref !== undefined)
        return notFoundResult(ref, res, json);
    return asErrorResult(res, json, deps);
}
export async function listFlow(filters, json, deps) {
    const limit = filters.limit ?? 50;
    const cards = [];
    let cursor;
    let requested = 0;
    let more = false;
    let scanCapped = false;
    let firstPage = true;
    for (;;) {
        const scanRemaining = LIST_SCAN_CAP - requested;
        if (scanRemaining <= 0) {
            scanCapped = true;
            break;
        }
        const pageSize = Math.min(firstPage ? limit : EXPORT_PAGE_SIZE, scanRemaining);
        firstPage = false;
        requested += pageSize;
        const res = await deps.get(`${LIST_PATH}${filterQuery(filters, { limit: pageSize, cursor })}`);
        const err = errorFor(res, "hooks list", json, deps);
        if (err)
            return err;
        const data = (res.data ?? {});
        const page = Array.isArray(data.cards) ? data.cards : [];
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
            more = dropped > 0 || (!exhausted && !!next);
            break;
        }
        if (exhausted)
            break;
        if (!next)
            break;
        cursor = next;
    }
    if (json)
        return { code: 0, lines: [JSON.stringify(cards)] };
    return { code: 0, lines: formatList({ cards, more, scanCapped }, deps.now()) };
}
export async function showFlow(ref, json, deps) {
    const res = await deps.get(`${SHOW_PATH}?ref=${encodeURIComponent(ref)}`);
    const err = errorFor(res, "hooks show", json, deps, ref);
    if (err)
        return err;
    const card = (res.data ?? {}).card;
    if (!card)
        return { code: 1, lines: [`No hook card matches "${ref}".`] };
    if (json)
        return { code: 0, lines: [JSON.stringify(card)] };
    return { code: 0, lines: [formatShow(card, deps.now())] };
}
export async function explainScoreFlow(ref, json, deps) {
    const res = await deps.get(`${SHOW_PATH}?ref=${encodeURIComponent(ref)}`);
    const err = errorFor(res, "hooks explain-score", json, deps, ref);
    if (err)
        return err;
    const card = (res.data ?? {}).card;
    if (!card)
        return { code: 1, lines: [`No hook card matches "${ref}".`] };
    if (json)
        return { code: 0, lines: [JSON.stringify(explainScoreJson(card))] };
    return { code: 0, lines: formatExplainScore(card, deps.now()) };
}
export async function findSimilarFlow(ref, json, deps) {
    const res = await deps.get(`${SIMILAR_PATH}?ref=${encodeURIComponent(ref)}`);
    const err = errorFor(res, "hooks find-similar", json, deps, ref);
    if (err)
        return err;
    const data = (res.data ?? {});
    if (json)
        return { code: 0, lines: [JSON.stringify(data)] };
    const subject = data.card ?? {};
    const similar = Array.isArray(data.similar) ? data.similar : [];
    const handle = subject.creatorHandle
        ? `@${subject.creatorHandle.replace(/^@+/, "")}`
        : "(unknown creator)";
    const lines = [];
    lines.push(`Subject — ${handle}  ${formatScore(subject.viralScore)}`);
    lines.push(`pattern: ${subject.hookPattern ?? "(not extracted yet)"}`);
    if (subject.scoreEvidence)
        lines.push(`         ${subject.scoreEvidence}`);
    lines.push("");
    if (similar.length === 0) {
        lines.push("No other cards share this hook pattern.");
        if (!subject.hookPattern) {
            lines.push("This card has no extracted pattern yet, so there was nothing to match on — that's why the list is empty, not because the hook is one of a kind.");
            lines.push("Check extraction:  exodus hooks show " + ref);
        }
        return { code: 0, lines };
    }
    lines.push(formatCardTable(similar, deps.now()));
    lines.push("");
    lines.push(similar.length === 1
        ? "1 card shares this pattern."
        : `${similar.length} cards share this pattern.`);
    return { code: 0, lines };
}
export async function exportFlow(filters, options, deps) {
    const cap = Math.min(filters.limit ?? EXPORT_CAP, EXPORT_CAP);
    const cards = [];
    let cursor;
    let hitCap = false;
    let more = false;
    for (;;) {
        const pageSize = Math.min(EXPORT_PAGE_SIZE, cap - cards.length);
        if (pageSize <= 0) {
            hitCap = true;
            break;
        }
        const res = await deps.get(`${LIST_PATH}${filterQuery(filters, { limit: pageSize, cursor })}`);
        const err = errorFor(res, "hooks export", options.format === "json", deps);
        if (err)
            return err;
        const data = (res.data ?? {});
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
        if (data.isDone !== false)
            break;
        const next = data.cursor ?? undefined;
        if (!next)
            break;
        cursor = next;
    }
    const body = options.format === "csv" ? toCsv(cards) : JSON.stringify(cards, null, 2);
    const capNote = hitCap || more
        ? `Stopped at ${cards.length} cards (export cap ${cap}) — there are more in the library. Narrow the filters to get the rest.`
        : undefined;
    if (options.out) {
        const terminator = options.format === "csv" ? CSV_RECORD_SEP : "\n";
        deps.writeFile(options.out, `${body}${terminator}`);
        return {
            code: 0,
            lines: [`Wrote ${cards.length} hook card${cards.length === 1 ? "" : "s"} to ${options.out}.`],
            warnings: capNote ? [capNote] : undefined,
        };
    }
    return { code: 0, lines: [body], warnings: capNote ? [capNote] : undefined };
}
export function parsePositional(args = process.argv.slice(3)) {
    const out = [];
    let i = 0;
    while (i < args.length) {
        const arg = args[i];
        if (arg.startsWith("--")) {
            const key = arg.slice(2).split("=", 1)[0] ?? "";
            if (!arg.includes("=") && VALUE_FLAGS.has(key))
                i += 2;
            else
                i++;
            continue;
        }
        out.push(arg);
        i++;
    }
    return out;
}
export function resolveExportFormat(flags) {
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
function printResult(result) {
    for (const line of result.lines)
        console.log(line);
    for (const warning of result.warnings ?? [])
        console.error(warning);
    if (result.code !== 0)
        process.exit(result.code);
}
function usageError(message, usage) {
    console.error(`Error: ${message}`);
    console.log(`Usage: ${usage}`);
    process.exit(1);
}
export async function run(flags) {
    const positional = parsePositional();
    const [sub, ...rest] = positional;
    const json = flags["json"] === true;
    if (!sub || sub === "help") {
        console.log(helpText);
        return;
    }
    if (sub === "list") {
        const parsed = parseHookFilters(flags, 200);
        if (!parsed.ok)
            usageError(parsed.message, "exodus hooks list [filters] [--limit n] [--json]");
        return printResult(await listFlow(parsed.filters, json, defaultDeps));
    }
    if (sub === "show" || sub === "explain-score" || sub === "find-similar") {
        const ref = rest[0];
        if (!ref)
            usageError(`hooks ${sub} needs a card id, shortcode, or Instagram URL.`, `exodus hooks ${sub} <ref> [--json]`);
        if (sub === "show")
            return printResult(await showFlow(ref, json, defaultDeps));
        if (sub === "explain-score")
            return printResult(await explainScoreFlow(ref, json, defaultDeps));
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
        return printResult(await exportFlow(parsed.filters, { format: format.format, out }, defaultDeps));
    }
    console.error(`Unknown subcommand: "${sub}"\n`);
    console.log(helpText);
    process.exit(1);
}
