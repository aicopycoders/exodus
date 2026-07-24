import fs from "node:fs";
import { apiGet, apiPost } from "../lib/client.js";
import { formatApiError } from "../lib/format.js";
import { getChannel } from "../lib/channel.js";
import { missingRouteLine } from "../lib/route-support.js";
export const helpText = `
exodus bank — List, inspect, and promote entries into this brand's copy banks

Usage:
  exodus bank list [--json]
  exodus bank show <key> [--json]
  exodus bank promote <key> [text] [--file <path>] [options] [--json]

Flags:
  --json                 Machine-readable JSON output (includes ids + provenance)
  --file <path>          (promote) Read the entry text from a file instead of an
                         argument; piping text on stdin is a third option. A text
                         argument and --file conflict (provide one, not both);
                         stdin is read only when neither is given.
  --awareness <pair>     (promote) Tag a body-bank entry with an awareness pair:
                         unawareProblemAware | solutionProductAware | mostAware
  --spend <n>            (promote) Win metric: ad spend (number)
  --roas <n>             (promote) Win metric: return on ad spend (number)
  --ctr <n>              (promote) Win metric: click-through rate (number)
  --note <s>             (promote) Win metric: freeform note
  --run <runId>          (promote) Provenance: the run this copy came from
  --node <nodeId>        (promote) Provenance: the node this copy came from

Banks are addressed by their well-known KEY (shown by \`bank list\`), never by an
internal id. A fresh brand starts with six banks, all empty. \`bank show\` numbers
entries newest-first with their source, win metrics, and age. \`bank promote\`
appends a winning line to a bank; the server rejects an unknown key (listing the
valid ones), empty/over-long text, and a bank that has hit its 2000-entry cap —
those messages print verbatim.

Examples:
  exodus bank list
  exodus bank show hooks
  exodus bank promote hooks "Stop scrolling — your knees will thank you"
  exodus bank promote body:solutionProductAware --file winner.txt --awareness solutionProductAware
  cat winner.txt | exodus bank promote hooks
  exodus bank promote hooks "..." --spend 4200 --roas 3.1 --ctr 1.8 --note "Q3 winner"
  exodus bank promote hooks "..." --run wr_123 --node bot-4
`.trim();
export const AWARENESS_PAIRS = [
    "unawareProblemAware",
    "solutionProductAware",
    "mostAware",
];
const LIST_PATH = "/api/v2/banks";
const SHOW_PATH = "/api/v2/banks/show";
const PROMOTE_PATH = "/api/v2/banks/promote";
const FLYWHEEL_LINE = 'Winner Flywheel: "winner-promoted" dispatched — any workflow with an enabled ' +
    "trigger starts a background run (watch: exodus workflow inbox)";
const VALUE_FLAGS = new Set(["file", "awareness", "spend", "roas", "ctr", "note", "run", "node"]);
const defaultDeps = {
    get: (path) => apiGet(path),
    post: (path, body) => apiPost(path, body),
    readFile: (path) => fs.readFileSync(path, "utf-8"),
    readStdin: () => fs.readFileSync(0, "utf-8"),
    stdinIsTTY: () => !!process.stdin.isTTY,
    channel: getChannel(),
};
function asErrorResult(res, json) {
    return {
        code: 1,
        lines: json
            ? [JSON.stringify({ ok: false, status: res.status, data: res.data })]
            : [formatApiError(res)],
    };
}
function table(headers, rows) {
    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)));
    const fmt = (row) => row.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
    return [fmt(headers), fmt(headers.map((h) => "-".repeat(h.length))), ...rows.map(fmt)].join("\n");
}
export function relativeAge(value, now = Date.now()) {
    const t = typeof value === "number" ? value : Date.parse(value);
    if (!t || Number.isNaN(t))
        return "unknown";
    const diff = now - t;
    if (diff < 0)
        return "just now";
    const sec = Math.floor(diff / 1000);
    if (sec < 45)
        return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60)
        return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24)
        return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7)
        return `${day}d ago`;
    const wk = Math.floor(day / 7);
    if (wk < 5)
        return `${wk}w ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12)
        return `${mo}mo ago`;
    return `${Math.floor(day / 365)}y ago`;
}
function winMetricsLine(wm) {
    if (!wm)
        return null;
    const parts = [];
    if (typeof wm.spend === "number")
        parts.push(`spend=${wm.spend}`);
    if (typeof wm.roas === "number")
        parts.push(`roas=${wm.roas}`);
    if (typeof wm.ctr === "number")
        parts.push(`ctr=${wm.ctr}`);
    if (wm.note)
        parts.push(`note="${wm.note}"`);
    return parts.length > 0 ? `     win: ${parts.join("  ")}` : null;
}
function textBlock(text) {
    const lines = text.split("\n");
    return lines.map((l) => `     ${l}`);
}
export function formatBankList(banks) {
    if (banks.length === 0)
        return "No banks found for the active brand.";
    return table(["key", "name", "type", "entries"], banks.map((b) => [b.key, b.name, b.type, String(b.entryCount)]));
}
export function formatBankShow(res) {
    const lines = [];
    const { bank, entries } = res;
    lines.push(`Bank — ${bank.name}`);
    lines.push(`key:      ${bank.key}`);
    lines.push(`type:     ${bank.type}`);
    if (bank.awarenessPair)
        lines.push(`awareness: ${bank.awarenessPair}`);
    lines.push(`entries:  ${entries.length}`);
    if (entries.length === 0) {
        lines.push("");
        lines.push("  (no entries yet — promote a winner with `exodus bank promote`)");
        return lines.join("\n");
    }
    entries.forEach((entry, i) => {
        lines.push("");
        const badges = [`[${entry.source}]`];
        if (entry.awarenessPair)
            badges.push(entry.awarenessPair);
        if (entry.humanEdited)
            badges.push("edited");
        badges.push(relativeAge(entry.createdAt));
        lines.push(`${i + 1}. ${badges.join(" · ")}`);
        lines.push(...textBlock(entry.text));
        const win = winMetricsLine(entry.winMetrics);
        if (win)
            lines.push(win);
    });
    return lines.join("\n");
}
export function resolvePromoteText(opts) {
    if (opts.arg !== undefined && opts.file !== undefined) {
        throw new Error("provide exactly ONE entry text source, got 2: text argument + --file.");
    }
    if (opts.arg !== undefined)
        return opts.arg;
    if (opts.file !== undefined) {
        try {
            return opts.readFile(opts.file);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`could not read --file "${opts.file}": ${msg}`);
        }
    }
    if (!opts.stdinIsTTY()) {
        const text = opts.readStdin();
        if (text.trim() !== "")
            return text;
    }
    throw new Error("no entry text — pass it as an argument, with --file <path>, or pipe it on stdin.");
}
export function parseWinMetrics(flags) {
    const wm = {};
    const num = (name) => {
        const raw = flags[name];
        if (raw === undefined)
            return undefined;
        if (typeof raw !== "string" || raw.trim() === "") {
            throw new Error(`--${name} must be a number (got "${String(raw)}")`);
        }
        const n = Number(raw);
        if (Number.isNaN(n))
            throw new Error(`--${name} must be a number (got "${raw}")`);
        return n;
    };
    const spend = num("spend");
    const roas = num("roas");
    const ctr = num("ctr");
    if (spend !== undefined)
        wm.spend = spend;
    if (roas !== undefined)
        wm.roas = roas;
    if (ctr !== undefined)
        wm.ctr = ctr;
    if (typeof flags["note"] === "string")
        wm.note = flags["note"];
    return Object.keys(wm).length > 0 ? wm : undefined;
}
export function parseProvenance(flags) {
    const prov = {};
    if (typeof flags["run"] === "string")
        prov.workflowRunId = flags["run"];
    if (typeof flags["node"] === "string")
        prov.nodeId = flags["node"];
    return Object.keys(prov).length > 0 ? prov : undefined;
}
export function parseAwareness(flags) {
    const raw = flags["awareness"];
    if (raw === undefined)
        return undefined;
    if (typeof raw !== "string" || !AWARENESS_PAIRS.includes(raw)) {
        throw new Error(`--awareness must be one of: ${AWARENESS_PAIRS.join(", ")} (got "${String(raw)}").`);
    }
    return raw;
}
export function buildPromoteBody(bankKey, text, flags) {
    const body = { bankKey, text };
    const awarenessPair = parseAwareness(flags);
    if (awarenessPair)
        body.awarenessPair = awarenessPair;
    const winMetrics = parseWinMetrics(flags);
    if (winMetrics)
        body.winMetrics = winMetrics;
    const provenance = parseProvenance(flags);
    if (provenance)
        body.provenance = provenance;
    return body;
}
export async function listFlow(json, deps) {
    const res = await deps.get(LIST_PATH);
    const unsupported = missingRouteLine(res, "bank list", deps.channel);
    if (unsupported)
        return { code: 1, lines: [unsupported] };
    if (!res.ok)
        return asErrorResult(res, json);
    const banks = res.data ?? [];
    return { code: 0, lines: json ? [JSON.stringify(res.data)] : [formatBankList(banks)] };
}
export async function showFlow(key, json, deps) {
    const res = await deps.get(`${SHOW_PATH}?key=${encodeURIComponent(key)}`);
    const unsupported = missingRouteLine(res, "bank show", deps.channel);
    if (unsupported)
        return { code: 1, lines: [unsupported] };
    if (!res.ok)
        return asErrorResult(res, json);
    return {
        code: 0,
        lines: json ? [JSON.stringify(res.data)] : [formatBankShow(res.data)],
    };
}
export async function promoteFlow(key, arg, flags, json, deps) {
    let body;
    try {
        const text = resolvePromoteText({
            arg,
            file: typeof flags["file"] === "string" ? flags["file"] : undefined,
            readFile: deps.readFile,
            readStdin: deps.readStdin,
            stdinIsTTY: deps.stdinIsTTY,
        });
        body = buildPromoteBody(key, text, flags);
    }
    catch (e) {
        return { code: 1, lines: [`Error: ${e instanceof Error ? e.message : String(e)}`] };
    }
    const res = await deps.post(PROMOTE_PATH, body);
    const unsupported = missingRouteLine(res, "bank promote", deps.channel);
    if (unsupported)
        return { code: 1, lines: [unsupported] };
    if (!res.ok)
        return asErrorResult(res, json);
    const data = res.data;
    if (json)
        return { code: 0, lines: [JSON.stringify(res.data)] };
    return {
        code: 0,
        lines: [
            `✓ Promoted to ${data.bankName}.`,
            `entryId:  ${data.entryId}`,
            FLYWHEEL_LINE,
        ],
    };
}
function parsePositional(args = process.argv.slice(3)) {
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
        const key = rest[0];
        if (!key) {
            console.error("Error: bank show requires <key>.");
            console.log("Usage: exodus bank show <key> [--json]");
            process.exit(1);
        }
        return printResult(await showFlow(key, json, defaultDeps));
    }
    if (sub === "promote") {
        const key = rest[0];
        if (!key) {
            console.error("Error: bank promote requires <key>.");
            console.log("Usage: exodus bank promote <key> [text] [--file <path>] [--json]");
            process.exit(1);
        }
        return printResult(await promoteFlow(key, rest[1], flags, json, defaultDeps));
    }
    console.error(`Unknown subcommand: "${sub}"\n`);
    console.log(helpText);
    process.exit(1);
}
