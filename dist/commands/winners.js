import fs from "node:fs";
import path from "node:path";
import { apiGet, apiPost } from "../lib/client.js";
import { formatError } from "../lib/format.js";
import { pollUntilDone } from "../lib/poll.js";
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

Import flags:
  --dry-run      Local schema check + server dry-run: reports would-create vs
                 would-update per winner. Zero writes, no media upload.
  --no-wait      Return the importId immediately instead of polling
  --json         Machine-readable JSON output

Notes:
  • Scopes to your active brand's workspace (exodus brand current).
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
    if (!sub) {
        console.log(helpText);
        return;
    }
    console.error(`Unknown subcommand: "${sub}"\n`);
    console.log(helpText);
    process.exit(1);
}
function parsePositional() {
    return process.argv.slice(3).filter((a) => !a.startsWith("--"));
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
                console.log(`  status: ${status}`);
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
    console.log(`\nImport ${data.importId ?? "?"}: ${data.status ?? "?"}`);
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
