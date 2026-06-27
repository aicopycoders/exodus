import { apiGet, apiPost, getDashboardUrl } from "../lib/client.js";
import { formatError } from "../lib/format.js";
export const helpText = `
exodus creative — Creative-suite engines (native, copy-derived, ref-match)

Usage:
  exodus creative native --ad "<text>" [options]
  exodus creative copy-derived --ad "<text>" [options]
  exodus creative ref-match --refs <id,id,...> [--subject "<text>"] [--objects <id,id>] [options]
  exodus creative status --id <runId>

Shared options (kickoffs):
  --variations N            Renders to generate (default: engine-specific)
  --aspect 1:1|4:5|9:16     Image aspect ratio (default: 1:1)
  --name "<label>"          Custom run name (otherwise auto-generated)
  --ad-group <id>           Attach to an existing ad-group

ref-match additional options:
  --refs <id,id,...>        Required: comma-separated creativeSuiteImages ids
  --subject "<text>"        Optional subject hint
  --objects <id,id,...>     Optional object overlay image ids

Examples:
  exodus creative native --ad "grounding sheets reduce inflammation" --variations 10
  exodus creative copy-derived --ad "..." --aspect 9:16
  exodus creative ref-match --refs k57abc123,k57def456 --subject "morning routine"
  exodus creative status --id rd72e9ybakhwj0v8qkk39yntd586thbw

Note: status polling reads /api/creative-suite/runs/[id] and returns the live
run row including imageCount + isTerminal. The dashboard renders the same
data realtime via Convex subscriptions if you'd rather watch there.
`.trim();
function flagString(flags, name) {
    const v = flags[name];
    return typeof v === "string" ? v : undefined;
}
function flagInt(flags, name) {
    const v = flags[name];
    if (typeof v !== "string")
        return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
}
async function resolveWorkspace() {
    const who = await apiGet("/api/v2/whoami");
    if (!who.ok || !who.data.workspaceId) {
        console.error("Error: whoami failed. Check EXODUS_API_KEY and EXODUS_API_URL/CONVEX_SITE_URL.");
        console.error(formatError(who));
        process.exit(1);
        throw new Error("unreachable");
    }
    return { workspaceId: who.data.workspaceId, slug: who.data.workspaceSlug ?? who.data.workspaceId };
}
function validateAspect(value) {
    const aspect = value ?? "1:1";
    if (aspect !== "1:1" && aspect !== "4:5" && aspect !== "9:16") {
        console.error(`Error: --aspect must be 1:1 | 4:5 | 9:16 (got "${aspect}").`);
        process.exit(1);
        throw new Error("unreachable");
    }
    return aspect;
}
async function runTextEngine(engine, flags) {
    const adText = flagString(flags, "ad");
    if (!adText || adText.trim().length < 3) {
        console.error(`Error: creative ${engine} requires --ad "<text>" (min 3 chars).`);
        process.exit(1);
        return;
    }
    const aspect = validateAspect(flagString(flags, "aspect"));
    const variations = flagInt(flags, "variations");
    const name = flagString(flags, "name");
    const adGroupId = flagString(flags, "ad-group");
    const ws = await resolveWorkspace();
    const body = {
        workspaceId: ws.workspaceId,
        engine,
        adText,
        aspectRatio: aspect,
        ...(variations !== undefined ? { variations } : {}),
        ...(name ? { name } : {}),
        ...(adGroupId ? { adGroupId } : {}),
    };
    console.log(`Creative run: brand=${ws.slug}, engine=${engine}, aspect=${aspect}`);
    const res = await apiPost("/api/creative-suite/run", body);
    if (!res.ok) {
        console.error(formatError(res));
        process.exit(1);
        return;
    }
    console.log("");
    console.log(`✓ Creative ${engine} run started`);
    console.log(`  runId:        ${res.data.runId}`);
    if (res.data.triggerRunId)
        console.log(`  triggerRunId: ${res.data.triggerRunId}`);
    console.log(`  dashboard:    ${getDashboardUrl()}/creative-suite/runs/${res.data.runId}`);
    console.log("");
    console.log(`Poll: exodus creative status --id ${res.data.runId}`);
}
async function runRefMatch(flags) {
    const refsRaw = flagString(flags, "refs");
    if (!refsRaw) {
        console.error("Error: creative ref-match requires --refs <id,id,...>.");
        process.exit(1);
        return;
    }
    const referenceImageIds = refsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (referenceImageIds.length === 0) {
        console.error("Error: --refs must contain at least one non-empty id.");
        process.exit(1);
        return;
    }
    const aspect = validateAspect(flagString(flags, "aspect"));
    const variations = flagInt(flags, "variations");
    const subject = flagString(flags, "subject");
    const objectsRaw = flagString(flags, "objects");
    const objectImageIds = objectsRaw
        ? objectsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
    const name = flagString(flags, "name");
    const adGroupId = flagString(flags, "ad-group");
    const ws = await resolveWorkspace();
    const body = {
        workspaceId: ws.workspaceId,
        engine: "ref-match",
        referenceImageIds,
        aspectRatio: aspect,
        ...(variations !== undefined ? { variations } : {}),
        ...(subject ? { subject } : {}),
        ...(objectImageIds && objectImageIds.length > 0 ? { objectImageIds } : {}),
        ...(name ? { name } : {}),
        ...(adGroupId ? { adGroupId } : {}),
    };
    console.log(`Creative run: brand=${ws.slug}, engine=ref-match, aspect=${aspect}, refs=${referenceImageIds.length}`);
    const res = await apiPost("/api/creative-suite/run", body);
    if (!res.ok) {
        console.error(formatError(res));
        process.exit(1);
        return;
    }
    console.log("");
    console.log(`✓ Creative ref-match run started`);
    console.log(`  runId:        ${res.data.runId}`);
    if (res.data.triggerRunId)
        console.log(`  triggerRunId: ${res.data.triggerRunId}`);
    console.log(`  dashboard:    ${getDashboardUrl()}/creative-suite/runs/${res.data.runId}`);
}
async function runStatus(flags) {
    const runId = flagString(flags, "id");
    if (!runId) {
        console.error("Error: creative status requires --id <runId>.");
        process.exit(1);
        return;
    }
    const dashUrl = `${getDashboardUrl()}/api/creative-suite/runs/${encodeURIComponent(runId)}`;
    const apiKey = process.env["EXODUS_API_KEY"] ??
        process.env["VAD_API_KEY"] ??
        "";
    const headers = { "Content-Type": "application/json" };
    if (apiKey)
        headers["Authorization"] = `Bearer ${apiKey}`;
    const fetchRes = await fetch(dashUrl, { method: "GET", headers });
    const text = await fetchRes.text();
    let data;
    try {
        data = JSON.parse(text);
    }
    catch {
        console.error(`Non-JSON ${fetchRes.status} from /api/creative-suite/runs/${runId}: ${text.slice(0, 300)}`);
        process.exit(1);
        return;
    }
    if (!fetchRes.ok) {
        const errMsg = data.error ?? `HTTP ${fetchRes.status}`;
        console.error(`Error: ${errMsg}`);
        process.exit(1);
        return;
    }
    const d = data;
    console.log(`runId:        ${d._id}`);
    if (d.name)
        console.log(`name:         ${d.name}`);
    if (d.engine)
        console.log(`engine:       ${d.engine}`);
    console.log(`status:       ${d.status ?? "—"}${d.isTerminal ? " (terminal)" : ""}`);
    if (d.completedImages !== undefined || d.totalImages !== undefined) {
        console.log(`progress:     ${d.completedImages ?? 0} / ${d.totalImages ?? "?"} completed${d.failedImages ? `, ${d.failedImages} failed` : ""}`);
    }
    else if (d.imageCount !== undefined) {
        console.log(`images:       ${d.imageCount}`);
    }
    if (d.errorMessage)
        console.log(`error:        ${d.errorMessage}`);
    console.log(`dashboard:    ${getDashboardUrl()}/creative-suite/runs/${runId}`);
}
export async function run(flags) {
    const sub = process.argv[3] ?? "";
    if (sub === "native") {
        await runTextEngine("native", flags);
        return;
    }
    if (sub === "copy-derived") {
        await runTextEngine("copy-derived", flags);
        return;
    }
    if (sub === "ref-match") {
        await runRefMatch(flags);
        return;
    }
    if (sub === "status") {
        await runStatus(flags);
        return;
    }
    if (sub && !sub.startsWith("--")) {
        console.error(`Error: unknown creative subcommand "${sub}".`);
    }
    else {
        console.error("Error: creative requires a subcommand (native | copy-derived | ref-match | status).");
    }
    console.error("");
    console.error(helpText);
    process.exit(1);
}
