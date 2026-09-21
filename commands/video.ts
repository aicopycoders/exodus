import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { apiGet, apiPost, getDashboardUrl, type ApiResponse } from "../lib/client.js";
import { displayRunStatus, formatApiError } from "../lib/format.js";
import { missingRouteLine } from "../lib/route-support.js";
import { hasBinary } from "../lib/preflight.js";
import type { FlagOccurrence } from "../lib/args.js";
import {
  ASSET_UPLOAD_POLICY,
  pauseAheadLine,
  type RunProvenance,
  type WorkflowRun,
} from "./workflow.js";
import { HELPER_LEDGER_BASE, SET_OPTION_LEDGER_BASE } from "../lib/helperLedgerBase.js";

export const helpText = `
exodus video — make a video ad from a saved workflow, pull every piece, upload your cut

The dashboard makes the PIECES of an ad: the storyboard, one picture per scene,
one voice track per scene, one video clip per scene, plus the music bed. It does
not make the finished ad. You pull the pieces to a folder, cut them together
with whatever editing tools you like, and upload the cut back.

The whole loop, in order:

  1. exodus workflow list
     Which workflows this brand has saved. A video workflow is one that makes
     ads.

  2. exodus workflow describe <workflowId|name>
     What that workflow needs before it can run, and what it gives back.

  3. exodus workflow run <workflowId|name> --input <field>=@script.txt --wait
     Starts the ad on your script and waits. It stops when the storyboard
     needs your yes. "describe" names the field your script goes in. You can
     also settle the voices here, at the launch, instead of at step 5 — the
     launch flags all live in: exodus workflow --help

  4. exodus video storyboard <runId>
     The scene cards: what each scene says and the picture it will look like.

  5. exodus video voices <runId>
     Who is in the ad, which voice each one has, how the voices get applied
     and who pays. Add --set to give someone a voice, before any clip is made.

  6. exodus video approve <runId>          (looks right — keep going)
     exodus video retry-frame <runId> --node <nodeId> --scene <n>
       Redo ONE still at the pixel gate. Neighbours stay. The gate holds.

  7. exodus video status <runId>
     Where the run is and how each scene's clip turned out. If the storyboard
     failed, it also says which parts of it were accepted and why the next one
     was turned down.

     exodus video status <runId> --rejected-draft
       Prints the storyboard draft that was turned down. A record of what
       happened, thrown away by the system — never something to act on.

  8. exodus video pull <runId> --out ./ad
     Writes every piece to that folder plus a manifest.json index.

     exodus video retry-clip <runId> --scene <n>
       Redo ONE finished clip while the run waits for the cut. Everything
       else stays. A --note steers the motion, never the words.

     exodus video revoice <runId> --all
       Redo only the VOICE on clips that kept the video model's own voice
       (for example, the run had no ElevenLabs key when they were made). The
       picture stays, no new video is made, and a clip whose voice pass
       cannot finish is kept as it was. Use --scene <n> for one clip.

  9. Make your cut from those files.

  10. exodus video upload <runId> --file cut.mp4
      Attaches your cut to the run and prints the page to approve it on.

  11. exodus video approve <runId>
      Or click Approve on the page from step 10. If you redid a clip after
      uploading, this stops and says which scenes changed. Upload a fresh cut,
      or add --approve-stale-cut to deliver the cut you already uploaded.

Usage:
  exodus video status <runId> [--rejected-draft] [--json]
  exodus video storyboard <runId> [--json]
  exodus video approve <runId> [--approve-stale-cut] [--json]
  exodus video retry-frame <runId> --node <nodeId> --scene <n> [--note "..."] [--json]
  exodus video retry-clip <runId> --scene <n> [--node <nodeId>] [--note "..."] [--json]
  exodus video revoice <runId> (--scene <n> | --all) [--node <nodeId>] [--json]
  exodus video voices <runId> [--set <character>=<voiceId>] [--clear <character>] [--from <file.json>] [--json]
  exodus video pull <runId> --out <dir> [--json]
  exodus video upload <runId> --file <cut.mp4> [--duration <sec>] [--json]

Options:
  --out <dir>          Folder to write the pulled pieces into (pull)
  --file <cut.mp4>     Your finished cut (upload). MP4, MOV or WebM, up to 200MB
  --duration <sec>     How long your cut is, in seconds. Only needed when the
                       length can't be read off the file itself
  --note "<text>"      How to steer one redo (retry-frame, retry-clip)
  --node <nodeId>      Which scene-frames node holds the still (retry-frame).
                       Which video step holds the clip, when a scene has one on
                       more than one step (retry-clip, revoice)
  --scene <n>          Which scene to redo. One scene only, a whole number
                       (retry-frame, retry-clip, revoice)
  --all                Every finished clip that kept the video model's voice
                       (revoice)
  --approve-stale-cut  Deliver the cut you uploaded even though a clip changed
                       after you uploaded it (approve). Without it, approving
                       stops and names the scenes that changed
  --set <who>=<id>     Give a character an ElevenLabs voice (voices). Name the
                       character by its ID or by the name your script uses.
                       Repeat it once per character
  --clear <who>        Take a character's voice off again (voices). Repeatable
  --from <file.json>   A file of characters and voice IDs (voices). --set and
                       --clear win over the same name in the file
  --rejected-draft     Print the storyboard draft the system turned down
                       (status). It was thrown away — a record only
  --json               Machine-readable output
  --help, -h           Print this help

Video is admin-only. If every command here answers "video isn't enabled for
this key", your dashboard user needs the admin role on this brand.

Examples:
  exodus workflow list
  exodus workflow describe "Video Ad"
  exodus workflow run "Video Ad" --input script=@./script.txt --wait
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
// #1902: the rejected planner reply, fetched on demand and never on the poll.
// It is up to 100k chars, so the run read carries only a flag saying one exists.
const REJECTED_DRAFT_PATH = "/api/v2/workflow/rejected-draft";
const REJECTED_DRAFT_NOT_ON_THIS_SERVER =
  "This Exodus server does not keep rejected drafts yet, so there is nothing to read. It arrives " +
  "with the next server update.";
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

/** #1716: what happened about neighbours on ONE take. MIRROR of
 *  QcTakeNeighbours in convex/lib/workflow/qcTakes.ts — exodus compiles
 *  standalone (tsconfig rootDir ".") and cannot import the canonical type. */
export type ClipQcTakeNeighbours =
  | { state: "not-applicable" }
  | { state: "not-attached" }
  | { state: "none-accepted" }
  | { state: "attached"; scenes: number[] };

/** #1716: one take of a clip. MIRROR of QcTake in
 *  convex/lib/workflow/qcTakes.ts. `kind` stays a plain string union of what
 *  the server sends today; an older CLI reading a newer record is why every
 *  field here is read, never re-derived. */
export interface ClipQcTake {
  kind: "take" | "soft-retry";
  failCodes: string[];
  warnCodes: string[];
  neighbours: ClipQcTakeNeighbours;
  /** The checker's own words. Admin-only, exactly like ClipFinding.judgeDetail
   *  (#1784), and never written into a pull manifest. */
  judgeWording?: { code: string; wording: string }[];
}

export interface ClipQc {
  verdict: "pass" | "fail";
  attempts: number;
  /** #1711/#1714: the accepted neighbour scenes this take was judged against
   *  for continuity. Absent on a scene that is never compared (a cutaway, a
   *  demo scene, a run with no locked set); empty when it is compared and
   *  nothing was attached to the shipped take. */
  neighbours?: number[];
  /** #1716: every take, first take first, `takes.length === attempts`. Absent
   *  on a clip recorded before that ticket — which reads as "no history
   *  recorded for this clip", never as an empty list. */
  takes?: ClipQcTake[];
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

/** #1716: a clip's QC stamp with the checker's words out of its take history.
 *  Applied to the pull manifest under the SAME rule as `withoutJudgeFields` —
 *  unconditionally, because the checker's words are never written into a pulled
 *  file whoever is pulling. */
export function qcWithoutJudgeWording(qc: ClipQc): ClipQc {
  if (!qc.takes) return qc;
  return {
    ...qc,
    takes: qc.takes.map(({ judgeWording: _w, ...rest }) => rest),
  };
}

/** #1716: the line a clip with no recorded history reads as. LOCKSTEP with
 *  NO_TAKE_HISTORY_LINE in convex/lib/workflow/qcTakes.ts and with the same
 *  sentence in scripts/video-qa/prove-consistency.sh. */
export const NO_TAKE_HISTORY_LINE = "no history recorded for this clip";

const TAKE_NEIGHBOUR_SENTENCE: {
  [S in ClipQcTakeNeighbours["state"]]: (
    neighbours: Extract<ClipQcTakeNeighbours, { state: S }>,
  ) => string;
} = {
  "not-applicable": () => "never compared",
  "not-attached": () => "no neighbours attached",
  "none-accepted": () => "no accepted neighbours yet",
  attached: ({ scenes }) =>
    `compared against scene${scenes.length === 1 ? "" : "s"} ${scenes.join(", ")}`,
};

/** #1716: the take history as plain lines. LOCKSTEP MIRROR of
 *  renderQcTakeHistory in convex/lib/workflow/qcTakes.ts — the literal lines
 *  are pinned by this package's tests and by that module's, so a wording change
 *  that reaches only one side fails a test. */
export function renderQcTakeHistory(takes: ClipQcTake[] | undefined): string[] {
  if (!takes || takes.length === 0) return [NO_TAKE_HISTORY_LINE];
  const lines: string[] = [];
  takes.forEach((take, index) => {
    const say = TAKE_NEIGHBOUR_SENTENCE[take.neighbours.state] as (
      n: ClipQcTakeNeighbours,
    ) => string;
    const parts = [
      take.failCodes.length ? `failed ${take.failCodes.join(", ")}` : "passed",
      ...(take.warnCodes.length ? [`warned ${take.warnCodes.join(", ")}`] : []),
      say(take.neighbours),
    ];
    const bonus = take.kind === "soft-retry" ? " (bonus take)" : "";
    lines.push(`take ${index + 1}${bonus}: ${parts.join("; ")}`);
    for (const { code, wording } of take.judgeWording ?? []) {
      lines.push(`  checker said (${code}): ${wording}`);
    }
  });
  return lines;
}

function printDisplacedHistory(
  lines: string[],
  lastRedo: { displacedHistory?: { title: string; lines: string[] } },
) {
  const history = lastRedo.displacedHistory;
  if (!history) return;
  lines.push(`       ${history.title}`);
  for (const line of history.lines) lines.push(`         ${line}`);
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

/**
 * #1902: the record of what happened to a storyboard step that failed, as the
 * server composed it (convex/lib/workflow/planFailure.ts). `lines` is the
 * member-facing copy, authored THERE and printed verbatim here, because the run
 * page prints the same strings — that is how the two surfaces cannot word one
 * failure differently.
 *
 * Every field but `lines` is tolerant: `kind` stays a plain string so a new kind
 * the server starts sending does not break a CLI that shipped before it, and the
 * counts are optional so an older or fuller record still parses. Absent on a
 * step that did not fail, and on every backend older than this field.
 */
export interface PlanFailureRecord {
  kind: string;
  partsTotal?: number;
  acceptedParts?: number;
  acceptedScenes?: number;
  failedPart?: number;
  /** The contract violations, which are the tail of `lines` on a "rejected" record. */
  reasons?: string[];
  lines: string[];
}

export interface VideoRunNode {
  nodeId: string;
  kind: string;
  status: "idle" | "running" | "done" | "failed" | "skipped" | "out-of-scope";
  error?: string;
  /** A member-safe note on a step that still finished (the dashboard shows it on the step). */
  warning?: string;
  /** #1902: what happened when this step failed, in words a member can read. */
  planFailure?: PlanFailureRecord;
  /** #1902: there is a rejected draft on file that this caller may read. The
   *  server sends it to entitled callers only, and sends NOTHING otherwise — an
   *  absence here is a plain absence, never "there is something you may not
   *  see". */
  hasRejectedDraft?: boolean;
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
  /** #1883: the approval stop a still-running run is headed for. Server-decided. */
  pauseAhead?: WorkflowRun["pauseAhead"];
  castLock?: PullCastLock | null;
  /**
   * #1869: whose saved format rules this run followed (`runProvenance`). Read
   * as-is and written straight into the pull manifest — it is names, ids and a
   * version, never the rules themselves. Absent on a run that followed none and
   * on every backend older than #1869.
   */
  provenance?: RunProvenance;
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
  /** #1870: the server's own verdict that this row has been "running" so long
   *  its worker must be dead. The threshold lives there and only there, because
   *  this package ships on its own release schedule. Absent on older backends,
   *  and absent means a running row is a running row. */
  staleClaim?: boolean;
  /** #1855: what this row's last redo did. `label` is the finished sentence,
   *  composed by the server and printed VERBATIM, because the run page prints
   *  the same string — that is how the two surfaces cannot word it differently.
   *  `outcome` stays a plain string on purpose: a new outcome the server starts
   *  sending must not break a CLI that shipped before it. Absent on a row never
   *  redone, and on every backend older than this field. */
  lastRedo?: {
    take: number;
    outcome: string;
    label: string;
    displacedHistory?: { title: string; lines: string[] };
  };
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
  // #1908: `showAd` is optional so a run snapshot taken before this shipped
  // still parses, and reads as the reduced block rather than crashing.
  | { at: "storyboard-gate"; nodeId?: string; framesNodeId?: string; showAd?: true }
  | { at: "final-watch" }
  | { at: "paused"; nodeId?: string; reason?: string }
  // #1687: a "repair" park rides the FAILED arm rather than a new one of its
  // own. A run parked for repair has a dead step in it — `wait` must exit
  // nonzero, `status` must say failed, and a retry is what fixes it. Every
  // consumer already treats `at: "failed"` that way, so the honest reading is
  // the default one; a separate arm would let any consumer that forgot about
  // it quietly call a dead run a success. `repair` only adds the detail that
  // this failure is a repair park, and `step`/`nodeId` name which step died.
  // #2168: `step` is therefore what makes the park retryable. Named ⇒ that step
  // died and `exodus workflow repair <run> retry` redoes it; absent ⇒ no step
  // in the list failed, the server refuses that retry, and only a fresh run
  // moves this ad on.
  | { at: "failed"; error?: string; repair?: true; nodeId?: string; step?: string }
  | { at: "finished"; status: string };

/**
 * #1704: a stop with everything its wording needs. The final watch is the one
 * stop whose next step does not follow from the run alone — it depends on
 * whether a cut is already attached, and only the ledger knows that. So
 * `classifyRun` leaves that arm incomplete, `resolveStop` completes it, and
 * `stopLines` takes THIS type. A caller cannot render a final watch without
 * first saying which of its THREE states the run is in.
 *
 * `cutAttached: null` is "we could not find out" — the ledger read failed. It
 * is its own state on purpose: folding it into `false` is what made a run whose
 * cut IS uploaded tell the member to pull the pieces and upload a cut, which is
 * the exact contradiction this ticket exists to remove.
 */
export type ResolvedStop =
  | Exclude<RunStop, { at: "final-watch" }>
  | { at: "final-watch"; cutAttached: boolean | null };

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
        ...(isShowAd(run) ? { showAd: true } : {}),
      };
    }
    if (parkedAtFinalWatch(run)) return { at: "final-watch" };
    return { at: "paused", nodeId: run.pausedNodeId, reason: run.pauseReason };
  }
  const active = run.nodes.find((n) => n.status === "running");
  return { at: "running", stage: active?.kind ?? "starting" };
}

/**
 * #1704: the ONE definition of "a cut is attached". The final-watch guidance,
 * the final-cut footer and the `hasFinal` field all read it, and `retry-clip`'s
 * "your uploaded cut will not include this" warning reads it too, so no surface
 * can decide a run has a cut by a rule of its own.
 */
export function hasAttachedCut(items: NodeItem[]): boolean {
  return items.some((i) => i.itemKind === "final" && i.status === "done");
}

/** #1704: fill in the one fact `classifyRun` cannot see. `cutAttached` comes
 *  from `hasAttachedCut`, or is null when the ledger could not be read. */
export function resolveStop(
  stop: RunStop,
  cutAttached: boolean | null,
): ResolvedStop {
  if (stop.at !== "final-watch") return stop;
  return { at: "final-watch", cutAttached };
}

/**
 * #1704: the same resolution for a surface that polls the run and nothing else.
 * It reads the ledger ONCE, at the moment it has actually parked at the final
 * watch — not on every poll, and not at all for any other stop. A ledger read
 * that FAILS resolves to null, not false: these surfaces know the run is parked
 * and nothing else, and "waiting for a cut" is a claim, not a fallback.
 */
export async function resolveStopAtPark(
  stop: RunStop,
  runId: string,
  deps: Pick<VideoDeps, "get">,
): Promise<ResolvedStop> {
  if (stop.at !== "final-watch") return stop;
  const res = await deps.get(`${ITEMS_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!res.ok) return resolveStop(stop, null);
  return resolveStop(stop, hasAttachedCut((res.data as { items?: NodeItem[] }).items ?? []));
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

/** #1908: `exodus video flag` is refused on any run whose row carries no
 *  `showId` (`prepareStoryboardFlag`, convex/videoModule.ts). The CLI is never
 *  told showId, and `moduleOwned` is all it gets. At a storyboard gate the two
 *  facts agree. The only module-owned workflows that reach that gate are the
 *  Show ones (show-ad, and the show-setup founding ad), and both stamp showId
 *  at creation. copy-face, meme-rig and the organic moves have no storyboard or
 *  scene-frames node to park on. An absent marker means "not a Show ad", on
 *  purpose. */
export function isShowAd(run: Pick<VideoRun, "moduleOwned">): boolean {
  return run.moduleOwned === true;
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
  if (isShowAd(run)) return `${dashboardUrl}/video?ad=${run._id}`;
  if (run.workflowId) return `${dashboardUrl}/workflows/${run.workflowId}/runs/${run._id}`;
  return `${dashboardUrl}/runs/${run._id}`;
}

export function stopLines(stop: ResolvedStop, runId: string, runUrl: string): string[] {
  if (stop.at === "storyboard-gate") {
    const lines = [
      "Parked: the storyboard is waiting for your yes.",
      `Read it:    exodus video storyboard ${runId}`,
      `Approve it: exodus video approve ${runId}`,
    ];
    if (stop.showAd) {
      lines.push(`Send back:  exodus video flag ${runId} --note "what's wrong"`);
    }
    if (stop.framesNodeId) {
      lines.push(
        `Redo one frame: exodus video retry-frame ${runId} --node ${stop.framesNodeId} --scene <n>`,
      );
    }
    return lines;
  }
  if (stop.at === "final-watch") {
    // #1704: the ledger read failed, so every command below would be a guess —
    // "upload a cut" to someone who already has one, or "approve" to someone
    // who has nothing to approve. Say what IS known, and name the one command
    // that looks again.
    if (stop.cutAttached === null) {
      return [
        "Parked: every piece is made.",
        `Couldn't check whether a cut is already uploaded. See where it stands: exodus video status ${runId}`,
        `Watch it here:   ${runUrl}`,
      ];
    }
    // #1704: the cut is in, so the next step is the approval — not the pull and
    // upload the member has already done. The redo road stays open in one line,
    // because the common case is that the cut is right. Nothing here promises
    // the approval will be allowed; the server decides that (#1856).
    if (stop.cutAttached) {
      return [
        "Parked: your cut is uploaded and waiting for your approval.",
        `Approve it:      exodus video approve ${runId}`,
        `Watch it here:   ${runUrl}`,
        "Changed your mind? You can still redo a clip and upload a new cut.",
      ];
    }
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
      // #2168: the retry redoes the steps that FAILED, and the server refuses
      // it outright when none did. With no step named there is nothing to
      // retry, so say so plainly rather than offer a command that throws.
      if (!stop.step) {
        return [
          "This run stopped at a step that can't be picked back up from here.",
          "Start a fresh run to get this ad made.",
          `Open the run:        ${runUrl}`,
        ];
      }
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

/**
 * #1902: the step the failure record belongs to. ONE finder, read by the status
 * block, the --json object and the draft fetch alike, so the three can never
 * disagree about which step is being talked about.
 *
 * Deliberately not routed through `classifyRun`: that one names a dead step only
 * for a repair park or a failed run, and a storyboard can fail on a run that is
 * still running or already parked elsewhere. The record shows wherever it exists.
 */
export function failedStoryboardNode(run: VideoRun): VideoRunNode | undefined {
  return run.nodes.find((n) => n.kind === "storyboard" && n.status === "failed");
}

/**
 * #1902: an entitled reader's storyboard error carries the violations verbatim,
 * which the record below re-renders as a list. A surface that prints BOTH says
 * the same thing twice, the first time with the contract module's prefix on it.
 * Detected by content rather than by that prefix, which is the contract's
 * business — the same test the run page folds the duplicate away by
 * (src/components/run-detail/node-drawer.tsx).
 */
export function errorEchoesReasons(
  error: string | undefined,
  record: PlanFailureRecord | undefined,
): boolean {
  if (!error || record?.kind !== "rejected") return false;
  const reasons = record.reasons ?? [];
  return reasons.length > 0 && reasons.every((reason) => error.includes(reason));
}

/**
 * #1902: the failure record as a block of screen lines, or nothing at all when
 * the server sent no record. Nothing is re-worded here: `lines` is printed as it
 * arrived, indented under a header.
 */
export function planFailureLines(node: VideoRunNode | undefined, runId: string): string[] {
  const record = node?.planFailure;
  if (!record || !Array.isArray(record.lines) || !node) return [];

  // The reasons are the TAIL of `lines` on a rejected record (planFailure.ts
  // pushes them last), which is how they can be set out as a list without this
  // surface deciding which line is a reason.
  const reasons = record.kind === "rejected" ? (record.reasons ?? []) : [];
  const bodyCount = Math.max(0, record.lines.length - reasons.length);

  // #2133: a run can hold two storyboard steps, so the record names its own
  // step rather than leaving "which storyboard?" for the reader to guess.
  const lines = [`What happened to the storyboard step (${node.nodeId}):`];
  record.lines.forEach((line, i) => {
    lines.push(i < bodyCount ? `  ${line}` : `    - ${line}`);
  });
  if (node?.hasRejectedDraft === true) {
    lines.push(
      "  A rejected draft is on file. The system threw it away, so it is a record of what happened and nothing to act on.",
      `  Read it: exodus video status ${runId} --rejected-draft`,
    );
  }
  return lines;
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
  /** #1869: how this character is meant to SOUND, in words, on a run whose video
   *  model speaks the lines itself. Null when nobody wrote one. */
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
  /** Continuous master take, or null when the run has only per-scene VO. */
  narration: { file: string; timing: string } | null;
  scenes: ManifestScene[];
  failed: PullFailure[];
  /**
   * #1869: the record of which rulebook made this cut. Written only when the
   * run carried one, so a manifest from a run that followed none is unchanged.
   */
  provenance?: RunProvenance;
}

export const CAST_LEDGER_BASE = HELPER_LEDGER_BASE + 10000;

function isPullSceneIndex(sceneIndex: number): boolean {
  return sceneIndex >= 0 && sceneIndex < HELPER_LEDGER_BASE;
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

/** #1716: the QC stamp on a ledger row's clip, when it has one. */
function clipQcOf(item: NodeItem | undefined): ClipQcTake[] | undefined {
  const artifact = item?.artifact;
  return artifact && artifact.type === "video" ? artifact.qc?.takes : undefined;
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
    // Cast identity stills only ([CAST_LEDGER_BASE, SET_OPTION_LEDGER_BASE)).
    // Set-gate room options (SET_OPTION_LEDGER_BASE) and cast-gate option
    // renders (CAST_OPTION_LEDGER_BASE) are spend/render records, not cast
    // references (#2202), so they must not leak into the pull manifest as
    // cast-ref files.
    if (
      item.itemKind === "frame" &&
      item.sceneIndex >= CAST_LEDGER_BASE &&
      item.sceneIndex < SET_OPTION_LEDGER_BASE
    ) {
      byIndex.set(item.sceneIndex, item);
    }
  }
  return byIndex;
}

/** What one character's voice is, as the storyboard records it: the #1845
 *  pinned ElevenLabs voice, the #1869 written one, or both. */
interface CastVoiceRecord {
  voiceId: string | null;
  voiceLabel: string | null;
  voiceDescription: string | null;
}

/** #1845/#1869: each character's voice, keyed by character id. It lives on the
 *  storyboard envelope's `cast[]` (convex/lib/workflow/castVoices.ts), not on
 *  the cast lock, so it is read off the storyboard artifact the pull already
 *  has. A storyboard that never carried a cast yields nothing. */
function castVoicePins(
  artifact: Extract<ArtifactSubset, { type: "storyboard" }> | undefined,
): Map<string, CastVoiceRecord> {
  const pins = new Map<string, CastVoiceRecord>();
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
    const description =
      typeof member.voiceDescription === "string" ? member.voiceDescription.trim() : "";
    if (!characterId || (!voiceId && !description)) continue;
    const label = typeof member.voiceLabel === "string" ? member.voiceLabel.trim() : "";
    pins.set(characterId, {
      voiceId: voiceId ? voiceId : null,
      voiceLabel: voiceId && label ? label : null,
      voiceDescription: description ? description : null,
    });
  }
  return pins;
}

function planCastRefs(
  run: VideoRun,
  items: NodeItem[],
  pins: Map<string, CastVoiceRecord>,
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
      voiceDescription: pin?.voiceDescription ?? null,
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
      if (!isPullSceneIndex(frame.sceneIndex)) continue;
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
    if (typeof artifact.sceneIndex !== "number" || !isPullSceneIndex(artifact.sceneIndex)) continue;
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
    if (!isPullSceneIndex(artifact.sceneIndex)) continue;
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
    if (!isPullSceneIndex(item.sceneIndex)) continue;
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
    .filter((sceneIndex) => isPullSceneIndex(sceneIndex))
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
      // #1716: the take history rides the manifest with the checker's own words
      // taken out — the same rule `withoutJudgeFields` applies to the findings
      // just below, and for the same reason.
      qc: clip?.qc ? qcWithoutJudgeWording(clip.qc) : null,
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
      ...(run.provenance?.format || run.provenance?.voice
        ? { provenance: run.provenance }
        : {}),
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
    // #1704: after the loop, so an hour-long wait costs ONE extra read, not one
    // per poll.
    const resolved = await resolveStopAtPark(stop, runId, deps);
    if (opts.json) {
      return {
        code: stop.at === "failed" ? 1 : 0,
        lines: [JSON.stringify({ runId, stop: resolved, status: run.status, url: opts.url })],
      };
    }
    return {
      code: stop.at === "failed" ? 1 : 0,
      lines: [...lines, ...stopLines(resolved, runId, reviewUrl(deps.dashboardUrl, run))],
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
  // #1870: first, because nothing clears `flagged` when a redo dies. A flagged
  // clip whose redo stopped would otherwise still read "flagged", hiding the
  // one thing the member has to act on. The grid has one word per cell, so it
  // says the true one and the redo commands take the scene again.
  if (item.staleClaim === true) return "stopped";
  if (item.flagged === true) return "flagged";
  return ITEM_STATUS_WORD[item.status] ?? item.status;
}

/**
 * #1903: a queued run that has ALREADY worked — an approved gate, a retry, or a
 * long step handing itself to a fresh worker. "Queued" alone reads like nothing
 * has happened yet, which is what made a hand-over look like a loss. Same rule
 * and same words as the run page's queued sentence.
 */
const CARRYING_ON_LINE =
  "Waiting for a worker to carry on. Everything finished so far is kept — the run picks up from there by itself.";

function carryingOn(run: VideoRun): boolean {
  return (
    run.status === "queued" &&
    run.nodes.some((n) => n.status !== "idle" && n.status !== "out-of-scope")
  );
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

  // #1704: one fact, read once, driving the guidance block, the footer and the
  // `hasFinal` field alike — the three used to be able to contradict each other.
  const hasFinal = hasAttachedCut(items);
  const stop = resolveStop(classifyRun(run), hasFinal);

  // #1902: what happened to a storyboard that failed. Read once, printed below
  // and reported in --json from the one node, so the screen and the machine
  // answer cannot describe different steps.
  const failedStoryboard = failedStoryboardNode(run);

  // This is the one surface that prints the record UNDER the stop, so it is the
  // one that can drop the raw error the record restates. `wait` keeps its error:
  // it prints no record, so there the error is the whole story. The `stop` the
  // --json object carries is untouched either way.
  const guidance = stopLines(
    stop.at === "failed" && errorEchoesReasons(stop.error, failedStoryboard?.planFailure)
      ? { ...stop, error: undefined }
      : stop,
    runId,
    reviewUrl(deps.dashboardUrl, run),
  );

  const warnings = run.nodes
    .filter((n) => n.warning)
    .map((n) => ({ nodeId: n.nodeId, step: n.kind, warning: n.warning }));

  if (json) {
    return {
      code: 0,
      // #1704: `guidance` is the very array the human render prints below, so a
      // machine reader and a person are told the next step by one derivation.
      lines: [
        JSON.stringify({
          runId,
          status: run.status,
          stop,
          items,
          hasFinal,
          warnings,
          guidance,
          // Both fields stay ABSENT when the server sent none. An empty record
          // would read as "nothing happened", and an explicit
          // `hasRejectedDraft: false` would tell an unentitled caller there is
          // something here they may not see.
          ...(failedStoryboard?.planFailure ? { planFailure: failedStoryboard.planFailure } : {}),
          // #2133: which step the failure record belongs to — a run can hold
          // two storyboard steps, and the record must name its own.
          ...(failedStoryboard?.planFailure
            ? { storyboardNodeId: failedStoryboard.nodeId }
            : {}),
          ...(failedStoryboard?.hasRejectedDraft === true ? { hasRejectedDraft: true } : {}),
        }),
      ],
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
    ...(carryingOn(run) ? [CARRYING_ON_LINE] : []),
    ...guidance,
    // #1883: "Working" alone reads like a run going straight through, and a
    // healthy gated run was cancelled over exactly that.
    ...(stop.at === "running" && run.pauseAhead ? [pauseAheadLine(run.pauseAhead)] : []),
    ...planFailureLines(failedStoryboard, runId),
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
      // #1855: a redo that fails its checks keeps the original take and leaves
      // the row reading "done", so the grid word alone cannot say whether the
      // member got a new take. The outcome goes first, above the findings that
      // explain it, and names the column it belongs to.
      if (row.clip?.lastRedo) {
        lines.push(`       clip: ${row.clip.lastRedo.label}`);
        printDisplacedHistory(lines, row.clip.lastRedo);
      }
      // #1716: the take history hangs UNDER the redo outcome, so the two read
      // as one record of what this clip went through rather than as two
      // competing ones. Printed only where a reason is already being shown —
      // a flagged clip, or one somebody redid — so an ordinary run grows no
      // noise. A clip from before #1716 says so in as many words.
      if (row.clip?.lastRedo || row.clip?.flagged) {
        for (const line of renderQcTakeHistory(clipQcOf(row.clip))) {
          lines.push(`       ${line}`);
        }
      }
      if (row.voiceover?.lastRedo) {
        lines.push(`       voice: ${row.voiceover.lastRedo.label}`);
        printDisplacedHistory(lines, row.voiceover.lastRedo);
      }
      if (row.frame?.lastRedo) lines.push(`       picture: ${row.frame.lastRedo.label}`);
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

/**
 * #1902: the planner reply a failed storyboard step had turned down.
 *
 * It is printed and nothing else. It is never written into a pull manifest or
 * any other file, for the same reason the checker's own words are not
 * (`withoutJudgeFields`): a draft nobody accepted must not end up somewhere it
 * can be mistaken for the ad, or edited and handed back.
 */
export async function rejectedDraftFlow(
  runId: string,
  json: boolean,
  deps: VideoDeps,
): Promise<FlowResult> {
  const runRes = await deps.get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`);
  if (!runRes.ok) return errorResult(runRes, json);
  const node = failedStoryboardNode(asVideoRun(runRes.data));
  if (!node) {
    const note = "The storyboard on this run didn't fail, so there is no rejected draft to read.";
    return {
      code: 0,
      lines: json ? [JSON.stringify({ runId, nodeId: null, draft: null })] : [note],
    };
  }

  const res = await deps.get(
    `${REJECTED_DRAFT_PATH}?runId=${encodeURIComponent(runId)}&nodeId=${encodeURIComponent(node.nodeId)}`,
  );
  // An older backend has never heard of the path and answers a plain 404. A
  // deployed route that will not show this caller a draft answers the semantic
  // shape instead, and falls through to the usual video wording.
  if (missingRouteLine(res, "exodus video status --rejected-draft")) {
    return {
      code: 1,
      lines: json
        ? [JSON.stringify({ ok: false, status: 404, error: REJECTED_DRAFT_NOT_ON_THIS_SERVER })]
        : [REJECTED_DRAFT_NOT_ON_THIS_SERVER],
    };
  }
  if (!res.ok) return errorResult(res, json);

  const draft = (res.data as { draft?: string | null }).draft ?? null;
  if (json) return { code: 0, lines: [JSON.stringify({ runId, nodeId: node.nodeId, draft })] };
  if (!draft) return { code: 0, lines: ["No rejected draft was kept for this attempt."] };
  return {
    code: 0,
    lines: [
      `REJECTED DRAFT — ad run ${runId}, step ${node.nodeId}`,
      "The system turned this draft down and threw it away. It is kept only as a record of what happened.",
      "Nothing in it is part of your ad. There is nothing here to act on or edit.",
      "",
      ...draft.split("\n"),
    ],
  };
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

  // #1908: the cards say nothing about who owns the run, and `video flag` is a
  // Show-ad-only door. So a THIRD non-fatal read, for the one line it decides.
  // A refusal or a dropped connection costs the send-back line and nothing else.
  const runRes = await deps
    .get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`)
    .catch(() => null);
  const showAd = runRes?.ok === true && isShowAd(asVideoRun(runRes.data));

  lines.push("", `approve with: exodus video approve ${runId}`);
  if (showAd) {
    lines.push(`send it back: exodus video flag ${runId} --note "what's wrong"`);
  }
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
  opts: { json: boolean; approveStaleCut: boolean },
  deps: VideoDeps,
): Promise<FlowResult> {
  const res = await deps.post(APPROVE_PATH, {
    runId,
    // #1856: the server refuses a cut its clips have moved past. Only the member's
    // own --approve-stale-cut overrides that, so the key is sent only when they
    // typed the flag. It is never defaulted and never inferred from the run.
    ...(opts.approveStaleCut ? { approveStaleCut: true } : {}),
  });
  // #1845: a refused approve (a chosen voice ElevenLabs is certain is gone) comes
  // back 400 with one plain sentence — printed as-is, exit 1, nothing approved.
  // #1856: an out-of-date cut is refused the same way. The server's sentence
  // says "approve this cut anyway"; on the command line that is one flag, so
  // name it rather than leave the member to find it in the help.
  if (!res.ok) {
    const refusal = errorResult(res, opts.json);
    const staleCut = !opts.json && videoApiError(res).includes("approve this cut anyway");
    return staleCut
      ? {
          ...refusal,
          lines: [
            ...refusal.lines,
            `To deliver it anyway: exodus video approve ${runId} --approve-stale-cut`,
          ],
        }
      : refusal;
  }
  const data = res.data as {
    voices?: { cast?: CastVoiceRow[]; notices?: string[] };
    warnings?: string[];
  } | null;
  // #1856: things the member should know about the approve that went through
  // anyway, worded by the server. Absent on older backends.
  const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
  if (opts.json) {
    return { code: 0, lines: [JSON.stringify({ ok: true, runId, warnings, data: res.data })] };
  }
  // #1845: approving is the last moment a wrong voice can still be caught, so the
  // receipt names the voice each speaking character got. Absent on older backends
  // and on approves that are not the storyboard stop.
  const voices = data?.voices;
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
      ...warnings,
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

// #1856: guidance before the redo, not a second verdict. The server decides at
// approve time whether the uploaded cut is out of date, and this names the one
// flag that gets past that refusal.
const UPLOADED_CUT_WARNING =
  "The cut you already uploaded will not include the new clip. If this redo replaces the clip, " +
  "exodus video approve stops until you pull the pieces again, re-cut and upload again, " +
  "or pass --approve-stale-cut to deliver the cut you uploaded as it is.";

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

  // #1870: a redo the server has called dead is a failure nobody recorded, and
  // the server retries it like one whatever the run is parked at.
  const redoable =
    row.status === "failed" ||
    row.staleClaim === true ||
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
  const uploadedCut = hasAttachedCut(items);

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
  if (row.status === "running" && row.staleClaim !== true) {
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
    // #1870: a stopped voice redo never let go of the clip it was working on,
    // so that clip is still the generator's own and still re-performable.
    (item.status === "done" || item.staleClaim === true) &&
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
 * #1888: the voice paths the server refuses a redo on, mirroring its
 * `VOICE_PATH_NEEDS[path].pins === "never-heard"` test. The sheet's other two
 * fields answer different questions and would both be wrong here:
 * `usesElevenLabs` is true on a described run that still bills for narration,
 * and `treatment.kind` follows `revoicesAfterRender`, which calls
 * lipsync-retarget render-owned even though a redo there is allowed.
 */
export const VOICE_PATHS_NEVER_HEARD = new Set(["native-prompt", "omni-audio-ids", "gemini-direct"]);

/**
 * #1888: the run-level twin of the server's per-scene refusal, for the one
 * caller that never reaches the route to hear it. Null when the sheet cannot be
 * read or the run's path allows a redo, so a harmless "nothing to do" is never
 * turned into an error.
 */
async function neverHeardRunLine(runId: string, deps: VideoDeps): Promise<string | null> {
  // `get` is a bare fetch and rejects on a dropped connection. This read only
  // picks the wording of a no-op, so it must never be what fails the command.
  const res = await deps
    .get(`${VOICES_PATH}?runId=${encodeURIComponent(runId)}`)
    .catch(() => null);
  if (!res?.ok) return null;
  const path = (res.data as { treatment?: { path?: string | null } } | null)?.treatment?.path;
  if (typeof path !== "string" || !VOICE_PATHS_NEVER_HEARD.has(path)) return null;
  return (
    `This run's clips are not voiced by ElevenLabs — the "${path}" way settles each voice as ` +
    "the clip is rendered — so no clip on this run has a voice pass to redo. Nothing was queued " +
    "and nothing was spent. To make a clip again from scratch, redo the clip instead."
  );
}

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

  if ((row.status !== "done" && row.staleClaim !== true) || row.artifact?.type !== "video") {
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
    const note =
      (await neverHeardRunLine(runId, deps)) ??
      "No clip on this run is waiting for a voice pass, so nothing was started.";
    return {
      code: 0,
      lines: json ? [JSON.stringify({ ok: true, runId, scenes: [], note })] : [note],
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
  /** #1869: this character's WRITTEN voice, on a run whose video model speaks
   *  the lines itself. Absent when nobody wrote one. */
  description?: string;
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
    /**
     * #1869: what happens to a pinned voice, and which setting decided. Both
     * optional to READ — a backend older than #1869 sends neither `path` nor,
     * before it, `kind`, and the sheet then prints only the summary sentence.
     */
    kind?: string;
    path?: string | null;
    /**
     * #1869: whether ANYTHING on this run still goes to ElevenLabs. A run whose
     * cast is voiced by the video model can still have its narration recorded
     * there, and that is the bill. Optional to READ: a backend older than #1869
     * sends nothing and the cost line prints as it always did.
     */
    usesElevenLabs?: boolean;
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
  // #1869: a character with a written voice HAS a voice — it is just not one
  // ElevenLabs holds, so "no voice yet" would be flatly wrong.
  if (!row.voice) return row.description ? "voice written below" : "no voice yet";
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
  // #1869: name the way this run makes its voices, when the server says which.
  if (typeof sheet.treatment.path === "string" && sheet.treatment.path !== "") {
    lines.push(`  Treatment: ${sheet.treatment.path}`);
  }
  if (sheet.cast.length === 0) lines.push("  Nobody is in this ad yet.");
  for (const row of sheet.cast) {
    const voice = voiceWords(row);
    lines.push(
      `  ${row.characterId}  ${row.name}  ${voice}  ${availabilityWords(row)}  ` +
        `speaks in ${row.spokenScenes} scene${row.spokenScenes === 1 ? "" : "s"}, ` +
        `about ${row.spokenSeconds}s`,
    );
    // #1869: a written voice is the whole answer on a described run, so it gets
    // its own line rather than being squeezed into the row above.
    if (row.description) lines.push(`      written voice: ${row.description}`);
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
  // #1869 + #1876: `usage` counts only the CAST clips ElevenLabs voices, so the
  // counters are the honest answer when there is at least one of them and this
  // run plays its pinned voices at all. Zero counters beside a real narration
  // bill would read as "this costs nothing", which is what a described run
  // prints and what a lipsync run whose only speaker is the narrator would have
  // printed. An older backend sends no `usesElevenLabs`, and then this prints
  // exactly as it always did.
  const playsPinnedVoices = sheet.treatment.kind !== "render-owns-voice";
  const convertsClips = playsPinnedVoices && sheet.treatment.usage.clips > 0;
  if (convertsClips || sheet.treatment.usesElevenLabs === undefined) {
    lines.push(
      `Cost: billed to your own ElevenLabs key. ${sheet.treatment.costNote} ` +
        `About ${sheet.treatment.usage.seconds} seconds of speech across ` +
        `${sheet.treatment.usage.clips} clips will be converted.`,
    );
  } else if (sheet.treatment.usesElevenLabs) {
    lines.push(
      "Cost: the narration on this run is voiced by ElevenLabs and billed to your own key. " +
        `${sheet.treatment.costNote} The clips themselves are not converted.`,
    );
  }
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

  if (sub === "status") {
    // Not `=== true`: `--rejected-draft` typed BEFORE the run id swallows the id
    // as its value (lib/args.ts), and silently printing the ordinary status to
    // someone who asked for the draft is the worst answer available.
    if (flags["rejected-draft"] !== undefined && flags["rejected-draft"] !== false) {
      return printResult(await rejectedDraftFlow(runId, json, defaultDeps));
    }
    return printResult(await statusFlow(runId, json, defaultDeps));
  }
  if (sub === "storyboard") return printResult(await storyboardFlow(runId, json, defaultDeps));
  if (sub === "approve") {
    return printResult(
      await approveFlow(
        runId,
        { json, approveStaleCut: flags["approve-stale-cut"] === true },
        defaultDeps,
      ),
    );
  }

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
