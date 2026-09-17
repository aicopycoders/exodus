import { apiGet, getApiUrl } from "./client.js";
import { formatApiError } from "./format.js";
import { auth401Hint } from "./backend-hint.js";
import { getChannel } from "./channel.js";
import { missingRouteLine } from "./route-support.js";
export const defaultMetaAdsDeps = {
    get: (path) => apiGet(path),
    channel: getChannel(),
    apiUrl: () => getApiUrl(),
    now: () => Date.now(),
};
export function displayOr(display, value, format) {
    if (typeof display === "string" && display.trim())
        return safeTextOr(display, "—");
    if (typeof value === "number" && Number.isFinite(value))
        return format(value);
    return "—";
}
export function money(n, currency) {
    const body = n.toLocaleString("en-US", {
        minimumFractionDigits: n < 100 ? 2 : 0,
        maximumFractionDigits: 2,
    });
    return currency ? `${body} ${currency}` : body;
}
export function percent(n) {
    return `${n.toFixed(2)}%`;
}
export function count(n) {
    return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
}
const ESC_STRING_SEQUENCE = /\x1b[\]PX^_][\s\S]*?(?:\x07|\x1b\\|$)/g;
const ESC_CSI_SEQUENCE = /\x1b\[[0-?]*[ -\/]*[@-~]?/g;
const ESC_SIMPLE_SEQUENCE = /\x1b[ -\/]*[0-~]?/g;
const C0_AND_DEL = /[\x00-\x08\x0b-\x1f\x7f]/g;
const C1_CONTROLS = /[\u0080-\u009f]/g;
export function sanitizeForTerminal(text) {
    if (typeof text !== "string" || text === "")
        return "";
    return text
        .replace(ESC_STRING_SEQUENCE, "")
        .replace(ESC_CSI_SEQUENCE, "")
        .replace(ESC_SIMPLE_SEQUENCE, "")
        .replace(C0_AND_DEL, "")
        .replace(C1_CONTROLS, "");
}
export function safeText(text) {
    return sanitizeForTerminal(text).trim();
}
export function safeTextOr(text, fallback) {
    return safeText(text) || fallback;
}
export function truncate(text, max) {
    if (typeof text !== "string")
        return "";
    const flat = sanitizeForTerminal(text).replace(/\s+/g, " ").trim();
    if (flat.length <= max)
        return flat;
    const cut = flat.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(" ");
    const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
    return `${body}…`;
}
export function dateOrDash(value) {
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
export function table(headers, rows) {
    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)));
    const fmt = (row) => row.map((cell, i) => (cell ?? "").padEnd(widths[i])).join("  ").trimEnd();
    return [fmt(headers), fmt(headers.map((h) => "-".repeat(h.length))), ...rows.map(fmt)].join("\n");
}
export function accountLine(account) {
    const id = safeTextOr(account.accountId, "(no id)");
    const name = safeText(account.name);
    const currency = safeText(account.currency);
    const suffix = [name, currency ? `(${currency})` : ""].filter(Boolean).join(" ");
    return suffix ? `  ${id}  ${suffix}` : `  ${id}`;
}
export function mediaUrl(apiBase, relative) {
    const rel = safeText(relative);
    if (!rel)
        return null;
    if (/^https?:\/\//i.test(rel))
        return rel;
    const base = (apiBase || "").replace(/\/$/, "");
    return `${base}${rel.startsWith("/") ? "" : "/"}${rel}`;
}
export function errorCode(data) {
    if (typeof data !== "object" || data === null)
        return undefined;
    const rec = data;
    if (typeof rec.code === "string" && rec.code)
        return rec.code;
    const err = rec.error;
    if (typeof err === "object" && err !== null) {
        const nested = err.code;
        if (typeof nested === "string" && nested)
            return nested;
    }
    return undefined;
}
export function accountsOf(data) {
    if (typeof data !== "object" || data === null)
        return [];
    const raw = data.accounts;
    return Array.isArray(raw) ? raw : [];
}
export function accountRequiredLines(res, example) {
    const accounts = accountsOf(res.data);
    const lines = [formatApiError(res)];
    if (accounts.length > 0) {
        lines.push("");
        lines.push("Connected ad accounts:");
        for (const account of accounts)
            lines.push(accountLine(account));
        const first = accounts[0]?.accountId;
        if (first) {
            lines.push("");
            lines.push("Re-run naming the one you mean:");
            lines.push(`  ${example(first)}`);
        }
    }
    return lines;
}
export function errorFor(res, verb, json, deps, example) {
    if (res.ok)
        return undefined;
    if (json) {
        return { code: 1, lines: [JSON.stringify({ ok: false, status: res.status, data: res.data })] };
    }
    const unsupported = missingRouteLine(res, verb, deps.channel);
    if (unsupported)
        return { code: 1, lines: [unsupported] };
    if (res.status === 400 && errorCode(res.data) === "ACCOUNT_REQUIRED") {
        return { code: 1, lines: accountRequiredLines(res, example) };
    }
    const lines = [formatApiError(res)];
    if (res.status === 401) {
        lines.push("");
        lines.push(auth401Hint(deps.apiUrl()));
    }
    else if (res.status === 400 && errorCode(res.data) === "NO_BRAND") {
        lines.push("Pick a brand first:  exodus brand use <slug>");
    }
    return { code: 1, lines };
}
