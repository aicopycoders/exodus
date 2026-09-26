// Shared shapes + rendering primitives for the Meta-integration read commands
// (`exodus ads`, `exodus comments`). #1627.
//
// The dashboard syncs a connected brand's Meta ads (and their comments) into
// Exodus once a day; these commands are the CLI window onto that stored copy.
// NOTHING here calls Meta — the server already did, and the rows it hands back
// are already commenter-redacted.
//
// exodus builds standalone, so these interfaces MIRROR the server's response
// shapes rather than importing the Convex validators. Every field is
// optional-tolerant on purpose: an older or newer backend must never crash a
// renderer.

import { apiGet, getApiUrl, type ApiResponse } from "./client.js";
import { formatApiError } from "./format.js";
import { auth401Hint } from "./backend-hint.js";
import { getChannel, type Channel } from "./channel.js";
import { missingRouteLine } from "./route-support.js";

// ── Server contract shapes ────────────────────────────────────────────────

/** One connected ad account, as the 400/200 payloads list them. */
export interface AdAccountRef {
  accountId?: string | null;
  name?: string | null;
  currency?: string | null;
}

/** Relative API paths that 302 to a fresh (expiring) file URL. */
export interface AdMedia {
  image?: string | null;
  video?: string | null;
  poster?: string | null;
}

/** The per-window numbers `ads show` prints for lifetime and last-90-days. */
export interface AdWindowStats {
  resultType?: string | null;
  results?: number | null;
  costPerResult?: number | null;
  costPerResultDisplay?: string | null;
  ctr?: number | null;
  ctrDisplay?: string | null;
  cpc?: number | null;
  cpcDisplay?: string | null;
  spend?: number | null;
  spendDisplay?: string | null;
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  currency?: string | null;
}

export interface AdSummary extends AdWindowStats {
  adId?: string | null;
  accountId?: string | null;
  name?: string | null;
  status?: string | null;
  format?: string | null;
  campaign?: { id?: string | null; name?: string | null; objective?: string | null } | null;
  adset?: { id?: string | null; name?: string | null; optimizationGoal?: string | null } | null;
  createdTime?: string | number | null;
  headline?: string | null;
  bodyText?: string | null;
  winnerStatus?: string | null;
  media?: AdMedia | null;
  syncedAt?: string | number | null;
}

export interface AdsListResponse {
  ads?: AdSummary[];
  count?: number;
  window?: string;
  sort?: string;
  accounts?: AdAccountRef[];
}

export interface AdShowResponse extends AdSummary {
  lifetime?: AdWindowStats | null;
  last90d?: AdWindowStats | null;
  commentCounts?: { facebook?: number | null; instagram?: number | null } | null;
}

export interface AdComment {
  id?: string | null;
  adId?: string | null;
  platform?: string | null;
  text?: string | null;
  createdAt?: string | number | null;
  likeCount?: number | null;
  parentId?: string | null;
  syncedAt?: string | number | null;
}

export interface CommentsResponse {
  adId?: string | null;
  comments?: AdComment[];
  count?: number;
}

// ── Flow plumbing (same shape the hooks family uses) ──────────────────────

export interface FlowResult {
  code: number;
  lines: string[];
  /** Advisory copy for STDERR, so a piped `--json` body stays parseable. */
  warnings?: string[];
}

export interface MetaAdsDeps {
  get: (path: string) => Promise<ApiResponse<unknown>>;
  channel: Channel;
  apiUrl: () => string;
  now: () => number;
}

export const defaultMetaAdsDeps: MetaAdsDeps = {
  get: (path) => apiGet<unknown>(path),
  channel: getChannel(),
  apiUrl: () => getApiUrl(),
  now: () => Date.now(),
};

// ── Cell formatting (pure) ────────────────────────────────────────────────

/**
 * The server sends a `*Display` string ("$18.20", "4.20%") built from the
 * account's own currency and Meta's own rounding. Prefer it ALWAYS — it is what
 * the member sees in Ads Manager. The bare number is the fallback for an older
 * backend that only sends numbers, and only then do we format it ourselves.
 */
export function displayOr(
  display: unknown,
  value: unknown,
  format: (n: number) => string,
): string {
  if (typeof display === "string" && display.trim()) return safeTextOr(display, "—");
  if (typeof value === "number" && Number.isFinite(value)) return format(value);
  return "—";
}

export function money(n: number, currency?: string | null): string {
  const body = n.toLocaleString("en-US", {
    minimumFractionDigits: n < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return currency ? `${body} ${currency}` : body;
}

export function percent(n: number): string {
  return `${n.toFixed(2)}%`;
}

export function count(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
}

// ── Terminal safety ───────────────────────────────────────────────────────

/*
 * Everything these commands print came off Meta: comment text written by
 * strangers, ad and campaign names typed by whoever ran the account. A
 * terminal treats some byte runs as INSTRUCTIONS, not text — clear the screen,
 * repaint earlier lines, retitle the window, or wrap the words in an OSC 8
 * hyperlink pointing somewhere the reader never sees. So every string that
 * reaches a human cell is scrubbed of them first; only `--json` passes through
 * untouched, because a JSON consumer is not a terminal.
 */

/** ESC ] / P / X / ^ / _ … terminated by BEL or ST (OSC, DCS, SOS, PM, APC). */
const ESC_STRING_SEQUENCE = /\x1b[\]PX^_][\s\S]*?(?:\x07|\x1b\\|$)/g;
/** ESC [ … final byte — the CSI family (colours, cursor moves, screen clears). */
const ESC_CSI_SEQUENCE = /\x1b\[[0-?]*[ -\/]*[@-~]?/g;
/** Any other ESC-led sequence: ESC, optional intermediates, one final byte. */
const ESC_SIMPLE_SEQUENCE = /\x1b[ -\/]*[0-~]?/g;
/** C0 controls except tab (09) and newline (0A), plus DEL. CR is dropped. */
const C0_AND_DEL = /[\x00-\x08\x0b-\x1f\x7f]/g;
/** C1 controls — 8-bit equivalents of the ESC sequences above. */
const C1_CONTROLS = /[\u0080-\u009f]/g;

/**
 * Strip terminal control sequences from untrusted text.
 *
 * Order matters: the string-terminated families (OSC and friends) go first, so
 * their payload can't be mistaken for ordinary text once the ESC that opened
 * them is gone. Tabs and newlines survive — callers that need one line collapse
 * whitespace themselves (see `truncate`).
 */
export function sanitizeForTerminal(text: unknown): string {
  if (typeof text !== "string" || text === "") return "";
  return text
    .replace(ESC_STRING_SEQUENCE, "")
    .replace(ESC_CSI_SEQUENCE, "")
    .replace(ESC_SIMPLE_SEQUENCE, "")
    .replace(C0_AND_DEL, "")
    .replace(C1_CONTROLS, "");
}

/** `sanitizeForTerminal` for a value that may be absent — "" when it is. */
export function safeText(text: unknown): string {
  return sanitizeForTerminal(text).trim();
}

/** Sanitized text, or the given placeholder when nothing survives. */
export function safeTextOr(text: unknown, fallback: string): string {
  return safeText(text) || fallback;
}

/** Collapse whitespace and cut on a word boundary when we can. */
export function truncate(text: unknown, max: number): string {
  if (typeof text !== "string") return "";
  const flat = sanitizeForTerminal(text).replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body}…`;
}

/** ISO ms / ISO string / epoch ms → "2026-09-05", else "—". */
export function dateOrDash(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? safeText(value).slice(0, 10)
      : d.toISOString().slice(0, 10);
  }
  return "—";
}

/** Left-aligned fixed-width table — the house shape (see hooks list). */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)),
  );
  const fmt = (row: string[]) =>
    row.map((cell, i) => (cell ?? "").padEnd(widths[i])).join("  ").trimEnd();
  return [fmt(headers), fmt(headers.map((h) => "-".repeat(h.length))), ...rows.map(fmt)].join("\n");
}

/** "act_123  Ground Co (USD)" — one connected account, listed for a choice. */
export function accountLine(account: AdAccountRef): string {
  const id = safeTextOr(account.accountId, "(no id)");
  const name = safeText(account.name);
  const currency = safeText(account.currency);
  const suffix = [name, currency ? `(${currency})` : ""].filter(Boolean).join(" ");
  return suffix ? `  ${id}  ${suffix}` : `  ${id}`;
}

// ── Media URLs ────────────────────────────────────────────────────────────

/**
 * `media.image` and friends arrive as RELATIVE API paths
 * (`/api/v2/ads/<adId>/media/image`) that 302 to a fresh, expiring file URL.
 * A relative path is useless to a human reading the terminal, so print the full
 * URL against the API base this install is already talking to.
 */
export function mediaUrl(apiBase: string, relative: unknown): string | null {
  const rel = safeText(relative);
  if (!rel) return null;
  if (/^https?:\/\//i.test(rel)) return rel;
  const base = (apiBase || "").replace(/\/$/, "");
  return `${base}${rel.startsWith("/") ? "" : "/"}${rel}`;
}

// ── The ACCOUNT_REQUIRED ladder ───────────────────────────────────────────

/** The v2 error code on a response body, wherever the route put it. */
export function errorCode(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const rec = data as Record<string, unknown>;
  if (typeof rec.code === "string" && rec.code) return rec.code;
  const err = rec.error;
  if (typeof err === "object" && err !== null) {
    const nested = (err as Record<string, unknown>).code;
    if (typeof nested === "string" && nested) return nested;
  }
  return undefined;
}

export function accountsOf(data: unknown): AdAccountRef[] {
  if (typeof data !== "object" || data === null) return [];
  const raw = (data as Record<string, unknown>).accounts;
  return Array.isArray(raw) ? (raw as AdAccountRef[]) : [];
}

/**
 * A brand with several connected ad accounts and no `--account` gets a 400 with
 * the list, never a silent pick of the first one — reading one account's ads
 * while believing you're reading another's is a wrong answer that looks right.
 *
 * `example` is the exact command to re-run, so the member never has to work out
 * where the flag goes.
 */
export function accountRequiredLines(
  res: ApiResponse<unknown>,
  example: (accountId: string) => string,
): string[] {
  const accounts = accountsOf(res.data);
  const lines = [formatApiError(res)];
  if (accounts.length > 0) {
    lines.push("");
    lines.push("Connected ad accounts:");
    for (const account of accounts) lines.push(accountLine(account));
    const first = accounts[0]?.accountId;
    if (first) {
      lines.push("");
      lines.push("Re-run naming the one you mean:");
      lines.push(`  ${example(first)}`);
    }
  }
  return lines;
}

/**
 * Route every failed response through one honest ladder:
 * missing route (outdated backend) → ACCOUNT_REQUIRED (pick one) → auth →
 * whatever the server said.
 */
export function errorFor(
  res: ApiResponse<unknown>,
  verb: string,
  json: boolean,
  deps: MetaAdsDeps,
  example: (accountId: string) => string,
): FlowResult | undefined {
  if (res.ok) return undefined;
  if (json) {
    return { code: 1, lines: [JSON.stringify({ ok: false, status: res.status, data: res.data })] };
  }

  const unsupported = missingRouteLine(res, verb, deps.channel);
  if (unsupported) return { code: 1, lines: [unsupported] };

  if (res.status === 400 && errorCode(res.data) === "ACCOUNT_REQUIRED") {
    return { code: 1, lines: accountRequiredLines(res, example) };
  }

  const lines = [formatApiError(res)];
  if (res.status === 401) {
    lines.push("");
    lines.push(auth401Hint(deps.apiUrl()));
  } else if (res.status === 400 && errorCode(res.data) === "NO_BRAND") {
    lines.push("Pick a brand first:  exodus brand use <slug>");
  }
  return { code: 1, lines };
}
