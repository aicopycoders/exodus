import { apiPostDashboard, getDashboardUrl } from "../lib/client.js";
import { formatError } from "../lib/format.js";
import { pkgRef } from "../lib/channel.js";
import { readFileSync } from "node:fs";
export const helpText = `
exodus meme — Meme generator: brief → recommended formats → one batched run

Usage:
  exodus meme recommend --brief "<text>" [--avatar "<text>"]
  exodus meme run --brief "<text>" --formats '<json>' [--avatar "<text>"] [--name "<label>"]
  exodus meme run --brief "<text>" --formats-file <path> [--avatar "<text>"] [--name "<label>"]
  exodus meme regenerate --brief "<text>" --layer 1 --template-id <id> --template-name "<name>" --boxes <N> [--id <runId>] [--avatar "<text>"]
  exodus meme regenerate --brief "<text>" --layer 2|3 --format <formatId> [--hint "<text>"] [--id <runId>] [--avatar "<text>"]

Flow:
  1. recommend  → { recommendations: [...] } — 15 picks (5 per layer), each with
                  name, layer, reasoning, ad_angle. Layer 1 = classic Imgflip
                  templates; layers 2/3 = AI-image formats.
  2. run        → pass the picked recommendation objects straight into --formats
                  (a JSON array; both recommendation-shape and run-shape entries
                  are accepted, 1–50). Returns { runId } — the whole batch renders
                  server-side via Trigger.dev; closing your session won't kill it.
  3. poll       → exodus status --id <runId> --type creative
                  (terminal: complete | partial-error | error)
  4. regenerate → re-render a single miss using the format fields from the
                  recommend output. Synchronous; returns the new image URL.

Keys (strict BYOK — checked server-side before anything starts):
  classic (layer 1) memes need your Imgflip login; AI (layer 2/3) memes need
  your Kie.ai key; captions always need your LLM key. Run \`npx ${pkgRef()} doctor\`.

Examples:
  exodus meme recommend --brief "grounding sheets reduce inflammation"
  exodus meme run --brief "grounding sheets reduce inflammation" --formats '[{"layer":2,"name":"Group Chat","format_id":"group-chat"}]'
  exodus meme regenerate --brief "grounding sheets reduce inflammation" --layer 2 --format group-chat --hint "make the last message land the product" --id <runId>
`.trim();
function dashboardUrlForRun(runId) {
    return `${getDashboardUrl()}/creative-suite/runs/${runId}`;
}
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
function requireString(value, flag) {
    if (!value) {
        console.error(`Error: --${flag} is required.`);
        process.exit(1);
        throw new Error("unreachable");
    }
    return value;
}
export function normalizeFormat(entry, index) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error(`formats[${index}] must be an object.`);
    }
    const e = entry;
    const layer = e["layer"];
    if (layer !== 1 && layer !== 2 && layer !== 3) {
        throw new Error(`formats[${index}].layer must be 1, 2, or 3.`);
    }
    const name = typeof e["name"] === "string" ? e["name"].trim() : "";
    if (!name) {
        throw new Error(`formats[${index}].name is required.`);
    }
    if (layer === 1) {
        const templateId = e["template_id"] ?? e["imgflip_template_id"] ?? e["format_id"];
        if (templateId === undefined || templateId === null || templateId === "") {
            throw new Error(`formats[${index}] (layer 1) needs template_id (or imgflip_template_id / format_id from recommend output).`);
        }
        const templateName = typeof e["template_name"] === "string" && e["template_name"].trim()
            ? e["template_name"].trim()
            : name;
        const boxRaw = e["box_count"] ?? e["imgflip_box_count"];
        const boxCount = typeof boxRaw === "number" && Number.isFinite(boxRaw) ? boxRaw : 2;
        return {
            layer: 1,
            name,
            template_id: String(templateId),
            template_name: templateName,
            box_count: boxCount,
        };
    }
    const formatId = typeof e["format_id"] === "string" ? e["format_id"].trim() : "";
    if (!formatId) {
        throw new Error(`formats[${index}] (layer ${layer}) needs format_id.`);
    }
    return { layer, name, format_id: formatId };
}
export function normalizeFormats(raw) {
    if (!Array.isArray(raw)) {
        throw new Error("--formats must be a JSON array.");
    }
    if (raw.length === 0) {
        throw new Error("--formats must contain at least one format.");
    }
    if (raw.length > 50) {
        throw new Error(`--formats supports at most 50 formats per run (got ${raw.length}).`);
    }
    return raw.map((entry, i) => normalizeFormat(entry, i));
}
async function runRecommend(flags) {
    const brief = requireString(flagString(flags, "brief"), "brief");
    const avatar = flagString(flags, "avatar");
    const res = await apiPostDashboard("/api/meme/recommend", {
        brief,
        ...(avatar ? { avatar_description: avatar } : {}),
    });
    if (!res.ok) {
        console.error(formatError(res));
        if (res.status === 400) {
            console.error(`Hint: run \`npx ${pkgRef()} doctor\` to check your keys.`);
        }
        process.exit(1);
        return;
    }
    console.log(JSON.stringify(res.data, null, 2));
}
async function runRun(flags) {
    const brief = requireString(flagString(flags, "brief"), "brief");
    const avatar = flagString(flags, "avatar");
    const name = flagString(flags, "name");
    const formatsInline = flagString(flags, "formats");
    const formatsFile = flagString(flags, "formats-file");
    if (!formatsInline && !formatsFile) {
        console.error("Error: meme run requires --formats '<json>' or --formats-file <path>.");
        process.exit(1);
        return;
    }
    let formatsRaw;
    if (formatsFile) {
        try {
            formatsRaw = readFileSync(formatsFile, "utf8");
        }
        catch (err) {
            console.error(`Error: could not read --formats-file "${formatsFile}": ${err instanceof Error ? err.message : err}`);
            process.exit(1);
            return;
        }
    }
    else {
        formatsRaw = formatsInline;
    }
    let formats;
    try {
        formats = normalizeFormats(JSON.parse(formatsRaw));
    }
    catch (err) {
        if (err instanceof SyntaxError) {
            console.error("Error: --formats must be valid JSON (an array of format objects).");
        }
        else {
            console.error(`Error: ${err instanceof Error ? err.message : err}`);
        }
        process.exit(1);
        return;
    }
    const classics = formats.filter((f) => f.layer === 1).length;
    console.log(`Meme run: ${formats.length} format${formats.length === 1 ? "" : "s"} (${classics} classic, ${formats.length - classics} AI)`);
    const res = await apiPostDashboard("/api/meme/run", {
        brief,
        ...(avatar ? { avatar_description: avatar } : {}),
        ...(name ? { name } : {}),
        formats,
    });
    if (!res.ok) {
        console.error(formatError(res));
        if (res.status === 400) {
            console.error(`Hint: run \`npx ${pkgRef()} doctor\` to check your keys.`);
        }
        process.exit(1);
        return;
    }
    console.log("");
    console.log(`✓ Meme run started`);
    console.log(`  runId:        ${res.data.runId}`);
    if (res.data.triggerRunId)
        console.log(`  triggerRunId: ${res.data.triggerRunId}`);
    console.log(`  memes:        ${formats.length} queued`);
    console.log(`  dashboard:    ${dashboardUrlForRun(res.data.runId)}`);
    console.log("");
    console.log(`Poll: exodus status --id ${res.data.runId} --type creative`);
    console.log("(The batch renders server-side — closing this session won't kill it.)");
}
async function runRegenerate(flags) {
    const brief = requireString(flagString(flags, "brief"), "brief");
    const layer = flagInt(flags, "layer");
    if (layer !== 1 && layer !== 2 && layer !== 3) {
        console.error("Error: meme regenerate requires --layer 1|2|3.");
        process.exit(1);
        return;
    }
    const avatar = flagString(flags, "avatar");
    const runId = flagString(flags, "id");
    let body;
    if (layer === 1) {
        const templateId = requireString(flagString(flags, "template-id"), "template-id");
        const templateName = requireString(flagString(flags, "template-name"), "template-name");
        const boxes = flagInt(flags, "boxes");
        if (boxes === undefined || boxes < 1 || boxes > 10) {
            console.error("Error: --boxes <N> is required for layer 1 (1–10).");
            process.exit(1);
            return;
        }
        body = {
            layer: 1,
            brief,
            template_id: templateId,
            template_name: templateName,
            box_count: boxes,
            ...(avatar ? { avatar_description: avatar } : {}),
            ...(runId ? { runId } : {}),
        };
    }
    else {
        const formatId = requireString(flagString(flags, "format"), "format");
        const hint = flagString(flags, "hint");
        body = {
            layer,
            brief,
            format_id: formatId,
            ...(hint ? { userHint: hint } : {}),
            ...(avatar ? { avatar_description: avatar } : {}),
            ...(runId ? { runId } : {}),
        };
    }
    const res = await apiPostDashboard("/api/meme/regenerate", body);
    if (!res.ok) {
        console.error(formatError(res));
        if (res.status === 400) {
            console.error(`Hint: run \`npx ${pkgRef()} doctor\` to check your keys.`);
        }
        process.exit(1);
        return;
    }
    if (res.data.image_url) {
        console.log(`✓ Meme regenerated`);
        console.log(`  image: ${res.data.image_url}`);
        if (runId)
            console.log(`  dashboard: ${dashboardUrlForRun(runId)}`);
    }
    else {
        console.log(JSON.stringify(res.data, null, 2));
    }
}
const SUBCOMMANDS = {
    recommend: runRecommend,
    run: runRun,
    regenerate: runRegenerate,
};
export async function run(flags) {
    const sub = process.argv[3] ?? "";
    const handler = SUBCOMMANDS[sub];
    if (!handler) {
        if (sub && !sub.startsWith("--")) {
            console.error(`Error: unknown meme subcommand "${sub}".`);
        }
        else {
            console.error("Error: meme requires a subcommand (recommend | run | regenerate).");
        }
        console.error("");
        console.error(helpText);
        process.exit(1);
        return;
    }
    await handler(flags);
}
