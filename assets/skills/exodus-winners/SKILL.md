---
name: exodus-winners
description: Mine the member's OWN Meta ad account for its winning ads and import them into Exodus as generative fuel. The member's Claude Code session holds BOTH the official Meta Ads MCP (their Facebook login, their machine) and the Exodus CLI; this skill orchestrates the whole journey — point them at the Meta MCP, pick one ad account, run a NO-NUMBERS winner-definition interview, mine the account via the MCP, confirm each pick visually, then push a winner-package JSON with `npx @aicopycoders/exodus winners import` and run the two-phase video gap-filler. Only invoke when the user has explicitly invoked Exodus: they said "exodus" in the request ("exodus, import my winning ads", "exodus winners", "exodus, mine my ad account for winners", "exodus, which of my own ads are winners"), named this skill or /exodus-winners, ran an `npx @aicopycoders/exodus winners` command, or the `exodus` hub skill routed here. Never claim generic asks ("what are my best ads", "pull my Meta ads", "analyze my Facebook ads") without Exodus context — in shared folders those may belong to the user's other tools; if the user did not say exodus, this skill is not for them. This is the member's OWN account's winners, NOT competitor swipes — competitor swipe mining lives on the dashboard's Swipe Mining surfaces, not here. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus.
---

```operator-guide
Subcommands:
  exodus winners import <file.json | ->  [--dry-run] [--no-wait] [--json]   Push a winner package (- reads stdin)
  exodus winners status <importId>       [--json]                           Re-poll an import later
  exodus winners list                    [--json]                           Winners Exodus already holds

Key flags:
  --dry-run   Local schema check + server dry-run: would-create vs would-update per winner,
              plus a Scrape Creators key warning if it's missing. Zero writes, no media upload.
  --no-wait   Return the importId immediately instead of polling to outcomes
  --json      Machine-readable output

Facts baked into the CLI:
  • Scopes to your active brand (exodus brand current). Switch with the exodus-brand skill.
  • Requires the member's Scrape Creators key (Settings → Keys) — the own-page match scrape bills them.
  • asset paths in the package resolve RELATIVE TO THE JSON FILE'S FOLDER.
  • Re-push never duplicates rows: verdict snapshots replace wholesale; gap-filled rows
    upgrade in place; winners absent from a re-push are untouched. It DOES re-run the
    billed match scrape + enrichment — push updates, don't push as a retry reflex.

Meta side: the official Meta Ads MCP (https://mcp.facebook.com/ads) supplies all account data.
This skill NEVER calls the Meta Graph API directly and NEVER calls ads_library_search.
```

# Winners — Mine Your Own Ad Account and Import the Champions

This is the agent-side journey for **Own-Brand Winners**: turn the member's real Meta ad account into a set of designated winners that Exodus stores as generative fuel. The session holds the member's **own Meta Ads MCP** (their Facebook OAuth) alongside the Exodus CLI — you drive both.

The member is a **creative strategist, not a media buyer**. This entire journey is data *collection and preparation* — the analysis happens later, server-side, on the stored winners. So the interview **never asks a single numeric question**: no budgets, no ROAS targets, no thresholds, no "top how many?". You infer the mechanics and confirm in plain language. Make that rule impossible to break — if you catch yourself about to ask for a number, stop and infer it instead.

The arc, in order: **MCP check → pick one account → winner-definition interview → mine via MCP → 30k-foot view → visual confirmation → write the package → dry-run → import → video gap-filler.** Persist the definition so re-mining re-asks nothing already settled.

## 0. Meta Ads MCP must be connected

Everything here reads from the **official Meta Ads MCP** — a remote MCP server at `https://mcp.facebook.com/ads`, OAuth'd in the user's browser with their own Facebook login. We don't own that flow; there is exactly one setup pointer and no troubleshooting beyond it.

**If the `ads_*` Meta tools are not present in this session, stop.** Tell the user to add `https://mcp.facebook.com/ads` as a remote MCP server and complete the browser OAuth, then come back. Do not attempt any workaround, any Graph API call, or any other connection method.

## 1. Account selection — the required first step, pinned forever

Call `ads_get_ad_accounts`. It returns **every** account the login can touch — often a dozen-plus across several businesses. For each: `ad_account_id`, `ad_account_name`, `business_name`, `is_queryable`, `not_queryable_reason`, currency.

- Show only **queryable** accounts (`is_queryable: true`). For any flagged one, surface its `not_queryable_reason` so the user understands why it's absent — don't silently drop it.
- **Account names can be empty strings** — fall back to the id and business name so the list is still legible.
- The user picks **one**. That account is **pinned** in the definition file (`adAccountId` + name) and is **never re-asked** and never allowed to silently drift. Multi-account handling beyond this single pin is out of scope — one account per definition file.

## 2. The winner-definition interview — prescriptive, no numbers

You are not collecting preferences here so much as confirming inferences. Four things get settled, and only one of them ever shows the user a choice.

**a) Objective → metric is invisible.** Ads group by their campaign **objective**; each group's success metric is the account's own self-labeled result type — Meta hands it to you already labeled (`results: {"value": "98 (Website appointments scheduled)"}`, `cost_per_result: {"value": "$91.64 USD (Website appointments scheduled)"}` — the string lives under `.value`). **Never ask the user to pick a metric.** The account already declared it. Offer one free-text escape hatch only — *"If your definition of a winner is different from 'the ads that drove the most results,' tell me in your own words."* — and record whatever they say **verbatim** as `customDefinition`, applied agent-side. Do not turn their words into a number.

**b) Funnel mapping is infer-then-confirm.** Propose, per campaign, an **awareness level** from the Schwartz five — `unaware` / `problem-aware` / `solution-aware` / `product-aware` / `most-aware` — inferred from the campaign objective plus the campaign/adset **names** (naming is read-only creative context; see §6). Present the whole proposed map **once** for a single confirm/adjust pass, then save it. On a re-mine, only **new** campaigns get proposed; already-mapped ones stay put.

**c) The winner rule is fixed — volume over efficiency, all-time, no caps.** State it, don't negotiate it:

> Within each objective group, over the account's full lifetime (`date_preset: "maximum"`), the winners are the **smallest set of ads that together carry ~80% of that group's lifetime results**, where each qualifying ad has **at least 10 results** (a materiality floor — one lucky conversion is not a winner). No top-N cap.

- **Union with per-format cuts.** Run the same 80%/≥10 rule three ways: **overall**, **within video only**, and **within image only**, then union the results. This guarantees both lanes populate even when one format dominates spend. Each winner records which cut(s) it cleared as `selectionBasis`: any of `overall` / `top-video` / `top-image`.
- **Flat curve honesty.** If contribution is flat — no elbow, results spread evenly across hundreds of ads — say so plainly and show the top contributors instead of pretending there's a clean winner set. Never fabricate outliers to hit the 80% line.

**d) There are no losers at v1.** You designate winners only. Don't ask about, or invent, a "worst ads" pass.

The defaults behind this rule (`window: "maximum"`, `resultsFloor: 10`, `contributionLine: 0.80`) live in the definition file and are **edited in the file, never interrogated**. Selection is **format-agnostic** — you never ask "video or image?"; the per-format cuts already guarantee top images *and* top videos import.

## 3. Mining mechanics — the MCP facts that make or break this

Mine on `ads_get_ad_entities`. These are hard-won live-probe facts; encode them into how you call, not into a doc you can look up later:

- **Sort server-side, threshold agent-side.** Metric *filtering* on `ads_get_ad_entities` consistently **500s** — never filter by a metric. Metric *sorting* works. Sort by **results descending** and pull **the complete group — every page** — over `date_preset: "maximum"`; you need the group's full results total (the 80% denominator), so a sorted prefix is never enough. Then apply the 80%/≥10 rule yourself in memory.
- **Retry once on a 500.** Transient 500s happen even on valid calls; an identical retry usually succeeds. Retry a failed call once before treating it as real.
- **Metric values are display strings, not numbers** — `"$8,980.38 USD"`, `"4.20%"`, `"Not available"` for zero-delivery ads. Keep them **verbatim** for the verdict snapshot. You still need to *rank* by them agent-side — parse a working copy for the math, but never mutate the string you store. (Account level also returns a numeric `amount_spent_cents` if you need a clean total.)
- **`results` / `cost_per_result` self-label the outcome** (`.value` = `"98 (Website appointments scheduled)"`). That label is the metric — carry it into `resultType`.
- **Hierarchy:** ads carry `campaign_id` + `adset_id`; `objective` lives on the **campaign**. There is no `campaign_name` at ad level — get campaign/adset names from a **campaign-level / adset-level call**, then join by id.
- **Always pass explicit `fields`** on every by-id lookup (`ads_get_creatives`, `ads_get_ad_images`, `ads_get_ad_videos`). The "omit fields → all fields" default is **broken** — a bare by-id lookup returns only `{id}`.
- **Creative content needs a re-fetch by `creative_ids`.** Listing mode returns ids/names only. A creative detail call gives `body` (primary text), `title` (headline), `call_to_action_type`, `image_hash`, `image_url` (signed CDN), and `effective_object_story_id` (`<pageId>_<postId>` — its **prefix is your page id**, the scrape target and own-brand row key).
- **`pageName` comes from the user, not from Meta.** The page tools can return `"(unknown)"` for the page name, and `ads_library_search` (which carries it) is off-limits — so once you have the page id, **confirm the page's name with the user in one line** ("This account posts as page 10715… — that's your <name> page, right?"). It names their own-brand entry in Exodus; don't guess it.
- **Non-US accounts need `country` set.** The package's `source.country` defaults to `US`, and a wrong country makes the server-side Ad Library match silently miss. Infer it from the account (currency, business) and confirm alongside the page name when it isn't clearly US.
- **Images: download the bytes at interview time, not push time.** `ads_get_ad_images` (by hash) returns a full-res signed CDN `url` that **expires** (watch the `oe=` param). Grab it while you're confirming the winner, save it locally, and reference the local file in the package.
- **Video: there is no download URL. Never promise one.** `ads_get_ad_videos` gives `title`, `length`, and a poster `picture` only — no source/download URL. Grab the **poster** image for video winners; the actual mp4 comes from the user in the gap-filler (§8).
- **One `breakdowns` value per call.** Stay on `ads_get_ad_entities` for raw data — the `ads_insights_*` tools are opinionated narrative wrappers (trend/funnel prose), not the numbers you're ranking.
- **Pass the user's real ask through `advertiser_request`** on each tool call — it's Meta's audit surface; give it the user's actual words.
- **Never call `ads_library_search`.** Winner↔Ad-Library matching happens **server-side in Exodus** after import; the old title-fingerprint approach is dead. Your job ends at the account data.

## 4. The 30,000-foot view first

Before you confirm a single ad, lead with the **account summary** — the strategist wants the shape before the specimens:

> "1,041 ads, 12,400 purchases all-time. 37 ads produced ~80% of them — and 29 of those 37 are video. That format skew is itself a finding."

The format skew, the count of winners, the share they carry — that framing *is* strategic value. Deliver it, then move to confirmation.

## 5. Visual confirmation — the human gate

This is a HITL gate; treat it like one. For each proposed winner, render it with **`ads_get_ad_preview`** (an actual in-context creative image) and show it. The strategist:

- **strikes** picks that don't belong,
- **adds** any obvious winner the rule missed,
- and may attach an optional free-text **note** per winner (`strategistNote`).

Their edits win over the algorithm. Don't argue the rule against their eyes — they made these ads. Only after this pass do you compose verdicts and write the package.

## 6. Naming is read-only

Campaign / adset / ad names feed two things: your **awareness inference** (§2b) and the winner's `sourceNames` as creative context. That's all. **No naming-conventions guidance** — nobody is asked to rename anything, and the account's naming hygiene is not your concern.

## 7. The verdict snapshot & the winner-package JSON

Every winner carries a **verdict snapshot** composed to the schema below. The metrics stay as **display strings verbatim** — never parsed into numbers in what you store — and you compose one plain-language sentence per winner. A **fresh snapshot is written on every re-mine; snapshots are never patched.**

```jsonc
{
  "version": 1,
  "source": {
    "adAccountId": "act_123…",
    "adAccountName": "Ground Co",
    "pageId": "10715…",              // scrape target + own-brand row key (from effective_object_story_id prefix)
    "pageName": "Ground Co",
    "country": "US",                 // optional, default US — non-US accounts false-unmatch otherwise
    "minedAt": "2026-07-14T18:30:00Z"
  },
  "winners": [
    {
      "accountAdId": "1202…",        // the natural key; REQUIRED
      "campaignId": "1201…",
      "adSetId": "1202…",
      "sourceNames": { "campaign": "…", "adSet": "…", "ad": "…" },  // verbatim, read-only
      "createdTime": "2025-11-02T…",
      "format": "video",              // "video" | "image"; REQUIRED
      "bodyText": "…",                // verbatim; bodyText OR headline required
      "headline": "…",                // optional
      "ctaType": "SHOP_NOW",          // optional
      "effectiveObjectStoryId": "pageId_postId",  // optional
      "verdict": {
        "sentence": "Winner by contribution: 2,214 purchases (6.2% of account) @ $18.20, all-time through Jul 2026",  // REQUIRED
        "resultType": "Purchases",         // the self-label from results.value's parenthetical
        "results": "2,214",                // Meta's display strings, never converted to numbers —
        "resultsShare": "6.2%",            //   resultsShare is the one YOU derive (share of group total)
        "spend": "$40,297",
        "costPerResult": "$18.20",
        "asOf": "2026-07-14",
        "objective": "OUTCOME_SALES",
        "awarenessLevel": "product-aware",       // from the confirmed mapping (§2b)
        "selectionBasis": ["overall", "top-video"],  // which cut(s) it cleared
        "strategistNote": "…"         // optional, from §5
      },
      "assets": {
        "imagePath": "./media/1202….jpg",          // optional — downloaded at interview time
        "videoPath": "./media/1202….mp4",          // optional — user-supplied file (gap-filler)
        "posterPath": "./media/1202…-poster.jpg"   // optional
      }
    }
  ]
}
```

All verdict metrics are display strings verbatim. `assets` is optional everywhere. A **malformed winner is rejected individually server-side** (with a reason in the ledger) — it never aborts the whole import.

## 8. Import — dry-run, push, then the video gap-filler

Run these in this exact order.

**1. Write the package to disk.** Put it at `state/own-brand-winners/import-<date>.json` (user-inspectable and re-runnable), with the interview-time downloaded media in a folder alongside it. **Asset paths are relative to the JSON file's folder** — so `./media/…jpg` next to `import-<date>.json` resolves correctly.

**2. Dry-run first, always:**

```bash
npx @aicopycoders/exodus winners import state/own-brand-winners/import-<date>.json --dry-run --json
```

Show the user the would-create vs would-update split. **If the dry-run reports the Scrape Creators key missing, surface it now** — a real import will fail without it; route them to Settings → Keys (scrapecreators.com). Fix any would-reject rows, then push for real:

```bash
npx @aicopycoders/exodus winners import state/own-brand-winners/import-<date>.json --json
```

Default polling waits for outcomes. Present the **per-winner outcome table** it returns — each row is `matched` / `gap-filled` / `partial (missing: …)` / `rejected (reason)` — plus the created-vs-updated split.

**3. The two-phase video gap-filler.** Do **not** open with "find me 12 mp4 files." Push everything first; the report names exactly which video winners came back `partial (missing: video-file)` (expected — MCP has no video download). Then ask the user for **just those** files — they made the ads, they usually have them. Write a **second import JSON** containing only the partial winners: copy each winner's **full object** from the first import file (the server validates every push the same way — a stripped-down winner missing its `verdict`, `format`, or copy is rejected, not merged), same `source` block, and add the `videoPath`. Re-push it — the idempotent upgrade path completes those rows in place (the identical verdict re-replacing itself is harmless):

```bash
npx @aicopycoders/exodus winners import state/own-brand-winners/gapfill-<date>.json --json
```

Pick gap-fill candidates by their `missing` array **containing** `video-file` — an unmatched video winner usually lists `transcript` too. The re-push fills the file gap, but transcription runs as a **separate sweep after the import finalizes**, so the row typically still reads `partial (missing: transcript)` right away. That's not a failure — tell the user, and re-check `exodus winners list` later for the transcript to land.

Any winner the user can't supply a file for **stays amber and visible** in `exodus winners list` — that's fine, not a failure.

**4. "What does Exodus already hold?" is `exodus winners list`** — never keep the imported-winners ledger agent-side; it lives server-side and this is how you read it.

**5. Re-push safety** (from the CLI itself): re-pushing never duplicates rows — verdict snapshots replace wholesale, gap-filled rows upgrade in place, winners absent from a re-push are left untouched. But it is not free: every push re-uploads referenced assets, re-runs enrichment, and re-fires the Scrape Creators match scrape (billed to the member) — so re-push when there's something to update, not as a retry reflex.

## 9. Definition persistence

Persist the interview to `state/own-brand-winners.json`, keyed by **brand slug** (`state/` survives skill refreshes). It holds:

- pinned `adAccountId` + name (§1),
- `campaignAwarenessMap` (§2b),
- editable `defaults` — `{ "window": "maximum", "resultsFloor": 10, "contributionLine": 0.80 }`,
- `customDefinition` (the §2a escape-hatch text, verbatim),
- `lastMinedAt`.

Re-running re-asks **nothing already pinned** — only genuinely new campaigns get a confirm pass. Losing the file costs a short re-interview, never duplicate rows (dedup is server-side on `accountAdId`). Defaults are changed by editing the file, never by interrogating the user.

## Failure handling

- **Meta `ads_*` tools not in the session** — stop and point at `https://mcp.facebook.com/ads` (§0). No workaround exists here.
- **`ads_get_ad_entities` 500 with a metric `filtering`** — that's the known filter bug, not a transient. Drop the filter, sort instead, threshold agent-side (§3).
- **Any tool 500s once** — retry the identical call once before reporting it.
- **A by-id lookup returns only `{id}`** — you omitted `fields`. Re-call with explicit `fields` (§3).
- **Signed image URL 403 / expired** — it lapsed since the interview. Re-fetch `ads_get_ad_images` and download again immediately.
- **Dry-run says Scrape Creators key missing** — real import will fail; Settings → Keys first.
- **`partial (missing: video-file)`** — expected for video winners; run the §8 gap-filler.
- **Import poll timed out** — the import is still running server-side; re-poll with `npx @aicopycoders/exodus winners status <importId>` rather than re-pushing.
- **Import auth / wrong brand** — `npx @aicopycoders/exodus doctor`, then confirm `npx @aicopycoders/exodus brand current` is the brand you mean (switch via the `exodus-brand` skill). Winners scope to the active brand.

## Not the right skill for

- **Competitor swipe mining** — this skill is the member's OWN ad account only. Mining competitors' ads lives on the dashboard's **Swipe Mining** surfaces (and the CLI swipe commands), not here.
- **Naming-conventions guidance** — names are read-only inputs; nobody is asked to rename anything.
- **Designating losers** — winners only at v1.
- **Scheduled / automated re-mining cadence** — re-run the skill when you want a fresh snapshot; there's no scheduler.
- **Multi-account handling beyond the single pin** — one account per definition file.
- **Meta MCP connection troubleshooting beyond the one URL**, and **any direct Meta Graph API call** — out of bounds; the MCP is the only Meta surface.
- **Writing copy or rendering images from these winners** — that happens downstream once they're stored (`exodus-genesis`, `exodus-image`); this skill only collects and imports.
