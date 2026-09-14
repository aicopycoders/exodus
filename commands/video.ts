import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { apiGet, apiPost, getDashboardUrl, type ApiResponse } from "../lib/client.js";
import { displayRunStatus, formatApiError } from "../lib/format.js";
import { missingRouteLine } from "../lib/route-support.js";
import { hasBinary } from "../lib/preflight.js";
import { ASSET_UPLOAD_POLICY } from "./workflow.js";

export const helpText = `
exodus video — make an ad from a Show, pull every piece, upload your cut

The dashboard makes the PIECES of an ad: the storyboard, one picture per scene,
one voice track per scene, one video clip per scene, plus the music bed. It does
not make the finished ad. You pull the pieces to a folder, cut them together
with whatever editing tools you like, and upload the cut back.

The whole loop, in order:

  1. exodus video shows
     Which Shows exist and which are ready to make ads.

  2. exodus video start --show <id> --script script.txt --wait
     Starts an ad and waits. It stops when the storyboard needs your yes.

  3. exodus video storyboard <runId>
     The scene cards: what each scene says and the picture it will look like.

  4. exodus video approve <runId>          (looks right — keep going)
     exodus video flag <runId> --note "…"  (something is wrong — send it back)

  5. exodus video status <runId>
     Where the run is and how each scene's clip turned out.

  6. exodus video pull <runId> --out ./ad
     Writes every piece to that folder plus a manifest.json index.

  7. Make your cut from those files.

  8. exodus video upload <runId> --file cut.mp4
     Attaches your cut to the run and prints the page to approve it on.

  9. exodus video approve <runId>
     Or click Approve on the page from step 8.

Usage:
  exodus video shows [--json]
  exodus video start --show <id> --script <file> [--voice-path <v>] [--no-music] [--wait] [--json]
  exodus video status <runId> [--json]
  exodus video storyboard <runId> [--json]
  exodus video approve <runId> [--json]
  exodus video flag <runId> --note "<what is wrong>" [--json]
  exodus video pull <runId> --out <dir> [--json]
  exodus video upload <runId> --file <cut.mp4> [--duration <sec>] [--json]

Options:
  --show <id>          Which Show the ad belongs to (from: exodus video shows)
  --script <file>      A text file with the words you want the ad to say
  --voice-path <v>     Override the Show's voice path for this ad
  --no-music           Skip the music bed
  --wait               Stay open and report as the run moves; stops at every
                       point that needs you
  --out <dir>          Folder to write the pulled pieces into (pull)
  --file <cut.mp4>     Your finished cut (upload). MP4, MOV or WebM, up to 200MB
  --duration <sec>     How long your cut is, in seconds. Only needed when the
                       length can't be read off the file itself
  --note "<text>"      What is wrong with the storyboard (flag)
  --json               Machine-readable output
  --help, -h           Show this help

Video is admin-only. If every command here answers "video isn't enabled for
this key", your dashboard user needs the admin role on this brand.

Examples:
  exodus video shows
  exodus video start --show k57abc --script ./script.txt --wait
  exodus video storyboard run_123
  exodus video approve run_123
  exodus video pull run_123 --out ./ad-run_123
  exodus video upload run_123 --file ./cut.mp4
`.trim();

const SHOWS_PATH = "/api/v2/shows";
const RUNS_PATH = "/api/v2/video/runs";
const RUN_PATH = "/api/v2/workflow";
const ITEMS_PATH = "/api/v2/workflow/items";
const STORYBOARD_PATH = "/api/v2/video/storyboard";
const FLAG_PATH = "/api/v2/video/storyboard/flag";
const APPROVE_PATH = "/api/v2/workflow/approve";
const FINAL_PATH = "/api/v2/video/final";
const ASSET_UPLOAD_URL_PATH = "/api/v2/workflows/asset-upload-url";
const ASSETS_PATH = "/api/v2/workflows/assets";

export interface ClipWord {
  w: string;
  s: number;
  e: number;
}

export interface ClipQc {
  verdict: "pass" | "fail";
  attempts: number;
  /** #1711: the accepted neighbour scenes this take was judged against for
   *  continuity. Present only on a set-locked identity reroll. */
  neighbours?: number[];
}

export interface ClipFinding {
  check: string;
  code: string;
  severity: "fail" | "warn";
  detail: string;
}

/** A SUBSET of the server's artifact union (convex/schema.ts): exodus compiles
 *  standalone (tsconfig rootDir ".") and cannot import the canonical type. */
export type ArtifactSubset =
  | { type: "storyboard"; storyboard?: unknown; storyboardJson?: string }
  | { type: "frames"; frames?: Array<{ sceneIndex: number; imageUrl?: string }> }
  | { type: "image"; imageUrl?: string }
  | {
      type: "video";
      sceneIndex?: number;
      videoUrl?: string;
      durationSec?: number;
      words?: ClipWord[];
      qc?: ClipQc;
      final?: boolean;
      /** #1708: the cast voice was applied over the generated voice. */
      revoiced?: boolean;
      /** #1708: the clip was trimmed to its spoken words. */
      speechTrimmed?: boolean;
    }
  | {
      type: "audio";
      sceneIndex?: number;
      audioUrl?: string;
      durationSec?: number;
      /** #1689: narration word timings, seconds from the start of this track. */
      words?: ClipWord[];
    }
  | { type: "text" | "primer" | "session" | "document" };

export interface VideoRunNode {
  nodeId: string;
  kind: string;
  status: "idle" | "running" | "done" | "failed" | "skipped";
  error?: string;
  outputs?: ArtifactSubset[];
}

/** The park vocabulary of BUILDER checkpoints. A video gate is none of them, so
 *  the presence of any one of these rules a video gate out. */
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

/** Every read of a run goes through here. A run whose node list is missing or
 *  malformed reads as a run that has not made anything, never as a crash. */
export function asVideoRun(data: unknown): VideoRun {
  const run = (data ?? {}) as VideoRun;
  return { ...run, nodes: Array.isArray(run.nodes) ? run.nodes : [] };
}

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
  setupProgress?: { set?: boolean; cast?: boolean; voices?: boolean };
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
  statFile: (filePath: string) => { size: number } | null;
  uploadBytes: (
    uploadUrl: string,
    contentType: string,
    bytes: Uint8Array,
  ) => Promise<{ ok: boolean; status: number; storageId?: string; body?: string }>;
  probeDurationSec: (filePath: string) => number | null;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  dashboardUrl: string;
}

function defaultProbeDurationSec(filePath: string): number | null {
  if (!hasBinary("ffprobe")) return null;
  const res = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
    { encoding: "utf-8" },
  );
  if (res.error || res.status !== 0) return null;
  const seconds = Number.parseFloat((res.stdout ?? "").trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export const defaultDeps: VideoDeps = {
  get: (p) => apiGet<unknown>(p),
  post: (p, body) => apiPost<unknown>(p, body),
  mkdirp: (dir) => {
    fs.mkdirSync(dir, { recursive: true });
  },
  writeFile: (filePath, text) => fs.writeFileSync(filePath, text, "utf-8"),
  downloadToFile: async (url, filePath) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
  },
  readFile: (filePath) => fs.readFileSync(filePath, "utf-8"),
  readFileBytes: (filePath) => fs.readFileSync(filePath),
  statFile: (filePath) => {
    try {
      const stat = fs.statSync(filePath);
      return stat.isFile() ? { size: stat.size } : null;
    } catch {
      return null;
    }
  },
  uploadBytes: async (uploadUrl, contentType, bytes) => {
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: new Blob([bytes as BlobPart]),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, body };
    }
    const parsed = (await res.json().catch(() => ({}))) as { storageId?: string };
    return { ok: true, status: res.status, storageId: parsed.storageId };
  },
  probeDurationSec: defaultProbeDurationSec,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  dashboardUrl: getDashboardUrl(),
};

/** The video gate answers a plain 404 rather than a 403, so a key that may not
 *  use video and a run id that does not exist are the same answer on the wire.
 *  Both causes are named because neither can be ruled out from here. */
export const VIDEO_NOT_FOUND_MESSAGE =
  "video isn't enabled for this key\n" +
  "Either your dashboard user needs the admin role on this brand (video is admin-only), or that run id doesn't exist here. Check the id, then ask Brad about the role.";

export function videoApiError(res: ApiResponse<unknown>): string {
  const behind = missingRouteLine(res, "exodus video");
  if (behind) return behind;
  if (res.status === 404) return VIDEO_NOT_FOUND_MESSAGE;
  return formatApiError(res);
}

function errorResult(res: ApiResponse<unknown>, json: boolean): FlowResult {
  return {
    code: 1,
    lines: json
      ? [JSON.stringify({ ok: false, status: res.status, error: videoApiError(res) })]
      : [videoApiError(res)],
  };
}

export type RunStop =
  | { at: "running"; stage: string }
  | { at: "storyboard-gate"; nodeId?: string }
  | { at: "final-watch" }
  | { at: "paused"; nodeId?: string; reason?: string }
  // #1687: a "repair" park rides the FAILED arm rather than a new one of its
  // own. A run parked for repair has a dead step in it — `wait` must exit
  // nonzero, `status` must say failed, and a retry is what fixes it. Every
  // consumer already treats `at: "failed"` that way, so the honest reading is
  // the default one; a separate arm would let any consumer that forgot about
  // it quietly call a dead run a success. `repair` only adds the detail that
  // this failure is retryable step-by-step, and `step`/`nodeId` name which
  // step died.
  | { at: "failed"; error?: string; repair?: true; nodeId?: string; step?: string }
  | { at: "finished"; status: string };

const GATE_NODE_KINDS = new Set(["scene-frames", "storyboard"]);

function isAwaitingApproval(status: string): boolean {
  return status === "awaiting-approval" || status === "awaiting-review";
}

function parkedByBuilderCheckpoint(run: VideoRun): boolean {
  return run.pauseReason !== undefined;
}

function parkedAtStoryboardGate(run: VideoRun, pausedNode: VideoRunNode): boolean {
  return !parkedByBuilderCheckpoint(run) && GATE_NODE_KINDS.has(pausedNode.kind);
}

function parkedAtFinalWatch(run: VideoRun): boolean {
  return (
    !parkedByBuilderCheckpoint(run) &&
    run.nodes.some((n) => n.kind === "video" && n.status === "done")
  );
}

export function classifyRun(run: VideoRun): RunStop {
  if (run.status === "failed") return { at: "failed", error: run.error };
  if (run.isTerminal) return { at: "finished", status: run.status };
  if (isAwaitingApproval(run.status)) {
    // #1687: a "repair" park is a FAILURE wearing a park's clothes. The
    // storyboard node died, its siblings were skipped, and the run stalled on
    // the collector waiting for someone to retry or skip — so the run status
    // says awaiting-approval and `pausedNodeId` points at the collector, which
    // made nothing and explains nothing. Read the dead step out of the node
    // list instead, and report the failure it actually is.
    if (run.pauseReason === "repair") {
      const deadNode = run.nodes.find((n) => n.status === "failed");
      const why = deadNode?.error ?? run.error;
      return {
        at: "failed",
        repair: true,
        nodeId: deadNode?.nodeId ?? run.pausedNodeId,
        ...(deadNode?.kind ? { step: deadNode.kind } : {}),
        ...(why ? { error: why } : {}),
      };
    }
    const pausedNode = run.nodes.find((n) => n.nodeId === run.pausedNodeId);
    if (pausedNode && parkedAtStoryboardGate(run, pausedNode)) {
      return { at: "storyboard-gate", nodeId: pausedNode.nodeId };
    }
    if (parkedAtFinalWatch(run)) return { at: "final-watch" };
    return { at: "paused", nodeId: run.pausedNodeId, reason: run.pauseReason };
  }
  const active = run.nodes.find((n) => n.status === "running");
  return { at: "running", stage: active?.kind ?? "starting" };
}

const STAGE_WORDS: Record<string, string> = {
  brief: "reading the script",
  storyboard: "writing the storyboard",
  reference: "drawing the reference still",
  "scene-frames": "drawing one picture per scene",
  voiceover: "recording the voices",
  video: "rendering the clips",
  starting: "starting up",
};

export function stageWord(stage: string): string {
  return STAGE_WORDS[stage] ?? stage;
}

/** #1687: the same steps STAGE_WORDS names, as the SUBJECT of a sentence —
 *  "The storyboard failed", not "The writing the storyboard failed". */
const STEP_NAMES: Record<string, string> = {
  brief: "The script read",
  storyboard: "The storyboard",
  reference: "The reference still",
  "scene-frames": "The scene pictures",
  voiceover: "The voices",
  video: "The clips",
};

export function stepName(kind: string | undefined): string {
  if (!kind) return "A step in this run";
  return STEP_NAMES[kind] ?? `The ${kind} step`;
}

export function stopLines(stop: RunStop, runId: string, dashboardUrl: string): string[] {
  if (stop.at === "storyboard-gate") {
    return [
      "Parked: the storyboard is waiting for your yes.",
      `Read it:    exodus video storyboard ${runId}`,
      `Approve it: exodus video approve ${runId}`,
      `Send back:  exodus video flag ${runId} --note "what's wrong"`,
    ];
  }
  if (stop.at === "final-watch") {
    return [
      "Parked: every piece is made and the run is waiting for a cut.",
      `Pull the pieces: exodus video pull ${runId} --out ./ad-${runId}`,
      `Then upload:     exodus video upload ${runId} --file cut.mp4`,
    ];
  }
  if (stop.at === "failed") {
    // #1687: a repair park names the step that died and offers the retry,
    // instead of the old "waiting on someone (repair)" — nobody was waiting,
    // and there was nothing to wait for.
    if (stop.repair) {
      return [
        `${stepName(stop.step)} failed${stop.error ? `: ${stop.error}` : "."}`,
        `Try that step again: exodus workflow repair ${runId} retry`,
        `Or open the run:     ${dashboardUrl}/video?ad=${runId}`,
      ];
    }
    return [
      `This run failed${stop.error ? `: ${stop.error}` : "."}`,
      `See how far it got: exodus video status ${runId}`,
    ];
  }
  if (stop.at === "finished") {
    return [
      `This run is finished (${displayRunStatus(stop.status)}).`,
      `Pull what it made: exodus video pull ${runId} --out ./ad-${runId}`,
    ];
  }
  if (stop.at === "paused") {
    return [
      `Parked: this run is waiting on someone${stop.reason ? ` (${stop.reason})` : ""}.`,
      `Open it: ${dashboardUrl}/video?ad=${runId}`,
    ];
  }
  return [`Working: ${stageWord(stop.stage)}.`];
}

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
  /** Which media the timings in `words` are relative to: the clip's own sound,
   *  or the scene's voice track. Null when no word times were delivered. */
  wordsFrom: "clip" | "voice" | null;
  voice: string | null;
  keyframe: string | null;
  qc: ClipQc | null;
  /** #1708: true when the cast voice was applied over the clip's generated voice,
   *  false when the clip kept it, null when there is no clip. */
  revoiced: boolean | null;
  /** #1708: true when the clip was trimmed to its spoken words; null without a clip. */
  speechTrimmed: boolean | null;
  /** The clip ledger row's status (pending/running/done/failed), or "missing"
   *  when the run never wrote one. */
  clipStatus: string;
  error: string | null;
  flagged: boolean;
  findings: ClipFinding[];
  /** #1708: what the picture check found on the scene's keyframe (its frame row). */
  keyframeFindings: ClipFinding[];
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

const FALLBACK_EXT: Record<string, string> = {
  image: "png",
  video: "mp4",
  audio: "mp3",
};

export function extensionFromUrl(url: string): string | undefined {
  const withoutQuery = url.split(/[?#]/)[0];
  const match = withoutQuery.match(/\.([a-z0-9]{1,5})$/i);
  return match ? match[1].toLowerCase() : undefined;
}

function extFor(url: string, family: "image" | "video" | "audio"): string {
  return extensionFromUrl(url) ?? FALLBACK_EXT[family];
}

export function scenePrefix(sceneIndex: number): string {
  return `scene-${String(sceneIndex).padStart(2, "0")}`;
}

function outputsOfNodeKind(run: VideoRun, kind: string): ArtifactSubset[] {
  return run.nodes.filter((n) => n.kind === kind).flatMap((n) => n.outputs ?? []);
}

export function planPull(
  run: VideoRun,
  items: NodeItem[],
  opts: { pulledAt: string; dashboardUrl: string },
): PullPlan {
  const texts: PullTextFile[] = [];

  const storyboardArtifact = run.nodes
    .flatMap((n) => n.outputs ?? [])
    .find((a): a is Extract<ArtifactSubset, { type: "storyboard" }> => a.type === "storyboard");
  let storyboard: string | null = null;
  if (storyboardArtifact) {
    const raw =
      typeof storyboardArtifact.storyboardJson === "string"
        ? storyboardArtifact.storyboardJson
        : storyboardArtifact.storyboard !== undefined
          ? JSON.stringify(storyboardArtifact.storyboard, null, 2)
          : undefined;
    if (raw !== undefined) {
      storyboard = "storyboard.json";
      texts.push({ file: storyboard, body: raw.endsWith("\n") ? raw : `${raw}\n` });
    }
  }

  // Every slot below holds AT MOST ONE artifact, the last the run emitted. A
  // retaken scene emits a second artifact, sometimes in a different container
  // (.mov replacing .mp4), so keying on the slot rather than on the filename is
  // what stops the older take being downloaded as a file nothing indexes.
  let reference: PullDownload | null = null;
  for (const artifact of outputsOfNodeKind(run, "reference")) {
    if (artifact.type !== "image" || !artifact.imageUrl) continue;
    reference = {
      file: `reference.${extFor(artifact.imageUrl, "image")}`,
      url: artifact.imageUrl,
    };
  }

  const keyframeByScene = new Map<number, PullDownload>();
  for (const artifact of run.nodes.flatMap((n) => n.outputs ?? [])) {
    if (artifact.type !== "frames") continue;
    for (const frame of artifact.frames ?? []) {
      if (!frame.imageUrl) continue;
      keyframeByScene.set(frame.sceneIndex, {
        file: `${scenePrefix(frame.sceneIndex)}.keyframe.${extFor(frame.imageUrl, "image")}`,
        url: frame.imageUrl,
      });
    }
  }

  const voiceByScene = new Map<number, { download: PullDownload; words: ClipWord[] | null }>();
  for (const artifact of outputsOfNodeKind(run, "voiceover")) {
    if (artifact.type !== "audio" || typeof artifact.sceneIndex !== "number") continue;
    if (!artifact.audioUrl) continue;
    voiceByScene.set(artifact.sceneIndex, {
      download: {
        file: `${scenePrefix(artifact.sceneIndex)}.voice.${extFor(artifact.audioUrl, "audio")}`,
        url: artifact.audioUrl,
      },
      words: artifact.words ?? null,
    });
  }

  const clipByScene = new Map<
    number,
    {
      download: PullDownload;
      durationSec: number | null;
      qc: ClipQc | null;
      words: ClipWord[] | null;
      revoiced: boolean;
      speechTrimmed: boolean;
    }
  >();
  let music: PullDownload | null = null;
  for (const artifact of outputsOfNodeKind(run, "video")) {
    if (artifact.type === "audio" && artifact.sceneIndex === undefined && artifact.audioUrl) {
      music = { file: `music.${extFor(artifact.audioUrl, "audio")}`, url: artifact.audioUrl };
      continue;
    }
    if (artifact.type !== "video" || typeof artifact.sceneIndex !== "number") continue;
    if (artifact.final || !artifact.videoUrl) continue;
    clipByScene.set(artifact.sceneIndex, {
      download: {
        file: `${scenePrefix(artifact.sceneIndex)}.${extFor(artifact.videoUrl, "video")}`,
        url: artifact.videoUrl,
      },
      durationSec: artifact.durationSec ?? null,
      qc: artifact.qc ?? null,
      words: artifact.words ?? null,
      revoiced: artifact.revoiced === true,
      speechTrimmed: artifact.speechTrimmed === true,
    });
  }

  const clipItemByScene = new Map<number, NodeItem>();
  const frameItemByScene = new Map<number, NodeItem>();
  // The reference node also writes a "frame" row (scene 0); only the scene-frames
  // node's rows are scene keyframes.
  const sceneFrameNodeIds = new Set(
    run.nodes.filter((n) => n.kind === "scene-frames").map((n) => n.nodeId),
  );
  for (const item of items) {
    if (item.itemKind === "clip") clipItemByScene.set(item.sceneIndex, item);
    if (item.itemKind === "frame" && sceneFrameNodeIds.has(item.nodeId)) {
      frameItemByScene.set(item.sceneIndex, item);
    }
  }

  const sceneIndexes = [
    ...new Set([
      ...clipByScene.keys(),
      ...voiceByScene.keys(),
      ...keyframeByScene.keys(),
      ...clipItemByScene.keys(),
      ...frameItemByScene.keys(),
    ]),
  ].sort((a, b) => a - b);

  const scenes: ManifestScene[] = sceneIndexes.map((sceneIndex) => {
    const clip = clipByScene.get(sceneIndex);
    const voice = voiceByScene.get(sceneIndex);
    const item = clipItemByScene.get(sceneIndex);
    const frameItem = frameItemByScene.get(sceneIndex);
    // #1689: a narrated scene's timings ride on its voice track. The clip wins
    // when both exist, because a clip with its own dialogue is what plays; the
    // voice track only fills a silent clip.
    let source: ClipWord[] | null = null;
    let wordsFrom: "clip" | "voice" | null = null;
    if (clip?.words && clip.words.length > 0) {
      source = clip.words;
      wordsFrom = "clip";
    } else if (voice?.words && voice.words.length > 0) {
      source = voice.words;
      wordsFrom = "voice";
    }
    let words: string | null = null;
    if (source) {
      words = `${scenePrefix(sceneIndex)}.words.json`;
      texts.push({ file: words, body: `${JSON.stringify(source, null, 2)}\n` });
    }
    return {
      sceneIndex,
      durationSec: clip?.durationSec ?? null,
      clip: clip?.download.file ?? null,
      words,
      wordsFrom,
      voice: voice?.download.file ?? null,
      keyframe: keyframeByScene.get(sceneIndex)?.file ?? null,
      qc: clip?.qc ?? null,
      revoiced: clip ? clip.revoiced : null,
      speechTrimmed: clip ? clip.speechTrimmed : null,
      clipStatus: item?.status ?? "missing",
      error: item?.error ?? null,
      flagged: item?.flagged === true,
      findings: item?.findings ?? [],
      keyframeFindings: frameItem?.findings ?? [],
    };
  });

  const downloads: PullDownload[] = [
    ...(reference ? [reference] : []),
    ...keyframeByScene.values(),
    ...[...voiceByScene.values()].map((v) => v.download),
    ...[...clipByScene.values()].map((c) => c.download),
    ...(music ? [music] : []),
  ];

  return {
    downloads,
    texts,
    manifest: {
      runId: run._id,
      pulledAt: opts.pulledAt,
      dashboardUrl: `${opts.dashboardUrl}/video?ad=${run._id}`,
      storyboard,
      reference: reference?.file ?? null,
      music: music?.file ?? null,
      scenes,
      failed: [],
    },
  };
}

export function markPullFailure(manifest: VideoManifest, failure: PullFailure): void {
  manifest.failed.push(failure);
  if (manifest.storyboard === failure.file) manifest.storyboard = null;
  if (manifest.reference === failure.file) manifest.reference = null;
  if (manifest.music === failure.file) manifest.music = null;
  for (const scene of manifest.scenes) {
    // #1689: the word times are relative to ONE file. If that file never
    // landed, the cut would play the other track and read these times against
    // it, so the times go with the file they were measured on.
    const lostWordsSource =
      (scene.clip === failure.file && scene.wordsFrom === "clip") ||
      (scene.voice === failure.file && scene.wordsFrom === "voice");
    if (scene.clip === failure.file) {
      scene.clip = null;
      scene.revoiced = null;
      scene.speechTrimmed = null;
    }
    if (scene.voice === failure.file) scene.voice = null;
    if (scene.keyframe === failure.file) scene.keyframe = null;
    if (scene.words === failure.file || lostWordsSource) {
      scene.words = null;
      scene.wordsFrom = null;
    }
  }
}

const PULL_CONCURRENCY = 4;

async function runPool<T>(jobs: Array<() => Promise<T>>, size: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= jobs.length) return;
      results[index] = await jobs[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker));
  return results;
}

const DOWNLOAD_ATTEMPTS = 2;

async function downloadWithRetry(
  download: PullDownload,
  dir: string,
  deps: VideoDeps,
): Promise<PullFailure | null> {
  let lastError = "";
  for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      await deps.downloadToFile(download.url, path.join(dir, download.file));
      return null;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { file: download.file, url: download.url, error: lastError };
}

const SETUP_LABELS: Array<{ key: "set" | "cast" | "voices"; label: string }> = [
  { key: "set", label: "Set" },
  { key: "cast", label: "Cast" },
  { key: "voices", label: "Voices" },
];

export function missingSetupLabels(progress: ShowRow["setupProgress"]): string[] {
  if (!progress) return [];
  return SETUP_LABELS.filter(({ key }) => progress[key] !== true).map(({ label }) => label);
}

export async function showsFlow(json: boolean, deps: VideoDeps): Promise<FlowResult> {
  const res = await deps.get(SHOWS_PATH);
  if (!res.ok) return errorResult(res, json);
  const shows = ((res.data as { shows?: ShowRow[] }).shows ?? []).slice();
  if (json) return { code: 0, lines: [JSON.stringify({ shows })] };
  if (shows.length === 0) {
    return {
      code: 0,
      lines: [
        "No Shows on this brand yet.",
        "A Show is the set, cast and voices your ads reuse. Make one in the dashboard under Video.",
      ],
    };
  }
  const idWidth = Math.max(2, ...shows.map((s) => s.id.length));
  const nameWidth = Math.max(4, ...shows.map((s) => s.name.length));
  const lines = [
    `${"id".padEnd(idWidth)}  ${"name".padEnd(nameWidth)}  state`,
    ...shows.map((show) => {
      const missing = missingSetupLabels(show.setupProgress);
      const state =
        show.ready === true
          ? "ready"
          : missing.length > 0
            ? `not ready — still needs ${missing.join(", ")}`
            : "not ready";
      return `${show.id.padEnd(idWidth)}  ${show.name.padEnd(nameWidth)}  ${state}`;
    }),
    "",
    "Start an ad on a ready Show: exodus video start --show <id> --script script.txt",
  ];
  return { code: 0, lines };
}

export interface StartOptions {
  showId: string;
  scriptFile: string;
  voicePath?: string;
  music?: boolean;
  wait: boolean;
  json: boolean;
}

export async function startFlow(opts: StartOptions, deps: VideoDeps): Promise<FlowResult> {
  let script: string;
  try {
    script = deps.readFile(opts.scriptFile);
  } catch (e) {
    return {
      code: 1,
      lines: [
        `Can't read the script file "${opts.scriptFile}": ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }
  if (script.trim().length === 0) {
    return { code: 1, lines: [`The script file "${opts.scriptFile}" is empty.`] };
  }

  const res = await deps.post(RUNS_PATH, {
    showId: opts.showId,
    script,
    ...(opts.voicePath ? { voicePath: opts.voicePath } : {}),
    ...(opts.music === false ? { music: false } : {}),
  });
  if (!res.ok) return errorResult(res, opts.json);
  const started = res.data as { runId?: string; url?: string };
  if (!started.runId) {
    return { code: 1, lines: ["The server started the ad but did not say which run it is."] };
  }
  const runId = started.runId;
  const url = started.url ?? `${deps.dashboardUrl}/video?ad=${runId}`;

  if (!opts.wait) {
    const lines = [
      `Started ad run ${runId}`,
      `Watch it: ${url}`,
      "",
      `Wait for the storyboard here instead: exodus video start … --wait`,
      `Or check in whenever:                exodus video status ${runId}`,
    ];
    return {
      code: 0,
      lines: opts.json ? [JSON.stringify({ runId, url })] : lines,
    };
  }

  const waited = await waitFlow(runId, { json: opts.json, url }, deps);
  return {
    code: waited.code,
    lines: opts.json ? waited.lines : [`Started ad run ${runId}`, `Watch it: ${url}`, "", ...waited.lines],
  };
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 720;

export async function waitFlow(
  runId: string,
  opts: { json: boolean; url?: string; intervalMs?: number; maxPolls?: number },
  deps: VideoDeps,
): Promise<FlowResult> {
  const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
  const maxPolls = opts.maxPolls ?? MAX_POLLS;
  const lines: string[] = [];
  let lastStage: string | null = null;

  for (let poll = 0; poll < maxPolls; poll++) {
    if (poll > 0) await deps.sleep(interval);
    const res = await deps.get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!res.ok) {
      const failed = errorResult(res, opts.json);
      return { code: failed.code, lines: [...lines, ...failed.lines] };
    }
    const run = asVideoRun(res.data);
    const stop = classifyRun(run);
    if (stop.at === "running") {
      if (stop.stage !== lastStage) {
        lastStage = stop.stage;
        if (!opts.json) lines.push(`Working: ${stageWord(stop.stage)}…`);
      }
      continue;
    }
    if (opts.json) {
      return {
        code: stop.at === "failed" ? 1 : 0,
        lines: [JSON.stringify({ runId, stop, status: run.status, url: opts.url })],
      };
    }
    return {
      code: stop.at === "failed" ? 1 : 0,
      lines: [...lines, ...stopLines(stop, runId, deps.dashboardUrl)],
    };
  }

  const timeoutLine = `Still running after ${Math.round((maxPolls * interval) / 60000)} minutes. Check in with: exodus video status ${runId}`;
  return {
    code: 0,
    lines: opts.json ? [JSON.stringify({ runId, stop: { at: "running" }, timedOut: true })] : [...lines, timeoutLine],
  };
}

const ITEM_STATUS_WORD: Record<string, string> = {
  done: "done",
  failed: "failed",
  running: "working",
  idle: "waiting",
  skipped: "skipped",
};

function itemWord(item: NodeItem | undefined): string {
  if (!item) return "—";
  if (item.flagged === true) return "flagged";
  return ITEM_STATUS_WORD[item.status] ?? item.status;
}

export async function statusFlow(
  runId: string,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const runRes = await deps.get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!runRes.ok) return errorResult(runRes, json);
  const run = asVideoRun(runRes.data);

  const itemsRes = await deps.get(`${ITEMS_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!itemsRes.ok) return errorResult(itemsRes, json);
  const items = (itemsRes.data as { items?: NodeItem[] }).items ?? [];

  const stop = classifyRun(run);
  const hasFinal = items.some((i) => i.itemKind === "final" && i.status === "done");

  if (json) {
    return { code: 0, lines: [JSON.stringify({ runId, status: run.status, stop, items, hasFinal })] };
  }

  const revoicedByScene = new Set<number>();
  for (const artifact of outputsOfNodeKind(run, "video")) {
    if (artifact.type === "video" && artifact.revoiced === true && typeof artifact.sceneIndex === "number") {
      revoicedByScene.add(artifact.sceneIndex);
    }
  }

  const byScene = new Map<number, { clip?: NodeItem; voiceover?: NodeItem; frame?: NodeItem }>();
  const sceneFrameNodeIds = new Set(
    run.nodes.filter((n) => n.kind === "scene-frames").map((n) => n.nodeId),
  );
  for (const item of items) {
    if (item.itemKind !== "clip" && item.itemKind !== "voiceover" && item.itemKind !== "frame") {
      continue;
    }
    if (item.itemKind === "frame" && !sceneFrameNodeIds.has(item.nodeId)) continue;
    const row = byScene.get(item.sceneIndex) ?? {};
    row[item.itemKind] = item;
    byScene.set(item.sceneIndex, row);
  }

  // #1687: a repair park's raw status is still "awaiting-approval", so the
  // headline read "Awaiting approval" over a run whose storyboard was dead.
  // The classification is the honest headline for that one case.
  const headline =
    stop.at === "failed" && stop.repair
      ? `Ad run ${runId} — Stopped, a step failed`
      : `Ad run ${runId} — ${displayRunStatus(run.status)}`;
  const lines = [headline, ...stopLines(stop, runId, deps.dashboardUrl)];

  if (byScene.size === 0) {
    lines.push("", "No scenes yet — this run hasn't made anything to look at.");
  } else {
    lines.push("", "Scene  Clip      Voice     Picture");
    for (const sceneIndex of [...byScene.keys()].sort((a, b) => a - b)) {
      const row = byScene.get(sceneIndex)!;
      lines.push(
        `${String(sceneIndex).padEnd(5)}  ${itemWord(row.clip).padEnd(8)}  ${itemWord(row.voiceover).padEnd(8)}  ${itemWord(row.frame)}`,
      );
      for (const finding of row.clip?.findings ?? []) {
        lines.push(`       ${finding.code} (${finding.severity}): ${finding.detail}`);
      }
      if (row.clip?.error) lines.push(`       ${row.clip.error}`);
      // #1708: the cast voice applied, and what the picture check found.
      if (revoicedByScene.has(sceneIndex)) lines.push("       voice: cast voice applied");
      for (const finding of row.frame?.findings ?? []) {
        lines.push(`       picture: ${finding.code} (${finding.severity}): ${finding.detail}`);
      }
    }
  }

  lines.push(
    "",
    hasFinal && stop.at === "finished"
      ? "Final cut: approved and delivered."
      : hasFinal
        ? `Final cut: uploaded. Approve it with: exodus video approve ${runId}`
        : "Final cut: not uploaded yet.",
  );
  return { code: 0, lines };
}

interface GateSceneCard {
  sceneIndex: number;
  kind?: string;
  dialogue?: { speaker?: string; line?: string }[];
  voText?: string;
  durationSec?: number;
  frame?: { status?: string; imageUrl?: string; attempt?: number } | null;
}

interface GateCards {
  ready: boolean;
  title?: string;
  warnings?: string[];
  blocks?: Array<{ blockId: string; family?: string; pass?: boolean; warnings?: string[]; scenes?: GateSceneCard[] }>;
  looseScenes?: GateSceneCard[];
  runId?: string;
  paused?: boolean;
}

export async function storyboardFlow(
  runId: string,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const res = await deps.get(`${STORYBOARD_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!res.ok) return errorResult(res, json);
  const cards = res.data as GateCards;
  if (json) return { code: 0, lines: [JSON.stringify(cards)] };

  if (!cards.ready) {
    return {
      code: 0,
      lines: [
        "No storyboard yet — this run hasn't written one.",
        `Check where it is: exodus video status ${runId}`,
      ],
    };
  }

  const lines = [cards.title ? `Storyboard — ${cards.title}` : "Storyboard"];
  for (const warning of cards.warnings ?? []) lines.push(`Heads-up: ${warning}`);

  const blocks = cards.blocks ?? [];
  for (const block of blocks) {
    const label = block.family ? `${block.family} block` : `block ${block.blockId}`;
    lines.push("", block.pass === false ? `${label} — needs a look` : label);
    for (const warning of block.warnings ?? []) lines.push(`  Heads-up: ${warning}`);
    for (const scene of block.scenes ?? []) lines.push(...sceneCardLines(scene));
  }
  const loose = cards.looseScenes ?? [];
  if (loose.length > 0) {
    lines.push("", "Scenes outside any block");
    for (const scene of loose) lines.push(...sceneCardLines(scene));
  }

  lines.push(
    "",
    `approve with: exodus video approve ${runId}`,
    `send it back: exodus video flag ${runId} --note "what's wrong"`,
  );
  return { code: 0, lines };
}

function sceneCardLines(scene: GateSceneCard): string[] {
  const head = [
    `  Scene ${scene.sceneIndex}`,
    scene.kind ? `(${scene.kind})` : "",
    typeof scene.durationSec === "number" ? `${scene.durationSec}s` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const lines = [head];
  for (const turn of scene.dialogue ?? []) {
    if (!turn.line) continue;
    lines.push(turn.speaker ? `    ${turn.speaker}: ${turn.line}` : `    ${turn.line}`);
  }
  if (!scene.dialogue?.length && scene.voText) lines.push(`    "${scene.voText}"`);
  if (scene.frame?.imageUrl) lines.push(`    picture: ${scene.frame.imageUrl}`);
  else if (scene.frame?.status) lines.push(`    picture: ${scene.frame.status}`);
  return lines;
}

export async function approveFlow(
  runId: string,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const res = await deps.post(APPROVE_PATH, { runId });
  if (!res.ok) return errorResult(res, json);
  if (json) return { code: 0, lines: [JSON.stringify({ ok: true, runId, data: res.data })] };
  return {
    code: 0,
    lines: [
      "Approved.",
      `See what happens next: exodus video status ${runId}`,
    ],
  };
}

export async function flagFlow(
  runId: string,
  note: string,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const res = await deps.post(FLAG_PATH, { runId, note });
  if (!res.ok) return errorResult(res, json);
  const data = res.data as { strategistLooking?: boolean };
  if (json) return { code: 0, lines: [JSON.stringify({ ok: true, runId, ...data })] };
  return {
    code: 0,
    lines: [
      "Sent back with your note.",
      data.strategistLooking
        ? "Someone is rewriting the storyboard now."
        : "Nobody is rewriting it yet — the note is on the run.",
      `Check back with: exodus video storyboard ${runId}`,
    ],
  };
}

export async function pullFlow(
  runId: string,
  dir: string,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const runRes = await deps.get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!runRes.ok) return errorResult(runRes, json);
  const run = asVideoRun(runRes.data);

  const itemsRes = await deps.get(`${ITEMS_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!itemsRes.ok) return errorResult(itemsRes, json);
  const items = (itemsRes.data as { items?: NodeItem[] }).items ?? [];

  const plan = planPull(run, items, {
    pulledAt: new Date(deps.now()).toISOString(),
    dashboardUrl: deps.dashboardUrl,
  });

  deps.mkdirp(dir);

  // The manifest lands even for a run that has made nothing yet, so `--out` is
  // always a folder something can read rather than sometimes an empty one.
  if (plan.downloads.length === 0 && plan.texts.length === 0) {
    deps.writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(plan.manifest, null, 2)}\n`);
    const lines = [
      "Nothing to pull yet — this run hasn't made any pieces.",
      `Wrote ${path.join(dir, "manifest.json")} anyway, so you can see what it knows.`,
      `Check where it is: exodus video status ${runId}`,
    ];
    return { code: 0, lines: json ? [JSON.stringify({ runId, files: [], manifest: plan.manifest })] : lines };
  }

  for (const text of plan.texts) {
    deps.writeFile(path.join(dir, text.file), text.body);
  }

  const failures = await runPool(
    plan.downloads.map((download) => () => downloadWithRetry(download, dir, deps)),
    PULL_CONCURRENCY,
  );
  for (const failure of failures) {
    if (failure) markPullFailure(plan.manifest, failure);
  }

  deps.writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(plan.manifest, null, 2)}\n`);

  const failed = plan.manifest.failed;
  const wrote = plan.downloads.length + plan.texts.length - failed.length + 1;
  if (json) {
    return {
      code: failed.length > 0 ? 1 : 0,
      lines: [JSON.stringify({ runId, dir, wrote, manifest: plan.manifest })],
    };
  }

  const lines = [
    `Pulled ${wrote} files into ${dir}`,
    `Every piece is indexed in ${path.join(dir, "manifest.json")} — scene numbers there are the run's own.`,
  ];
  const flagged = plan.manifest.scenes.filter((s) => s.flagged);
  if (flagged.length > 0) {
    lines.push(
      "",
      `${flagged.length} clip${flagged.length === 1 ? "" : "s"} came back flagged — usable, but look before you cut:`,
    );
    for (const scene of flagged) {
      lines.push(`  scene ${scene.sceneIndex}: ${scene.findings.map((f) => f.code).join(", ") || "flagged"}`);
    }
  }
  if (failed.length > 0) {
    lines.push("", `${failed.length} file${failed.length === 1 ? "" : "s"} did not download:`);
    for (const failure of failed) lines.push(`  ${failure.file}: ${failure.error}`);
    lines.push("Run the same command again to retry just those.");
  }
  lines.push("", `When your cut is ready: exodus video upload ${runId} --file cut.mp4`);
  return { code: failed.length > 0 ? 1 : 0, lines };
}

// ISO/IEC 14496-12 box layout. A box is a 32-bit size then a 4-char type; a
// size of 1 means the real size is a 64-bit value after the type, and 0 means
// "to the end". A full box (mvhd is one) then carries a version byte and three
// flag bytes before its fields, whose widths are what the version selects.
const BOX_HEADER = 8;
const BOX_HEADER_64 = 16;
const FULL_BOX_PREAMBLE = 4;
const MVHD_FIELDS = {
  0: { timescale: 8, duration: 12, end: 16 },
  1: { timescale: 16, duration: 20, end: 28 },
} as const;
// ISO writes all-ones when it does not know the duration. Taken at face value
// that is 49 days, which would be posted to the run as the length of the cut.
const MVHD_UNKNOWN_V0 = 0xffffffff;
const MVHD_UNKNOWN_V1 = 0xffffffffffffffffn;
// A corrupt file can nest containers as deep as its own byte count allows, and
// this walk recurses. Real files nest one level here.
const MAX_BOX_DEPTH = 4;

export function parseMvhdDurationSec(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const walk = (start: number, end: number, depth: number): number | null => {
    if (depth > MAX_BOX_DEPTH) return null;
    let p = start;
    while (p + BOX_HEADER <= end) {
      let size = view.getUint32(p);
      let header = BOX_HEADER;
      const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      if (size === 1) {
        if (p + BOX_HEADER_64 > end) return null;
        size = Number(view.getBigUint64(p + BOX_HEADER));
        header = BOX_HEADER_64;
      } else if (size === 0) {
        size = end - p;
      }
      if (size < header || p + size > end) return null;
      if (type === "mvhd") {
        const version = bytes[p + header];
        if (version !== 0 && version !== 1) return null;
        const fields = MVHD_FIELDS[version];
        const base = p + header + FULL_BOX_PREAMBLE;
        // Bounded by the box's OWN declared end, so a truncated mvhd reads its
        // timescale off a sibling box instead of returning a plausible lie.
        if (base + fields.end > p + size) return null;
        const timescale = view.getUint32(base + fields.timescale);
        if (timescale === 0) return null;
        if (version === 1) {
          const raw = view.getBigUint64(base + fields.duration);
          if (raw === 0n || raw === MVHD_UNKNOWN_V1) return null;
          return Number(raw) / timescale;
        }
        const raw = view.getUint32(base + fields.duration);
        if (raw === 0 || raw === MVHD_UNKNOWN_V0) return null;
        return raw / timescale;
      }
      if (type === "moov") {
        const found = walk(p + header, p + size, depth + 1);
        if (found !== null) return found;
      }
      p += size;
    }
    return null;
  };
  return walk(0, bytes.byteLength, 0);
}

export const NO_DURATION_MESSAGE =
  "Can't tell how long this cut is.\n" +
  "Install ffmpeg (which brings ffprobe), or pass the length yourself: --duration <seconds>";

const MB = 1024 * 1024;

const UPLOAD_ATTEMPTS = 3;
/** Waits between attempt 1 -> 2 and attempt 2 -> 3. */
const UPLOAD_BACKOFF_MS = [500, 1500];

type UploadStep = "mint" | "store" | "register" | "attach";

const UPLOAD_STEP_LABEL: Record<UploadStep, string> = {
  mint: "asking the server for an upload slot",
  store: "sending the file to storage",
  register: "registering the uploaded file",
  attach: "attaching the cut to the run",
};

/** #1695: a dropped socket makes `fetch` throw, and the thrown error's own
 *  message is always the useless "fetch failed" — the real reason (ECONNRESET,
 *  UND_ERR_SOCKET) sits one or two `cause` levels down, and undici sometimes
 *  nests it. Dig it out so a bug report can name what actually broke. */
export function describeFetchFailure(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [];
  let cause: unknown = (err as { cause?: unknown }).cause;
  for (let depth = 0; depth < 2 && cause && typeof cause === "object"; depth++) {
    const level = cause as { code?: unknown; message?: unknown; cause?: unknown };
    const code = typeof level.code === "string" && level.code ? level.code : undefined;
    const message = typeof level.message === "string" && level.message ? level.message : undefined;
    if (code && message) parts.push(`${code}: ${message}`);
    else if (code) parts.push(code);
    else if (message) parts.push(message);
    cause = level.cause;
  }
  return parts.length > 0 ? `${err.message} (${parts.join("; ")})` : err.message;
}

type UploadAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; step: UploadStep; attempts: number; cause: string };

/** #1695: only a THROWN failure is retried. A throw from `fetch` means the
 *  request never got an answer (dropped socket, DNS blip), which a second try
 *  often fixes. A returned non-ok response IS an answer — a 403 says no, and
 *  asking again just gets the same no — so those keep their existing one-shot
 *  error paths untouched. */
async function withUploadRetry<T>(
  step: UploadStep,
  deps: VideoDeps,
  fn: () => Promise<T>,
): Promise<UploadAttempt<T>> {
  let cause = "";
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      cause = describeFetchFailure(e);
      const wait = UPLOAD_BACKOFF_MS[attempt - 1];
      if (attempt < UPLOAD_ATTEMPTS && wait !== undefined) await deps.sleep(wait);
    }
  }
  return { ok: false, step, attempts: UPLOAD_ATTEMPTS, cause };
}

function uploadRetryResult(
  failed: { step: UploadStep; attempts: number; cause: string },
  json: boolean,
): FlowResult {
  if (json) {
    return {
      code: 1,
      lines: [
        JSON.stringify({
          ok: false,
          step: failed.step,
          attempts: failed.attempts,
          error: failed.cause,
        }),
      ],
    };
  }
  return {
    code: 1,
    lines: [
      `Upload failed while ${UPLOAD_STEP_LABEL[failed.step]} (${failed.attempts} tries): ${failed.cause}`,
      "Check your connection and run the same command again.",
    ],
  };
}

export async function uploadFlow(
  runId: string,
  filePath: string,
  durationFlag: string | undefined,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const stat = deps.statFile(filePath);
  if (!stat) return { code: 1, lines: [`No such file: ${filePath}`] };

  const policy = ASSET_UPLOAD_POLICY.video;
  const ext = path.extname(filePath).toLowerCase();
  const mime = policy.mimeByExtension[ext];
  if (!mime) {
    return {
      code: 1,
      lines: [`"${path.basename(filePath)}" isn't a video file the dashboard accepts. It takes ${policy.accepts}.`],
    };
  }
  if (stat.size > policy.maxBytes) {
    return {
      code: 1,
      lines: [
        `"${path.basename(filePath)}" is ${(stat.size / MB).toFixed(1)}MB — the limit is ${Math.round(policy.maxBytes / MB)}MB.`,
        "Export it smaller and try again.",
      ],
    };
  }

  let asked: number | null = null;
  if (durationFlag !== undefined) {
    asked = Number.parseFloat(durationFlag);
    if (!Number.isFinite(asked) || asked <= 0) {
      return { code: 1, lines: [`--duration must be a number of seconds, not "${durationFlag}".`] };
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = deps.readFileBytes(filePath);
  } catch (e) {
    return {
      code: 1,
      lines: [`Can't read "${filePath}": ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const durationSec =
    asked ?? deps.probeDurationSec(filePath) ?? parseMvhdDurationSec(bytes);
  if (durationSec === null) return { code: 1, lines: [NO_DURATION_MESSAGE] };

  const minting = await withUploadRetry("mint", deps, () => deps.post(ASSET_UPLOAD_URL_PATH, {}));
  if (!minting.ok) return uploadRetryResult(minting, json);
  const mint = minting.value;
  if (!mint.ok) return errorResult(mint, json);
  const minted = mint.data as { uploadUrl?: string; receiptId?: string };
  const uploadUrl = minted.uploadUrl;
  const receiptId = minted.receiptId;
  if (!uploadUrl || !receiptId) {
    return { code: 1, lines: ["The server did not hand back a place to upload to."] };
  }

  // #1695: a retry here reuses the slot minted above. The bytes never reached
  // storage, so the slot is unspent; re-minting would only leak a receipt.
  const storing = await withUploadRetry("store", deps, () =>
    deps.uploadBytes(uploadUrl, mime, bytes),
  );
  if (!storing.ok) return uploadRetryResult(storing, json);
  const put = storing.value;
  if (!put.ok || !put.storageId) {
    const detail = put.body ? `: ${put.body.slice(0, 200)}` : "";
    return { code: 1, lines: [`Upload failed (HTTP ${put.status})${detail}`] };
  }
  const storageId = put.storageId;

  const registering = await withUploadRetry("register", deps, () =>
    deps.post(ASSETS_PATH, {
      storageId,
      receiptId,
      filename: path.basename(filePath),
    }),
  );
  if (!registering.ok) return uploadRetryResult(registering, json);
  const registered = registering.value;
  if (!registered.ok) return errorResult(registered, json);
  const asset = registered.data as { assetId?: string };
  const assetId = asset.assetId;
  if (!assetId) {
    return { code: 1, lines: ["The server stored the file but did not say what to call it."] };
  }

  const attaching = await withUploadRetry("attach", deps, () =>
    deps.post(FINAL_PATH, {
      runId,
      assetId,
      durationSec,
    }),
  );
  if (!attaching.ok) return uploadRetryResult(attaching, json);
  const attached = attaching.value;
  if (!attached.ok) return errorResult(attached, json);
  const final = attached.data as { finalWatchUrl?: string };
  const finalWatchUrl = final.finalWatchUrl ?? `${deps.dashboardUrl}/video?ad=${runId}`;

  if (json) {
    return {
      code: 0,
      lines: [JSON.stringify({ ok: true, runId, assetId, durationSec, finalWatchUrl })],
    };
  }
  return {
    code: 0,
    lines: [
      `Uploaded your cut (${durationSec.toFixed(1)}s).`,
      `Watch it here: ${finalWatchUrl}`,
      `Approve it there, or run: exodus video approve ${runId}`,
    ],
  };
}

const VALUE_FLAGS = new Set([
  "show",
  "script",
  "voice-path",
  "note",
  "out",
  "file",
  "duration",
]);

export function parsePositional(args = process.argv.slice(3)): string[] {
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

function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

async function printResult(result: FlowResult): Promise<void> {
  for (const line of result.lines) console.log(line);
  if (result.code !== 0) process.exit(result.code);
}

function usage(line: string): never {
  console.error(`Error: ${line}`);
  process.exit(1);
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  const [sub, ...rest] = parsePositional();
  const json = flags["json"] === true;

  if (!sub) {
    console.log(helpText);
    return;
  }

  if (sub === "shows") return printResult(await showsFlow(json, defaultDeps));

  if (sub === "start") {
    const showId = flagString(flags, "show");
    const scriptFile = flagString(flags, "script");
    if (!showId) usage("video start needs --show <id>. List them with: exodus video shows");
    if (!scriptFile) usage("video start needs --script <file>, a text file of what the ad says.");
    return printResult(
      await startFlow(
        {
          showId,
          scriptFile,
          voicePath: flagString(flags, "voice-path"),
          music: flags["music"] === false ? false : undefined,
          wait: flags["wait"] === true,
          json,
        },
        defaultDeps,
      ),
    );
  }

  const runId = rest[0];
  const needsRunId = ["status", "storyboard", "approve", "flag", "pull", "upload"];
  if (needsRunId.includes(sub) && !runId) {
    usage(`video ${sub} needs a run id: exodus video ${sub} <runId>`);
  }

  if (sub === "status") return printResult(await statusFlow(runId, json, defaultDeps));
  if (sub === "storyboard") return printResult(await storyboardFlow(runId, json, defaultDeps));
  if (sub === "approve") return printResult(await approveFlow(runId, json, defaultDeps));

  if (sub === "flag") {
    const note = flagString(flags, "note");
    if (!note) usage('video flag needs --note "<what is wrong>".');
    return printResult(await flagFlow(runId, note, json, defaultDeps));
  }

  if (sub === "pull") {
    const dir = flagString(flags, "out");
    if (!dir) usage("video pull needs --out <dir>, the folder to write the pieces into.");
    return printResult(await pullFlow(runId, dir, json, defaultDeps));
  }

  if (sub === "upload") {
    const file = flagString(flags, "file");
    if (!file) usage("video upload needs --file <cut.mp4>.");
    return printResult(
      await uploadFlow(runId, file, flagString(flags, "duration"), json, defaultDeps),
    );
  }

  console.error(`Unknown subcommand: "${sub}"\n`);
  console.log(helpText);
  process.exit(1);
}
