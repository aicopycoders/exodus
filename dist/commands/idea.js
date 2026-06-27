import { apiGet, apiPost } from "../lib/client.js";
import { formatError } from "../lib/format.js";
import { formatCcCommand } from "../lib/cc-command.js";
import { captureReelAndWrite } from "../lib/reel-write.js";
export const helpText = `
exodus idea — capture, curate, and write from your brand-agnostic Idea Bank

The Idea Bank holds formed ideas (a hook + a short concept) you can curate and
escalate to the Genesis writer. Capture ideas three ways, add one directly, or
write from the ones you like.

Usage:
  exodus idea gambit "<brain-dump>"       Split a freeform dump into discrete ideas
  exodus idea organic "<url> ..." [--write]   Pull one idea from each reel (--write: bank AND write now)
  exodus idea swipe [--limit n]           Extract concepts from your saved swipe library
  exodus idea add "<hook>" [--desc "<concept>"] [--source gambit|organic|swipe] [--ref "<x>"] [--notes "<x>"]
  exodus idea list [--source ..] [--since YYYY-MM-DD] [--status raw|writing|written|archived] [--limit n]
  exodus idea note <KEY> "<notes>"        Attach persistent steering to an idea
  exodus idea edit <KEY> "<new concept>"  Edit an idea's description
  exodus idea write <KEYS> [--awareness <level>] [--passes n]   Fire-and-forget; one run per key (default 1 pass = 2 variants)
  exodus idea rm <KEY> [--hard]           Archive (or hard-delete with --hard)

Examples:
  exodus idea gambit "joint pain at 40, sleep angle, grounding vs pills"
  exodus idea organic "https://www.instagram.com/reel/abc https://www.tiktok.com/@x/video/123"
  exodus idea organic "https://www.instagram.com/reel/abc" --write --awareness solution-aware
  exodus idea swipe --limit 10
  exodus idea list --source gambit --status raw
  exodus idea write G1,S4 --awareness solution-aware
`.trim();
const SOURCES = ["gambit", "organic", "swipe"];
const KEY_RE = /^[GOSgos]\d+$/;
export function parseKeys(raw) {
    const parts = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length === 0)
        return null;
    for (const p of parts)
        if (!KEY_RE.test(p))
            return null;
    return parts.map((p) => p.toUpperCase());
}
function str(flag) {
    return typeof flag === "string" && flag.trim() ? flag.trim() : undefined;
}
function resolveVariantCount(flags) {
    const variantsRaw = str(flags["variants"]);
    if (variantsRaw) {
        const n = parseInt(variantsRaw, 10);
        return Number.isNaN(n) ? 2 : Math.max(1, Math.min(10, n));
    }
    const passesRaw = str(flags["passes"]);
    let passes = 1;
    if (passesRaw) {
        const p = parseInt(passesRaw, 10);
        passes = Number.isNaN(p) ? 1 : Math.max(1, Math.min(5, p));
    }
    return passes * 2;
}
export function resolveIdeaAction(positionals, flags) {
    const sub = positionals[0];
    if (sub === "add") {
        const hook = positionals[1];
        if (!hook)
            return { kind: "error", message: 'add needs a hook: exodus idea add "<hook>"' };
        const sourceRaw = str(flags["source"]) ?? "gambit";
        if (!SOURCES.includes(sourceRaw)) {
            return { kind: "error", message: `--source must be one of: ${SOURCES.join(", ")}` };
        }
        return {
            kind: "add",
            hook,
            description: str(flags["desc"]) ?? hook,
            source: sourceRaw,
            sourceRef: str(flags["ref"]),
            notes: str(flags["notes"]),
        };
    }
    if (sub === "list") {
        const sourceRaw = str(flags["source"]);
        if (sourceRaw && !SOURCES.includes(sourceRaw)) {
            return { kind: "error", message: `--source must be one of: ${SOURCES.join(", ")}` };
        }
        const limitRaw = str(flags["limit"]);
        return {
            kind: "list",
            source: sourceRaw,
            since: str(flags["since"]),
            status: str(flags["status"]),
            limit: limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 50) : undefined,
        };
    }
    if (sub === "note") {
        const key = positionals[1];
        const notes = positionals[2];
        if (!key || !notes)
            return { kind: "error", message: 'note needs a key + text: exodus idea note G1 "..."' };
        if (!KEY_RE.test(key))
            return { kind: "error", message: `Bad key "${key}"` };
        return { kind: "note", key: key.toUpperCase(), notes };
    }
    if (sub === "edit") {
        const key = positionals[1];
        const description = positionals[2];
        if (!key || !description)
            return { kind: "error", message: 'edit needs a key + concept: exodus idea edit G1 "..."' };
        if (!KEY_RE.test(key))
            return { kind: "error", message: `Bad key "${key}"` };
        return { kind: "edit", key: key.toUpperCase(), description };
    }
    if (sub === "write") {
        const keys = positionals[1] ? parseKeys(positionals[1]) : null;
        if (!keys)
            return { kind: "error", message: 'write needs keys: exodus idea write G1,S4' };
        return {
            kind: "write",
            keys,
            awarenessLevel: str(flags["awareness"]) ?? "problem-aware",
            variantCount: resolveVariantCount(flags),
        };
    }
    if (sub === "rm") {
        const key = positionals[1];
        if (!key || !KEY_RE.test(key))
            return { kind: "error", message: 'rm needs a key: exodus idea rm G1' };
        return { kind: "rm", key: key.toUpperCase(), hard: flags["hard"] === true };
    }
    if (sub === "gambit") {
        const dump = positionals.slice(1).join(" ").trim();
        if (!dump)
            return { kind: "error", message: 'gambit needs a brain-dump: exodus idea gambit "<text>"' };
        return { kind: "gambit", dump };
    }
    if (sub === "organic") {
        const urls = positionals.slice(1).join(" ").split(/\s+/).map((u) => u.trim()).filter(Boolean);
        if (urls.length === 0)
            return { kind: "error", message: 'organic needs at least one URL: exodus idea organic "<url> <url>"' };
        return {
            kind: "organic",
            urls,
            write: flags["write"] === true,
            awarenessLevel: str(flags["awareness"]) ?? "problem-aware",
            variantCount: resolveVariantCount(flags),
        };
    }
    if (sub === "swipe") {
        const limitRaw = str(flags["limit"]);
        if (limitRaw !== undefined) {
            const n = parseInt(limitRaw, 10);
            if (!Number.isInteger(n) || n < 1) {
                return { kind: "error", message: "--limit must be a positive integer" };
            }
            return { kind: "swipe", limit: n };
        }
        return { kind: "swipe", limit: undefined };
    }
    return {
        kind: "error",
        message: 'Unknown subcommand. Use: gambit | organic | swipe | add | list | note | edit | write | rm.',
    };
}
function parsePositional() {
    const args = process.argv.slice(3);
    const out = [];
    let i = 0;
    while (i < args.length) {
        const a = args[i];
        if (a.startsWith("--")) {
            const next = args[i + 1];
            i += next !== undefined && !next.startsWith("--") ? 2 : 1;
            continue;
        }
        out.push(a);
        i++;
    }
    return out;
}
function renderList(ideas) {
    if (ideas.length === 0) {
        console.log("Idea Bank is empty.");
        console.log('Add one:  exodus idea add "<hook>" --desc "<concept>"');
        return;
    }
    console.log(`## Idea Bank (${ideas.length})`);
    console.log("");
    for (const i of ideas) {
        const date = i.createdAt ? i.createdAt.slice(0, 10) : "";
        console.log(`  ${i.key ?? "?"}  [${i.source ?? "?"}] ${i.hook ?? ""}`);
        if (i.description)
            console.log(`      ${i.description}`);
        const meta = [i.status ?? "raw", date].filter(Boolean).join(" · ");
        console.log(`      (${meta})`);
        if (i.notes)
            console.log(`      notes: ${i.notes}`);
        if (i.outputDocUrl)
            console.log(`      doc: ${i.outputDocUrl}`);
    }
    console.log("");
    console.log("Write from some:  exodus idea write G1,S4");
}
export async function run(flags) {
    const cc = formatCcCommand(process.argv.slice(2));
    const action = resolveIdeaAction(parsePositional(), flags);
    switch (action.kind) {
        case "error":
            console.error(`Error: ${action.message}`);
            process.exit(1);
            return;
        case "gambit": {
            const res = await apiPost("/api/v2/idea-bank/ideate", { source: "gambit", input: action.dump }, { ccCommand: cc });
            if (!res.ok) {
                console.log(formatError(res));
                process.exit(1);
            }
            console.log("Splitting your dump into ideas — fire-and-forget.");
            console.log("They'll appear in the bank as the run completes:  exodus idea list --source gambit");
            return;
        }
        case "organic": {
            if (action.write) {
                console.log(`Transcribing ${action.urls.length} reel(s) → ideas → Genesis…`);
                const result = await captureReelAndWrite(action.urls, { awarenessLevel: action.awarenessLevel, variantCount: action.variantCount }, { cc });
                for (const f of result.bankedFailed) {
                    console.error(`  ✗ couldn't pull an idea from ${f} (private, region-locked, or no transcript?)`);
                }
                if (result.dispatched.length === 0) {
                    console.error("No reel produced a usable idea — nothing written.");
                    process.exit(1);
                }
                for (const d of result.dispatched)
                    console.log(`  ✓ banked ${d.key} → Genesis run ${d.runId}`);
                console.log("");
                console.log("Track them:  exodus idea list   (status flips to 'written' with a doc link)");
                return;
            }
            const res = await apiPost("/api/v2/idea-bank/ideate", { source: "organic", urls: action.urls }, { ccCommand: cc });
            if (!res.ok) {
                console.log(formatError(res));
                process.exit(1);
            }
            console.log(`Pulling ideas from ${action.urls.length} link(s) — fire-and-forget.`);
            console.log("They'll appear in the bank as the run completes:  exodus idea list --source organic");
            return;
        }
        case "swipe": {
            const res = await apiPost("/api/v2/idea-bank/ideate", { source: "swipe", limit: action.limit }, { ccCommand: cc });
            if (!res.ok) {
                console.log(formatError(res));
                process.exit(1);
            }
            console.log("Extracting concepts from your saved swipes — fire-and-forget.");
            console.log("They'll appear in the bank as the run completes:  exodus idea list --source swipe");
            return;
        }
        case "add": {
            const res = await apiPost("/api/v2/idea-bank", {
                source: action.source,
                hook: action.hook,
                description: action.description,
                sourceRef: action.sourceRef,
                notes: action.notes,
            }, { ccCommand: cc });
            if (!res.ok) {
                console.log(formatError(res));
                process.exit(1);
            }
            console.log(`Banked ${res.data.key ?? "(idea)"}: ${action.hook}`);
            return;
        }
        case "list": {
            const params = new URLSearchParams();
            if (action.source)
                params.set("source", action.source);
            if (action.since)
                params.set("since", action.since);
            if (action.status)
                params.set("status", action.status);
            if (action.limit)
                params.set("limit", String(action.limit));
            const qs = params.toString();
            const res = await apiGet(`/api/v2/idea-bank${qs ? `?${qs}` : ""}`);
            if (!res.ok) {
                console.log(formatError(res));
                process.exit(1);
            }
            renderList(Array.isArray(res.data.ideas) ? res.data.ideas : []);
            return;
        }
        case "note": {
            const res = await apiPost("/api/v2/idea-bank/notes", { key: action.key, notes: action.notes }, { ccCommand: cc });
            if (!res.ok) {
                console.log(formatError(res));
                process.exit(1);
            }
            console.log(`Notes set on ${action.key}.`);
            return;
        }
        case "edit": {
            const res = await apiPost("/api/v2/idea-bank/update", { key: action.key, description: action.description }, { ccCommand: cc });
            if (!res.ok) {
                console.log(formatError(res));
                process.exit(1);
            }
            console.log(`Updated ${action.key}.`);
            return;
        }
        case "write": {
            const res = await apiPost("/api/v2/idea-bank/dispatch", { keys: action.keys, awarenessLevel: action.awarenessLevel, variantCount: action.variantCount }, { ccCommand: cc });
            if (!res.ok) {
                console.log(formatError(res));
                process.exit(1);
            }
            const dispatched = res.data.dispatched ?? [];
            const skipped = res.data.skipped ?? [];
            console.log(`Dispatched ${dispatched.length} run(s) — fire-and-forget.`);
            for (const d of dispatched)
                console.log(`  ${d.key} → run ${d.runId}`);
            for (const s of skipped)
                console.log(`  skipped ${s.key}: ${s.reason}`);
            console.log("");
            console.log("Track them:  exodus idea list   (status flips to 'written' with a doc link)");
            return;
        }
        case "rm": {
            const res = await apiPost("/api/v2/idea-bank/delete", { key: action.key, hard: action.hard }, { ccCommand: cc });
            if (!res.ok) {
                console.log(formatError(res));
                process.exit(1);
            }
            console.log(`${action.hard ? "Deleted" : "Archived"} ${action.key}.`);
            return;
        }
    }
}
