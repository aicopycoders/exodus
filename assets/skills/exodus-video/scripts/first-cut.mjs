#!/usr/bin/env node
// A plain first cut from a folder written by `exodus video pull`: the A-roll
// scenes in the manifest's order make the spine, each cutaway lays over the
// spine at the moment its cued line is spoken, a room-tone bed and the music
// bed go underneath, and one MP4 comes out ready to upload. A reaction
// cutaway is the exception: it is its own short beat in the spine right after
// its cued line ends, heard with its own sound while the speaker is silent,
// and its sound fades out quietly under the next line rather than stopping.
//
//   node first-cut.mjs <pulled-dir> [--out cut.mp4] [--skip 2,5] [--no-music]
//
// The audio track comes first. A narrated scene (the storyboard gives it
// narration and no on-camera line) plays its voice track and NOTHING the clip
// recorded: the voice replaces the clip's audio, and the picture is fitted to
// the voice, trimmed when the clip runs longer and held on its last frame when
// the voice runs longer. The voice itself is never altered. A dialogue scene
// keeps the audio it performed; at each join its silence before the first word
// and after the last is cut back to a short beat, read from its word times. A
// scene with no clip but a keyframe becomes a still for the length of its voice
// track, else the storyboard's planned duration. Every segment is
// loudness-normalized to -16 LUFS before the join.
// --skip drops scenes.
//
// After the render it writes the whole ad's word times beside the MP4, as
// <out>.words.json and <out>.srt, for captioning in post.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = "usage: first-cut.mjs <pulled-dir> [--out cut.mp4] [--skip 2,5] [--no-music]";
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 24;
const norm = (label) =>
  `[${label}]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
  `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},format=yuv420p`;
/**
 * Edges the cut chooses (join trims, reaction splits, narration lengths) land
 * on whole frames, so the picture runs as long as its sound there and the
 * timeline's times are the cut's times.
 */
const floorFrame = (t) => Math.floor(t * FPS + 1e-6) / FPS;
const ceilFrame = (t) => Math.ceil(t * FPS - 1e-6) / FPS;
const stereo = "aresample=48000,aformat=channel_layouts=stereo";
/**
 * Per-segment loudness, the level every clip was normalized to before the join.
 * loudnorm stamps its output about 0.1 s late (its look-ahead), so a later
 * atrim by time kept that much less sound than picture and every join pulled
 * the sound further ahead (#2387). Re-stamping by sample count undoes it.
 */
const LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,asetpts=N/SR/TB";
/** A fade this short at each edge of a segment's sound stops a hard cut in the room tone clicking. */
const EDGE_FADE_SEC = 0.015;
/** Air after the last spoken word of a narrated scene, so the line lands. */
export const TAIL_AIR_SEC = 0.8;
/** A continuous low bed under the whole ad, so the joins between clips do not read as dead air. */
const ROOM_TONE =
  "anoisesrc=color=brown:amplitude=0.0035:r=48000,highpass=f=60,lowpass=f=900,aformat=channel_layouts=stereo";
const MUSIC_VOLUME = 0.18;
/** The longest a reaction beat holds the spine (#2357); older pulls carry 4 s reaction clips. */
export const REACTION_MAX_SEC = 1.5;
/**
 * A reaction's laugh carries into the next line instead of stopping dead at
 * the join (#2406): it starts well under the speaker, at this share of its own
 * level (about -9 dB), and fades to silence over this long.
 */
export const REACTION_TAIL_SEC = 0.75;
export const REACTION_TAIL_GAIN = 0.35;
/**
 * The air a join keeps around its words (#2388): after one clip's last word, and
 * before the next clip's first, less when the same speaker carries on than when
 * someone new answers.
 */
export const JOIN_TAIL_SEC = 0.15;
export const JOIN_LEAD_SAME_SPEAKER_SEC = 0.1;
export const JOIN_LEAD_NEW_SPEAKER_SEC = 0.25;

/** The word rule the planner sized every line with (scout models.ts wordCount). */
export function wordCount(text) {
  const trimmed = (text ?? "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function lineWordCounts(storyboard) {
  const counts = new Map();
  for (const line of storyboard?.script ?? []) {
    if (typeof line?.lineId === "string") counts.set(line.lineId, wordCount(line.text));
  }
  return counts;
}

const CUTAWAY_KINDS = new Set(["cutaway", "insert"]);

const hasText = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * A narrated scene: on a script-bound storyboard (one that carries the member's
 * script lines) the scene has narration and no on-camera line. That is the same
 * fact the server uses to leave a narrator scene's clip mute and its voice track
 * separate. A storyboard without script lines predates that rule: its voiced
 * clips were lip-synced to the voice on the server, so they keep their own audio.
 */
export function narratedScene(scene, storyboard) {
  const scriptBound = Array.isArray(storyboard?.script) && storyboard.script.length > 0;
  const spoken = (Array.isArray(scene?.dialogue) ? scene.dialogue : []).some(
    (turn) => hasText(turn?.line) || hasText(turn?.text),
  );
  return scriptBound && hasText(scene?.voText) && !spoken;
}

export function scenePlans(storyboard) {
  const plans = new Map();
  for (const scene of storyboard?.scenes ?? []) {
    if (typeof scene?.sceneIndex !== "number") continue;
    const speakers = (Array.isArray(scene.dialogue) ? scene.dialogue : [])
      .filter((turn) => hasText(turn?.line) || hasText(turn?.text))
      .map((turn) => (hasText(turn.speaker) ? turn.speaker.trim() : null));
    plans.set(scene.sceneIndex, {
      firstSpeaker: speakers[0] ?? null,
      lastSpeaker: speakers.at(-1) ?? null,
      cutaway: CUTAWAY_KINDS.has(scene.kind),
      narrated: narratedScene(scene, storyboard),
      lineIds: Array.isArray(scene.lineIds) ? scene.lineIds : [],
      cueLineId: typeof scene.cueLineId === "string" ? scene.cueLineId : null,
      cutawayType: typeof scene.cutawayType === "string" ? scene.cutawayType : null,
      durationSec: typeof scene.durationSec === "number" ? scene.durationSec : null,
    });
  }
  return plans;
}

/**
 * Fit a picture to its voice track. The segment always runs as long as the
 * voice plus a beat of air, to the next whole frame, because the voice is never
 * altered. A clip that runs longer is trimmed; a clip that runs shorter holds
 * its last frame for the difference. A still (no clip) simply runs the voice's length.
 */
export function fitNarration({ clipSeconds, voiceSeconds }) {
  const target = ceilFrame(voiceSeconds + TAIL_AIR_SEC);
  if (clipSeconds === null) return { seconds: target, holdSec: 0, trimmedBy: 0 };
  if (target <= clipSeconds) {
    return { seconds: target, holdSec: 0, trimmedBy: clipSeconds - target };
  }
  return { seconds: target, holdSec: target - clipSeconds, trimmedBy: 0 };
}

export function cueOffsetOnSpine(spine, counts, cueLineId) {
  for (const seg of spine) {
    const idx = seg.lineIds.indexOf(cueLineId);
    if (idx === -1) continue;
    let precedingWords = 0;
    for (let i = 0; i < idx; i++) precedingWords += counts.get(seg.lineIds[i]) ?? 0;
    let totalWords = 0;
    for (const id of seg.lineIds) totalWords += counts.get(id) ?? 0;

    let within = 0;
    let method = "proportion";
    if (seg.words && seg.words.length > 0) {
      within = Math.max(0, seg.words[Math.min(precedingWords, seg.words.length - 1)]?.s ?? 0);
      method = "words";
    } else if (totalWords > 0) {
      within = (precedingWords / totalWords) * seg.seconds;
    }
    within = Math.min(within, seg.seconds);
    return { startSec: seg.startSec + within, method, spineSceneIndex: seg.sceneIndex };
  }
  return null;
}

/**
 * Where a segment's spoken cue line ends, in seconds into the segment, or null
 * when the segment does not speak it. A cue line that closes the segment ends
 * where the segment does.
 */
export function cueEndInSegment(seg, counts, cueLineId) {
  const idx = seg.lineIds.indexOf(cueLineId);
  if (idx === -1) return null;
  if (idx === seg.lineIds.length - 1) return seg.seconds;
  let through = 0;
  let totalWords = 0;
  seg.lineIds.forEach((id, i) => {
    const n = counts.get(id) ?? 0;
    totalWords += n;
    if (i <= idx) through += n;
  });
  if (seg.words && seg.words.length > 0) {
    const last = seg.words[Math.min(Math.max(through - 1, 0), seg.words.length - 1)];
    return Math.min(Math.max(0, last?.e ?? 0), seg.seconds);
  }
  return totalWords > 0 ? (through / totalWords) * seg.seconds : seg.seconds;
}

/**
 * Cut the dead air out of each join between clips that play their own sound: a
 * clip's lead-in silence stacked on the previous clip's tail ran past a second
 * (#2388). Each side comes back to a beat that reads as one conversation, a
 * longer one when someone new answers. Only ever shortens, never into a word,
 * and leaves the ad's first lead-in and last tail alone; a clip whose closing
 * line cues a reaction is not the ad's end, since the beat follows it. Trims
 * land on whole frames so the picture and its sound stay the same length.
 */
function trimJoins(spine, reactionCues) {
  spine.forEach((seg, k) => {
    if (seg.source !== "clip" || seg.audio !== "clip" || !seg.words?.length) return;
    const prev = spine[k - 1];
    const sameSpeaker = Boolean(prev?.lastSpeaker) && prev.lastSpeaker === seg.firstSpeaker;
    const lead = sameSpeaker ? JOIN_LEAD_SAME_SPEAKER_SEC : JOIN_LEAD_NEW_SPEAKER_SEC;
    const firstWord = Math.min(...seg.words.map((w) => w.s));
    const lastWord = Math.max(...seg.words.map((w) => w.e));
    const inSec = prev ? Math.max(0, floorFrame(firstWord - lead)) : 0;
    const endsAd = k === spine.length - 1 && !reactionCues.has(seg.lineIds.at(-1));
    const outSec = endsAd ? seg.seconds : Math.min(seg.seconds, ceilFrame(lastWord + JOIN_TAIL_SEC));
    if (outSec <= inSec) return;
    const how = [];
    if (inSec > 0) how.push(`lead-in trimmed ${inSec.toFixed(2)}s`);
    if (outSec < seg.seconds) how.push(`tail trimmed ${(seg.seconds - outSec).toFixed(2)}s`);
    if (how.length === 0) return;
    seg.inSec = inSec;
    seg.seconds = outSec - inSec;
    seg.words = seg.words.map((w) => ({ ...w, s: w.s - inSec, e: w.e - inSec }));
    seg.note = `${seg.note} (${how.join(", ")})`;
  });
}

const holdFor = (seg) =>
  seg.source === "clip" ? Math.max(0, seg.seconds - Math.max(0, seg.clipSeconds - seg.inSec)) : 0;

/**
 * Put a reaction beat into the spine right after its cue line ends, splitting
 * the segment that speaks it when more lines follow in that segment. Returns
 * the scene that speaks the cue, or null when no segment does.
 */
function placeReaction(spine, counts, reaction) {
  for (let k = 0; k < spine.length; k++) {
    const seg = spine[k];
    if (seg.reaction) continue;
    const cueEnd = cueEndInSegment(seg, counts, reaction.cueLineId);
    if (cueEnd === null) continue;
    const cut = Math.min(seg.seconds, ceilFrame(cueEnd));
    const beat = {
      sceneIndex: reaction.sceneIndex, source: reaction.source, file: reaction.file,
      clipSeconds: reaction.source === "clip" ? reaction.seconds : null, inSec: 0,
      seconds: Math.min(reaction.seconds, REACTION_MAX_SEC), holdSec: 0,
      audio: reaction.hasAudio ? "clip" : "silence", voice: null, words: null, lineIds: [],
      reaction: { cueLineId: reaction.cueLineId, cueSceneIndex: seg.sceneIndex },
    };
    if (cut >= seg.seconds - 0.05) {
      spine.splice(k + 1, 0, beat);
      return seg.sceneIndex;
    }
    const idx = seg.lineIds.indexOf(reaction.cueLineId);
    const head = {
      ...seg, seconds: cut, lineIds: seg.lineIds.slice(0, idx + 1),
      words: seg.words ? seg.words.filter((w) => w.s < cut) : null,
      note: `${seg.note}, until ${reaction.cueLineId} ends at ${cut.toFixed(2)}s`,
    };
    const tail = {
      ...seg, inSec: seg.inSec + cut, seconds: seg.seconds - cut, lineIds: seg.lineIds.slice(idx + 1),
      words: seg.words
        ? seg.words.filter((w) => w.s >= cut).map((w) => ({ ...w, s: w.s - cut, e: w.e - cut }))
        : null,
      note: `${seg.note}, resumed at ${cut.toFixed(2)}s after reaction ${reaction.sceneIndex}`,
    };
    head.holdSec = holdFor(head);
    tail.holdSec = holdFor(tail);
    spine.splice(k, 1, head, beat, tail);
    return seg.sceneIndex;
  }
  return null;
}

/**
 * The sound a reaction beat carries under the next segment (#2406): the clip's
 * own sound past the beat when it has some (older 4 s pulls), else its last
 * stretch replayed, so a clip exactly as long as its beat still fades out.
 */
function reactionTail(seg, next) {
  const clipLen = seg.clipSeconds ?? seg.seconds;
  const beatEnd = seg.inSec + seg.seconds;
  const fromSec = Math.max(0, Math.min(beatEnd, clipLen - REACTION_TAIL_SEC));
  const seconds = Math.min(REACTION_TAIL_SEC, next.seconds, clipLen - fromSec);
  return { atSec: next.startSec, fromSec, seconds, gain: REACTION_TAIL_GAIN };
}

export function buildTimeline({ manifest, storyboard, skip, probe, exists, readWords }) {
  const plans = scenePlans(storyboard);
  const counts = lineWordCounts(storyboard);
  const spine = [];
  const cutaways = [];
  const waiting = [];
  const dropped = [];

  for (const scene of manifest?.scenes ?? []) {
    const n = scene.sceneIndex;
    const plan = plans.get(n) ?? {
      cutaway: false, lineIds: [], cueLineId: null, cutawayType: null, durationSec: null,
      firstSpeaker: null, lastSpeaker: null,
    };
    if (skip.has(n)) {
      dropped.push({ n, reason: `scene ${n}: skipped by --skip` });
      continue;
    }
    const nothing = `nothing to cut with (clip ${scene.clipStatus}${scene.error ? `: ${scene.error}` : ""})`;

    if (plan.cutaway) {
      const cue = { cueLineId: plan.cueLineId, reaction: plan.cutawayType === "reaction" };
      if (exists(scene.clip)) {
        const clip = probe(scene.clip);
        waiting.push({
          sceneIndex: n, source: "clip", file: scene.clip,
          seconds: clip.seconds, hasAudio: clip.hasAudio, ...cue,
        });
      } else if (exists(scene.keyframe)) {
        waiting.push({
          sceneIndex: n, source: "still", file: scene.keyframe,
          seconds: plan.durationSec ?? 4, hasAudio: false, ...cue,
        });
      } else {
        dropped.push({ n, reason: `cutaway ${n}: ${nothing}` });
      }
      continue;
    }

    const narrated = plan.narrated || scene.wordsFrom === "voice";
    const voice = exists(scene.voice) ? scene.voice : null;
    const flag = scene.flagged ? " (flagged)" : "";

    if (exists(scene.clip)) {
      const clip = probe(scene.clip);
      const base = {
        sceneIndex: n, source: "clip", file: scene.clip, clipSeconds: clip.seconds, inSec: 0,
        lineIds: plan.lineIds, firstSpeaker: plan.firstSpeaker, lastSpeaker: plan.lastSpeaker,
      };
      if (voice && (narrated || !clip.hasAudio)) {
        const fit = fitNarration({ clipSeconds: clip.seconds, voiceSeconds: probe(voice).seconds });
        const how = [];
        if (fit.trimmedBy > 0.05) how.push(`clip trimmed ${clip.seconds.toFixed(1)}s -> ${fit.seconds.toFixed(1)}s`);
        if (fit.holdSec > 0.05) how.push(`last frame held ${fit.holdSec.toFixed(1)}s`);
        spine.push({
          ...base, audio: "narration", voice, seconds: fit.seconds,
          holdSec: fit.holdSec, words: readWords(scene.words),
          note: `${flag}, ${voice} replaces the clip's audio${how.length ? ` (${how.join(", ")})` : ""}`,
        });
      } else if (narrated) {
        spine.push({
          ...base, audio: "silence", voice: null, seconds: clip.seconds, holdSec: 0,
          words: null,
          note: `${flag}, narrated scene without its voice track: the clip's own audio is muted`,
        });
      } else if (clip.hasAudio) {
        spine.push({
          ...base, audio: "clip", voice: null, seconds: clip.seconds, holdSec: 0,
          words: readWords(scene.words), note: `${flag}, its own dialogue`,
        });
      } else {
        spine.push({
          ...base, audio: "silence", voice: null, seconds: clip.seconds, holdSec: 0,
          words: null, note: `${flag}, silent clip`,
        });
      }
      continue;
    }
    if (exists(scene.keyframe)) {
      const fit = voice
        ? fitNarration({ clipSeconds: null, voiceSeconds: probe(voice).seconds })
        : { seconds: plan.durationSec ?? 4, holdSec: 0 };
      spine.push({
        sceneIndex: n, source: "still", file: scene.keyframe, clipSeconds: null, inSec: 0,
        seconds: fit.seconds, audio: voice ? "narration" : "silence", voice, holdSec: 0,
        lineIds: plan.lineIds,
        // #1689: on a narrated scene the words are the voice track's, and the
        // voice starts where the segment does, so they need no offset here.
        words: voice ? readWords(scene.words) : null,
        note: `${flag}${voice ? ` + ${voice}` : ", silent"} (${fit.seconds.toFixed(1)}s, clip ${scene.clipStatus})`,
      });
      continue;
    }
    dropped.push({ n, reason: `scene ${n}: ${nothing}` });
  }

  const noCue = (c) =>
    c.cueLineId ? `${c.cueLineId} is spoken by no scene in the cut` : "the storyboard names no cue line";

  // Joins are closed first so a reaction beat lands right after its cue line
  // ends in the trimmed clip. Reactions change the spine, so they go in before
  // any overlay is placed on it.
  trimJoins(spine, new Set(waiting.filter((w) => w.reaction).map((w) => w.cueLineId)));
  for (const c of waiting.filter((w) => w.reaction)) {
    if (!c.cueLineId || placeReaction(spine, counts, c) === null) {
      dropped.push({ n: c.sceneIndex, reason: `cutaway ${c.sceneIndex}: ${noCue(c)}` });
    }
  }
  let total = 0;
  for (const seg of spine) {
    seg.startSec = total;
    total += seg.seconds;
  }
  spine.forEach((seg, k) => {
    const next = spine[k + 1];
    if (!seg.reaction || seg.audio !== "clip" || !next) return;
    seg.reaction.tail = reactionTail(seg, next);
  });

  for (const c of waiting.filter((w) => !w.reaction)) {
    const cue = c.cueLineId ? cueOffsetOnSpine(spine, counts, c.cueLineId) : null;
    if (!cue) {
      dropped.push({ n: c.sceneIndex, reason: `cutaway ${c.sceneIndex}: ${noCue(c)}` });
      continue;
    }
    cutaways.push({ ...c, startSec: cue.startSec, method: cue.method, spineSceneIndex: cue.spineSceneIndex });
  }
  cutaways.sort((a, b) => a.startSec - b.startSec);
  const beats = spine.filter((seg) => seg.reaction);
  for (let i = 0; i < cutaways.length; i++) {
    const c = cutaways[i];
    const stops = [];
    const next = cutaways[i + 1];
    if (next) stops.push({ at: next.startSec, by: `cutaway ${next.sceneIndex} starts` });
    const beat = beats.find((b) => b.startSec >= c.startSec);
    if (beat) stops.push({ at: beat.startSec, by: `reaction ${beat.sceneIndex} starts` });
    stops.push({ at: total, by: "the ad ends" });
    const stop = stops.reduce((a, b) => (b.at < a.at ? b : a));
    if (c.startSec + c.seconds > stop.at) {
      c.seconds = Math.max(0, stop.at - c.startSec);
      c.cutShortBy = stop.by;
    }
  }

  return {
    spine,
    cutaways,
    left: dropped.sort((a, b) => a.n - b.n).map((d) => d.reason),
  };
}

function sec(n) {
  return (Number.isFinite(n) ? Math.max(0, n) : 0).toFixed(3);
}

export function buildFfmpegArgs(timeline, { resolve, music, out }) {
  const inputs = [];
  let count = 0;
  const addInput = (...args) => {
    inputs.push(...args);
    return count++;
  };
  const filters = [];
  const pairs = [];
  const tails = [];

  for (const seg of timeline.spine) {
    const i =
      seg.source === "clip"
        ? addInput("-i", resolve(seg.file))
        : addInput("-loop", "1", "-t", String(seg.seconds), "-i", resolve(seg.file));
    const fit = [];
    const inSec = seg.inSec ?? 0;
    if (seg.source === "clip" && seg.clipSeconds !== null) {
      const shown = seg.seconds - seg.holdSec;
      if (inSec > 0.001 || shown < seg.clipSeconds - 0.01) {
        // By frame number: a time printed to the millisecond can round past the
        // frame it names and drop it.
        const from = Math.round(inSec * FPS);
        fit.push(`trim=start_frame=${from}:end_frame=${Math.round((inSec + shown) * FPS)},setpts=PTS-STARTPTS`);
      }
    }
    if (seg.holdSec > 0.01) fit.push(`tpad=stop_mode=clone:stop_duration=${sec(seg.holdSec)}`);
    filters.push(`${norm(`${i}:v`)}${fit.length ? `,${fit.join(",")}` : ""}[v${i}]`);
    // A segment split around a reaction beat starts partway into its sound too.
    const skipIn = inSec > 0.001 ? `atrim=start=${sec(inSec)},asetpts=PTS-STARTPTS,` : "";
    const fitLength =
      `apad,atrim=0:${sec(seg.seconds)},afade=t=in:d=${EDGE_FADE_SEC},` +
      `afade=t=out:st=${sec(seg.seconds - EDGE_FADE_SEC)}:d=${EDGE_FADE_SEC}`;
    const fitSound = `${LOUDNORM},${fitLength}`;
    if (seg.audio === "narration") {
      const v = addInput("-i", resolve(seg.voice));
      filters.push(`[${v}:a]${stereo},${skipIn}${fitSound}[a${i}]`);
    } else if (seg.audio === "clip" && seg.reaction?.tail) {
      // The tail is cut from the same loudness-normalized sound as the beat,
      // ducked, faded out, and laid in at the join; the next line's own sound
      // plays at full level over it (#2406).
      const t = seg.reaction.tail;
      filters.push(`[${i}:a]${stereo},${skipIn}${LOUDNORM},asplit=2[as${i}][at${i}]`);
      filters.push(`[as${i}]${fitLength}[a${i}]`);
      filters.push(
        `[at${i}]atrim=start=${sec(t.fromSec - inSec)}:duration=${sec(t.seconds)},asetpts=PTS-STARTPTS,` +
          `volume=${t.gain},afade=t=in:d=${EDGE_FADE_SEC},afade=t=out:st=0:d=${sec(t.seconds)},` +
          `adelay=delays=${Math.round(t.atSec * 1000)}:all=1[tail${i}]`,
      );
      tails.push(`[tail${i}]`);
    } else if (seg.audio === "clip") {
      filters.push(`[${i}:a]${stereo},${skipIn}${fitSound}[a${i}]`);
    } else {
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${sec(seg.seconds)}[a${i}]`);
    }
    pairs.push(`[v${i}][a${i}]`);
  }

  // A clip whose audio ends before its video would otherwise end the whole cut
  // there under -shortest; padding lets the video decide the length.
  filters.push(`${pairs.join("")}concat=n=${pairs.length}:v=1:a=1[vcat][voicecat]`);
  filters.push(`[voicecat]apad[voice]`);

  let videoLabel = "vcat";
  timeline.cutaways.forEach((c, j) => {
    const i =
      c.source === "clip"
        ? addInput("-i", resolve(c.file))
        : addInput("-loop", "1", "-t", String(c.seconds), "-i", resolve(c.file));
    const end = c.startSec + c.seconds;
    filters.push(
      `${norm(`${i}:v`)},trim=0:${sec(c.seconds)},setpts=PTS-STARTPTS+${sec(c.startSec)}/TB[cv${j}]`,
    );
    // eof_action=pass keeps the spine showing once the cutaway's frames end.
    filters.push(
      `[${videoLabel}][cv${j}]overlay=enable=between(t\\,${sec(c.startSec)}\\,${sec(end)}):eof_action=pass[ov${j}]`,
    );
    videoLabel = `ov${j}`;
  });

  filters.push(`${ROOM_TONE}[room]`);
  const beds = ["[room]", ...tails];
  if (music) {
    const m = addInput("-stream_loop", "-1", "-i", music);
    filters.push(`[${m}:a]${stereo},volume=${MUSIC_VOLUME}[bed]`);
    beds.push("[bed]");
  }
  filters.push(
    `[voice]${beds.join("")}amix=inputs=${beds.length + 1}:duration=first:dropout_transition=0:normalize=0[mix]`,
  );
  const audioLabel = "mix";

  return [
    "-y", "-hide_banner", "-loglevel", "error",
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", `[${videoLabel}]`, "-map", `[${audioLabel}]`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", "-shortest",
    out,
  ];
}

export function wordRows(timeline) {
  const ms = (n) => Math.round(n * 1000) / 1000;
  const rows = [];
  for (const seg of timeline.spine) {
    for (const w of seg.words ?? []) {
      const text = (w.w ?? "").trim();
      const start = seg.startSec + w.s;
      const end = seg.startSec + w.e;
      if (text && end > start) {
        rows.push({ text, start: ms(start), end: ms(end), scene: seg.sceneIndex });
      }
    }
  }
  return rows;
}

const SRT_MAX_WORDS = 5;
const SRT_GAP_SEC = 1.0;

export function srtCues(rows) {
  const cues = [];
  let cue = [];
  for (let i = 0; i < rows.length; i++) {
    cue.push(rows[i]);
    const next = rows[i + 1];
    const ends =
      !next ||
      /[.!?,;:]$/.test(rows[i].text) ||
      cue.length >= SRT_MAX_WORDS ||
      next.scene !== rows[i].scene ||
      next.start - rows[i].end > SRT_GAP_SEC;
    if (ends) {
      cues.push(cue);
      cue = [];
    }
  }
  return cues;
}

export function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n, width) => String(n).padStart(width, "0");
  return (
    `${pad(Math.floor(ms / 3600000), 2)}:${pad(Math.floor(ms / 60000) % 60, 2)}:` +
    `${pad(Math.floor(ms / 1000) % 60, 2)},${pad(ms % 1000, 3)}`
  );
}

export function toSrt(rows) {
  return srtCues(rows)
    .map((cue, i) => {
      const text = cue.map((r) => r.text).join(" ");
      return `${i + 1}\n${srtTime(cue[0].start)} --> ${srtTime(cue[cue.length - 1].end)}\n${text}\n`;
    })
    .join("\n");
}

export function sidecarPaths(outPath) {
  const dir = path.dirname(outPath);
  const base = path.basename(outPath, path.extname(outPath));
  return { words: path.join(dir, `${base}.words.json`), srt: path.join(dir, `${base}.srt`) };
}

export function inTheCut(timeline) {
  const rows = [];
  for (const seg of timeline.spine) {
    const label = seg.source === "clip" ? seg.file : `still ${seg.file}`;
    if (seg.reaction) {
      const sound = seg.audio === "clip" ? "its own sound" : "silent: the clip has no sound";
      const tail = seg.reaction.tail;
      const fades = tail
        ? `, fading out under the next line at ${tail.atSec.toFixed(2)}s over ${tail.seconds.toFixed(2)}s`
        : "";
      rows.push({
        n: seg.sceneIndex,
        line:
          `reaction ${seg.sceneIndex}: ${label} for ${seg.seconds.toFixed(1)}s after ` +
          `${seg.reaction.cueLineId} in scene ${seg.reaction.cueSceneIndex}, ${sound}${fades}`,
      });
      continue;
    }
    rows.push({ n: seg.sceneIndex, line: `scene ${seg.sceneIndex}: ${label}${seg.note}` });
  }
  for (const c of timeline.cutaways) {
    const label = c.source === "clip" ? c.file : `still ${c.file}`;
    const how =
      c.method === "words"
        ? "word times"
        : `proportion: scene ${c.spineSceneIndex} has no word times`;
    const cut = c.cutShortBy ? `, cut short where ${c.cutShortBy}` : "";
    rows.push({
      n: c.sceneIndex,
      line:
        `cutaway ${c.sceneIndex}: ${label} at ${c.startSec.toFixed(2)}s for ${c.seconds.toFixed(1)}s, ` +
        `cued to ${c.cueLineId} in scene ${c.spineSceneIndex} (${how})${cut}`,
    });
  }
  return rows.sort((a, b) => a.n - b.n).map((r) => r.line);
}

export function noWordTimes(timeline) {
  const rows = timeline.spine
    .filter((seg) => !seg.words || seg.words.length === 0)
    .map((seg) => `scene ${seg.sceneIndex} (${seg.reaction ? "reaction" : "no words.json"})`);
  for (const c of timeline.cutaways) rows.push(`scene ${c.sceneIndex} (cutaway)`);
  return rows;
}

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { dir: undefined, out: undefined, skip: new Set(), music: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") opts.out = argv[++i];
    else if (a === "--skip") opts.skip = new Set((argv[++i] ?? "").split(",").filter(Boolean).map(Number));
    else if (a === "--no-music") opts.music = false;
    else if (a.startsWith("--")) fail(2, `unknown flag ${a}\n${USAGE}`);
    else if (opts.dir === undefined) opts.dir = a;
    else fail(2, `unexpected argument ${a}\n${USAGE}`);
  }
  if (!opts.dir) fail(2, USAGE);
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  for (const bin of ["ffmpeg", "ffprobe"]) {
    if (spawnSync(bin, ["-version"]).status !== 0) {
      fail(2, `${bin} is not installed. Install ffmpeg (brew install ffmpeg / apt install ffmpeg).`);
    }
  }
  const encoders = spawnSync("ffmpeg", ["-hide_banner", "-encoders"]).stdout?.toString() ?? "";
  if (!/\blibx264\b/.test(encoders)) {
    fail(2, "This ffmpeg has no libx264 encoder (H.264). Install a full ffmpeg build: brew install ffmpeg / apt install ffmpeg.");
  }

  const dir = opts.dir;
  const manifestPath = path.join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    fail(2, `${manifestPath} not found. Run: exodus video pull <runId> --out ${dir}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const out = path.resolve(opts.out ?? path.join(dir, "cut.mp4"));
  const here = (file) => path.join(dir, file);
  const exists = (file) => Boolean(file) && existsSync(here(file));

  const readJson = (file) => {
    if (!exists(file)) return null;
    try {
      return JSON.parse(readFileSync(here(file), "utf8"));
    } catch {
      return null;
    }
  };
  const probe = (file) => {
    const raw = execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_type,duration:stream_disposition=attached_pic:format=duration", "-of", "json", here(file),
    ]).toString();
    const info = JSON.parse(raw);
    // A clip's container runs a few ms past its picture on the audio's padding;
    // the picture is what the cut shows, so its length is the clip's length.
    const picture = Number((info.streams ?? []).find((s) => s.codec_type === "video" && !s.disposition?.attached_pic)?.duration);
    return {
      seconds: picture > 0 ? picture : Number(info.format?.duration ?? 0),
      hasAudio: (info.streams ?? []).some((s) => s.codec_type === "audio"),
    };
  };

  const storyboard = readJson(manifest.storyboard);
  if (!storyboard) {
    console.error(`Warning: ${manifest.storyboard ?? "storyboard.json"} is missing or unreadable, so every scene is cut as A-roll and no cutaway is placed.`);
  }
  const timeline = buildTimeline({
    manifest,
    storyboard,
    skip: opts.skip,
    probe,
    exists,
    readWords: (file) => {
      const rows = readJson(file);
      return Array.isArray(rows) && rows.length > 0 ? rows : null;
    },
  });
  if (timeline.spine.length === 0) {
    fail(1, `No scene has a clip or a keyframe. Check: exodus video status ${manifest.runId}`);
  }

  const music = opts.music && exists(manifest.music) ? manifest.music : null;
  const ffmpegArgs = buildFfmpegArgs(timeline, {
    resolve: here,
    music: music ? here(music) : null,
    out,
  });
  const res = spawnSync("ffmpeg", ffmpegArgs, { stdio: "inherit" });
  if (res.status !== 0) {
    const quoted = ffmpegArgs.map((a) => (/[\s\[\];]/.test(a) ? `'${a}'` : a)).join(" ");
    fail(1, `ffmpeg failed. The command it ran:\n  ffmpeg ${quoted}`);
  }

  const rows = wordRows(timeline);
  const sidecars = sidecarPaths(out);
  if (rows.length > 0) {
    writeFileSync(sidecars.words, `${JSON.stringify(rows, null, 2)}\n`);
    writeFileSync(sidecars.srt, toSrt(rows));
  } else {
    rmSync(sidecars.words, { force: true });
    rmSync(sidecars.srt, { force: true });
  }

  const duration = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", out,
  ]).toString().trim();
  console.log(`Wrote ${out} (${Number(duration).toFixed(1)}s, ${WIDTH}x${HEIGHT})`);
  console.log("In the cut:");
  for (const line of inTheCut(timeline)) console.log("  " + line);
  if (timeline.left.length > 0) {
    console.log("Left out:");
    for (const line of timeline.left) console.log("  " + line);
  }
  if (rows.length > 0) {
    const scenes = [...new Set(rows.map((r) => r.scene))].join(", ");
    console.log(
      `Words: ${rows.length} words from scenes ${scenes} -> ${path.basename(sidecars.words)}, ${path.basename(sidecars.srt)}`,
    );
  } else {
    console.log("Words: none delivered, no caption files written");
  }
  const silent = noWordTimes(timeline);
  if (silent.length > 0) console.log(`No word times: ${silent.join(", ")}`);
  console.log(`Room tone: under the whole ad. Music bed: ${music ?? "none"}`);
  console.log(`Upload it: exodus video upload ${manifest.runId} --file ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
