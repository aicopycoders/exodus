import { type ApiResponse } from "../lib/client.js";
import { type PollOptions, type PollResult } from "../lib/poll.js";
export declare const helpText: string;
export type WorkflowNodeKind = "brief" | "bot" | "primer" | "image" | "rig" | "storyboard" | "reference" | "scene-frames" | "video" | "voiceover" | "output" | "show-set" | "show-cast" | "show-voices" | "product-truth";
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
export interface WorkflowContractJson {
    contract: "exodus-workflow";
    version: number;
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
export type GraphIssueCode = "bad-shape" | "unknown-kind" | "duplicate-node-id" | "dangling-edge" | "unknown-port" | "type-mismatch" | "duplicate-input" | "cycle" | "missing-required-input" | "bad-config";
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
export type WorkflowPortType = "text" | "primer" | "image" | "rig" | "storyboard" | "frames" | "video" | "audio" | "show";
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
export type WorkflowRunStatus = "queued" | "running" | "awaiting-review" | "completed" | "partial" | "failed" | "canceled";
export type WorkflowNodeRunStatus = "idle" | "running" | "done" | "failed" | "skipped";
export type WorkflowArtifact = {
    type: "text";
    text: string;
    label?: string;
} | {
    type: "primer";
    text: string;
    primerKind: string;
} | {
    type: "image";
    storageId: string;
    imageUrl?: string;
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
}
export type WorkflowRunProjection = Omit<WorkflowRun, "nodes"> & {
    nodes?: never;
};
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
export declare function parseInputFlags(args: string[], readFile?: (path: string) => string): Record<string, string>;
export declare function formatWorkflowList(workflows: WorkflowListItem[]): string;
export declare function formatRecentRuns(runs: WorkflowRunProjection[]): string;
export declare function formatImportSummary(result: WorkflowImportResult, mode?: {
    dryRun?: boolean;
    update?: boolean;
}): string;
export declare function formatWorkflowRun(run: WorkflowRun): string;
export declare function formatDescribe(res: WorkflowDescribeResponse): string;
export declare function formatBotsList(catalog: WorkflowCatalog, category?: string): string;
export declare function formatBotDetail(bot: CatalogBot): string;
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
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function importFlow(file: string, opts: {
    dryRun: boolean;
    json: boolean;
    update?: string;
}, deps: WorkflowRunDeps): Promise<FlowResult>;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
export {};
