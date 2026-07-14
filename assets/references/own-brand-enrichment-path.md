# Own-Brand Winners — enrichment path design (wayfinder #565)

Designed 2026-07-14 from the [MCP probe findings](meta-ads-mcp-probe.md) (#563)
plus a code audit of the live swipe rail (`scout/src/scrapecreators.ts`,
`scout/src/trigger/swipe-mine.ts`, `swipe-transcribe.ts`, `image-classify.ts`,
`convex/swipeAds.ts`, `convex/imageClassification.ts`). Answers: what is the
exact path from a designated winner (ad-account identity) to a complete stored
package? Feeds the bridge contract (#566) and the build specs (#567).

## TL;DR decisions

1. **Match server-side on ad copy, not agent-side on the MCP title fingerprint.**
   The bridge payload carries the account-side ground truth (body, title,
   created_time, format, page id); a new import task scrapes the brand's own
   page once via the existing `fetchCompanyAds` and matches winners to library
   ads by **normalized body+title equality** (tiebreak: earliest `start_date`).
   Full ScrapeCreators snapshots include body text — a far stronger key than
   the library-search `title + time` fingerprint the probe had to settle for,
   and it drops `ads_library_search` from the skill entirely.
2. **One new Trigger task (`own-brand-import`), everything downstream as-is.**
   The task reuses the scrapecreators.ts helpers + the `/api/v2/swipes/batch`
   upsert, stores **only matched winners**, then fires the existing
   `swipe-transcribe` and `image-classify` sweeps, which pick own-brand rows up
   with zero changes (both sweep global "missing transcript" / "unclassified"
   states).
3. **Gap-filler = agent-pushed assets for unmatched winners** (ad stopped
   running): text is always complete from MCP; images are downloaded by the
   agent immediately (signed CDN URLs expire) and uploaded as bytes via the
   existing Convex `generateUploadUrl` pattern; **video files have no MCP
   source — the skill asks the user for their own creative file** (it's their
   ad), else the package is stored partial.
4. **Mirror winner media into Convex storage at import.** fbcdn URLs expire;
   competitor rows survive because the daily re-scrape refreshes them, but
   winners are long-lived fuel imported once. Store the storage **serve URL in
   the existing `imageUrl`/`videoUrl` fields** so every downstream consumer
   (pickers, classify, transcribe, gallery) works unchanged.
5. **Own-brand `brands` rows must be flagged out of the daily swipe-mine cron**
   (`isOwnBrand: true`, mine filters it): otherwise the nightly sweep scrapes
   the user's whole page and stores every active ad — violating winners-only.
6. **Completeness is an explicit stored field**, not derived: `complete` |
   `partial` (+ what's missing), surfaced amber in the UI tab (the #478
   partial-delivery pattern).

## Stage 0 — what the agent holds per winner (input to the bridge)

Per the probe, after the winner interview designates ads, the agent can gather
via MCP (`ads_get_ad_entities` + `ads_get_creatives` + `ads_get_ad_images` /
`ads_get_ad_videos`, all with explicit `fields`):

| Field | Source | Notes |
|---|---|---|
| account ad id, name, campaign/adset ids | entities | hierarchy + provenance |
| `created_time` | entities | matching tiebreak + daysRunning fallback |
| body (primary text), title (headline), CTA type | creative | ground truth for matching |
| `effective_object_story_id` (`<pageId>_<postId>`) | creative | **page id prefix** = scrape target |
| image hash → full-res signed URL | ad_images | **download immediately**, expires |
| video id, length, poster URL | ad_videos | no source URL — cannot download |
| metrics as display strings + result-type labels | entities | verdict snapshot material |

The bridge payload (#566) should carry all of the above per winner, plus the
page id once per import.

## Stage 1 — matching: winner → `adArchiveId`

Runs inside `own-brand-import` (server-side, ScrapeCreators BYOK key snapshot
exactly like `swipe-mine`'s manual-run pattern):

1. `fetchCompanyAds(pageId)` — one paginated scrape of the user's own page.
   Returns full snapshots: `body.text`, `title`, `start_date`, media URLs,
   `collation_count`.
2. For each winner: **normalize** (trim, collapse whitespace, strip zero-width
   chars, normalize curly quotes) and match on **body equality**; require
   title equality too when both sides have a title.
3. Ambiguity: multiple library ads with identical copy are creative variants /
   republishes — any is acceptable (same creative); pick the **earliest
   `start_date`** (longest `daysRunning`, best longevity signal for pickers).
4. Fallback when the account creative has no body (some `SHARE`-type creatives
   keep copy on the story post): match on unique title + `created_time`
   proximity (±72h). Non-unique → treat as unmatched (gap-filler), never guess.
5. Matched → optionally `fetchAdLibraryAdById(archiveId, get_transcript=true)`
   for the inline transcript (the idea-ad-library / workflow-executor pattern);
   store it at insert so most video winners never wait for the transcribe cron.

**Failure modes:** page scrape empty (wrong page id, zero active ads) → all
winners unmatched → gap-filler; the Ad Library only lists **running** ads for
non-political advertisers, so any stopped winner is *expected* to be unmatched
— that's the designed-for case, not an error. One spec-time item:
`fetchCompanyAds` hardcodes `country: "US"` — the import path must make this
configurable (or "ALL" if the endpoint accepts it) or non-US advertisers will
false-unmatch.

## Stage 2 — gap-filler protocol (unmatched winners)

What MCP can and cannot supply fills the row directly:

- **Copy**: body/title/CTA come from the creative — always complete. No
  library `linkUrl`/`linkDescription`; acceptable loss (fields stay empty).
- **Image**: the agent downloads the signed CDN URL **at interview time** (not
  at push time — it expires) and the CLI uploads bytes: request an upload URL
  (the `creativeSuite.generateUploadUrl` service pattern), PUT the file, record
  the storage id. Import stores the serve URL in `imageUrl`.
- **Video**: no MCP file. Ladder: (a) the skill asks the user to point at
  their own creative file — they made the ad, they usually have it — CLI
  uploads it; (b) no file → store partial: copy + poster image (poster URL
  *is* downloadable now) and no transcript. Once a video lands in storage, its
  serve URL in `videoUrl` makes the existing `pendingTranscripts` sweep
  transcribe it automatically (note: `transcribeVideo` rejects >25MB —
  acceptable v1 cap, flag oversize uploads as partial-transcript).
- **Identity**: gap-filled rows get a synthetic archive id `own:<accountAdId>`
  — stable, unique, satisfies the `by_adArchiveId` dedup index, can't collide
  with numeric library ids. `isActive: false`, `startDate` from
  `created_time`.

## Stage 3 — reuse audit

| Piece | Verdict |
|---|---|
| `scrapecreators.ts` helpers (fetch, extract*, classifyFormat, transcribe) | **as-is** — the import task composes them |
| `/api/v2/swipes/batch` → `swipeAds.upsertBatch` | **as-is** — winners-only array in, dedup by archive id |
| `swipe-transcribe` (`pendingTranscripts` sweep) | **as-is** — global format=video-missing-transcript scan includes own-brand rows; also fire it at import end |
| `image-classify` (`getUnclassifiedSwipeAds`) | **as-is** — sweeps `classificationStatus === undefined`; own-brand rows enter automatically |
| Consumption (`swipeAdToText`, pickers, `listForWorkspacePublic`) | **as-is** — own-brand rows are swipeAds under a workspace brand; they flow into every picker. Spec check (per map): run-dialog top-N ranks by `daysRunning` — matched winners inherit real longevity, gap-filled ones get `created_time`-derived values, and the winner fields below let pickers boost designated winners explicitly |
| `swipe-mine` task | **not reused** (fetch-everything shape violates winners-only); its building blocks are |
| Daily `swipe-mine` cron | **needs a filter**: skip `isOwnBrand` brands (decision 5) |
| New code | one Trigger task `own-brand-import` + one HTTP route to start it (BYOK key snapshot like `swipe.startMineRun`) + the CLI ingestion command (#566's contract) |

## Stage 4 — completeness contract

A package is **usable generative fuel** when:

- **every winner**: verdict snapshot (composed sentence + metric display
  strings) — non-negotiable, it's the point of the feature — plus body or
  title, and provenance (account ad id, campaign/adset ids).
- **image winner**: + full-res image (storage-mirrored). Missing image →
  `partial` (copy bots still work; ref-match image engines can't use it).
- **video winner**: + transcript (from library inline, sweep, or uploaded
  file). Video file itself is desired (gallery, future variations) but
  transcript is the fuel; no transcript AND no video → `partial`.

Store it explicitly: `enrichmentStatus: "complete" | "partial"` +
`enrichmentMissing: string[]` (e.g. `["video-file", "transcript"]`), set by the
import task, re-evaluated when a sweep fills a gap. UI shows amber on partial
rows with the missing list (the #478 pattern).

New optional `swipeAds` columns this implies for #567 (all additive):
winner verdict text + metrics snapshot, `designatedAt`, source account
ad/campaign/adset ids, `enrichmentSource: "library-match" | "agent-push"`,
`enrichmentStatus` / `enrichmentMissing`, `imageStorageId` / `videoStorageId`
(lifecycle), plus `brands.isOwnBrand`.

## Open items handed to #566 / #567

- Bridge contract (#566): exact payload shape per winner (Stage 0 table), how
  the CLI transports image/video bytes (upload-URL handshake vs multipart),
  idempotency on re-push (upsert by account ad id → synthetic/matched archive
  id), and where the "ask the user for the video file" step lives in the skill.
- Spec (#567): country parameter on the import scrape; winner-boost rule in
  top-selection heuristics; amber partial UI in the Swipe Mining tab; whether
  matched winners' media also gets storage-mirrored at import (recommended:
  yes, both paths, decision 4).
