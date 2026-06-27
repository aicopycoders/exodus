// exodus image — the single front door for making static image ads.
//
// Recommend-and-run: infer the engine from what the user gives you, print a
// one-line read, then route to the EXISTING backends. No server changes — this
// command composes the same Convex HTTP routes that `creative` and `template`
// already call:
//   --type native|copy-derived  → POST /api/creative-suite/run
//   --type template              → POST /api/creative-suite-template/run
//
// Engine inference when --type is omitted:
//   numbered-list --input     → template (the only engine that takes many ads)
//   otherwise                 → native
//
// For full engine knobs (template mode/model/realism/pairings, creative status
// polling) drop into `exodus creative` / `exodus template` directly — they own
// the detail. This front door stays minimal on purpose.
import { apiGet, apiPost, getDashboardUrl } from "../lib/client.js";
import { formatError } from "../lib/format.js";

export const helpText = `
exodus image — Front door for static image ads (routes to creative / template)

Usage:
  exodus image --ad "<finished copy>"                    Infer + run (default: native)
  exodus image --type native --ad "<copy>"               Literal render from copy
  exodus image --type copy-derived --ad "<copy>"         Variations derived off copy
  exodus image --type template --input "<copy or 1. … 2. …>"   Spread across ad-type formats

Options:
  --type <engine>           native | copy-derived | template
                            (omit to infer: numbered --input → template; else native)
  --ad "<text>"             Finished ad copy (alias: --input)
  --input "<text>"          Finished ad copy, or a numbered list of ads ("1. … 2. …")
  --variations N            Renders to generate (creative engines; maps to render target for template)
  --aspect 1:1|4:5|9:16     Image aspect ratio (default: 1:1; template supports 1:1|9:16)
  --name "<label>"          Custom run name (creative engines)
  --from copy|idea          Source signal (default: copy). --from idea has no copy yet → write first.
  --steer "<direction>"     Steer every image in the batch (alias: --direction).
                            Native: a --steer with no --ad runs a no-copy native render.
  --realistic               Template only: add the realistic-enhancer guardrail

Examples:
  exodus image --ad "grounding sheets reduce inflammation"
  exodus image --type copy-derived --ad "..." --variations 10 --aspect 9:16
  exodus image --type template --input "1. first ad ... 2. second ad ..."
  exodus image --type template --input "1. first ad ... 2. second ad ..." --steer "dramatic, moody" --realistic

Engines underneath:
  This command picks one engine and runs it. To drive a specific engine yourself,
  use \`exodus creative <native|copy-derived>\` or \`exodus template run\`.
  For meme formats use \`exodus meme\`.
`.trim();

interface WhoamiResponse {
  userId: string | null;
  workspaceId: string | null;
  workspaceSlug: string | null;
}

interface RunResponse {
  runId: string;
  triggerRunId?: string;
  error?: string;
}

type Engine = "native" | "copy-derived" | "template" | "ref-match";

function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

function flagInt(flags: Record<string, string | boolean>, name: string): number | undefined {
  const v = flags[name];
  if (typeof v !== "string") return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

// A "numbered list of ads" looks like two or more lines/segments that begin
// with "1.", "2.", … — the signal that the user handed us many ads at once,
// which only `template` can take.
function looksLikeNumberedList(text: string): boolean {
  const matches = text.match(/(^|\n)\s*\d+[.)]\s+\S/g);
  return (matches?.length ?? 0) >= 2;
}

async function resolveWhoami(): Promise<WhoamiResponse> {
  const who = await apiGet<WhoamiResponse>("/api/v2/whoami");
  if (!who.ok || !who.data.workspaceId) {
    console.error("Error: whoami failed. Check EXODUS_API_KEY and EXODUS_API_URL/CONVEX_SITE_URL.");
    console.error(formatError(who));
    process.exit(1);
    throw new Error("unreachable");
  }
  return who.data;
}

function resolveEngine(
  flags: Record<string, string | boolean>,
  refs: string | undefined,
  text: string | undefined,
): Engine {
  const typeRaw = flagString(flags, "type");
  if (typeRaw) {
    if (
      typeRaw === "native" ||
      typeRaw === "copy-derived" ||
      typeRaw === "template" ||
      typeRaw === "ref-match"
    ) {
      return typeRaw;
    }
    console.error(`Error: --type must be native | copy-derived | template | ref-match (got "${typeRaw}").`);
    process.exit(1);
    throw new Error("unreachable");
  }
  // Inference (no --type): refs → ref-match; numbered list → template; else native.
  if (refs) return "ref-match";
  if (text && looksLikeNumberedList(text)) return "template";
  return "native";
}

function validateAspect(value: string | undefined, allowed: readonly string[]): string {
  const aspect = value ?? "1:1";
  if (!allowed.includes(aspect)) {
    console.error(`Error: --aspect must be ${allowed.join(" | ")} (got "${aspect}").`);
    process.exit(1);
    throw new Error("unreachable");
  }
  return aspect;
}

// ── Route: creative-suite (native / copy-derived) ─────────────────

async function runCreativeText(
  engine: "native" | "copy-derived",
  text: string,
  flags: Record<string, string | boolean>,
  who: WhoamiResponse,
): Promise<void> {
  const aspect = validateAspect(flagString(flags, "aspect"), ["1:1", "4:5", "9:16"]);
  const variations = flagInt(flags, "variations");
  const name = flagString(flags, "name");
  const steering = flagString(flags, "steer") ?? flagString(flags, "direction");
  const slug = who.workspaceSlug ?? who.workspaceId;

  const hasCopy = !!text && text.trim().length >= 3;
  const body = {
    workspaceId: who.workspaceId,
    engine,
    ...(hasCopy ? { adText: text } : {}),
    ...(steering ? { steering } : {}),
    aspectRatio: aspect,
    ...(variations !== undefined ? { variations } : {}),
    ...(name ? { name } : {}),
  };

  console.log(`Read: ${hasCopy ? "finished copy" : "steering-only"} → creative ${engine} (aspect ${aspect}) for ${slug}.`);
  const res = await apiPost<RunResponse>("/api/creative-suite/run", body, {
    ccCommand: `exodus image --type ${engine}`,
  });
  if (!res.ok) {
    console.error(formatError(res));
    process.exit(1);
    return;
  }
  console.log("");
  console.log(`✓ image run started (creative ${engine})`);
  console.log(`  runId:        ${res.data.runId}`);
  if (res.data.triggerRunId) console.log(`  triggerRunId: ${res.data.triggerRunId}`);
  console.log(`  dashboard:    ${getDashboardUrl()}/creative-suite/runs/${res.data.runId}`);
  console.log("");
  console.log(`Poll: exodus creative status --id ${res.data.runId}`);
}

// ── Route: creative-suite (ref-match) ─────────────────────────────

async function runRefMatch(
  flags: Record<string, string | boolean>,
  who: WhoamiResponse,
): Promise<void> {
  const refsRaw = flagString(flags, "refs");
  if (!refsRaw) {
    console.error("Error: ref-match requires --refs <id,id,...> (creativeSuiteImages ids from the library).");
    process.exit(1);
    return;
  }
  const referenceImageIds = refsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (referenceImageIds.length === 0) {
    console.error("Error: --refs must contain at least one non-empty id.");
    process.exit(1);
    return;
  }
  const aspect = validateAspect(flagString(flags, "aspect"), ["1:1", "4:5", "9:16"]);
  const variations = flagInt(flags, "variations");
  const subject = flagString(flags, "subject");
  const name = flagString(flags, "name");
  const slug = who.workspaceSlug ?? who.workspaceId;

  const body = {
    workspaceId: who.workspaceId,
    engine: "ref-match",
    referenceImageIds,
    aspectRatio: aspect,
    ...(variations !== undefined ? { variations } : {}),
    ...(subject ? { subject } : {}),
    ...(name ? { name } : {}),
  };

  console.log(`Read: reference match → creative ref-match (${referenceImageIds.length} refs, aspect ${aspect}) for ${slug}.`);
  const res = await apiPost<RunResponse>("/api/creative-suite/run", body, {
    ccCommand: "exodus image --type ref-match",
  });
  if (!res.ok) {
    console.error(formatError(res));
    process.exit(1);
    return;
  }
  console.log("");
  console.log(`✓ image run started (creative ref-match)`);
  console.log(`  runId:        ${res.data.runId}`);
  if (res.data.triggerRunId) console.log(`  triggerRunId: ${res.data.triggerRunId}`);
  console.log(`  dashboard:    ${getDashboardUrl()}/creative-suite/runs/${res.data.runId}`);
  console.log("");
  console.log(`Poll: exodus creative status --id ${res.data.runId}`);
}

// ── Route: creative-suite-template ────────────────────────────────

async function runTemplate(
  text: string,
  flags: Record<string, string | boolean>,
  who: WhoamiResponse,
): Promise<void> {
  if (!who.userId) {
    console.error("Error: whoami did not return a userId (required for template runs).");
    process.exit(1);
    return;
  }
  const aspect = validateAspect(flagString(flags, "aspect"), ["1:1", "9:16"]);
  const requestedImageCount = flagInt(flags, "variations");
  const slug = who.workspaceSlug ?? who.workspaceId;

  // Front-door defaults; power users wanting mode/model/realism/pairings use
  // `exodus template run` directly.
  const steering = flagString(flags, "steer") ?? flagString(flags, "direction");
  const realisticFlag = flags["realistic"] === true
    || flagString(flags, "realism") === "realistic";

  const body = {
    workspaceId: who.workspaceId,
    submittedBy: who.userId,
    mode: "auto",
    renderMode: "images",
    inputAds: text,
    aspectRatio: aspect,
    model: "gpt-image-2",
    realismMode: realisticFlag ? "realistic" : "off",
    ...(steering ? { steering } : {}),
    ...(requestedImageCount !== undefined ? { requestedImageCount } : {}),
  };

  console.log(`Read: finished copy → template (auto mode, aspect ${aspect}) for ${slug}.`);
  const res = await apiPost<RunResponse>("/api/creative-suite-template/run", body, {
    ccCommand: "exodus image --type template",
  });
  if (!res.ok) {
    console.error(formatError(res));
    process.exit(1);
    return;
  }
  console.log("");
  console.log(`✓ image run started (template)`);
  console.log(`  runId:        ${res.data.runId}`);
  if (res.data.triggerRunId) console.log(`  triggerRunId: ${res.data.triggerRunId}`);
  console.log(`  dashboard:    ${getDashboardUrl()}/creative-suite/template/sessions/${res.data.runId}`);
  console.log("");
  console.log("Status updates render live in the dashboard (no CLI status endpoint for template yet).");
}

// ── Entry point ───────────────────────────────────────────────────

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  // --from idea: no finished copy yet. Image creation needs copy — there is no
  // concept-mining path (image-ads is retired). Route to writing first.
  const from = flagString(flags, "from");
  if (from === "idea") {
    console.error("image needs finished copy to render. You only have an idea — write copy first:");
    console.error('  exodus genesis run --brief "<your idea>"');
    console.error("Then come back and run image on the resulting copy.");
    process.exit(1);
    return;
  }

  // Accept --ad or --input as the copy/text. (template can take a numbered list.)
  const text = flagString(flags, "ad") ?? flagString(flags, "input");
  const steering = flagString(flags, "steer") ?? flagString(flags, "direction");
  const refs = flagString(flags, "refs");
  const engine = resolveEngine(flags, refs, text);

  // Validate inputs BEFORE the network call so bad invocations fail fast with a
  // helpful message instead of a whoami error.
  if (engine === "ref-match") {
    if (!refs || refs.split(",").map((s) => s.trim()).filter(Boolean).length === 0) {
      console.error("Error: ref-match requires --refs <id,id,...> (creativeSuiteImages ids from the library).");
      process.exit(1);
      return;
    }
  } else if (!text || text.trim().length < 3) {
    // No-copy is allowed for native when --steer is given: steering IS the brief.
    const hasSteering = !!steering && steering.trim().length > 0;
    if (!(engine === "native" && hasSteering)) {
      console.error(`Error: ${engine} needs ad copy — pass --ad "<text>" (or --input "<text>", min 3 chars).`);
      console.error('  (For a no-copy native render, pass --steer "<direction>". For a reference-image match, use --type ref-match --refs <id,id,...>.)');
      process.exit(1);
      return;
    }
  }

  const who = await resolveWhoami();

  if (engine === "ref-match") {
    await runRefMatch(flags, who);
    return;
  }
  if (engine === "template") {
    await runTemplate(text as string, flags, who);
    return;
  }
  // native | copy-derived
  await runCreativeText(engine, (text ?? "") as string, flags, who);
}
