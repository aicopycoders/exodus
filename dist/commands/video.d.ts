import { type ApiResponse } from "../lib/client.js";
export declare const helpText: string;
export interface ClipWord {
    w: string;
    s: number;
    e: number;
}
export interface ClipQc {
    verdict: "pass" | "fail";
    attempts: number;
}
export interface ClipFinding {
    check: string;
    code: string;
    severity: "fail" | "warn";
    detail: string;
}
export type ArtifactSubset = {
    type: "storyboard";
    storyboard?: unknown;
    storyboardJson?: string;
} | {
    type: "frames";
    frames?: Array<{
        sceneIndex: number;
        imageUrl?: string;
    }>;
} | {
    type: "image";
    imageUrl?: string;
} | {
    type: "video";
    sceneIndex?: number;
    videoUrl?: string;
    durationSec?: number;
    words?: ClipWord[];
    qc?: ClipQc;
    final?: boolean;
} | {
    type: "audio";
    sceneIndex?: number;
    audioUrl?: string;
    durationSec?: number;
} | {
    type: "text" | "primer" | "session" | "document";
};
export interface VideoRunNode {
    nodeId: string;
    kind: string;
    status: "idle" | "running" | "done" | "failed" | "skipped";
    error?: string;
    outputs?: ArtifactSubset[];
}
export type BuilderPauseReason = "taste" | "repair" | "slots" | "call" | "checkpoint";
export interface VideoRun {
    _id: string;
    status: string;
    isTerminal: boolean;
    error?: string;
    pauseReason?: BuilderPauseReason;
    pausedNodeId?: string;
    nodes: VideoRunNode[];
}
export declare function asVideoRun(data: unknown): VideoRun;
export interface NodeItem {
    nodeId: string;
    sceneIndex: number;
    itemKind: string;
    status: string;
    error?: string;
    attempt?: number;
    flagged?: boolean;
    findings?: ClipFinding[];
}
export interface ShowRow {
    id: string;
    name: string;
    status?: string;
    medium?: string;
    styleSlug?: string;
    ready?: boolean;
    setupProgress?: {
        set?: boolean;
        cast?: boolean;
        voices?: boolean;
    };
}
export interface FlowResult {
    code: number;
    lines: string[];
}
export interface VideoDeps {
    get: (path: string) => Promise<ApiResponse<unknown>>;
    post: (path: string, body: unknown) => Promise<ApiResponse<unknown>>;
    mkdirp: (dir: string) => void;
    writeFile: (filePath: string, text: string) => void;
    downloadToFile: (url: string, filePath: string) => Promise<void>;
    readFile: (filePath: string) => string;
    readFileBytes: (filePath: string) => Uint8Array;
    statFile: (filePath: string) => {
        size: number;
    } | null;
    uploadBytes: (uploadUrl: string, contentType: string, bytes: Uint8Array) => Promise<{
        ok: boolean;
        status: number;
        storageId?: string;
        body?: string;
    }>;
    probeDurationSec: (filePath: string) => number | null;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    dashboardUrl: string;
}
export declare const defaultDeps: VideoDeps;
export declare const VIDEO_NOT_FOUND_MESSAGE: string;
export declare function videoApiError(res: ApiResponse<unknown>): string;
export type RunStop = {
    at: "running";
    stage: string;
} | {
    at: "storyboard-gate";
    nodeId?: string;
} | {
    at: "final-watch";
} | {
    at: "paused";
    nodeId?: string;
    reason?: string;
} | {
    at: "failed";
    error?: string;
} | {
    at: "finished";
    status: string;
};
export declare function classifyRun(run: VideoRun): RunStop;
export declare function stageWord(stage: string): string;
export declare function stopLines(stop: RunStop, runId: string, dashboardUrl: string): string[];
export interface PullDownload {
    file: string;
    url: string;
}
export interface PullTextFile {
    file: string;
    body: string;
}
export interface ManifestScene {
    sceneIndex: number;
    durationSec: number | null;
    clip: string | null;
    words: string | null;
    voice: string | null;
    keyframe: string | null;
    qc: ClipQc | null;
    clipStatus: string;
    error: string | null;
    flagged: boolean;
    findings: ClipFinding[];
}
export interface PullFailure {
    file: string;
    url: string;
    error: string;
}
export interface VideoManifest {
    runId: string;
    pulledAt: string;
    dashboardUrl: string;
    storyboard: string | null;
    reference: string | null;
    music: string | null;
    scenes: ManifestScene[];
    failed: PullFailure[];
}
export interface PullPlan {
    downloads: PullDownload[];
    texts: PullTextFile[];
    manifest: VideoManifest;
}
export declare function extensionFromUrl(url: string): string | undefined;
export declare function scenePrefix(sceneIndex: number): string;
export declare function planPull(run: VideoRun, items: NodeItem[], opts: {
    pulledAt: string;
    dashboardUrl: string;
}): PullPlan;
export declare function markPullFailure(manifest: VideoManifest, failure: PullFailure): void;
export declare function missingSetupLabels(progress: ShowRow["setupProgress"]): string[];
export declare function showsFlow(json: boolean, deps: VideoDeps): Promise<FlowResult>;
export interface StartOptions {
    showId: string;
    scriptFile: string;
    voicePath?: string;
    music?: boolean;
    wait: boolean;
    json: boolean;
}
export declare function startFlow(opts: StartOptions, deps: VideoDeps): Promise<FlowResult>;
export declare function waitFlow(runId: string, opts: {
    json: boolean;
    url?: string;
    intervalMs?: number;
    maxPolls?: number;
}, deps: VideoDeps): Promise<FlowResult>;
export declare function statusFlow(runId: string, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export declare function storyboardFlow(runId: string, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export declare function approveFlow(runId: string, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export declare function flagFlow(runId: string, note: string, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export declare function pullFlow(runId: string, dir: string, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export declare function parseMvhdDurationSec(bytes: Uint8Array): number | null;
export declare const NO_DURATION_MESSAGE: string;
export declare function uploadFlow(runId: string, filePath: string, durationFlag: string | undefined, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export declare function parsePositional(args?: string[]): string[];
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
