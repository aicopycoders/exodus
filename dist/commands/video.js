import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { apiGet, apiPost, getDashboardUrl } from "../lib/client.js";
import { displayRunStatus, formatApiError } from "../lib/format.js";
import { missingRouteLine } from "../lib/route-support.js";
import { hasBinary } from "../lib/preflight.js";
import { ASSET_UPLOAD_POLICY, pauseAheadLine, } from "./workflow.js";
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
     Where the run is and how each scene's clip turned out.

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
  exodus video status <runId> [--json]
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
const STORYBOARD_PATH = "/api/v2/video/storyboard";
const FLAG_PATH = "/api/v2/video/storyboard/flag";
const APPROVE_PATH = "/api/v2/workflow/approve";
const SCENE_RETRY_PATH = "/api/v2/workflow/scene/retry";
const SCENE_REVOICE_PATH = "/api/v2/workflow/scene/revoice";
const REVOICE_NOT_ON_THIS_SERVER = "This Exodus server does not have the voice redo yet, so nothing was started and nothing " +
    "was spent. It arrives with the next server update.";
const FINAL_PATH = "/api/v2/video/final";
export const VOICES_PATH = "/api/v2/video/voices";
const ASSET_UPLOAD_URL_PATH = "/api/v2/workflows/asset-upload-url";
const ASSETS_PATH = "/api/v2/workflows/assets";
function withoutJudgeFields({ judgeDetail: _d, judgeSeverity: _s, ...rest }) {
    return rest;
}
export function asVideoRun(data) {
    const run = (data ?? {});
    return { ...run, nodes: Array.isArray(run.nodes) ? run.nodes : [] };
}
function defaultProbeDurationSec(filePath) {
    if (!hasBinary("ffprobe"))
        return null;
    const res = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath], { encoding: "utf-8" });
    if (res.error || res.status !== 0)
        return null;
    const seconds = Number.parseFloat((res.stdout ?? "").trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
export const defaultDeps = {
    get: (p) => apiGet(p),
    post: (p, body) => apiPost(p, body),
    mkdirp: (dir) => {
        fs.mkdirSync(dir, { recursive: true });
    },
    writeFile: (filePath, text) => fs.writeFileSync(filePath, text, "utf-8"),
    downloadToFile: async (url, filePath) => {
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
    },
    readFile: (filePath) => fs.readFileSync(filePath, "utf-8"),
    readFileBytes: (filePath) => fs.readFileSync(filePath),
    statFile: (filePath) => {
        try {
            const stat = fs.statSync(filePath);
            return stat.isFile() ? { size: stat.size } : null;
        }
        catch {
            return null;
        }
    },
    uploadBytes: async (uploadUrl, contentType, bytes) => {
        const res = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: new Blob([bytes]),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            return { ok: false, status: res.status, body };
        }
        const parsed = (await res.json().catch(() => ({})));
        return { ok: true, status: res.status, storageId: parsed.storageId };
    },
    probeDurationSec: defaultProbeDurationSec,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    dashboardUrl: getDashboardUrl(),
};
export const VIDEO_NOT_FOUND_MESSAGE = "video isn't enabled for this key\n" +
    "Either your dashboard user needs the admin role on this brand (video is admin-only), or that run id doesn't exist here. Check the id, then ask Brad about the role.";
export function videoApiError(res) {
    const behind = missingRouteLine(res, "exodus video");
    if (behind)
        return behind;
    if (res.status === 404)
        return VIDEO_NOT_FOUND_MESSAGE;
    return formatApiError(res);
}
function errorResult(res, json) {
    return {
        code: 1,
        lines: json
            ? [JSON.stringify({ ok: false, status: res.status, error: videoApiError(res) })]
            : [videoApiError(res)],
    };
}
const GATE_NODE_KINDS = new Set(["scene-frames", "storyboard"]);
function isAwaitingApproval(status) {
    return status === "awaiting-approval" || status === "awaiting-review";
}
function parkedByBuilderCheckpoint(run) {
    return run.pauseReason !== undefined;
}
function parkedAtStoryboardGate(run, pausedNode) {
    return !parkedByBuilderCheckpoint(run) && GATE_NODE_KINDS.has(pausedNode.kind);
}
function parkedAtFinalWatch(run) {
    return (!parkedByBuilderCheckpoint(run) &&
        run.nodes.some((n) => n.kind === "video" && n.status === "done"));
}
export function classifyRun(run) {
    if (run.status === "failed")
        return { at: "failed", error: run.error };
    if (run.isTerminal)
        return { at: "finished", status: run.status };
    if (isAwaitingApproval(run.status)) {
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
        if (parkedAtFinalWatch(run))
            return { at: "final-watch" };
        return { at: "paused", nodeId: run.pausedNodeId, reason: run.pauseReason };
    }
    const active = run.nodes.find((n) => n.status === "running");
    return { at: "running", stage: active?.kind ?? "starting" };
}
export function hasAttachedCut(items) {
    return items.some((i) => i.itemKind === "final" && i.status === "done");
}
export function resolveStop(stop, cutAttached) {
    if (stop.at !== "final-watch")
        return stop;
    return { at: "final-watch", cutAttached };
}
export async function resolveStopAtPark(stop, runId, deps) {
    if (stop.at !== "final-watch")
        return stop;
    const res = await deps.get(`${ITEMS_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!res.ok)
        return resolveStop(stop, null);
    return resolveStop(stop, hasAttachedCut(res.data.items ?? []));
}
const STAGE_WORDS = {
    brief: "reading the script",
    storyboard: "writing the storyboard",
    reference: "drawing the reference still",
    "scene-frames": "drawing one picture per scene",
    voiceover: "recording the voices",
    video: "rendering the clips",
    starting: "starting up",
};
export function stageWord(stage) {
    return STAGE_WORDS[stage] ?? stage;
}
const STEP_NAMES = {
    brief: "The script read",
    storyboard: "The storyboard",
    reference: "The reference still",
    "scene-frames": "The scene pictures",
    voiceover: "The voices",
    video: "The clips",
};
export function stepName(kind) {
    if (!kind)
        return "A step in this run";
    return STEP_NAMES[kind] ?? `The ${kind} step`;
}
export function reviewUrl(dashboardUrl, run) {
    if (run.moduleOwned === true)
        return `${dashboardUrl}/video?ad=${run._id}`;
    if (run.workflowId)
        return `${dashboardUrl}/workflows/${run.workflowId}/runs/${run._id}`;
    return `${dashboardUrl}/runs/${run._id}`;
}
export function stopLines(stop, runId, runUrl) {
    if (stop.at === "storyboard-gate") {
        const lines = [
            "Parked: the storyboard is waiting for your yes.",
            `Read it:    exodus video storyboard ${runId}`,
            `Approve it: exodus video approve ${runId}`,
            `Send back:  exodus video flag ${runId} --note "what's wrong"`,
        ];
        if (stop.framesNodeId) {
            lines.push(`Redo one frame: exodus video retry-frame ${runId} --node ${stop.framesNodeId} --scene <n>`);
        }
        return lines;
    }
    if (stop.at === "final-watch") {
        if (stop.cutAttached === null) {
            return [
                "Parked: every piece is made.",
                `Couldn't check whether a cut is already uploaded. See where it stands: exodus video status ${runId}`,
                `Watch it here:   ${runUrl}`,
            ];
        }
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
export const CAST_LEDGER_BASE = 910000;
const FALLBACK_EXT = {
    image: "png",
    video: "mp4",
    audio: "mp3",
};
export function extensionFromUrl(url) {
    const withoutQuery = url.split(/[?#]/)[0];
    const match = withoutQuery.match(/\.([a-z0-9]{1,5})$/i);
    return match ? match[1].toLowerCase() : undefined;
}
function extFor(url, family) {
    return extensionFromUrl(url) ?? FALLBACK_EXT[family];
}
export function scenePrefix(sceneIndex) {
    return `scene-${String(sceneIndex).padStart(2, "0")}`;
}
function outputsOfNodeKind(run, kind) {
    return run.nodes.filter((n) => n.kind === kind).flatMap((n) => n.outputs ?? []);
}
function clipFromArtifact(sceneIndex, artifact) {
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
function keyframeDownload(sceneIndex, imageUrl) {
    return {
        file: `${scenePrefix(sceneIndex)}.keyframe.${extFor(imageUrl, "image")}`,
        url: imageUrl,
    };
}
function reservedCastFrames(items) {
    const byIndex = new Map();
    for (const item of items) {
        if (item.itemKind === "frame" && item.sceneIndex >= CAST_LEDGER_BASE) {
            byIndex.set(item.sceneIndex, item);
        }
    }
    return byIndex;
}
function castVoicePins(artifact) {
    const pins = new Map();
    let envelope = artifact?.storyboard;
    if (envelope === undefined && typeof artifact?.storyboardJson === "string") {
        try {
            envelope = JSON.parse(artifact.storyboardJson);
        }
        catch {
            return pins;
        }
    }
    const cast = envelope?.cast;
    if (!Array.isArray(cast))
        return pins;
    for (const member of cast) {
        const characterId = typeof member.characterId === "string" ? member.characterId.trim() : "";
        const voiceId = typeof member.voiceId === "string" ? member.voiceId.trim() : "";
        const description = typeof member.voiceDescription === "string" ? member.voiceDescription.trim() : "";
        if (!characterId || (!voiceId && !description))
            continue;
        const label = typeof member.voiceLabel === "string" ? member.voiceLabel.trim() : "";
        pins.set(characterId, {
            voiceId: voiceId ? voiceId : null,
            voiceLabel: voiceId && label ? label : null,
            voiceDescription: description ? description : null,
        });
    }
    return pins;
}
function planCastRefs(run, items, pins) {
    const ledger = reservedCastFrames(items);
    const ledgerRows = [...ledger.entries()].sort(([a], [b]) => a - b);
    const locked = run.castLock?.cast;
    const rows = [];
    if (locked !== undefined && locked.length > 0) {
        const claimedStorageIds = new Set();
        for (const member of locked) {
            const storageId = member.identityRefs?.[0]?.storageId;
            const item = typeof storageId === "string" && storageId.length > 0
                ? ledgerRows.find(([, row]) => {
                    const art = row.artifact;
                    return art?.type === "image" && art.storageId === storageId;
                })?.[1]
                : undefined;
            if (typeof storageId === "string" && storageId.length > 0) {
                claimedStorageIds.add(storageId);
            }
            const art = item?.artifact;
            const url = (art?.type === "image" ? art.imageUrl : undefined) ??
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
            if (typeof sid === "string" && claimedStorageIds.has(sid))
                continue;
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
    else {
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
    const cast = [];
    const downloads = [];
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
        if (file && row.url)
            downloads.push({ file, url: row.url });
    }
    return { cast, downloads };
}
function isNarrationMaster(artifact) {
    return (artifact.type === "audio" &&
        artifact.sceneIndex === undefined &&
        Array.isArray(artifact.narration?.cuts));
}
export function planPull(run, items, opts) {
    const texts = [];
    const storyboardArtifact = run.nodes
        .flatMap((n) => n.outputs ?? [])
        .find((a) => a.type === "storyboard");
    let storyboard = null;
    if (storyboardArtifact) {
        const raw = typeof storyboardArtifact.storyboardJson === "string"
            ? storyboardArtifact.storyboardJson
            : storyboardArtifact.storyboard !== undefined
                ? JSON.stringify(storyboardArtifact.storyboard, null, 2)
                : undefined;
        if (raw !== undefined) {
            storyboard = "storyboard.json";
            texts.push({ file: storyboard, body: raw.endsWith("\n") ? raw : `${raw}\n` });
        }
    }
    let reference = null;
    for (const artifact of outputsOfNodeKind(run, "reference")) {
        if (artifact.type !== "image" || !artifact.imageUrl)
            continue;
        reference = {
            file: `reference.${extFor(artifact.imageUrl, "image")}`,
            url: artifact.imageUrl,
        };
    }
    const keyframeByScene = new Map();
    for (const artifact of run.nodes.flatMap((n) => n.outputs ?? [])) {
        if (artifact.type !== "frames")
            continue;
        for (const frame of artifact.frames ?? []) {
            if (!frame.imageUrl)
                continue;
            keyframeByScene.set(frame.sceneIndex, keyframeDownload(frame.sceneIndex, frame.imageUrl));
        }
    }
    const voiceByScene = new Map();
    let narrationDownload = null;
    let narrationMaster = null;
    for (const artifact of outputsOfNodeKind(run, "voiceover")) {
        if (artifact.type !== "audio" || !artifact.audioUrl)
            continue;
        if (isNarrationMaster(artifact)) {
            narrationMaster = artifact;
            narrationDownload = {
                file: `narration.${extFor(artifact.audioUrl, "audio")}`,
                url: artifact.audioUrl,
            };
            continue;
        }
        if (typeof artifact.sceneIndex !== "number" || artifact.sceneIndex < 0)
            continue;
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
                file: voiceByScene.get(cut.sceneIndex)?.download.file ??
                    `${scenePrefix(cut.sceneIndex)}.voice.mp3`,
            })),
        };
        texts.push({
            file: "narration.json",
            body: `${JSON.stringify(timing, null, 2)}\n`,
        });
    }
    const clipByScene = new Map();
    let music = null;
    for (const artifact of outputsOfNodeKind(run, "video")) {
        if (artifact.type === "audio" && artifact.sceneIndex === undefined && artifact.audioUrl) {
            music = { file: `music.${extFor(artifact.audioUrl, "audio")}`, url: artifact.audioUrl };
            continue;
        }
        if (artifact.type !== "video" || typeof artifact.sceneIndex !== "number")
            continue;
        const clip = clipFromArtifact(artifact.sceneIndex, artifact);
        if (!clip)
            continue;
        clipByScene.set(artifact.sceneIndex, clip);
    }
    const clipItemByScene = new Map();
    const frameItemByScene = new Map();
    const sceneFrameNodeIds = new Set(run.nodes.filter((n) => n.kind === "scene-frames").map((n) => n.nodeId));
    for (const item of items) {
        if (item.itemKind === "clip")
            clipItemByScene.set(item.sceneIndex, item);
        if (item.itemKind === "frame" && sceneFrameNodeIds.has(item.nodeId)) {
            frameItemByScene.set(item.sceneIndex, item);
        }
    }
    for (const [sceneIndex, item] of clipItemByScene) {
        if (item.status !== "done" || clipByScene.has(sceneIndex))
            continue;
        const clip = clipFromArtifact(sceneIndex, item.artifact);
        if (!clip)
            continue;
        clipByScene.set(sceneIndex, clip);
    }
    for (const [sceneIndex, item] of frameItemByScene) {
        if (item.status !== "done" || keyframeByScene.has(sceneIndex))
            continue;
        const artifact = item.artifact;
        if (!artifact || artifact.type !== "image" || !artifact.imageUrl)
            continue;
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
    const scenes = sceneIndexes.map((sceneIndex) => {
        const clip = clipByScene.get(sceneIndex);
        const voice = voiceByScene.get(sceneIndex);
        const item = clipItemByScene.get(sceneIndex);
        const frameItem = frameItemByScene.get(sceneIndex);
        let source = null;
        let wordsFrom = null;
        if (clip?.words && clip.words.length > 0) {
            source = clip.words;
            wordsFrom = "clip";
        }
        else if (voice?.words && voice.words.length > 0) {
            source = voice.words;
            wordsFrom = "voice";
        }
        let words = null;
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
            wordsDescribe: wordsFrom === null
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
    const { cast, downloads: castDownloads } = planCastRefs(run, items, castVoicePins(storyboardArtifact));
    const downloads = [
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
export function markPullFailure(manifest, failure) {
    manifest.failed.push(failure);
    if (manifest.storyboard === failure.file)
        manifest.storyboard = null;
    if (manifest.reference === failure.file)
        manifest.reference = null;
    if (manifest.music === failure.file)
        manifest.music = null;
    for (const ref of manifest.cast) {
        if (ref.file === failure.file)
            ref.file = null;
    }
    if (manifest.narration?.file === failure.file)
        manifest.narration = null;
    for (const scene of manifest.scenes) {
        const lostWordsSource = (scene.clip === failure.file && scene.wordsFrom === "clip") ||
            (scene.voice === failure.file && scene.wordsFrom === "voice");
        if (scene.clip === failure.file) {
            scene.clip = null;
            scene.revoiced = null;
            scene.speechTrimmed = null;
            scene.rawStorageId = null;
        }
        if (scene.voice === failure.file)
            scene.voice = null;
        if (scene.keyframe === failure.file)
            scene.keyframe = null;
        if (scene.words === failure.file || lostWordsSource) {
            scene.words = null;
            scene.wordsFrom = null;
            scene.wordsDescribe = null;
        }
    }
}
const PULL_CONCURRENCY = 4;
async function runPool(jobs, size) {
    const results = new Array(jobs.length);
    let next = 0;
    const worker = async () => {
        for (;;) {
            const index = next++;
            if (index >= jobs.length)
                return;
            results[index] = await jobs[index]();
        }
    };
    await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker));
    return results;
}
const DOWNLOAD_ATTEMPTS = 2;
async function downloadWithRetry(download, dir, deps) {
    let lastError = "";
    for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
        try {
            await deps.downloadToFile(download.url, path.join(dir, download.file));
            return null;
        }
        catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
        }
    }
    return { file: download.file, url: download.url, error: lastError };
}
const SETUP_LABELS = [
    { key: "set", label: "Set" },
    { key: "cast", label: "Cast" },
    { key: "voices", label: "Voices" },
];
export function missingSetupLabels(progress) {
    if (!progress)
        return [];
    return SETUP_LABELS.filter(({ key }) => progress[key] !== true).map(({ label }) => label);
}
export async function showsFlow(json, deps) {
    const res = await deps.get(SHOWS_PATH);
    if (!res.ok)
        return errorResult(res, json);
    const shows = (res.data.shows ?? []).slice();
    if (json)
        return { code: 0, lines: [JSON.stringify({ shows })] };
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
            const state = show.ready === true
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
export async function startFlow(opts, deps) {
    let script;
    try {
        script = deps.readFile(opts.scriptFile);
    }
    catch (e) {
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
    if (!res.ok)
        return errorResult(res, opts.json);
    const started = res.data;
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
export async function waitFlow(runId, opts, deps) {
    const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
    const maxPolls = opts.maxPolls ?? MAX_POLLS;
    const lines = [];
    let lastStage = null;
    for (let poll = 0; poll < maxPolls; poll++) {
        if (poll > 0)
            await deps.sleep(interval);
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
                if (!opts.json)
                    lines.push(`Working: ${stageWord(stop.stage)}…`);
            }
            continue;
        }
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
const ITEM_STATUS_WORD = {
    done: "done",
    failed: "failed",
    running: "working",
    idle: "waiting",
    skipped: "skipped",
};
function itemWord(item) {
    if (!item)
        return "—";
    if (item.staleClaim === true)
        return "stopped";
    if (item.flagged === true)
        return "flagged";
    return ITEM_STATUS_WORD[item.status] ?? item.status;
}
const CARRYING_ON_LINE = "Waiting for a worker to carry on. Everything finished so far is kept — the run picks up from there by itself.";
function carryingOn(run) {
    return (run.status === "queued" &&
        run.nodes.some((n) => n.status !== "idle" && n.status !== "out-of-scope"));
}
export async function statusFlow(runId, json, deps) {
    const runRes = await deps.get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!runRes.ok)
        return errorResult(runRes, json);
    const run = asVideoRun(runRes.data);
    const itemsRes = await deps.get(`${ITEMS_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!itemsRes.ok)
        return errorResult(itemsRes, json);
    const items = itemsRes.data.items ?? [];
    const hasFinal = hasAttachedCut(items);
    const stop = resolveStop(classifyRun(run), hasFinal);
    const guidance = stopLines(stop, runId, reviewUrl(deps.dashboardUrl, run));
    const warnings = run.nodes
        .filter((n) => n.warning)
        .map((n) => ({ nodeId: n.nodeId, step: n.kind, warning: n.warning }));
    if (json) {
        return {
            code: 0,
            lines: [
                JSON.stringify({ runId, status: run.status, stop, items, hasFinal, warnings, guidance }),
            ],
        };
    }
    const revoicedByScene = new Set();
    const timedOnOriginalVoice = new Set();
    for (const artifact of outputsOfNodeKind(run, "video")) {
        if (artifact.type === "video" && artifact.revoiced === true && typeof artifact.sceneIndex === "number") {
            revoicedByScene.add(artifact.sceneIndex);
            if ((artifact.words?.length ?? 0) > 0)
                timedOnOriginalVoice.add(artifact.sceneIndex);
        }
    }
    const byScene = new Map();
    const sceneFrameNodeIds = new Set(run.nodes.filter((n) => n.kind === "scene-frames").map((n) => n.nodeId));
    for (const item of items) {
        if (item.itemKind !== "clip" && item.itemKind !== "voiceover" && item.itemKind !== "frame") {
            continue;
        }
        if (item.sceneIndex < 0)
            continue;
        if (item.itemKind === "frame" && !sceneFrameNodeIds.has(item.nodeId))
            continue;
        const row = byScene.get(item.sceneIndex) ?? {};
        row[item.itemKind] = item;
        byScene.set(item.sceneIndex, row);
    }
    const headline = stop.at === "failed" && stop.repair
        ? `Ad run ${runId} — Stopped, a step failed`
        : `Ad run ${runId} — ${displayRunStatus(run.status)}`;
    const lines = [
        headline,
        ...(carryingOn(run) ? [CARRYING_ON_LINE] : []),
        ...guidance,
        ...(stop.at === "running" && run.pauseAhead ? [pauseAheadLine(run.pauseAhead)] : []),
        ...warnings.map((w) => `Heads-up (${w.step}): ${w.warning}`),
    ];
    if (byScene.size === 0) {
        lines.push("", "No scenes yet — this run hasn't made anything to look at.");
    }
    else {
        lines.push("", "Scene  Clip      Voice     Picture");
        for (const sceneIndex of [...byScene.keys()].sort((a, b) => a - b)) {
            const row = byScene.get(sceneIndex);
            lines.push(`${String(sceneIndex).padEnd(5)}  ${itemWord(row.clip).padEnd(8)}  ${itemWord(row.voiceover).padEnd(8)}  ${itemWord(row.frame)}`);
            if (row.clip?.lastRedo)
                lines.push(`       clip: ${row.clip.lastRedo.label}`);
            if (row.voiceover?.lastRedo)
                lines.push(`       voice: ${row.voiceover.lastRedo.label}`);
            if (row.frame?.lastRedo)
                lines.push(`       picture: ${row.frame.lastRedo.label}`);
            for (const finding of row.clip?.findings ?? []) {
                lines.push(`       ${finding.code} (${finding.severity}): ${finding.detail}`);
                const judgeSeverity = finding.judgeSeverity ?? finding.severity;
                if (finding.judgeDetail) {
                    lines.push(`         checker said (${judgeSeverity}): ${finding.judgeDetail}`);
                }
                else if (judgeSeverity !== finding.severity) {
                    lines.push(`         checker rated it ${judgeSeverity}`);
                }
            }
            if (row.clip?.error)
                lines.push(`       ${row.clip.error}`);
            if (revoicedByScene.has(sceneIndex))
                lines.push("       voice: cast voice applied");
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
    lines.push("", hasFinal && stop.at === "finished"
        ? "Final cut: approved and delivered."
        : hasFinal
            ? `Final cut: uploaded. Approve it with: exodus video approve ${runId}`
            : "Final cut: not uploaded yet.");
    return { code: 0, lines };
}
export async function storyboardFlow(runId, json, deps) {
    const res = await deps.get(`${STORYBOARD_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!res.ok)
        return errorResult(res, json);
    const cards = res.data;
    if (json)
        return { code: 0, lines: [JSON.stringify(cards)] };
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
    for (const warning of cards.warnings ?? [])
        lines.push(`Heads-up: ${warning}`);
    const blocks = cards.blocks ?? [];
    for (const block of blocks) {
        const label = block.family ? `${block.family} block` : `block ${block.blockId}`;
        lines.push("", block.pass === false ? `${label} — needs a look` : label);
        for (const warning of block.warnings ?? [])
            lines.push(`  Heads-up: ${warning}`);
        for (const scene of block.scenes ?? [])
            lines.push(...sceneCardLines(scene));
    }
    const loose = cards.looseScenes ?? [];
    if (loose.length > 0) {
        lines.push("", "Scenes outside any block");
        for (const scene of loose)
            lines.push(...sceneCardLines(scene));
    }
    const voiceRes = await deps
        .get(`${VOICES_PATH}?runId=${encodeURIComponent(runId)}`)
        .catch(() => null);
    if (voiceRes?.ok) {
        const sheet = (voiceRes.data ?? {});
        const cast = Array.isArray(sheet.cast) ? sheet.cast : [];
        const canChange = sheet.canChange !== false;
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
    lines.push("", `approve with: exodus video approve ${runId}`, `send it back: exodus video flag ${runId} --note "what's wrong"`);
    if (cards.framesNodeId) {
        lines.push(`redo one frame: exodus video retry-frame ${runId} --node ${cards.framesNodeId} --scene <n>`);
    }
    return { code: 0, lines };
}
function sceneCardLines(scene) {
    const head = [
        `  Scene ${scene.sceneIndex}`,
        scene.kind ? `(${scene.kind})` : "",
        typeof scene.durationSec === "number" ? `${scene.durationSec}s` : "",
    ]
        .filter(Boolean)
        .join(" ");
    const lines = [head];
    for (const turn of scene.dialogue ?? []) {
        if (!turn.line)
            continue;
        lines.push(turn.speaker ? `    ${turn.speaker}: ${turn.line}` : `    ${turn.line}`);
    }
    if (!scene.dialogue?.length && scene.voText)
        lines.push(`    "${scene.voText}"`);
    if (scene.frame?.imageUrl)
        lines.push(`    picture: ${scene.frame.imageUrl}`);
    else if (scene.frame?.status)
        lines.push(`    picture: ${scene.frame.status}`);
    return lines;
}
export async function approveFlow(runId, opts, deps) {
    const res = await deps.post(APPROVE_PATH, {
        runId,
        ...(opts.approveStaleCut ? { approveStaleCut: true } : {}),
    });
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
    const data = res.data;
    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
    if (opts.json) {
        return { code: 0, lines: [JSON.stringify({ ok: true, runId, warnings, data: res.data })] };
    }
    const voices = data?.voices;
    const summary = voices
        ? voiceSummaryLines(Array.isArray(voices.cast) ? voices.cast : [], Array.isArray(voices.notices) ? voices.notices : [])
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
export async function flagFlow(runId, note, json, deps) {
    const res = await deps.post(FLAG_PATH, { runId, note });
    if (!res.ok)
        return errorResult(res, json);
    const data = res.data;
    if (json)
        return { code: 0, lines: [JSON.stringify({ ok: true, runId, ...data })] };
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
export async function retryFrameFlow(runId, nodeId, sceneIndex, note, json, deps) {
    const res = await deps.post(SCENE_RETRY_PATH, {
        runId,
        nodeId,
        sceneIndex,
        ...(note ? { note } : {}),
    });
    if (!res.ok)
        return errorResult(res, json);
    const triggerRunId = res.data.triggerRunId;
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
const UPLOADED_CUT_WARNING = "The cut you already uploaded will not include the new clip. If this redo replaces the clip, " +
    "exodus video approve stops until you pull the pieces again, re-cut and upload again, " +
    "or pass --approve-stale-cut to deliver the cut you uploaded as it is.";
export function planClipRedo(run, items, target) {
    const stop = classifyRun(run);
    const found = findClipRow(run, items, target);
    if ("reason" in found)
        return { ok: false, reason: found.reason };
    const { row, uploadedCut } = found;
    const redoable = row.status === "failed" ||
        row.staleClaim === true ||
        (row.status === "done" && (row.flagged === true || stop.at === "final-watch"));
    if (!redoable) {
        if (row.status === "done") {
            return {
                ok: false,
                reason: `Scene ${target.sceneIndex}'s clip is finished and nothing flagged it. A finished clip ` +
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
function findClipRow(run, items, target) {
    const uploadedCut = hasAttachedCut(items);
    const rows = items.filter((i) => i.itemKind === "clip" &&
        i.sceneIndex === target.sceneIndex &&
        (target.nodeId === undefined || i.nodeId === target.nodeId));
    if (rows.length === 0) {
        return { reason: `Scene ${target.sceneIndex} has no clip to redo.` };
    }
    const nodeIds = [...new Set(rows.map((r) => r.nodeId))];
    if (nodeIds.length > 1) {
        return {
            reason: `Scene ${target.sceneIndex} has a clip on more than one step (${nodeIds.join(", ")}), ` +
                "so say which one: --node <nodeId>.",
        };
    }
    const row = rows[0];
    const node = run.nodes.find((n) => n.nodeId === row.nodeId);
    if (node?.status === "running") {
        return {
            reason: `The "${row.nodeId}" step is still making other scenes. Try again once it has finished ` +
                `(exodus video status ${run._id}).`,
        };
    }
    if (node && node.status !== "done") {
        return {
            reason: `The "${row.nodeId}" step did not finish (it is "${node.status}"), ` +
                "and one clip can only be redone on a step that finished.",
        };
    }
    if (row.status === "running" && row.staleClaim !== true) {
        return { reason: `Scene ${target.sceneIndex} is already being redone.` };
    }
    return { row, uploadedCut };
}
export async function retryClipFlow(runId, target, note, json, deps) {
    const runRes = await deps.get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!runRes.ok)
        return errorResult(runRes, json);
    const run = asVideoRun(runRes.data);
    const itemsRes = await deps.get(`${ITEMS_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!itemsRes.ok)
        return errorResult(itemsRes, json);
    const items = itemsRes.data.items ?? [];
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
    if (!res.ok)
        return errorResult(res, json);
    const triggerRunId = res.data.triggerRunId;
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
function clipIsStillRaw(item) {
    const a = item.artifact;
    return ((item.status === "done" || item.staleClaim === true) &&
        a?.type === "video" &&
        a.revoiced !== true &&
        a.speechTrimmed !== true &&
        a.tailTrimmed !== true);
}
const VOICE_NOT_CHANGED_CODES = new Set(["voice-unpinned", "voice-not-applied"]);
export const VOICE_PATHS_NEVER_HEARD = new Set(["native-prompt", "omni-audio-ids", "gemini-direct"]);
async function neverHeardRunLine(runId, deps) {
    const res = await deps
        .get(`${VOICES_PATH}?runId=${encodeURIComponent(runId)}`)
        .catch(() => null);
    if (!res?.ok)
        return null;
    const path = res.data?.treatment?.path;
    if (typeof path !== "string" || !VOICE_PATHS_NEVER_HEARD.has(path))
        return null;
    return (`This run's clips are not voiced by ElevenLabs — the "${path}" way settles each voice as ` +
        "the clip is rendered — so no clip on this run has a voice pass to redo. Nothing was queued " +
        "and nothing was spent. To make a clip again from scratch, redo the clip instead.");
}
export function planClipRevoice(run, items, target) {
    const found = findClipRow(run, items, target);
    if ("reason" in found)
        return { ok: false, reason: found.reason };
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
            reason: `Scene ${target.sceneIndex}'s clip has already been through the voice pass, ` +
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
function sceneListWords(sceneIndexes) {
    if (sceneIndexes.length === 1)
        return `Scene ${sceneIndexes[0]}`;
    return `Scenes ${sceneIndexes.slice(0, -1).join(", ")} and ${sceneIndexes[sceneIndexes.length - 1]}`;
}
export async function revoiceFlow(runId, target, json, deps) {
    const runRes = await deps.get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!runRes.ok)
        return errorResult(runRes, json);
    const run = asVideoRun(runRes.data);
    const itemsRes = await deps.get(`${ITEMS_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!itemsRes.ok)
        return errorResult(itemsRes, json);
    const items = itemsRes.data.items ?? [];
    const targets = "all" in target
        ? items
            .filter((i) => i.itemKind === "clip" &&
            clipIsStillRaw(i) &&
            (i.findings ?? []).some((f) => VOICE_NOT_CHANGED_CODES.has(f.code)))
            .sort((a, b) => a.sceneIndex - b.sceneIndex)
            .map((i) => ({ sceneIndex: i.sceneIndex, nodeId: i.nodeId }))
        : [target];
    if (targets.length === 0) {
        const note = (await neverHeardRunLine(runId, deps)) ??
            "No clip on this run is waiting for a voice pass, so nothing was started.";
        return {
            code: 0,
            lines: json ? [JSON.stringify({ ok: true, runId, scenes: [], note })] : [note],
        };
    }
    const scenes = [];
    const warnings = new Set();
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
                triggerRunId: res.data.triggerRunId,
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
    const refusedWith = new Map();
    for (const r of scenes) {
        if (!r.ok)
            refusedWith.set(r.error, [...(refusedWith.get(r.error) ?? []), r.sceneIndex]);
    }
    const sceneLines = scenes.flatMap((r) => {
        if (r.ok) {
            return [
                `Scene ${r.sceneIndex}: redoing the voice on ${r.nodeId}. triggerRunId: ${r.triggerRunId ?? "-"}`,
            ];
        }
        const sharing = refusedWith.get(r.error) ?? [];
        if (sharing[0] !== r.sceneIndex)
            return [];
        return [`${sceneListWords(sharing)}: not started. ${r.error}`];
    });
    if (queued === 0)
        return { code, lines: sceneLines };
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
export function parseVoiceFlags(occurrences, readFile) {
    const fromFile = {};
    const typed = {};
    let asked = false;
    const valueFor = (occurrence) => {
        if (occurrence.value === undefined)
            throw new Error(`--${occurrence.flag} needs a value.`);
        return occurrence.value;
    };
    for (const occurrence of occurrences) {
        if (occurrence.flag === "set") {
            const raw = valueFor(occurrence);
            const eq = raw.lastIndexOf("=");
            if (eq <= 0 || eq === raw.length - 1) {
                throw new Error("--set must look like <character>=<voice id>, for example " +
                    `--set C1=abc123voiceid (got "${raw}").`);
            }
            typed[raw.slice(0, eq).trim()] = raw.slice(eq + 1).trim();
            asked = true;
        }
        else if (occurrence.flag === "clear") {
            const raw = valueFor(occurrence);
            if (!raw.trim())
                throw new Error("--clear needs a character, for example --clear C1.");
            typed[raw.trim()] = null;
            asked = true;
        }
        else if (occurrence.flag === "from") {
            const file = valueFor(occurrence);
            let parsed;
            try {
                parsed = JSON.parse(readFile(file));
            }
            catch {
                throw new Error(`Could not read ${file} as a list of characters and voice IDs.`);
            }
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                throw new Error(`Could not read ${file} as a list of characters and voice IDs.`);
            }
            Object.assign(fromFile, parsed);
            asked = true;
        }
    }
    if (!asked)
        return null;
    const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const merged = {};
    for (const [who, choice] of Object.entries(fromFile)) {
        if (!Object.keys(typed).some((t) => sameName(t, who)))
            merged[who] = choice;
    }
    return { ...merged, ...typed };
}
export async function voicesFlow(runId, voices, json, deps) {
    const res = voices
        ? await deps.post(VOICES_PATH, { runId, voices })
        : await deps.get(`${VOICES_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!res.ok)
        return errorResult(res, json);
    const sheet = res.data;
    if (json)
        return { code: 0, lines: [JSON.stringify({ ok: true, ...sheet })] };
    return { code: 0, lines: voiceSheetLines(sheet) };
}
function availabilityWords(row) {
    if (!row.voice)
        return row.description ? "voice written below" : "no voice yet";
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
function voiceWords(row) {
    const voice = row.voice;
    if (!voice)
        return "—";
    const words = voice.label ? `${voice.label} (${voice.voiceId})` : voice.voiceId;
    return row.voiceFrom === "run-default" ? `${words}, the run's default voice` : words;
}
function voiceSummaryLines(cast, notices) {
    const rows = cast.filter((row) => row.spokenScenes > 0 || row.voice !== null);
    const width = Math.max(0, ...rows.map((row) => row.name.length));
    const lines = rows.length > 0 ? ["Voices"] : [];
    for (const row of rows) {
        lines.push(row.voice
            ? `  ${row.name.padEnd(width)}  →  ${voiceWords(row)}  ${availabilityWords(row)}`
            : `  ${row.name.padEnd(width)}  →  no voice chosen (keeps the generated voice)`);
    }
    for (const notice of notices)
        lines.push(`Heads-up: ${notice}`);
    return lines;
}
export function voiceSheetLines(sheet) {
    const lines = [`Voices for run ${sheet.runId}`];
    if (typeof sheet.treatment.path === "string" && sheet.treatment.path !== "") {
        lines.push(`  Treatment: ${sheet.treatment.path}`);
    }
    if (sheet.cast.length === 0)
        lines.push("  Nobody is in this ad yet.");
    for (const row of sheet.cast) {
        const voice = voiceWords(row);
        lines.push(`  ${row.characterId}  ${row.name}  ${voice}  ${availabilityWords(row)}  ` +
            `speaks in ${row.spokenScenes} scene${row.spokenScenes === 1 ? "" : "s"}, ` +
            `about ${row.spokenSeconds}s`);
        if (row.description)
            lines.push(`      written voice: ${row.description}`);
    }
    if (sheet.narrator) {
        const label = sheet.narrator.label ? `${sheet.narrator.label} ` : "";
        lines.push(`  Narrator  ${label}(${sheet.narrator.voiceId})  set on the workflow, not here`);
    }
    if (sheet.changed) {
        lines.push(sheet.changed.length > 0
            ? `Changed: ${sheet.changed.join(", ")}. Pictures and script were not touched.`
            : "Nothing changed — those voices were already set. Pictures and script were not touched.");
    }
    lines.push(`How voices are applied: ${sheet.treatment.summary}${sheet.treatment.speedChange ? "" : " No speed change."}`);
    const playsPinnedVoices = sheet.treatment.kind !== "render-owns-voice";
    const convertsClips = playsPinnedVoices && sheet.treatment.usage.clips > 0;
    if (convertsClips || sheet.treatment.usesElevenLabs === undefined) {
        lines.push(`Cost: billed to your own ElevenLabs key. ${sheet.treatment.costNote} ` +
            `About ${sheet.treatment.usage.seconds} seconds of speech across ` +
            `${sheet.treatment.usage.clips} clips will be converted.`);
    }
    else if (sheet.treatment.usesElevenLabs) {
        lines.push("Cost: the narration on this run is voiced by ElevenLabs and billed to your own key. " +
            `${sheet.treatment.costNote} The clips themselves are not converted.`);
    }
    for (const notice of sheet.notices)
        lines.push(notice);
    lines.push(sheet.canChange
        ? "You can still change voices until you approve the storyboard."
        : (sheet.whyNot ?? "Voices can no longer be changed on this run."));
    return lines;
}
export async function pullFlow(runId, dir, json, deps) {
    const runRes = await deps.get(`${RUN_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!runRes.ok)
        return errorResult(runRes, json);
    const run = asVideoRun(runRes.data);
    const itemsRes = await deps.get(`${ITEMS_PATH}?runId=${encodeURIComponent(runId)}`);
    if (!itemsRes.ok)
        return errorResult(itemsRes, json);
    const items = itemsRes.data.items ?? [];
    const plan = planPull(run, items, {
        pulledAt: new Date(deps.now()).toISOString(),
        dashboardUrl: deps.dashboardUrl,
    });
    deps.mkdirp(dir);
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
    const failures = await runPool(plan.downloads.map((download) => () => downloadWithRetry(download, dir, deps)), PULL_CONCURRENCY);
    for (const failure of failures) {
        if (failure)
            markPullFailure(plan.manifest, failure);
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
        lines.push("", `${flagged.length} clip${flagged.length === 1 ? "" : "s"} came back flagged — usable, but look before you cut:`);
        for (const scene of flagged) {
            lines.push(`  scene ${scene.sceneIndex}: ${scene.findings.map((f) => f.code).join(", ") || "flagged"}`);
        }
    }
    if (failed.length > 0) {
        lines.push("", `${failed.length} file${failed.length === 1 ? "" : "s"} did not download:`);
        for (const failure of failed)
            lines.push(`  ${failure.file}: ${failure.error}`);
        lines.push("Run the same command again to retry just those.");
    }
    lines.push("", `When your cut is ready: exodus video upload ${runId} --file cut.mp4`);
    return { code: failed.length > 0 ? 1 : 0, lines };
}
const BOX_HEADER = 8;
const BOX_HEADER_64 = 16;
const FULL_BOX_PREAMBLE = 4;
const MVHD_FIELDS = {
    0: { timescale: 8, duration: 12, end: 16 },
    1: { timescale: 16, duration: 20, end: 28 },
};
const MVHD_UNKNOWN_V0 = 0xffffffff;
const MVHD_UNKNOWN_V1 = 0xffffffffffffffffn;
const MAX_BOX_DEPTH = 4;
export function parseMvhdDurationSec(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const walk = (start, end, depth) => {
        if (depth > MAX_BOX_DEPTH)
            return null;
        let p = start;
        while (p + BOX_HEADER <= end) {
            let size = view.getUint32(p);
            let header = BOX_HEADER;
            const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
            if (size === 1) {
                if (p + BOX_HEADER_64 > end)
                    return null;
                size = Number(view.getBigUint64(p + BOX_HEADER));
                header = BOX_HEADER_64;
            }
            else if (size === 0) {
                size = end - p;
            }
            if (size < header || p + size > end)
                return null;
            if (type === "mvhd") {
                const version = bytes[p + header];
                if (version !== 0 && version !== 1)
                    return null;
                const fields = MVHD_FIELDS[version];
                const base = p + header + FULL_BOX_PREAMBLE;
                if (base + fields.end > p + size)
                    return null;
                const timescale = view.getUint32(base + fields.timescale);
                if (timescale === 0)
                    return null;
                if (version === 1) {
                    const raw = view.getBigUint64(base + fields.duration);
                    if (raw === 0n || raw === MVHD_UNKNOWN_V1)
                        return null;
                    return Number(raw) / timescale;
                }
                const raw = view.getUint32(base + fields.duration);
                if (raw === 0 || raw === MVHD_UNKNOWN_V0)
                    return null;
                return raw / timescale;
            }
            if (type === "moov") {
                const found = walk(p + header, p + size, depth + 1);
                if (found !== null)
                    return found;
            }
            p += size;
        }
        return null;
    };
    return walk(0, bytes.byteLength, 0);
}
export const NO_DURATION_MESSAGE = "Can't tell how long this cut is.\n" +
    "Install ffmpeg (which brings ffprobe), or pass the length yourself: --duration <seconds>";
const MB = 1024 * 1024;
const UPLOAD_ATTEMPTS = 3;
const UPLOAD_BACKOFF_MS = [500, 1500];
const UPLOAD_STEP_LABEL = {
    mint: "asking the server for an upload slot",
    store: "sending the file to storage",
    register: "registering the uploaded file",
    attach: "attaching the cut to the run",
};
export function describeFetchFailure(err) {
    if (!(err instanceof Error))
        return String(err);
    const parts = [];
    let cause = err.cause;
    for (let depth = 0; depth < 2 && cause && typeof cause === "object"; depth++) {
        const level = cause;
        const code = typeof level.code === "string" && level.code ? level.code : undefined;
        const message = typeof level.message === "string" && level.message ? level.message : undefined;
        if (code && message)
            parts.push(`${code}: ${message}`);
        else if (code)
            parts.push(code);
        else if (message)
            parts.push(message);
        cause = level.cause;
    }
    return parts.length > 0 ? `${err.message} (${parts.join("; ")})` : err.message;
}
async function withUploadRetry(step, deps, fn) {
    let cause = "";
    for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
        try {
            return { ok: true, value: await fn() };
        }
        catch (e) {
            cause = describeFetchFailure(e);
            const wait = UPLOAD_BACKOFF_MS[attempt - 1];
            if (attempt < UPLOAD_ATTEMPTS && wait !== undefined)
                await deps.sleep(wait);
        }
    }
    return { ok: false, step, attempts: UPLOAD_ATTEMPTS, cause };
}
function uploadRetryResult(failed, json) {
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
export async function uploadFlow(runId, filePath, durationFlag, json, deps) {
    const stat = deps.statFile(filePath);
    if (!stat)
        return { code: 1, lines: [`No such file: ${filePath}`] };
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
    let asked = null;
    if (durationFlag !== undefined) {
        asked = Number.parseFloat(durationFlag);
        if (!Number.isFinite(asked) || asked <= 0) {
            return { code: 1, lines: [`--duration must be a number of seconds, not "${durationFlag}".`] };
        }
    }
    let bytes;
    try {
        bytes = deps.readFileBytes(filePath);
    }
    catch (e) {
        return {
            code: 1,
            lines: [`Can't read "${filePath}": ${e instanceof Error ? e.message : String(e)}`],
        };
    }
    const durationSec = asked ?? deps.probeDurationSec(filePath) ?? parseMvhdDurationSec(bytes);
    if (durationSec === null)
        return { code: 1, lines: [NO_DURATION_MESSAGE] };
    const minting = await withUploadRetry("mint", deps, () => deps.post(ASSET_UPLOAD_URL_PATH, {}));
    if (!minting.ok)
        return uploadRetryResult(minting, json);
    const mint = minting.value;
    if (!mint.ok)
        return errorResult(mint, json);
    const minted = mint.data;
    const uploadUrl = minted.uploadUrl;
    const receiptId = minted.receiptId;
    if (!uploadUrl || !receiptId) {
        return { code: 1, lines: ["The server did not hand back a place to upload to."] };
    }
    const storing = await withUploadRetry("store", deps, () => deps.uploadBytes(uploadUrl, mime, bytes));
    if (!storing.ok)
        return uploadRetryResult(storing, json);
    const put = storing.value;
    if (!put.ok || !put.storageId) {
        const detail = put.body ? `: ${put.body.slice(0, 200)}` : "";
        return { code: 1, lines: [`Upload failed (HTTP ${put.status})${detail}`] };
    }
    const storageId = put.storageId;
    const registering = await withUploadRetry("register", deps, () => deps.post(ASSETS_PATH, {
        storageId,
        receiptId,
        filename: path.basename(filePath),
    }));
    if (!registering.ok)
        return uploadRetryResult(registering, json);
    const registered = registering.value;
    if (!registered.ok)
        return errorResult(registered, json);
    const asset = registered.data;
    const assetId = asset.assetId;
    if (!assetId) {
        return { code: 1, lines: ["The server stored the file but did not say what to call it."] };
    }
    const attaching = await withUploadRetry("attach", deps, () => deps.post(FINAL_PATH, {
        runId,
        assetId,
        durationSec,
    }));
    if (!attaching.ok)
        return uploadRetryResult(attaching, json);
    const attached = attaching.value;
    if (!attached.ok)
        return errorResult(attached, json);
    const final = attached.data;
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
export function parsePositional(args = process.argv.slice(3)) {
    const out = [];
    let i = 0;
    while (i < args.length) {
        const arg = args[i];
        if (arg.startsWith("--")) {
            const key = arg.slice(2).split("=", 1)[0] ?? "";
            if (!arg.includes("=") && VALUE_FLAGS.has(key))
                i += 2;
            else
                i++;
            continue;
        }
        out.push(arg);
        i++;
    }
    return out;
}
function flagString(flags, name) {
    const value = flags[name];
    return typeof value === "string" ? value : undefined;
}
async function printResult(result) {
    for (const line of result.lines)
        console.log(line);
    if (result.code !== 0)
        process.exit(result.code);
}
function usage(line) {
    console.error(`Error: ${line}`);
    process.exit(1);
}
export async function run(flags, occurrences) {
    const [sub, ...rest] = parsePositional();
    const json = flags["json"] === true;
    if (!sub) {
        console.log(helpText);
        return;
    }
    if (sub === "shows")
        return printResult(await showsFlow(json, defaultDeps));
    if (sub === "start") {
        const showId = flagString(flags, "show");
        const scriptFile = flagString(flags, "script");
        if (!showId)
            usage("video start needs --show <id>. List them with: exodus video shows");
        if (!scriptFile)
            usage("video start needs --script <file>, a text file of what the ad says.");
        return printResult(await startFlow({
            showId,
            scriptFile,
            voicePath: flagString(flags, "voice-path"),
            music: flags["music"] === false ? false : undefined,
            wait: flags["wait"] === true,
            json,
        }, defaultDeps));
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
    if (sub === "status")
        return printResult(await statusFlow(runId, json, defaultDeps));
    if (sub === "storyboard")
        return printResult(await storyboardFlow(runId, json, defaultDeps));
    if (sub === "approve") {
        return printResult(await approveFlow(runId, { json, approveStaleCut: flags["approve-stale-cut"] === true }, defaultDeps));
    }
    if (sub === "flag") {
        const note = flagString(flags, "note");
        if (!note)
            usage('video flag needs --note "<what is wrong>".');
        return printResult(await flagFlow(runId, note, json, defaultDeps));
    }
    if (sub === "retry-frame") {
        const nodeId = flagString(flags, "node");
        if (!nodeId)
            usage("video retry-frame needs --node <nodeId>.");
        const sceneRaw = flagString(flags, "scene");
        if (sceneRaw === undefined) {
            usage("video retry-frame needs --scene <n>, the scene index to redo.");
        }
        const sceneIndex = Number(sceneRaw);
        if (!Number.isFinite(sceneIndex)) {
            usage("video retry-frame --scene must be a number.");
        }
        return printResult(await retryFrameFlow(runId, nodeId, sceneIndex, flagString(flags, "note"), json, defaultDeps));
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
        return printResult(await retryClipFlow(runId, { sceneIndex, nodeId: flagString(flags, "node") }, flagString(flags, "note"), json, defaultDeps));
    }
    if (sub === "revoice") {
        const sceneRaw = flagString(flags, "scene");
        const all = flags["all"] === true;
        if (all === (sceneRaw !== undefined)) {
            usage("video revoice needs one of --scene <n> (one clip) or --all (every clip that kept the video model's voice).");
        }
        if (all)
            return printResult(await revoiceFlow(runId, { all: true }, json, defaultDeps));
        const sceneIndex = Number(sceneRaw);
        if (!Number.isInteger(sceneIndex)) {
            usage(`video revoice --scene must be a whole scene number, not "${sceneRaw}".`);
        }
        return printResult(await revoiceFlow(runId, { sceneIndex, nodeId: flagString(flags, "node") }, json, defaultDeps));
    }
    if (sub === "voices") {
        let voices;
        try {
            voices = parseVoiceFlags(occurrences, defaultDeps.readFile);
        }
        catch (err) {
            usage(err.message);
        }
        return printResult(await voicesFlow(runId, voices, json, defaultDeps));
    }
    if (sub === "pull") {
        const dir = flagString(flags, "out");
        if (!dir)
            usage("video pull needs --out <dir>, the folder to write the pieces into.");
        return printResult(await pullFlow(runId, dir, json, defaultDeps));
    }
    if (sub === "upload") {
        const file = flagString(flags, "file");
        if (!file)
            usage("video upload needs --file <cut.mp4>.");
        return printResult(await uploadFlow(runId, file, flagString(flags, "duration"), json, defaultDeps));
    }
    console.error(`Unknown subcommand: "${sub}"\n`);
    console.log(helpText);
    process.exit(1);
}
