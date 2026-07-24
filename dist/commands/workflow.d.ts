import { type ApiResponse } from "../lib/client.js";
import { type PollOptions, type PollResult } from "../lib/poll.js";
import { type Channel } from "../lib/channel.js";
export declare const helpText: string;
export type WorkflowNodeKind = "brief" | "bot" | "primer" | "image" | "rig" | "storyboard" | "reference" | "scene-frames" | "video" | "voiceover" | "output" | "push" | "gate" | "call" | "show-set" | "show-cast" | "show-voices" | "product-truth" | "transform";
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
    position: {
        x: number;
        y: number;
    };
    config: Record<string, unknown>;
}
export interface WorkflowEdge {
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
}
export type WorkflowTriggerEvent = "winner-promoted";
export type WorkflowTrigger = {
    type: "event";
    event: WorkflowTriggerEvent;
    enabled: boolean;
} | {
    type: "cron";
    cron: string;
    enabled: boolean;
};
export interface WorkflowContractJson {
    contract: "exodus-workflow";
    version: number;
    workflowId?: string;
    updatedAt?: string;
    name: string;
    description?: string;
    slots?: WorkflowSlot[];
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
    triggers?: WorkflowTrigger[];
    unresolved: UnresolvedWorkflowRef[];
    warnings: string[];
}
export type GraphIssueCode = "bad-shape" | "unknown-kind" | "duplicate-node-id" | "dangling-edge" | "unknown-port" | "type-mismatch" | "duplicate-input" | "session-fan-out" | "cycle" | "missing-required-input" | "bad-config" | "bad-slot" | "bad-trigger";
export interface GraphIssue {
    code: GraphIssueCode;
    message: string;
    nodeId?: string;
    edgeId?: string;
    portId?: string;
    remedy?: string;
}
export type WorkflowImportErrorCode = "invalid-graph" | "conflict" | "forbidden" | "not-found";
export interface WorkflowImportError {
    code: WorkflowImportErrorCode;
    message: string;
    issues?: GraphIssue[];
    currentUpdatedAt?: string;
}
export type WorkflowPortType = "text" | "primer" | "image" | "rig" | "storyboard" | "frames" | "video" | "audio" | "show" | "session";
export type WorkflowPrimerKind = "body" | "hook" | "headline" | "summary";
export type WorkflowDurationSpec = {
    kind: "fixed";
    values: number[];
} | {
    kind: "range";
    min: number;
    max: number;
};
export interface CatalogVideoModel {
    id: string;
    label: string;
    durations: WorkflowDurationSpec;
    audioTogglable: boolean;
    aspectRatios: string[];
    resolutions: string[];
}
export type WorkflowParamKind = "select" | "text" | "textarea" | "toggle" | "number" | "multiselect";
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
        categories: Array<{
            id: string;
            label: string;
        }>;
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
export type WorkflowBriefSource = "text" | "swipe-ad" | "swipe-bundle" | "organic-url" | "ad-url";
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
    type: "text" | "image" | "video" | "audio" | "frames" | "storyboard";
    label: string;
    nodeId: string;
    botSlug?: string;
    port?: string;
}
export interface WorkflowDescribeResponse {
    workflowId: string;
    name: string;
    description?: string;
    updatedAt: string;
    inputs: WorkflowInputDescriptor[];
    prerequisites: Array<WorkflowPrerequisiteDescriptor & {
        stored: boolean;
    }>;
    outputs: WorkflowOutputDescriptor[];
}
export interface WorkflowTemplateListItem {
    key: string;
    label: string;
    description: string;
    module?: string;
}
export interface WorkflowTemplatesResponse {
    templates: WorkflowTemplateListItem[];
}
export interface WorkflowListItem {
    _id: string;
    name: string;
    description?: string;
    nodeCount: number;
    edgeCount: number;
    createdAt: string;
    updatedAt: string;
    isCrossBrand?: boolean;
    homeBrandName?: string | null;
}
export interface WorkflowListResponse {
    workflows: WorkflowListItem[];
}
export interface WorkflowVersion {
    version: number;
    name: string;
    savedAt: string;
    savedByName?: string;
}
export interface WorkflowVersionsResponse {
    versions: WorkflowVersion[];
}
export type WorkflowRunStatus = "queued" | "running" | "awaiting-review" | "completed" | "partial" | "failed" | "canceled";
export type WorkflowNodeRunStatus = "idle" | "running" | "done" | "failed" | "skipped";
export type WorkflowArtifact = {
    type: "text";
    text: string;
    label?: string;
    port?: string;
    humanEdited?: boolean;
} | {
    type: "primer";
    text: string;
    primerKind: string;
} | {
    type: "image";
    storageId: string;
    imageUrl?: string;
} | {
    type: "session";
    sessionId: string;
    label?: string;
    port?: string;
};
export interface WorkflowRunOutput {
    nodeId: string;
    botSlug?: string;
    type: "text" | "image" | "video" | "audio" | "frames" | "storyboard";
    label: string;
    text?: string;
    imageUrl?: string;
    imageId?: string;
    videoUrl?: string;
    audioUrl?: string;
    durationSec?: number;
    sceneIndex?: number;
    final?: boolean;
    frames?: Array<{
        sceneIndex: number;
        imageUrl?: string;
    }>;
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
export interface WorkflowRunSession {
    sessionId: string;
    nodeId: string;
    title: string;
    botSlug: string;
}
export type WorkflowPauseReason = "taste" | "repair" | "slots" | "call";
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
    outputs?: WorkflowRunOutput[];
    sessions?: WorkflowRunSession[];
    pauseReason?: WorkflowPauseReason;
    pausedNodeId?: string;
    pendingSlots?: WorkflowPendingSlot[];
}
export type WorkflowRunProjection = Omit<WorkflowRun, "nodes"> & {
    nodes?: never;
};
export interface WorkflowRunDeps {
    get: (path: string) => Promise<ApiResponse<unknown>>;
    getText: (path: string) => Promise<ApiResponse<string>>;
    post: (path: string, body: unknown) => Promise<ApiResponse<unknown>>;
    readFile: (path: string) => string;
    writeFile: (path: string, text: string) => void;
    poll: (opts: PollOptions) => Promise<PollResult>;
    postDashboard?: (path: string, body: unknown, opts?: {
        timeoutMs?: number;
    }) => Promise<ApiResponse<unknown>>;
    dashboardUrl?: string;
}
export interface FlowResult {
    code: number;
    lines: string[];
}
interface RunFlowOptions {
    inputs: Record<string, string>;
    terminalNodeIds?: string[];
    wait: boolean;
    json: boolean;
    onProgressLine?: (line: string) => void;
}
export declare function formatPauseNotice(pauseReason: WorkflowPauseReason | undefined, runId: string, dashboardUrl: string): string[];
export declare function parseInputFlags(args: string[], readFile?: (path: string) => string): Record<string, string>;
export declare function parseTerminalFlags(args: string[]): string[];
export declare function formatWorkflowList(workflows: WorkflowListItem[]): string;
export declare function formatRecentRuns(runs: WorkflowRunProjection[]): string;
export declare function formatWorkflowVersions(versions: WorkflowVersion[]): string;
export declare function formatImportSummary(result: WorkflowImportResult, mode?: {
    dryRun?: boolean;
    update?: boolean;
    validate?: boolean;
}): string;
export declare function formatWorkflowRun(run: WorkflowRun): string;
export declare function formatDescribe(res: WorkflowDescribeResponse): string;
export declare function formatBotsList(catalog: WorkflowCatalog, category?: string): string;
export declare function formatBotDetail(bot: CatalogBot): string;
export declare function formatTemplatesList(templates: WorkflowTemplateListItem[]): string;
export declare function formatSchema(payload: Record<string, unknown>): string;
export declare function resolveWorkflowId(ref: string, deps: WorkflowRunDeps): Promise<string>;
export declare function listFlow(json: boolean, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function describeFlow(workflowRef: string, opts: {
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function botsFlow(opts: {
    category?: string;
    slug?: string;
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function runFlow(workflowRef: string, opts: RunFlowOptions, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function statusFlow(opts: {
    id?: string;
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function exportFlow(workflowRef: string, opts: {
    out?: string;
    json?: boolean;
    version?: number;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function parseVersionFlag(flags: Record<string, string | boolean>): number | undefined;
export declare function versionsFlow(workflowRef: string, opts: {
    json: boolean;
}, deps: WorkflowRunDeps, channel?: Channel): Promise<FlowResult>;
export declare function triggerExpect(t: WorkflowTrigger): {
    type: string;
    event?: string;
    cron?: string;
};
export declare function formatTriggers(triggers: WorkflowTrigger[]): string;
export declare function triggersListFlow(workflowRef: string, opts: {
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function triggersSetEnabledFlow(workflowRef: string, n: number, enabled: boolean, opts: {
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function triggersFireFlow(workflowRef: string, opts: {
    n?: number;
    text?: string;
    wait: boolean;
    json: boolean;
    onProgressLine?: (line: string) => void;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function importFlow(file: string, opts: {
    dryRun: boolean;
    json: boolean;
    update?: string;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function validateFlow(file: string, opts: {
    json: boolean;
    update?: string;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function templatesListFlow(json: boolean, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function templatesExportFlow(key: string, opts: {
    out?: string;
    json?: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function schemaFlow(opts: {
    json: boolean;
    kind?: string;
    face?: string;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export interface WorkflowInboxRow {
    _id: string;
    workflowId: string;
    workflowName: string;
    pausedNodeId?: string;
    pausedNodeKind?: string;
    pauseReason?: "taste" | "repair" | "slots";
    counts?: WorkflowCounts;
    createdAt: number | string;
    queuedAt?: number | string;
    hasShow?: boolean;
    invocationMode?: "live" | "background";
    triggeredBy?: {
        type: "event" | "cron";
        event?: string;
    };
    pendingSlotsCount?: number;
}
export interface WorkflowInboxResponse {
    runs: WorkflowInboxRow[];
}
export declare function formatAge(value: number | string | undefined, now?: number): string;
export declare function parkBadge(pauseReason: string | undefined): string;
export declare function invocationBadge(row: WorkflowInboxRow): string;
export declare function formatInbox(rows: WorkflowInboxRow[], now?: number): string;
export declare function inboxFlow(json: boolean, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function gateShowFlow(runId: string, opts: {
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function gatePickFlow(runId: string, numbers: number[], opts: {
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function gateEditFlow(runId: string, n: number, sources: {
    text?: string;
    file?: string;
    stdin?: string;
}, opts: {
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function gatePushFlow(runId: string, message: string, opts: {
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function gateApproveFlow(runId: string, opts: {
    wait: boolean;
    json: boolean;
    onProgressLine?: (line: string) => void;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function gateRejectFlow(runId: string, opts: {
    reason?: string;
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function repairFlow(runId: string, action: "retry" | "skip" | "kill", opts: {
    wait: boolean;
    json: boolean;
    onProgressLine?: (line: string) => void;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function parseSlotFlags(args: string[]): Record<string, string>;
export declare function answerFlow(runId: string, values: Record<string, string>, opts: {
    json: boolean;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
export {};
