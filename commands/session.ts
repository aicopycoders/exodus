import { apiGet, apiPostDashboard, type ApiResponse } from "../lib/client.js";
import { formatError } from "../lib/format.js";
import { getChannel, type Channel } from "../lib/channel.js";
import { missingRouteLine } from "../lib/route-support.js";

export const helpText = `
exodus session — Inspect and continue workflow chat sessions

Usage:
  exodus session list [--json]
  exodus session show <sessionId> [--json]
  exodus session chat <sessionId> "message" [--json]

Flags:
  --json                 Machine-readable JSON output (the raw API response)

Notes:
  Sessions are born from workflow runs whose bots run in session-mode — you do
  not create them here. "session list" shows the sessions on the active brand;
  "session show" prints a session's turns (system rows are hidden in the human
  view but kept in --json); "session chat" appends your message and prints the
  assistant's reply. The chat route can take up to ~5 minutes to answer.

Examples:
  exodus session list
  exodus session show sess_123
  exodus session chat sess_123 "make the hook punchier"
`.trim();

// ── Lean local response shapes (the CLI never imports server types) ────────

/** A session row as returned by GET /api/v2/sessions. */
export interface SessionSummary {
  _id: string;
  title: string;
  botSlug: string;
  runId?: string;
  nodeId?: string;
  archived: boolean;
  // Convex timestamps are epoch millis; tolerate an ISO string too.
  lastTouchedAt: number | string;
  createdAt: number | string;
}

export interface SessionListResponse {
  sessions: SessionSummary[];
}

export type SessionMessageRole = "system" | "user" | "assistant";

export interface SessionMessage {
  role: SessionMessageRole;
  body: string;
  createdAt: number | string;
}

/** GET /api/v2/sessions/show — the session plus its full transcript. */
export interface SessionShowResponse {
  session: SessionSummary & { promptText?: string; model?: string };
  messages: SessionMessage[];
}

/** POST <dashboard>/api/sessions/chat — the assistant's reply on success. */
export interface SessionChatResponse {
  reply: string;
}

// ── Dependency injection (mirrors workflow.ts's WorkflowRunDeps) ───────────

export interface SessionDeps {
  get: (path: string) => Promise<ApiResponse<unknown>>;
  postDashboard: (
    path: string,
    body: unknown,
    opts?: { timeoutMs?: number },
  ) => Promise<ApiResponse<unknown>>;
  channel: Channel;
}

export interface FlowResult {
  code: number;
  lines: string[];
}

const SESSIONS_PATH = "/api/v2/sessions";
const SESSION_SHOW_PATH = "/api/v2/sessions/show";
// The chat route lives on the Next.js dashboard, not on Convex HTTP.
const CHAT_PATH = "/api/sessions/chat";
// The route's maxDuration is 300s — bound the client a touch above that.
const CHAT_TIMEOUT_MS = 320_000;

const defaultDeps: SessionDeps = {
  get: (path) => apiGet<unknown>(path),
  postDashboard: (path, body, opts) => apiPostDashboard<unknown>(path, body, opts),
  channel: getChannel(),
};

// ── Pure helpers ───────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Compact a long Convex id for the glance table (the id column). */
export function shortId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 11)}…`;
}

/**
 * A coarse relative age ("3d" / "5h" / "2m" / "9s") from a timestamp. Epoch
 * millis or an ISO string; unparseable / missing → "-". `now` is injectable so
 * the rendering is deterministic under test.
 */
export function formatAge(value: number | string | undefined, now = Date.now()): string {
  if (value === undefined || value === null) return "-";
  const t = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(t)) return "-";
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)),
  );
  const fmt = (row: string[]) =>
    row.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
  return [fmt(headers), fmt(headers.map((h) => "-".repeat(h.length))), ...rows.map(fmt)].join("\n");
}

const NO_SESSIONS =
  "No sessions yet. Sessions are born from workflow runs whose bots run in session-mode.";

export function formatSessionList(sessions: SessionSummary[], now = Date.now()): string {
  if (sessions.length === 0) return NO_SESSIONS;
  return table(
    ["id", "title", "bot", "run", "age"],
    sessions.map((s) => [
      shortId(s._id),
      s.title || "(untitled)",
      s.botSlug,
      s.runId ? shortId(s.runId) : "-",
      formatAge(s.lastTouchedAt, now),
    ]),
  );
}

export function formatSessionShow(data: SessionShowResponse): string {
  const s = data.session;
  const lines: string[] = [];
  lines.push(`Session — ${s.title || "(untitled)"}`);
  lines.push(`sessionId:  ${s._id}`);
  lines.push(`bot:        ${s.botSlug}`);
  lines.push(`run:        ${s.runId ?? "-"}`);

  // System rows are ELIDED from the human view (kept in --json).
  const turns = (data.messages ?? []).filter((m) => m.role !== "system");
  lines.push("");
  if (turns.length === 0) {
    lines.push("(no messages yet)");
  } else {
    for (const m of turns) lines.push(`${m.role}: ${m.body}`);
  }
  return lines.join("\n");
}

/** Pull a route's error text out of an error body, verbatim where possible. */
function routeErrorText(data: unknown, status: number): string {
  if (isRecord(data)) {
    const err = data.error;
    if (typeof err === "string" && err) return err;
    if (isRecord(err) && typeof err.message === "string") return err.message;
    if (typeof data.message === "string" && data.message) return data.message;
  }
  return `HTTP ${status}`;
}

/**
 * Compose the error FlowResult for a v2 (Convex) verb: a missing-route 404
 * yields the honest #896 line; everything else falls through to the shared
 * formatter (human) or a structured envelope (--json).
 */
function apiErrorResult(
  res: ApiResponse<unknown>,
  verb: string,
  json: boolean,
  channel: Channel,
): FlowResult {
  const missing = missingRouteLine(res, verb, channel);
  if (missing) {
    return {
      code: 1,
      lines: json
        ? [JSON.stringify({ ok: false, status: res.status, error: missing })]
        : [missing],
    };
  }
  return {
    code: 1,
    lines: json
      ? [JSON.stringify({ ok: false, status: res.status, data: res.data })]
      : [formatError(res)],
  };
}

// ── Flows (dependency-injected) ────────────────────────────────────────────

export async function listFlow(json: boolean, deps: SessionDeps): Promise<FlowResult> {
  const res = await deps.get(SESSIONS_PATH);
  if (!res.ok) return apiErrorResult(res, "session list", json, deps.channel);
  const data = res.data as SessionListResponse;
  return {
    code: 0,
    lines: json ? [JSON.stringify(data)] : [formatSessionList(data.sessions ?? [])],
  };
}

export async function showFlow(
  sessionId: string,
  opts: { json: boolean },
  deps: SessionDeps,
): Promise<FlowResult> {
  const res = await deps.get(
    `${SESSION_SHOW_PATH}?sessionId=${encodeURIComponent(sessionId)}`,
  );
  if (!res.ok) return apiErrorResult(res, "session show", opts.json, deps.channel);
  const data = res.data as SessionShowResponse;
  return {
    code: 0,
    lines: opts.json ? [JSON.stringify(data)] : [formatSessionShow(data)],
  };
}

export async function chatFlow(
  sessionId: string,
  message: string,
  opts: { json: boolean },
  deps: SessionDeps,
): Promise<FlowResult> {
  const res = await deps.postDashboard(
    CHAT_PATH,
    { sessionId, text: message },
    { timeoutMs: CHAT_TIMEOUT_MS },
  );
  if (!res.ok) {
    // The chat route persists nothing on failure — surface its error verbatim.
    const err = routeErrorText(res.data, res.status);
    return {
      code: 1,
      lines: opts.json
        ? [JSON.stringify({ ok: false, status: res.status, error: err })]
        : [`exodus session chat: ${err} (HTTP ${res.status})`],
    };
  }
  const data = res.data as SessionChatResponse;
  return {
    code: 0,
    lines: opts.json ? [JSON.stringify(data)] : [data.reply ?? ""],
  };
}

// ── Command dispatch ───────────────────────────────────────────────────────

function parsePositional(args = process.argv.slice(3)): string[] {
  // Session has no value-taking flags (only the boolean --json), so any `--x`
  // token is a flag; everything else is positional (a message is quoted, so a
  // leading "--" never appears there in practice).
  return args.filter((a) => !a.startsWith("--"));
}

async function printResult(result: FlowResult): Promise<void> {
  for (const line of result.lines) console.log(line);
  if (result.code !== 0) process.exit(result.code);
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  const positional = parsePositional();
  const [sub, ...rest] = positional;
  const json = !!flags["json"];

  if (!sub) {
    console.log(helpText);
    return;
  }

  if (sub === "list") return printResult(await listFlow(json, defaultDeps));

  if (sub === "show") {
    const sessionId = rest[0];
    if (!sessionId) {
      console.error("Error: session show requires <sessionId>.");
      console.log("Usage: exodus session show <sessionId> [--json]");
      process.exit(1);
    }
    return printResult(await showFlow(sessionId, { json }, defaultDeps));
  }

  if (sub === "chat") {
    const sessionId = rest[0];
    const message = rest[1];
    if (!sessionId || !message) {
      console.error('Error: session chat requires <sessionId> and a "message".');
      console.log('Usage: exodus session chat <sessionId> "message" [--json]');
      process.exit(1);
    }
    return printResult(await chatFlow(sessionId, message, { json }, defaultDeps));
  }

  console.error(`Unknown subcommand: "${sub}"\n`);
  console.log(helpText);
  process.exit(1);
}
