# Kie.ai Video Model Catalog — Research Findings

**Research date:** 2026-07-13
**For:** Wayfinder ticket #529 (map #528 — video in the Workflow Builder)
**Author:** research agent
**Method:** Primary sources = https://kie.ai + https://docs.kie.ai (model + API-reference pages). Marketing pages under `kie.ai/*` (pricing, market) return **HTTP 403 to automated fetch**, so capability facts come from the `docs.kie.ai` model pages (fetchable) and pricing comes from Kie-published/secondary sources anchored to Kie's stated **$0.005/credit** rate. Anything I could not pin to a primary Kie page is flagged **[verify]**. Local code claims come from reading this repo + the `archive/pixar-v2` git tag.

> **Caveat on pricing precision:** Kie updates model prices frequently and the canonical `kie.ai/pricing` / `kie.ai/market` pages block automated fetch. The per-clip USD figures below are directionally correct (and internally consistent with the $0.005/credit anchor), but **confirm the exact credit cost on the live pricing page / each model's doc page before hard-coding any number in the app.**

---

## 1. Executive summary + recommended v1 list

Kie.ai is a **unified multi-model gateway**: one API key, one async job pattern (`/api/v1/jobs/createTask` → poll `recordInfo` or receive a `callBackUrl` webhook), 30+ video models switchable by a `model` slug. It exposes today (video): **Google Veo 3 / 3.1**, **Kling (2.1, 3.0)**, **ByteDance Seedance (2.0, 2.0 Fast, 2.5, 1.5 Pro)**, **OpenAI Sora 2 / Sora 2 Pro**, **Hailuo/MiniMax (2.3 Pro/Standard)**, **Wan (2.6 family)**, **Runway**, plus Grok Imagine. All four "big" families now support **image-to-video** and most now support **native audio** — a material change since the pixr era.

**Recommended v1 model list for the Video-node picker** (criteria: image-to-video quality, native audio, price, reliability):

| Rank | Model | `model` slug | Why | Native audio | I2V |
|------|-------|--------------|-----|:---:|:---:|
| **Default** | **Veo 3.1 Fast** | `veo3_fast` | Best price/quality with native dialogue+SFX audio; first-frame + first/last-frame + reference I2V; 9:16 & 16:9; battle-tested endpoint. ~$0.30–0.40 / 8s. | ✅ | ✅ |
| 2 | **Seedance 2.0** | `bytedance/seedance-2` | Strongest multimodal keyframe control (first/last frame + up to 9 reference images + reference video/audio), native audio default-on, cheap, and it's the exact model family the old pixr clip stage already drove. | ✅ | ✅ |
| 3 | **Kling 3.0** | `kling-3.0/video` | Multi-shot storytelling + `@element` character-consistency (2–4 ref images/element, max 3), up to 15s, native sound, up to 4K. Best for character-driven multi-shot ads. | ✅ | ✅ |
| 4 (premium) | **Veo 3.1 Quality** | `veo3` | Highest fidelity when budget allows (~$1.25–2.00 / 8s). Same param surface as Fast. | ✅ | ✅ |
| 5 (premium) | **Sora 2 / Pro** | `sora-2` / `sora-2-pro` | Best physics/realism + synced native audio; pricier, no free tier. Good "hero clip" option. | ✅ | ✅ |

**Default = Veo 3.1 Fast (`veo3_fast`)**: it is the sweet spot of native-audio quality, image-to-video support (single keyframe *and* first/last frame *and* reference), vertical-native output for ad formats, and low cost, on Kie's most mature video endpoint.

**Native-audio landscape:** Veo 3.1, Kling 3.0, Seedance 2.0, Sora 2, and Hailuo 2.3 all generate audio natively now. This is the single biggest shift vs. the pixr pipeline, which ran Seedance **silent** and overlaid ElevenLabs VO. For v1 the native-audio toggle should default **on** for models that support it, with a clear "silent (BYO audio)" option that maps to each model's `generate_audio:false` / `sound:false` flag.

**Pricing ballpark:** credits bill at **$0.005/credit (200 credits = $1)**. An 8s Veo 3 Fast clip ≈ $0.30–0.40; Veo 3 Quality ≈ $1.25–2.00; Kling ≈ $0.07/s; Seedance 2.0 Fast ≈ $0.02/s; Hailuo 2.3 1080p ≈ $0.40/clip. Sora 2 is the priciest household name.

**API pattern:** async job — `POST /api/v1/jobs/createTask` returns a `taskId`; then either poll `GET /api/v1/jobs/recordInfo?taskId=...` (states: `waiting → queuing → generating → success|fail`) or supply `callBackUrl` for a webhook. Rate limit ~**20 create requests / 10s / account**. Errors: 401 unauthorized, 402 insufficient credits, 429 rate-limited, 500 server error (Veo also has a dedicated `/api/v1/veo/generate` endpoint).

**Biggest change vs the pixr Kie client:** (1) Seedance now defaults to **native audio on** and adds first/last-frame + up to 9 reference images + reference video/audio (pixr hard-coded `generate_audio:false` and one `reference_image_urls`); (2) the whole modern video roster (Veo 3.1, Kling 3.0, Sora 2, Hailuo, Wan) is available through the *same* unified `createTask` the pixr client already spoke — so adding models is mostly a slug + param-map change, not a new transport.

---

## 2. Per-model capability table

All models are invoked through `POST https://api.kie.ai/api/v1/jobs/createTask` with `{ model, input, callBackUrl }` **unless noted** (Veo also has a dedicated endpoint). "Upstream" = capability from the provider's own docs, not confirmed on Kie's page (Kie's exposed params may be a subset).

### Google Veo 3.1 — `veo3` / `veo3_fast` / `veo3_lite`
Source: https://docs.kie.ai/veo3-api/generate-veo-3-video , https://docs.kie.ai/veo3-api/quickstart , https://docs.kie.ai/veo3-api/extend-video

- **Endpoint:** dedicated `POST https://api.kie.ai/api/v1/veo/generate` (also surfaced in the Market). Extend endpoint exists for lengthening clips.
- **Image-to-video:** ✅ `imageUrls` array (**1–3 images**). `generationType`: `TEXT_2_VIDEO`, `FIRST_AND_LAST_FRAMES_2_VIDEO`, `REFERENCE_2_VIDEO`. So it supports single keyframe, first+last frame, and reference-image (character/style) modes.
- **Native audio:** ✅ "All videos ship with background audio by default." Veo 3 is known for synced dialogue + SFX (upstream).
- **Duration:** `4`, `6`, or `8` s (default 8).
- **Aspect ratio:** `16:9`, `9:16`, `Auto` (default 16:9).
- **Resolution:** `720p`, `1080p`, `4k` (default 720p).
- **Other params:** `watermark`, `enableTranslation` (auto-translate prompt to EN), `callBackUrl`, `seeds` [verify].
- **Tiers:** `veo3` (quality), `veo3_fast` (default, cheaper), `veo3_lite` (cheapest/high-volume).

### Kling 3.0 — `kling-3.0/video`
Source: https://docs.kie.ai/market/kling/kling-3-0 , https://docs.kie.ai/market/kling/motion-control-v3

- **Image-to-video:** ✅ `image_urls` = first/last frame images (optional when using element references).
- **Reference / character consistency:** ✅ `@element_name` syntax in the prompt; **max 3 elements** per task; image elements accept **2–4 image URLs** (JPG/PNG, ≤10MB each) for character consistency across shots. Also a dedicated **motion-control** variant.
- **Native audio:** ✅ `sound` boolean (defaults **true** in multi-shot mode); native audio up to 15s.
- **Multi-shot:** ✅ `multi_shots` boolean → pass an **array of prompts** for multi-shot storytelling.
- **Duration:** integer **3–15** s.
- **Aspect ratio:** `16:9`, `9:16`, `1:1` (auto-adapts when `image_urls` given).
- **Resolution (`mode`):** `std` = 720p, `pro` = 1080p, `4K` = 2160p (per AR: 16:9 / 9:16 / 1:1).

### ByteDance Seedance 2.0 — `bytedance/seedance-2` (+ `-fast`, `2.5`, `1.5-pro`)
Source: https://docs.kie.ai/market/bytedance/seedance-2 , https://docs.kie.ai/market/bytedance/seedance-2-fast

- **Image-to-video:** ✅ `first_frame_url` and/or `last_frame_url` (URL or `asset://{assetId}`). Three mutually-exclusive modes: first-frame I2V, first+last-frame I2V, or multimodal reference generation.
- **Reference / character consistency:** ✅ `reference_image_urls` (**max 9**; jpeg/png/webp/bmp/tiff/gif), `reference_video_urls` (**max 3**, 2–15s, mp4/mov), `reference_audio_urls` (**max 3**, 2–15s, wav/mp3). This is the richest keyframe/reference surface of any model here.
- **Native audio:** ✅ `generate_audio` boolean, **default `true`** (was run silent by pixr).
- **Duration:** **4–15** s (default 5).
- **Aspect ratio:** `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `21:9`, `adaptive` (default 16:9).
- **Resolution:** `480p`, `720p`, `1080p`, `4k` (default 720p).
- **Other:** `nsfw_checker`, `web_search`, `prompt` 3–20,000 chars, `callBackUrl`.
- **`bytedance/seedance-2-fast`:** cheaper/faster variant, same param family.

### OpenAI Sora 2 — `sora-2` / `sora-2-pro` (+ Characters)
Source: https://docs.kie.ai/market/sora2/... (index confirmed via search; individual pages render as SPA and 404'd to automated fetch — **capability confirmed, param names [verify] on live docs**)

- **Variants:** `sora-2` (standard), `sora-2-pro` (higher quality), plus **Characters** and **Image-to-Video** / **Text-to-Video** modes.
- **Image-to-video:** ✅ (dedicated Image-to-Video page).
- **Native audio:** ✅ synced dialogue + ambient (Sora 2's headline feature, upstream).
- **Strength:** best physics/realism. No free tier; priciest of the household names.
- **Duration / AR / resolution:** [verify on the specific `sora2` doc pages].

### Hailuo / MiniMax 2.3 — `hailuo/...` (e.g. `2-3-image-to-video-pro`)
Source: https://docs.kie.ai/market/hailuo/2-3-image-to-video-pro (via search)

- **Image-to-video:** ✅ dedicated I2V Pro + Standard tiers.
- **Native audio:** ✅ (2.3 generation) [verify exact flag].
- **Strength:** character animation + facial expression / talking-head, avatar content.
- **Pricing:** ~80 credits (~$0.40) for a 1080p clip [verify].

### Wan 2.6 — `wan/2.6-*`
Source: https://kie.ai/market/image-to-video (via search)

- Variants: `Wan 2.6 Image-to-Video`, `Text-to-Video`, `Video-to-Video`, `2.6-flash-image-to-video`, `2-6-flash-video-to-video`.
- **Image-to-video:** ✅. Native audio / duration / AR: [verify on live docs]. Budget option.

### Runway — `runway/...`
Source: https://docs.kie.ai/runway-api/quickstart

- Dedicated Runway API surface for high-quality I2V/T2V. Params (Gen-3/Gen-4 family) [verify on live docs]. Traditionally **no native audio** (upstream). Lower priority for v1.

---

## 3. Pricing (credits → USD)

**Credit rate (primary anchor):** Kie bills at **$0.005 per credit** → **200 credits = $1.00**. Different models bill per-second, per-clip, or per-image; the unit is shown per model on the pricing page.
Source: https://kie.ai/pricing (403 to fetch), corroborated by https://skywork.ai/... and https://kie.ai/v3-api-pricing.

| Model | Kie price (per clip / rate) | Credits | Notes |
|-------|------------------------------|---------|-------|
| **Veo 3 / 3.1 Fast** | ~**$0.30–0.40** / 8s w/ audio | 60–80 | Recent update lowered Fast to ~60 cr ($0.30) [verify] |
| **Veo 3 / 3.1 Quality** | ~**$1.25–2.00** / 8s w/ audio | 250–400 | Recent update lowered to ~250 cr ($1.25) [verify] |
| **Kling 2.1** | Std **$0.125**/5s · Pro **$0.25**/5s · Master **$0.80**/5s | 25 / 50 / 160 | Kling 3.0 similar tiered ($0.07/s cited) [verify] |
| **Seedance 2.0 Fast** | ~**$0.022**/s (~$0.11 for 5s) | ~4.4/s | Cheapest production-grade [verify] |
| **Seedance 2.0** | between Fast and premium [verify] | — | Native audio default-on |
| **Hailuo 2.3** | ~**$0.40** / 1080p clip | ~80 | [verify] |
| **Sora 2 / Pro** | priciest household name [verify] | — | No free tier |
| **Runway / Wan** | budget–mid [verify] | — | — |

> Kie claims ~30% below official API pricing on most models, up to 60–70% on select high-demand models. **Treat every USD figure above as [verify] against the live pricing page before hard-coding.**

---

## 4. API shape

**Unified async job pattern** (all Market models):

1. **Create:** `POST https://api.kie.ai/api/v1/jobs/createTask`
   Headers: `Authorization: Bearer <KIE_API_KEY>`, `Content-Type: application/json`
   Body: `{ "model": "<slug>", "input": { ...model params... }, "callBackUrl": "<optional webhook>" }`
   Returns: `{ code, msg, data: { taskId } }`.
2. **Get result — two options:**
   - **Poll:** `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<id>` → `data.state` ∈ `waiting | queuing | generating | success | fail`; on `success`, `data.resultJson` is a JSON string containing `resultUrls[]` (video URL). On `fail`, `data.failCode` / `data.failMsg`.
   - **Webhook:** supply `callBackUrl` in createTask; Kie POSTs completion, "eliminating the need for polling" (recommended for production).
3. **Credit check:** `GET https://api.kie.ai/api/v1/chat/credit`.

**Veo exception:** Veo 3.x also has a **dedicated endpoint** `POST https://api.kie.ai/api/v1/veo/generate` (+ get-details + extend), separate from the generic jobs endpoint.

**Rate limits:** ~**20 generation requests per 10 seconds per account** (from the Getting-Started guide).

**Error / status semantics:** `401` unauthorized (bad key), `402` insufficient credits, `429` rate-limited, `500` server error. Job-level failures surface as `state:"fail"` + `failCode`/`failMsg` (Kie relays upstream provider errors, incl. safety blocks, in `failMsg`). HTTP 200 on createTask means **accepted, not complete**.

Sources: https://docs.kie.ai/ , https://docs.kie.ai/market/quickstart , https://docs.kie.ai/market/common/get-task-detail

---

## 5. Diff vs the prior integration (pixr client, `archive/pixar-v2`)

The torn-out pixr pipeline's Kie client lives at **`archive/pixar-v2:scout/src/pixar/kie-client.ts`** (also `archive/pixar-v2:scout/src/image-ads/image-gen.ts` and the PowerShell reference `archive/pixar-v2:contrib/mcastelli99/2026-05-13/code/generate_videos_daily_glide.ps1`).

**What the pixr client used:**
- **Same transport** we'd reuse today: unified `POST /api/v1/jobs/createTask` + poll `GET /api/v1/jobs/recordInfo`, Bearer auth, `resultJson.resultUrls[0]`. Confirmed identical to the current image stack.
- **Video model:** `bytedance/seedance-2` (`MODEL_VIDEO_SEEDANCE`), called via `buildClipRequest` with:
  `{ prompt, aspect_ratio: "9:16", resolution: "720p", duration, generate_audio: false, reference_image_urls: [<one image>] }`.
  **Audio was hard-coded OFF** — with defense-in-depth throwing if a caller passed `generateAudio !== false` — per Mario's "AUDIO_ARCHITECTURE.md" (Seedance audio drifted pacing). Audio came from a **separate ElevenLabs direct call** (`kieGenerateVoiceover` hits `api.elevenlabs.io/v1/text-to-speech/{voice_id}` directly, **not** Kie — an earlier attempt at ElevenLabs-via-Kie 422'd on the slug `elevenlabs/text-to-speech-multilingual-v2`).
- **Image models:** `gpt-image-2-text-to-image` (T2I) and `gpt-image-2-image-to-image` (I2I, via `input_urls: [refUrl]`), with `aspect_ratio`, `output_format:"png"`, `resolution:"1K"`.
- **Retry/robustness:** exponential backoff on transient 5xx / "try again later" / rate-limit, each retry minting a fresh task; video poll timeout 20 min, image 7 min.

**What has changed in Kie's current API vs that client:**
1. **Seedance native audio is now default-ON.** Current `bytedance/seedance-2` defaults `generate_audio:true`; the pixr "silent + overlay ElevenLabs" architecture is now **optional**, not required. v1 can drop the separate VO stage for models with native audio (or keep silent mode as an explicit toggle).
2. **Seedance keyframe/reference surface expanded dramatically.** Then: one `reference_image_urls[]`. Now: `first_frame_url` + `last_frame_url` (true first/last-frame I2V) **plus** `reference_image_urls` (max 9), `reference_video_urls` (max 3), `reference_audio_urls` (max 3), `web_search`, `nsfw_checker`. Duration widened to 4–15s, resolution adds 480p/1080p/4k, AR adds 1:1/4:3/3:4/21:9/adaptive.
3. **The whole modern roster is now on the same endpoint.** pixr only ever drove Seedance for clips. Today Veo 3.1 (also its own `/veo/generate`), Kling 3.0, Sora 2, Hailuo 2.3, Wan 2.6 are all reachable via the same `createTask` + slug the pixr client already spoke — so the Video-node picker is largely a **slug + input-schema map**, not new transport code.
4. **Webhook callbacks** (`callBackUrl`) are now first-class and recommended over polling for production; pixr was poll-only.
5. **ElevenLabs-via-Kie** remains awkward (pixr went direct); if the storyboard ever needs standalone VO, prefer the model's native audio or a direct ElevenLabs call rather than routing TTS through Kie.

---

## 6. Current image-node render stack (Scene Frames will likely reuse this)

The **working tree** (not the archive) drives Kie for images in two places, both via the identical unified `createTask` + `recordInfo` poll pattern:

- **`src/lib/modules/providers/image-generator/kie-nano-banana.ts`** — `KieNanoBananaProvider`, slug `"nano-banana-pro"` but **actually targets `gpt-image-2-text-to-image`** (`DEFAULT_MODEL`). Input: `{ prompt, nsfw_checker:false }` only — it does **not** send aspect_ratio/size (comment: model ignores them). createTask → poll `recordInfo` (2s interval, 120s timeout) → `resultJson.resultUrls[0]`. Maps safety failures to `SafetyFilterError`.
  ⚠️ **Naming mismatch worth flagging:** the provider is called "nano-banana-pro" but sends the `gpt-image-2-text-to-image` slug. Kie *also* offers real `nano-banana` and `seedream-4` image models — if Scene Frames wants Nano Banana quality, it must send the actual nano-banana slug, not this provider as-is.
- **`src/lib/meme/kie.ts`** — meme generator's image client. Same `gpt-image-2-text-to-image` slug, but sends `{ prompt, aspect_ratio:"1:1", resolution:"1K", output_format:"PNG" }`. Strict BYOK (member's own Kie key, no env fallback), 5-min poll timeout, one-shot 429 backoff.

**Endpoint shape confirmed in-repo:** `POST https://api.kie.ai/api/v1/jobs/createTask` + `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...`, Bearer auth, `resultJson.resultUrls[0]`. **This is the same transport a Video-node would use** — the Scene Frames stage can reuse this createTask+poll helper wholesale and only swap the model slug + input schema (and should pass `aspect_ratio`/`image_size` to models that honor them, unlike gpt-image-2).

Other Kie touch-points in the working tree (for reference): `convex/pipelineKeys.ts`, `convex/userKeys.ts`, `convex/lib/byok.ts` (BYOK key storage/resolution), `convex/doctor.ts` (key health check), `src/app/(dashboard)/settings/_components/pipeline-keys-tab.tsx` (Settings → Keys UI).

---

## Sources

Primary (Kie):
- https://docs.kie.ai/ (Getting Started — API pattern, rate limit 20/10s)
- https://docs.kie.ai/market/quickstart (unified createTask / recordInfo / callBackUrl)
- https://docs.kie.ai/market/common/get-task-detail
- https://docs.kie.ai/veo3-api/generate-veo-3-video , /veo3-api/quickstart , /veo3-api/extend-video (Veo 3.1)
- https://docs.kie.ai/market/kling/kling-3-0 , /market/kling/motion-control-v3 (Kling 3.0)
- https://docs.kie.ai/market/bytedance/seedance-2 , /market/bytedance/seedance-2-fast (Seedance 2.0)
- https://docs.kie.ai/market/sora2/... (Sora 2 — index confirmed; per-page params [verify])
- https://docs.kie.ai/market/hailuo/2-3-image-to-video-pro (Hailuo 2.3)
- https://docs.kie.ai/runway-api/quickstart (Runway)
- https://kie.ai/ , https://kie.ai/market , https://kie.ai/pricing , https://kie.ai/v3-api-pricing (403 to automated fetch — pricing via secondary corroboration)

Pricing corroboration (secondary, anchored to Kie's $0.005/credit):
- https://skywork.ai/skypage/en/Kie.ai-API...1976113187525816320 (credit rate $0.005; error codes 401/402/429/500)
- https://devtk.ai/en/blog/ai-video-generation-pricing-2026/
- https://fluxnote.io/guides/ai-video-model-pricing-comparison-2026
- https://evolink.ai/blog/best-ai-video-generation-models-2026-pricing-guide

Local code (this repo):
- Working tree: `src/lib/modules/providers/image-generator/kie-nano-banana.ts`, `src/lib/meme/kie.ts`
- Archive tag: `archive/pixar-v2:scout/src/pixar/kie-client.ts`, `archive/pixar-v2:scout/src/image-ads/image-gen.ts`
