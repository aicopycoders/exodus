import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { apiGet, apiPost, getDashboardUrl, type ApiResponse } from "../lib/client.js";
import { displayRunStatus, formatApiError } from "../lib/format.js";
import { missingRouteLine } from "../lib/route-support.js";
import { hasBinary } from "../lib/preflight.js";
import type { FlagOccurrence } from "../lib/args.js";
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

  4. exodus video voices <runId>
     Who is in the ad, which voice each one has, how the voices get applied
     and who pays. Add --set to give someone a voice, before any clip is made.

  5. exodus video approve <runId>          (looks right — keep going)
     exodus video flag <runId> --note "…"  (something is wrong — send it back)
     exodus video retry-frame <runId> --node <nodeId> --scene <n>
       Redo ONE still at the pixel gate. Neighbours stay. The gate holds.

  6. exodus video status <runId>
     Where the run is and how each scene's clip turned out.

  7. exodus video pull <runId> --out ./ad
     Writes every piece to that folder plus a manifest.json index.

     exodus video retry-clip <runId> --scene <n>
       Redo ONE finished clip while the run waits for the cut. Everything
       else stays. A --note steers the motion, never the words.

     exodus video revoice <runId> --all
       Redo only the VOICE on clips that kept the video model's own voice
       (for example, the run had no ElevenLabs key when they were made). The
       picture stays, no new video is made, and a clip whose voice pass
       cannot finish is kept as it was. Use --scene <n> for one clip.

  8. Make your cut from those files.

  9. exodus video upload <runId> --file cut.mp4
     Attaches your cut to the run and prints the page to approve it on.

  10. exodus video approve <runId>
      Or click Approve on the page from step 9.

Usage:
  exodus video shows [--json]
  exodus video start --show <id> --script <file> [--voice-path <v>] [--no-music] [--wait] [--json]
  exodus video status <runId> [--json]
  exodus video storyboard <runId> [--json]
  exodus video approve <runId> [--json]
  exodus video flag <runId> --note "<what is wrong>" [--json]
  exodus video retry-frame <runId> --node <nodeId> --scene <n> [--note "..."] [--json]
  exodus video retry-clip <runId> --scene <n> [--node <nodeId>] [--note "..."] [--json]
  exodus video revoice <runId> (--scene <n> | --all) [--node <nodeId>] [--json]
  exodus video voices <runId> [--set <character>=<voiceId>] [--clear <character>] [--from <file.json>] [--json]
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
  --note "<text>"      What is wrong with the storyboard (flag), or how to
                       steer one redo (retry-frame, retry-clip)
  --node <nodeId>      Which scene-frames node holds the still (retry-frame).
                       Which video step holds the clip, when a scene has one on
                       more than one step (retry-clip, revoice)
  --scene <n>          Which scene to redo. One scene only, a whole number
                       (retry-frame, retry-clip, revoice)
  --all                Every finished clip that kept the video model's voice
                       (revoice)
  --set <who>=<id>     Give a character an ElevenLabs voice (voices). Name the
                       character by its ID or by the name your script uses.
                       Repeat it once per character
  --clear <who>        Take a character's voice off again (voices). Repeatable
  --from <file.json>   A file of characters and voice IDs (voices). --set and
                       --clear win over the same name in the file
  --json               Machine-readable output
  --help, -h           Show this help

Video is admin-only. If every command here answers "video isn't enabled for
this key", your dashboard user needs the admin role on this brand.

Examples:
  exodus video shows
  exodus video start --show k57abc --script ./script.txt --wait
  exodus video storyboard run_123
  exodus video approve run_123
  exodus video retry-frame run_123 --node frames-1 --scene 2
  exodus video retry-clip run_123 --scene 3 --note "keep the handshake in frame"
  exodus video revoice run_123 --all
  exodus video voices run_123
  exodus video voices run_123 --set C1=abc123voiceid --set "HOST 2=def456voiceid"
  exodus video voices run_123 --from voices.json
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
const SCENE_RETRY_PATH = "/api/v2/workflow/scene/retry";
// #1858: the voice-only redo has its OWN route. /scene/retry drops fields it
// does not know, so asking an older server for a voice redo through it would
// buy a full paid redo of the clip. An older server answers 404 here instead.
const SCENE_REVOICE_PATH = "/api/v2/workflow/scene/revoice";
const REVOICE_NOT_ON_THIS_SERVER =
  "This Exodus server does not have the voice redo yet, so nothing was started and nothing " +
  "was spent. It arrives with the next server update.";
const FINAL_PATH = "/api/v2/video/final";
export const VOICES_PATH = "/api/v2/video/voices";
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
  /** #1784: the checker's own words, and the severity it gave before the
   *  identity rule forced a fail. Admin-only: shown by `status`, never written
   *  into a pull manifest. */
  judgeDetail?: string;
  judgeSeverity?: "fail" | "warn";
}

/** A finding without the admin-only checker fields (#1784). */
function withoutJudgeFields({ judgeDetail: _d, judgeSeverity: _s, ...rest }: ClipFinding): ClipFinding {
  return rest;
}

/** A SUBSET of the server's artifact union (convex/schema.ts): exodus compiles
 *  standalone (tsconfig rootDir ".") and cannot import the canonical type. */
export type ArtifactSubset =
  | { type: "storyboard"; storyboard?: unknown; storyboardJson?: string }
  | { type: "frames"; frames?: Array<{ sceneIndex: number; imageUrl?: string }> }
  | { type: "image"; imageUrl?: string; storageId?: string }
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
      /** #801: off-script speech was cut from the end of the clip. */
      tailTrimmed?: boolean;
      /** #1858: the generator's own file, kept on record when the voice pass
       *  replaced the clip file. */
      rawStorageId?: string;
    }
  | {
      type: "audio";
      sceneIndex?: number;
      audioUrl?: string;
      durationSec?: number;
      /** #1689: narration word timings, seconds from the start of this track. */
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
    }
  | { type: "text" | "primer" | "session" | "document" };

export interface VideoRunNode {
  nodeId: string;
  kind: string;
  status: "idle" | "running" | "done" | "failed" | "skipped";
  error?: string;
  /** A member-safe note on a step that still finished (the dashboard shows it on the step). */
  warning?: string;
  outputs?: ArtifactSubset[];
}

/** The park vocabulary of BUILDER checkpoints. A video gate is none of them, so
 *  the presence of any one of these rules a video gate out. */
export type BuilderPauseReason = "taste" | "repair" | "slots" | "call" | "checkpoint";

export interface PullCastLockMember {
  characterId: string;
  name: string;
  look?: string;
  identityRefs?: Array<{ storageId?: string; imageUrl?: string }>;
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
  castLock?: PullCastLock | null;
  /** The saved workflow this run executed (`projectRun`, convex/workflows.ts). */
  workflowId?: string;
  /** #1851: set only when the run's workflow row is module-owned, which is what
   *  a Show ad run is. The CLI is never told the `showId`, so this is the only
   *  thing here that tells a Show ad apart from a member's own workflow run. */
  moduleOwned?: boolean;
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
  /** Optional resolved media from listNodeItems (ledger clips + cast identity stills). */
  artifact?: ArtifactSubset;
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
  | { at: "storyboard-gate"; nodeId?: string; framesNodeId?: string }
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
      return {
        at: "storyboard-gate",
        nodeId: pausedNode.nodeId,
        ...(pausedNode.kind === "scene-frames"
          ? { framesNodeId: pausedNode.nodeId }
          : {}),
      };
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

/**
 * #1851: the ONE place the CLI composes a link to a run's review page. A Show ad
 * opens on the /video page. A showless workflow run cannot, because /video
 * answers "That ad isn't here" for it (`getAdDetail` rejects it). So it
 * gets its own workflow run page instead, and the canonical /runs/<id> forwarder
 * when all the caller holds is a run id. That last one is the link the server
 * itself mints for a showless run (`dashboardAdUrl`, convex/http.ts), so a
 * server-supplied URL and one composed here agree.
 */
export function reviewUrl(
  dashboardUrl: string,
  run: Pick<VideoRun, "_id" | "workflowId" | "moduleOwned">,
): string {
  if (run.moduleOwned === true) return `${dashboardUrl}/video?ad=${run._id}`;
  if (run.workflowId) return `${dashboardUrl}/workflows/${run.workflowId}/runs/${run._id}`;
  return `${dashboardUrl}/runs/${run._id}`;
}

export function stopLines(stop: RunStop, runId: string, runUrl: string): string[] {
  if (stop.at === "storyboard-gate") {
    const lines = [
      "Parked: the storyboard is waiting for your yes.",
      `Read it:    exodus video storyboard ${runId}`,
      `Approve it: exodus video approve ${runId}`,
      `Send back:  exodus video flag ${runId} --note "what's wrong"`,
    ];
    if (stop.framesNodeId) {
      lines.push(
        `Redo one frame: exodus video retry-frame ${runId} --node ${stop.framesNodeId} --scene <n>`,
      );
    }
    return lines;
  }
  if (stop.at === "final-watch") {
    return [
      "Parked: every piece is made and the run is waiting for a cut.",
      `Pull the pieces: exodus video pull ${runId} --out ./ad-${runId}`,
      `Then upload:     exodus video upload ${runId} --file cut.mp4`,
      `Redo one clip:   exodus video retry-clip ${runId} --scene <n>`,
      `Watch it here:   ${runUrl}`,
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
        `Or open the run:     ${runUrl}`,
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
      `Open it: ${runUrl}`,
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
  /** #1848: what those times actually describe. "this-file" — they were measured
   *  on the very file `wordsFrom` names, so they hold to the frame.
   *  "original-performance" — the clip's cast voice was swapped in AFTER the
   *  times were measured, so they describe the take that was replaced: close,
   *  but not frame-exact, and nothing re-measures them. Null when no words came. */
  wordsDescribe: "original-performance" | "this-file" | null;
  voice: string | null;
  keyframe: string | null;
  qc: ClipQc | null;
  /** #1708: true when the cast voice was applied over the clip's generated voice,
   *  false when the clip kept it, null when there is no clip. */
  revoiced: boolean | null;
  /** #1708: true when the clip was trimmed to its spoken words; null without a clip. */
  speechTrimmed: boolean | null;
  /** #1858: the stored file the video model made, when the voice pass replaced
   *  the clip with a new file. Null when the clip IS that file, or there is none. */
  rawStorageId: string | null;
  /** The clip ledger row's status (pending/running/done/failed), or "missing"
   *  when the run never wrote one. */
  clipStatus: string;
  error: string | null;
  flagged: boolean;
  findings: ClipFinding[];
  /** #1708: what the picture check found on the scene's keyframe (its frame row),
   *  null when the frame row carries no findings list at all, i.e. nobody checked. */
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
  /** The ledger row's status, or "missing" when no row and no downloadable URL. */
  status: string;
  error: string | null;
  /** #1845: the ElevenLabs voice this character was given before the clips were
   *  made, read off the run's storyboard. Null when nobody chose one — those
   *  clips keep the voice the video model invents. */
  voiceId: string | null;
  voiceLabel: string | null;
}

export interface VideoManifest {
  runId: string;
  pulledAt: string;
  dashboardUrl: string;
  storyboard: string | null;
  reference: string | null;
  music: string | null;
  cast: ManifestCastRef[];
  /** Continuous master take, or null when the run has only per-scene VO. */
  narration: { file: string; timing: string } | null;
  scenes: ManifestScene[];
  failed: PullFailure[];
}

export const CAST_LEDGER_BASE = 910000;

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

type SceneClipPull = {
  download: PullDownload;
  durationSec: number | null;
  qc: ClipQc | null;
  words: ClipWord[] | null;
  revoiced: boolean;
  speechTrimmed: boolean;
  rawStorageId: string | null;
};

function clipFromArtifact(
  sceneIndex: number,
  artifact: ArtifactSubset | undefined,
): SceneClipPull | null {
  if (!artifact || artifact.type !== "video" || artifact.final || !artifact.videoUrl) {
    return null;
  }
  return {
    download: {
      file: `${scenePrefix(sceneIndex)}.${extFor(artifact.videoUrl, "video")}`,
      url: artifact.videoUrl,
    },
    durationSec: artifact.durationSec ?? null,
    qc: artifact.qc ?? null,
    words: artifact.words ?? null,
    revoiced: artifact.revoiced === true,
    speechTrimmed: artifact.speechTrimmed === true,
    rawStorageId: artifact.rawStorageId ?? null,
  };
}

function keyframeDownload(sceneIndex: number, imageUrl: string): PullDownload {
  return {
    file: `${scenePrefix(sceneIndex)}.keyframe.${extFor(imageUrl, "image")}`,
    url: imageUrl,
  };
}

function reservedCastFrames(items: NodeItem[]): Map<number, NodeItem> {
  const byIndex = new Map<number, NodeItem>();
  for (const item of items) {
    if (item.itemKind === "frame" && item.sceneIndex >= CAST_LEDGER_BASE) {
      byIndex.set(item.sceneIndex, item);
    }
  }
  return byIndex;
}

/** #1845: the voice pinned to each character, keyed by character id. The pins
 *  live on the storyboard envelope's `cast[]` (convex/lib/workflow/castVoices.ts),
 *  not on the cast lock, so they are read off the storyboard artifact the pull
 *  already has. A storyboard that never carried a cast yields nothing. */
function castVoicePins(
  artifact: Extract<ArtifactSubset, { type: "storyboard" }> | undefined,
): Map<string, { voiceId: string; voiceLabel: string | null }> {
  const pins = new Map<string, { voiceId: string; voiceLabel: string | null }>();
  let envelope: unknown = artifact?.storyboard;
  if (envelope === undefined && typeof artifact?.storyboardJson === "string") {
    try {
      envelope = JSON.parse(artifact.storyboardJson);
    } catch {
      return pins;
    }
  }
  const cast = (envelope as { cast?: unknown } | undefined)?.cast;
  if (!Array.isArray(cast)) return pins;
  for (const member of cast as Array<Record<string, unknown>>) {
    const characterId = typeof member.characterId === "string" ? member.characterId.trim() : "";
    const voiceId = typeof member.voiceId === "string" ? member.voiceId.trim() : "";
    if (!characterId || !voiceId) continue;
    const label = typeof member.voiceLabel === "string" ? member.voiceLabel.trim() : "";
    pins.set(characterId, { voiceId, voiceLabel: label ? label : null });
  }
  return pins;
}

function planCastRefs(
  run: VideoRun,
  items: NodeItem[],
  pins: Map<string, { voiceId: string; voiceLabel: string | null }>,
): { cast: ManifestCastRef[]; downloads: PullDownload[] } {
  const ledger = reservedCastFrames(items);
  const ledgerRows = [...ledger.entries()].sort(([a], [b]) => a - b);
  const locked = run.castLock?.cast;
  const rows: Array<{
    characterId: string | null;
    name: string | null;
    url: string | undefined;
    status: string;
    error: string | null;
    stem: string;
  }> = [];

  if (locked !== undefined && locked.length > 0) {
    const claimedStorageIds = new Set<string>();
    for (const member of locked) {
      const storageId = member.identityRefs?.[0]?.storageId;
      const item =
        typeof storageId === "string" && storageId.length > 0
          ? ledgerRows.find(([, row]) => {
              const art = row.artifact;
              return art?.type === "image" && art.storageId === storageId;
            })?.[1]
          : undefined;
      if (typeof storageId === "string" && storageId.length > 0) {
        claimedStorageIds.add(storageId);
      }
      // Prefer the ledger artifact URL when present (same source other pull files use).
      // Fall back to the lock URL for reused stills that wrote no new ledger row.
      const art = item?.artifact;
      const url =
        (art?.type === "image" ? art.imageUrl : undefined) ??
        member.identityRefs?.[0]?.imageUrl;
      rows.push({
        characterId: member.characterId,
        name: member.name,
        url,
        status: item?.status ?? (url ? "done" : "missing"),
        error: item?.error ?? null,
        stem: `cast-${member.characterId}`,
      });
    }
    for (const [sceneIndex, item] of ledgerRows) {
      const art = item.artifact;
      const sid = art?.type === "image" ? art.storageId : undefined;
      if (typeof sid === "string" && claimedStorageIds.has(sid)) continue;
      const url = art?.type === "image" ? art.imageUrl : undefined;
      rows.push({
        characterId: null,
        name: null,
        url,
        status: item.status,
        error: item.error ?? null,
        stem: `cast-ref-${String(sceneIndex - CAST_LEDGER_BASE).padStart(2, "0")}`,
      });
    }
  } else {
    for (const [sceneIndex, item] of ledgerRows) {
      const art = item.artifact;
      const url = art?.type === "image" ? art.imageUrl : undefined;
      rows.push({
        characterId: null,
        name: null,
        url,
        status: item.status,
        error: item.error ?? null,
        stem: `cast-ref-${String(sceneIndex - CAST_LEDGER_BASE).padStart(2, "0")}`,
      });
    }
  }

  const cast: ManifestCastRef[] = [];
  const downloads: PullDownload[] = [];
  for (const row of rows) {
    const file = row.url ? `${row.stem}.${extFor(row.url, "image")}` : null;
    const pin = row.characterId ? pins.get(row.characterId) : undefined;
    cast.push({
      characterId: row.characterId,
      name: row.name,
      file,
      status: row.status,
      error: row.error,
      voiceId: pin?.voiceId ?? null,
      voiceLabel: pin?.voiceLabel ?? null,
    });
    if (file && row.url) downloads.push({ file, url: row.url });
  }
  return { cast, downloads };
}

function isNarrationMaster(artifact: ArtifactSubset): boolean {
  return (
    artifact.type === "audio" &&
    artifact.sceneIndex === undefined &&
    Array.isArray(artifact.narration?.cuts)
  );
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
      keyframeByScene.set(frame.sceneIndex, keyframeDownload(frame.sceneIndex, frame.imageUrl));
    }
  }

  const voiceByScene = new Map<number, { download: PullDownload; words: ClipWord[] | null }>();
  let narrationDownload: PullDownload | null = null;
  let narrationMaster: Extract<ArtifactSubset, { type: "audio" }> | null = null;
  for (const artifact of outputsOfNodeKind(run, "voiceover")) {
    if (artifact.type !== "audio" || !artifact.audioUrl) continue;
    if (isNarrationMaster(artifact)) {
      narrationMaster = artifact;
      narrationDownload = {
        file: `narration.${extFor(artifact.audioUrl, "audio")}`,
        url: artifact.audioUrl,
      };
      continue;
    }
    if (typeof artifact.sceneIndex !== "number" || artifact.sceneIndex < 0) continue;
    voiceByScene.set(artifact.sceneIndex, {
      download: {
        file: `${scenePrefix(artifact.sceneIndex)}.voice.${extFor(artifact.audioUrl, "audio")}`,
        url: artifact.audioUrl,
      },
      words: artifact.words ?? null,
    });
  }

  if (narrationMaster && narrationDownload) {
    const timing = {
      takeHash: narrationMaster.narration?.takeHash,
      voiceId: narrationMaster.narration?.voiceId,
      modelId: narrationMaster.narration?.modelId,
      speed: narrationMaster.narration?.speed,
      alignment: narrationMaster.narration?.alignment,
      words: narrationMaster.words ?? [],
      cuts: (narrationMaster.narration?.cuts ?? []).map((cut) => ({
        sceneIndex: cut.sceneIndex,
        startSec: cut.startSec,
        durationSec: cut.durationSec,
        takeHash: cut.takeHash,
        file:
          voiceByScene.get(cut.sceneIndex)?.download.file ??
          `${scenePrefix(cut.sceneIndex)}.voice.mp3`,
      })),
    };
    texts.push({
      file: "narration.json",
      body: `${JSON.stringify(timing, null, 2)}\n`,
    });
  }

  const clipByScene = new Map<number, SceneClipPull>();
  let music: PullDownload | null = null;
  for (const artifact of outputsOfNodeKind(run, "video")) {
    if (artifact.type === "audio" && artifact.sceneIndex === undefined && artifact.audioUrl) {
      music = { file: `music.${extFor(artifact.audioUrl, "audio")}`, url: artifact.audioUrl };
      continue;
    }
    if (artifact.type !== "video" || typeof artifact.sceneIndex !== "number") continue;
    const clip = clipFromArtifact(artifact.sceneIndex, artifact);
    if (!clip) continue;
    clipByScene.set(artifact.sceneIndex, clip);
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

  for (const [sceneIndex, item] of clipItemByScene) {
    if (item.status !== "done" || clipByScene.has(sceneIndex)) continue;
    const clip = clipFromArtifact(sceneIndex, item.artifact);
    if (!clip) continue;
    clipByScene.set(sceneIndex, clip);
  }
  for (const [sceneIndex, item] of frameItemByScene) {
    if (item.status !== "done" || keyframeByScene.has(sceneIndex)) continue;
    const artifact = item.artifact;
    if (!artifact || artifact.type !== "image" || !artifact.imageUrl) continue;
    keyframeByScene.set(sceneIndex, keyframeDownload(sceneIndex, artifact.imageUrl));
  }

  const sceneIndexes = [
    ...new Set([
      ...clipByScene.keys(),
      ...voiceByScene.keys(),
      ...keyframeByScene.keys(),
      ...clipItemByScene.keys(),
      ...frameItemByScene.keys(),
    ]),
  ]
    .filter((sceneIndex) => sceneIndex >= 0 && sceneIndex < CAST_LEDGER_BASE)
    .sort((a, b) => a - b);

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
      // #1848: nothing re-measures a clip's word times after its cast voice is
      // swapped in, so say which take they describe rather than let a cut tool
      // assume they were measured on the file it is about to play.
      wordsDescribe:
        wordsFrom === null
          ? null
          : clip?.revoiced === true && wordsFrom === "clip"
            ? "original-performance"
            : "this-file",
      voice: voice?.download.file ?? null,
      keyframe: keyframeByScene.get(sceneIndex)?.file ?? null,
      qc: clip?.qc ?? null,
      revoiced: clip ? clip.revoiced : null,
      speechTrimmed: clip ? clip.speechTrimmed : null,
      rawStorageId: clip ? clip.rawStorageId : null,
      clipStatus: item?.status ?? "missing",
      error: item?.error ?? null,
      flagged: item?.flagged === true,
      findings: (item?.findings ?? []).map(withoutJudgeFields),
      keyframeFindings: frameItem?.findings?.map(withoutJudgeFields) ?? null,
    };
  });

  const { cast, downloads: castDownloads } = planCastRefs(
    run,
    items,
    castVoicePins(storyboardArtifact),
  );

  const downloads: PullDownload[] = [
    ...(reference ? [reference] : []),
    ...keyframeByScene.values(),
    ...[...voiceByScene.values()].map((v) => v.download),
    ...(narrationDownload ? [narrationDownload] : []),
    ...[...clipByScene.values()].map((c) => c.download),
    ...(music ? [music] : []),
    ...castDownloads,
  ];

  return {
    downloads,
    texts,
    manifest: {
      runId: run._id,
      pulledAt: opts.pulledAt,
      dashboardUrl: reviewUrl(opts.dashboardUrl, run),
      storyboard,
      reference: reference?.file ?? null,
      music: music?.file ?? null,
      cast,
      narration: narrationDownload
        ? { file: narrationDownload.file, timing: "narration.json" }
        : null,
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
  for (const ref of manifest.cast) {
    if (ref.file === failure.file) ref.file = null;
  }
  if (manifest.narration?.file === failure.file) manifest.narration = null;
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
      scene.rawStorageId = null;
    }
    if (scene.voice === failure.file) scene.voice = null;
    if (scene.keyframe === failure.file) scene.keyframe = null;
    if (scene.words === failure.file || lostWordsSource) {
      scene.words = null;
      scene.wordsFrom = null;
      scene.wordsDescribe = null;
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
  const url = started.url ?? reviewUrl(deps.dashboardUrl, { _id: runId });

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
      lines: [...lines, ...stopLines(stop, runId, reviewUrl(deps.dashboardUrl, run))],
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

  const warnings = run.nodes
    .filter((n) => n.warning)
    .map((n) => ({ nodeId: n.nodeId, step: n.kind, warning: n.warning }));

  if (json) {
    return {
      code: 0,
      lines: [JSON.stringify({ runId, status: run.status, stop, items, hasFinal, warnings })],
    };
  }

  const revoicedByScene = new Set<number>();
  // #1848: a revoiced clip that also carries word times — those times were
  // measured on the take the cast voice replaced, and nothing re-measures them.
  const timedOnOriginalVoice = new Set<number>();
  for (const artifact of outputsOfNodeKind(run, "video")) {
    if (artifact.type === "video" && artifact.revoiced === true && typeof artifact.sceneIndex === "number") {
      revoicedByScene.add(artifact.sceneIndex);
      if ((artifact.words?.length ?? 0) > 0) timedOnOriginalVoice.add(artifact.sceneIndex);
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
    if (item.sceneIndex < 0) continue;
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
  const lines = [
    headline,
    ...stopLines(stop, runId, reviewUrl(deps.dashboardUrl, run)),
    ...warnings.map((w) => `Heads-up (${w.step}): ${w.warning}`),
  ];

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
        // #1784: what the checker itself said, when it adds something.
        const judgeSeverity = finding.judgeSeverity ?? finding.severity;
        if (finding.judgeDetail) {
          lines.push(`         checker said (${judgeSeverity}): ${finding.judgeDetail}`);
        } else if (judgeSeverity !== finding.severity) {
          lines.push(`         checker rated it ${judgeSeverity}`);
        }
      }
      if (row.clip?.error) lines.push(`       ${row.clip.error}`);
      // #1708: the cast voice applied, and what the picture check found.
      if (revoicedByScene.has(sceneIndex)) lines.push("       voice: cast voice applied");
      if (timedOnOriginalVoice.has(sceneIndex)) {
        lines.push("       word timings: measured on the original voice (close, not frame-exact)");
      }
      for (const finding of row.frame?.findings ?? []) {
        lines.push(`       picture: ${finding.code} (${finding.severity}): ${finding.detail}`);
      }
    }
    if (outputsOfNodeKind(run, "voiceover").some(isNarrationMaster)) {
      lines.push("Narration  master take");
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
  /** Scene-frames node id when the pixel gate names it. */
  framesNodeId?: string | null;
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

  // #1845: the voices ride the storyboard stop, so a person sees who speaks with
  // what before approving instead of having to know about a second command. A
  // second, NON-FATAL read: an older backend, a 404 or an empty cast prints
  // nothing and the storyboard is unaffected.
  // The catch matters as much as the `ok` check: a dropped connection throws.
  const voiceRes = await deps
    .get(`${VOICES_PATH}?runId=${encodeURIComponent(runId)}`)
    .catch(() => null);
  if (voiceRes?.ok) {
    const sheet = (voiceRes.data ?? {}) as Partial<CastVoiceSheet>;
    const cast = Array.isArray(sheet.cast) ? sheet.cast : [];
    const canChange = sheet.canChange !== false;
    // A run whose voices are owned elsewhere (a Show) has nothing to act on, so
    // it stays quiet unless somebody already pinned a voice worth seeing.
    if (canChange || cast.some((row) => row.voice !== null)) {
      const summary = voiceSummaryLines(cast, Array.isArray(sheet.notices) ? sheet.notices : []);
      if (summary.length > 0) {
        lines.push("", ...summary);
        if (canChange) {
          lines.push(`set voices with: exodus video voices ${runId} --set <character>=<voiceId>`);
        }
      }
    }
  }

  lines.push(
    "",
    `approve with: exodus video approve ${runId}`,
    `send it back: exodus video flag ${runId} --note "what's wrong"`,
  );
  if (cards.framesNodeId) {
    lines.push(
      `redo one frame: exodus video retry-frame ${runId} --node ${cards.framesNodeId} --scene <n>`,
    );
  }
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
  // #1845: a refused approve (a chosen voice ElevenLabs is certain is gone) comes
  // back 400 with one plain sentence — printed as-is, exit 1, nothing approved.
  if (!res.ok) return errorResult(res, json);
  if (json) return { code: 0, lines: [JSON.stringify({ ok: true, runId, data: res.data })] };
  // #1845: approving is the last moment a wrong voice can still be caught, so the
  // receipt names the voice each speaking character got. Absent on older backends
  // and on approves that are not the storyboard stop.
  const voices = (res.data as { voices?: { cast?: CastVoiceRow[]; notices?: string[] } } | null)
    ?.voices;
  const summary = voices
    ? voiceSummaryLines(
        Array.isArray(voices.cast) ? voices.cast : [],
        Array.isArray(voices.notices) ? voices.notices : [],
      )
    : [];
  return {
    code: 0,
    lines: [
      "Approved.",
      ...(summary.length > 0 ? ["", ...summary, ""] : []),
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

export async function retryFrameFlow(
  runId: string,
  nodeId: string,
  sceneIndex: number,
  note: string | undefined,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const res = await deps.post(SCENE_RETRY_PATH, {
    runId,
    nodeId,
    sceneIndex,
    ...(note ? { note } : {}),
  });
  if (!res.ok) return errorResult(res, json);
  const triggerRunId = (res.data as { triggerRunId?: string }).triggerRunId;
  if (json) {
    return {
      code: 0,
      lines: [
        JSON.stringify({
          ok: true,
          runId,
          nodeId,
          sceneIndex,
          triggerRunId,
          ...(note ? { note } : {}),
        }),
      ],
    };
  }
  return {
    code: 0,
    lines: [
      `Redoing scene ${sceneIndex} on ${nodeId}.`,
      `triggerRunId: ${triggerRunId ?? "-"}`,
      "Neighbours stay. The pixel gate holds.",
    ],
  };
}

export type ClipRedoPlan =
  | { ok: true; nodeId: string; sceneIndex: number; attempt: number; warnings: string[] }
  | { ok: false; reason: string };

export interface ClipRedoTarget {
  sceneIndex: number;
  nodeId?: string;
}

const UPLOADED_CUT_WARNING =
  "The cut you already uploaded will not include the new clip. Pull the pieces again, " +
  "re-cut, and upload again.";

/**
 * #1851: decide a clip redo before anything is enqueued. The server's
 * `getSceneRetryContext` is the authority and its refusals are printed verbatim;
 * this mirrors its rules so the usual mistakes (a clip that is already being
 * redone, a step still rendering its other scenes, a finished clip on a run that
 * is nowhere near its final watch) cost a read rather than a queued task and a
 * silent no-op. A delivered ad is left to the server: the run payload carries no
 * approval stamp, and a done `final` row does not prove one.
 */
export function planClipRedo(
  run: VideoRun,
  items: NodeItem[],
  target: ClipRedoTarget,
): ClipRedoPlan {
  const stop = classifyRun(run);
  const found = findClipRow(run, items, target);
  if ("reason" in found) return { ok: false, reason: found.reason };
  const { row, uploadedCut } = found;

  const redoable =
    row.status === "failed" ||
    (row.status === "done" && (row.flagged === true || stop.at === "final-watch"));
  if (!redoable) {
    if (row.status === "done") {
      return {
        ok: false,
        reason:
          `Scene ${target.sceneIndex}'s clip is finished and nothing flagged it. A finished clip ` +
          "can only be redone while the run is waiting for the final cut.",
      };
    }
    const word = ITEM_STATUS_WORD[row.status] ?? row.status;
    return {
      ok: false,
      reason: `Scene ${target.sceneIndex}'s clip is ${word}, so there is nothing to redo yet.`,
    };
  }

  return {
    ok: true,
    nodeId: row.nodeId,
    sceneIndex: target.sceneIndex,
    attempt: row.attempt ?? 0,
    warnings: uploadedCut ? [UPLOADED_CUT_WARNING] : [],
  };
}

/** The one clip row a redo names, or why it cannot be worked on right now. The
 *  rules both kinds of redo share: the row exists on exactly one step, that step
 *  has finished, and nobody is already redoing the scene. */
function findClipRow(
  run: VideoRun,
  items: NodeItem[],
  target: ClipRedoTarget,
): { row: NodeItem; uploadedCut: boolean } | { reason: string } {
  const uploadedCut = items.some((i) => i.itemKind === "final" && i.status === "done");

  const rows = items.filter(
    (i) =>
      i.itemKind === "clip" &&
      i.sceneIndex === target.sceneIndex &&
      (target.nodeId === undefined || i.nodeId === target.nodeId),
  );
  if (rows.length === 0) {
    return { reason: `Scene ${target.sceneIndex} has no clip to redo.` };
  }
  const nodeIds = [...new Set(rows.map((r) => r.nodeId))];
  if (nodeIds.length > 1) {
    return {
      reason:
        `Scene ${target.sceneIndex} has a clip on more than one step (${nodeIds.join(", ")}), ` +
        "so say which one: --node <nodeId>.",
    };
  }
  const row = rows[0];

  const node = run.nodes.find((n) => n.nodeId === row.nodeId);
  if (node?.status === "running") {
    return {
      reason:
        `The "${row.nodeId}" step is still making other scenes. Try again once it has finished ` +
        `(exodus video status ${run._id}).`,
    };
  }
  if (node && node.status !== "done") {
    return {
      reason:
        `The "${row.nodeId}" step did not finish (it is "${node.status}"), ` +
        "and one clip can only be redone on a step that finished.",
    };
  }
  if (row.status === "running") {
    return { reason: `Scene ${target.sceneIndex} is already being redone.` };
  }
  return { row, uploadedCut };
}

export async function retryClipFlow(
  runId: string,
  target: ClipRedoTarget,
  note: string | undefined,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const runRes = await deps.get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!runRes.ok) return errorResult(runRes, json);
  const run = asVideoRun(runRes.data);

  const itemsRes = await deps.get(`${ITEMS_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!itemsRes.ok) return errorResult(itemsRes, json);
  const items = (itemsRes.data as { items?: NodeItem[] }).items ?? [];

  const plan = planClipRedo(run, items, target);
  if (!plan.ok) {
    return {
      code: 1,
      lines: json ? [JSON.stringify({ ok: false, error: plan.reason })] : [plan.reason],
    };
  }

  const res = await deps.post(SCENE_RETRY_PATH, {
    runId,
    nodeId: plan.nodeId,
    sceneIndex: plan.sceneIndex,
    ...(note ? { note } : {}),
  });
  if (!res.ok) return errorResult(res, json);
  const triggerRunId = (res.data as { triggerRunId?: string }).triggerRunId;
  const review = reviewUrl(deps.dashboardUrl, run);

  if (json) {
    return {
      code: 0,
      lines: [
        JSON.stringify({
          ok: true,
          runId,
          nodeId: plan.nodeId,
          sceneIndex: plan.sceneIndex,
          triggerRunId,
          attemptBefore: plan.attempt,
          reviewUrl: review,
          warnings: plan.warnings,
          ...(note ? { note } : {}),
        }),
      ],
    };
  }
  return {
    code: 0,
    lines: [
      `Redoing scene ${plan.sceneIndex}'s clip on ${plan.nodeId}.`,
      `triggerRunId: ${triggerRunId ?? "-"}`,
      "Every other scene stays as it is, and so do the pictures, the voices and the script.",
      ...(note
        ? ["Your note steers how this clip moves. It never changes the words that are spoken."]
        : []),
      `Watch it land: exodus video status ${runId}`,
      `Review the run: ${review}`,
      ...plan.warnings,
    ],
  };
}

/** Has this clip's file already been changed by the voice pass? The pass works on
 *  the video model's own file, so a clip it has touched cannot go through again. */
function clipIsStillRaw(item: NodeItem): boolean {
  const a = item.artifact;
  return (
    item.status === "done" &&
    a?.type === "video" &&
    a.revoiced !== true &&
    a.speechTrimmed !== true &&
    a.tailTrimmed !== true
  );
}

/**
 * What a clip's checks say when its voice should have been changed and was not.
 * `speech-check-skipped` is deliberately NOT here: it also lands on clips whose
 * audio the render or a later step owns, where there is no voice change to redo
 * and a pass would bill a transcription to change nothing.
 */
const VOICE_NOT_CHANGED_CODES = new Set(["voice-unpinned", "voice-not-applied"]);

/**
 * #1858: decide a voice-only redo before anything is queued. Mirrors the
 * server's rule the way `planClipRedo` mirrors its own: a finished clip whose
 * file is still the video model's own. The server stays the authority.
 */
export function planClipRevoice(
  run: VideoRun,
  items: NodeItem[],
  target: ClipRedoTarget,
): ClipRedoPlan {
  const found = findClipRow(run, items, target);
  if ("reason" in found) return { ok: false, reason: found.reason };
  const { row, uploadedCut } = found;
  const remake = `To make the clip again from scratch: exodus video retry-clip ${run._id} --scene ${target.sceneIndex}`;

  if (row.status !== "done" || row.artifact?.type !== "video") {
    return {
      ok: false,
      reason: `Scene ${target.sceneIndex} has no finished clip, so there is no voice to redo. ${remake}`,
    };
  }
  if (!clipIsStillRaw(row)) {
    return {
      ok: false,
      reason:
        `Scene ${target.sceneIndex}'s clip has already been through the voice pass, ` +
        `so it cannot go through it again. ${remake}`,
    };
  }
  return {
    ok: true,
    nodeId: row.nodeId,
    sceneIndex: target.sceneIndex,
    attempt: row.attempt ?? 0,
    warnings: uploadedCut ? [UPLOADED_CUT_WARNING] : [],
  };
}

export type RevoiceTarget = ClipRedoTarget | { all: true };

/** "Scene 3", "Scenes 3 and 4", "Scenes 3, 4 and 9". */
function sceneListWords(sceneIndexes: number[]): string {
  if (sceneIndexes.length === 1) return `Scene ${sceneIndexes[0]}`;
  return `Scenes ${sceneIndexes.slice(0, -1).join(", ")} and ${sceneIndexes[sceneIndexes.length - 1]}`;
}

type RevoiceSceneResult =
  | { sceneIndex: number; nodeId?: string; ok: true; triggerRunId?: string }
  | { sceneIndex: number; nodeId?: string; ok: false; error: string };

/** One request per scene, so one scene's refusal never costs the others. */
export async function revoiceFlow(
  runId: string,
  target: RevoiceTarget,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const runRes = await deps.get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!runRes.ok) return errorResult(runRes, json);
  const run = asVideoRun(runRes.data);

  const itemsRes = await deps.get(`${ITEMS_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!itemsRes.ok) return errorResult(itemsRes, json);
  const items = (itemsRes.data as { items?: NodeItem[] }).items ?? [];

  const targets: ClipRedoTarget[] =
    "all" in target
      ? items
          .filter(
            (i) =>
              i.itemKind === "clip" &&
              clipIsStillRaw(i) &&
              (i.findings ?? []).some((f) => VOICE_NOT_CHANGED_CODES.has(f.code)),
          )
          .sort((a, b) => a.sceneIndex - b.sceneIndex)
          .map((i) => ({ sceneIndex: i.sceneIndex, nodeId: i.nodeId }))
      : [target];

  if (targets.length === 0) {
    const nothing = "No clip on this run is waiting for a voice pass, so nothing was started.";
    return {
      code: 0,
      lines: json ? [JSON.stringify({ ok: true, runId, scenes: [], note: nothing })] : [nothing],
    };
  }

  const scenes: RevoiceSceneResult[] = [];
  const warnings = new Set<string>();
  for (const one of targets) {
    const plan = planClipRevoice(run, items, one);
    if (!plan.ok) {
      scenes.push({ sceneIndex: one.sceneIndex, nodeId: one.nodeId, ok: false, error: plan.reason });
      continue;
    }
    const res = await deps.post(SCENE_REVOICE_PATH, {
      runId,
      nodeId: plan.nodeId,
      sceneIndex: plan.sceneIndex,
    });
    // The route itself is missing, which is true of every scene alike. Stop
    // here, and never reach for /scene/retry: that one makes new paid video.
    if (missingRouteLine(res, "exodus video revoice")) {
      return {
        code: 1,
        lines: json
          ? [JSON.stringify({ ok: false, status: 404, error: REVOICE_NOT_ON_THIS_SERVER })]
          : [REVOICE_NOT_ON_THIS_SERVER],
      };
    }
    if (res.ok) {
      plan.warnings.forEach((w) => warnings.add(w));
      scenes.push({
        sceneIndex: plan.sceneIndex,
        nodeId: plan.nodeId,
        ok: true,
        triggerRunId: (res.data as { triggerRunId?: string }).triggerRunId,
      });
      continue;
    }
    scenes.push({
      sceneIndex: plan.sceneIndex,
      nodeId: plan.nodeId,
      ok: false,
      error: videoApiError(res),
    });
  }

  const queued = scenes.filter((r) => r.ok).length;
  const code = scenes.every((r) => r.ok) ? 0 : 1;
  const review = reviewUrl(deps.dashboardUrl, run);
  if (json) {
    return {
      code,
      lines: [
        JSON.stringify({
          ok: code === 0,
          runId,
          scenes,
          reviewUrl: review,
          warnings: [...warnings],
        }),
      ],
    };
  }
  // A refusal about the whole run (no key saved, the ad already delivered) comes
  // back word for word on every scene, so scenes that heard the same sentence
  // share one line, placed where the first of them would have been.
  const refusedWith = new Map<string, number[]>();
  for (const r of scenes) {
    if (!r.ok) refusedWith.set(r.error, [...(refusedWith.get(r.error) ?? []), r.sceneIndex]);
  }
  const sceneLines = scenes.flatMap((r) => {
    if (r.ok) {
      return [
        `Scene ${r.sceneIndex}: redoing the voice on ${r.nodeId}. triggerRunId: ${r.triggerRunId ?? "-"}`,
      ];
    }
    const sharing = refusedWith.get(r.error) ?? [];
    if (sharing[0] !== r.sceneIndex) return [];
    return [`${sceneListWords(sharing)}: not started. ${r.error}`];
  });
  if (queued === 0) return { code, lines: sceneLines };
  return {
    code,
    lines: [
      ...sceneLines,
      "The picture in each clip stays exactly as it is. No new video is made.",
      "The words are checked against the script, the clip is trimmed to the speech, and the chosen voice is applied. ElevenLabs bills that to your own key.",
      "If the voice pass cannot finish on a clip, that clip is kept as it was.",
      `Watch them land: exodus video status ${runId}`,
      `Review the run: ${review}`,
      ...warnings,
    ],
  };
}

export interface CastVoiceRow {
  characterId: string;
  name: string;
  /** The voice this character's clips are converted to: their own, else the
   *  run's default (#1858). */
  voice: { voiceId: string; label?: string } | null;
  voiceFrom?: "own-pin" | "run-default";
  availability?:
    | { state: "available"; providerName: string }
    | { state: "missing" }
    | { state: "not-checked"; why: string };
  spokenScenes: number;
  spokenSeconds: number;
}

export interface CastVoiceSheet {
  runId: string;
  canChange: boolean;
  whyNot?: string;
  cast: CastVoiceRow[];
  narrator: { voiceId: string; label?: string } | null;
  treatment: {
    summary: string;
    provider: string;
    model: string;
    speedChange: boolean;
    costNote: string;
    usage: { clips: number; seconds: number };
  };
  notices: string[];
  changed?: string[];
}

/** What `--set`, `--clear` and `--from` add up to: the map the route wants. */
export type VoiceMap = Record<string, string | { voiceId: string; label?: string } | null>;

/**
 * Returns null for "just show me", which is what a bare `video voices <runId>`
 * means. `--set`/`--clear` win over `--from`, so a file can be overridden on the
 * spot without editing it.
 */
export function parseVoiceFlags(
  occurrences: FlagOccurrence[],
  readFile: (path: string) => string,
): VoiceMap | null {
  const fromFile: VoiceMap = {};
  const typed: VoiceMap = {};
  let asked = false;

  const valueFor = (occurrence: FlagOccurrence): string => {
    if (occurrence.value === undefined) throw new Error(`--${occurrence.flag} needs a value.`);
    return occurrence.value;
  };

  for (const occurrence of occurrences) {
    if (occurrence.flag === "set") {
      const raw = valueFor(occurrence);
      // Split on the LAST "=" so a character label containing one still parses.
      const eq = raw.lastIndexOf("=");
      if (eq <= 0 || eq === raw.length - 1) {
        throw new Error(
          "--set must look like <character>=<voice id>, for example " +
            `--set C1=abc123voiceid (got "${raw}").`,
        );
      }
      typed[raw.slice(0, eq).trim()] = raw.slice(eq + 1).trim();
      asked = true;
    } else if (occurrence.flag === "clear") {
      const raw = valueFor(occurrence);
      if (!raw.trim()) throw new Error("--clear needs a character, for example --clear C1.");
      typed[raw.trim()] = null;
      asked = true;
    } else if (occurrence.flag === "from") {
      const file = valueFor(occurrence);
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFile(file));
      } catch {
        throw new Error(`Could not read ${file} as a list of characters and voice IDs.`);
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`Could not read ${file} as a list of characters and voice IDs.`);
      }
      Object.assign(fromFile, parsed as VoiceMap);
      asked = true;
    }
  }
  if (!asked) return null;
  // The cast lives on the server, so the only identity known here is the name as
  // typed: a file entry is replaced when a flag names it the same way, whatever
  // the case or spacing. "HOST 2" in the file and --set C2 both reach the server,
  // which refuses the pair by name rather than guessing which one was meant.
  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const merged: VoiceMap = {};
  for (const [who, choice] of Object.entries(fromFile)) {
    if (!Object.keys(typed).some((t) => sameName(t, who))) merged[who] = choice;
  }
  return { ...merged, ...typed };
}

/** One flow for the one verb: no voices means look, voices means set. */
export async function voicesFlow(
  runId: string,
  voices: VoiceMap | null,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const res = voices
    ? await deps.post(VOICES_PATH, { runId, voices })
    : await deps.get(`${VOICES_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!res.ok) return errorResult(res, json);
  const sheet = res.data as CastVoiceSheet;
  if (json) return { code: 0, lines: [JSON.stringify({ ok: true, ...sheet })] };
  return { code: 0, lines: voiceSheetLines(sheet) };
}

function availabilityWords(row: CastVoiceRow): string {
  if (!row.voice) return "no voice yet";
  switch (row.availability?.state) {
    case "available":
      return "ElevenLabs has it";
    case "missing":
      return "ElevenLabs does not have it";
    case "not-checked":
      return "not checked just now";
    default:
      return "not checked";
  }
}

/** One character's voice, spelled the same way everywhere it is shown. */
function voiceWords(row: Pick<CastVoiceRow, "voice" | "voiceFrom">): string {
  const voice = row.voice;
  if (!voice) return "—";
  const words = voice.label ? `${voice.label} (${voice.voiceId})` : voice.voiceId;
  return row.voiceFrom === "run-default" ? `${words}, the run's default voice` : words;
}

/** #1845: the compact "Voices" block the storyboard stop and the approve receipt
 *  share — one line per character who speaks or already has a voice, then the
 *  sheet's own notices. Empty when there is nothing worth saying. */
function voiceSummaryLines(cast: CastVoiceRow[], notices: string[]): string[] {
  const rows = cast.filter((row) => row.spokenScenes > 0 || row.voice !== null);
  // A note can arrive with no rows at all (the approve's check could not run),
  // and it must still be read — only the "Voices" heading needs rows under it.
  const width = Math.max(0, ...rows.map((row) => row.name.length));
  const lines = rows.length > 0 ? ["Voices"] : [];
  for (const row of rows) {
    lines.push(
      row.voice
        ? `  ${row.name.padEnd(width)}  →  ${voiceWords(row)}  ${availabilityWords(row)}`
        : `  ${row.name.padEnd(width)}  →  no voice chosen (keeps the generated voice)`,
    );
  }
  for (const notice of notices) lines.push(`Heads-up: ${notice}`);
  return lines;
}

export function voiceSheetLines(sheet: CastVoiceSheet): string[] {
  const lines = [`Voices for run ${sheet.runId}`];
  if (sheet.cast.length === 0) lines.push("  Nobody is in this ad yet.");
  for (const row of sheet.cast) {
    const voice = voiceWords(row);
    lines.push(
      `  ${row.characterId}  ${row.name}  ${voice}  ${availabilityWords(row)}  ` +
        `speaks in ${row.spokenScenes} scenes, about ${row.spokenSeconds}s`,
    );
  }
  if (sheet.narrator) {
    const label = sheet.narrator.label ? `${sheet.narrator.label} ` : "";
    lines.push(`  Narrator  ${label}(${sheet.narrator.voiceId})  set on the workflow, not here`);
  }
  if (sheet.changed) {
    lines.push(
      sheet.changed.length > 0
        ? `Changed: ${sheet.changed.join(", ")}. Pictures and script were not touched.`
        : "Nothing changed — those voices were already set. Pictures and script were not touched.",
    );
  }
  lines.push(`How voices are applied: ${sheet.treatment.summary}${sheet.treatment.speedChange ? "" : " No speed change."}`);
  lines.push(
    `Cost: billed to your own ElevenLabs key. ${sheet.treatment.costNote} ` +
      `About ${sheet.treatment.usage.seconds} seconds of speech across ` +
      `${sheet.treatment.usage.clips} clips will be converted.`,
  );
  for (const notice of sheet.notices) lines.push(notice);
  lines.push(
    sheet.canChange
      ? "You can still change voices until you approve the storyboard."
      : (sheet.whyNot ?? "Voices can no longer be changed on this run."),
  );
  return lines;
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
  const finalWatchUrl = final.finalWatchUrl ?? reviewUrl(deps.dashboardUrl, { _id: runId });

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
  "node",
  "scene",
  "set",
  "clear",
  "from",
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

export async function run(
  flags: Record<string, string | boolean>,
  occurrences: FlagOccurrence[],
): Promise<void> {
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
  const needsRunId = [
    "status",
    "storyboard",
    "approve",
    "flag",
    "retry-frame",
    "retry-clip",
    "revoice",
    "voices",
    "pull",
    "upload",
  ];
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

  if (sub === "retry-frame") {
    const nodeId = flagString(flags, "node");
    if (!nodeId) usage("video retry-frame needs --node <nodeId>.");
    const sceneRaw = flagString(flags, "scene");
    if (sceneRaw === undefined) {
      usage("video retry-frame needs --scene <n>, the scene index to redo.");
    }
    const sceneIndex = Number(sceneRaw);
    if (!Number.isFinite(sceneIndex)) {
      usage("video retry-frame --scene must be a number.");
    }
    return printResult(
      await retryFrameFlow(runId, nodeId, sceneIndex, flagString(flags, "note"), json, defaultDeps),
    );
  }

  if (sub === "retry-clip") {
    const sceneRaw = flagString(flags, "scene");
    if (sceneRaw === undefined) {
      usage("video retry-clip needs --scene <n>, the scene whose clip to redo.");
    }
    const sceneIndex = Number(sceneRaw);
    if (!Number.isInteger(sceneIndex)) {
      usage(`video retry-clip --scene must be a whole scene number, not "${sceneRaw}".`);
    }
    return printResult(
      await retryClipFlow(
        runId,
        { sceneIndex, nodeId: flagString(flags, "node") },
        flagString(flags, "note"),
        json,
        defaultDeps,
      ),
    );
  }

  if (sub === "revoice") {
    const sceneRaw = flagString(flags, "scene");
    const all = flags["all"] === true;
    if (all === (sceneRaw !== undefined)) {
      usage(
        "video revoice needs one of --scene <n> (one clip) or --all (every clip that kept the video model's voice).",
      );
    }
    if (all) return printResult(await revoiceFlow(runId, { all: true }, json, defaultDeps));
    const sceneIndex = Number(sceneRaw);
    if (!Number.isInteger(sceneIndex)) {
      usage(`video revoice --scene must be a whole scene number, not "${sceneRaw}".`);
    }
    return printResult(
      await revoiceFlow(runId, { sceneIndex, nodeId: flagString(flags, "node") }, json, defaultDeps),
    );
  }

  if (sub === "voices") {
    let voices: VoiceMap | null;
    try {
      voices = parseVoiceFlags(occurrences, defaultDeps.readFile);
    } catch (err) {
      usage((err as Error).message);
    }
    return printResult(await voicesFlow(runId, voices, json, defaultDeps));
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
