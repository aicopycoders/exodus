export type PixarResumeStage = "scriptPrep" | "parser" | "storyboard" | "castSheet" | "storyboardImages" | "voiceAndClips" | "stitch";
export interface PixarRunPayload {
    runId: string;
    resumeFrom?: PixarResumeStage;
}
export interface PixarPausedResult {
    paused: true;
    status: string;
}
export interface PixarCompletedResult {
    muxPlaybackId: string;
    muxAssetId: string;
    finalDurationSec: number;
}
export type PixarRunResult = PixarPausedResult | PixarCompletedResult;
export interface PixarRunRow {
    _id: string;
    status: string;
    failedStage?: string;
    errorMessage?: string;
    muxPlaybackId?: string;
    muxAssetId?: string;
    finalDurationSec?: number;
    cost?: {
        total?: number;
    };
    castSheetStorageId?: string;
    voiceoverStorageIds?: string[];
    silentClipStorageIds?: string[];
    googleDocUrl?: string;
}
export interface PixarRunListItem {
    _id: string;
    status: string;
    createdAt: number;
    scriptInputMode?: "provided" | "generated";
    finalDurationSec?: number;
    muxPlaybackId?: string;
    failedStage?: string;
}
export interface PixarBundle {
    runPixarPipeline(payload: PixarRunPayload): Promise<PixarRunResult>;
    resolveWorkspaceId(workspaceSlug: string): Promise<string | null>;
    createRun(args: {
        workspaceId: string;
        triggeredByUserId: string;
        script?: string;
        scriptPrepBrief?: string;
        refImageUrl?: string;
        reviewMode: "auto" | "review";
    }): Promise<string>;
    fetchRun(runId: string): Promise<PixarRunRow | null>;
    listRuns(workspaceId: string, limit?: number): Promise<PixarRunListItem[]>;
}
