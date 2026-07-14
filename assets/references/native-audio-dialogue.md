# Native-Audio Dialogue — per-model way to make `dialogue` actually get SPOKEN (in English)

**Research date:** 2026-07-13
**For:** Build ticket #547 (send storyboard `dialogue` to the native-audio video models). Feeds map #545.
**Scope:** The four v1 picker models, all via Kie.ai — `veo3_fast` (Veo 3.1 Fast), `veo3` (Veo 3.1 Quality), `bytedance/seedance-2` (Seedance 2.0), `kling-3.0/video` (Kling 3.0).
**Method:** Primary = docs.kie.ai model pages (fetchable), Google's official Veo prompting guide (cloud.google.com + ai.google.dev), fal.ai model guides, Kling official blog (blocked to automated fetch — corroborated via fal + community). Community tricks flagged inline. Builds on the #529 catalog (`workspace/references/kie-video-models.md`) and the #533 bake-off (`workspace/output/bakeoff-533/`).
**Confidence labels:** `[docs]` verified on a first-party API/prompting doc · `[official-guide]` first-party prompting guide (Google/Kling/ByteDance) · `[vendor-guide]` fal.ai / infra vendor guide · `[community]` community-reported, use with caution.

---

## The core problem (confirmed in code)

`buildClipPrompt` in `scout/src/workflow/video/clips.ts` never reads `scene.dialogue`. It only threads `videoPrompt` + `voText` (and `voText` is dropped entirely when native audio is ON). So on a native-audio run the model is told `generate_audio: true` / `sound: true` with **no words to say**, and it invents speech-shaped babble. Every fix below is about getting the `scene.dialogue[]` lines (`{ speaker, line }`, see `convex/lib/workflow/storyboardContract.ts`) into the prompt in the format each family actually speaks — in English, without burning in captions.

**None of the four models accepts spoken dialogue as a structured API field.** On all four, through Kie, dialogue is **in-prompt text only**. (Details in §"Structured audio params".)

---

## TL;DR table

| Family | Dialogue embedding format (recommended) | Force English | Subtitle guard | Structured audio params (Kie) | Pacing guidance |
|---|---|---|---|---|---|
| **Veo 3.1 Fast / Quality** (`veo3_fast`,`veo3`) | Inline attribution **with quotes**, per Google's own guide: `She says, in English: "…"`. Multi-speaker = separate attributed sentences. | Write English inside the quotes **and** add an explicit clause `spoken in English (American accent)`. Keep `enableTranslation:false` (it translates the *prompt* to English and can paraphrase quoted lines). No language param. `[docs]`/`[official-guide]` | **No `negativePrompt` param on Kie's `/veo/generate`** — in-prompt only. Keep `ANTI_SUBTITLE_CORE` first; community: quotes can trigger captions, so the anti-caption clause is load-bearing for Veo. `[docs]`/`[community]` | **None.** Audio always on, not togglable; no voice/reference-audio field. `[docs]` | Keep each line short; dialogue lives inside a 4/6/8s clip. Google: short lines sync best. `[official-guide]` |
| **Seedance 2.0** (`bytedance/seedance-2`) | **Speaker label + colon + double quotes**: `The senior woman, arms crossed, says: "…"`. Short lines; insert written beats (`She pauses, then continues:`) as resync anchors between lines. `[vendor-guide]` | Add per-scene `American accent, conversational tone` + write English text. Mandarin is its most-consistent lip-sync language, so English **must** be stated explicitly or it drifts. `[vendor-guide]`/`[community]` | No first-party subtitle guidance found. Keep `ANTI_SUBTITLE_CORE`. Quoted lines are the documented format, so the core's on-screen-text ban complements (not conflicts). `[community]` | `generate_audio` bool (default true). `reference_audio_urls` (≤3, 2–15s, wav/mp3) exists — a voice/style reference lever, **not** a documented dialogue-content field. `[docs]` | ~**12 words / 10s**, ~**20 words / 15s** (~1.2 wps); sync drops past 10s; record "mental" pace ~80% of natural. **Tighter than the repo's 17 chars/s VO budget.** `[vendor-guide]` |
| **Kling 3.0** (`kling-3.0/video`) | **Bracketed speaker label + tone, colon, quotes**: `[Character A: Exhausted Partner, trembling voice]: "…"`. Consistent labels (no pronouns); for multi-speaker insert a switch beat. `[official-guide]`/`[vendor-guide]` | Specify language in the prompt (`spoken in English`) — helps phoneme mapping. Supports EN natively but also CN/JA/KO/ES, so state it. No language param. `[official-guide]`/`[community]` | No first-party subtitle guidance found. Keep `ANTI_SUBTITLE_CORE`. `[community]` | `sound` bool. `kling_elements[].audio` (5–30s) is an element-level audio lever, not a dialogue-voice field. `[docs]` | Short, single-speaker segments sync best; use Master/`pro` mode when lip-sync is scrutinized; medium shots > extreme close-ups. `[official-guide]` |

---

## Recommended rider / format per API family (implementation-ready for #547)

### Where it slots into the existing rider stack

`buildClipPrompt` today (native audio ON) emits, in order:

1. `ANTI_SUBTITLE_CORE`
2. `MOTION_POLICY`
3. `FIRST_FRAME_RIDER` (if a Scene Frame is wired)
4. `body` (the `videoPrompt`)

**Add a DIALOGUE block as a new final section, ONLY when `nativeAudio === true` AND `scene.dialogue.length > 0`.** Rules:

- Keep `ANTI_SUBTITLE_CORE` **first and unchanged** — it is the only subtitle guard Veo has (no `negativePrompt` param), and its wording bans *on-screen* text ("no dialogue text, no transcript text"), which does not suppress *spoken* audio.
- The dialogue block is **family-specific** (Veo/Seedance/Kling format differently), so it must be built where the family is known. Two clean options:
  - **(A)** Thread `scene.dialogue` + `family` into `buildClipPrompt` and branch there.
  - **(B)** Keep `buildClipPrompt` family-agnostic; in `generateSceneClip` (which already has `spec.family`) append a `buildDialogueBlock(family, scene.dialogue)` string to the returned prompt.
  Recommend **(B)** — smallest change, keeps `buildClipPrompt` pure, and the per-family request builders already live next to it.
- `buildClipPrompt` currently accepts `voText` but **not** `dialogue`. #547 must thread `scene.dialogue` through `generateSceneClip` (it already has the full `scene`).
- When `nativeAudio === false`, do **not** emit dialogue (current behavior — mouths shut, VO track). Unchanged.

### Concrete template strings

Let `LANG = "spoken in English (natural American accent)"`.

**Veo (`veo3_fast`, `veo3`)** — inline, quoted, per Google's guide:
```
DIALOGUE (on-camera, lip-synced, {LANG}; no on-screen captions):
<Speaker A description> says: "<line 1>"
<Speaker B description> replies: "<line 2>"
```
- Single speaker → one attributed sentence.
- Use the storyboard `speaker` string as the attribution ("The woman", "The barista"). Quotes around the exact words per Google's official example: `A woman says, "We have to leave now."`
- Do **not** set `enableTranslation:true` (it translates/paraphrases the prompt to English and can rewrite the quoted line). Current code already sends `enableTranslation:false` — keep it.

**Seedance (`bytedance/seedance-2`)** — label + colon + quotes, short lines, beats:
```
DIALOGUE ({LANG}, conversational tone; lip-synced to the speaker):
<Speaker A description> says: "<short line>"
[She pauses, then continues:] "<next short line>"
```
- Colon-then-quotes is the fal-documented Seedance format: `The senior woman, arms crossed, says: "You ran that client call better than I would have."`
- Split anything over ~10–12 words into two lines with a written beat between them (`She pauses, then continues:`) — Seedance uses written beats as resync anchors.
- The `American accent, conversational tone` clause is the sourced mitigation for its Mandarin-lip-sync bias — include it every scene.

**Kling (`kling-3.0/video`)** — bracketed labelled speakers:
```
DIALOGUE ({LANG}):
[<Speaker A label>, <tone>]: "<line>"
[<Speaker B label>, <tone>]: "<line>"
```
- Consistent bracket labels, no pronouns (`[Character A: Exhausted Partner, trembling voice]: "You never listen to me."`).
- Map the storyboard `speaker` to the label and (optionally) infer a tone from `scene.narrative`.
- Prefer `mode: "pro"` when dialogue is central (official: use Master/high mode for scrutinized lip-sync). Current `klingModeFromResolution` already honors the operator's std/pro pick.

### Request-builder param changes

- **`buildVeoBody`** — no new params. `enableTranslation:false` stays. Dialogue rides in `prompt`. (Kie Veo exposes no audio/voice/negativePrompt field — verified on the docs.)
- **`buildSeedanceInput`** — no *required* new params; `generate_audio` already tracks the toggle. Optional future lever: `reference_audio_urls` for voice consistency (§Cross-scene). Dialogue rides in `prompt`.
- **`buildKlingInput`** — no new params; `sound` already tracks the toggle. Dialogue rides in `prompt`.

**Net:** #547 is a **prompt-assembly change, not a request-schema change.** The only transport-level opportunity (Seedance `reference_audio_urls`) is optional and unverified for dialogue voice.

---

## Per-model deep dives

### Google Veo 3.1 (`veo3_fast`, `veo3`) — Kie `/api/v1/veo/generate`

- **Dialogue format — quotes, inline attribution.** Google's official *Ultimate prompting guide for Veo 3.1* and the Gemini API docs both use quotation marks with a speaker + verb: `A woman says, "We have to leave now."` and `"This must be the key," he murmured.` The guide lists three audio cue types — Dialogue (quotes), Sound Effects (describe explicitly), Ambient — and says the model "captures the nuance of these cues to generate a synchronized soundtrack." `[official-guide]`
- **Colon-vs-quotes tension (must reconcile).** A widespread community technique claims you should use a **colon and NO quotation marks** (`the man says: hello there`) because Veo "may interpret quotation marks as text to display" and burn in captions. `[community]` This directly contradicts Google's own quoted examples. Resolution for #547: **follow Google (quotes) for reliable lip-sync**, and neutralize the caption risk with the explicit anti-subtitle clause (which we already have) rather than dropping quotes. If Veo captions still appear in testing, the fallback is the colon-no-quotes variant — treat as a tuning knob, not the default.
- **Subtitle suppression.** Kie's `/veo/generate` exposes **no `negativePrompt` field** (verified — the param list is prompt/model/aspect_ratio/duration/resolution/generationType/imageUrls/enableTranslation/watermark/callBackUrl only; ai.google.dev's Gemini-API Veo page likewise shows no negativePrompt for the dialogue flow). So the only caption lever is **in-prompt text** — exactly what `ANTI_SUBTITLE_CORE` provides. Community adds "no subtitles"/"no captions" phrasing and keeping dialogue under the 8s clip length so the model "focuses on visuals and audio rather than captions." `[docs]`/`[community]`
- **English forcing.** No language param. `enableTranslation` "enable[s] prompt translation to English … before video generation" — i.e. it translates *your prompt*, not the spoken output; for an already-English prompt it's a no-op at best and a paraphrase risk at worst, so **keep it false**. Force English by (a) writing the words in English inside the quotes and (b) an explicit `spoken in English (American accent)` clause; Veo "will handle the accent and lip-sync automatically" from the written language. `[docs]`/`[community]`
- **Audio toggle.** "All videos ship with background audio by default"; rarely suppressed for sensitive scenes. Not togglable on Kie — matches `audioTogglable:false` in `models.ts` (code already forces `nativeAudio=true` for the veo family). `[docs]`
- **Bake-off note (#533):** Veo 3.1 Fast native-audio clip generated in ~10s wall (anchored) — the fastest of the four; the audio dialogue shoot-out cell is `dlg-veo3-quality.mp4` / `clipref-s1.mp4`. Sora 2 was excluded (paused on Kie). See `workspace/output/bakeoff-533/index.html`.

Sources: [docs.kie.ai/veo3-api/generate-veo-3-video](https://docs.kie.ai/veo3-api/generate-veo-3-video) · [Ultimate prompting guide for Veo 3.1 (Google Cloud)](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1) · [Gemini API Veo docs](https://ai.google.dev/gemini-api/docs/veo) · [GlobalGPT Veo 3.1 dialogue guide](https://www.glbgpt.com/hub/how-to-make-characters-speak-in-veo-3-1-the-ultimate-guide-to-dialogue-audio-lip-sync/) `[community]` · [VidAU "no subtitles"](https://www.vidau.ai/veo-3-prompt-no-subtitles/) `[community]`

### ByteDance Seedance 2.0 (`bytedance/seedance-2`) — Kie jobs API

- **Dialogue format — label, colon, double quotes.** fal.ai's Seedance 2.0 prompting guide: "Put the spoken words in double quotes, and the model voices them, matching the lip movement to each line," e.g. `The senior woman, arms crossed, says: "You ran that client call better than I would have."` For multi-speaker, hold a two-shot then cut to the speaker, "lips matched to each line." Keep lines short — "Long monologues drift out of sync, so I split a speech into a couple of shorter lines and let the cuts carry it." `[vendor-guide]`
- **Written beats as resync anchors.** "Insert a written beat ('She pauses, then continues:') between sentences — Seedance uses written beats as resync anchors." Directly useful for splitting a scene's multiple `dialogue` lines. `[vendor-guide]`
- **English forcing / drift.** Seedance supports 8+ languages incl. English/Mandarin, but "Mandarin produces the most consistent lip sync," and separate generations of the same character drift in accent unless pinned. Sourced mitigation: **"Specify accent explicitly in every scene prompt: 'American accent, conversational tone.'"** No API language param. The specific "drifts to Chinese/Mandarin" failure the map calls out is **community-reported and consistent with these vendor guides, but I could not pin a primary Reddit/X thread this session** — treat the drift as real-risk, the accent clause as the sourced fix. `[vendor-guide]`/`[community]`
- **Subtitle risk.** No first-party statement that quoted Seedance dialogue burns in captions; no first-party suppression guidance found. Keep `ANTI_SUBTITLE_CORE`. `[community]`
- **Pacing (important — conflicts with the repo budget).** fal / UGC-Copilot guidance: **~12 words per 10s, ~20 words per 15s (~1.2 words/sec)**; "short sentences … five to ten words per line is the sweet spot"; sync quality "drops past 10" seconds. The storyboard gate (`VO_CHARS_PER_SEC = 17`, `sceneSpeechSec`) budgets ~17 chars/s ≈ ~3 words/s — **~2.5× looser than Seedance actually speaks cleanly.** A scene that "fits" at 17 cps can still overflow / rush / desync on Seedance native audio. **Recommendation for #547 (or a fast-follow):** use a tighter chars-per-second budget for native-audio *dialogue* (≈9–10 cps, ~1.2–1.5 wps) than for VO narration. Seedance does not hard-truncate; it rushes and desyncs. `[vendor-guide]`
- **Bake-off note (#533):** Seedance native audio was slowest by far — measured ≈24 min/clip, which is why `POLL_TIMEOUT_VIDEO_MS` was raised to 35 min in `kie-video.ts`. It won "best native audio" per the map, but at a steep latency/cost. `dlg-seedance.mp4` vs the silent control `dlg-seedance-silent.mp4` vs pixr mux `dlg-elevenlabs-mux.mp4`.

Sources: [docs.kie.ai/market/bytedance/seedance-2](https://docs.kie.ai/market/bytedance/seedance-2) · [fal.ai Seedance 2.0 prompting guide](https://fal.ai/learn/tools/seedance-2-0-prompting-guide) · [UGC-Copilot Seedance native audio guide](https://ugccopilot.ai/blog/seedance-2-native-audio-generation-guide/) `[community]` · [Cutout.pro Seedance audio guide](https://www.cutout.pro/learn/blog-seedance-2-0-audio-guide/) `[community]`

### Kling 3.0 (`kling-3.0/video`) — Kie jobs API

- **Dialogue format — bracketed labelled speakers.** fal.ai's Kling 3.0 guide: `[Character Label, tone/emotion]: "dialogue text"`, e.g. `[Character A: Exhausted Partner, trembling frustrated voice]: "You never listen to me."` Structured naming (P1): "Character labels must be consistent. Avoid pronouns or synonyms." For sequencing/multi-speaker, insert a switch beat ("this is when the speaker switches"). `[vendor-guide]`
- **Official audio behavior.** Kling's own blog (Kling VIDEO 3.0 / 3.0 Omni "Native Audio") — dialogue, sound and lip movement are generated together. Best-practice guidance (corroborated across Kling + fal + community): short simple sentences beat rapid complex speech; **specify the language in the prompt to help phoneme mapping**; medium shots sync better than extreme close-ups; avoid overlapping dialogue — single-speaker segments sync much better; use Master/high mode when lip-sync will be scrutinized. `[official-guide]`/`[community]` (Note: the official Kling blog returns HTTP 446 to automated fetch; content is corroborated via the search excerpt + fal guide, not a direct page read.)
- **Language support / forcing.** Supports Chinese, English, Japanese, Korean, Spanish + dialects/accents (American/British/Indian English). No language param — state `spoken in English` in the prompt. `[official-guide]`/`[community]`
- **Kie param nuance.** On Kie, the native-audio toggle is `sound` (bool) and `prompt` "takes effect when multi_shots is false" — our builder sends `multi_shots:false`, so the single `prompt` (with the dialogue block) is the right channel. Multi-shot mode would need the `multi_prompt[]` array instead (each shot's `prompt` ≤500 chars); v1 does not use it. `[docs]`
- **Bake-off note (#533):** `dlg-kling.mp4`, ~103s gen — much faster than Seedance, comparable to Veo Quality.

Sources: [docs.kie.ai/market/kling/kling-3-0](https://docs.kie.ai/market/kling/kling-3-0) · [Kling official: Kling Video 3.0 Omni Native Lip Sync & Audio](https://kling.ai/blog/kling-video-3-omni-native-lip-sync-audio-guide) (446 to automated fetch) · [fal.ai Kling 3.0 prompting guide](https://blog.fal.ai/kling-3-0-prompting-guide/) · [Imagine.art Kling 3.0 prompt guide](https://www.imagine.art/blogs/kling-3-0-prompt-guide) `[community]`

---

## Cross-scene voice consistency (map fog — levers that exist)

The problem: each scene is an independently-generated clip, so the same actor gets a **different synthesized voice** each time. No picker model exposes a first-class "voice ID" through Kie's jobs/veo API. Levers found, none verified to solve it:

- **Seedance `reference_audio_urls`** `[docs]` — up to 3 audio clips (2–15s, wav/mp3), also accepts `asset://{assetId}`. Documented as a *reference* input (style/voice conditioning), **not** as the dialogue-content source. **Fog:** it *might* anchor timbre if the same reference clip is passed to every scene — but the docs don't say it transfers voice identity, and whether the model speaks the *prompt* text in the *reference* voice is untested. This is the single most promising Kie-native lever; worth an empirical probe before relying on it. Seedance is also the only one of the four with any audio-input field.
- **Kling `kling_elements[].audio`** `[docs]` — per-element audio (5–30s) tied to an `@element`. Element references are aimed at *visual* character consistency (2–4 images/element); the audio slot is under-documented for voice transfer. **Fog.**
- **Veo** — **no audio input at all.** No lever for cross-scene voice. `[docs]`
- **Higher-level "voice fingerprint" features** (e.g. fal's "AI Twins" persona voice-locking) exist at the infra layer but are **not exposed through Kie's jobs API**, so not usable in this pipeline as-is. `[community]`

**Practical read for v1:** there is no reliable cross-scene voice-consistency lever through Kie today. If it matters, the more controllable path remains the old pixr architecture — render silent + one ElevenLabs voice muxed across all scenes (the `dlg-elevenlabs-mux.mp4` control in #533). Keep cross-scene voice in the fog for #547; if pursued, the first experiment is Seedance `reference_audio_urls` with a fixed reference clip.

---

## Duration / pacing behavior (per family)

- **Seedance:** ~12 words/10s, ~20 words/15s; sync degrades past ~10s and with long lines; does **not** hard-truncate — it rushes and drifts out of sync. Written beats resync it. `[vendor-guide]`
- **Veo:** fixed 4/6/8s clips; keep dialogue short enough to land inside the clip; Google/community both say short lines sync best and staying under 8s reduces caption bleed. `[official-guide]`/`[community]`
- **Kling:** 3–15s; short single-speaker segments sync best; no published words/sec number found. `[official-guide]`
- **Repo gate today:** `sceneSpeechSec = max(voText, dialogue) ÷ 17 chars/s` fits *both* tracks to `durationSec` and fails loud rather than truncating. For **VO narration** 17 cps is reasonable; for **native lip-synced dialogue** it is too loose (Seedance ≈ 7–8 cps of clean speech). **Actionable:** consider a separate, tighter cps for native-audio dialogue-fit. (Flagged as a recommendation; whether #547 changes the budget or just formats the block is a scoping call.)

---

## Open questions / unverifiable this session

1. **Veo colon-vs-quotes for captions** — Google officially uses quotes; the "quotes burn captions, use a colon" claim is community-only and contradicts the official examples. Not resolvable without a live Veo-on-Kie A/B. Default to quotes + anti-caption clause; keep colon-no-quotes as a fallback knob. `[community]`
2. **Seedance→Chinese drift** — consistent with vendor guides ("Mandarin most consistent," "specify accent every scene") but no primary Reddit/X thread pinned this session. The accent clause is the sourced mitigation; the drift itself is community-level. `[community]`
3. **Whether `ANTI_SUBTITLE_CORE`'s "no dialogue text" wording ever suppresses *spoken* audio** — it targets on-screen typography, so it *shouldn't*, but a paranoid model could misread it. Low risk; worth watching in the first native-audio+dialogue test. Not observed in #533 (which ran without a dialogue block).
4. **Seedance `reference_audio_urls` as a voice-consistency lever** — exists in the API but its effect on spoken-dialogue voice is undocumented. Needs an empirical probe.
5. **Kie Veo `negativePrompt`** — absent from Kie's `/veo/generate` param list (Vertex AI Veo has one; Kie's endpoint does not expose it). Confident but worth a 1-line confirm if #547 wants a param-based caption guard.
6. **Exact per-family words/sec** — only Seedance publishes numbers; Veo/Kling give qualitative "keep it short." Any tighter dialogue-fit budget will be model-family-specific and partly empirical.

---

## Sources

Primary / first-party:
- [docs.kie.ai — Veo 3.1 generate](https://docs.kie.ai/veo3-api/generate-veo-3-video), [Seedance 2.0](https://docs.kie.ai/market/bytedance/seedance-2), [Kling 3.0](https://docs.kie.ai/market/kling/kling-3-0)
- [Google Cloud — Ultimate prompting guide for Veo 3.1](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- [Google AI for Developers — Generate videos with Veo 3.1 (Gemini API)](https://ai.google.dev/gemini-api/docs/veo)
- [Kling.ai — Kling Video 3.0 Omni Native Lip Sync & Audio](https://kling.ai/blog/kling-video-3-omni-native-lip-sync-audio-guide) (446 to automated fetch; corroborated indirectly)

Vendor guides (fal.ai):
- [Seedance 2.0 prompting guide](https://fal.ai/learn/tools/seedance-2-0-prompting-guide), [Kling 3.0 prompting guide](https://blog.fal.ai/kling-3-0-prompting-guide/)

Community (labeled inline):
- [GlobalGPT Veo 3.1 dialogue/lip-sync](https://www.glbgpt.com/hub/how-to-make-characters-speak-in-veo-3-1-the-ultimate-guide-to-dialogue-audio-lip-sync/) · [VidAU Veo no-subtitles](https://www.vidau.ai/veo-3-prompt-no-subtitles/) · [UGC-Copilot Seedance native audio](https://ugccopilot.ai/blog/seedance-2-native-audio-generation-guide/) · [Cutout.pro Seedance audio](https://www.cutout.pro/learn/blog-seedance-2-0-audio-guide/) · [Imagine.art Kling 3.0](https://www.imagine.art/blogs/kling-3-0-prompt-guide)

Local prior art:
- `workspace/references/kie-video-models.md` (#529 catalog) · `workspace/output/bakeoff-533/index.html` + `manifest.json` (#533 native-audio bake-off) · `scout/src/workflow/video/clips.ts`, `models.ts`, `kie-video.ts`, `storyboard.ts` · `convex/lib/workflow/storyboardContract.ts`
