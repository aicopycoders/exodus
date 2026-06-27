// Type boundary for the bundled Pixar orchestrator.
//
// `exodus pixar run` dynamic-imports the esbuild bundle at runtime via
//   new URL("../pixar-orchestrator.js", import.meta.url)
// (resolved relative to dist/commands/pixar.js → dist/pixar-orchestrator.js).
// That bundle is built from scout/src/pixar/exodus-entry.ts and is gitignored /
// rebuilt by packaging, so tsc must never try to resolve it. We hand-maintain
// the bundle's public surface here and cast the dynamic import to `PixarBundle`.
//
// Keep this in sync with scout/src/pixar/exodus-entry.ts exports.

export type PixarResumeStage =
  | "scriptPrep"
  | "parser"
  | "storyboard"
  | "castSheet"
  | "storyboardImages"
  | "voiceAndClips"
  | "stitch";

export interface PixarRunPayload {
  runId: string;
  resumeFrom?: PixarResumeStage;
}

/** runPixarPipeline pauses at a review checkpoint. */
export interface PixarPausedResult {
  paused: true;
  status: string;
}

/** runPixarPipeline ran to completion (final video on Mux). */
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
  cost?: { total?: number };
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

/** Public surface of exodus/dist/pixar-orchestrator.js. */
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
