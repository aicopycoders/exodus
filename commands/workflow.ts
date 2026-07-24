import fs from "node:fs";
import {
  apiGet,
  apiGetText,
  apiPost,
  apiPostDashboard,
  getDashboardUrl,
  type ApiResponse,
} from "../lib/client.js";
import { formatError } from "../lib/format.js";
import { pollUntilDone, type PollOptions, type PollResult } from "../lib/poll.js";
import { workflowToYaml, parseWorkflowText } from "../lib/workflowText.js";
import { missingRouteLine } from "../lib/route-support.js";
import { getChannel, type Channel } from "../lib/channel.js";

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
  // #855 (MS-1): the Push node — mirror of convex NODE_KINDS.
  | "push"
  // #856 (MS-2): the Gate node — mirror of convex NODE_KINDS.
  | "gate"
  // #861 (MS-7): the Call node — mirror of convex NODE_KINDS.
  | "call"
  // #603 Video-module member-gate kinds (module templates only — the CLI
  // never authors them, but describe/export must round-trip them).
  | "show-set"
  | "show-cast"
  | "show-voices"
  | "product-truth"
  // #857 (MS-3): the Transform node — mirror of convex NODE_KINDS.
  | "transform";

/**
 * #861 (MS-7): a workflow's exposed input slot — mirror of convex/lib/workflow/
 * graph.ts WorkflowSlot. Kept in lockstep so an export/import round-trips slots.
 */
export type WorkflowSlotState = "locked" | "auto" | "ask" | "inferred";
export interface WorkflowSlot {
  id: string;
  label: string;
  state: WorkflowSlotState;
  nodeId: string;
  configKey: string;
  value?: string;
  hint?: string;
}

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

/**
 * #862 (MS-8): a workflow's automatic trigger — mirror of convex/lib/workflow/
 * graph.ts WorkflowTrigger (a workflow PROPERTY, not a node). Kept in lockstep
 * so an export/import round-trips triggers.
 */
// The event vocabulary — mirror of convex WORKFLOW_TRIGGER_EVENTS. A literal
// union (not string) so the mutual-assignment pin holds; a new platform event
// is a one-line addition here in lockstep with the convex catalog.
export type WorkflowTriggerEvent = "winner-promoted";
export type WorkflowTrigger =
  | { type: "event"; event: WorkflowTriggerEvent; enabled: boolean }
  | { type: "cron"; cron: string; enabled: boolean };

export interface WorkflowContractJson {
  contract: "exodus-workflow";
  version: number;
  /** Update anchors (#509) — present on exports; PURELY meta, not graph. */
  workflowId?: string;
  updatedAt?: string;
  name: string;
  description?: string;
  /** #861 (MS-7): exposed slots — optional, omitted when absent (mirror). */
  slots?: WorkflowSlot[];
  /** #862 (MS-8): triggers — optional, omitted when absent (mirror). */
  triggers?: WorkflowTrigger[];
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
  | "session-fan-out"
  | "cycle"
  | "missing-required-input"
  | "bad-config"
  // #861 (MS-7): a defect in a workflow's exposed slot sheet.
  | "bad-slot"
  // #862 (MS-8): a malformed workflow trigger (unknown event / invalid cron).
  | "bad-trigger";

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
  | "show"
  // #855 (MS-1): the session handle wire (session-mode Bot → Push node).
  | "session";
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
  /** Per-model legal config.aspectRatio values (#892 — validator envelope). */
  aspectRatios: string[];
  /** Per-model legal config.resolution values (Kling's are modes std/pro). */
  resolutions: string[];
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
  promptBot: {
    slug: "prompt";
    configKey: "promptText";
    inputs: CatalogInput[];
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
  /** #855: the producing output port ("last"/"all" on a Push node) — lets a
   *  consumer keep a multi-port node's deliverables apart. */
  port?: string;
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

// ── Template + schema on-ramp mirrors (#892) ──────────────────────────────

/**
 * One row of the templates list (GET /api/v2/workflows/templates). `module` is
 * present only on module-owned templates (e.g. "video"); the CLI badges those
 * and notes their runs start from the show surfaces. Contracts are omitted from
 * the list — fetch a single template's YAML/JSON with `?key=`.
 */
export interface WorkflowTemplateListItem {
  key: string;
  label: string;
  description: string;
  module?: string;
}

export interface WorkflowTemplatesResponse {
  templates: WorkflowTemplateListItem[];
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

/**
 * #894: one row of a workflow's saved-version history. `version` is a REAL,
 * 1-based identifier the server assigns on each save — NOT a display index, so
 * it is shown and passed to `export --version` unchanged.
 */
export interface WorkflowVersion {
  version: number;
  name: string;
  savedAt: string;
  savedByName?: string;
}

/** The versions HTTP response. Some wrappers return a bare array; handle both. */
export interface WorkflowVersionsResponse {
  versions: WorkflowVersion[];
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
  // #891 (gate cluster): a Gate node's selection-port candidates are text
  // artifacts carrying `port: "selection"`; `humanEdited` flips once a reviewer
  // hand-edits one. Both optional so non-gate text artifacts stay shape-compatible.
  | { type: "text"; text: string; label?: string; port?: string; humanEdited?: boolean }
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

/**
 * #893: a chat session spun up by a session-mode Bot during this run. The
 * status surface lists these so an operator/agent can continue the conversation
 * with `exodus session chat`. Optional — older backends omit the field.
 */
export interface WorkflowRunSession {
  sessionId: string;
  nodeId: string;
  title: string;
  botSlug: string;
}

/**
 * #891 (gate cluster): WHY a run parked. "taste" = a Gate-node review park (the
 * text-gate cluster acts on these); "repair" = a require-all collector stalled
 * on a dead input; "slots" = a nested child awaiting the member's slot answers;
 * "call" = a parent parked on a child (never actionable, filtered out of the
 * inbox). Absent on legacy video cost-gate parks.
 */
export type WorkflowPauseReason = "taste" | "repair" | "slots" | "call";

/**
 * #891 (gate cluster): a slot a "slots"-parked run awaits — mirror of convex
 * workflows.ts PendingSlot. Only `id` is load-bearing for the CLI answer verb.
 */
export interface WorkflowPendingSlot {
  id: string;
  label?: string;
  state?: string;
  nodeId?: string;
  configKey?: string;
  value?: string;
  hint?: string;
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
  /** #893: chat sessions this run opened (session-mode bots). */
  sessions?: WorkflowRunSession[];
  // #891 (gate cluster): the park surface. Present on a parked run-detail; the
  // gate/repair/answer verbs preflight against these.
  pauseReason?: WorkflowPauseReason;
  pausedNodeId?: string;
  pendingSlots?: WorkflowPendingSlot[];
}

export type WorkflowRunProjection = Omit<WorkflowRun, "nodes"> & { nodes?: never };

interface WorkflowRunStartResponse {
  runId: string;
  triggerRunId: string;
}

export interface WorkflowRunDeps {
  get: (path: string) => Promise<ApiResponse<unknown>>;
  // Raw-text GET (#892): preserves a non-JSON body byte-for-byte — the seam the
  // `templates export` verb uses so server-rendered YAML is written verbatim.
  getText: (path: string) => Promise<ApiResponse<string>>;
  post: (path: string, body: unknown) => Promise<ApiResponse<unknown>>;
  readFile: (path: string) => string;
  writeFile: (path: string, text: string) => void;
  poll: (opts: PollOptions) => Promise<PollResult>;
  // #891 (gate cluster): the gate "push" step-1 hits the Next.js dashboard chat
  // route (like `session chat`); optional so existing test deps stay valid.
  postDashboard?: (
    path: string,
    body: unknown,
    opts?: { timeoutMs?: number },
  ) => Promise<ApiResponse<unknown>>;
  // The dashboard base URL for the "resolve in the app" pause pointer + reject
  // fallbacks. Optional: waitForRun falls back to resolving it from the API URL.
  dashboardUrl?: string;
}

export interface FlowResult {
  code: number;
  lines: string[];
}

interface RunFlowOptions {
  inputs: Record<string, string>;
  // #860: scope the run to the upstream closure of these terminal node ids.
  // Empty / undefined runs the whole graph (unchanged behavior).
  terminalNodeIds?: string[];
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
// #893 (MS-8 triggers): set-enabled + fire. LIST reads the export contract's
// `.triggers` (describe doesn't carry them) — so no separate list path here.
const TRIGGERS_SET_ENABLED_PATH = "/api/v2/workflows/triggers/set-enabled";
const TRIGGERS_FIRE_PATH = "/api/v2/workflows/triggers/fire";
// #892 authoring on-ramps: two new pure-read routes.
const TEMPLATES_PATH = "/api/v2/workflows/templates";
const SCHEMA_PATH = "/api/v2/workflows/schema";
// #894: version history (up to 50, newest-first) + versioned export.
const VERSIONS_PATH = "/api/v2/workflows/versions";
const VERSIONS_CAP = 50;
// #891 (gate cluster): the review inbox + gate/repair/answer action routes.
const INBOX_PATH = "/api/v2/workflow/inbox";
const APPROVE_PATH = "/api/v2/workflow/approve";
const GATE_PICK_PATH = "/api/v2/workflow/gate/pick";
const GATE_EDIT_PATH = "/api/v2/workflow/gate/edit";
const GATE_APPEND_PATH = "/api/v2/workflow/gate/append-from-session";
const CANCEL_PATH = "/api/v2/workflow/cancel";
const ANSWER_PATH = "/api/v2/workflow/answer";
const REPAIR_RETRY_PATH = "/api/v2/workflow/repair/retry";
const REPAIR_SKIP_PATH = "/api/v2/workflow/repair/skip";
// The gate "push" step-1 hits the Next.js dashboard chat route (mirror of
// session chat). Bound the client a touch above the route's 300s maxDuration.
const CHAT_PATH = "/api/sessions/chat";
const CHAT_TIMEOUT_MS = 320_000;
// The run page in the web app — the "resolve in the app" pointer target.
const RUN_PAGE_PREFIX = "/runs/";

const VALUE_FLAGS = new Set([
  "id",
  "input",
  "out",
  "category",
  "slug",
  "update",
  "terminal",
  // #893: `workflow triggers <ref> fire --text "..."` takes a value.
  "text",
  // #892: schema section filters.
  "kind",
  "face",
  "version",
  // #891 (gate cluster): value-taking flags on the gate/repair/answer verbs, so
  // parsePositional skips their values when extracting positionals.
  "file",
  "reason",
  "slot",
]);

const defaultDeps: WorkflowRunDeps = {
  get: (path) => apiGet<unknown>(path),
  getText: (path) => apiGetText(path),
  post: (path, body) => apiPost<unknown>(path, body),
  readFile: (path) => fs.readFileSync(path, "utf-8"),
  writeFile: (path, text) => fs.writeFileSync(path, text, "utf-8"),
  poll: (opts) => pollUntilDone(opts),
  postDashboard: (path, body, opts) => apiPostDashboard<unknown>(path, body, opts),
  // getDashboardUrl honors an explicit EXODUS_DASHBOARD_URL override before the
  // API-URL auto-derive — the same target apiPostDashboard actually hits.
  dashboardUrl: getDashboardUrl(),
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
 * #891 (gate cluster): the pause banner a --wait loop prints once when a run
 * parks. The verb-specific "Resolve here" line is dispatched on `pauseReason`:
 *   - "taste" → the gate cluster
 *   - "repair" → the repair verb
 *   - "slots" → the answer verb
 *   - absent (legacy video cost-gate park) → keep the original storyboard copy.
 * `runId` + `dashboardUrl` build the "resolve in the app" pointer.
 */
export function formatPauseNotice(
  pauseReason: WorkflowPauseReason | undefined,
  runId: string,
  dashboardUrl: string,
): string[] {
  // Legacy cost-gate park — byte-identical to the pre-#891 wording.
  if (!pauseReason) {
    return [
      "  ⏸ paused at the cost gate — approve or edit the storyboard in the web app to continue.",
    ];
  }
  // A "call" park is a parent waiting on its child sub-workflow — NOTHING for
  // the member to do (the inbox filters these too). Never point at a verb that
  // would only refuse the run.
  if (pauseReason === "call") {
    return ["  ⏸ waiting on a child workflow run — it resumes on its own."];
  }
  const resolveVerb =
    pauseReason === "repair"
      ? `exodus workflow repair ${runId} retry|skip|kill`
      : pauseReason === "slots"
        ? `exodus workflow answer ${runId} --slot key=value`
        : // "taste" → the gate cluster.
          `exodus workflow gate ${runId}`;
  return [
    "  ⏸ paused for review — waiting on you.",
    `     Resolve here:  ${resolveVerb}`,
    `     Or in the app: ${dashboardUrl}${RUN_PAGE_PREFIX}${runId}`,
  ];
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

/**
 * Collect the repeatable `--terminal <nodeId>` flag (#860) into an ordered list
 * of node ids. Accepts both `--terminal id` and `--terminal=id`. An empty list
 * means "run the whole graph" (the flag was never passed). Mirrors the
 * `--input` repeat convention (parseInputFlags) so both flags read the raw argv.
 */
export function parseTerminalFlags(args: string[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let raw: string | undefined;
    if (arg === "--terminal") {
      raw = args[i + 1];
      i++;
    } else if (arg.startsWith("--terminal=")) {
      raw = arg.slice("--terminal=".length);
    } else {
      continue;
    }
    if (raw === undefined) throw new Error("--terminal requires a node id");
    const id = raw.trim();
    if (!id) throw new Error("--terminal requires a node id");
    ids.push(id);
  }
  return ids;
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

export function formatWorkflowVersions(versions: WorkflowVersion[]): string {
  if (versions.length === 0) {
    return "no saved versions yet — versions start recording on the workflow's next save";
  }
  // version numbers are REAL 1-based ids — printed verbatim, never a row index.
  const lines = versions.map((v) => {
    const by = v.savedByName ? ` · by ${v.savedByName}` : "";
    return `v${v.version} · ${v.name} · saved ${dateOnly(v.savedAt)}${by}`;
  });
  if (versions.length === VERSIONS_CAP) {
    lines.push("");
    lines.push(
      `(showing the ${VERSIONS_CAP} most recent versions — older versions may exist beyond this cap)`,
    );
  }
  return lines.join("\n");
}

export function formatImportSummary(
  result: WorkflowImportResult,
  mode: { dryRun?: boolean; update?: boolean; validate?: boolean } = {},
): string {
  const lines: string[] = [];
  // `validate` is import --dry-run under a different door (#879 ruling 3): same
  // server validation, only the heading changes from "dry-run preview" wording.
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

  // #893: continue any chat sessions this run opened.
  if (run.sessions && run.sessions.length > 0) {
    lines.push("");
    lines.push(`Sessions (${run.sessions.length}):`);
    for (const s of run.sessions) {
      lines.push(
        `  session: ${s.sessionId} · "${s.title}" · continue: exodus session chat ${s.sessionId} "..."`,
      );
    }
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
  lines.push(
    `  prompt bot:    set a bot node's slug to "${catalog.promptBot.slug}" and ` +
      `config.${catalog.promptBot.configKey}=<your instructions> — the prompt IS the bot ` +
      "(runs on the workspace's own LLM key, not Genesis).",
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

// ── templates rendering (#892) ────────────────────────────────────────────

/** First line only — the list stays one row per template. */
function firstLine(text: string): string {
  const nl = text.indexOf("\n");
  return (nl === -1 ? text : text.slice(0, nl)).trim();
}

export function formatTemplatesList(templates: WorkflowTemplateListItem[]): string {
  if (templates.length === 0) return "No workflow templates available on this backend.";
  const lines = [
    table(
      ["key", "label", "description"],
      templates.map((t) => [
        t.key,
        // Badge a module-owned template so it's clear its runs start elsewhere.
        t.module ? `${t.label} [${t.module} module]` : t.label,
        firstLine(t.description ?? ""),
      ]),
    ),
  ];
  if (templates.some((t) => t.module)) {
    lines.push("");
    lines.push(
      "Templates badged [<module> module] are owned by a module (e.g. video) — " +
        "their runs start from the show surfaces, not `workflow run`. Export one to " +
        "study or adapt its graph.",
    );
  }
  lines.push("");
  lines.push("Export one to start authoring: exodus workflow templates export <key> --out my.yaml");
  return lines.join("\n");
}

// ── schema rendering (#892) ───────────────────────────────────────────────
// The schema payload is treated as opaque-ish JSON: rendered generically so a
// future additive server field never breaks the human view. Known sections are
// printed in the reference-doc order; anything else the server adds is ignored
// by the human view but always present under --json.

const SCHEMA_LABEL_KEYS = ["kind", "face", "type", "name", "id", "code", "key", "label"] as const;

/** The identifying key/value of a schema entry object, if it has one. */
function schemaEntryLabel(entry: Record<string, unknown>): { key: string; value: string } | undefined {
  for (const key of SCHEMA_LABEL_KEYS) {
    const v = entry[key];
    if (typeof v === "string" && v) return { key, value: v };
  }
  return undefined;
}

/** Generic, resilient renderer for any JSON value under a schema section. */
function schemaValueLines(value: unknown, indent: string): string[] {
  if (value === null || value === undefined) return [`${indent}(none)`];
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}(none)`];
    const lines: string[] = [];
    for (const el of value) {
      if (isRecord(el)) {
        const label = schemaEntryLabel(el);
        if (label) {
          lines.push(`${indent}- ${label.value}`);
          const rest = { ...el };
          delete rest[label.key];
          lines.push(...schemaValueLines(rest, `${indent}    `));
        } else {
          lines.push(`${indent}-`);
          lines.push(...schemaValueLines(el, `${indent}    `));
        }
      } else {
        lines.push(`${indent}- ${String(el)}`);
      }
    }
    return lines;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${indent}(none)`];
    const lines: string[] = [];
    for (const [k, v] of entries) {
      if (isRecord(v) || Array.isArray(v)) {
        lines.push(`${indent}${k}:`);
        lines.push(...schemaValueLines(v, `${indent}    `));
      } else {
        lines.push(`${indent}${k}: ${String(v)}`);
      }
    }
    return lines;
  }
  return [`${indent}${String(value)}`];
}

// title → candidate payload keys, in the reference-doc section order.
const SCHEMA_SECTIONS: Array<{ title: string; keys: string[] }> = [
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

function schemaSectionValue(
  payload: Record<string, unknown>,
  keys: string[],
): { key: string; value: unknown } | undefined {
  for (const key of keys) {
    if (payload[key] !== undefined) return { key, value: payload[key] };
  }
  return undefined;
}

export function formatSchema(payload: Record<string, unknown>): string {
  const lines: string[] = [];
  const version = payload["version"];
  lines.push(`Workflow schema${version !== undefined ? ` (version ${version})` : ""}`);
  for (const section of SCHEMA_SECTIONS) {
    const found = schemaSectionValue(payload, section.keys);
    if (!found) continue;
    lines.push("");
    lines.push(`${section.title}:`);
    lines.push(...schemaValueLines(found.value, "  "));
  }
  return lines.join("\n");
}

/** Collect the identifiers of a schema list section (for filter miss messages). */
function schemaEntryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const el of value) {
    if (isRecord(el)) {
      const label = schemaEntryLabel(el);
      if (label) ids.push(label.value);
    } else if (typeof el === "string") {
      ids.push(el);
    }
  }
  return ids;
}

/**
 * Render just one entry of a list-shaped schema section, matched by identifier.
 * `label` names the axis ("kind"/"face") for the not-found message. Returns a
 * FlowResult so the miss is a clean exit-1 line listing the valid values.
 */
function formatSchemaFilter(
  payload: Record<string, unknown>,
  sectionKeys: string[],
  axis: string,
  wanted: string,
): FlowResult {
  const found = schemaSectionValue(payload, sectionKeys);
  const list = found && Array.isArray(found.value) ? found.value : [];
  const match = list.find((el) => {
    if (!isRecord(el)) return typeof el === "string" && el === wanted;
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
    if (label) delete rest[label.key];
    lines.push(...schemaValueLines(rest, "  "));
  }
  return { code: 0, lines };
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
    // #860: scope the run to the upstream closure of these terminals. Omitted
    // when no --terminal was passed, so an unscoped run's body is byte-identical.
    ...(opts.terminalNodeIds && opts.terminalNodeIds.length > 0
      ? { terminalNodeIds: opts.terminalNodeIds }
      : {}),
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

  const waited = await waitForRun(
    data.runId,
    { json: opts.json, onProgressLine: opts.onProgressLine, jsonBase: base },
    deps,
  );
  // In --json mode waitForRun's single line is complete on its own. In human
  // mode, prepend whatever start lines weren't already streamed via onProgress.
  if (opts.json) return waited;
  return { code: waited.code, lines: [...lines, ...waited.lines] };
}

/**
 * #893: the shared run-wait loop used by `workflow run --wait` and
 * `workflow triggers … fire --wait`. Polls the status endpoint to a terminal
 * state, streaming per-node progress (and the cost-gate pause line once) via
 * `onProgressLine` in human mode. Returns the terminal render:
 *   - --json: one line, `{ ...jsonBase, result, timedOut }`.
 *   - human:  a timeout pointer, or ["", formatWorkflowRun(run)].
 */
async function waitForRun(
  runId: string,
  opts: {
    json: boolean;
    onProgressLine?: (line: string) => void;
    jsonBase: Record<string, unknown>;
  },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const seen = new Map<string, WorkflowNodeRunStatus>();
  let pausedNotified = false;
  const pollResult = await deps.poll({
    path: `${STATUS_PATH}?runId=${encodeURIComponent(runId)}`,
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
        // #891: dispatch the pause banner on WHY the run parked. The dashboard
        // URL comes from the injected deps (override → dev.xo → xo, same
        // resolution the dashboard client uses), with a fallback for deps that
        // don't carry it.
        const dashboardUrl = deps.dashboardUrl ?? getDashboardUrl();
        const pauseReason = raw["pauseReason"] as WorkflowPauseReason | undefined;
        for (const line of formatPauseNotice(pauseReason, runId, dashboardUrl)) {
          opts.onProgressLine(line);
        }
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
  // #894: --version pins the export to a saved historical version (real 1-based
  // id). Omitted → the head export (the only export that carries triggers).
  opts: { out?: string; json?: boolean; version?: number },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  let workflowId: string;
  try {
    workflowId = await resolveWorkflowId(workflowRef, deps);
  } catch (e) {
    return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
  }

  const versionParam =
    opts.version !== undefined ? `&version=${encodeURIComponent(String(opts.version))}` : "";
  const res = await deps.get(
    `${EXPORT_PATH}?id=${encodeURIComponent(workflowId)}${versionParam}`,
  );
  if (!res.ok) return asErrorResult(res, false);
  // The GET still returns the JSON contract; the wire form is chosen locally.
  // Default: canonical YAML (workflowToYaml). --json: the legacy pretty JSON,
  // byte-exact with every prior release, for tools that still parse it.
  const doc = opts.json
    ? JSON.stringify(res.data, null, 2)
    : workflowToYaml(res.data as WorkflowContractJson);
  if (opts.out) {
    // YAML from js-yaml already ends in a newline; JSON does not — normalize to
    // exactly one trailing newline either way.
    const text = doc.endsWith("\n") ? doc : `${doc}\n`;
    deps.writeFile(opts.out, text);
    return { code: 0, lines: [`Wrote workflow contract to ${opts.out}.`] };
  }
  // printResult console.logs each line (appending "\n") — strip the YAML dump's
  // own terminator so `export … > file` stays byte-identical to --out.
  return { code: 0, lines: [doc.endsWith("\n") ? doc.slice(0, -1) : doc] };
}

/**
 * Validate the `--version <n>` flag client-side: it must be a positive integer
 * (a real 1-based version id). Returns the parsed number, or undefined when the
 * flag is absent; throws with a clear message on a non-positive/non-integer.
 */
export function parseVersionFlag(flags: Record<string, string | boolean>): number | undefined {
  const raw = flags["version"];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") throw new Error("--version requires a positive integer");
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--version must be a positive integer (got "${raw}")`);
  }
  return n;
}

export async function versionsFlow(
  workflowRef: string,
  opts: { json: boolean },
  deps: WorkflowRunDeps,
  channel: Channel = getChannel(),
): Promise<FlowResult> {
  let workflowId: string;
  try {
    workflowId = await resolveWorkflowId(workflowRef, deps);
  } catch (e) {
    return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
  }

  const res = await deps.get(`${VERSIONS_PATH}?id=${encodeURIComponent(workflowId)}`);
  const unsupported = missingRouteLine(res, "workflow versions", channel);
  if (unsupported) return { code: 1, lines: [unsupported] };
  if (!res.ok) return asErrorResult(res, opts.json);
  if (opts.json) return { code: 0, lines: [JSON.stringify(res.data)] };

  // Some wrappers return a bare array instead of { versions: [...] }.
  const body = res.data;
  const versions = Array.isArray(body)
    ? (body as WorkflowVersion[])
    : ((body as WorkflowVersionsResponse).versions ?? []);
  return { code: 0, lines: [formatWorkflowVersions(versions)] };
}

/**
 * Build the import request body from a file (#863). Shared verbatim by `import`
 * and `validate` (#879 ruling 3) so both send a byte-identical body — the alias
 * is pinned by test. Returns either the ready `body` or a terminal FlowResult
 * for the read/parse/anchor failures (identical messages either door hits).
 */
function buildImportBody(
  file: string,
  opts: { dryRun: boolean; update?: string },
  deps: WorkflowRunDeps,
): { body: Record<string, unknown> } | { error: FlowResult } {
  let text: string;
  try {
    text = deps.readFile(file);
  } catch {
    return { error: { code: 1, lines: [`Error: file not found: ${file}`] } };
  }

  // Accept EITHER a canonical YAML export or a legacy JSON file (#863). The
  // parsed value is a plain JSON tree that gets posted as a JSON body unchanged,
  // so YAML files import against the CURRENT deployed API with zero server work.
  let parsed: unknown;
  try {
    parsed = parseWorkflowText(text);
  } catch (e) {
    // parseWorkflowText throws "workflow file is not valid YAML or JSON[: detail]";
    // re-prefix with the file name, keeping only the parser's detail so the phrase
    // isn't doubled.
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

/**
 * The shared import/validate runtime: build the body, POST it, render the
 * result. `validate` (#879 ruling 3) is exactly this with dryRun forced on and
 * a "validation" heading — no non-dry-run door — so it can't diverge from
 * `import --dry-run`.
 */
async function runImport(
  file: string,
  opts: { dryRun: boolean; json: boolean; update?: string; validate?: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const built = buildImportBody(file, { dryRun: opts.dryRun, update: opts.update }, deps);
  if ("error" in built) return built.error;

  const res = await deps.post(IMPORT_PATH, built.body);
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
      : [
          formatImportSummary(data, {
            dryRun: opts.dryRun,
            update: !!opts.update,
            validate: opts.validate,
          }),
        ],
  };
}

// ── Triggers (#893 / MS-8) ───────────────────────────────────────────────
// Triggers carry NO ids — position (1-based to the user) + a fingerprint of
// the trigger's own fields IS the addressing scheme. The CLI reads the live
// trigger list from the export contract in the SAME invocation it acts, and
// sends that fingerprint as `expect`, so a concurrent edit fails loud
// server-side instead of flipping the wrong trigger.

/** The `expect` fingerprint the server matches a trigger against by position. */
export function triggerExpect(t: WorkflowTrigger): {
  type: string;
  event?: string;
  cron?: string;
} {
  return t.type === "event"
    ? { type: "event", event: t.event }
    : { type: "cron", cron: t.cron };
}

function triggerDetail(t: WorkflowTrigger): string {
  return t.type === "event" ? t.event : t.cron;
}

const NO_TRIGGERS =
  "no triggers — add them via `exodus workflow export` / `import`";

/** One numbered (1-based) row per trigger: `n · type · detail · enabled|disabled`. */
export function formatTriggers(triggers: WorkflowTrigger[]): string {
  if (triggers.length === 0) return NO_TRIGGERS;
  return triggers
    .map((t, i) => {
      const state = t.enabled ? "enabled" : "disabled";
      return `${i + 1} · ${t.type} · ${triggerDetail(t)} · ${state}`;
    })
    .join("\n");
}

/** Compose the error FlowResult for a triggers verb (missing-route aware). */
function triggerErrorResult(
  res: ApiResponse<unknown>,
  verb: string,
  json: boolean,
): FlowResult {
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

/** Fetch the workflow's export contract and pull its trigger list. */
async function fetchTriggers(
  workflowId: string,
  deps: WorkflowRunDeps,
): Promise<{ ok: true; triggers: WorkflowTrigger[] } | { ok: false; res: ApiResponse<unknown> }> {
  const res = await deps.get(`${EXPORT_PATH}?id=${encodeURIComponent(workflowId)}`);
  if (!res.ok) return { ok: false, res };
  const triggers = (res.data as WorkflowContractJson).triggers ?? [];
  return { ok: true, triggers };
}

export async function triggersListFlow(
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
  const fetched = await fetchTriggers(workflowId, deps);
  if (!fetched.ok) return triggerErrorResult(fetched.res, "workflow triggers", opts.json);

  if (opts.json) {
    // Machine-friendly: the raw trigger array with its 1-based position stamped.
    return {
      code: 0,
      lines: [JSON.stringify(fetched.triggers.map((t, i) => ({ n: i + 1, ...t })))],
    };
  }
  return { code: 0, lines: [formatTriggers(fetched.triggers)] };
}

/** Shared render for an out-of-range / ambiguous <n> — echoes the live list. */
function triggerIndexError(
  message: string,
  triggers: WorkflowTrigger[],
  json: boolean,
): FlowResult {
  if (json) {
    return {
      code: 1,
      lines: [JSON.stringify({ ok: false, error: message, triggers: triggers.map((t, i) => ({ n: i + 1, ...t })) })],
    };
  }
  return { code: 1, lines: [message, "", formatTriggers(triggers)] };
}

export async function triggersSetEnabledFlow(
  workflowRef: string,
  n: number,
  enabled: boolean,
  opts: { json: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const verb = `workflow triggers ${enabled ? "enable" : "disable"}`;
  let workflowId: string;
  try {
    workflowId = await resolveWorkflowId(workflowRef, deps);
  } catch (e) {
    return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
  }
  const fetched = await fetchTriggers(workflowId, deps);
  if (!fetched.ok) return triggerErrorResult(fetched.res, verb, opts.json);

  const triggers = fetched.triggers;
  const idx = n - 1;
  if (idx < 0 || idx >= triggers.length) {
    return triggerIndexError(
      `Trigger ${n} is out of range — this workflow has ${triggers.length} trigger(s).`,
      triggers,
      opts.json,
    );
  }

  const res = await deps.post(TRIGGERS_SET_ENABLED_PATH, {
    workflowId,
    triggerIndex: idx,
    enabled,
    expect: triggerExpect(triggers[idx]),
  });
  if (!res.ok) return triggerErrorResult(res, verb, opts.json);

  if (opts.json) return { code: 0, lines: [JSON.stringify(res.data)] };
  return { code: 0, lines: [`Trigger ${n} ${enabled ? "enabled" : "disabled"}.`] };
}

interface TriggerFireResponse {
  runId: string;
}

export async function triggersFireFlow(
  workflowRef: string,
  opts: {
    n?: number;
    text?: string;
    wait: boolean;
    json: boolean;
    onProgressLine?: (line: string) => void;
  },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const verb = "workflow triggers fire";
  let workflowId: string;
  try {
    workflowId = await resolveWorkflowId(workflowRef, deps);
  } catch (e) {
    return { code: 1, lines: [e instanceof Error ? e.message : String(e)] };
  }
  const fetched = await fetchTriggers(workflowId, deps);
  if (!fetched.ok) return triggerErrorResult(fetched.res, verb, opts.json);

  const triggers = fetched.triggers;
  if (triggers.length === 0) {
    return { code: 1, lines: [`This workflow has no triggers. ${NO_TRIGGERS}`] };
  }

  // <n> is optional only when there's exactly one trigger; otherwise ambiguous.
  let idx: number;
  if (opts.n !== undefined) {
    idx = opts.n - 1;
    if (idx < 0 || idx >= triggers.length) {
      return triggerIndexError(
        `Trigger ${opts.n} is out of range — this workflow has ${triggers.length} trigger(s).`,
        triggers,
        opts.json,
      );
    }
  } else if (triggers.length === 1) {
    idx = 0;
  } else {
    return triggerIndexError(
      `This workflow has ${triggers.length} triggers — specify which one to fire (e.g. \`fire 1\`).`,
      triggers,
      opts.json,
    );
  }

  const t = triggers[idx];
  const n = idx + 1;

  // Preflight the server's rules with friendlier copy.
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
  if (!res.ok) return triggerErrorResult(res, verb, opts.json);

  const runId = (res.data as TriggerFireResponse).runId;
  const base = { runId, workflowId };

  if (!opts.wait) {
    if (opts.json) return { code: 0, lines: [JSON.stringify(base)] };
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
    for (const line of startLines) opts.onProgressLine(line);
  }

  const waited = await waitForRun(
    runId,
    { json: opts.json, onProgressLine: opts.onProgressLine, jsonBase: base },
    deps,
  );
  if (opts.json) return waited;
  const prefix = opts.onProgressLine ? [] : startLines;
  return { code: waited.code, lines: [...prefix, ...waited.lines] };
}

export async function importFlow(
  file: string,
  opts: { dryRun: boolean; json: boolean; update?: string },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  return runImport(file, opts, deps);
}

/**
 * `workflow validate <file>` — an alias of `import --dry-run` (#879 ruling 3):
 * the SAME body builder, the same server validation, the same issue rendering
 * and exit codes, just a validation heading and no write path. Network + login
 * required; there is no vendored graph validator in the CLI, ever.
 */
export async function validateFlow(
  file: string,
  opts: { json: boolean; update?: string },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  return runImport(
    file,
    { dryRun: true, json: opts.json, update: opts.update, validate: true },
    deps,
  );
}

// ── templates + schema flows (#892) ───────────────────────────────────────

export async function templatesListFlow(
  json: boolean,
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const res = await deps.get(TEMPLATES_PATH);
  if (!res.ok) {
    const missing = missingRouteLine(res, "workflow templates");
    if (missing) return { code: 1, lines: [missing] };
    return asErrorResult(res, json);
  }
  const data = res.data as WorkflowTemplatesResponse;
  if (json) return { code: 0, lines: [JSON.stringify(data)] };
  return { code: 0, lines: [formatTemplatesList(data.templates ?? [])] };
}

export async function templatesExportFlow(
  key: string,
  opts: { out?: string; json?: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  // ?key= returns canonical YAML by default; &format=json returns the contract
  // JSON. Fetch as RAW TEXT and pass it through untouched — the server is the
  // single renderer (no client-side re-render via lib/workflowText.ts), so a
  // `templates export` file is byte-identical to what /export?format=yaml
  // produces for the imported result (#892 trap).
  const query = opts.json
    ? `?key=${encodeURIComponent(key)}&format=json`
    : `?key=${encodeURIComponent(key)}`;
  const res = await deps.getText(`${TEMPLATES_PATH}${query}`);
  if (!res.ok) {
    // The raw-text seam delivers even an app-level apiError 404 (unknown key)
    // as a JSON STRING body; missingRouteLine (route-support) inspects object
    // shapes, so parse first or the semantic 404 would read as a missing route.
    let parsedBody: unknown = res.data;
    try {
      parsedBody = JSON.parse(res.data);
    } catch {
      // Not JSON — leave the raw string; a router 404 stays a missing route.
    }
    const missing = missingRouteLine(
      { ...res, data: parsedBody },
      "workflow templates export",
    );
    if (missing) return { code: 1, lines: [missing] };
    return { code: 1, lines: [formatTextError(res)] };
  }

  const doc = res.data;
  if (opts.out) {
    // Match exportFlow's parity: exactly one trailing newline in the file.
    const text = doc.endsWith("\n") ? doc : `${doc}\n`;
    deps.writeFile(opts.out, text);
    return { code: 0, lines: [`Wrote template "${key}" to ${opts.out}.`] };
  }
  // printResult console.logs the line (re-appending "\n"); strip one trailing
  // newline so `templates export … > file` stays byte-identical to --out.
  return { code: 0, lines: [doc.endsWith("\n") ? doc.slice(0, -1) : doc] };
}

/**
 * Render an error from a RAW-text endpoint. The body is a string; if it parses
 * to our apiError envelope, reuse formatError (surfaces the 404's code+message,
 * e.g. templates "unknown key" naming the valid keys). Otherwise print the raw
 * body so nothing is swallowed.
 */
function formatTextError(res: ApiResponse<string>): string {
  const body = res.data;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    const snippet = body.replace(/\s+/g, " ").trim().slice(0, 300);
    return formatError({ ok: false, status: res.status, data: snippet || "(empty response)" });
  }
  return formatError({ ok: false, status: res.status, data: parsed });
}

export async function schemaFlow(
  opts: { json: boolean; kind?: string; face?: string },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const res = await deps.get(SCHEMA_PATH);
  if (!res.ok) {
    const missing = missingRouteLine(res, "workflow schema");
    if (missing) return { code: 1, lines: [missing] };
    return asErrorResult(res, opts.json);
  }
  // --json emits the raw payload verbatim, whatever additive fields it carries.
  if (opts.json) return { code: 0, lines: [JSON.stringify(res.data)] };

  const payload = isRecord(res.data) ? res.data : {};
  if (opts.kind !== undefined) {
    return formatSchemaFilter(payload, ["nodeKinds"], "kind", opts.kind);
  }
  if (opts.face !== undefined) {
    return formatSchemaFilter(payload, ["transformFaces"], "face", opts.face);
  }
  return { code: 0, lines: [formatSchema(payload)] };
}

// ── Gate cluster (#891) ──────────────────────────────────────────────────
// The member's review surface over parked workflow runs: the inbox, the Gate
// node decision verbs (show / pick / edit / push / approve / reject), the
// require-all repair verbs (retry / skip / kill), and the nested-slot answer
// verb. Every ACTION verb maps a missing-route 404 to the honest #896 line via
// triggerErrorResult (the shared missing-route helper). The "push" step-1 hits
// the Next.js dashboard chat route, so its error handling mirrors session chat.

/** GET /api/v2/workflow/inbox → one actionable-park row per run. */
export interface WorkflowInboxRow {
  _id: string;
  workflowId: string;
  workflowName: string;
  pausedNodeId?: string;
  pausedNodeKind?: string;
  // Present as-is on new parks; absent = a legacy video cost-gate park.
  pauseReason?: "taste" | "repair" | "slots";
  counts?: WorkflowCounts;
  createdAt: number | string;
  queuedAt?: number | string;
  hasShow?: boolean;
  invocationMode?: "live" | "background";
  triggeredBy?: { type: "event" | "cron"; event?: string };
  pendingSlotsCount?: number;
}

export interface WorkflowInboxResponse {
  runs: WorkflowInboxRow[];
}

/** Compact a long Convex id for the inbox glance. */
function shortId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 11)}…`;
}

/**
 * A coarse relative age ("3d" / "5h" / "2m" / "9s"); `now` is injectable so the
 * inbox render is deterministic under test. Mirrors session.ts's formatAge.
 */
export function formatAge(value: number | string | undefined, now = Date.now()): string {
  if (value === undefined || value === null) return "-";
  const t = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(t)) return "-";
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

/**
 * The park-kind badge. Ruling (#891): "taste" → `gate`, "repair"/"slots"
 * as-is, and an ABSENT pauseReason → `legacy` (a video cost-gate park, not a
 * text gate). Never badge an absent reason as `gate`.
 */
export function parkBadge(pauseReason: string | undefined): string {
  if (pauseReason === "taste") return "gate";
  if (pauseReason === "repair") return "repair";
  if (pauseReason === "slots") return "slots";
  return "legacy";
}

/** The invocation badge for background/triggered runs; blank for a live run. */
export function invocationBadge(row: WorkflowInboxRow): string {
  if (row.triggeredBy) return `trig:${row.triggeredBy.event ?? row.triggeredBy.type}`;
  if (row.invocationMode === "background") return "bg";
  return "";
}

const NO_INBOX = "Nothing waiting on you — the review inbox is empty.";

export function formatInbox(rows: WorkflowInboxRow[], now = Date.now()): string {
  if (rows.length === 0) return NO_INBOX;
  return table(
    ["run", "workflow", "kind", "node", "via", "age"],
    rows.map((r) => [
      shortId(r._id),
      r.workflowName || "(unnamed)",
      parkBadge(r.pauseReason),
      r.pausedNodeId ?? "-",
      invocationBadge(r) || "-",
      formatAge(r.createdAt, now),
    ]),
  );
}

export async function inboxFlow(json: boolean, deps: WorkflowRunDeps): Promise<FlowResult> {
  const res = await deps.get(INBOX_PATH);
  if (!res.ok) return triggerErrorResult(res, "workflow inbox", json);
  const data = res.data as WorkflowInboxResponse;
  const rows = data.runs ?? [];
  return { code: 0, lines: json ? [JSON.stringify(rows)] : [formatInbox(rows)] };
}

// ── Shared preflight + error helpers ──────────────────────────────────────

/** One error FlowResult, structured under --json, bare line in human mode. */
function errLine(message: string, json: boolean, status?: number): FlowResult {
  return {
    code: 1,
    lines: [
      json
        ? JSON.stringify({ ok: false, ...(status ? { status } : {}), error: message })
        : message,
    ],
  };
}

/** One success FlowResult; --json carries the given structured payload. */
function okLine(message: string, payload: Record<string, unknown>, json: boolean): FlowResult {
  return { code: 0, lines: [json ? JSON.stringify(payload) : message] };
}

/** Pull a route's error text out of an error body, verbatim where possible. */
function routeErrorText(data: unknown, status: number): string {
  if (isRecord(data)) {
    const err = data.error;
    if (typeof err === "string" && err) return err;
    if (isRecord(err) && typeof err.message === "string") return err.message;
    if (typeof data.message === "string" && data.message) return data.message;
  }
  return `HTTP ${status}`;
}

function asWorkflowRun(data: unknown): WorkflowRun | undefined {
  return isRecord(data) && typeof data["_id"] === "string"
    ? (data as unknown as WorkflowRun)
    : undefined;
}

/** Human phrase for a run's ACTUAL park state — used when a preflight fails. */
function describePark(run: WorkflowRun): string {
  if (run.status !== "awaiting-review") return `status: ${run.status}`;
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

const PARK_LABEL: Record<WorkflowPauseReason, string> = {
  taste: "a gate review",
  repair: "a repair",
  slots: "slot answers",
  call: "a child workflow",
};

/**
 * Preflight a gate/repair/answer verb: GET the run detail and confirm it is
 * parked for the EXPECTED reason. A mismatch names the run's actual state so the
 * error is self-explaining. The GET hits the pre-existing run route, so a
 * missing-route 404 here means the whole backend is behind — still #896-mapped.
 */
async function preflightPark(
  runId: string,
  expected: WorkflowPauseReason,
  verb: string,
  json: boolean,
  deps: WorkflowRunDeps,
): Promise<{ ok: true; run: WorkflowRun } | { ok: false; result: FlowResult }> {
  const res = await deps.get(`${STATUS_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!res.ok) return { ok: false, result: triggerErrorResult(res, verb, json) };
  const run = asWorkflowRun(res.data);
  if (!run) {
    return { ok: false, result: errLine(`Could not read run ${runId}.`, json) };
  }
  if (run.status !== "awaiting-review" || run.pauseReason !== expected) {
    return {
      ok: false,
      result: errLine(
        `Run ${runId} is not parked for ${PARK_LABEL[expected]} — it is ${describePark(run)}.`,
        json,
      ),
    };
  }
  return { ok: true, run };
}

/** A gate node's selection-port candidates, numbered 1-based, each carrying its
 *  index into the node's FULL outputs array (what /gate/edit's outputIndex wants). */
interface GateCandidate {
  n: number;
  outputIndex: number;
  text: string;
  humanEdited: boolean;
}

function gateCandidates(run: WorkflowRun): GateCandidate[] {
  const node = (run.nodes ?? []).find((x) => x.nodeId === run.pausedNodeId);
  if (!node) return [];
  const out: GateCandidate[] = [];
  let n = 0;
  (node.outputs ?? []).forEach((a, idx) => {
    if (a.type === "text" && a.port === "selection") {
      n += 1;
      out.push({ n, outputIndex: idx, text: a.text, humanEdited: !!a.humanEdited });
    }
  });
  return out;
}

/** Human list of candidates (truncated); full text lives in --json payloads. */
function formatCandidates(cands: GateCandidate[]): string {
  if (cands.length === 0) return "  (this gate has no selection candidates)";
  return cands
    .map((c) => `  ${c.n}. ${truncateText(c.text, 200)}${c.humanEdited ? "  (edited)" : ""}`)
    .join("\n");
}

/** Shared out-of-range error naming the real 1..count range. */
function rangeError(num: number, count: number, json: boolean): FlowResult {
  const range = count > 0 ? ` (valid: 1–${count})` : "";
  return errLine(
    `Candidate ${num} is out of range — this gate has ${count} candidate${count === 1 ? "" : "s"}${range}.`,
    json,
  );
}

// ── Gate verbs ────────────────────────────────────────────────────────────

export async function gateShowFlow(
  runId: string,
  opts: { json: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const pf = await preflightPark(runId, "taste", "workflow gate", opts.json, deps);
  if (!pf.ok) return pf.result;
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

export async function gatePickFlow(
  runId: string,
  numbers: number[],
  opts: { json: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const pf = await preflightPark(runId, "taste", "workflow gate pick", opts.json, deps);
  if (!pf.ok) return pf.result;
  const cands = gateCandidates(pf.run);

  const seen = new Set<number>();
  for (const num of numbers) {
    if (!Number.isInteger(num) || num < 1 || num > cands.length) {
      return rangeError(num, cands.length, opts.json);
    }
    if (seen.has(num)) return errLine(`Candidate ${num} is listed twice.`, opts.json);
    seen.add(num);
  }

  // 1-based candidate numbers → 0-based indices into the SELECTION subset.
  const selectedIndices = numbers.map((num) => num - 1);
  const res = await deps.post(GATE_PICK_PATH, {
    runId,
    nodeId: pf.run.pausedNodeId,
    selectedIndices,
  });
  if (!res.ok) return triggerErrorResult(res, "workflow gate pick", opts.json);
  return okLine(
    `Picked candidate${numbers.length === 1 ? "" : "s"} ${numbers.join(", ")} at ${pf.run.pausedNodeId}. Approve to resume: exodus workflow gate ${runId} approve --wait`,
    { ok: true, runId, nodeId: pf.run.pausedNodeId, selectedIndices },
    opts.json,
  );
}

export async function gateEditFlow(
  runId: string,
  n: number,
  sources: { text?: string; file?: string; stdin?: string },
  opts: { json: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const provided = [sources.text, sources.file, sources.stdin].filter((x) => x !== undefined);
  if (provided.length === 0) {
    return errLine(
      "Provide the replacement text via one of --text, --file <path>, or piped stdin.",
      opts.json,
    );
  }
  if (provided.length > 1) {
    return errLine(
      "Provide the replacement text via exactly one of --text, --file, or stdin — not several.",
      opts.json,
    );
  }

  let text: string;
  if (sources.text !== undefined) {
    text = sources.text;
  } else if (sources.file !== undefined) {
    try {
      text = deps.readFile(sources.file);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errLine(`Could not read file "${sources.file}": ${msg}`, opts.json);
    }
  } else {
    text = sources.stdin as string;
  }

  const pf = await preflightPark(runId, "taste", "workflow gate edit", opts.json, deps);
  if (!pf.ok) return pf.result;
  const cands = gateCandidates(pf.run);
  const cand = cands.find((c) => c.n === n);
  if (!cand) return rangeError(n, cands.length, opts.json);

  // The mutation's outputIndex indexes the node's FULL outputs array, not the
  // selection subset — hand it the candidate's resolved outputIndex.
  const res = await deps.post(GATE_EDIT_PATH, {
    runId,
    nodeId: pf.run.pausedNodeId,
    outputIndex: cand.outputIndex,
    text,
  });
  if (!res.ok) return triggerErrorResult(res, "workflow gate edit", opts.json);
  return okLine(
    `Edited candidate ${n} at ${pf.run.pausedNodeId}.`,
    { ok: true, runId, nodeId: pf.run.pausedNodeId, outputIndex: cand.outputIndex },
    opts.json,
  );
}

export async function gatePushFlow(
  runId: string,
  message: string,
  opts: { json: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const pf = await preflightPark(runId, "taste", "workflow gate push", opts.json, deps);
  if (!pf.ok) return pf.result;

  // The gate's LIVE session is the sessions entry whose nodeId matches the park.
  const session = (pf.run.sessions ?? []).find((s) => s.nodeId === pf.run.pausedNodeId);
  if (!session) return errLine("This gate has no live session — nothing to push to.", opts.json);
  if (!deps.postDashboard) {
    return errLine("gate push is unavailable here (no dashboard client).", opts.json);
  }

  // Step 1: extend the session on the Next.js dashboard chat route (mirror of
  // `session chat` — errors surface verbatim, not #896-mapped).
  const chat = await deps.postDashboard(
    CHAT_PATH,
    { sessionId: session.sessionId, text: message },
    { timeoutMs: CHAT_TIMEOUT_MS },
  );
  if (!chat.ok) {
    const err = routeErrorText(chat.data, chat.status);
    return {
      code: 1,
      lines: opts.json
        ? [JSON.stringify({ ok: false, status: chat.status, error: err })]
        : [`exodus workflow gate push: ${err} (HTTP ${chat.status})`],
    };
  }

  // Step 2: bank the assistant's latest reply as a NEW selection candidate.
  const res = await deps.post(GATE_APPEND_PATH, { runId, nodeId: pf.run.pausedNodeId });
  if (!res.ok) return triggerErrorResult(res, "workflow gate push", opts.json);

  // Re-GET the run so the caller sees the fresh candidate with its 1-based number.
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

export async function gateApproveFlow(
  runId: string,
  opts: { wait: boolean; json: boolean; onProgressLine?: (line: string) => void },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const pf = await preflightPark(runId, "taste", "workflow gate approve", opts.json, deps);
  if (!pf.ok) return pf.result;
  const res = await deps.post(APPROVE_PATH, { runId });
  if (!res.ok) return triggerErrorResult(res, "workflow gate approve", opts.json);
  const triggerRunId = (res.data as { triggerRunId?: string }).triggerRunId;
  return resumeAndMaybeWait(
    runId,
    triggerRunId,
    ["Gate approved — the run resumes."],
    opts,
    deps,
  );
}

export async function gateRejectFlow(
  runId: string,
  opts: { reason?: string; json: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const pf = await preflightPark(runId, "taste", "workflow gate reject", opts.json, deps);
  if (!pf.ok) return pf.result;
  const res = await deps.post(CANCEL_PATH, {
    runId,
    ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
  });
  if (!res.ok) return triggerErrorResult(res, "workflow gate reject", opts.json);
  return okLine(`Gate rejected — run ${runId} canceled.`, { ok: true, runId }, opts.json);
}

// ── Repair verbs ──────────────────────────────────────────────────────────

export async function repairFlow(
  runId: string,
  action: "retry" | "skip" | "kill",
  opts: { wait: boolean; json: boolean; onProgressLine?: (line: string) => void },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const verb = `workflow repair ${action}`;
  const pf = await preflightPark(runId, "repair", verb, opts.json, deps);
  if (!pf.ok) return pf.result;

  if (action === "kill") {
    // Kill cancels with NO reason (a repair kill is not a taste rejection).
    const res = await deps.post(CANCEL_PATH, { runId });
    if (!res.ok) return triggerErrorResult(res, verb, opts.json);
    return okLine(`Repair killed — run ${runId} canceled.`, { ok: true, runId }, opts.json);
  }

  const path = action === "retry" ? REPAIR_RETRY_PATH : REPAIR_SKIP_PATH;
  const res = await deps.post(path, { runId });
  if (!res.ok) return triggerErrorResult(res, verb, opts.json);
  const triggerRunId = (res.data as { triggerRunId?: string }).triggerRunId;
  return resumeAndMaybeWait(
    runId,
    triggerRunId,
    [`Repair ${action} started — the run resumes.`],
    opts,
    deps,
  );
}

/**
 * Shared tail for the resume verbs (approve / repair retry|skip): print the new
 * triggerRunId, and if --wait re-enter the existing poll loop with the resumed
 * run. The resume returns a NEW triggerRunId; waitForRun polls the same runId.
 */
async function resumeAndMaybeWait(
  runId: string,
  triggerRunId: string | undefined,
  headline: string[],
  opts: { wait: boolean; json: boolean; onProgressLine?: (line: string) => void },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const base = { runId, triggerRunId };
  const startLines = [
    ...headline,
    `runId:        ${runId}`,
    `triggerRunId: ${triggerRunId ?? "-"}`,
    `Poll: exodus workflow status --id ${runId}`,
  ];

  if (!opts.wait) {
    if (opts.json) return { code: 0, lines: [JSON.stringify(base)] };
    return { code: 0, lines: startLines };
  }

  if (!opts.json && opts.onProgressLine) {
    for (const line of startLines) opts.onProgressLine(line);
  }
  const waited = await waitForRun(
    runId,
    { json: opts.json, onProgressLine: opts.onProgressLine, jsonBase: base },
    deps,
  );
  if (opts.json) return waited;
  const prefix = opts.onProgressLine ? [] : startLines;
  return { code: waited.code, lines: [...prefix, ...waited.lines] };
}

// ── Answer verb (nested-slot parks) ───────────────────────────────────────

/** Collect the repeatable `--slot key=value` flag into a values map. */
export function parseSlotFlags(args: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let raw: string | undefined;
    if (arg === "--slot") {
      raw = args[i + 1];
      i++;
    } else if (arg.startsWith("--slot=")) {
      raw = arg.slice("--slot=".length);
    } else {
      continue;
    }
    if (!raw) throw new Error("--slot requires key=value");
    const eq = raw.indexOf("=");
    if (eq <= 0) throw new Error(`--slot must be key=value (got "${raw}")`);
    const key = raw.slice(0, eq).trim();
    if (!key) throw new Error(`--slot must include a key (got "${raw}")`);
    values[key] = raw.slice(eq + 1);
  }
  return values;
}

export async function answerFlow(
  runId: string,
  values: Record<string, string>,
  opts: { json: boolean },
  deps: WorkflowRunDeps,
): Promise<FlowResult> {
  const pf = await preflightPark(runId, "slots", "workflow answer", opts.json, deps);
  if (!pf.ok) return pf.result;
  const pending = pf.run.pendingSlots ?? [];

  // No --slot flags → show what this run is waiting on (the slot ids).
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
  if (!res.ok) return triggerErrorResult(res, "workflow answer", opts.json);
  return okLine(
    `Answered ${Object.keys(values).length} slot(s) for run ${runId} — the child resumes.`,
    { ok: true, runId, values },
    opts.json,
  );
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

/** Parse a comma-separated 1-based pick list ("3,7") → [3,7]; undefined if any
 *  token isn't a positive integer or the list is empty. */
function parsePickNumbers(raw: string | undefined): number[] | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return undefined;
    nums.push(Number(p));
  }
  return nums;
}

/** Read all of stdin to a string. */
async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Resolve piped stdin as an edit source: only when neither --text nor --file
 * was given AND stdin is not a TTY (i.e. it was piped/redirected). A single
 * trailing newline is stripped. Returns undefined when stdin isn't a source.
 */
async function maybeReadStdin(
  flags: Record<string, string | boolean>,
): Promise<string | undefined> {
  if (flagString(flags, "text") !== undefined || flagString(flags, "file") !== undefined) {
    return undefined;
  }
  if (process.stdin.isTTY) return undefined;
  const raw = await readAllStdin();
  if (raw.length === 0) return undefined;
  return raw.endsWith("\n") ? raw.slice(0, -1) : raw;
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
      return printResult(
        await templatesExportFlow(key, { out: flagString(flags, "out"), json }, defaultDeps),
      );
    }
    console.error(`Unknown templates action: "${action}"`);
    console.log("Usage: exodus workflow templates [list] | exodus workflow templates export <key>");
    process.exit(1);
  }

  if (sub === "schema") {
    return printResult(
      await schemaFlow(
        { json, kind: flagString(flags, "kind"), face: flagString(flags, "face") },
        defaultDeps,
      ),
    );
  }

  if (sub === "validate") {
    const file = rest[0];
    if (!file) {
      console.error("Error: workflow validate requires <file>.");
      console.log("Usage: exodus workflow validate <file> [--update <workflowId>] [--json]");
      process.exit(1);
    }
    return printResult(
      await validateFlow(file, { json, update: flagString(flags, "update") }, defaultDeps),
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
    let terminalNodeIds: string[];
    try {
      inputs = parseInputFlags(process.argv.slice(3), defaultDeps.readFile);
      // #860: --terminal repeats like --input, so read the raw argv (the shared
      // flags map only keeps the last value of a repeated flag).
      terminalNodeIds = parseTerminalFlags(process.argv.slice(3));
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    return printResult(
      await runFlow(
        workflowRef,
        {
          inputs,
          terminalNodeIds,
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
    let version: number | undefined;
    try {
      version = parseVersionFlag(flags);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    return printResult(
      await exportFlow(workflowRef, { out: flagString(flags, "out"), json, version }, defaultDeps),
    );
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

  // ── Gate cluster (#891) ────────────────────────────────────────────────

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

    // No action → show the gate's candidates.
    if (!action) return printResult(await gateShowFlow(runId, { json }, defaultDeps));

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
      return printResult(
        await gateEditFlow(
          runId,
          n,
          { text: flagString(flags, "text"), file: flagString(flags, "file"), stdin },
          { json },
          defaultDeps,
        ),
      );
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
      return printResult(
        await gateApproveFlow(
          runId,
          { wait: flags["wait"] === true, json, onProgressLine: (line) => console.log(line) },
          defaultDeps,
        ),
      );
    }

    if (action === "reject") {
      return printResult(
        await gateRejectFlow(runId, { reason: flagString(flags, "reason"), json }, defaultDeps),
      );
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
    return printResult(
      await repairFlow(
        runId,
        action,
        { wait: flags["wait"] === true, json, onProgressLine: (line) => console.log(line) },
        defaultDeps,
      ),
    );
  }

  if (sub === "answer") {
    const runId = rest[0];
    if (!runId) {
      console.error("Error: workflow answer requires <runId>.");
      console.log("Usage: exodus workflow answer <runId> --slot key=value [--slot key=value ...]");
      process.exit(1);
    }
    let values: Record<string, string>;
    try {
      // --slot repeats, so read the raw argv (the shared flags map only keeps
      // the last value of a repeated flag).
      values = parseSlotFlags(process.argv.slice(3));
    } catch (e) {
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

    // No action → LIST.
    if (!action) return printResult(await triggersListFlow(workflowRef, { json }, defaultDeps));

    if (action === "enable" || action === "disable") {
      const n = parseTriggerIndex(rest[2]);
      if (n === undefined) {
        console.error(`Error: workflow triggers ${action} requires a 1-based trigger number <n>.`);
        console.log(`Usage: exodus workflow triggers <workflowId|name> ${action} <n>`);
        process.exit(1);
      }
      return printResult(
        await triggersSetEnabledFlow(workflowRef, n, action === "enable", { json }, defaultDeps),
      );
    }

    if (action === "fire") {
      // <n> optional; when present it must be a valid 1-based index.
      let n: number | undefined;
      if (rest[2] !== undefined) {
        n = parseTriggerIndex(rest[2]);
        if (n === undefined) {
          console.error(`Error: trigger number must be a positive integer (got "${rest[2]}").`);
          process.exit(1);
        }
      }
      return printResult(
        await triggersFireFlow(
          workflowRef,
          {
            n,
            text: flagString(flags, "text"),
            wait: flags["wait"] === true,
            json,
            onProgressLine: (line) => console.log(line),
          },
          defaultDeps,
        ),
      );
    }

    console.error(`Error: unknown triggers action "${action}" (expected enable, disable, or fire).`);
    console.log("Usage: exodus workflow triggers <workflowId|name> [enable|disable <n> | fire [<n>]] [--json]");
    process.exit(1);
  }

  console.error(`Unknown subcommand: "${sub}"\n`);
  console.log(helpText);
  process.exit(1);
}

/** Parse a user-facing 1-based trigger number; undefined if not a positive int. */
function parseTriggerIndex(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return n >= 1 ? n : undefined;
}
