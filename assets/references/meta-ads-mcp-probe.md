# Meta Ads MCP — live probe findings (wayfinder #563)

Probed 2026-07-14 against Brad's real accounts via the **official Meta Ads MCP**
(`https://mcp.facebook.com/ads`, remote HTTP MCP, OAuth-in-browser). All calls
read-only. Primary probe account: **Matt Beard FPI** (act `…820395`, ~$62.9k
spend / 1.07M impressions in the trailing 90 days). Feeds the enrichment-path
ticket (#565) and the bridge contract (#566) on map #562.

## TL;DR for the specs

1. **The winner query works end-to-end**: per-ad `amount_spent`, `results`
   (labeled with the result type), `cost_per_result`, `ctr`, `cpm`,
   `impressions`, `lead`, `purchase_roas` over any date preset or custom
   range, sortable by any metric. A "top ads by spend, then threshold on
   cost-per-result" winner definition is executable **agent-side over sorted
   results** — server-side *metric filtering* consistently 500s (see gotchas).
2. **The Ad Library cross-reference exists but is fuzzy**: `ads_library_search`
   by `page_ids` returns the public **`adArchiveId` directly** (the result `id`;
   `ad_snapshot_url` = `facebook.com/ads/library/?id=<archiveId>`). But library
   results carry only `ad_creative_link_title` + creation/delivery timestamps —
   **no body text, no ad-account ad id** — so account-ad → library-ad mapping is
   a **fingerprint match** (creative `title` == library `ad_creative_link_title`,
   ± creation-time proximity), not a direct key. No tool/field exposes
   `adArchiveId` from the account side.
3. **Images are fully retrievable; videos are not.** Image detail gives a
   signed full-res CDN `url` (+ `url_128`, `permalink_url`, dimensions) —
   downloadable now, but the URL **expires** (`oe=` param). Video detail gives
   `length`, poster `picture`, and a *relative* `permalink_url` — **no source /
   download URL**. This confirms the map's scrape-first asset strategy, with
   MCP image-pull as gap-filler and **no MCP gap-filler for video files**.
4. **Naming comes through intact** at every level (`name` on ad/adset/campaign,
   creative `name`, video `title` — titles even encode aspect ratios like
   `-9x16`). Naming-conventions guidance can rely on free-text ad names plus
   `campaign_id`/`adset_id` for hierarchy grouping.
5. **Setup surface is one URL**: add `https://mcp.facebook.com/ads` as a remote
   MCP server; OAuth happens in the browser with the user's own Facebook login.
   Per-account gates: `is_ads_mcp_enabled` and `is_queryable` (disabled/flagged
   accounts come back with a human-readable `not_queryable_reason`).

## Tool-by-tool findings

### `ads_get_ad_accounts`
Returns **every** account the user can access — Brad sees 13 across 5
businesses (own + client accounts), each with `ad_account_id`,
`ad_account_name`, owning `business_id`/`business_name`, `account_status`,
`currency`, `is_ads_mcp_enabled`, `is_queryable`, `not_queryable_reason`.
Two disabled accounts surfaced with the flag reason string. **Multi-account
selection is a real UX step the skill must handle** (fog item on the map,
now sharpened). Account names can be empty strings.

### `ads_get_ad_entities` (the insights workhorse)
- Levels: `account` / `campaign` / `adset` / `ad`. Metrics require
  `date_preset` (e.g. `last_90d`, `maximum`) or `time_range` JSON;
  `time_increment` gives time series.
- Real sample (ad level, last_90d, sorted `amount_spent_descending`):

  ```json
  {
    "id": "120241083993850557",
    "name": "PT-Intro-me-and-ai-Image-Promoted",
    "effective_status": "ADSET_PAUSED",
    "creative_id": "952613677477713",
    "campaign_id": "120239743848310557",
    "adset_id": "120241083975980557",
    "amount_spent": "$8,980.38 USD",
    "results": {"value": "98 (Website appointments scheduled)"},
    "cost_per_result": {"value": "$91.64 USD (Website appointments scheduled)"},
    "impressions": "212,816", "ctr": "4.20%", "cpm": "$42.20 USD",
    "lead": "7", "created_time": "April 17, 2026"
  }
  ```
- **Values are formatted display strings**, not numbers (`"$8,980.38 USD"`,
  `"4.20%"`, `"Not available"` for zero-delivery ads). Exception: account
  level also returns numeric `amount_spent_cents`. The bridge/skill must
  parse display strings (or treat them as verdict-snapshot text, which is
  what the map's verdict-snapshot design wants anyway).
- `results`/`cost_per_result` self-label the optimization outcome ("Website
  appointments scheduled", "Website purchases") — ideal raw material for the
  verdict snapshot, and it makes result-type explicit across mixed-objective
  accounts.
- Field catalog via `ads_get_field_context`: `spend` aliases `amount_spent`;
  `lead`, `purchase_roas`, `results`, `cost_per_result`, `clicks`, video
  metrics (`video_thruplay_watched_actions`, `video_p50_watched_actions` —
  metric-only, not filterable/sortable) exist. **Not present**: `purchase`,
  `cost_per_purchase`, `cost_per_lead`, `roas`, `campaign_name`/`adset_name`
  (use ids + a campaign-level call), `link_click`, `hook_rate`,
  `ad_archive_id`, `preview_shareable_link`, `effective_object_story_id`
  (creative-side only).
- Hierarchy: ads carry `campaign_id` + `adset_id`; `objective` lives on
  campaign/ad, `optimization_goal` on adset.

### `ads_get_creatives`
The content payload. By id, returns `body` (primary text, full), `title`
(headline), `call_to_action_type`, `object_type`, `image_hash`, `image_url`
(signed CDN), `thumbnail_url`, `object_story_id` +
`effective_object_story_id` (`<pageId>_<postId>`) and
`effective_instagram_media_id`. Listing mode returns only
id/name/account_id/status — **must re-fetch by `creative_ids` for content**.
`link_url` was absent on the probed `SHARE`-type creative (link lives in the
story post). The `<pageId>_<postId>` story id is the strongest identity hook
for enrichment (post permalink = `facebook.com/<pageId>/posts/<postId>`).

### `ads_get_ad_images` / `ads_get_ad_videos`
- Image by hash: `url` full-res signed CDN JPEG + `url_128` + `permalink_url`
  + `width/height` + timestamps. Downloadable **now**; URL expires later.
- Video by id: `title`, `length` (seconds float), poster `picture`, relative
  `permalink_url` (`/<pageId>/videos/<videoId>/…`). **No source URL.**
- **Gotcha (both tools + creatives): the documented "omit `fields` → all
  fields" default is broken on by-id lookups** — a `video_ids` lookup without
  `fields` returned only `{id}`. Always pass explicit `fields`.

### `ads_library_search`
By `page_ids` (page id from the creative's `effective_object_story_id` prefix
or `ads_get_ad_account_pages`): returns per ad `id` (**= adArchiveId**),
`page_id`, `page_name`, `ad_creative_link_title`, `ad_creation_time`,
`ad_delivery_start_time`, `ad_snapshot_url`, `currency`, plus
`estimated_total_count` (48 for the probed page). Requires the caller to have
an active ad account. No body text, no media URLs → cross-reference by
title + time fingerprint, then hand the `adArchiveId` to the existing
ScrapeCreators pipeline for full public payload (media, transcription).

### `ads_get_ad_preview`
Returns an actual **rendered creative image** as in-context image content +
an authenticated, expiring `preview_url` iframe (business.facebook.com). Good
for HITL confirmation inside the skill ("is THIS the winner you mean?");
not a durable asset source.

### `ads_get_ad_account_pages`
Returns `page_id`s but `page_name` came back `"(unknown)"` on the probed
account — get the human page name from the library search result instead.

## Gotchas / reliability

- **Metric filtering 500s.** Every `filtering` on `ad.amount_spent`
  (GREATER_THAN, dollar or cent values) → `Internal Server Error`, repeatably.
  Attribute filters (`ad.effective_status IN [ACTIVE]`) work. Metric *sorting*
  works. → Winner definitions execute as: sort by metric server-side, pull top
  N, threshold agent-side.
- **Transient 500s** happen on entity queries too (one wide 12-field call
  failed once, then an identical narrower call succeeded; a later identical
  call with the same fields also succeeded). Retry-once is a sane default.
- Only ONE `breakdowns` value per call; only documented params exist.
- The `ads_insights_*` tools (`performance_trend`, `advertiser_context`, etc.)
  are opinionated analysis wrappers (trend narratives, funnel context), not
  raw data — the skill's mining procedure should stay on `ads_get_ad_entities`.
- Every tool takes an `advertiser_request` verbatim-user-words param — a
  Meta-side audit surface; the skill should pass the user's actual ask through.

## What this settles for the open tickets

- **#565 (enrichment)**: key = fingerprint match into Ad Library
  (`title` + creation time → `adArchiveId`) → ScrapeCreators; MCP `image_url`
  is the image gap-filler (download immediately — signed URLs expire); there is
  **no video-file gap-filler** via MCP — video enrichment depends on the ad
  still being scrapeable (or the post being public via
  `effective_object_story_id`).
- **#566 (bridge contract)**: payload fields available agent-side per winner:
  ad id, name, campaign/adset ids, creative id, body, title, CTA type,
  story/IG ids, image hash + bytes, video id + length + poster, metrics as
  display strings (+ result-type labels), account id/currency, page id,
  matched `adArchiveId` (best-effort). Numbers arrive as formatted strings —
  the contract should either accept snapshot strings verbatim or require the
  agent to parse.
- **#564 (interview)**: winner definitions must be expressible as
  sort-metric + date-window + agent-side thresholds; `results` self-labeling
  means the definition can be per-result-type; multi-account users (13 visible
  here) need an explicit account-selection step.
