import { apiGet } from "../lib/client.js";
import { formatGeneration, formatGenesisRun, formatError } from "../lib/format.js";
import { hydrateScoutIdeasCount } from "../lib/scout-hydrate.js";
import { formatIntelResult as formatIntelResultRich } from "../lib/intel-format.js";

export const helpText = `
exodus status — Check the status of a pipeline run

Usage:
  exodus status --id <runId> [--type <pipeline>]

Required:
  --id <runId>           The generation or run ID returned by a prior exodus command

Options:
  --type <pipeline>      Pipeline type: generation (default) | genesis | intel | pulse | scout
                         | creative | template
                         Spark, Viral, Mirror, Remix runs use --type generation (default).
                         Intel, Pulse, Scout require --type intel|pulse|scout.
                         Creative-suite (native/copy-derived/ref-match/meme)
                         use --type creative; Template uses --type template.
`.trim();

async function fetchScoutIdeasCount(runId: string): Promise<number | null> {
  const res = await apiGet<{ count?: number }>(`/api/v2/scout/ideas?runId=${runId}&limit=1`);
  if (res.ok && typeof res.data.count === "number") return res.data.count;
  return null;
}

// Delegate to the Intel command's formatter so `exodus status --type intel`
// shows the same fields (phase1DocUrl, phase3DocUrl, googleSheetUrl, combo
// ratio) that `exodus intel` surfaces post-run. (I-N12)
export function formatIntelResult(data: Record<string, unknown>): string {
  return formatIntelResultRich(data).replace(
    "## Intel Analysis Result",
    "## Intel Status"
  );
}

export function formatPulseResult(data: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push("## Pulse Status");
  lines.push(`**Status:** ${data["status"] ?? "unknown"}`);
  if (data["accountId"]) lines.push(`**Account ID:** ${data["accountId"]}`);
  if (data["commentsAnalyzed"] !== undefined) lines.push(`**Comments Analyzed:** ${data["commentsAnalyzed"]}`);
  if (data["summary"]) lines.push(`**Summary:** ${data["summary"]}`);
  if (data["phase1DocUrl"]) lines.push(`**Phase 1 Doc:** ${data["phase1DocUrl"]}`);
  if (data["phase2DocUrl"]) lines.push(`**Phase 2 Doc:** ${data["phase2DocUrl"]}`);
  if (data["reportUrl"]) lines.push(`**Report URL:** ${data["reportUrl"]}`);
  if (data["error"]) lines.push(`**Error:** ${data["error"]}`);

  const ideas = data["ideas"];
  if (Array.isArray(ideas) && ideas.length > 0) {
    lines.push(`\n**Ideas (${ideas.length}):**`);
    for (const idea of ideas) {
      if (typeof idea === "object" && idea !== null) {
        const i = idea as Record<string, unknown>;
        lines.push(`  ${i["id"] ?? "?"} — ${i["name"] ?? i["title"] ?? i["idea"] ?? "(untitled)"}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatScoutResult(data: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push("## Scout Status");
  lines.push(`**Status:** ${data["status"] ?? "unknown"}`);

  const pipelineSlug = data["pipelineSlug"] as string | undefined;
  if (pipelineSlug) lines.push(`**Pipeline:** ${pipelineSlug}`);

  const mode = data["mode"] as string | undefined;
  if (mode) lines.push(`**Mode:** ${mode}`);

  const ideasGenerated = data["ideasGenerated"] ?? data["ideaCount"];
  if (ideasGenerated !== undefined) lines.push(`**Ideas Generated:** ${ideasGenerated}`);

  // Child idea Docs — surfaced by convex/scout.getRunInternal as a joined
  // ideas[] array. For the common from-bank single-idea dispatch this is
  // the operator's only path to the Doc URL.
  const ideas = data["ideas"];
  const ideasArr = Array.isArray(ideas)
    ? (ideas.filter((i) => typeof i === "object" && i !== null) as Record<string, unknown>[])
    : [];
  const docIdeas = ideasArr.filter((i) => typeof i["googleDocUrl"] === "string" && (i["googleDocUrl"] as string).length > 0);

  if (docIdeas.length === 1) {
    lines.push(`**Doc:** ${docIdeas[0]["googleDocUrl"]}`);
  }

  const sheetUrl = data["sheetUrl"] as string | undefined;
  if (sheetUrl) lines.push(`**Sheet:** ${sheetUrl}`);
  const sheetError = data["sheetError"] as string | undefined;
  if (!sheetUrl && sheetError) lines.push(`**Sheet error:** ${sheetError}`);

  if (ideasArr.length > 0) {
    lines.push("");
    lines.push(`**Ideas (${ideasArr.length}):**`);
    for (const i of ideasArr) {
      const status = String(i["status"] ?? "?");
      const username = (i["sourceUsername"] as string | undefined) ?? "";
      const hook = (i["hook"] as string | undefined) ?? "";
      const docUrl = i["googleDocUrl"] as string | undefined;
      const pipelineError = i["pipelineError"] as string | undefined;
      const label = hook || username || (i["sourceUrl"] as string | undefined) || "(idea)";
      const truncated = label.length > 80 ? `${label.slice(0, 80)}…` : label;
      lines.push(`  • [${status}] ${truncated}`);
      if (docUrl) lines.push(`    ${docUrl}`);
      else if (pipelineError) lines.push(`    error: ${pipelineError}`);
    }
  }

  const scanSteps = data["scanSteps"];
  if (Array.isArray(scanSteps) && scanSteps.length > 0) {
    lines.push("");
    lines.push("Scan breakdown:");
    for (const step of scanSteps) {
      if (typeof step === "object" && step !== null) {
        const s = step as Record<string, unknown>;
        const label = String(s["label"] ?? s["key"] ?? "step");
        const detail = s["detail"] ? ` — ${s["detail"]}` : "";
        lines.push(`  ${label.padEnd(20)}${detail}`);
      }
    }
  }

  if (data["error"]) lines.push(`**Error:** ${data["error"]}`);
  return lines.join("\n");
}

// Shared formatter for the new image/video pipelines (Max R3 #8). Each returns
// a different run shape, so we print the status plus whichever known fields are
// present rather than assuming one schema.
export function formatCreativeSuiteStatus(
  title: string,
  data: Record<string, unknown>,
): string {
  const lines: string[] = [];
  lines.push(`## ${title}`);
  lines.push(`**Status:** ${data["status"] ?? "unknown"}`);
  const show = (label: string, key: string) => {
    const v = data[key];
    if (v !== undefined && v !== null && v !== "") lines.push(`**${label}:** ${v}`);
  };
  show("Engine", "engine");
  show("Mode", "mode");
  show("Render mode", "renderMode");
  show("Concepts", "totalConcepts");
  show("Detected ads", "detectedAdCount");
  // creativeSuiteRuns track completedImages/totalImages; template runs track
  // completedImageCount/failedImageCount.
  if (data["totalImages"] !== undefined) {
    lines.push(`**Images:** ${data["completedImages"] ?? 0}/${data["totalImages"]}`);
  }
  if (data["completedImageCount"] !== undefined) {
    const failed = data["failedImageCount"] ? ` (${data["failedImageCount"]} failed)` : "";
    lines.push(`**Images:** ${data["completedImageCount"]}${failed}`);
  }
  show("Final video", "finalVideoUrl");
  show("Video", "videoUrl");
  show("Cost (cents)", "totalCostCents");
  if (data["errorMessage"]) lines.push(`**Error:** ${data["errorMessage"]}`);
  else if (data["error"]) lines.push(`**Error:** ${data["error"]}`);
  return lines.join("\n");
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  const id = flags["id"];
  if (!id || typeof id !== "string") {
    console.error("Error: --id <runId> is required");
    process.exit(1);
  }

  const type = (flags["type"] as string | undefined) ?? "generation";

  const pathMap: Record<string, string> = {
    generation: `/api/v2/generations?id=${id}`,
    genesis: `/api/v2/genesis?id=${id}`,
    intel: `/api/v2/intel?id=${id}`,
    pulse: `/api/v2/pulse?id=${id}`,
    scout: `/api/v2/scout?runId=${id}`,
    creative: `/api/v2/creative?runId=${id}`,
    template: `/api/v2/template?runId=${id}`,
  };

  const path = pathMap[type];
  if (!path) {
    console.error(
      `Unknown type: "${type}". Valid types: generation, genesis, intel, pulse, scout, creative, template`,
    );
    process.exit(1);
  }

  const res = await apiGet<Record<string, unknown>>(path);

  if (!res.ok) {
    console.log(formatError(res));
    process.exit(1);
  }

  if (type === "scout") {
    await hydrateScoutIdeasCount(id, res.data, fetchScoutIdeasCount);
  }

  switch (type) {
    case "generation":
      console.log(formatGeneration(res.data));
      break;
    case "genesis":
      console.log(formatGenesisRun(res.data));
      break;
    case "intel":
      console.log(formatIntelResult(res.data));
      break;
    case "pulse":
      console.log(formatPulseResult(res.data));
      break;
    case "scout":
      console.log(formatScoutResult(res.data));
      break;
    case "creative":
      console.log(formatCreativeSuiteStatus("Creative Suite Status", res.data));
      break;
    case "template":
      console.log(formatCreativeSuiteStatus("Template Status", res.data));
      break;
  }
}
