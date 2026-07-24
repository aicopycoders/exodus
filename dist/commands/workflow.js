import fs from "node:fs";
import { apiGet, apiGetText, apiPost, apiPostDashboard, getDashboardUrl, } from "../lib/client.js";
import { formatError } from "../lib/format.js";
import { pollUntilDone } from "../lib/poll.js";
import { workflowToYaml, parseWorkflowText } from "../lib/workflowText.js";
import { missingRouteLine } from "../lib/route-support.js";
import { getChannel } from "../lib/channel.js";
export const helpText = `
exodus workflow — List, describe, run, inspect, import, and export saved workflows

Usage:
  exodus workflow list [--json]
  exodus workflow describe <workflowId|name> [--json]
  exodus workflow bots [--category <cat>] [--slug <slug>] [--json]
  exodus workflow templates [list] [--json]
  exodus workflow templates export <key> [--out <file>] [--json]
  exodus workflow schema [--kind <kind>] [--face <face>] [--json]
  exodus workflow run <workflowId|name> [--input key=value ...] [--terminal <nodeId> ...] [--wait] [--json]
  exodus workflow status [--id <runId>] [--json]
  exodus workflow versions <workflowId|name> [--json]
  exodus workflow export <workflowId|name> [--version <n>] [--out <file>] [--json]
  exodus workflow validate <file> [--update <workflowId>] [--json]
  exodus workflow import <file> [--update <workflowId>] [--dry-run] [--json]
  exodus workflow triggers <workflowId|name> [--json]
  exodus workflow triggers <workflowId|name> enable <n> [--json]
  exodus workflow triggers <workflowId|name> disable <n> [--json]
  exodus workflow triggers <workflowId|name> fire [<n>] [--text "..."] [--wait] [--json]
  exodus workflow inbox [--json]
  exodus workflow gate <runId> [--json]
  exodus workflow gate <runId> pick <n,..> [--json]
  exodus workflow gate <runId> edit <n> [--text "..." | --file <path> | (stdin)] [--json]
  exodus workflow gate <runId> push "<msg>" [--json]
  exodus workflow gate <runId> approve [--wait] [--json]
  exodus workflow gate <runId> reject [--reason "..."] [--json]
  exodus workflow repair <runId> retry|skip|kill [--wait] [--json]
  exodus workflow answer <runId> --slot key=value [--slot key=value ...] [--json]

Flags:
  --json                 Machine-readable JSON output
  --category <cat>       (bots) Filter the catalog to one category id
  --slug <slug>          (bots) Show a single bot's full port + param spec
  --input key=value      Repeatable workflow run input; values may contain "="
                         --input key=@path loads the value from a file (path is
                         resolved from the current directory); --input key=@@text
                         keeps a leading "@" as a literal character.
  --terminal <nodeId>    (run) Repeatable. Scope the run to the upstream closure
                         of these end node(s) — only nodes feeding a picked
                         terminal execute; the rest are recorded out-of-scope.
                         Omit to run the whole graph.
  --wait                 Poll until the workflow run reaches a terminal status
  --id <runId>           Workflow run id for status detail
  --out <file>           Write the export to a file instead of stdout
  --version <n>          (export) Export a saved historical version instead of the
                         current head. <n> is the real 1-based version id from
                         "workflow versions" (a positive integer). A version
                         export intentionally carries NO triggers/description —
                         those aren't versioned, so a rollback leaves them
                         unchanged; head exports remain the only place triggers
                         appear.
  --json                 (export) Emit the legacy JSON contract body instead of
                         the default canonical YAML (escape hatch for tools that
                         still parse the old JSON export byte-for-byte)
  --update <workflowId>  (import/validate) Update this existing workflow in place
                         instead of creating a new one. Sends the contract's
                         updatedAt as an optimistic-concurrency guard — if it
                         409s, re-export the workflow, reapply edits, and retry.
  --dry-run              Preview import (validate + resolve refs) without writing.
                         Same server-side check as "workflow validate <file>" —
                         use validate as the standalone front door.
  --text "..."           (triggers fire) The input an EVENT trigger's run carries.
                         Required for event triggers; rejected for cron triggers.
                         (gate edit) The replacement copy for one candidate.
  --file <path>          (gate edit) Load the replacement copy from a file.
  --reason "..."         (gate reject) Optional reason recorded on the cancel.
  --slot key=value       (answer) Repeatable. One answer per pending slot.
  --kind <kind>          (schema) Print just one node kind's ports + config rules
  --face <face>          (schema) Print just one transform face's spec

Examples:
  exodus workflow describe "Launch Flow"
  exodus workflow bots
  exodus workflow bots --category writing
  exodus workflow bots --slug new-hook-bot
  exodus workflow templates
  exodus workflow templates export complete-ad-set --out my.yaml
  exodus workflow schema
  exodus workflow schema --kind transform
  exodus workflow schema --face splitter
  exodus workflow run "Launch Flow" --input brief="new offer" --wait
  exodus workflow run "Launch Flow" --input brief=@brief.txt
  exodus workflow run "Launch Flow" --terminal bot-3 --terminal image-2
  exodus workflow status --id wr_123
  exodus workflow versions "Launch Flow"
  exodus workflow export "Launch Flow" --out workflow.yaml
  exodus workflow export "Launch Flow" --version 3 --out v3.yaml
  exodus workflow export "Launch Flow" --json --out workflow.json
  exodus workflow validate my.yaml
  exodus workflow import workflow.yaml --dry-run
  exodus workflow import workflow.json --update wf_123
  exodus workflow triggers "Winner Flywheel"
  exodus workflow triggers "Winner Flywheel" enable 1
  exodus workflow triggers "Winner Flywheel" fire 1 --text "new offer" --wait
  exodus workflow inbox
  exodus workflow gate wr_123
  exodus workflow gate wr_123 pick 1,3
  exodus workflow gate wr_123 edit 2 --text "punchier hook"
  exodus workflow gate wr_123 push "make it shorter"
  exodus workflow gate wr_123 approve --wait
  exodus workflow gate wr_123 reject --reason "off-brand"
  exodus workflow repair wr_123 retry --wait
  exodus workflow answer wr_123 --slot tone=casual --slot length=short

  # Diff two saved versions:
  exodus workflow export X --version 3 --out v3.yaml && exodus workflow export X --version 5 --out v5.yaml && diff v3.yaml v5.yaml
  # Roll a workflow back to an earlier version:
  exodus workflow export X --version 3 --out v3.yaml && exodus workflow import v3.yaml --update <id>

Notes:
  Cold-start is a template, not a blank file: "workflow templates" lists the
  starters (incl. Winner Flywheel), "workflow templates export <key> --out f.yaml"
  writes the server-rendered YAML verbatim — edit it, then "workflow import f.yaml".
  "workflow schema" prints the LIVE graph vocabulary (node kinds, ports, config
  rules, transform faces, gate policies, wiring rules) from the backend you're
  deployed against, so what you author matches what will validate; --kind/--face
  narrow it, --json is the machine payload. "workflow validate <file>" checks a
  file against the live backend (it IS import --dry-run under its own door).
  workflow triggers are addressed by 1-based position — a trigger carries no id,
  so the CLI reads the live list from the export contract and sends a fingerprint
  of the trigger's fields as the guard; a concurrent edit fails loud rather than
  flipping the wrong trigger. Add or remove triggers by editing the YAML export.
  workflow export writes canonical YAML by default (human-diffable, key order
  fixed so equal workflows dump byte-identically); pass --json for the legacy
  JSON contract body. workflow import accepts either a YAML export or a legacy
  JSON file — same downstream, so YAML files work against the deployed API.
  workflow versions lists a workflow's saved history newest-first (up to 50);
  version numbers are real 1-based ids you pass to export --version. A version
  export intentionally carries NO triggers/description (they aren't versioned),
  so rolling back with import --update leaves them unchanged — head exports
  remain the only place triggers appear.
  workflow bots --json emits the FULL catalog response verbatim (--category /
  --slug filters are ignored in that mode). workflow bots --slug <slug> --json
  emits just that one bot's catalog JSON.
  workflow inbox lists every run parked waiting on you, badged by park kind
  (gate/repair/slots/legacy) and how it started (bg / trig:<event>). A gate park
  is resolved with the "gate" verbs: pick candidates by their 1-based number
  (pick 1,3), edit one candidate's copy in place (edit 2 --text ...), push a
  steering message into the gate's live chat session to bank a fresh candidate
  (push "..."), then approve (resume) or reject (cancel). A require-all
  collector that stalled on a dead input is a "repair" park — retry it, skip the
  dead input, or kill the run. A nested sub-workflow waiting on inputs is a
  "slots" park — answer it with repeatable --slot key=value flags (run "answer"
  with no --slot to list the slot ids it wants).
`.trim();
const LIST_PATH = "/api/v2/workflows";
const RUN_PATH = "/api/v2/workflows/run";
const STATUS_PATH = "/api/v2/workflow";
const EXPORT_PATH = "/api/v2/workflows/export";
const IMPORT_PATH = "/api/v2/workflows/import";
const DESCRIBE_PATH = "/api/v2/workflows/describe";
const CATALOG_PATH = "/api/v2/workflows/catalog";
const TRIGGERS_SET_ENABLED_PATH = "/api/v2/workflows/triggers/set-enabled";
const TRIGGERS_FIRE_PATH = "/api/v2/workflows/triggers/fire";
const TEMPLATES_PATH = "/api/v2/workflows/templates";
const SCHEMA_PATH = "/api/v2/workflows/schema";
const VERSIONS_PATH = "/api/v2/workflows/versions";
const VERSIONS_CAP = 50;
const INBOX_PATH = "/api/v2/workflow/inbox";
const APPROVE_PATH = "/api/v2/workflow/approve";
const GATE_PICK_PATH = "/api/v2/workflow/gate/pick";
const GATE_EDIT_PATH = "/api/v2/workflow/gate/edit";
const GATE_APPEND_PATH = "/api/v2/workflow/gate/append-from-session";
const CANCEL_PATH = "/api/v2/workflow/cancel";
const ANSWER_PATH = "/api/v2/workflow/answer";
const REPAIR_RETRY_PATH = "/api/v2/workflow/repair/retry";
const REPAIR_SKIP_PATH = "/api/v2/workflow/repair/skip";
const CHAT_PATH = "/api/sessions/chat";
const CHAT_TIMEOUT_MS = 320_000;
const RUN_PAGE_PREFIX = "/runs/";
const VALUE_FLAGS = new Set([
    "id",
    "input",
    "out",
    "category",
    "slug",
    "update",
    "terminal",
    "text",
    "kind",
    "face",
    "version",
    "file",
    "reason",
    "slot",
]);
const defaultDeps = {
    get: (path) => apiGet(path),
    getText: (path) => apiGetText(path),
    post: (path, body) => apiPost(path, body),
    readFile: (path) => fs.readFileSync(path, "utf-8"),
    writeFile: (path, text) => fs.writeFileSync(path, text, "utf-8"),
    poll: (opts) => pollUntilDone(opts),
    postDashboard: (path, body, opts) => apiPostDashboard(path, body, opts),
    dashboardUrl: getDashboardUrl(),
};
function asErrorResult(res, json) {
    return {
        code: 1,
        lines: json
            ? [JSON.stringify({ ok: false, status: res.status, data: res.data })]
            : [formatError(res)],
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function dateOnly(value) {
    if (!value)
        return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return String(value);
    return parsed.toISOString().slice(0, 10);
}
function table(headers, rows) {
    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)));
    const fmt = (row) => row.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
    return [fmt(headers), fmt(headers.map((h) => "-".repeat(h.length))), ...rows.map(fmt)].join("\n");
}
function statusIcon(status) {
    if (status === "completed" || status === "done")
        return "✓";
    if (status === "failed")
        return "✗";
    if (status === "skipped")
        return "-";
    return "…";
}
function truncateText(text, max = 200) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= max)
        return normalized;
    return `${normalized.slice(0, max - 3).trimEnd()}...`;
}
function formatCounts(counts) {
    if (!counts)
        return "";
    return `done=${counts.done}/${counts.total}, failed=${counts.failed}, skipped=${counts.skipped}`;
}
function outputLines(output) {
    if (output.type === "text")
        return [`    text: ${truncateText(output.text)}`];
    if (output.type === "primer") {
        return [`    primer:${output.primerKind}: ${truncateText(output.text)}`];
    }
    return [`    image: ${output.imageUrl ?? output.storageId}`];
}
function progressLine(node) {
    const err = node.error ? ` — error: ${node.error}` : "";
    return `  ${statusIcon(node.status)} ${node.nodeId} (${node.kind}) ${node.status}${err}`;
}
export function formatPauseNotice(pauseReason, runId, dashboardUrl) {
    if (!pauseReason) {
        return [
            "  ⏸ paused at the cost gate — approve or edit the storyboard in the web app to continue.",
        ];
    }
    if (pauseReason === "call") {
        return ["  ⏸ waiting on a child workflow run — it resumes on its own."];
    }
    const resolveVerb = pauseReason === "repair"
        ? `exodus workflow repair ${runId} retry|skip|kill`
        : pauseReason === "slots"
            ? `exodus workflow answer ${runId} --slot key=value`
            :
                `exodus workflow gate ${runId}`;
    return [
        "  ⏸ paused for review — waiting on you.",
        `     Resolve here:  ${resolveVerb}`,
        `     Or in the app: ${dashboardUrl}${RUN_PAGE_PREFIX}${runId}`,
    ];
}
function expandInputValue(key, value, readFile) {
    if (value.startsWith("@@"))
        return value.slice(1);
    if (value.startsWith("@")) {
        const filePath = value.slice(1);
        if (!filePath) {
            throw new Error(`--input ${key}=@<file> needs a file path after "@"`);
        }
        if (!readFile) {
            throw new Error(`--input ${key}: cannot load @${filePath} here (no file access)`);
        }
        try {
            return readFile(filePath);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`--input ${key}: could not read file "${filePath}": ${msg}`);
        }
    }
    return value;
}
export function parseInputFlags(args, readFile) {
    const inputs = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        let raw;
        if (arg === "--input") {
            raw = args[i + 1];
            i++;
        }
        else if (arg.startsWith("--input=")) {
            raw = arg.slice("--input=".length);
        }
        else {
            continue;
        }
        if (!raw)
            throw new Error("--input requires key=value");
        const eq = raw.indexOf("=");
        if (eq <= 0)
            throw new Error(`--input must be key=value (got "${raw}")`);
        const key = raw.slice(0, eq).trim();
        if (!key)
            throw new Error(`--input must include a key (got "${raw}")`);
        inputs[key] = expandInputValue(key, raw.slice(eq + 1), readFile);
    }
    return inputs;
}
export function parseTerminalFlags(args) {
    const ids = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        let raw;
        if (arg === "--terminal") {
            raw = args[i + 1];
            i++;
        }
        else if (arg.startsWith("--terminal=")) {
            raw = arg.slice("--terminal=".length);
        }
        else {
            continue;
        }
        if (raw === undefined)
            throw new Error("--terminal requires a node id");
        const id = raw.trim();
        if (!id)
            throw new Error("--terminal requires a node id");
        ids.push(id);
    }
    return ids;
}
export function formatWorkflowList(workflows) {
    if (workflows.length === 0)
        return "No workflows found for the active brand.";
    return table(["name", "nodes", "edges", "updated", "id"], workflows.map((w) => [
        w.isCrossBrand && w.homeBrandName ? `${w.name} · from ${w.homeBrandName}` : w.name,
        String(w.nodeCount),
        String(w.edgeCount),
        dateOnly(w.updatedAt),
        w._id,
    ]));
}
export function formatRecentRuns(runs) {
    if (runs.length === 0)
        return "No workflow runs found for the active brand.";
    return table(["workflow", "status", "created", "id"], runs.map((r) => [r.workflowName, r.status, dateOnly(r.createdAt), r._id]));
}
export function formatWorkflowVersions(versions) {
    if (versions.length === 0) {
        return "no saved versions yet — versions start recording on the workflow's next save";
    }
    const lines = versions.map((v) => {
        const by = v.savedByName ? ` · by ${v.savedByName}` : "";
        return `v${v.version} · ${v.name} · saved ${dateOnly(v.savedAt)}${by}`;
    });
    if (versions.length === VERSIONS_CAP) {
        lines.push("");
        lines.push(`(showing the ${VERSIONS_CAP} most recent versions — older versions may exist beyond this cap)`);
    }
    return lines.join("\n");
}
export function formatImportSummary(result, mode = {}) {
    const lines = [];
    const heading = mode.validate
        ? "Workflow validation passed:"
        : mode.dryRun
            ? "Workflow import preview:"
            : result.created
                ? "Workflow imported."
                : mode.update
                    ? "Workflow updated."
                    : "Workflow import preview:";
    lines.push(heading);
    lines.push(`name:        ${result.name}`);
    if (result.workflowId)
        lines.push(`workflowId:  ${result.workflowId}`);
    lines.push(`nodes:       ${result.nodeCount}`);
    lines.push(`edges:       ${result.edgeCount}`);
    if (result.unresolved.length > 0) {
        lines.push("");
        lines.push(`Unresolved references (${result.unresolved.length}):`);
        for (const ref of result.unresolved) {
            lines.push(`  ${ref.nodeId.padEnd(20)} ${ref.ref.padEnd(7)} ${ref.value} — ${ref.message}`);
        }
    }
    if (result.warnings.length > 0) {
        lines.push("");
        lines.push(`Warnings (${result.warnings.length}):`);
        for (const warning of result.warnings)
            lines.push(`  ${warning}`);
    }
    return lines.join("\n");
}
export function formatWorkflowRun(run) {
    const lines = [];
    const counts = formatCounts(run.counts);
    lines.push(`Workflow run — ${run.workflowName}`);
    lines.push(`runId:        ${run._id}`);
    lines.push(`workflowId:   ${run.workflowId}`);
    if (run.triggerRunId)
        lines.push(`triggerRunId: ${run.triggerRunId}`);
    lines.push(`verdict:      ${run.status}${counts ? ` (${counts})` : ""}`);
    if (run.isTerminal)
        lines.push("terminal:     yes");
    if (run.error)
        lines.push(`error:        ${run.error}`);
    if (Object.keys(run.inputs ?? {}).length > 0) {
        const inputs = Object.entries(run.inputs).map(([k, v]) => `${k}=${v}`).join(", ");
        lines.push(`inputs:       ${inputs}`);
    }
    if (run.nodes.length > 0) {
        lines.push("");
        lines.push(`Nodes (${run.nodes.length}):`);
        for (const node of run.nodes) {
            lines.push(progressLine(node));
            for (const output of node.outputs)
                lines.push(...outputLines(output));
        }
    }
    if (run.outputs && run.outputs.length > 0) {
        lines.push("");
        lines.push(`Outputs (${run.outputs.length}):`);
        for (const output of run.outputs)
            lines.push(...runOutputLines(output));
    }
    if (run.sessions && run.sessions.length > 0) {
        lines.push("");
        lines.push(`Sessions (${run.sessions.length}):`);
        for (const s of run.sessions) {
            lines.push(`  session: ${s.sessionId} · "${s.title}" · continue: exodus session chat ${s.sessionId} "..."`);
        }
    }
    return lines.join("\n");
}
function runOutputLines(output) {
    const slug = output.botSlug ? ` (${output.botSlug})` : "";
    if (output.type === "image") {
        return [`  ${output.label} [image]${slug}: ${output.imageUrl ?? output.imageId ?? "(no url)"}`];
    }
    if (output.type === "video") {
        const tag = output.final === true ? "final video" : "video";
        return [`  ${output.label} [${tag}]${slug}: ${output.videoUrl ?? "(no url)"}`];
    }
    if (output.type === "audio") {
        return [`  ${output.label} [audio]${slug}: ${output.audioUrl ?? "(no url)"}`];
    }
    if (output.type === "frames") {
        const n = output.frames?.length ?? 0;
        return [`  ${output.label} [frames]${slug}: ${n} scene${n === 1 ? "" : "s"}`];
    }
    if (output.type === "storyboard") {
        return [`  ${output.label} [storyboard]${slug}: use --json for the scene plan`];
    }
    const raw = output.text ?? "";
    const normalized = raw.replace(/\s+/g, " ").trim();
    const body = truncateText(raw, 400);
    const note = normalized.length > 400 ? "\n    (truncated — use --json for the full text)" : "";
    return [`  ${output.label} [text]${slug}:`, `    ${body}${note}`];
}
export function formatDescribe(res) {
    const lines = [];
    lines.push(`Workflow — ${res.name}`);
    lines.push(`workflowId:  ${res.workflowId}`);
    if (res.description)
        lines.push(`description:  ${res.description}`);
    lines.push(`updated:     ${dateOnly(res.updatedAt)}`);
    lines.push("");
    lines.push(`Inputs (${res.inputs.length}):`);
    if (res.inputs.length === 0) {
        lines.push("  (none — this workflow takes no run inputs)");
    }
    else {
        for (const input of res.inputs) {
            const req = input.required ? "required" : "optional";
            const bundle = input.bundleSize !== undefined ? `, bundle=${input.bundleSize}` : "";
            lines.push(`  ${input.fieldName} — ${input.source}, ${req}${bundle}`);
            if (input.description)
                lines.push(`      ${input.description}`);
        }
    }
    lines.push("");
    lines.push(`Prerequisites (${res.prerequisites.length}):`);
    if (res.prerequisites.length === 0) {
        lines.push("  (none — no stored primers required)");
    }
    else {
        for (const prereq of res.prerequisites) {
            const mark = prereq.stored ? "✓ stored" : "✗ MISSING";
            lines.push(`  ${mark}  ${prereq.primerKind} primer  (nodes: ${prereq.nodeIds.join(", ")})`);
        }
        const missing = res.prerequisites.filter((p) => !p.stored);
        if (missing.length > 0) {
            lines.push("");
            lines.push(`  ✗ ${missing.length} primer(s) not stored for this brand — add ${missing
                .map((p) => `"${p.primerKind}"`)
                .join(", ")} before running, or those nodes fail.`);
        }
    }
    lines.push("");
    lines.push(`Outputs (${res.outputs.length}):`);
    if (res.outputs.length === 0) {
        lines.push("  (none wired into an Output node)");
    }
    else {
        for (const output of res.outputs) {
            const slug = output.botSlug ? ` (${output.botSlug})` : "";
            lines.push(`  ${output.label} [${output.type}]${slug}`);
        }
    }
    return lines.join("\n");
}
function formatBotVocabulary(catalog) {
    const v = catalog.vocabulary;
    const lines = [];
    lines.push("Vocabulary:");
    lines.push(`  node kinds:    ${v.nodeKinds.join(", ")}`);
    lines.push(`  brief sources: ${v.briefSources.join(", ")}`);
    lines.push(`  primer kinds:  ${v.primerKinds.join(", ")}`);
    lines.push(`  image models:  ${v.imageModels.join(", ")}`);
    lines.push(`  aspect ratios: ${v.aspectRatios.join(", ")}`);
    lines.push(`  custom bot:    set a bot node's slug to "${catalog.customBot.slug}" and ` +
        `config.${catalog.customBot.configKey}=<genesis-slug> to reach any bot not listed here.`);
    lines.push(`  prompt bot:    set a bot node's slug to "${catalog.promptBot.slug}" and ` +
        `config.${catalog.promptBot.configKey}=<your instructions> — the prompt IS the bot ` +
        "(runs on the workspace's own LLM key, not Genesis).");
    return lines.join("\n");
}
export function formatBotsList(catalog, category) {
    const bots = category
        ? catalog.bots.filter((b) => b.category === category)
        : catalog.bots;
    if (bots.length === 0) {
        const known = catalog.vocabulary.categories.map((c) => c.id).join(", ");
        return category
            ? `No bots in category "${category}". Known categories: ${known}`
            : "No bots in the catalog.";
    }
    const lines = [];
    let currentCategory = null;
    for (const bot of bots) {
        if (bot.category !== currentCategory) {
            if (currentCategory !== null)
                lines.push("");
            lines.push(`${bot.categoryLabel} (${bot.category})`);
            currentCategory = bot.category;
        }
        lines.push(`  ${bot.slug} — ${bot.blurb}`);
    }
    if (!category) {
        lines.push("");
        lines.push(formatBotVocabulary(catalog));
    }
    return lines.join("\n");
}
export function formatBotDetail(bot) {
    const lines = [];
    lines.push(`${bot.name}  (slug: ${bot.slug})`);
    lines.push(`category:    ${bot.categoryLabel} (${bot.category})`);
    lines.push(`blurb:       ${bot.blurb}`);
    lines.push(`outputType:  ${bot.outputType}`);
    lines.push("");
    lines.push(`Input ports (${bot.inputs.length}):`);
    if (bot.inputs.length === 0) {
        lines.push("  (none)");
    }
    else {
        for (const input of bot.inputs) {
            const bits = [`accepts ${input.accepts.join("/")}`, input.required ? "required" : "optional"];
            if (input.multi)
                bits.push("multi");
            if (input.primerKinds && input.primerKinds.length > 0) {
                bits.push(`primer-gate: ${input.primerKinds.join("/")}`);
            }
            lines.push(`  ${input.id} — ${bits.join(", ")}`);
        }
    }
    lines.push("");
    lines.push(`Params (${bot.params.length}):`);
    if (bot.params.length === 0) {
        lines.push("  (none)");
    }
    else {
        for (const param of bot.params) {
            const bits = [param.kind];
            if (param.options && param.options.length > 0)
                bits.push(`options: ${param.options.join("|")}`);
            if (param.min !== undefined)
                bits.push(`min ${param.min}`);
            if (param.max !== undefined)
                bits.push(`max ${param.max}`);
            if (param.required)
                bits.push("required");
            if (param.default !== undefined)
                bits.push(`default "${param.default}"`);
            lines.push(`  config.${param.key} — ${param.label} (${bits.join(", ")})`);
            if (param.help)
                lines.push(`      ${param.help}`);
        }
    }
    return lines.join("\n");
}
function firstLine(text) {
    const nl = text.indexOf("\n");
    return (nl === -1 ? text : text.slice(0, nl)).trim();
}
export function formatTemplatesList(templates) {
    if (templates.length === 0)
        return "No workflow templates available on this backend.";
    const lines = [
        table(["key", "label", "description"], templates.map((t) => [
            t.key,
            t.module ? `${t.label} [${t.module} module]` : t.label,
            firstLine(t.description ?? ""),
        ])),
    ];
    if (templates.some((t) => t.module)) {
        lines.push("");
        lines.push("Templates badged [<module> module] are owned by a module (e.g. video) — " +
            "their runs start from the show surfaces, not `workflow run`. Export one to " +
            "study or adapt its graph.");
    }
    lines.push("");
    lines.push("Export one to start authoring: exodus workflow templates export <key> --out my.yaml");
    return lines.join("\n");
}
const SCHEMA_LABEL_KEYS = ["kind", "face", "type", "name", "id", "code", "key", "label"];
function schemaEntryLabel(entry) {
    for (const key of SCHEMA_LABEL_KEYS) {
        const v = entry[key];
        if (typeof v === "string" && v)
            return { key, value: v };
    }
    return undefined;
}
function schemaValueLines(value, indent) {
    if (value === null || value === undefined)
        return [`${indent}(none)`];
    if (Array.isArray(value)) {
        if (value.length === 0)
            return [`${indent}(none)`];
        const lines = [];
        for (const el of value) {
            if (isRecord(el)) {
                const label = schemaEntryLabel(el);
                if (label) {
                    lines.push(`${indent}- ${label.value}`);
                    const rest = { ...el };
                    delete rest[label.key];
                    lines.push(...schemaValueLines(rest, `${indent}    `));
                }
                else {
                    lines.push(`${indent}-`);
                    lines.push(...schemaValueLines(el, `${indent}    `));
                }
            }
            else {
                lines.push(`${indent}- ${String(el)}`);
            }
        }
        return lines;
    }
    if (isRecord(value)) {
        const entries = Object.entries(value);
        if (entries.length === 0)
            return [`${indent}(none)`];
        const lines = [];
        for (const [k, v] of entries) {
            if (isRecord(v) || Array.isArray(v)) {
                lines.push(`${indent}${k}:`);
                lines.push(...schemaValueLines(v, `${indent}    `));
            }
            else {
                lines.push(`${indent}${k}: ${String(v)}`);
            }
        }
        return lines;
    }
    return [`${indent}${String(value)}`];
}
const SCHEMA_SECTIONS = [
    { title: "Graph contract version", keys: ["graphVersion"] },
    { title: "Port types", keys: ["portTypes"] },
    { title: "Node kinds", keys: ["nodeKinds"] },
    { title: "Transform faces", keys: ["transformFaces"] },
    { title: "Gate policies", keys: ["gatePolicies"] },
    { title: "Collector policy", keys: ["collectorPolicy"] },
    { title: "Deposits", keys: ["deposits"] },
    { title: "Slots", keys: ["slots"] },
    { title: "Triggers", keys: ["triggers"] },
    { title: "Edge / graph rules", keys: ["edgeRules", "graphRules"] },
    {
        title: "Bots",
        keys: ["botsPointer", "botsPointerNote", "bots-pointer-note", "botsNote", "bots"],
    },
];
function schemaSectionValue(payload, keys) {
    for (const key of keys) {
        if (payload[key] !== undefined)
            return { key, value: payload[key] };
    }
    return undefined;
}
export function formatSchema(payload) {
    const lines = [];
    const version = payload["version"];
    lines.push(`Workflow schema${version !== undefined ? ` (version ${version})` : ""}`);
    for (const section of SCHEMA_SECTIONS) {
        const found = schemaSectionValue(payload, section.keys);
        if (!found)
            continue;
        lines.push("");
        lines.push(`${section.title}:`);
        lines.push(...schemaValueLines(found.value, "  "));
    }
    return lines.join("\n");
}
function schemaEntryIds(value) {
    if (!Array.isArray(value))
        return [];
    const ids = [];
    for (const el of value) {
        if (isRecord(el)) {
            const label = schemaEntryLabel(el);
            if (label)
                ids.push(label.value);
        }
        else if (typeof el === "string") {
            ids.push(el);
        }
    }
    return ids;
}
function formatSchemaFilter(payload, sectionKeys, axis, wanted) {
    const found = schemaSectionValue(payload, sectionKeys);
    const list = found && Array.isArray(found.value) ? found.value : [];
    const match = list.find((el) => {
        if (!isRecord(el))
            return typeof el === "string" && el === wanted;
        const label = schemaEntryLabel(el);
        return label?.value === wanted;
    });
    if (match === undefined) {
        const valid = schemaEntryIds(found?.value).join(", ") || "(none)";
        return { code: 1, lines: [`Unknown ${axis} "${wanted}". Valid ${axis}s: ${valid}`] };
    }
    const title = axis === "kind" ? "Node kind" : "Transform face";
    const lines = [`${title}: ${wanted}`];
    if (isRecord(match)) {
        const label = schemaEntryLabel(match);
        const rest = { ...match };
        if (label)
            delete rest[label.key];
        lines.push(...schemaValueLines(rest, "  "));
    }
    return { code: 0, lines };
}
function graphIssueLines(issue) {
    const node = issue.nodeId ? ` [node ${issue.nodeId}]` : "";
    const port = issue.portId ? ` [port ${issue.portId}]` : "";
    const edge = !issue.nodeId && issue.edgeId ? ` [edge ${issue.edgeId}]` : "";
    const out = [`${issue.code}${node}${edge}${port}: ${issue.message}`];
    if (issue.remedy)
        out.push(`  fix: ${issue.remedy}`);
    return out;
}
function formatImportError(res) {
    const data = isRecord(res.data) ? res.data : {};
    const err = isRecord(data.error) ? data.error : {};
    const code = typeof err.code === "string" ? err.code : undefined;
    const message = typeof err.message === "string" ? err.message : "Import failed";
    if (code === "INVALID_GRAPH") {
        const issues = Array.isArray(data.issues) ? data.issues : [];
        const lines = [`Import rejected — invalid graph: ${message}`];
        if (issues.length > 0) {
            lines.push("");
            lines.push(`Issues (${issues.length}):`);
            for (const issue of issues)
                lines.push(...graphIssueLines(issue));
        }
        return lines.join("\n");
    }
    if (code === "CONFLICT") {
        const lines = [`Import conflict — ${message}`];
        if (typeof data.currentUpdatedAt === "string") {
            lines.push(`current updatedAt: ${data.currentUpdatedAt}`);
        }
        const remedy = typeof data.remedy === "string"
            ? data.remedy
            : "Re-export the workflow, reapply your edits, and import again with the fresh updatedAt.";
        lines.push(`fix: ${remedy}`);
        return lines.join("\n");
    }
    return formatError(res);
}
export async function resolveWorkflowId(ref, deps) {
    const res = await deps.get(LIST_PATH);
    if (!res.ok)
        throw new Error(formatError(res));
    const workflows = res.data.workflows ?? [];
    const match = workflows.find((w) => w.name.toLowerCase() === ref.toLowerCase());
    return match?._id ?? ref;
}
export async function listFlow(json, deps) {
    const res = await deps.get(LIST_PATH);
    if (!res.ok)
        return asErrorResult(res, json);
    const data = res.data;
    return {
        code: 0,
        lines: json ? [JSON.stringify(data)] : [formatWorkflowList(data.workflows ?? [])],
    };
}
export async function describeFlow(workflowRef, opts, deps) {
    let workflowId;
    try {
        workflowId = await resolveWorkflowId(workflowRef, deps);
    }
    catch (e) {
        return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
    }
    const res = await deps.get(`${DESCRIBE_PATH}?id=${encodeURIComponent(workflowId)}`);
    if (!res.ok)
        return asErrorResult(res, opts.json);
    if (opts.json)
        return { code: 0, lines: [JSON.stringify(res.data)] };
    return { code: 0, lines: [formatDescribe(res.data)] };
}
export async function botsFlow(opts, deps) {
    const res = await deps.get(CATALOG_PATH);
    if (!res.ok)
        return asErrorResult(res, opts.json);
    const catalog = res.data;
    if (opts.slug) {
        const bot = catalog.bots.find((b) => b.slug === opts.slug);
        if (!bot) {
            const line = opts.json
                ? JSON.stringify({ ok: false, error: `unknown bot slug "${opts.slug}"` })
                : `No bot with slug "${opts.slug}" in the catalog. Run "exodus workflow bots" to list them.`;
            return { code: 1, lines: [line] };
        }
        return { code: 0, lines: [opts.json ? JSON.stringify(bot) : formatBotDetail(bot)] };
    }
    if (opts.json)
        return { code: 0, lines: [JSON.stringify(catalog)] };
    return { code: 0, lines: [formatBotsList(catalog, opts.category)] };
}
export async function runFlow(workflowRef, opts, deps) {
    let workflowId;
    try {
        workflowId = await resolveWorkflowId(workflowRef, deps);
    }
    catch (e) {
        return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
    }
    const body = {
        workflowId,
        ...(Object.keys(opts.inputs).length > 0 ? { inputs: opts.inputs } : {}),
        ...(opts.terminalNodeIds && opts.terminalNodeIds.length > 0
            ? { terminalNodeIds: opts.terminalNodeIds }
            : {}),
    };
    const start = await deps.post(RUN_PATH, body);
    if (!start.ok)
        return asErrorResult(start, opts.json);
    const data = start.data;
    const base = { ...data, workflowId };
    if (opts.json && !opts.wait)
        return { code: 0, lines: [JSON.stringify(base)] };
    const lines = opts.json
        ? []
        : [
            "Workflow run started.",
            `runId:        ${data.runId}`,
            `triggerRunId: ${data.triggerRunId}`,
            `Poll: exodus workflow status --id ${data.runId}`,
        ];
    if (!opts.wait)
        return { code: 0, lines };
    if (!opts.json && opts.onProgressLine) {
        for (const line of lines)
            opts.onProgressLine(line);
        lines.length = 0;
    }
    const waited = await waitForRun(data.runId, { json: opts.json, onProgressLine: opts.onProgressLine, jsonBase: base }, deps);
    if (opts.json)
        return waited;
    return { code: waited.code, lines: [...lines, ...waited.lines] };
}
async function waitForRun(runId, opts, deps) {
    const seen = new Map();
    let pausedNotified = false;
    const pollResult = await deps.poll({
        path: `${STATUS_PATH}?runId=${encodeURIComponent(runId)}`,
        intervalMs: 3_000,
        timeoutMs: 60 * 60 * 1000,
        terminalStatuses: ["completed", "partial", "failed", "canceled"],
        onProgress: (raw) => {
            if (opts.json || !opts.onProgressLine)
                return;
            if (raw["status"] === "awaiting-review" && !pausedNotified) {
                pausedNotified = true;
                const dashboardUrl = deps.dashboardUrl ?? getDashboardUrl();
                const pauseReason = raw["pauseReason"];
                for (const line of formatPauseNotice(pauseReason, runId, dashboardUrl)) {
                    opts.onProgressLine(line);
                }
            }
            const nodes = Array.isArray(raw["nodes"]) ? raw["nodes"] : [];
            for (const node of nodes) {
                if (seen.get(node.nodeId) === node.status)
                    continue;
                seen.set(node.nodeId, node.status);
                opts.onProgressLine(progressLine(node));
            }
        },
    });
    if (opts.json) {
        return {
            code: pollResult.ok ? 0 : 1,
            lines: [
                JSON.stringify({ ...opts.jsonBase, result: pollResult.data, timedOut: pollResult.timedOut }),
            ],
        };
    }
    if (pollResult.timedOut) {
        return {
            code: 1,
            lines: [`Timed out waiting. Check later: exodus workflow status --id ${runId}`],
        };
    }
    const lines = [""];
    if (isRecord(pollResult.data) && typeof pollResult.data["_id"] === "string") {
        lines.push(formatWorkflowRun(pollResult.data));
    }
    else {
        lines.push(`Polling failed: ${JSON.stringify(pollResult.data)}`);
    }
    return { code: pollResult.ok ? 0 : 1, lines };
}
export async function statusFlow(opts, deps) {
    const path = opts.id ? `${STATUS_PATH}?runId=${encodeURIComponent(opts.id)}` : STATUS_PATH;
    const res = await deps.get(path);
    if (!res.ok)
        return asErrorResult(res, opts.json);
    if (opts.json)
        return { code: 0, lines: [JSON.stringify(res.data)] };
    if (opts.id)
        return { code: 0, lines: [formatWorkflowRun(res.data)] };
    const runs = (res.data.runs ?? []);
    return { code: 0, lines: [formatRecentRuns(runs)] };
}
export async function exportFlow(workflowRef, opts, deps) {
    let workflowId;
    try {
        workflowId = await resolveWorkflowId(workflowRef, deps);
    }
    catch (e) {
        return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
    }
    const versionParam = opts.version !== undefined ? `&version=${encodeURIComponent(String(opts.version))}` : "";
    const res = await deps.get(`${EXPORT_PATH}?id=${encodeURIComponent(workflowId)}${versionParam}`);
    if (!res.ok)
        return asErrorResult(res, false);
    const doc = opts.json
        ? JSON.stringify(res.data, null, 2)
        : workflowToYaml(res.data);
    if (opts.out) {
        const text = doc.endsWith("\n") ? doc : `${doc}\n`;
        deps.writeFile(opts.out, text);
        return { code: 0, lines: [`Wrote workflow contract to ${opts.out}.`] };
    }
    return { code: 0, lines: [doc.endsWith("\n") ? doc.slice(0, -1) : doc] };
}
export function parseVersionFlag(flags) {
    const raw = flags["version"];
    if (raw === undefined)
        return undefined;
    if (typeof raw !== "string")
        throw new Error("--version requires a positive integer");
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--version must be a positive integer (got "${raw}")`);
    }
    return n;
}
export async function versionsFlow(workflowRef, opts, deps, channel = getChannel()) {
    let workflowId;
    try {
        workflowId = await resolveWorkflowId(workflowRef, deps);
    }
    catch (e) {
        return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
    }
    const res = await deps.get(`${VERSIONS_PATH}?id=${encodeURIComponent(workflowId)}`);
    const unsupported = missingRouteLine(res, "workflow versions", channel);
    if (unsupported)
        return { code: 1, lines: [unsupported] };
    if (!res.ok)
        return asErrorResult(res, opts.json);
    if (opts.json)
        return { code: 0, lines: [JSON.stringify(res.data)] };
    const body = res.data;
    const versions = Array.isArray(body)
        ? body
        : (body.versions ?? []);
    return { code: 0, lines: [formatWorkflowVersions(versions)] };
}
function buildImportBody(file, opts, deps) {
    let text;
    try {
        text = deps.readFile(file);
    }
    catch {
        return { error: { code: 1, lines: [`Error: file not found: ${file}`] } };
    }
    let parsed;
    try {
        parsed = parseWorkflowText(text);
    }
    catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        const detail = raw.replace(/^workflow file is not valid YAML or JSON:?\s*/, "");
        const suffix = detail ? `: ${detail}` : "";
        return { error: { code: 1, lines: [`Error: ${file} is not valid YAML or JSON${suffix}`] } };
    }
    if (!isRecord(parsed)) {
        return {
            error: {
                code: 1,
                lines: [`Error: ${file} is not a workflow contract (expected a JSON object).`],
            },
        };
    }
    const body = { ...parsed };
    delete body.dryRun;
    delete body.targetWorkflowId;
    delete body.expectedUpdatedAt;
    if (opts.dryRun)
        body.dryRun = true;
    if (opts.update) {
        const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined;
        if (!updatedAt) {
            return {
                error: {
                    code: 1,
                    lines: [
                        `Error: ${file} has no "updatedAt" anchor, so drift can't be detected. ` +
                            `Re-export the workflow first (exodus workflow export <id> --out ${file}) and retry --update.`,
                    ],
                },
            };
        }
        body.targetWorkflowId = opts.update;
        body.expectedUpdatedAt = updatedAt;
    }
    return { body };
}
async function runImport(file, opts, deps) {
    const built = buildImportBody(file, { dryRun: opts.dryRun, update: opts.update }, deps);
    if ("error" in built)
        return built.error;
    const res = await deps.post(IMPORT_PATH, built.body);
    if (!res.ok) {
        return {
            code: 1,
            lines: opts.json
                ? [JSON.stringify({ ok: false, status: res.status, data: res.data })]
                : [formatImportError(res)],
        };
    }
    const data = res.data;
    return {
        code: 0,
        lines: opts.json
            ? [JSON.stringify(data)]
            : [
                formatImportSummary(data, {
                    dryRun: opts.dryRun,
                    update: !!opts.update,
                    validate: opts.validate,
                }),
            ],
    };
}
export function triggerExpect(t) {
    return t.type === "event"
        ? { type: "event", event: t.event }
        : { type: "cron", cron: t.cron };
}
function triggerDetail(t) {
    return t.type === "event" ? t.event : t.cron;
}
const NO_TRIGGERS = "no triggers — add them via `exodus workflow export` / `import`";
export function formatTriggers(triggers) {
    if (triggers.length === 0)
        return NO_TRIGGERS;
    return triggers
        .map((t, i) => {
        const state = t.enabled ? "enabled" : "disabled";
        return `${i + 1} · ${t.type} · ${triggerDetail(t)} · ${state}`;
    })
        .join("\n");
}
function triggerErrorResult(res, verb, json) {
    const missing = missingRouteLine(res, verb);
    if (missing) {
        return {
            code: 1,
            lines: json
                ? [JSON.stringify({ ok: false, status: res.status, error: missing })]
                : [missing],
        };
    }
    return asErrorResult(res, json);
}
async function fetchTriggers(workflowId, deps) {
    const res = await deps.get(`${EXPORT_PATH}?id=${encodeURIComponent(workflowId)}`);
    if (!res.ok)
        return { ok: false, res };
    const triggers = res.data.triggers ?? [];
    return { ok: true, triggers };
}
export async function triggersListFlow(workflowRef, opts, deps) {
    let workflowId;
    try {
        workflowId = await resolveWorkflowId(workflowRef, deps);
    }
    catch (e) {
        return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
    }
    const fetched = await fetchTriggers(workflowId, deps);
    if (!fetched.ok)
        return triggerErrorResult(fetched.res, "workflow triggers", opts.json);
    if (opts.json) {
        return {
            code: 0,
            lines: [JSON.stringify(fetched.triggers.map((t, i) => ({ n: i + 1, ...t })))],
        };
    }
    return { code: 0, lines: [formatTriggers(fetched.triggers)] };
}
function triggerIndexError(message, triggers, json) {
    if (json) {
        return {
            code: 1,
            lines: [JSON.stringify({ ok: false, error: message, triggers: triggers.map((t, i) => ({ n: i + 1, ...t })) })],
        };
    }
    return { code: 1, lines: [message, "", formatTriggers(triggers)] };
}
export async function triggersSetEnabledFlow(workflowRef, n, enabled, opts, deps) {
    const verb = `workflow triggers ${enabled ? "enable" : "disable"}`;
    let workflowId;
    try {
        workflowId = await resolveWorkflowId(workflowRef, deps);
    }
    catch (e) {
        return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
    }
    const fetched = await fetchTriggers(workflowId, deps);
    if (!fetched.ok)
        return triggerErrorResult(fetched.res, verb, opts.json);
    const triggers = fetched.triggers;
    const idx = n - 1;
    if (idx < 0 || idx >= triggers.length) {
        return triggerIndexError(`Trigger ${n} is out of range — this workflow has ${triggers.length} trigger(s).`, triggers, opts.json);
    }
    const res = await deps.post(TRIGGERS_SET_ENABLED_PATH, {
        workflowId,
        triggerIndex: idx,
        enabled,
        expect: triggerExpect(triggers[idx]),
    });
    if (!res.ok)
        return triggerErrorResult(res, verb, opts.json);
    if (opts.json)
        return { code: 0, lines: [JSON.stringify(res.data)] };
    return { code: 0, lines: [`Trigger ${n} ${enabled ? "enabled" : "disabled"}.`] };
}
export async function triggersFireFlow(workflowRef, opts, deps) {
    const verb = "workflow triggers fire";
    let workflowId;
    try {
        workflowId = await resolveWorkflowId(workflowRef, deps);
    }
    catch (e) {
        return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
    }
    const fetched = await fetchTriggers(workflowId, deps);
    if (!fetched.ok)
        return triggerErrorResult(fetched.res, verb, opts.json);
    const triggers = fetched.triggers;
    if (triggers.length === 0) {
        return { code: 1, lines: [`This workflow has no triggers. ${NO_TRIGGERS}`] };
    }
    let idx;
    if (opts.n !== undefined) {
        idx = opts.n - 1;
        if (idx < 0 || idx >= triggers.length) {
            return triggerIndexError(`Trigger ${opts.n} is out of range — this workflow has ${triggers.length} trigger(s).`, triggers, opts.json);
        }
    }
    else if (triggers.length === 1) {
        idx = 0;
    }
    else {
        return triggerIndexError(`This workflow has ${triggers.length} triggers — specify which one to fire (e.g. \`fire 1\`).`, triggers, opts.json);
    }
    const t = triggers[idx];
    const n = idx + 1;
    if (t.type === "event" && (opts.text === undefined || opts.text === "")) {
        return {
            code: 1,
            lines: [
                `Trigger ${n} fires on the "${t.event}" event — pass --text with the input this run should carry.`,
            ],
        };
    }
    if (t.type === "cron" && opts.text !== undefined) {
        return {
            code: 1,
            lines: [`Trigger ${n} is a cron trigger ("${t.cron}") — it takes no --text.`],
        };
    }
    const res = await deps.post(TRIGGERS_FIRE_PATH, {
        workflowId,
        triggerIndex: idx,
        expect: triggerExpect(t),
        ...(opts.text !== undefined ? { text: opts.text } : {}),
    });
    if (!res.ok)
        return triggerErrorResult(res, verb, opts.json);
    const runId = res.data.runId;
    const base = { runId, workflowId };
    if (!opts.wait) {
        if (opts.json)
            return { code: 0, lines: [JSON.stringify(base)] };
        return {
            code: 0,
            lines: [
                `Trigger ${n} fired.`,
                `runId:  ${runId}`,
                "This run executes as the workflow OWNER in the background.",
                `Poll: exodus workflow status --id ${runId}`,
            ],
        };
    }
    const startLines = [
        `Trigger ${n} fired.`,
        `runId:  ${runId}`,
        "This run executes as the workflow OWNER in the background.",
        `Poll: exodus workflow status --id ${runId}`,
    ];
    if (!opts.json && opts.onProgressLine) {
        for (const line of startLines)
            opts.onProgressLine(line);
    }
    const waited = await waitForRun(runId, { json: opts.json, onProgressLine: opts.onProgressLine, jsonBase: base }, deps);
    if (opts.json)
        return waited;
    const prefix = opts.onProgressLine ? [] : startLines;
    return { code: waited.code, lines: [...prefix, ...waited.lines] };
}
export async function importFlow(file, opts, deps) {
    return runImport(file, opts, deps);
}
export async function validateFlow(file, opts, deps) {
    return runImport(file, { dryRun: true, json: opts.json, update: opts.update, validate: true }, deps);
}
export async function templatesListFlow(json, deps) {
    const res = await deps.get(TEMPLATES_PATH);
    if (!res.ok) {
        const missing = missingRouteLine(res, "workflow templates");
        if (missing)
            return { code: 1, lines: [missing] };
        return asErrorResult(res, json);
    }
    const data = res.data;
    if (json)
        return { code: 0, lines: [JSON.stringify(data)] };
    return { code: 0, lines: [formatTemplatesList(data.templates ?? [])] };
}
export async function templatesExportFlow(key, opts, deps) {
    const query = opts.json
        ? `?key=${encodeURIComponent(key)}&format=json`
        : `?key=${encodeURIComponent(key)}`;
    const res = await deps.getText(`${TEMPLATES_PATH}${query}`);
    if (!res.ok) {
        let parsedBody = res.data;
        try {
            parsedBody = JSON.parse(res.data);
        }
        catch {
        }
        const missing = missingRouteLine({ ...res, data: parsedBody }, "workflow templates export");
        if (missing)
            return { code: 1, lines: [missing] };
        return { code: 1, lines: [formatTextError(res)] };
    }
    const doc = res.data;
    if (opts.out) {
        const text = doc.endsWith("\n") ? doc : `${doc}\n`;
        deps.writeFile(opts.out, text);
        return { code: 0, lines: [`Wrote template "${key}" to ${opts.out}.`] };
    }
    return { code: 0, lines: [doc.endsWith("\n") ? doc.slice(0, -1) : doc] };
}
function formatTextError(res) {
    const body = res.data;
    let parsed;
    try {
        parsed = JSON.parse(body);
    }
    catch {
        const snippet = body.replace(/\s+/g, " ").trim().slice(0, 300);
        return formatError({ ok: false, status: res.status, data: snippet || "(empty response)" });
    }
    return formatError({ ok: false, status: res.status, data: parsed });
}
export async function schemaFlow(opts, deps) {
    const res = await deps.get(SCHEMA_PATH);
    if (!res.ok) {
        const missing = missingRouteLine(res, "workflow schema");
        if (missing)
            return { code: 1, lines: [missing] };
        return asErrorResult(res, opts.json);
    }
    if (opts.json)
        return { code: 0, lines: [JSON.stringify(res.data)] };
    const payload = isRecord(res.data) ? res.data : {};
    if (opts.kind !== undefined) {
        return formatSchemaFilter(payload, ["nodeKinds"], "kind", opts.kind);
    }
    if (opts.face !== undefined) {
        return formatSchemaFilter(payload, ["transformFaces"], "face", opts.face);
    }
    return { code: 0, lines: [formatSchema(payload)] };
}
function shortId(id) {
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
export function parkBadge(pauseReason) {
    if (pauseReason === "taste")
        return "gate";
    if (pauseReason === "repair")
        return "repair";
    if (pauseReason === "slots")
        return "slots";
    return "legacy";
}
export function invocationBadge(row) {
    if (row.triggeredBy)
        return `trig:${row.triggeredBy.event ?? row.triggeredBy.type}`;
    if (row.invocationMode === "background")
        return "bg";
    return "";
}
const NO_INBOX = "Nothing waiting on you — the review inbox is empty.";
export function formatInbox(rows, now = Date.now()) {
    if (rows.length === 0)
        return NO_INBOX;
    return table(["run", "workflow", "kind", "node", "via", "age"], rows.map((r) => [
        shortId(r._id),
        r.workflowName || "(unnamed)",
        parkBadge(r.pauseReason),
        r.pausedNodeId ?? "-",
        invocationBadge(r) || "-",
        formatAge(r.createdAt, now),
    ]));
}
export async function inboxFlow(json, deps) {
    const res = await deps.get(INBOX_PATH);
    if (!res.ok)
        return triggerErrorResult(res, "workflow inbox", json);
    const data = res.data;
    const rows = data.runs ?? [];
    return { code: 0, lines: json ? [JSON.stringify(rows)] : [formatInbox(rows)] };
}
function errLine(message, json, status) {
    return {
        code: 1,
        lines: [
            json
                ? JSON.stringify({ ok: false, ...(status ? { status } : {}), error: message })
                : message,
        ],
    };
}
function okLine(message, payload, json) {
    return { code: 0, lines: [json ? JSON.stringify(payload) : message] };
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
function asWorkflowRun(data) {
    return isRecord(data) && typeof data["_id"] === "string"
        ? data
        : undefined;
}
function describePark(run) {
    if (run.status !== "awaiting-review")
        return `status: ${run.status}`;
    switch (run.pauseReason) {
        case "taste":
            return "parked at a gate (taste review)";
        case "repair":
            return "parked for repair";
        case "slots":
            return "parked for slot answers";
        case "call":
            return "parked on a child workflow";
        default:
            return "parked at the cost gate (legacy — no text gate)";
    }
}
const PARK_LABEL = {
    taste: "a gate review",
    repair: "a repair",
    slots: "slot answers",
    call: "a child workflow",
};
async function preflightPark(runId, expected, verb, json, deps) {
    const res = await deps.get(`${STATUS_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!res.ok)
        return { ok: false, result: triggerErrorResult(res, verb, json) };
    const run = asWorkflowRun(res.data);
    if (!run) {
        return { ok: false, result: errLine(`Could not read run ${runId}.`, json) };
    }
    if (run.status !== "awaiting-review" || run.pauseReason !== expected) {
        return {
            ok: false,
            result: errLine(`Run ${runId} is not parked for ${PARK_LABEL[expected]} — it is ${describePark(run)}.`, json),
        };
    }
    return { ok: true, run };
}
function gateCandidates(run) {
    const node = (run.nodes ?? []).find((x) => x.nodeId === run.pausedNodeId);
    if (!node)
        return [];
    const out = [];
    let n = 0;
    (node.outputs ?? []).forEach((a, idx) => {
        if (a.type === "text" && a.port === "selection") {
            n += 1;
            out.push({ n, outputIndex: idx, text: a.text, humanEdited: !!a.humanEdited });
        }
    });
    return out;
}
function formatCandidates(cands) {
    if (cands.length === 0)
        return "  (this gate has no selection candidates)";
    return cands
        .map((c) => `  ${c.n}. ${truncateText(c.text, 200)}${c.humanEdited ? "  (edited)" : ""}`)
        .join("\n");
}
function rangeError(num, count, json) {
    const range = count > 0 ? ` (valid: 1–${count})` : "";
    return errLine(`Candidate ${num} is out of range — this gate has ${count} candidate${count === 1 ? "" : "s"}${range}.`, json);
}
export async function gateShowFlow(runId, opts, deps) {
    const pf = await preflightPark(runId, "taste", "workflow gate", opts.json, deps);
    if (!pf.ok)
        return pf.result;
    const cands = gateCandidates(pf.run);
    if (opts.json) {
        return {
            code: 0,
            lines: [
                JSON.stringify({
                    runId,
                    pausedNodeId: pf.run.pausedNodeId,
                    candidates: cands.map((c) => ({ n: c.n, text: c.text, humanEdited: c.humanEdited })),
                }),
            ],
        };
    }
    return {
        code: 0,
        lines: [
            `Gate — ${pf.run.workflowName}`,
            `runId:      ${runId}`,
            `gate node:  ${pf.run.pausedNodeId ?? "-"}`,
            "",
            `Candidates (${cands.length}):`,
            formatCandidates(cands),
            "",
            `Pick:    exodus workflow gate ${runId} pick 1,2`,
            `Edit:    exodus workflow gate ${runId} edit 1 --text "..."`,
            `Approve: exodus workflow gate ${runId} approve --wait`,
            `Reject:  exodus workflow gate ${runId} reject --reason "..."`,
        ],
    };
}
export async function gatePickFlow(runId, numbers, opts, deps) {
    const pf = await preflightPark(runId, "taste", "workflow gate pick", opts.json, deps);
    if (!pf.ok)
        return pf.result;
    const cands = gateCandidates(pf.run);
    const seen = new Set();
    for (const num of numbers) {
        if (!Number.isInteger(num) || num < 1 || num > cands.length) {
            return rangeError(num, cands.length, opts.json);
        }
        if (seen.has(num))
            return errLine(`Candidate ${num} is listed twice.`, opts.json);
        seen.add(num);
    }
    const selectedIndices = numbers.map((num) => num - 1);
    const res = await deps.post(GATE_PICK_PATH, {
        runId,
        nodeId: pf.run.pausedNodeId,
        selectedIndices,
    });
    if (!res.ok)
        return triggerErrorResult(res, "workflow gate pick", opts.json);
    return okLine(`Picked candidate${numbers.length === 1 ? "" : "s"} ${numbers.join(", ")} at ${pf.run.pausedNodeId}. Approve to resume: exodus workflow gate ${runId} approve --wait`, { ok: true, runId, nodeId: pf.run.pausedNodeId, selectedIndices }, opts.json);
}
export async function gateEditFlow(runId, n, sources, opts, deps) {
    const provided = [sources.text, sources.file, sources.stdin].filter((x) => x !== undefined);
    if (provided.length === 0) {
        return errLine("Provide the replacement text via one of --text, --file <path>, or piped stdin.", opts.json);
    }
    if (provided.length > 1) {
        return errLine("Provide the replacement text via exactly one of --text, --file, or stdin — not several.", opts.json);
    }
    let text;
    if (sources.text !== undefined) {
        text = sources.text;
    }
    else if (sources.file !== undefined) {
        try {
            text = deps.readFile(sources.file);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return errLine(`Could not read file "${sources.file}": ${msg}`, opts.json);
        }
    }
    else {
        text = sources.stdin;
    }
    const pf = await preflightPark(runId, "taste", "workflow gate edit", opts.json, deps);
    if (!pf.ok)
        return pf.result;
    const cands = gateCandidates(pf.run);
    const cand = cands.find((c) => c.n === n);
    if (!cand)
        return rangeError(n, cands.length, opts.json);
    const res = await deps.post(GATE_EDIT_PATH, {
        runId,
        nodeId: pf.run.pausedNodeId,
        outputIndex: cand.outputIndex,
        text,
    });
    if (!res.ok)
        return triggerErrorResult(res, "workflow gate edit", opts.json);
    return okLine(`Edited candidate ${n} at ${pf.run.pausedNodeId}.`, { ok: true, runId, nodeId: pf.run.pausedNodeId, outputIndex: cand.outputIndex }, opts.json);
}
export async function gatePushFlow(runId, message, opts, deps) {
    const pf = await preflightPark(runId, "taste", "workflow gate push", opts.json, deps);
    if (!pf.ok)
        return pf.result;
    const session = (pf.run.sessions ?? []).find((s) => s.nodeId === pf.run.pausedNodeId);
    if (!session)
        return errLine("This gate has no live session — nothing to push to.", opts.json);
    if (!deps.postDashboard) {
        return errLine("gate push is unavailable here (no dashboard client).", opts.json);
    }
    const chat = await deps.postDashboard(CHAT_PATH, { sessionId: session.sessionId, text: message }, { timeoutMs: CHAT_TIMEOUT_MS });
    if (!chat.ok) {
        const err = routeErrorText(chat.data, chat.status);
        return {
            code: 1,
            lines: opts.json
                ? [JSON.stringify({ ok: false, status: chat.status, error: err })]
                : [`exodus workflow gate push: ${err} (HTTP ${chat.status})`],
        };
    }
    const res = await deps.post(GATE_APPEND_PATH, { runId, nodeId: pf.run.pausedNodeId });
    if (!res.ok)
        return triggerErrorResult(res, "workflow gate push", opts.json);
    const after = await preflightPark(runId, "taste", "workflow gate push", opts.json, deps);
    const cands = after.ok ? gateCandidates(after.run) : [];
    const newest = cands[cands.length - 1];
    if (opts.json) {
        return {
            code: 0,
            lines: [
                JSON.stringify({
                    ok: true,
                    runId,
                    nodeId: pf.run.pausedNodeId,
                    candidate: newest ? { n: newest.n, text: newest.text } : null,
                }),
            ],
        };
    }
    const lines = [`Pushed to the gate — banked a new candidate at ${pf.run.pausedNodeId}.`];
    if (newest) {
        lines.push("", `New candidate:`, `  ${newest.n}. ${truncateText(newest.text, 200)}`);
    }
    return { code: 0, lines };
}
export async function gateApproveFlow(runId, opts, deps) {
    const pf = await preflightPark(runId, "taste", "workflow gate approve", opts.json, deps);
    if (!pf.ok)
        return pf.result;
    const res = await deps.post(APPROVE_PATH, { runId });
    if (!res.ok)
        return triggerErrorResult(res, "workflow gate approve", opts.json);
    const triggerRunId = res.data.triggerRunId;
    return resumeAndMaybeWait(runId, triggerRunId, ["Gate approved — the run resumes."], opts, deps);
}
export async function gateRejectFlow(runId, opts, deps) {
    const pf = await preflightPark(runId, "taste", "workflow gate reject", opts.json, deps);
    if (!pf.ok)
        return pf.result;
    const res = await deps.post(CANCEL_PATH, {
        runId,
        ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
    });
    if (!res.ok)
        return triggerErrorResult(res, "workflow gate reject", opts.json);
    return okLine(`Gate rejected — run ${runId} canceled.`, { ok: true, runId }, opts.json);
}
export async function repairFlow(runId, action, opts, deps) {
    const verb = `workflow repair ${action}`;
    const pf = await preflightPark(runId, "repair", verb, opts.json, deps);
    if (!pf.ok)
        return pf.result;
    if (action === "kill") {
        const res = await deps.post(CANCEL_PATH, { runId });
        if (!res.ok)
            return triggerErrorResult(res, verb, opts.json);
        return okLine(`Repair killed — run ${runId} canceled.`, { ok: true, runId }, opts.json);
    }
    const path = action === "retry" ? REPAIR_RETRY_PATH : REPAIR_SKIP_PATH;
    const res = await deps.post(path, { runId });
    if (!res.ok)
        return triggerErrorResult(res, verb, opts.json);
    const triggerRunId = res.data.triggerRunId;
    return resumeAndMaybeWait(runId, triggerRunId, [`Repair ${action} started — the run resumes.`], opts, deps);
}
async function resumeAndMaybeWait(runId, triggerRunId, headline, opts, deps) {
    const base = { runId, triggerRunId };
    const startLines = [
        ...headline,
        `runId:        ${runId}`,
        `triggerRunId: ${triggerRunId ?? "-"}`,
        `Poll: exodus workflow status --id ${runId}`,
    ];
    if (!opts.wait) {
        if (opts.json)
            return { code: 0, lines: [JSON.stringify(base)] };
        return { code: 0, lines: startLines };
    }
    if (!opts.json && opts.onProgressLine) {
        for (const line of startLines)
            opts.onProgressLine(line);
    }
    const waited = await waitForRun(runId, { json: opts.json, onProgressLine: opts.onProgressLine, jsonBase: base }, deps);
    if (opts.json)
        return waited;
    const prefix = opts.onProgressLine ? [] : startLines;
    return { code: waited.code, lines: [...prefix, ...waited.lines] };
}
export function parseSlotFlags(args) {
    const values = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        let raw;
        if (arg === "--slot") {
            raw = args[i + 1];
            i++;
        }
        else if (arg.startsWith("--slot=")) {
            raw = arg.slice("--slot=".length);
        }
        else {
            continue;
        }
        if (!raw)
            throw new Error("--slot requires key=value");
        const eq = raw.indexOf("=");
        if (eq <= 0)
            throw new Error(`--slot must be key=value (got "${raw}")`);
        const key = raw.slice(0, eq).trim();
        if (!key)
            throw new Error(`--slot must include a key (got "${raw}")`);
        values[key] = raw.slice(eq + 1);
    }
    return values;
}
export async function answerFlow(runId, values, opts, deps) {
    const pf = await preflightPark(runId, "slots", "workflow answer", opts.json, deps);
    if (!pf.ok)
        return pf.result;
    const pending = pf.run.pendingSlots ?? [];
    if (Object.keys(values).length === 0) {
        if (opts.json) {
            return { code: 0, lines: [JSON.stringify({ runId, pendingSlots: pending })] };
        }
        const lines = [`Run ${runId} is waiting on ${pending.length} slot answer(s):`];
        for (const s of pending) {
            const label = s.label ? ` — ${s.label}` : "";
            const hint = s.hint ? ` (${s.hint})` : "";
            lines.push(`  ${s.id}${label}${hint}`);
        }
        lines.push("", `Answer: exodus workflow answer ${runId} --slot ${pending[0]?.id ?? "key"}=value`);
        return { code: 0, lines };
    }
    const res = await deps.post(ANSWER_PATH, { runId, values });
    if (!res.ok)
        return triggerErrorResult(res, "workflow answer", opts.json);
    return okLine(`Answered ${Object.keys(values).length} slot(s) for run ${runId} — the child resumes.`, { ok: true, runId, values }, opts.json);
}
function flagString(flags, name) {
    const v = flags[name];
    return typeof v === "string" ? v : undefined;
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
function parsePickNumbers(raw) {
    if (raw === undefined)
        return undefined;
    const parts = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length === 0)
        return undefined;
    const nums = [];
    for (const p of parts) {
        if (!/^\d+$/.test(p))
            return undefined;
        nums.push(Number(p));
    }
    return nums;
}
async function readAllStdin() {
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf-8");
}
async function maybeReadStdin(flags) {
    if (flagString(flags, "text") !== undefined || flagString(flags, "file") !== undefined) {
        return undefined;
    }
    if (process.stdin.isTTY)
        return undefined;
    const raw = await readAllStdin();
    if (raw.length === 0)
        return undefined;
    return raw.endsWith("\n") ? raw.slice(0, -1) : raw;
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
    if (sub === "describe") {
        const workflowRef = rest[0];
        if (!workflowRef) {
            console.error("Error: workflow describe requires <workflowId|name>.");
            console.log("Usage: exodus workflow describe <workflowId|name> [--json]");
            process.exit(1);
        }
        return printResult(await describeFlow(workflowRef, { json }, defaultDeps));
    }
    if (sub === "bots") {
        return printResult(await botsFlow({ category: flagString(flags, "category"), slug: flagString(flags, "slug"), json }, defaultDeps));
    }
    if (sub === "templates") {
        const action = rest[0];
        if (!action || action === "list") {
            return printResult(await templatesListFlow(json, defaultDeps));
        }
        if (action === "export") {
            const key = rest[1];
            if (!key) {
                console.error("Error: workflow templates export requires <key>.");
                console.log("Usage: exodus workflow templates export <key> [--out <file>] [--json]");
                process.exit(1);
            }
            return printResult(await templatesExportFlow(key, { out: flagString(flags, "out"), json }, defaultDeps));
        }
        console.error(`Unknown templates action: "${action}"`);
        console.log("Usage: exodus workflow templates [list] | exodus workflow templates export <key>");
        process.exit(1);
    }
    if (sub === "schema") {
        return printResult(await schemaFlow({ json, kind: flagString(flags, "kind"), face: flagString(flags, "face") }, defaultDeps));
    }
    if (sub === "validate") {
        const file = rest[0];
        if (!file) {
            console.error("Error: workflow validate requires <file>.");
            console.log("Usage: exodus workflow validate <file> [--update <workflowId>] [--json]");
            process.exit(1);
        }
        return printResult(await validateFlow(file, { json, update: flagString(flags, "update") }, defaultDeps));
    }
    if (sub === "run") {
        const workflowRef = rest[0];
        if (!workflowRef) {
            console.error("Error: workflow run requires <workflowId|name>.");
            console.log("Usage: exodus workflow run <workflowId|name> [--input key=value ...] [--wait] [--json]");
            process.exit(1);
        }
        let inputs;
        let terminalNodeIds;
        try {
            inputs = parseInputFlags(process.argv.slice(3), defaultDeps.readFile);
            terminalNodeIds = parseTerminalFlags(process.argv.slice(3));
        }
        catch (e) {
            console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
            process.exit(1);
        }
        return printResult(await runFlow(workflowRef, {
            inputs,
            terminalNodeIds,
            wait: flags["wait"] === true,
            json,
            onProgressLine: (line) => console.log(line),
        }, defaultDeps));
    }
    if (sub === "status") {
        return printResult(await statusFlow({ id: flagString(flags, "id"), json }, defaultDeps));
    }
    if (sub === "versions") {
        const workflowRef = rest[0];
        if (!workflowRef) {
            console.error("Error: workflow versions requires <workflowId|name>.");
            console.log("Usage: exodus workflow versions <workflowId|name> [--json]");
            process.exit(1);
        }
        return printResult(await versionsFlow(workflowRef, { json }, defaultDeps));
    }
    if (sub === "export") {
        const workflowRef = rest[0];
        if (!workflowRef) {
            console.error("Error: workflow export requires <workflowId|name>.");
            console.log("Usage: exodus workflow export <workflowId|name> [--out <file>] [--version <n>]");
            process.exit(1);
        }
        let version;
        try {
            version = parseVersionFlag(flags);
        }
        catch (e) {
            console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
            process.exit(1);
        }
        return printResult(await exportFlow(workflowRef, { out: flagString(flags, "out"), json, version }, defaultDeps));
    }
    if (sub === "import") {
        const file = rest[0];
        if (!file) {
            console.error("Error: workflow import requires <file>.");
            console.log("Usage: exodus workflow import <file> [--update <workflowId>] [--dry-run] [--json]");
            process.exit(1);
        }
        return printResult(await importFlow(file, { dryRun: flags["dry-run"] === true, json, update: flagString(flags, "update") }, defaultDeps));
    }
    if (sub === "inbox") {
        return printResult(await inboxFlow(json, defaultDeps));
    }
    if (sub === "gate") {
        const runId = rest[0];
        if (!runId) {
            console.error("Error: workflow gate requires <runId>.");
            console.log("Usage: exodus workflow gate <runId> [pick <n,..> | edit <n> | push \"msg\" | approve | reject]");
            process.exit(1);
        }
        const action = rest[1];
        if (!action)
            return printResult(await gateShowFlow(runId, { json }, defaultDeps));
        if (action === "pick") {
            const numbers = parsePickNumbers(rest[2]);
            if (!numbers) {
                console.error(`Error: gate pick needs comma-separated 1-based numbers (e.g. \`pick 3,7\`).`);
                process.exit(1);
            }
            return printResult(await gatePickFlow(runId, numbers, { json }, defaultDeps));
        }
        if (action === "edit") {
            const n = parseTriggerIndex(rest[2]);
            if (n === undefined) {
                console.error("Error: gate edit needs a 1-based candidate number <n>.");
                console.log(`Usage: exodus workflow gate <runId> edit <n> [--text "..." | --file <path> | (stdin)]`);
                process.exit(1);
            }
            const stdin = await maybeReadStdin(flags);
            return printResult(await gateEditFlow(runId, n, { text: flagString(flags, "text"), file: flagString(flags, "file"), stdin }, { json }, defaultDeps));
        }
        if (action === "push") {
            const message = rest[2];
            if (!message) {
                console.error('Error: gate push needs a message (e.g. `push "make it punchier"`).');
                process.exit(1);
            }
            return printResult(await gatePushFlow(runId, message, { json }, defaultDeps));
        }
        if (action === "approve") {
            return printResult(await gateApproveFlow(runId, { wait: flags["wait"] === true, json, onProgressLine: (line) => console.log(line) }, defaultDeps));
        }
        if (action === "reject") {
            return printResult(await gateRejectFlow(runId, { reason: flagString(flags, "reason"), json }, defaultDeps));
        }
        console.error(`Error: unknown gate action "${action}" (expected pick, edit, push, approve, or reject).`);
        process.exit(1);
    }
    if (sub === "repair") {
        const runId = rest[0];
        if (!runId) {
            console.error("Error: workflow repair requires <runId>.");
            console.log("Usage: exodus workflow repair <runId> retry|skip|kill [--wait]");
            process.exit(1);
        }
        const action = rest[1];
        if (action !== "retry" && action !== "skip" && action !== "kill") {
            console.error(`Error: workflow repair needs an action (retry, skip, or kill)${action ? ` — got "${action}"` : ""}.`);
            console.log("Usage: exodus workflow repair <runId> retry|skip|kill [--wait]");
            process.exit(1);
        }
        return printResult(await repairFlow(runId, action, { wait: flags["wait"] === true, json, onProgressLine: (line) => console.log(line) }, defaultDeps));
    }
    if (sub === "answer") {
        const runId = rest[0];
        if (!runId) {
            console.error("Error: workflow answer requires <runId>.");
            console.log("Usage: exodus workflow answer <runId> --slot key=value [--slot key=value ...]");
            process.exit(1);
        }
        let values;
        try {
            values = parseSlotFlags(process.argv.slice(3));
        }
        catch (e) {
            console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
            process.exit(1);
        }
        return printResult(await answerFlow(runId, values, { json }, defaultDeps));
    }
    if (sub === "triggers") {
        const workflowRef = rest[0];
        if (!workflowRef) {
            console.error("Error: workflow triggers requires <workflowId|name>.");
            console.log("Usage: exodus workflow triggers <workflowId|name> [enable|disable <n> | fire [<n>]] [--json]");
            process.exit(1);
        }
        const action = rest[1];
        if (!action)
            return printResult(await triggersListFlow(workflowRef, { json }, defaultDeps));
        if (action === "enable" || action === "disable") {
            const n = parseTriggerIndex(rest[2]);
            if (n === undefined) {
                console.error(`Error: workflow triggers ${action} requires a 1-based trigger number <n>.`);
                console.log(`Usage: exodus workflow triggers <workflowId|name> ${action} <n>`);
                process.exit(1);
            }
            return printResult(await triggersSetEnabledFlow(workflowRef, n, action === "enable", { json }, defaultDeps));
        }
        if (action === "fire") {
            let n;
            if (rest[2] !== undefined) {
                n = parseTriggerIndex(rest[2]);
                if (n === undefined) {
                    console.error(`Error: trigger number must be a positive integer (got "${rest[2]}").`);
                    process.exit(1);
                }
            }
            return printResult(await triggersFireFlow(workflowRef, {
                n,
                text: flagString(flags, "text"),
                wait: flags["wait"] === true,
                json,
                onProgressLine: (line) => console.log(line),
            }, defaultDeps));
        }
        console.error(`Error: unknown triggers action "${action}" (expected enable, disable, or fire).`);
        console.log("Usage: exodus workflow triggers <workflowId|name> [enable|disable <n> | fire [<n>]] [--json]");
        process.exit(1);
    }
    console.error(`Unknown subcommand: "${sub}"\n`);
    console.log(helpText);
    process.exit(1);
}
function parseTriggerIndex(raw) {
    if (raw === undefined)
        return undefined;
    if (!/^\d+$/.test(raw))
        return undefined;
    const n = Number(raw);
    return n >= 1 ? n : undefined;
}
