import { type ApiResponse } from "../lib/client.js";
import type { FlagOccurrence } from "../lib/args.js";
import { type RunProvenance, type WorkflowRun } from "./workflow.js";
export declare const helpText: string;
export declare const VOICES_PATH = "/api/v2/video/voices";
export interface ClipWord {
    w: string;
    s: number;
    e: number;
}
export interface ClipQc {
    verdict: "pass" | "fail";
    attempts: number;
    neighbours?: number[];
}
export interface ClipFinding {
    check: string;
    code: string;
    severity: "fail" | "warn";
    detail: string;
    judgeDetail?: string;
    judgeSeverity?: "fail" | "warn";
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
    storageId?: string;
} | {
    type: "video";
    sceneIndex?: number;
    videoUrl?: string;
    durationSec?: number;
    words?: ClipWord[];
    qc?: ClipQc;
    final?: boolean;
    revoiced?: boolean;
    speechTrimmed?: boolean;
    tailTrimmed?: boolean;
    rawStorageId?: string;
} | {
    type: "audio";
    sceneIndex?: number;
    audioUrl?: string;
    durationSec?: number;
    words?: ClipWord[];
    narration?: {
        takeHash: string;
        voiceId?: string;
        modelId?: string;
        speed?: number;
        alignment?: "elevenlabs-timestamps";
        cuts?: Array<{
            sceneIndex: number;
            startSec: number;
            durationSec: number;
            takeHash: string;
        }>;
    };
} | {
    type: "text" | "primer" | "session" | "document";
};
export interface VideoRunNode {
    nodeId: string;
    kind: string;
    status: "idle" | "running" | "done" | "failed" | "skipped";
    error?: string;
    warning?: string;
    outputs?: ArtifactSubset[];
}
export type BuilderPauseReason = "taste" | "repair" | "slots" | "call" | "checkpoint";
export interface PullCastLockMember {
    characterId: string;
    name: string;
    look?: string;
    identityRefs?: Array<{
        storageId?: string;
        imageUrl?: string;
    }>;
}
export interface PullCastLock {
    mintedAt: number;
    styleSlug?: string;
    cast: PullCastLockMember[];
}
export interface VideoRun {
    _id: string;
    status: string;
    isTerminal: boolean;
    error?: string;
    pauseReason?: BuilderPauseReason;
    pausedNodeId?: string;
    nodes: VideoRunNode[];
    pauseAhead?: WorkflowRun["pauseAhead"];
    castLock?: PullCastLock | null;
    provenance?: RunProvenance;
    workflowId?: string;
    moduleOwned?: boolean;
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
    staleClaim?: boolean;
    artifact?: ArtifactSubset;
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
    framesNodeId?: string;
} | {
    at: "final-watch";
} | {
    at: "paused";
    nodeId?: string;
    reason?: string;
} | {
    at: "failed";
    error?: string;
    repair?: true;
    nodeId?: string;
    step?: string;
} | {
    at: "finished";
    status: string;
};
export declare function classifyRun(run: VideoRun): RunStop;
export declare function stageWord(stage: string): string;
export declare function stepName(kind: string | undefined): string;
export declare function reviewUrl(dashboardUrl: string, run: Pick<VideoRun, "_id" | "workflowId" | "moduleOwned">): string;
export declare function stopLines(stop: RunStop, runId: string, runUrl: string): string[];
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
    wordsFrom: "clip" | "voice" | null;
    wordsDescribe: "original-performance" | "this-file" | null;
    voice: string | null;
    keyframe: string | null;
    qc: ClipQc | null;
    revoiced: boolean | null;
    speechTrimmed: boolean | null;
    rawStorageId: string | null;
    clipStatus: string;
    error: string | null;
    flagged: boolean;
    findings: ClipFinding[];
    keyframeFindings: ClipFinding[] | null;
}
export interface PullFailure {
    file: string;
    url: string;
    error: string;
}
export interface ManifestCastRef {
    characterId: string | null;
    name: string | null;
    file: string | null;
    status: string;
    error: string | null;
    voiceId: string | null;
    voiceLabel: string | null;
    voiceDescription: string | null;
}
export interface VideoManifest {
    runId: string;
    pulledAt: string;
    dashboardUrl: string;
    storyboard: string | null;
    reference: string | null;
    music: string | null;
    cast: ManifestCastRef[];
    narration: {
        file: string;
        timing: string;
    } | null;
    scenes: ManifestScene[];
    failed: PullFailure[];
    provenance?: RunProvenance;
}
export declare const CAST_LEDGER_BASE = 910000;
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
export declare function retryFrameFlow(runId: string, nodeId: string, sceneIndex: number, note: string | undefined, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export type ClipRedoPlan = {
    ok: true;
    nodeId: string;
    sceneIndex: number;
    attempt: number;
    warnings: string[];
} | {
    ok: false;
    reason: string;
};
export interface ClipRedoTarget {
    sceneIndex: number;
    nodeId?: string;
}
export declare function planClipRedo(run: VideoRun, items: NodeItem[], target: ClipRedoTarget): ClipRedoPlan;
export declare function retryClipFlow(runId: string, target: ClipRedoTarget, note: string | undefined, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export declare const VOICE_PATHS_NEVER_HEARD: Set<string>;
export declare function planClipRevoice(run: VideoRun, items: NodeItem[], target: ClipRedoTarget): ClipRedoPlan;
export type RevoiceTarget = ClipRedoTarget | {
    all: true;
};
export declare function revoiceFlow(runId: string, target: RevoiceTarget, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export interface CastVoiceRow {
    characterId: string;
    name: string;
    voice: {
        voiceId: string;
        label?: string;
    } | null;
    voiceFrom?: "own-pin" | "run-default";
    availability?: {
        state: "available";
        providerName: string;
    } | {
        state: "missing";
    } | {
        state: "not-checked";
        why: string;
    };
    description?: string;
    spokenScenes: number;
    spokenSeconds: number;
}
export interface CastVoiceSheet {
    runId: string;
    canChange: boolean;
    whyNot?: string;
    cast: CastVoiceRow[];
    narrator: {
        voiceId: string;
        label?: string;
    } | null;
    treatment: {
        kind?: string;
        path?: string | null;
        usesElevenLabs?: boolean;
        summary: string;
        provider: string;
        model: string;
        speedChange: boolean;
        costNote: string;
        usage: {
            clips: number;
            seconds: number;
        };
    };
    notices: string[];
    changed?: string[];
}
export type VoiceMap = Record<string, string | {
    voiceId: string;
    label?: string;
} | null>;
export declare function parseVoiceFlags(occurrences: FlagOccurrence[], readFile: (path: string) => string): VoiceMap | null;
export declare function voicesFlow(runId: string, voices: VoiceMap | null, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export declare function voiceSheetLines(sheet: CastVoiceSheet): string[];
export declare function pullFlow(runId: string, dir: string, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export declare function parseMvhdDurationSec(bytes: Uint8Array): number | null;
export declare const NO_DURATION_MESSAGE: string;
export declare function describeFetchFailure(err: unknown): string;
export declare function uploadFlow(runId: string, filePath: string, durationFlag: string | undefined, json: boolean, deps: VideoDeps): Promise<FlowResult>;
export declare function parsePositional(args?: string[]): string[];
export declare function run(flags: Record<string, string | boolean>, occurrences: FlagOccurrence[]): Promise<void>;
