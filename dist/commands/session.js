import { apiGet, apiPostDashboard } from "../lib/client.js";
import { formatError } from "../lib/format.js";
import { getChannel } from "../lib/channel.js";
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
const SESSIONS_PATH = "/api/v2/sessions";
const SESSION_SHOW_PATH = "/api/v2/sessions/show";
const CHAT_PATH = "/api/sessions/chat";
const CHAT_TIMEOUT_MS = 320_000;
const defaultDeps = {
    get: (path) => apiGet(path),
    postDashboard: (path, body, opts) => apiPostDashboard(path, body, opts),
    channel: getChannel(),
};
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function shortId(id) {
    return id.length <= 12 ? id : `${id.slice(0, 11)}…`;
}
export function formatAge(value, now = Date.now()) {
    if (value === undefined || value === null)
        return "-";
    const t = typeof value === "number" ? value : Date.parse(value);
    if (Number.isNaN(t))
        return "-";
    const sec = Math.max(0, Math.floor((now - t) / 1000));
    if (sec < 60)
        return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60)
        return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24)
        return `${hr}h`;
    return `${Math.floor(hr / 24)}d`;
}
function table(headers, rows) {
    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)));
    const fmt = (row) => row.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
    return [fmt(headers), fmt(headers.map((h) => "-".repeat(h.length))), ...rows.map(fmt)].join("\n");
}
const NO_SESSIONS = "No sessions yet. Sessions are born from workflow runs whose bots run in session-mode.";
export function formatSessionList(sessions, now = Date.now()) {
    if (sessions.length === 0)
        return NO_SESSIONS;
    return table(["id", "title", "bot", "run", "age"], sessions.map((s) => [
        shortId(s._id),
        s.title || "(untitled)",
        s.botSlug,
        s.runId ? shortId(s.runId) : "-",
        formatAge(s.lastTouchedAt, now),
    ]));
}
export function formatSessionShow(data) {
    const s = data.session;
    const lines = [];
    lines.push(`Session — ${s.title || "(untitled)"}`);
    lines.push(`sessionId:  ${s._id}`);
    lines.push(`bot:        ${s.botSlug}`);
    lines.push(`run:        ${s.runId ?? "-"}`);
    const turns = (data.messages ?? []).filter((m) => m.role !== "system");
    lines.push("");
    if (turns.length === 0) {
        lines.push("(no messages yet)");
    }
    else {
        for (const m of turns)
            lines.push(`${m.role}: ${m.body}`);
    }
    return lines.join("\n");
}
function routeErrorText(data, status) {
    if (isRecord(data)) {
        const err = data.error;
        if (typeof err === "string" && err)
            return err;
        if (isRecord(err) && typeof err.message === "string")
            return err.message;
        if (typeof data.message === "string" && data.message)
            return data.message;
    }
    return `HTTP ${status}`;
}
function apiErrorResult(res, verb, json, channel) {
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
export async function listFlow(json, deps) {
    const res = await deps.get(SESSIONS_PATH);
    if (!res.ok)
        return apiErrorResult(res, "session list", json, deps.channel);
    const data = res.data;
    return {
        code: 0,
        lines: json ? [JSON.stringify(data)] : [formatSessionList(data.sessions ?? [])],
    };
}
export async function showFlow(sessionId, opts, deps) {
    const res = await deps.get(`${SESSION_SHOW_PATH}?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok)
        return apiErrorResult(res, "session show", opts.json, deps.channel);
    const data = res.data;
    return {
        code: 0,
        lines: opts.json ? [JSON.stringify(data)] : [formatSessionShow(data)],
    };
}
export async function chatFlow(sessionId, message, opts, deps) {
    const res = await deps.postDashboard(CHAT_PATH, { sessionId, text: message }, { timeoutMs: CHAT_TIMEOUT_MS });
    if (!res.ok) {
        const err = routeErrorText(res.data, res.status);
        return {
            code: 1,
            lines: opts.json
                ? [JSON.stringify({ ok: false, status: res.status, error: err })]
                : [`exodus session chat: ${err} (HTTP ${res.status})`],
        };
    }
    const data = res.data;
    return {
        code: 0,
        lines: opts.json ? [JSON.stringify(data)] : [data.reply ?? ""],
    };
}
function parsePositional(args = process.argv.slice(3)) {
    return args.filter((a) => !a.startsWith("--"));
}
async function printResult(result) {
    for (const line of result.lines)
        console.log(line);
    if (result.code !== 0)
        process.exit(result.code);
}
export async function run(flags) {
    const positional = parsePositional();
    const [sub, ...rest] = positional;
    const json = !!flags["json"];
    if (!sub) {
        console.log(helpText);
        return;
    }
    if (sub === "list")
        return printResult(await listFlow(json, defaultDeps));
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
