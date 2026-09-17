---
name: exodus-video
description: Make a video ad with Exodus from the terminal. Start an ad from a Show, read and approve its storyboard, pull every finished piece (per-scene clips, voice tracks, keyframes, word timings, the music bed) to a folder, cut them into one video, and upload the cut back for approval, all through the `npx @aicopycoders/exodus video` command family. Use it whenever the user has invoked Exodus and wants anything to do with a video ad, a Show, an ad run's clips or storyboard, "pull the pieces", "stitch it together", "make the cut", "upload my cut", or checking on a video run ("exodus, start a video ad from this script", "exodus, is my video run done", "exodus, pull the clips for run X and cut them", "exodus, what's wrong with scene 3", "exodus video status"). Also use it when the user ran an `npx @aicopycoders/exodus video` command or the `exodus` hub skill routed here. Video is admin-only: "video isn't enabled for this key" means either the dashboard user lacks the admin role or the run id is wrong, so check the id and then say so; do not retry. Never claim generic video-editing asks ("edit this mp4", "add captions to my reel") without Exodus context; in shared folders those belong to the user's other tools. Static image ads are `exodus-image`; copy is `exodus-write`.
---

# Video: make the pieces, cut the ad, hand it back

Exodus makes the PIECES of a video ad, not the finished ad. From a locked Show
(its cast, rooms and voices, set up on the dashboard) and a script, the run
writes a storyboard, draws one picture per scene, records one voice track per
scene, renders one video clip per scene, and composes a music bed. Then it
parks and waits for a cut. You pull the pieces, cut them into one video with
ffmpeg, and upload the cut. Approving the cut is what makes it the ad.

Your job in this skill is to drive that loop and to make a sound first cut.
Editing craft (captions, pacing, b-roll, sound design) is not here yet; a plain,
correct assembly is the bar.

## Before anything

- `npx @aicopycoders/exodus video --help` is the authoritative flag list. The
  `video` verb is admin-only and hidden from the top-level `--help`; that is
  expected, not a broken install.
- "video isn't enabled for this key" has two causes the CLI cannot tell apart:
  the dashboard user is not an admin on this brand, or the run id does not
  exist. Check the id first; if it is right, the user needs the admin role.
  No flag or retry fixes either.
- Other failures: `npx @aicopycoders/exodus doctor` first, then follow what it prints.
- Cutting needs a full `ffmpeg` build with `ffprobe` and the `libx264`
  encoder on the PATH (`brew install ffmpeg` / `apt install ffmpeg`; the
  script checks and says so). Check before you pull, so the user is not left
  with a folder they cannot use.
- The brand matters: a Show belongs to a brand, so `exodus video shows` lists
  the active brand's Shows. Wrong list means wrong brand; `exodus brand use <slug>`.

## The loop

Run each line as `npx @aicopycoders/exodus video …`; `exodus` below is shorthand.

```operator-guide
exodus video shows                                        which Shows are ready
exodus video start --show <id> --script script.txt --wait  start, wait for the storyboard gate
exodus video storyboard <runId>                           read the scene cards
exodus video approve <runId>                              keep going
exodus video flag <runId> --note "what's wrong"           or send it back
exodus video retry-frame <runId> --node <nodeId> --scene <n>  redo one still at the pixel gate
exodus video status <runId>                               where it is, per scene
exodus video pull <runId> --out ./ad-<runId>              every piece + manifest.json
node .claude/skills/exodus-video/scripts/first-cut.mjs ./ad-<runId>   a plain cut (path from the workspace root)
exodus video upload <runId> --file ./ad-<runId>/cut.mp4   attach it
exodus video approve <runId>                              make it the ad
```

Every command takes `--json`. Read `--json` when you need to decide something
from the output; read the plain form when you are relaying it to the user.

**Where a run can stop.** `start --wait` is silent while it polls, then prints
the stage lines and the stop in one burst. Five stops, each with the exact next
command printed under it:

- storyboard gate: needs `approve` or `flag`.
- final watch: every piece is made; needs `pull`, a cut, and `upload`.
- paused: a builder checkpoint the CLI cannot resolve; open the run's page.
- failed: the run's error is printed and the command exits 1; `status` shows
  how far it got. Tell the user; do not start another run on your own.
- finished: pull what it made.

`status` prints the same stop lines any time, so an agent that lost the
`--wait` terminal picks up from `status` alone. `--wait` gives up after 60
minutes with "Still running after 60 minutes" and exit 0; that is not done,
so check `status` before treating it as finished. Do not poll `status` in a
tight loop; a full run is several minutes.

**What costs money.** `start` creates the run and the storyboard. Approving
the storyboard is the cost gate: it releases the paid rendering of every
picture, voice and clip. `shows`, `status`, `storyboard` and `pull` are free
reads; run them as often as you like. Never start a second run to "retry"
without the user asking; flag the storyboard or tell them what failed instead.

## The script file

Plain text. A `CAST:` block that names the speakers exactly as the Show locked
them, one line per turn, then a `CTA:` block. Keep each turn near 14 words so
a clip stays near 6 seconds. If a line does get truncated in its clip, the
manifest says so (`speech-cutoff`).

```
CAST:
THE EYES — a pair of tired cartoon eyeballs who stare at screens all day
THE SOFTGEL — a cheerful little capsule who knows how to fix that

THE EYES: Ten hours of screens today. Everything looks blurry and dry.
THE SOFTGEL: That's screen strain. Your eyes are begging for a break.

CTA:
THE SOFTGEL: Tap below and give your eyes ClearBlink.
```

## Reading the storyboard gate

`storyboard <runId>` prints one card per scene: who speaks, the line, the
planned duration, and whether its picture is drawn. Read it for the user, then
ask one question: approve, or flag with a note. A flag note is read by the
model that rewrites the storyboard, so make it concrete ("scene 2 should be a
close-up of the softgel, not the eyes"). Do not approve on the user's behalf
unless they told you to run the whole loop unattended.

## What `pull` writes, and what the manifest means

`pull` writes a flat folder and a `manifest.json` that indexes it. The manifest
is the data you decide from; the filenames are its values. Scene numbers are
the run's own (they start at 1; scene 0 in `status` is the reference still).

```
storyboard.json          scene text, order, planned durations, cast looks
reference.<ext>          the reference still the pictures were drawn from
scene-NN.keyframe.<ext>  the picture for scene NN
scene-NN.voice.<ext>     the voice track for scene NN, when one was delivered
                         (a Show whose voices live inside the clips delivers none;
                         on a continuous-narrator run this is a cut of narration.mp3)
narration.mp3            one continuous narrator take for the whole script (#1802),
                         when the run used continuous narration
narration.json           takeHash, voice/model/speed, master-timeline words, scene
                         cut ranges into narration.mp3
scene-NN.<ext>           the clip for scene NN, usually .mp4, voice included
scene-NN.words.json      [{w, s, e}] word timings for the speech in that scene, from
                         the clip's own dialogue or, on a narrated scene, from the
                         voice track (seconds from the start of that file)
music.<ext>              the music bed, composed to the clips' total length
manifest.json            the index below (includes narration { file, timing } when
                         a continuous master landed)
```

`manifest.json`:

```
runId, pulledAt, dashboardUrl        the run and its page
storyboard, reference, music         filenames, or null when not delivered
scenes[]                             one per scene, in order
  sceneIndex, durationSec            the run's number and the clip's real length
  clip, voice, keyframe, words       filenames, or null
  wordsFrom                          clip | voice, which file the word times are
                                     timed against; null when none came
  clipStatus                         done | failed | running | pending | missing
  error                              why the clip failed, when it did
  flagged, findings[]                QC verdict: {check, code, severity: fail|warn, detail}
  qc                                 {verdict, attempts} from the renderer
failed[]                             files that did not download: {file, url, error}
```

How to read it before cutting:

- `clipStatus: "done"` and a `clip` filename: the scene is cuttable.
- `wordsFrom: "voice"` (or narration in the storyboard with no on-camera line):
  a narrated scene. Its clip is picture only; the voice track is the sound.
  Never cut a narrated scene with the clip's own audio.
- Continuous master present (`manifest.narration`): listen to `narration.mp3`
  and the joins between adjacent scene voice files before approving the cut.
  Voice-ID match alone does not prove continuity (#1802).
- `flagged: true` is a warning, not a block. The clip was delivered anyway; the
  findings say what the QC model saw (`wrong-character`, `eyeline-off`,
  `set-drift`, `speech-cutoff`, `framing-off`). Tell the user which scenes are
  flagged and why, and let them decide whether to keep, trim, or drop each one.
  A `speech-cutoff` on the CTA scene is the one to worry about; the ad's last
  words are missing.
- `clipStatus: "failed"` or `"missing"` with a `keyframe`: `durationSec` is
  null (it comes from the clip), but the scene can still hold its place as a
  still picture for the length of its voice track, or the storyboard's planned
  duration when there is no voice. The first-cut script does this by itself.
- `clipStatus: "running"` or `"pending"`: pull again later. `status` says when
  the run parks at the final watch, which means nothing is still rendering.
- `failed[]` non-empty: run the same `pull` again. It fetches every file again
  and overwrites, so nothing is lost; the new manifest says what still failed.

## Making the first cut

Use the bundled script. It reads the manifest, puts every A-roll scene in order
as the spine, lays each cutaway over the spine at the moment its line is spoken,
normalizes everything to 1080x1920 at 24 fps, and writes one MP4 with faststart
for upload. The audio track comes first: a narrated scene (narration in the
storyboard, no on-camera line) plays its voice track and nothing the clip
recorded, and the picture is fitted to the voice (a longer clip is trimmed, a
longer voice is sped up to at most 1.26x and then the last frame holds). A
dialogue scene keeps the line it performed. Every segment is loudness-normalized
to -16 LUFS, a continuous room-tone bed runs under the whole ad so the joins do
not read as dead air, and the music bed sits underneath at a low level. The path
is from the workspace root; from a brand subfolder, prefix `../`:

```
node .claude/skills/exodus-video/scripts/first-cut.mjs ./ad-<runId>
node .claude/skills/exodus-video/scripts/first-cut.mjs ./ad-<runId> --skip 2,5 --no-music --out ./v2.mp4
```

It prints what went in, what was left out and why, and the upload command.
Reach for raw ffmpeg only when the user wants something the script does not do
(a trim, a reorder, a different aspect). When you do, keep the script's output
contract: H.264 + AAC in an MP4, an even-sized frame, `-movflags +faststart`.

### The word times that come out with the cut

Nothing burns captions into the video. Captions belong in post, in whatever tool
the editor uses, so the script hands those tools the timings instead. Beside the
MP4 it writes two files named from the same basename. `cut.words.json` is every
spoken word of the finished ad with its start and end in seconds. `cut.srt` is
the same words grouped into short subtitle lines. `--out v2.mp4` names them
`v2.words.json` and `v2.srt`.

The times are on the finished ad's timeline, so a word's time is where you hear
it in the MP4. Cutaways contribute nothing, because their audio never plays. A
narrated scene counts even when it is only a picture and a voice track: its word
times come from the voice track, and `manifest.json` says `wordsFrom: "clip"` or
`"voice"` per scene so you can tell which file a scene's times were read off. A
scene that came with no word times leaves a gap, and the report names it. When no
scene delivered word times the script writes neither file and says so. Tell the
user the two files exist and that they are what the editor imports for captions.

### Where a cutaway lands

The storyboard marks some scenes `kind: "cutaway"` and gives each one a
`cueLineId`, the script line the cutaway belongs to. A cutaway is a picture-only
takeover. It replaces the picture for its own length while the spoken track
underneath keeps running, so it never takes a place in the running order and
never adds audio. That is why the cut is as long as the A-roll scenes alone. A
cutaway is cut short where the next cutaway starts or where the ad ends, and
the report says so.

The script places each cutaway at the real time its cued line is spoken. It
finds the A-roll scene whose `lineIds` hold the cue line, counts the words of
the lines spoken before it in that scene, and reads that word's start time out
of `scene-NN.words.json`. When the scene has no word times, it falls back to a
proportion, the share of the scene's words that come before the cue line scaled
to the scene's real length. The proportion is an estimate and can land a beat
early or late, so the report names which of the two methods placed each cutaway.

A cutaway whose cue line is spoken by no scene in the cut cannot be placed, so
the script leaves it out and says so. Skipping the A-roll scene that speaks the
cue line does that, and so does a storyboard that never claims the line.

Before uploading, look at what you made: `ffprobe -v error -show_entries
format=duration -of default=nw=1:nk=1 cut.mp4` should be close to the sum of
the scene durations you kept. A cut that is a few seconds long when five clips
went in means a filter dropped inputs; do not upload it.

## Uploading and approving

`upload <runId> --file cut.mp4` accepts MP4, MOV or WebM up to 200 MB. It reads
the length off the file (MP4 headers, or ffprobe for the rest); when it cannot,
it says so and you pass `--duration <sec>`.
It prints the run's page, where the user can watch the cut, and the approve
command. Approve only when the user has seen the cut or told you to run
unattended; `approve` marks the cut as the ad and moves the run to delivery.

## Reporting to the user

Lead with where the run is and what it needs from them. Then, when you pulled
or cut: how many scenes, which are flagged and why in one line each, what you
left out, the cut's length, and the exact command or link for the next step.
Never paste the manifest; summarize it.
