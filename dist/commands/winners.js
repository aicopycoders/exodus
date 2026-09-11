import fs from "node:fs";
import path from "node:path";
import { apiGet, apiPost } from "../lib/client.js";
import { displayRunStatus, formatError, tickerRunStatus } from "../lib/format.js";
import { pollUntilDone } from "../lib/poll.js";
import { accountLine, accountRequiredLines, count as formatCount, dateOrDash, errorCode, } from "../lib/meta-ads.js";
export const helpText = `
exodus winners — Import your own brand's winning ads as generative fuel

Your agent (holding the Meta Ads MCP) assembles a winner-package JSON of
designated ad-account winners; this command pushes it into Exodus. Each
winner lands as a swipe row under an auto-created own-brand entry, enriched
server-side (Ad Library match → scrape, or your pushed media files), and
surfaces in generation selection with its verdict.

Usage:
  exodus winners import <file.json | ->        Push a winner package (- reads stdin)
  exodus winners status <importId>             Re-poll an import later
  exodus winners list                          Winners Exodus already holds
  exodus winners definition [--account act_…]  What THIS brand means by "a winner"

Definition flags:
  --account <id>  Which connected ad account, e.g. act_1234567890. Required
                  only when the brand has more than one connected — a
                  definition read off the wrong account is a wrong answer that
                  looks right.
  --json          Machine-readable JSON output

Import flags:
  --dry-run      Local schema check + server dry-run: reports would-create vs
                 would-update per winner. Zero writes, no media upload.
  --no-wait      Return the importId immediately instead of polling
  --json         Machine-readable JSON output

Notes:
  • Scopes to your active brand's workspace (exodus brand current).
  • \`definition\` reads the answers a human already gave on the dashboard — it
    never writes, and it never shows a machine guess nobody has confirmed. A
    brand with a Meta integration keeps its definition there, not in a local
    file. Its ads read back with \`exodus ads list\`.
  • Requires your Scrape Creators API key (Settings → Keys) — the own-page
    match scrape bills your account.
  • Re-pushing the same file is safe: no duplicate rows, the verdict snapshot
    is replaced wholesale, and previously gap-filled winners that now match
    upgrade in place. Winners absent from a re-push are untouched.
  • assets paths in the package resolve relative to the JSON file's folder.

Examples:
  exodus winners import winners.json
  exodus winners import winners.json --dry-run
  cat winners.json | exodus winners import -
  exodus winners status k97abc...
  exodus winners list
  exodus winners definition
  exodus winners definition --account act_1234567890 --json
`.trim();
export function validatePackageLocally(pkg) {
    const errors = [];
    const warnings = [];
    let winnerCount = 0;
    if (pkg === null || typeof pkg !== "object") {
        return { ok: false, errors: ["package is not a JSON object"], warnings, winnerCount };
    }
    const p = pkg;
    if (p.version !== 1)
        errors.push("version must be 1");
    const source = (p.source ?? {});
    if (typeof source.pageId !== "string" || !source.pageId.trim())
        errors.push("source.pageId is required (the scrape target + own-brand key)");
    if (typeof source.pageName !== "string" || !source.pageName.trim())
        errors.push("source.pageName is required (names the own-brand entry)");
    if (typeof source.adAccountId !== "string" || !source.adAccountId.trim())
        errors.push("source.adAccountId is required");
    if (!Array.isArray(p.winners) || p.winners.length === 0) {
        errors.push("winners array is required and must be non-empty");
        return { ok: errors.length === 0, errors, warnings, winnerCount };
    }
    winnerCount = p.winners.length;
    const seen = new Set();
    p.winners.forEach((raw, i) => {
        const label = `winner #${i + 1}`;
        if (raw === null || typeof raw !== "object") {
            warnings.push(`${label}: not an object — the server will reject it`);
            return;
        }
        const w = raw;
        const id = typeof w.accountAdId === "string" ? w.accountAdId : undefined;
        if (!id)
            warnings.push(`${label}: missing accountAdId`);
        else if (seen.has(id))
            warnings.push(`${label} (${id}): duplicate accountAdId`);
        else
            seen.add(id);
        if (w.format !== "video" && w.format !== "image")
            warnings.push(`${label}${id ? ` (${id})` : ""}: format must be "video" or "image"`);
        const verdict = (w.verdict ?? {});
        if (typeof verdict.sentence !== "string" || !verdict.sentence.trim())
            warnings.push(`${label}${id ? ` (${id})` : ""}: missing verdict.sentence`);
        if ((typeof w.bodyText !== "string" || !w.bodyText.trim()) &&
            (typeof w.headline !== "string" || !w.headline.trim()))
            warnings.push(`${label}${id ? ` (${id})` : ""}: needs bodyText or headline`);
        const assets = (w.assets ?? {});
        const hasPoster = (typeof assets.posterPath === "string" && assets.posterPath.trim()) ||
            (typeof assets.posterStorageId === "string" && assets.posterStorageId.trim());
        if (w.format === "video" && !hasPoster)
            warnings.push(`${label}${id ? ` (${id})` : ""}: video winner has no posterPath — it will show a blank placeholder in the gallery (grab the poster image via ads_get_ad_videos and attach it)`);
    });
    return { ok: errors.length === 0, errors, warnings, winnerCount };
}
export function contentTypeFor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".mp4": "video/mp4",
        ".m4v": "video/mp4",
        ".mov": "video/quicktime",
        ".webm": "video/webm",
    };
    return map[ext] ?? "application/octet-stream";
}
export async function run(flags) {
    const positional = parsePositional();
    const [sub, ...rest] = positional;
    if (sub === "import")
        return runImport(rest, flags);
    if (sub === "status")
        return runStatus(rest, flags);
    if (sub === "list")
        return runList(flags);
    if (sub === "definition")
        return runDefinition(flags);
    if (!sub) {
        console.log(helpText);
        return;
    }
    console.error(`Unknown subcommand: "${sub}"\n`);
    console.log(helpText);
    process.exit(1);
}
export const VALUE_FLAGS = new Set(["account"]);
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
async function runImport(positional, flags) {
    const json = !!flags["json"];
    const dryRun = !!flags["dry-run"] || !!flags["dryRun"];
    const noWait = flags["wait"] === false || flags["no-wait"] === true;
    const fileArg = positional[0];
    if (!fileArg) {
        console.error("Error: a package file is required (or - for stdin)");
        console.log("Usage: exodus winners import <file.json | ->");
        process.exit(1);
    }
    let rawText;
    let baseDir;
    if (fileArg === "-") {
        rawText = fs.readFileSync(0, "utf-8");
        baseDir = process.cwd();
    }
    else {
        if (!fs.existsSync(fileArg)) {
            console.error(`Error: file not found: ${fileArg}`);
            process.exit(1);
        }
        rawText = fs.readFileSync(fileArg, "utf-8");
        baseDir = path.dirname(path.resolve(fileArg));
    }
    let pkg;
    try {
        pkg = JSON.parse(rawText);
    }
    catch (err) {
        console.error(`Error: package is not valid JSON: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
    }
    const validation = validatePackageLocally(pkg);
    if (!validation.ok) {
        if (json) {
            console.log(JSON.stringify({ ok: false, errors: validation.errors }));
        }
        else {
            console.error("Package failed local validation:");
            for (const e of validation.errors)
                console.error(`  • ${e}`);
        }
        process.exit(1);
    }
    if (!json) {
        for (const w of validation.warnings)
            console.error(`Warning: ${w}`);
    }
    const winners = (pkg.winners ?? []).filter((w) => w !== null && typeof w === "object");
    const missingFiles = [];
    for (const w of winners) {
        const assets = (w.assets ?? {});
        for (const key of ["imagePath", "videoPath", "posterPath"]) {
            const p = assets[key];
            if (typeof p === "string" && p.trim() && !fs.existsSync(path.resolve(baseDir, p))) {
                missingFiles.push(p);
            }
        }
    }
    if (!dryRun && missingFiles.length > 0) {
        console.error("Error: referenced asset file(s) not found:");
        for (const f of missingFiles)
            console.error(`  • ${f}`);
        process.exit(1);
    }
    if (dryRun) {
        const res = await apiPost("/api/v2/winners", {
            ...pkg,
            dryRun: true,
        });
        if (!res.ok) {
            if (json)
                console.log(JSON.stringify({ ok: false, status: res.status, data: res.data }));
            else
                console.log(formatError(res));
            process.exit(1);
        }
        if (json) {
            console.log(JSON.stringify({ ok: true, ...res.data, localWarnings: validation.warnings }));
            return;
        }
        const per = res.data.perWinner ?? [];
        const creates = per.filter((p) => p.action === "create").length;
        const updates = per.filter((p) => p.action === "update").length;
        console.log("Dry run — no writes, no Trigger fire, no media upload.");
        console.log(res.data.wouldCreateBrand
            ? "  own-brand entry: would be created"
            : `  own-brand entry: exists (${res.data.brandName ?? "?"})`);
        console.log(`  winners: ${creates} would-create, ${updates} would-update`);
        for (const p of per)
            console.log(`    ${p.accountAdId}  ${p.action}`);
        for (const r of res.data.rejected ?? []) {
            console.log(`    ${r.accountAdId}  would-reject (${r.reason})`);
        }
        if (res.data.scrapecreatorsKey === "missing") {
            console.log("\nHeads up: no Scrape Creators key on your account — a real import will fail.");
            console.log("Add it in Settings → Keys (get one at scrapecreators.com).");
        }
        return;
    }
    for (const w of winners) {
        const assets = (w.assets ?? {});
        const swapped = {};
        const pairs = [
            ["imagePath", "imageStorageId"],
            ["videoPath", "videoStorageId"],
            ["posterPath", "posterStorageId"],
        ];
        for (const [, idKey] of pairs) {
            const existing = assets[idKey];
            if (typeof existing === "string" && existing.trim())
                swapped[idKey] = existing;
        }
        for (const [pathKey, idKey] of pairs) {
            const rel = assets[pathKey];
            if (typeof rel !== "string" || !rel.trim())
                continue;
            const abs = path.resolve(baseDir, rel);
            const storageId = await uploadAsset(abs, json);
            if (!storageId)
                process.exit(1);
            swapped[idKey] = storageId;
        }
        if (Object.keys(swapped).length > 0) {
            w.assets = swapped;
        }
        else {
            delete w.assets;
        }
    }
    const res = await apiPost("/api/v2/winners", pkg);
    if (!res.ok || !res.data.importId) {
        if (json)
            console.log(JSON.stringify({ ok: false, status: res.status, data: res.data }));
        else
            console.log(formatError(res));
        process.exit(1);
    }
    const importId = res.data.importId;
    if (noWait) {
        if (json) {
            console.log(JSON.stringify({ ok: true, importId, triggerRunId: res.data.triggerRunId, accepted: res.data.accepted, rejected: res.data.rejected }));
            return;
        }
        console.log(`Import started: ${importId}`);
        console.log(`  accepted: ${res.data.accepted ?? "?"} winner(s)`);
        for (const r of res.data.rejected ?? []) {
            console.log(`  rejected: ${r.accountAdId} (${r.reason})`);
        }
        console.log(`\nPoll: exodus winners status ${importId}`);
        return;
    }
    if (!json) {
        console.log(`Import started: ${importId} — waiting for outcomes…`);
    }
    let lastStatus = "";
    const poll = await pollUntilDone({
        path: `/api/v2/winners/imports/${importId}`,
        terminalStatuses: ["done"],
        onProgress: (data) => {
            const status = typeof data.status === "string" ? data.status : "";
            if (!json && status && status !== lastStatus) {
                lastStatus = status;
                console.log(`  status: ${tickerRunStatus(status)}`);
            }
        },
    });
    const outcome = poll.data;
    if (json) {
        console.log(JSON.stringify({ ok: poll.ok, timedOut: poll.timedOut, ...outcome }));
        if (!poll.ok)
            process.exit(1);
        return;
    }
    if (poll.timedOut) {
        console.log(`Timed out waiting. Re-poll: exodus winners status ${importId}`);
        process.exit(1);
    }
    printOutcomeTable(outcome);
    if (!poll.ok)
        process.exit(1);
}
async function uploadAsset(absPath, json) {
    const upRes = await apiPost("/api/v2/winners/upload-url", {});
    if (!upRes.ok || !upRes.data.uploadUrl) {
        if (json)
            console.log(JSON.stringify({ ok: false, step: "upload-url", data: upRes.data }));
        else
            console.log(formatError(upRes));
        return null;
    }
    const bytes = fs.readFileSync(absPath);
    const put = await fetch(upRes.data.uploadUrl, {
        method: "POST",
        headers: { "Content-Type": contentTypeFor(absPath) },
        body: new Blob([bytes]),
    });
    if (!put.ok) {
        const text = await put.text().catch(() => "(unreadable)");
        if (json)
            console.log(JSON.stringify({ ok: false, step: "upload", status: put.status }));
        else
            console.error(`Error uploading ${path.basename(absPath)}: ${put.status} ${text.slice(0, 200)}`);
        return null;
    }
    const { storageId } = (await put.json());
    if (!storageId) {
        console.error(`Error: no storageId returned for ${path.basename(absPath)}`);
        return null;
    }
    if (!json)
        console.log(`  uploaded ${path.basename(absPath)}`);
    return storageId;
}
function printOutcomeTable(data) {
    const winners = data.winners ?? [];
    console.log(`\nImport ${data.importId ?? "?"}: ${displayRunStatus(data.status, "?")}`);
    if (data.error)
        console.log(`  error: ${data.error}`);
    const created = winners.filter((w) => w.created === true).length;
    const updated = winners.filter((w) => w.created === false).length;
    console.log(`  ${winners.length} winner(s): ${created} created, ${updated} updated`);
    for (const w of winners) {
        let detail = "";
        if (w.outcome === "partial" && w.missing?.length)
            detail = ` (missing: ${w.missing.join(", ")})`;
        if (w.outcome === "rejected" && w.reason)
            detail = ` (${w.reason})`;
        console.log(`    ${w.accountAdId}  ${w.outcome}${detail}`);
    }
}
async function runStatus(positional, flags) {
    const importId = positional[0];
    if (!importId) {
        console.error("Error: importId is required");
        console.log("Usage: exodus winners status <importId>");
        process.exit(1);
    }
    const json = !!flags["json"];
    const res = await apiGet(`/api/v2/winners/imports/${encodeURIComponent(importId)}`);
    if (!res.ok) {
        if (json)
            console.log(JSON.stringify({ ok: false, status: res.status, data: res.data }));
        else
            console.log(formatError(res));
        process.exit(1);
    }
    if (json) {
        console.log(JSON.stringify({ ok: true, ...res.data }));
        return;
    }
    printOutcomeTable(res.data);
}
async function runList(flags) {
    const json = !!flags["json"];
    const res = await apiGet("/api/v2/winners");
    if (!res.ok) {
        if (json)
            console.log(JSON.stringify({ ok: false, status: res.status, data: res.data }));
        else
            console.log(formatError(res));
        process.exit(1);
    }
    const winners = res.data.winners ?? [];
    if (json) {
        console.log(JSON.stringify({ ok: true, winners }));
        return;
    }
    if (winners.length === 0) {
        console.log("No imported winners yet. Push some: exodus winners import <file.json>");
        return;
    }
    console.log(`Winners (${winners.length}):`);
    for (const w of winners) {
        const status = w.enrichmentStatus === "partial"
            ? `partial${w.enrichmentMissing?.length ? ` (missing: ${w.enrichmentMissing.join(", ")})` : ""}`
            : (w.enrichmentStatus ?? "?");
        const when = w.designatedAt ? new Date(w.designatedAt).toLocaleDateString() : "?";
        console.log(`  ${w.sourceAdId ?? w.id}  [${w.format}]  ${status}  designated=${when}`);
        console.log(`    ${w.verdictSentence}`);
    }
}
const RULE_VARIANTS = {
    standard: "standard — the smallest set of creatives that together carry most of a result group's results",
    efficiency: "efficiency — the creatives with the best cost per result in each group",
    "ignore-campaigns": "standard, with some campaigns deliberately left out of the count",
    other: "written out in the brand's own words (below)",
};
export function roleTally(map) {
    const entries = map && typeof map === "object" ? Object.values(map) : [];
    const counts = new Map();
    for (const role of entries) {
        if (typeof role !== "string" || !role.trim())
            continue;
        const key = role.trim();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const order = ["testing", "scaling", "other"];
    const parts = [...counts.entries()]
        .sort((a, b) => {
        const ai = order.indexOf(a[0]);
        const bi = order.indexOf(b[0]);
        return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
    })
        .map(([role, n]) => `${n} ${role}`);
    return { total: entries.length, line: parts.join(" · ") || "none confirmed yet" };
}
export function sharePercent(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
        return "—";
    const pct = value <= 1 ? value * 100 : value;
    return `${Math.round(pct)}%`;
}
export function summaryLines(summary) {
    if (!summary) {
        return ["Last run", "  (the rule has not been run over this account yet)"];
    }
    const lines = [`Last run — ${dateOrDash(summary.computedAt)}`];
    lines.push(`  ${formatCount(summary.instanceCount)} ad instances → ${formatCount(summary.creativeCount)} distinct creatives · ${formatCount(summary.winnerCount)} winners`);
    const groups = Array.isArray(summary.groups) ? summary.groups : [];
    for (const group of groups) {
        const label = group.resultLabel?.trim() || group.objective?.trim() || "(unlabelled group)";
        lines.push(`  ${label}: ${formatCount(group.winnerCount)} of ${formatCount(group.creativeCount)} creatives carry ${sharePercent(group.winnerShare)} of ${formatCount(group.totalResults)} results (${formatCount(group.videoWinners)} video / ${formatCount(group.imageWinners)} image)`);
        if (group.flatCurve) {
            lines.push("    flat curve — results spread evenly, so there is no clean winner set here; treat these as top contributors, not outliers.");
        }
    }
    if (typeof summary.ignoredCampaignCount === "number" && summary.ignoredCampaignCount > 0) {
        lines.push(`  ${summary.ignoredCampaignCount} campaign(s) were left out of the count.`);
    }
    return lines;
}
export function formatDefinition(data) {
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const account = data.account ?? null;
    const definition = data.definition ?? null;
    if (!account) {
        if (accounts.length === 0) {
            return [
                "No Meta ad account is connected to this brand.",
                "Connect one on the dashboard (Settings → Meta) — then the daily sync fills in the ads and this definition.",
            ];
        }
        const lines = ["Pick which ad account you mean:", ...accounts.map(accountLine)];
        const first = accounts[0]?.accountId;
        if (first) {
            lines.push("");
            lines.push(`  exodus winners definition --account ${first}`);
        }
        return lines;
    }
    const label = account.name?.trim()
        ? `${account.name.trim()} (${account.accountId ?? "?"})`
        : String(account.accountId ?? "?");
    if (!definition) {
        return [
            `No winner definition for ${label} yet.`,
            "Someone has to say what a winner means for this account before the rule can run — that happens on the dashboard (Settings → Meta → winner setup).",
        ];
    }
    const lines = [];
    lines.push(`Winner definition — ${label}`);
    lines.push(`  setup:      ${definition.setupCompletedAt ? `confirmed ${dateOrDash(definition.setupCompletedAt)}` : "not finished yet"}`);
    const variant = definition.ruleVariant?.trim() ?? "";
    lines.push(`  rule:       ${RULE_VARIANTS[variant] ?? (variant || "—")}`);
    const defaults = definition.defaults ?? {};
    lines.push(`  dials:      window ${defaults.window ?? "—"} · results floor ${formatCount(defaults.resultsFloor)} · contribution line ${sharePercent(defaults.contributionLine)}`);
    const roles = roleTally(definition.campaignRoleMap);
    lines.push(`  campaigns:  ${roles.total} with a confirmed role — ${roles.line}`);
    const ignored = Array.isArray(definition.ignoredCampaignIds) ? definition.ignoredCampaignIds : [];
    if (ignored.length > 0) {
        lines.push(`  ignored:    ${ignored.length} campaign(s) left out of the rule`);
    }
    if (definition.lastAppliedAt) {
        lines.push(`  last run:   ${dateOrDash(definition.lastAppliedAt)}`);
    }
    if (definition.otherDefinition?.trim()) {
        lines.push("");
        lines.push("In the brand's own words");
        for (const line of definition.otherDefinition.trim().split("\n"))
            lines.push(`  ${line}`);
    }
    lines.push("");
    lines.push(...summaryLines(definition.summary));
    if (accounts.length > 1) {
        lines.push("");
        lines.push(`This brand has ${accounts.length} connected accounts — each keeps its own definition (--account).`);
    }
    return lines;
}
async function runDefinition(flags) {
    const json = !!flags["json"];
    const accountRaw = flags["account"];
    if (accountRaw !== undefined && (typeof accountRaw !== "string" || !accountRaw.trim())) {
        console.error("Error: --account needs an ad account id, e.g. act_1234567890");
        console.log("Usage: exodus winners definition [--account act_…] [--json]");
        process.exit(1);
    }
    const account = typeof accountRaw === "string" ? accountRaw.trim() : undefined;
    const query = account ? `?account=${encodeURIComponent(account)}` : "";
    const res = await apiGet(`/api/v2/winners/definition${query}`);
    if (!res.ok) {
        if (json) {
            console.log(JSON.stringify({ ok: false, status: res.status, data: res.data }));
            process.exit(1);
        }
        if (res.status === 400 && errorCode(res.data) === "ACCOUNT_REQUIRED") {
            for (const line of accountRequiredLines(res, (id) => `exodus winners definition --account ${id}`)) {
                console.log(line);
            }
            process.exit(1);
        }
        console.log(formatError(res));
        process.exit(1);
    }
    if (json) {
        console.log(JSON.stringify({ ok: true, ...res.data }));
        return;
    }
    for (const line of formatDefinition(res.data))
        console.log(line);
}
