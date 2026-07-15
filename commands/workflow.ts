import fs from "node:fs";
import { apiGet, apiPost, type ApiResponse } from "../lib/client.js";
import { formatError } from "../lib/format.js";
import { pollUntilDone, type PollOptions, type PollResult } from "../lib/poll.js";

export const helpText = `
exodus workflow — List, describe, run, inspect, import, and export saved workflows

Usage:
  exodus workflow list [--json]
  exodus workflow describe <workflowId|name> [--json]
  exodus workflow bots [--category <cat>] [--slug <slug>] [--json]
  exodus workflow run <workflowId|name> [--input key=value ...] [--wait] [--json]
  exodus workflow status [--id <runId>] [--json]
  exodus workflow export <workflowId|name> [--out <file>]
  exodus workflow import <file> [--update <workflowId>] [--dry-run] [--json]

Flags:
  --json                 Machine-readable JSON output
  --category <cat>       (bots) Filter the catalog to one category id
  --slug <slug>          (bots) Show a single bot's full port + param spec
  --input key=value      Repeatable workflow run input; values may contain "="
                         --input key=@path loads the value from a file (path is
                         resolved from the current directory); --input key=@@text
                         keeps a leading "@" as a literal character.
  --wait                 Poll until the workflow run reaches a terminal status
  --id <runId>           Workflow run id for status detail
  --out <file>           Write export JSON to a file instead of stdout
  --update <workflowId>  (import) Update this existing workflow in place instead
                         of creating a new one. Sends the contract's updatedAt as
                         an optimistic-concurrency guard — if it 409s, re-export
                         the workflow, reapply edits, and import again.
  --dry-run              Preview import (validate + resolve refs) without writing

Examples:
  exodus workflow describe "Launch Flow"
  exodus workflow bots
  exodus workflow bots --category writing
  exodus workflow bots --slug new-hook-bot
  exodus workflow run "Launch Flow" --input brief="new offer" --wait
  exodus workflow run "Launch Flow" --input brief=@brief.txt
  exodus workflow status --id wr_123
  exodus workflow export "Launch Flow" --out workflow.json
  exodus workflow import workflow.json --dry-run
  exodus workflow import workflow.json --update wf_123

Notes:
  workflow bots --json emits the FULL catalog response verbatim (--category /
  --slug filters are ignored in that mode). workflow bots --slug <slug> --json
  emits just that one bot's catalog JSON.
`.trim();

// ── Contract shapes (mirror convex/lib/workflow/importExport.ts) ─────────
// exodus builds standalone, so these cannot import convex/lib at runtime.
// __tests__/workflow.test.ts pins them with mutual assignment checks.

// Mirrors convex NODE_KINDS — #538 adds the Rig node and #539 adds the
// storyboard→media video kinds. Kept in lockstep so the mutual-assignment pins
// in __tests__/workflow.test.ts stay type-compatible with the widened convex
// contract.
export type WorkflowNodeKind =
  | "brief"
  | "bot"
  | "primer"
  | "image"
  | "rig"
  | "storyboard"
  | "reference"
  | "scene-frames"
  | "video"
  | "voiceover"
  | "output"
  // #603 Video-module member-gate kinds (module templates only — the CLI
  // never authors them, but describe/export must round-trip them).
  | "show-set"
  | "show-cast"
  | "show-voices"
  | "product-truth";

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface WorkflowContractJson {
  contract: "exodus-workflow";
  version: number;
  /** Update anchors (#509) — present on exports; PURELY meta, not graph. */
  workflowId?: string;
  updatedAt?: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface UnresolvedWorkflowRef {
  nodeId: string;
  ref: "persona" | "primer";
  value: string;
  message: string;
}

export interface WorkflowImportResult {
  name: string;
  created: boolean;
  workflowId?: string;
  nodeCount: number;
  edgeCount: number;
  unresolved: UnresolvedWorkflowRef[];
  warnings: string[];
}

// ── Graph validation + import error mirrors (convex/lib/workflow/graph.ts +
//    importExport.ts). The dry-run/import surface hands these to an agent so it
//    can repair a contract without reading the validator source. ──────────────

export type GraphIssueCode =
  | "bad-shape"
  | "unknown-kind"
  | "duplicate-node-id"
  | "dangling-edge"
  | "unknown-port"
  | "type-mismatch"
  | "duplicate-input"
  | "cycle"
  | "missing-required-input"
  | "bad-config";

export interface GraphIssue {
  code: GraphIssueCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
  /** The input/output port the defect is about, when it names one (#510). */
  portId?: string;
  /** Imperative, concrete remedy: the exact edit that fixes this issue (#510). */
  remedy?: string;
}

export type WorkflowImportErrorCode =
  | "invalid-graph"
  | "conflict"
  | "forbidden"
  | "not-found";

/** The Convex-side structured failure (importExport.ts) — mirrored for lockstep. */
export interface WorkflowImportError {
  code: WorkflowImportErrorCode;
  message: string;
  issues?: GraphIssue[];
  currentUpdatedAt?: string;
}

// ── Bot catalog mirrors (convex/lib/workflow/catalog.ts) ──────────────────────

// Mirrors convex PortType — #538 adds the Rig node's "rig" output, #539 adds
// the storyboard/frames/video/audio video wire types, and #603 adds the
// show-setup chain's "show" ordering wire.
export type WorkflowPortType =
  | "text"
  | "primer"
  | "image"
  | "rig"
  | "storyboard"
  | "frames"
  | "video"
  | "audio"
  | "show";
export type WorkflowPrimerKind = "body" | "hook" | "headline" | "summary";

/** Mirror of convex videoModels.ts DurationSpec (catalog videoModels axis, #539). */
export type WorkflowDurationSpec =
  | { kind: "fixed"; values: number[] }
  | { kind: "range"; min: number; max: number };

/** Mirror of convex catalog.ts CatalogVideoModel (#539). */
export interface CatalogVideoModel {
  id: string;
  label: string;
  durations: WorkflowDurationSpec;
  audioTogglable: boolean;
}
export type WorkflowParamKind =
  | "select"
  | "text"
  | "textarea"
  | "toggle"
  | "number"
  | "multiselect";

export interface CatalogInput {
  id: string;
  label: string;
  accepts: WorkflowPortType[];
  required: boolean;
  multi?: boolean;
  primerKinds?: WorkflowPrimerKind[];
}

export interface CatalogParam {
  key: string;
  label: string;
  kind: WorkflowParamKind;
  options?: string[];
  min?: number;
  max?: number;
  required?: boolean;
  help?: string;
  default?: string;
}

export interface CatalogBot {
  slug: string;
  name: string;
  blurb: string;
  category: string;
  categoryLabel: string;
  inputs: CatalogInput[];
  params: CatalogParam[];
  outputType: string;
  splitsOutput: boolean;
}

export interface WorkflowCatalog {
  catalog: "exodus-workflow-catalog";
  version: 1;
  bots: CatalogBot[];
  vocabulary: {
    nodeKinds: string[];
    briefSources: string[];
    primerKinds: string[];
    imageModels: string[];
    aspectRatios: string[];
    imageQuantityModes: string[];
    videoModels: CatalogVideoModel[];
    categories: Array<{ id: string; label: string }>;
  };
  customBot: {
    slug: "custom";
    configKey: "customSlug";
    inputs: CatalogInput[];
    summaryOnlySlugs: string[];
    notes: string;
  };
}

// ── Describe contract mirrors (convex/lib/workflow/describe.ts) ────────────────

export type WorkflowBriefSource =
  | "text"
  | "swipe-ad"
  | "swipe-bundle"
  | "organic-url"
  | "ad-url";

export interface WorkflowInputDescriptor {
  fieldName: string;
  nodeId: string;
  source: WorkflowBriefSource;
  required: boolean;
  description?: string;
  bundleSize?: number;
}

export interface WorkflowPrerequisiteDescriptor {
  primerKind: WorkflowPrimerKind;
  nodeIds: string[];
}

export interface WorkflowOutputDescriptor {
  // #539: the Output collector accepts every deliverable type the pipeline can
  // produce (a `rig` output is plumbing and never collected). Mirror of
  // convex/lib/workflow/describe.ts WorkflowOutputDescriptor (pinned by
  // exodus/commands/__tests__/workflow.test.ts).
  type: "text" | "image" | "video" | "audio" | "frames" | "storyboard";
  label: string;
  nodeId: string;
  botSlug?: string;
}

/** The describe HTTP response: the derived contract + this brand's stored flags. */
export interface WorkflowDescribeResponse {
  workflowId: string;
  name: string;
  description?: string;
  updatedAt: string;
  inputs: WorkflowInputDescriptor[];
  prerequisites: Array<WorkflowPrerequisiteDescriptor & { stored: boolean }>;
  outputs: WorkflowOutputDescriptor[];
}

// ── HTTP projections ─────────────────────────────────────────────────────

export interface WorkflowListItem {
  _id: string;
  name: string;
  description?: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
  // Cross-brand share (#523): set on a workflow surfaced at a NON-home brand —
  // a live reference the owner enabled here from another brand. Older backends
  // omit these fields, so both stay optional.
  isCrossBrand?: boolean;
  homeBrandName?: string | null;
}

export interface WorkflowListResponse {
  workflows: WorkflowListItem[];
}

// #539 video pipeline adds two run states: "awaiting-review" (paused at the
// storyboard cost gate, waiting on a web approve/cancel — NONterminal) and
// "canceled" (an operator canceled a paused run — terminal).
export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "awaiting-review"
  | "completed"
  | "partial"
  | "failed"
  | "canceled";
export type WorkflowNodeRunStatus = "idle" | "running" | "done" | "failed" | "skipped";

export type WorkflowArtifact =
  | { type: "text"; text: string; label?: string }
  | { type: "primer"; text: string; primerKind: string }
  | { type: "image"; storageId: string; imageUrl?: string };

/**
 * A FINAL deliverable (#508): a producing node's artifact wired into the Output
 * collector, flattened to the top level of the run so an agent can chain a run's
 * results without re-deriving the graph. Text carries the full chaining surface.
 */
export interface WorkflowRunOutput {
  nodeId: string;
  botSlug?: string;
  type: "text" | "image" | "video" | "audio" | "frames" | "storyboard";
  label: string;
  text?: string;
  imageUrl?: string;
  imageId?: string;
  // #539 video pipeline deliverables — kept in lockstep with the canonical
  // convex/workflows.ts WorkflowRunOutputEntry (see the assignability guards in
  // exodus/commands/__tests__/workflow.test.ts).
  videoUrl?: string;
  audioUrl?: string;
  durationSec?: number;
  sceneIndex?: number;
  // True on the stitched final ad video (#550) — distinguishes it from clips.
  final?: boolean;
  frames?: Array<{ sceneIndex: number; imageUrl?: string }>;
  storyboardJson?: string;
}

export interface WorkflowRunNode {
  nodeId: string;
  kind: string;
  status: WorkflowNodeRunStatus;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  outputs: WorkflowArtifact[];
}

export interface WorkflowCounts {
  done: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface WorkflowRun {
  _id: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowRunStatus;
  error?: string;
  counts?: WorkflowCounts;
  inputs: Record<string, string>;
  triggerRunId?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  isTerminal: boolean;
  nodes: WorkflowRunNode[];
  /** Flattened final deliverables (#508) — present on the run-detail response. */
  outputs?: WorkflowRunOutput[];
}

export type WorkflowRunProjection = Omit<WorkflowRun, "nodes"> & { nodes?: never };

interface WorkflowRunStartResponse {
  runId: string;
  triggerRunId: string;
}

export interface WorkflowRunDeps {
  get: (path: string) => Promise<ApiResponse<unknown>>;
  post: (path: string, body: unknown) => Promise<ApiResponse<unknown>>;
  readFile: (path: string) => string;
  writeFile: (path: string, text: string) => void;
  poll: (opts: PollOptions) => Promise<PollResult>;
}

export interface FlowResult {
  code: number;
  lines: string[];
}

interface RunFlowOptions {
  inputs: Record<string, string>;
  wait: boolean;
  json: boolean;
  onProgressLine?: (line: string) => void;
}

const LIST_PATH = "/api/v2/workflows";
const RUN_PATH = "/api/v2/workflows/run";
const STATUS_PATH = "/api/v2/workflow";
const EXPORT_PATH = "/api/v2/workflows/export";
const IMPORT_PATH = "/api/v2/workflows/import";
const DESCRIBE_PATH = "/api/v2/workflows/describe";
const CATALOG_PATH = "/api/v2/workflows/catalog";

const VALUE_FLAGS = new Set(["id", "input", "out", "category", "slug", "update"]);

const defaultDeps: WorkflowRunDeps = {
  get: (path) => apiGet<unknown>(path),
  post: (path, body) => apiPost<unknown>(path, body),
  readFile: (path) => fs.readFileSync(path, "utf-8"),
  writeFile: (path, text) => fs.writeFileSync(path, text, "utf-8"),
  poll: (opts) => pollUntilDone(opts),
};

// ── Pure helpers ─────────────────────────────────────────────────────────

function asErrorResult(res: ApiResponse<unknown>, json: boolean): FlowResult {
  return {
    code: 1,
    lines: json
      ? [JSON.stringify({ ok: false, status: res.status, data: res.data })]
      : [formatError(res)],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dateOnly(value: string | number | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString().slice(0, 10);
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)),
  );
  const fmt = (row: string[]) =>
    row.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
  return [fmt(headers), fmt(headers.map((h) => "-".repeat(h.length))), ...rows.map(fmt)].join("\n");
}

function statusIcon(status: string | undefined): string {
  if (status === "completed" || status === "done") return "✓";
  if (status === "failed") return "✗";
  if (status === "skipped") return "-";
  return "…";
}

function truncateText(text: string, max = 200): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3).trimEnd()}...`;
}

function formatCounts(counts: WorkflowCounts | undefined): string {
  if (!counts) return "";
  return `done=${counts.done}/${counts.total}, failed=${counts.failed}, skipped=${counts.skipped}`;
}

function outputLines(output: WorkflowArtifact): string[] {
  if (output.type === "text") return [`    text: ${truncateText(output.text)}`];
  if (output.type === "primer") {
    return [`    primer:${output.primerKind}: ${truncateText(output.text)}`];
  }
  return [`    image: ${output.imageUrl ?? output.storageId}`];
}

function progressLine(node: WorkflowRunNode): string {
  const err = node.error ? ` — error: ${node.error}` : "";
  return `  ${statusIcon(node.status)} ${node.nodeId} (${node.kind}) ${node.status}${err}`;
}

/**
 * Expand a single `--input` value (#508):
 *   - `@@literal` → the literal text `@literal` (one `@` stripped, escape hatch).
 *   - `@path`     → the contents of the file at `path` (resolved from the cwd by
 *                   `readFile`); a missing/unreadable file throws, naming the path.
 *   - anything else is returned untouched.
 * `readFile` is optional so the pure parser stays testable; the run command
 * always injects `deps.readFile`.
 */
function expandInputValue(
  key: string,
  value: string,
  readFile?: (path: string) => string,
): string {
  if (value.startsWith("@@")) return value.slice(1);
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`--input ${key}: could not read file "${filePath}": ${msg}`);
    }
  }
  return value;
}

export function parseInputFlags(
  args: string[],
  readFile?: (path: string) => string,
): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let raw: string | undefined;
    if (arg === "--input") {
      raw = args[i + 1];
      i++;
    } else if (arg.startsWith("--input=")) {
      raw = arg.slice("--input=".length);
    } else {
      continue;
    }

    if (!raw) throw new Error("--input requires key=value");
    const eq = raw.indexOf("=");
    if (eq <= 0) throw new Error(`--input must be key=value (got "${raw}")`);
    const key = raw.slice(0, eq).trim();
    if (!key) throw new Error(`--input must include a key (got "${raw}")`);
    inputs[key] = expandInputValue(key, raw.slice(eq + 1), readFile);
  }
  return inputs;
}

export function formatWorkflowList(workflows: WorkflowListItem[]): string {
  if (workflows.length === 0) return "No workflows found for the active brand.";
  return table(
    ["name", "nodes", "edges", "updated", "id"],
    workflows.map((w) => [
      // Badge a cross-brand row so it's clear it lives in another brand (#523).
      w.isCrossBrand && w.homeBrandName ? `${w.name} · from ${w.homeBrandName}` : w.name,
      String(w.nodeCount),
      String(w.edgeCount),
      dateOnly(w.updatedAt),
      w._id,
    ]),
  );
}

export function formatRecentRuns(runs: WorkflowRunProjection[]): string {
  if (runs.length === 0) return "No workflow runs found for the active brand.";
  return table(
    ["workflow", "status", "created", "id"],
    runs.map((r) => [r.workflowName, r.status, dateOnly(r.createdAt), r._id]),
  );
}

export function formatImportSummary(
  result: WorkflowImportResult,
  mode: { dryRun?: boolean; update?: boolean } = {},
): string {
  const lines: string[] = [];
  const heading = mode.dryRun
    ? "Workflow import preview:"
    : result.created
      ? "Workflow imported."
      : mode.update
        ? "Workflow updated."
        : "Workflow import preview:";
  lines.push(heading);
  lines.push(`name:        ${result.name}`);
  if (result.workflowId) lines.push(`workflowId:  ${result.workflowId}`);
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
    for (const warning of result.warnings) lines.push(`  ${warning}`);
  }

  return lines.join("\n");
}

export function formatWorkflowRun(run: WorkflowRun): string {
  const lines: string[] = [];
  const counts = formatCounts(run.counts);
  lines.push(`Workflow run — ${run.workflowName}`);
  lines.push(`runId:        ${run._id}`);
  lines.push(`workflowId:   ${run.workflowId}`);
  if (run.triggerRunId) lines.push(`triggerRunId: ${run.triggerRunId}`);
  lines.push(`verdict:      ${run.status}${counts ? ` (${counts})` : ""}`);
  if (run.isTerminal) lines.push("terminal:     yes");
  if (run.error) lines.push(`error:        ${run.error}`);
  if (Object.keys(run.inputs ?? {}).length > 0) {
    const inputs = Object.entries(run.inputs).map(([k, v]) => `${k}=${v}`).join(", ");
    lines.push(`inputs:       ${inputs}`);
  }

  if (run.nodes.length > 0) {
    lines.push("");
    lines.push(`Nodes (${run.nodes.length}):`);
    for (const node of run.nodes) {
      lines.push(progressLine(node));
      for (const output of node.outputs) lines.push(...outputLines(output));
    }
  }

  if (run.outputs && run.outputs.length > 0) {
    lines.push("");
    lines.push(`Outputs (${run.outputs.length}):`);
    for (const output of run.outputs) lines.push(...runOutputLines(output));
  }

  return lines.join("\n");
}

/** Render one flattened final deliverable — the chaining surface (#508). */
function runOutputLines(output: WorkflowRunOutput): string[] {
  const slug = output.botSlug ? ` (${output.botSlug})` : "";
  if (output.type === "image") {
    return [`  ${output.label} [image]${slug}: ${output.imageUrl ?? output.imageId ?? "(no url)"}`];
  }
  // #539 media deliverables — one line each; the JSON output carries full detail.
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
  const note =
    normalized.length > 400 ? "\n    (truncated — use --json for the full text)" : "";
  return [`  ${output.label} [text]${slug}:`, `    ${body}${note}`];
}

// ── describe rendering (#506) ────────────────────────────────────────────

export function formatDescribe(res: WorkflowDescribeResponse): string {
  const lines: string[] = [];
  lines.push(`Workflow — ${res.name}`);
  lines.push(`workflowId:  ${res.workflowId}`);
  if (res.description) lines.push(`description:  ${res.description}`);
  lines.push(`updated:     ${dateOnly(res.updatedAt)}`);

  lines.push("");
  lines.push(`Inputs (${res.inputs.length}):`);
  if (res.inputs.length === 0) {
    lines.push("  (none — this workflow takes no run inputs)");
  } else {
    for (const input of res.inputs) {
      const req = input.required ? "required" : "optional";
      const bundle =
        input.bundleSize !== undefined ? `, bundle=${input.bundleSize}` : "";
      lines.push(`  ${input.fieldName} — ${input.source}, ${req}${bundle}`);
      if (input.description) lines.push(`      ${input.description}`);
    }
  }

  lines.push("");
  lines.push(`Prerequisites (${res.prerequisites.length}):`);
  if (res.prerequisites.length === 0) {
    lines.push("  (none — no stored primers required)");
  } else {
    for (const prereq of res.prerequisites) {
      const mark = prereq.stored ? "✓ stored" : "✗ MISSING";
      lines.push(`  ${mark}  ${prereq.primerKind} primer  (nodes: ${prereq.nodeIds.join(", ")})`);
    }
    const missing = res.prerequisites.filter((p) => !p.stored);
    if (missing.length > 0) {
      lines.push("");
      lines.push(
        `  ✗ ${missing.length} primer(s) not stored for this brand — add ${missing
          .map((p) => `"${p.primerKind}"`)
          .join(", ")} before running, or those nodes fail.`,
      );
    }
  }

  lines.push("");
  lines.push(`Outputs (${res.outputs.length}):`);
  if (res.outputs.length === 0) {
    lines.push("  (none wired into an Output node)");
  } else {
    for (const output of res.outputs) {
      const slug = output.botSlug ? ` (${output.botSlug})` : "";
      lines.push(`  ${output.label} [${output.type}]${slug}`);
    }
  }

  return lines.join("\n");
}

// ── bot catalog rendering (#507) ──────────────────────────────────────────

function formatBotVocabulary(catalog: WorkflowCatalog): string {
  const v = catalog.vocabulary;
  const lines: string[] = [];
  lines.push("Vocabulary:");
  lines.push(`  node kinds:    ${v.nodeKinds.join(", ")}`);
  lines.push(`  brief sources: ${v.briefSources.join(", ")}`);
  lines.push(`  primer kinds:  ${v.primerKinds.join(", ")}`);
  lines.push(`  image models:  ${v.imageModels.join(", ")}`);
  lines.push(`  aspect ratios: ${v.aspectRatios.join(", ")}`);
  lines.push(
    `  custom bot:    set a bot node's slug to "${catalog.customBot.slug}" and ` +
      `config.${catalog.customBot.configKey}=<genesis-slug> to reach any bot not listed here.`,
  );
  return lines.join("\n");
}

export function formatBotsList(
  catalog: WorkflowCatalog,
  category?: string,
): string {
  const bots = category
    ? catalog.bots.filter((b) => b.category === category)
    : catalog.bots;
  if (bots.length === 0) {
    const known = catalog.vocabulary.categories.map((c) => c.id).join(", ");
    return category
      ? `No bots in category "${category}". Known categories: ${known}`
      : "No bots in the catalog.";
  }

  const lines: string[] = [];
  let currentCategory: string | null = null;
  for (const bot of bots) {
    if (bot.category !== currentCategory) {
      if (currentCategory !== null) lines.push("");
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

export function formatBotDetail(bot: CatalogBot): string {
  const lines: string[] = [];
  lines.push(`${bot.name}  (slug: ${bot.slug})`);
  lines.push(`category:    ${bot.categoryLabel} (${bot.category})`);
  lines.push(`blurb:       ${bot.blurb}`);
  lines.push(`outputType:  ${bot.outputType}`);
  lines.push(`splits:      ${bot.splitsOutput ? "yes (can split into per-item deliverables)" : "no"}`);

  lines.push("");
  lines.push(`Input ports (${bot.inputs.length}):`);
  if (bot.inputs.length === 0) {
    lines.push("  (none)");
  } else {
    for (const input of bot.inputs) {
      const bits = [`accepts ${input.accepts.join("/")}`, input.required ? "required" : "optional"];
      if (input.multi) bits.push("multi");
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
  } else {
    for (const param of bot.params) {
      const bits: string[] = [param.kind];
      if (param.options && param.options.length > 0) bits.push(`options: ${param.options.join("|")}`);
      if (param.min !== undefined) bits.push(`min ${param.min}`);
      if (param.max !== undefined) bits.push(`max ${param.max}`);
      if (param.required) bits.push("required");
      if (param.default !== undefined) bits.push(`default "${param.default}"`);
      lines.push(`  config.${param.key} — ${param.label} (${bits.join(", ")})`);
      if (param.help) lines.push(`      ${param.help}`);
    }
  }

  return lines.join("\n");
}

// ── import error rendering (#509/#510) ────────────────────────────────────

/** A compiler-style line per graph issue, with an indented remedy when present. */
function graphIssueLines(issue: GraphIssue): string[] {
  const node = issue.nodeId ? ` [node ${issue.nodeId}]` : "";
  const port = issue.portId ? ` [port ${issue.portId}]` : "";
  const edge = !issue.nodeId && issue.edgeId ? ` [edge ${issue.edgeId}]` : "";
  const out = [`${issue.code}${node}${edge}${port}: ${issue.message}`];
  if (issue.remedy) out.push(`  fix: ${issue.remedy}`);
  return out;
}

/** Human rendering for every import error code (INVALID_GRAPH / CONFLICT / …). */
function formatImportError(res: ApiResponse<unknown>): string {
  const data = isRecord(res.data) ? res.data : {};
  const err = isRecord(data.error) ? data.error : {};
  const code = typeof err.code === "string" ? err.code : undefined;
  const message = typeof err.message === "string" ? err.message : "Import failed";

  if (code === "INVALID_GRAPH") {
    const issues = Array.isArray(data.issues) ? (data.issues as GraphIssue[]) : [];
    const lines = [`Import rejected — invalid graph: ${message}`];
    if (issues.length > 0) {
      lines.push("");
      lines.push(`Issues (${issues.length}):`);
      for (const issue of issues) lines.push(...graphIssueLines(issue));
    }
    return lines.join("\n");
  }

  if (code === "CONFLICT") {
    const lines = [`Import conflict — ${message}`];
    if (typeof data.currentUpdatedAt === "string") {
      lines.push(`current updatedAt: ${data.currentUpdatedAt}`);
    }
    const remedy =
      typeof data.remedy === "string"
        ? data.remedy
        : "Re-export the workflow, reapply your edits, and import again with the fresh updatedAt.";
    lines.push(`fix: ${remedy}`);
    return lines.join("\n");
  }

  // FORBIDDEN / NOT_FOUND / BAD_REQUEST / anything else → the shared clean render.
  return formatError(res);
}

// ── Network-touching flows (dependency-injected for tests) ───────────────

export async function resolveWorkflowId(ref: string, deps: WorkflowRunDeps): Promise<string> {
  const res = await deps.get(LIST_PATH);
  if (!res.ok) throw new Error(formatError(res));
  const workflows = (res.data as WorkflowListResponse).workflows ?? [];
  const match = workflows.find((w) => w.name.toLowerCase() === ref.toLowerCase());
  return match?._id ?? ref;
}

export async function listFlow(json: boolean, deps: WorkflowRunDeps): Promise<FlowResult> {
  const res = await deps.get(LIST_PATH);
  if (!res.ok) return asErrorResult(res, json);
  const data = res.data as WorkflowListResponse;
  return {
    code: 0,
    lines: json ? [JSON.stringify(data)] : [formatWorkflowList(data.workflows ?? [])],
  };
}

export async function describeFlow(
  workflowRef: string,
  opts: { json: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  let workflowId: string;
  try {
    workflowId = await resolveWorkflowId(workflowRef, deps);
  } catch (e) {
    return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
  }

  const res = await deps.get(`${DESCRIBE_PATH}?id=${encodeURIComponent(workflowId)}`);
  if (!res.ok) return asErrorResult(res, opts.json);
  if (opts.json) return { code: 0, lines: [JSON.stringify(res.data)] };
  return { code: 0, lines: [formatDescribe(res.data as WorkflowDescribeResponse)] };
}

export async function botsFlow(
  opts: { category?: string; slug?: string; json: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const res = await deps.get(CATALOG_PATH);
  if (!res.ok) return asErrorResult(res, opts.json);
  const catalog = res.data as WorkflowCatalog;

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

  // --json (with or without --category) always emits the FULL catalog verbatim.
  if (opts.json) return { code: 0, lines: [JSON.stringify(catalog)] };
  return { code: 0, lines: [formatBotsList(catalog, opts.category)] };
}

export async function runFlow(
  workflowRef: string,
  opts: RunFlowOptions,
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  let workflowId: string;
  try {
    workflowId = await resolveWorkflowId(workflowRef, deps);
  } catch (e) {
    return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
  }

  const body = {
    workflowId,
    ...(Object.keys(opts.inputs).length > 0 ? { inputs: opts.inputs } : {}),
  };
  const start = await deps.post(RUN_PATH, body);
  if (!start.ok) return asErrorResult(start, opts.json);

  const data = start.data as WorkflowRunStartResponse;
  const base = { ...data, workflowId };
  if (opts.json && !opts.wait) return { code: 0, lines: [JSON.stringify(base)] };

  const lines = opts.json
    ? []
    : [
        "Workflow run started.",
        `runId:        ${data.runId}`,
        `triggerRunId: ${data.triggerRunId}`,
        `Poll: exodus workflow status --id ${data.runId}`,
      ];

  if (!opts.wait) return { code: 0, lines };

  if (!opts.json && opts.onProgressLine) {
    for (const line of lines) opts.onProgressLine(line);
    lines.length = 0;
  }

  const seen = new Map<string, WorkflowNodeRunStatus>();
  let pausedNotified = false;
  const pollResult = await deps.poll({
    path: `${STATUS_PATH}?runId=${encodeURIComponent(data.runId)}`,
    intervalMs: 3_000,
    timeoutMs: 60 * 60 * 1000,
    // "canceled" is terminal (#539) so a web-canceled run stops the wait instead
    // of polling to timeout. "awaiting-review" stays NONterminal — the run
    // resumes after a web approval — but we surface it once (below) so the
    // operator knows to go approve the cost gate.
    terminalStatuses: ["completed", "partial", "failed", "canceled"],
    onProgress: (raw) => {
      if (opts.json || !opts.onProgressLine) return;
      if (raw["status"] === "awaiting-review" && !pausedNotified) {
        pausedNotified = true;
        opts.onProgressLine(
          "  ⏸ paused at the cost gate — approve or edit the storyboard in the web app to continue.",
        );
      }
      const nodes = Array.isArray(raw["nodes"]) ? (raw["nodes"] as WorkflowRunNode[]) : [];
      for (const node of nodes) {
        if (seen.get(node.nodeId) === node.status) continue;
        seen.set(node.nodeId, node.status);
        opts.onProgressLine(progressLine(node));
      }
    },
  });

  if (opts.json) {
    return {
      code: pollResult.ok ? 0 : 1,
      lines: [JSON.stringify({ ...base, result: pollResult.data, timedOut: pollResult.timedOut })],
    };
  }

  if (pollResult.timedOut) {
    lines.push(`Timed out waiting. Check later: exodus workflow status --id ${data.runId}`);
    return { code: 1, lines };
  }

  lines.push("");
  if (isRecord(pollResult.data) && typeof pollResult.data["_id"] === "string") {
    lines.push(formatWorkflowRun(pollResult.data as unknown as WorkflowRun));
  } else {
    lines.push(`Polling failed: ${JSON.stringify(pollResult.data)}`);
  }

  return { code: pollResult.ok ? 0 : 1, lines };
}

export async function statusFlow(
  opts: { id?: string; json: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const path = opts.id ? `${STATUS_PATH}?runId=${encodeURIComponent(opts.id)}` : STATUS_PATH;
  const res = await deps.get(path);
  if (!res.ok) return asErrorResult(res, opts.json);
  if (opts.json) return { code: 0, lines: [JSON.stringify(res.data)] };

  if (opts.id) return { code: 0, lines: [formatWorkflowRun(res.data as WorkflowRun)] };
  const runs = ((res.data as { runs?: WorkflowRunProjection[] }).runs ?? []);
  return { code: 0, lines: [formatRecentRuns(runs)] };
}

export async function exportFlow(
  workflowRef: string,
  opts: { out?: string },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  let workflowId: string;
  try {
    workflowId = await resolveWorkflowId(workflowRef, deps);
  } catch (e) {
    return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
  }

  const res = await deps.get(`${EXPORT_PATH}?id=${encodeURIComponent(workflowId)}`);
  if (!res.ok) return asErrorResult(res, false);
  const doc = JSON.stringify(res.data, null, 2);
  if (opts.out) {
    deps.writeFile(opts.out, `${doc}\n`);
    return { code: 0, lines: [`Wrote workflow contract to ${opts.out}.`] };
  }
  return { code: 0, lines: [doc] };
}

export async function importFlow(
  file: string,
  opts: { dryRun: boolean; json: boolean; update?: string },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  let text: string;
  try {
    text = deps.readFile(file);
  } catch {
    return { code: 1, lines: [`Error: file not found: ${file}`] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { code: 1, lines: [`Error: ${file} is not valid JSON: ${msg}`] };
  }

  if (!isRecord(parsed)) {
    return { code: 1, lines: [`Error: ${file} is not a workflow contract (expected a JSON object).`] };
  }

  // The contract carries workflowId/updatedAt as meta (the backend peels them
  // into meta); strip only the transport control fields so a hand-edited file
  // can't smuggle them in.
  const body: Record<string, unknown> = { ...parsed };
  delete body.dryRun;
  delete body.targetWorkflowId;
  delete body.expectedUpdatedAt;
  if (opts.dryRun) body.dryRun = true;

  if (opts.update) {
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined;
    if (!updatedAt) {
      return {
        code: 1,
        lines: [
          `Error: ${file} has no "updatedAt" anchor, so drift can't be detected. ` +
            `Re-export the workflow first (exodus workflow export <id> --out ${file}) and retry --update.`,
        ],
      };
    }
    body.targetWorkflowId = opts.update;
    body.expectedUpdatedAt = updatedAt;
  }

  const res = await deps.post(IMPORT_PATH, body);
  if (!res.ok) {
    return {
      code: 1,
      lines: opts.json
        ? [JSON.stringify({ ok: false, status: res.status, data: res.data })]
        : [formatImportError(res)],
    };
  }
  const data = res.data as WorkflowImportResult;
  return {
    code: 0,
    lines: opts.json
      ? [JSON.stringify(data)]
      : [formatImportSummary(data, { dryRun: opts.dryRun, update: !!opts.update })],
  };
}

// ── Command dispatch ─────────────────────────────────────────────────────

function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

function parsePositional(args = process.argv.slice(3)): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2).split("=", 1)[0] ?? "";
      if (!arg.includes("=") && VALUE_FLAGS.has(key)) i += 2;
      else i++;
      continue;
    }
    out.push(arg);
    i++;
  }
  return out;
}

async function printResult(result: FlowResult): Promise<void> {
  for (const line of result.lines) console.log(line);
  if (result.code !== 0) process.exit(result.code);
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  const positional = parsePositional();
  const [sub, ...rest] = positional;
  const json = !!flags["json"];

  if (!sub) {
    console.log(helpText);
    return;
  }

  if (sub === "list") return printResult(await listFlow(json, defaultDeps));

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
    return printResult(
      await botsFlow(
        { category: flagString(flags, "category"), slug: flagString(flags, "slug"), json },
        defaultDeps,
      ),
    );
  }

  if (sub === "run") {
    const workflowRef = rest[0];
    if (!workflowRef) {
      console.error("Error: workflow run requires <workflowId|name>.");
      console.log("Usage: exodus workflow run <workflowId|name> [--input key=value ...] [--wait] [--json]");
      process.exit(1);
    }
    let inputs: Record<string, string>;
    try {
      inputs = parseInputFlags(process.argv.slice(3), defaultDeps.readFile);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    return printResult(
      await runFlow(
        workflowRef,
        {
          inputs,
          wait: flags["wait"] === true,
          json,
          onProgressLine: (line) => console.log(line),
        },
        defaultDeps,
      ),
    );
  }

  if (sub === "status") {
    return printResult(await statusFlow({ id: flagString(flags, "id"), json }, defaultDeps));
  }

  if (sub === "export") {
    const workflowRef = rest[0];
    if (!workflowRef) {
      console.error("Error: workflow export requires <workflowId|name>.");
      console.log("Usage: exodus workflow export <workflowId|name> [--out <file>]");
      process.exit(1);
    }
    return printResult(await exportFlow(workflowRef, { out: flagString(flags, "out") }, defaultDeps));
  }

  if (sub === "import") {
    const file = rest[0];
    if (!file) {
      console.error("Error: workflow import requires <file>.");
      console.log("Usage: exodus workflow import <file> [--update <workflowId>] [--dry-run] [--json]");
      process.exit(1);
    }
    return printResult(
      await importFlow(
        file,
        { dryRun: flags["dry-run"] === true, json, update: flagString(flags, "update") },
        defaultDeps,
      ),
    );
  }

  console.error(`Unknown subcommand: "${sub}"\n`);
  console.log(helpText);
  process.exit(1);
}
