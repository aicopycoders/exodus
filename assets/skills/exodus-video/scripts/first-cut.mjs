#!/usr/bin/env node
// A plain first cut from a folder written by `exodus video pull`: the A-roll
// scenes in the manifest's order make the spine, each cutaway lays over the
// spine at the moment its cued line is spoken, the music bed goes underneath,
// and one MP4 comes out ready to upload.
//
//   node first-cut.mjs <pulled-dir> [--out cut.mp4] [--skip 2,5] [--no-music]
//
// A scene with a clip contributes the clip. A clip with no audio stream gets
// the scene's voice track, or silence. A scene with no clip but a keyframe
// becomes a still for the length of its voice track, else the storyboard's
// planned duration, with the voice if one was delivered. --skip drops scenes.
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
const stereo = "aresample=48000,aformat=channel_layouts=stereo";

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

export function scenePlans(storyboard) {
  const plans = new Map();
  for (const scene of storyboard?.scenes ?? []) {
    if (typeof scene?.sceneIndex !== "number") continue;
    plans.set(scene.sceneIndex, {
      cutaway: CUTAWAY_KINDS.has(scene.kind),
      lineIds: Array.isArray(scene.lineIds) ? scene.lineIds : [],
      cueLineId: typeof scene.cueLineId === "string" ? scene.cueLineId : null,
      durationSec: typeof scene.durationSec === "number" ? scene.durationSec : null,
    });
  }
  return plans;
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

export function buildTimeline({ manifest, storyboard, skip, probe, exists, readWords }) {
  const plans = scenePlans(storyboard);
  const counts = lineWordCounts(storyboard);
  const spine = [];
  const cutaways = [];
  const waiting = [];
  const dropped = [];
  let startSec = 0;

  for (const scene of manifest?.scenes ?? []) {
    const n = scene.sceneIndex;
    const plan = plans.get(n) ?? { cutaway: false, lineIds: [], cueLineId: null, durationSec: null };
    if (skip.has(n)) {
      dropped.push({ n, reason: `scene ${n}: skipped by --skip` });
      continue;
    }
    const nothing = `nothing to cut with (clip ${scene.clipStatus}${scene.error ? `: ${scene.error}` : ""})`;

    if (plan.cutaway) {
      if (exists(scene.clip)) {
        waiting.push({
          sceneIndex: n, source: "clip", file: scene.clip,
          seconds: probe(scene.clip).seconds, cueLineId: plan.cueLineId,
        });
      } else if (exists(scene.keyframe)) {
        waiting.push({
          sceneIndex: n, source: "still", file: scene.keyframe,
          seconds: plan.durationSec ?? 4, cueLineId: plan.cueLineId,
        });
      } else {
        dropped.push({ n, reason: `cutaway ${n}: ${nothing}` });
      }
      continue;
    }

    if (exists(scene.clip)) {
      const clip = probe(scene.clip);
      const voice = clip.hasAudio || !exists(scene.voice) ? null : scene.voice;
      const flag = scene.flagged ? " (flagged)" : "";
      const silent = clip.hasAudio ? "" : voice ? `, silent clip + ${voice}` : ", silent clip";
      spine.push({
        sceneIndex: n, source: "clip", file: scene.clip, seconds: clip.seconds,
        hasAudio: clip.hasAudio, voice, startSec, lineIds: plan.lineIds,
        words: readWords(scene.words), note: `${flag}${silent}`,
      });
      startSec += clip.seconds;
      continue;
    }
    if (exists(scene.keyframe)) {
      const voice = exists(scene.voice) ? scene.voice : null;
      const seconds = voice ? probe(voice).seconds : (plan.durationSec ?? 4);
      spine.push({
        sceneIndex: n, source: "still", file: scene.keyframe, seconds,
        hasAudio: false, voice, startSec, lineIds: plan.lineIds,
        // #1689: on a narrated scene the words are the voice track's, and the
        // voice starts where the segment does, so they need no offset here.
        words: voice ? readWords(scene.words) : null,
        note: `${voice ? ` + ${voice}` : ", silent"} (${seconds.toFixed(1)}s, clip ${scene.clipStatus})`,
      });
      startSec += seconds;
      continue;
    }
    dropped.push({ n, reason: `scene ${n}: ${nothing}` });
  }

  for (const c of waiting) {
    const cue = c.cueLineId ? cueOffsetOnSpine(spine, counts, c.cueLineId) : null;
    if (!cue) {
      const why = c.cueLineId
        ? `${c.cueLineId} is spoken by no scene in the cut`
        : "the storyboard names no cue line";
      dropped.push({ n: c.sceneIndex, reason: `cutaway ${c.sceneIndex}: ${why}` });
      continue;
    }
    cutaways.push({ ...c, startSec: cue.startSec, method: cue.method, spineSceneIndex: cue.spineSceneIndex });
  }
  cutaways.sort((a, b) => a.startSec - b.startSec);
  for (let i = 0; i < cutaways.length; i++) {
    const c = cutaways[i];
    const next = cutaways[i + 1];
    const end = Math.min(startSec, next ? next.startSec : Infinity);
    if (c.startSec + c.seconds > end) {
      c.seconds = Math.max(0, end - c.startSec);
      c.cutShortBy = next && end === next.startSec ? `cutaway ${next.sceneIndex} starts` : "the ad ends";
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

  for (const seg of timeline.spine) {
    const i =
      seg.source === "clip"
        ? addInput("-i", resolve(seg.file))
        : addInput("-loop", "1", "-t", String(seg.seconds), "-i", resolve(seg.file));
    filters.push(`${norm(`${i}:v`)}[v${i}]`);
    if (seg.hasAudio) {
      filters.push(`[${i}:a]${stereo}[a${i}]`);
    } else if (seg.voice) {
      const v = addInput("-i", resolve(seg.voice));
      filters.push(`[${v}:a]${stereo},apad,atrim=0:${seg.seconds}[a${i}]`);
    } else {
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${seg.seconds}[a${i}]`);
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

  let audioLabel = "voice";
  if (music) {
    const m = addInput("-stream_loop", "-1", "-i", music);
    filters.push(`[${m}:a]${stereo},volume=0.18[bed]`);
    filters.push(`[voice][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`);
    audioLabel = "mix";
  }

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
    .map((seg) => `scene ${seg.sceneIndex} (no words.json)`);
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
      "-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", here(file),
    ]).toString();
    const info = JSON.parse(raw);
    return {
      seconds: Number(info.format?.duration ?? 0),
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
  console.log(`Music bed: ${music ?? "none"}`);
  console.log(`Upload it: exodus video upload ${manifest.runId} --file ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
