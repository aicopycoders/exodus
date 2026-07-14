# Lip-Sync Alternatives — getting a CHOSEN voice out of the on-screen actor's mouth

**Research date:** 2026-07-14
**For:** Unblocking voice-paired talking-head scene clips after Kie's `gemini-omni-video` `audio_ids` path started returning "flagged by Website as violating content policies" on every render (GitHub issue #561).
**Goal:** A chosen voice — ideally an ElevenLabs voice the user already uses — spoken by the on-screen actor, lip-synced, in each per-scene clip (usually 9:16, 720p, 4–10 s), then stitched as today.
**Method:** Primary sources = first-party API docs (ai.google.dev, sync.so/docs, fal.ai model pages, developers.heygen.com, d-id.com, hedra.com, replicate.com) plus Kie's own pages. Kie's marketing pages (`kie.ai/*`) and `kie.ai/market` return **HTTP 403 to automated fetch**; several `docs.kie.ai/market/...` model pages 404 at the guessed path, so some Kie-specific slugs/prices are corroborated from mirror hosts (fal, WaveSpeed, Replicate, Atlas Cloud) that run the same upstream model and are flagged accordingly. Anything not pinned to a first-party doc in this session is marked **[unverified]**.
**Confidence labels:** `[docs]` = first-party API doc · `[mirror]` = same upstream model on another host's doc (fal/Replicate/WaveSpeed) · `[vendor]` = vendor marketing/help page · `[unverified]` = could not confirm from a primary source this session.

---

## TL;DR — recommendation table

The two integration shapes matter more than the model list:

- **RETARGET** = feed an *already-rendered* scene clip (video) + an audio track → model reanimates only the mouth, preserves background/body/camera. **Drops into the existing per-scene render → stitch flow as a new post-render step. No change to the video model.** This is the fit for our pipeline.
- **GENERATE** = feed an *image* (a portrait / first frame) + audio → model animates a talking head from scratch. This **replaces** the Kie video model for talking scenes (loses the motion/scene the video model produced).

| Rank | Path | Shape | Existing BYOK? | ~Cost, 9:16 720p, ~8 s | Voice source | Moderation risk | Verdict |
|---|---|---|---|---|---|---|---|
| **1** | **Kie `volcengine/video-to-video-lip-sync`** (retarget rendered clip) | RETARGET | ✅ **Kie BYOK exists — same jobs API** | not documented — surfaces via `creditsConsumed` `[docs]` | any audio file (our Voiceover node's ElevenLabs MP3s, ≤10 MB) | Low (edits our own footage) — **live-probe before building** | **Zero new provider; verified post-research (see addendum). Try first.** |
| **2** | **sync.so `lipsync-2`** (retarget rendered clip) | RETARGET | ❌ new provider (but built-in ElevenLabs TTS) | ~**$0.32** ($0.04/s) `[docs]` | video's own audio **or** ElevenLabs voiceId+script native in-API | Low (edits our own footage) | **Best quality reputation; fallback if Volcengine quality/pricing disappoints** |
| **2b** | **Kling Lip-Sync A2V** (`kwaivgi/kling-lip-sync`, retarget) via fal/Replicate | RETARGET | ❌ new provider (NOT in Kie's catalog — verified via docs index) | ~**$0.11–0.15**/run ($0.014/input-s, 5 s increments) `[mirror]` | any audio file (drop in ElevenLabs MP3) | Low | Cheapest retarget, but needs fal/Replicate BYOK |
| 3 | **fal `veed/lipsync`** / **`fal-ai/latentsync`** (retarget) | RETARGET | ❌ new provider | veed ~$0.24 ($0.15/5 s); latentsync **$0.20 flat ≤40 s** `[docs]` | any audio file | Low | Cheap retarget fallbacks; latentsync is the price floor |
| 4 | **Kie InfiniteTalk** (`infinitalk/image-to-talking-video`) | GENERATE | ✅ **Kie BYOK exists** | ~**$0.30**/clip (10 credits/5 s @720p) `[vendor]` | uploaded audio (ElevenLabs MP3), ≤15 s | Low–med | **Only option that reuses existing BYOK — but replaces the video model, image-driven** |
| 5 | **Kie OmniHuman 1.5** (`bytedance/omni-human`) | GENERATE | ✅ Kie BYOK exists | ~$0.12/s upstream `[mirror]` | uploaded audio | Low–med | Higher-fidelity generate-from-photo on existing BYOK |
| 6 | Hedra Character-3 | GENERATE | ❌ new provider | subscription credits, ~$15–75/mo | uploaded audio / text+TTS | Low | Best-in-class generate quality; sub model, not per-clip PAYG |
| 7 | HeyGen / D-ID photo-avatar | GENERATE | ❌ new provider | ~$0.05/s ($3/min) `[vendor]` | uploaded audio or TTS | Low | Presenter/UGC avatars; least "our footage" |
| — | **Google Gemini Omni direct** (bypass Kie) | GENERATE, **no audio input** | ❌ new provider | ~$0.10–0.75/s (Veo tiers) `[docs]` | **none — cannot supply a voice** | n/a | **Ruled out: API explicitly forbids audio upload & voice editing** |
| — | Seedance `reference_audio_urls` (Kie) | (not lip-sync) | ✅ Kie | — | voice-style *reference*, not spoken content | — | **Not a lip-sync/voice-content lever — see note** |

**Bottom line:** the goal ("chosen ElevenLabs voice, lip-synced, on the actor already in our rendered clip") is a **RETARGET** problem, and the video-generation APIs (including Gemini Omni direct) don't solve it. Rank 1–3 keep the Kie video model exactly as-is and add one post-render lip-sync call per scene, then mux/stitch. **sync.so is the standout** because it retargets our rendered clip *and* has ElevenLabs TTS built into the same request. If avoiding a brand-new provider is paramount, Kie InfiniteTalk (rank 4) is the only path on existing BYOK — but it's generate-from-image, so it changes what the talking scenes look like.

---

## Branch 1 — Google Gemini / Omni video API directly (bypass Kie)

**Source (first-party):** https://ai.google.dev/gemini-api/docs/omni · pricing https://ai.google.dev/gemini-api/docs/pricing

### Does it accept audio input for the generated speech / lip-sync? **No.**
The Gemini Omni video docs state plainly `[docs]`:
- *"Uploading audio references is unsupported in the current version of the API."*
- *"Voice editing is not supported."*

The documented request accepts only: **text** (`{"type":"text","text":"…"}`), **images** (`{"type":"image","data":<base64>,"mime_type":"image/jpeg"}`), **videos for editing** (`{"type":"document","uri":<video_file_uri>}`), and **prior generated-video references** via a `previous_interaction_id` parameter. **There is no audio input parameter anywhere in the schema.** `system instructions`, `temperature`, `top_p`, and `negative prompts` are also unsupported (negatives must be embedded in the prompt). `[docs]`

**Consequence:** the first-party API **cannot** take an ElevenLabs voice, an uploaded audio file, or a voice character to drive speech/lip-sync. It generates whatever voice it wants natively. This is the same capability gap that Kie's `audio_ids` param was papering over — and going direct removes the param entirely. **Branch 1 does not meet the goal.**

### Moderation — and why Kie's flag is Google-side
The Omni docs document these safety controls `[docs]`:
- *"Content safety filters are applied to both input prompts and generated video (and depend on your region)."*
- *"Prompts that violate usage policies will be blocked."*
- *"Uploading and editing images containing certain recognizable people is not supported."*
- *"Uploading and editing images containing minors is not supported in [the] EEA, Switzerland, and the United Kingdom."*
- English is *"fully supported"*; other languages *"have not been evaluated."*

The "flagged by **Website**" wording our probes saw, combined with "prompts that violate usage policies will be blocked" applying to the *underlying Gemini/Omni model*, is consistent with a **Google-side content-policy block on the audio/voice pathway**, not a Kie quirk — Kie's `audio_ids` (preset voice characters) likely routes into a voice feature Google's safety layer rejects for this prompt class, or Kie is bolting on a voice step the first-party model doesn't sanction. Since the first-party API forbids audio input outright, there is **no direct-API config that re-enables voice-paired renders**. `[docs]` + reasoned inference.

### Access, pricing, availability
- **Video models on the Gemini API are the Veo family**, billed per second of output. Google's list rate for **Veo 3.1** is **$0.75/s** (~$6.00 / 8 s clip) on the Gemini API and Vertex; **Veo 3.0** was $0.50/s video-only / $0.75/s with audio (deprecated, shutdown 2026-06-30). A **standard-tier 720p** path bills ~**5,792 tokens/s of 720p video ≈ $0.10/s** [unverified exact tier mapping]. `[docs]` (pricing page) + `[vendor]` calculators.
- **Vertex AI vs Gemini API:** same Veo models, same "no audio upload" capability for generation; Vertex adds enterprise auth/quota but does **not** add an audio-input lip-sync mode [unverified beyond Veo parity].
- **vs Kie:** Kie's ~63 credits (~$0.32) per 4 s 720p clip is competitive with — often cheaper than — Google-direct Veo, and Kie's unified async job API is already integrated. Going direct means a **new "Google AI" BYOK provider**, a Files API upload step for image inputs, and Google's own async long-running-operation polling — **material new surface for zero gain on the voice goal.**

**Branch 1 verdict: ruled out.** The capability we need (supply-your-own-voice / lip-sync to given audio) is explicitly not in the first-party API. Do not build a Google-direct integration to solve #561.

---

## Branch 2 — lip-sync-to-audio models (render clip → ElevenLabs MP3 → retarget the mouth)

Ordered by fit. **RETARGET** models take our rendered clip; **GENERATE** models take a still image.

### 2a. sync.so (Sync Labs) — `lipsync-2` / `lipsync-2-pro` / `sync-3` — **RETARGET** ✅ best fit
**Source (first-party):** https://sync.so/docs/api-reference/api/generate-api/create · https://sync.so/docs/models/lipsync · https://sync.so/docs/introduction

- **Shape:** retargets an **existing video** with new audio — *"retargets existing video with new audio, applying lipsync synchronization to match speaker mouth movements."* `[docs]`
- **Inputs (`CreateGenerationDto`):** an array requiring **exactly one visual input** (video `url` **or** `assetId`; image also accepted) **and one audio-or-text input** `[docs]`:
  - Audio as `{ "url": … }` or `assetId`, **or**
  - **TTS**: `{ "provider": "elevenlabs", "voiceId": <ElevenLabs voice id>, "script": <text>, "stability", "similarityBoost" }` — **native ElevenLabs integration in the same request.** `[docs]`
- **Models:** `sync-3`, `lipsync-2`, `lipsync-2-pro`, `lipsync-1.9.0-beta`, `react-1`. `[docs]`
- **Options:** `sync_mode` (bounce/loop/cut_off/silence/remap for duration mismatch), `temperature` (0–1, default 0.5, expressiveness), `active_speaker_detection`, `occlusion_detection_enabled`, `webhookUrl`. `[docs]`
- **API pattern:** **async** — POST returns `status: PENDING` → `PROCESSING` → `COMPLETED|FAILED|REJECTED`; poll or webhook. Long videos auto-chunked into 30–40 s segments (irrelevant for our 4–10 s clips). `[docs]`
- **Pricing:** **`lipsync-2` = $0.04/s**, `sync-3` = $0.133/s (at 25 fps). ~**$0.32 for an 8 s clip** on lipsync-2. `[docs]` (pricing page / cost-estimation endpoint available).
- **Moderation:** `REJECTED` state exists for policy violations [unverified what triggers it]; editing our *own* generated footage is far lower risk than generating a likeness.
- **Fit:** ⭐ Perfect. Keep the Kie video model; after each scene renders, call sync.so with `video_url = <rendered clip>` and either the ElevenLabs MP3 we already generate **or** `provider:elevenlabs, voiceId, script` and skip our own TTS step. Output replaces the scene clip pre-stitch.

### 2b. Kling Lip-Sync — Audio-to-Video (`kwaivgi/kling-lip-sync`) — **RETARGET** ✅ cheap
**Sources:** fal API doc https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video/api `[docs]` · Replicate https://replicate.com/kwaivgi/kling-lip-sync `[mirror]` · WaveSpeed https://wavespeed.ai/models/kwaivgi/kling-lipsync/audio-to-video `[mirror]`

- **Shape:** *"give it a clean voice track plus a video and it reanimates the mouth region… preserves the original background, body motion, and camera work."* Works on Kling-generated **or other-source** video. `[mirror]`
- **Inputs:** `video_url` + `audio_url` (also a text→TTS variant). `[docs]`
  - **Video:** .mp4/.mov, ≤100 MB, **2–10 s** (some hosts list 2–60 s), **720p/1080p only**, width/height 720–1920 px. `[docs]`
  - **Audio:** 2–60 s, ≤5 MB, MP3/WAV/AAC/OGG. `[docs]`
- **API pattern:** async queue + webhooks. `[docs]`
- **Pricing:** ~**$0.15/run minimum**, or **$0.014 per input-video-second rounded to the nearest 5 s** → ~$0.11 for a 4–8 s clip. `[mirror]` (WaveSpeed/fal)
- **Moderation:** marked "Commercial use / Partner"; no documented person-restriction policy. `[docs]`
- **Kie hosting:** **[unverified]** — Kie hosts multiple Kling models (`kling-3.0/video` etc.) but I could **not** confirm this session that Kie exposes the *video-to-video* `kling-lip-sync` retarget slug (its `docs.kie.ai/market/kling/lip-sync` path 404'd). **If BYOK-Kie already exposes it, this becomes the top pick** (existing provider + cheap + retarget). Worth a live probe against the Kie account.
- **Fit:** ⭐ Excellent and cheapest solid retarget. 10 s cap suits our clip length.

### 2c. fal.ai catalog (retarget options)
**Source:** https://fal.ai/models/veed/lipsync · https://fal.ai/models/fal-ai/latentsync · https://fal.ai/models/fal-ai/sync-lipsync
- **`veed/lipsync`** — RETARGET (video→video), *"realistic lipsync from any audio."* **$0.15 / 5 s** (~$0.24/8 s). `[docs]`
- **`fal-ai/latentsync`** (ByteDance LatentSync, audio-conditioned latent diffusion) — RETARGET. **$0.20 flat for ≤40 s**, then $0.005/s → cheapest for our clip lengths. Real-life + anime. `[docs]`
- **`fal-ai/sync-lipsync` (1.9)** — RETARGET, **$0.70/min ≈ $0.012/s** (sync.so model, older). `[docs]`
- **`fal-ai/kling-video/lipsync/audio-to-video`** — the Kling retarget above, on fal. `[docs]`
- **Fit:** all RETARGET, all take our rendered clip + any audio (drop the ElevenLabs MP3). fal is a single BYOK that unlocks several — good hedge if we want to A/B lip-sync engines. latentsync is the price floor; veed is a quality step up.

### 2d. Kie InfiniteTalk (`infinitalk/image-to-talking-video`) — **GENERATE** ✅ only path on existing BYOK
**Sources:** https://kie.ai/infinitalk `[vendor]` (403 to fetch; corroborated) · integration guide https://www.fromdev.com/2025/11/how-to-integrate-infinite-talk-api-using-kie-ai-a-step-by-step-guide.html · FairStack model index (price)
- **Shape:** MeiGen-AI InfiniteTalk — turns an **image + audio** into a talking avatar (sparse-frame video-dubbing framework, identity-preserving, "infinite" length). **Generate-from-image, not retarget-a-clip.** `[vendor]`
- **Inputs (via `POST https://api.kie.ai/api/v1/jobs/createTask`):** `image_url` (JPEG/PNG/WebP), `audio_url` (MP3/WAV/AAC/OGG, **≤15 s**), `prompt`, `resolution` **480p or 720p only**, `seed` (10000–1000000). `[mirror]` (integration guide reflecting Kie's schema)
- **Pricing:** first 5 s = **5 credits @480p / 10 @720p / 15 @1080p**, then per-second at the same rate → ~**$0.30/clip @720p** (FairStack lists "InfiniteTalk (Kie.ai) — $0.300/clip"). `[vendor]`
- **Fit:** ✅ **Only option that reuses the existing Kie BYOK key.** BUT it's image-driven: we'd feed a scene *frame* (or actor portrait) + the ElevenLabs MP3, and it **regenerates** the talking head — we lose whatever motion/scene the Kie video model produced. Good if talking scenes can be "portrait talks to camera"; wrong if the scene needs the video model's action. 15 s audio cap fits our 4–10 s clips.

### 2e. Kie OmniHuman 1.5 (`bytedance/omni-human`) — **GENERATE**
**Sources:** https://kie.ai/omnihuman-1-5 · https://kie.ai/omni-human-api `[vendor]` (403; corroborated) · fal/upstream pricing `[mirror]`
- **Shape:** ByteDance OmniHuman 1.5 — single portrait **image + audio** → realistic talking video with natural lip-sync, expressions, lifelike/full-body motion. Generate-from-image. `[vendor]`
- **Pricing:** upstream ~**$0.12/s** (fal listing for OmniHuman). Kie bills by generated duration; exact Kie credit/s [unverified]. `[mirror]`
- **Fit:** Higher-fidelity generate-from-photo than InfiniteTalk, on existing Kie BYOK. Same caveat: replaces the video model for talking scenes. Kling AI Avatar 2.0 is a third Kie generate-from-image option (audio-driven, multilingual, up to 5 min; Kie benchmarks it above OmniHuman-1.5 and HeyGen). `[vendor]`

### 2f. Runway (Act-Two / Lip Sync / Characters API)
**Sources:** https://help.runwayml.com/hc/en-us/articles/42311337895827 · https://runwayml.com/apps/add-dialogue · changelog `[vendor]`
- **Act-Two:** performance-capture (driving video → target character), auto audio-visual sync; you can **change the voice** within the interface. **Lip Sync** app extended to **45 s** (from 20 s). Characters API is **live for developers at dev.runwayml.com**. `[vendor]`
- **Shape:** closest Runway analog to retarget is Lip Sync / "Add Dialogue" (animate a video/image with a voice). API is available (Gen-4/Characters on dev.runwayml.com) but **per-second API pricing for Act-Two/Lip Sync was not published** this session. `[vendor]` / [unverified pricing]
- **Fit:** Plausible RETARGET/talking-photo path, but pricing opacity and a heavier API make it a second-tier choice vs sync.so/fal/Kling.

### 2g. Hedra Character-3 — **GENERATE**
**Sources:** https://www.hedra.com/docs/pages/getting_started/quickstart · https://www.hedra.com/video-models/hedra-character-3 · https://www.hedra.com/plans `[vendor]`
- **Shape:** omnimodal — processes **image + text + audio simultaneously** → talking avatar with strong lip-sync, micro-expressions (blinks, eye shifts, head tilts), full-body motion. Generate-from-image. `[vendor]`
- **Access/pricing:** requires a **paid subscription** (API key + purchased API credits). Free (100 cr, watermarked); Basic $15/mo (1,500 cr); Creator $30/mo (5,400 cr); Professional $75/mo (14,400 cr). **Credit/subscription model, not clean per-clip PAYG.** `[vendor]`
- **Fit:** Best-in-class *generate* quality for talking heads, but subscription billing fits a per-user BYOK-PAYG pipeline poorly, and it's still generate-from-image (replaces the video model).

### 2h. HeyGen API / D-ID — **GENERATE** (presenter avatars)
**Sources:** https://developers.heygen.com/ · https://help.heygen.com/en/articles/10060327 · https://www.d-id.com/pricing/api/ `[vendor]`
- **HeyGen:** Photo Avatar from a still → animates face, **syncs lips to your script or an uploaded audio file** ("dub or replace audio on a video with a provided audio file"). Pay-as-you-go since Feb 2026: **~$1 = 1 min @720/1080p**; engines from **$0.0167/s** (Avatar III Digital Twin) to **$0.05/s** (Avatar IV Photo Avatar) to $0.0667/s. Min top-up $5. `[vendor]`
- **D-ID:** talking-head from a photo + audio/TTS, API **~$0.05/s ($3/min)**. `[vendor]`
- **Fit:** These are *presenter/spokesperson* generators from a photo — they don't retarget our rendered scene, and outputs read as "avatar tool," which is off for naturalistic UGC scene action. Use only if a talking-portrait scene is acceptable and we want a polished presenter look. HeyGen's "replace audio on a video" mode is worth a second look as a possible retarget-ish path [unverified whether it accepts arbitrary external video].

### 2i. Replicate-hosted options
**Source:** https://replicate.com/collections/lipsync `[docs]`
Replicate's lipsync collection hosts the same upstream models as first-party, each with a documented JSON schema and PAYG billing: **`sync/lipsync-2-pro`**, **`kwaivgi/kling-lip-sync`** (retarget), **`bytedance/omni-human`** (generate), **`pixverse-ai/lipsync`**, **`zsxkib/multitalk`** (multi-person conversational lipsync — multiple audio clips → back-and-forth). Good single-BYOK hedge (one Replicate key → several retarget + generate engines) but generally pricier/less predictable than fal for the same models.

---

## Seedance `reference_audio_urls` note (Kie `bytedance/seedance-2`)

Per Kie's Seedance 2.0 doc (already captured in `native-audio-dialogue.md`, source https://docs.kie.ai/market/... Seedance page): `reference_audio_urls` accepts **≤3 clips, 2–15 s, wav/mp3** and is a **voice/style *reference* lever — NOT a documented dialogue-content or lip-sync-to-given-audio field.** `[docs]` It biases the *character/timbre* of the model's natively-generated speech; it does **not** make the model speak a supplied MP3 verbatim, and it does not lip-sync to an external audio track. **It does not solve the goal** (a chosen ElevenLabs voice saying our exact lines, lip-synced). Treat Seedance native audio as "model invents a voice, loosely style-guided," same class of problem as gemini-omni — not a voice-control solution.

---

## Recommended path + integration sketch

### Primary recommendation: add a post-render **RETARGET lip-sync step**, keep the Kie video model
The pipeline already produces per-scene clips and per-scene ElevenLabs MP3s (George default) — they're just not muxed/synced. The clean fix is a new stage between "scene clip rendered" and "stitch":

```
storyboard → [Kie video model renders scene clip (silent or discard native audio)]
           → [ElevenLabs TTS: scene.dialogue → MP3]  (already exists)
           → [LIP-SYNC RETARGET: clip + MP3 → mouth-synced clip]   ← NEW
           → [ffmpeg stitch]  (already exists, now with real synced VO)
```

This is **additive** — no change to the storyboard, the video-model picker, or the stitch stage — and it finally makes the existing ElevenLabs Voiceover node pay off.

**Engine choice, in order:**
1. **sync.so `lipsync-2`** — retargets the rendered clip and can take **either** our ElevenLabs MP3 **or** an inline `provider:elevenlabs, voiceId, script` TTS block (letting us drop our own TTS call). Async job pattern mirrors Kie's (create → poll/webhook), so it slots into the existing async render machinery. ~$0.32/8 s clip. New BYOK: a sync.so API key. **Start here.**
2. **Before committing to a new provider, live-probe whether BYOK-Kie already exposes `kwaivgi/kling-lip-sync` (video-to-video).** If yes, it's the cheapest retarget (~$0.11–0.15/clip) on the *existing* Kie key — zero new provider surface. `[unverified]` this session; a 1-call probe settles it.
3. **fal (`veed/lipsync` or `fal-ai/latentsync`)** as a fallback/second engine — one fal BYOK unlocks several retarget models for A/B'ing quality; latentsync at $0.20/≤40 s is the price floor.

### If a new provider is a hard no (must stay on existing Kie/ElevenLabs BYOK only)
Use **Kie InfiniteTalk** (`infinitalk/image-to-talking-video`) or **OmniHuman** (`bytedance/omni-human`): feed a **scene frame/portrait + the ElevenLabs MP3** → talking clip, on the existing Kie key (~$0.30/clip @720p, 720p cap, ≤15 s audio for InfiniteTalk). **Accept the tradeoff:** these *generate* the talking head from a still, so talking scenes become "portrait speaks to camera" and lose the video model's motion/action. Fine for direct-address UGC beats; wrong for scenes that need staged action.

### Integration considerations (both paths)
- **Async + polling/webhook**, same as the current Kie render loop — reuse it. sync.so and Kie share the create→poll shape; sync.so adds a cost-estimation endpoint.
- **Resolution/duration:** retarget models cap at 720p/1080p and ~10 s (Kling) or auto-chunk (sync.so) — fine for our 4–10 s 9:16 720p clips. InfiniteTalk caps at 720p + 15 s audio.
- **Cost delta:** retarget adds ~$0.04/s (sync) or ~$0.014/s (Kling) *on top of* the ~$0.32/4 s Kie render — call it +$0.15–0.35/scene. A 6-scene ad adds roughly $1–2.
- **Moderation:** retargeting **our own rendered footage** is materially lower policy-risk than the gemini-omni `audio_ids` path that #561 hit, and far lower than uploading a real person's likeness — the whole reason this route dodges the block.
- **Voice fidelity:** all retarget engines take an arbitrary MP3, so the **user's exact ElevenLabs voice** is preserved end-to-end (we generate it, they lip-sync to it) — directly satisfying "a chosen ElevenLabs voice out of the actor's mouth."

---

## Source list (primary first)
- Gemini Omni API (no audio input, safety): https://ai.google.dev/gemini-api/docs/omni
- Gemini/Veo pricing: https://ai.google.dev/gemini-api/docs/pricing
- sync.so create-generation schema: https://sync.so/docs/api-reference/api/generate-api/create · models https://sync.so/docs/models/lipsync · intro https://sync.so/docs/introduction
- fal Kling lipsync A2V: https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video/api
- fal veed/lipsync: https://fal.ai/models/veed/lipsync · latentsync: https://fal.ai/models/fal-ai/latentsync · sync-lipsync: https://fal.ai/models/fal-ai/sync-lipsync
- Replicate lipsync collection: https://replicate.com/collections/lipsync · kling-lip-sync: https://replicate.com/kwaivgi/kling-lip-sync
- WaveSpeed Kling lipsync (specs/price): https://wavespeed.ai/models/kwaivgi/kling-lipsync/audio-to-video
- Kie InfiniteTalk: https://kie.ai/infinitalk · integration guide: https://www.fromdev.com/2025/11/how-to-integrate-infinite-talk-api-using-kie-ai-a-step-by-step-guide.html
- Kie OmniHuman: https://kie.ai/omnihuman-1-5 · https://kie.ai/omni-human-api
- Hedra Character-3: https://www.hedra.com/video-models/hedra-character-3 · quickstart https://www.hedra.com/docs/pages/getting_started/quickstart · plans https://www.hedra.com/plans
- HeyGen API: https://developers.heygen.com/ · pricing https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained
- D-ID API pricing: https://www.d-id.com/pricing/api/
- Runway Act-Two: https://help.runwayml.com/hc/en-us/articles/42311337895827-Performance-Capture-with-Act-Two · add-dialogue https://runwayml.com/apps/add-dialogue
- Seedance `reference_audio_urls`: see workspace/references/native-audio-dialogue.md (Kie Seedance 2.0 doc)

---

## Post-research verification addendum (main session, 2026-07-14)

Two load-bearing claims were re-verified against primary sources after the research pass:

### Kie DOES host a video-to-video lip-sync retarget model — `volcengine/video-to-video-lip-sync` `[docs]`
Found via Kie's docs index (https://docs.kie.ai/llms.txt); full doc: https://docs.kie.ai/market/volcengine/video-to-video-lip-sync.md

- **Shape:** RETARGET — required inputs are `mode` (`lite` = single-person frontal, faster; `basic` = complex scenes + scene segmentation), `video_url`, `audio_url`. Runs on the SAME `POST /api/v1/jobs/createTask` transport the pipeline already speaks, on the existing Kie BYOK key.
- **Fit:** our scene clips are single-person frontal talking heads (→ `lite`); audio accepts MP3 ≤10 MB — exactly what the existing Voiceover node's ElevenLabs synthesis produces per scene. `align_audio` loops video if audio outruns it; output is mp4 25 fps with duration matched to the audio.
- **Video constraints:** 360p–1080p (ours: 720p ✓), H.264, ≤500 MB, 24–60 fps.
- **Unknowns:** pricing is NOT documented (Kie convention: real cost surfaces via `creditsConsumed` on the record — live-probe it) and output quality is unassessed. Given the #561 surprise, run a live probe (rendered clip + ElevenLabs MP3) before building the pipeline leg.
- This supersedes the earlier "[unverified] Kie hosting of Kling lip-sync" row: Kie's docs index shows NO Kling A2V lip-sync slug — the Kling entries are `kling/ai-avatar-standard|pro` (GENERATE-from-image), plus `omnihuman-1-5` and `infinitalk/from-audio` (both GENERATE).

### sync.so ElevenLabs TTS input — confirmed `[docs]`
https://sync.so/docs/api-reference/api/generate-api/create — generation request accepts `{type: "text", provider: {name: "elevenlabs"}, voiceId: <ElevenLabs voice id>, script}` alongside a `{type: "video", url}` retarget input; models `sync-3`, `lipsync-2`, `lipsync-2-pro`, `lipsync-1.9.0-beta`, `react-1`. (Note: our pipeline already synthesizes ElevenLabs MP3s in the Voiceover node, so the built-in TTS is a convenience, not a requirement — which strengthens the case for trying Kie/Volcengine first.)

### Revised recommendation
1. **Live-probe Kie `volcengine/video-to-video-lip-sync`** (existing BYOK, existing transport, existing ElevenLabs VO): render one talking-head clip (native audio OFF, mouth policy suppressed), synthesize one ElevenLabs line, submit lite-mode retarget, judge quality + read `creditsConsumed`.
2. If quality or price disappoints → **sync.so `lipsync-2`** (new BYOK provider, ~$0.04/s, strongest reputation).
3. Integration shape either way: Video node gains a "voiceover lip-sync" mode = per-scene silent-ish render → Voiceover MP3 → retarget call → retargeted clip replaces the raw clip in the stitch. The storyboard's speech-fit budget already paces voText to scene durations.
