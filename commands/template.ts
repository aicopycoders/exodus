// exodus template — Fernando's Template runner (creative-suite-template).
//
// Fires the Fernando-port 5-stage Template pipeline that produces N AD_TYPE
// variations of a brief through Trigger.dev task `creative-suite-template`.
// Backend: Convex HTTP route POST /api/creative-suite-template/run (Bearer-auth).
//
// Subcommands:
//   exodus template run [flags]                  Kick off a new run
//   exodus template resume --id <runId>          Resume orphan renders (#56)
//   exodus template ad-types                     Print the 33 AD_TYPES
//   exodus template reptile-triggers             Print the 13 reptile triggers
//
// Notes:
// - No CLI-side status polling. The Convex HTTP route is POST-only; status
//   updates are dashboard-realtime via Convex subscriptions. The CLI returns
//   the runId and a dashboard URL; --no-wait is implicit.
// - --ref-image is NOT supported in V1 because the Convex HTTP kickoff route
//   doesn't accept referenceImageIds. The dashboard Clerk-proxy route does,
//   but the CLI auths via Bearer only. Follow-up: add ref-image plumbing
//   to convex/http.ts:6972.
import { apiGet, apiPost, apiPostDashboard, getDashboardUrl } from "../lib/client.js";
import { formatError } from "../lib/format.js";
import {
  AD_TYPES,
  AD_TYPE_NAMES,
  REPTILE_TRIGGERS,
} from "../lib/template-constants.js";

export const helpText = `
exodus template — Fernando's Template pipeline (33 AD_TYPES, resume)

Usage:
  exodus template run --input "<ad brief or numbered ads>" [options]
  exodus template resume --id <runId>
  exodus template ad-types
  exodus template reptile-triggers

Run options:
  --input "<text>"               Input ads block. One brief, or numbered list
                                  ("1. ad copy ... 2. ad copy ..."). Required.
  --mode auto|manual              Generation mode (default: auto)
  --render-mode images|prompts    Skip render and return prompts only (default: images)
  --aspect 1:1|9:16               Image aspect ratio (default: 1:1)
  --model gpt-image-2|nano-banana-pro   Kie.ai model (default: gpt-image-2)
  --realism off|realistic         Realism enforcement (default: off)
  --quantities <slug:N,slug:N>    Manual-mode per-type counts (e.g. "testimonial:3,hero:2")
  --requested-count N             Auto-mode total render target (optional)
  --no-wait                       (default — no CLI-side polling endpoint yet)

Resume options:
  --id <runId>                    Template run id to resume (#56 orphan finalization)

Status polling:
  The Convex HTTP route is POST-only. View live progress at the dashboard URL
  printed at kickoff (or the dashboard's /creative-suite/template/sessions list).

Examples:
  exodus template run --input "silver-threaded grounding sheets for inflammation"
  exodus template run --input "..." --aspect 9:16 --model nano-banana-pro --realism realistic
  exodus template run --input "..." --mode manual --quantities "testimonial:3,hero:2,ugc:4"
  exodus template resume --id <runId>
  exodus template ad-types
`.trim();

interface WhoamiResponse {
  userId: string | null;
  userEmail: string | null;
  userRole: "admin" | "member" | null;
  workspaceId: string | null;
  workspaceSlug: string | null;
}

interface TemplateRunResponse {
  runId: string;
  triggerRunId?: string;
  error?: string;
}

interface TemplateResumeResponse {
  runId: string;
  triggerRunId?: string;
  resumeCandidateCount?: number;
  error?: string;
}

function dashboardUrlForRun(runId: string): string {
  return `${getDashboardUrl()}/creative-suite/template/sessions/${runId}`;
}

// ── Subcommand: ad-types ──────────────────────────────────────────

function runAdTypes(): void {
  console.log(`AD_TYPES (${AD_TYPES.length} total):`);
  console.log("");
  for (const slug of AD_TYPES) {
    const name = AD_TYPE_NAMES[slug];
    console.log(`  ${slug.padEnd(28)} ${name}`);
  }
}

// ── Subcommand: reptile-triggers ──────────────────────────────────

function runReptileTriggers(): void {
  console.log(`REPTILE_TRIGGERS (${REPTILE_TRIGGERS.length} total):`);
  console.log("");
  for (const trigger of REPTILE_TRIGGERS) {
    console.log(`  ${trigger}`);
  }
}

// ── Flag parsing helpers ──────────────────────────────────────────

function parseQuantities(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of raw.split(",")) {
    const [slug, nRaw] = pair.split(":").map((s) => s.trim());
    if (!slug || !nRaw) {
      throw new Error(`Malformed --quantities entry "${pair}". Use slug:N format.`);
    }
    if (!(AD_TYPES as readonly string[]).includes(slug)) {
      throw new Error(
        `Unknown ad type "${slug}" in --quantities. Run \`exodus template ad-types\` for the full list.`,
      );
    }
    const n = parseInt(nRaw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`--quantities count for "${slug}" must be a positive integer (got "${nRaw}").`);
    }
    out[slug] = n;
  }
  return out;
}

// ── Subcommand: run ───────────────────────────────────────────────

async function runTemplate(flags: Record<string, string | boolean>): Promise<void> {
  const input = typeof flags["input"] === "string" ? flags["input"] : undefined;
  if (!input || input.trim().length < 3) {
    console.error("Error: template run requires --input \"<text>\" (min 3 chars).");
    process.exit(1);
    return;
  }

  const mode = typeof flags["mode"] === "string" ? flags["mode"] : "auto";
  if (mode !== "auto" && mode !== "manual") {
    console.error(`Error: --mode must be auto | manual (got "${mode}").`);
    process.exit(1);
    return;
  }

  const renderMode =
    typeof flags["render-mode"] === "string" ? flags["render-mode"] : "images";
  if (renderMode !== "images" && renderMode !== "prompts") {
    console.error(`Error: --render-mode must be images | prompts (got "${renderMode}").`);
    process.exit(1);
    return;
  }

  const aspect = typeof flags["aspect"] === "string" ? flags["aspect"] : "1:1";
  if (aspect !== "1:1" && aspect !== "9:16") {
    console.error(`Error: --aspect must be 1:1 | 9:16 (got "${aspect}").`);
    process.exit(1);
    return;
  }

  const model = typeof flags["model"] === "string" ? flags["model"] : "gpt-image-2";
  if (model !== "gpt-image-2" && model !== "nano-banana-pro") {
    console.error(`Error: --model must be gpt-image-2 | nano-banana-pro (got "${model}").`);
    process.exit(1);
    return;
  }

  const realism = typeof flags["realism"] === "string" ? flags["realism"] : "off";
  if (realism !== "off" && realism !== "realistic") {
    console.error(`Error: --realism must be off | realistic (got "${realism}").`);
    process.exit(1);
    return;
  }

  let manualQuantities: Record<string, number> | undefined;
  if (typeof flags["quantities"] === "string") {
    try {
      manualQuantities = parseQuantities(flags["quantities"]);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
      return;
    }
  }

  if (mode === "manual" && !manualQuantities) {
    console.error("Error: --mode manual requires --quantities \"slug:N,slug:N\".");
    process.exit(1);
    return;
  }

  const requestedRaw = flags["requested-count"];
  const requestedImageCount =
    typeof requestedRaw === "string" ? parseInt(requestedRaw, 10) : undefined;
  if (requestedImageCount !== undefined && (!Number.isFinite(requestedImageCount) || requestedImageCount <= 0)) {
    console.error(`Error: --requested-count must be a positive integer.`);
    process.exit(1);
    return;
  }

  // Resolve workspaceId + submittedBy from whoami (Bearer key → user).
  const who = await apiGet<WhoamiResponse>("/api/v2/whoami");
  if (!who.ok || !who.data.userId || !who.data.workspaceId) {
    console.error("Error: whoami failed. Check EXODUS_API_KEY and EXODUS_API_URL/CONVEX_SITE_URL.");
    console.error(formatError(who));
    process.exit(1);
    return;
  }

  const body = {
    workspaceId: who.data.workspaceId,
    submittedBy: who.data.userId,
    mode,
    renderMode,
    inputAds: input,
    aspectRatio: aspect,
    model,
    realismMode: realism,
    ...(requestedImageCount !== undefined ? { requestedImageCount } : {}),
    ...(manualQuantities ? { manualQuantities } : {}),
  };

  console.log(
    `Template run: brand=${who.data.workspaceSlug ?? who.data.workspaceId}, mode=${mode}, ` +
      `aspect=${aspect}, model=${model}, realism=${realism}, render=${renderMode}`,
  );

  const res = await apiPost<TemplateRunResponse>("/api/creative-suite-template/run", body);
  if (!res.ok) {
    console.error(formatError(res));
    process.exit(1);
    return;
  }

  const { runId, triggerRunId } = res.data;
  console.log("");
  console.log(`✓ Template run started`);
  console.log(`  runId:        ${runId}`);
  if (triggerRunId) console.log(`  triggerRunId: ${triggerRunId}`);
  console.log(`  dashboard:    ${dashboardUrlForRun(runId)}`);
  console.log("");
  console.log("Status updates render live in the dashboard (no CLI status endpoint yet).");
}

// ── Subcommand: resume ────────────────────────────────────────────

async function runResume(flags: Record<string, string | boolean>): Promise<void> {
  const runId = typeof flags["id"] === "string" ? flags["id"] : undefined;
  if (!runId) {
    console.error("Error: template resume requires --id <runId>.");
    process.exit(1);
    return;
  }

  const res = await apiPostDashboard<TemplateResumeResponse>(
    `/api/creative-suite-template/runs/${encodeURIComponent(runId)}/resume`,
    {},
  );
  if (!res.ok) {
    console.error(formatError(res));
    process.exit(1);
    return;
  }

  const { resumeCandidateCount, triggerRunId } = res.data;
  console.log("");
  console.log(`✓ Resume enqueued`);
  console.log(`  runId:                ${runId}`);
  if (resumeCandidateCount !== undefined) {
    console.log(`  resumeCandidateCount: ${resumeCandidateCount}`);
  }
  if (triggerRunId) console.log(`  triggerRunId:         ${triggerRunId}`);
  console.log(`  dashboard:            ${dashboardUrlForRun(runId)}`);
}

// ── Entry point ───────────────────────────────────────────────────

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  // Subcommand routing: bin/exodus.ts parser strips positional args, so we
  // read process.argv directly.
  // argv: ['node', 'exodus.js', 'template', '<sub>', ...]
  const sub = process.argv[3] ?? "";

  if (sub === "ad-types") {
    runAdTypes();
    return;
  }
  if (sub === "reptile-triggers") {
    runReptileTriggers();
    return;
  }
  if (sub === "resume") {
    await runResume(flags);
    return;
  }
  if (sub === "run") {
    await runTemplate(flags);
    return;
  }

  if (!sub || sub.startsWith("--")) {
    console.error("Error: template requires a subcommand (run | resume | ad-types | reptile-triggers).");
    console.error("");
    console.error(helpText);
    process.exit(1);
    return;
  }

  console.error(`Error: unknown template subcommand "${sub}".`);
  console.error("");
  console.error(helpText);
  process.exit(1);
}
