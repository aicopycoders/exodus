---
name: find-competitors
description: Find the competitors that are actually strong (scaling and working) in any niche, on Meta first and Amazon second, and turn them into a ranked competitor sheet and a watch list. Use it whenever someone asks "who are the real competitors", "who's scaling in this niche", "find brands that are working", "is anyone doing cortisol / sleep / X at scale", "check these brands", "who else sells to these people", "build me a watch list", "who should we spy on", or hands over a list of brands with notes and wants it verified and extended. Three entry points: BRIEF (cold start, no list), HEAD LIST (the user arrives with brands grouped by mechanism and a read on each), and GRID CELL (an existing segment grid with empty cells that need a competitor column). Carries the tool quirks (Atria, Meta Ad Library via Apify, Amazon) and two scripts so nobody rediscovers them. It ends at the ranked sheet and the watch list; ripping ads is the swipe process and patterns and gaps are their own skills.
---

# Find competitors

A competitor is worth following when they are scaling and working, not when they are in the same category. The test is measurable and the search is by mechanism. Everything else here exists to make the first hour not depend on knowing the tools.

Think mode until the plan-back. The sweep and the signal check are build bursts: say the plan and the cost back in two lines, get the go, run them comprehensively, write files as they land, report spend. Then back to a short list the user can cut. Read the `thinking-vs-build` skill if installed.

## What "strong" means

Six signals, each cheap to check. The first five come from Atria's brand feed and the script computes them; the sixth comes from Amazon.

| Signal | What it proves | Strong when |
|---|---|---|
| Active ads now | Breadth of spend | 50+ |
| Longest-running active ad, days | A proven angle | 90+ |
| New ads in the last 30 days | Momentum | 10+ |
| Creative reuse (re-launched ads) | Winners they trust | 5+ in the top-impression sample |
| Offer aggression | A funnel that converts cold | 3+ ads with intro-offer words; persona pages and quiz funnels count double |
| Amazon review count and velocity | Demand off-platform | Top ten in two or more searches, or 1,000+ reviews and growing |

**Follow** at three or more strong. **Watch** at two. **Skip** at one or none. Spend estimates from Atria or Motion are a tiebreak only; they are rough. Adjust the thresholds to the category (a niche with three advertisers is not a niche with three hundred), and say so on the sheet.

One qualifier that is not a number: are they selling a mechanism (a UMP) or a category? Mechanism brands are the ones worth following. Group the sheet by UMP.

## The doors, ranked by yield

1. **The user's head list**, with their read on each brand. Highest signal, fastest. Keep their notes verbatim as the brief.
2. **Keyword lanes on the Meta Ad Library**, 25 to 40 queries from the grid in `references/query-grid.md`, aggregated by advertiser. Run through Apify with `scripts/adlib_sweep.py`.
3. **Amazon category and ingredient shortlists.** Brand names fall out of the top tens; review volume is a signal on its own.
4. **Neighbours of a known strong brand.** Same Atria lane, named in comments and Reddit threads, the domains behind advertorial pages, the brands that share a spokesperson type.
5. **Motion and Foreplay library pages** for the lanes, when the user has access.
6. **A shadow Instagram account** saturated in the market and scanned for outliers. Slowest, best for zeitgeist. The Scout library in Exodus (`exodus-hooks`) already holds this when the brand is set up there.

## Entry point 1: BRIEF (cold start)

The strategist has a product and knows nothing about the market.

1. **Load and say back.** Product, outcome sold today, star ingredient, the segment grid if one exists, focus order if agreed. One paragraph.
2. **Build the query grid.** Outcome × mechanism × ingredient words, 25 to 40 lanes, written to a text file. Show the lanes as a list the user can cut before spending.
3. **Plan-back.** "Sweep N lanes at 150 results each through Apify, about $X, then score the top 30 advertisers on Atria, a few minutes. Go?"
4. **Sweep.** `adlib_sweep.py` writes one JSON per lane and `advertisers.md`, ranked by lanes hit and ads seen. Read the aggregate the way the reference describes (mechanism brands, single-angle brands, advertorial fronts, retailers).
5. **Score.** `competitor_signals.py` on the top 30 advertisers, plus any brand the Amazon door added. Writes the sheet.
6. **Fill the hand columns** for every FOLLOW: UMP, offer, persona pages, why it matters, what to steal. Two lines each, from the longest-running ads the script printed.
7. **Hand back** the sheet in think-mode form: top ten as a list, verdicts, one line each. The user cuts. Then the watch list.

Stop rule: 20 to 30 scored brands. More does not change the top ten.

## Entry point 2: HEAD LIST (the user arrives with brands and a read)

The list is grouped by UMP and each brand has a note ("spends 2M a month", "mostly gut, but they call out weed smokers", "not sure how well it performs").

1. **Keep the notes verbatim** as the brief. They say what to look for, what to discount, and which segments to keep in mind.
2. **Score every brand** with the script. No sweep needed yet.
3. **Compare the numbers to the read.** Where the signals disagree with the note ("thought they hit cortisol harder" but the longest-running ads are gut), say so in one line per brand. That is the whole value of this pass.
4. **Find the blind spots.** Two or three neighbours per UMP group: the same Atria lane, brands named in the comments under the listed brands' ads, the domains behind any advertorial page in the list. Score them.
5. **Segments seen.** Any segment a listed brand calls out (a demographic, a state, an occasion) goes on the running segments-seen list for the `odf` skill.
6. **Hand back:** the list confirmed and extended, ranked by UMP group, then straight into the rip. Do not rebuild what the user already knows.

## Entry point 3: GRID CELL (an account going horizontal)

A brand with winners wants new segments and needs to know who already sells to those people.

1. **Take the grid** and the empty cells from the `odf` skill.
2. **Search per cell, by the facet's self-ID words**, not the outcome word. "On HRT and still wake at 3am" finds different advertisers than "sleep supplement". Two to four lanes per cell.
3. **Score** whoever appears in two or more of a cell's lanes.
4. **Write a competitor column** onto the gap ranking: who is in the cell, how strong, on which UMP, and whether the cell is empty because nobody has found it or because someone tried and left (an inactive brand with a long past run is a warning).
5. **Hand back** to the gaps ranking. This entry does not produce a general sheet.

## The tools and their quirks

Carry these into every run. They were learned the hard way. Both tools are the member's own paid accounts: get the keys from Atria and Apify, add them to `.env` by hand (`keys pull` leaves lines it does not own alone), and expect the scripts to stop with a clear message when a key is missing.

**Atria** (`https://api.tryatria.com/open/v1`, header `X-API-Key`, key in `.env` as `ATRIA_API_KEY`).
- Brand search: `/brand-library/search?keyword=` (the parameter is `keyword`, not `q`). Do not take the first result blindly; match the name or report the candidates.
- Brand ads: `/brand-library/{id}/ads?status=active&page_size=50&order=` with `order` in `most_impressions`, `newest`, `oldest`, `most_active`, `best_match`. Fields include `days_running`, `start_date` (ISO with offset), `creative_duplicates`, `impression_rank`, `impression_trend`, `media_format`, `video_duration`, `link_url`.
- `/ad-library/search` ignores every filter and returns the same feed. Never use it for discovery.
- Single ad: `/ad-library/{mID}` gives body, title, link, video URLs on the Atria CDN, days running. The public ad page hides the transcript behind login, so ripping needs local transcription.
- Rate limit: about ten quick calls returns 429. Pause 20 seconds. The script does this.
- DCO ads store their videos under `cards`, not `videos`.

**Meta Ad Library via Apify** (`apify~facebook-ads-scraper`, run-sync-get-dataset-items, token in `.env` as `APIFY_API_TOKEN`).
- Keyword URL: `search_type=keyword_unordered&active_status=active&country=US&q=<phrase>`. Exact phrase in body: `search_type=keyword_exact_phrase`.
- Page URL: `search_type=page&view_all_page_id=<id>` sorted by total impressions is the watch-list link shape.
- Fields: `pageName`, `pageId`, `startDate`, `isActive`, `collationCount`, `snapshot.body`, `snapshot.title`, `snapshot.linkUrl`, `snapshot.videos[]`. Aggregate by `pageName`; the domain in `linkUrl` is the real brand behind advertorial pages.
- Bills per result. 30 lanes at 150 is a few dollars. Plan-back first.

**Amazon.** Search in the in-app browser, two result pages per query, pull ASIN, title, rating, review count, price, sponsored flag with a page script. Free and fast. Rank by relevance × review count. See the reference for the door.

**Transcripts** for the rip that follows: ElevenLabs Scribe (`cloud_storage_url` = the video URL) or local whisper-cpp. Standardise on one per project so bank rows are comparable.

## Scripts

Run from the workspace root so `.env` is found. Write outputs into the brand's `inputs/research-raw/competitors/` folder.

```
python3 .claude/skills/find-competitors/scripts/adlib_sweep.py --keywords lanes.txt --outdir <brand>/inputs/research-raw/competitors/adlib --limit 150
python3 .claude/skills/find-competitors/scripts/competitor_signals.py --file <brand>/inputs/research-raw/competitors/adlib/advertisers.txt --out <brand>/inputs/research-raw/competitors/competitor-sheet.md --json signals.json
```

`competitor_signals.py --names "Brand A" "Brand B"` scores a head list directly. Edit `STRONG` at the top of the script to change the thresholds for a category. Both scripts print progress per lane or brand so a cut connection loses only what was in flight.

## The sheet

```
# <Brand> — Competitor sheet (v<n>, <date>)
Thresholds used: <…>. Verdict: FOLLOW 3+ · WATCH 2 · SKIP 0–1.

## By UMP
### <UMP, e.g. cortisol>
| Brand | Verdict | Active | Longest (d) | Launches 30d | Reuse | Offer | Amazon reviews | Offer & funnel | Why it matters | What to steal |

### <UMP 2>
…

## Segments seen
<a> · <b> · <c>

## Watch list (FOLLOW rows)
| Brand | Ad Library page link | Atria id | Domain |

## Tool feedback from this run
- …
```

The sheet lives in the folder. The FOLLOW rows become the watch list: an Ad Library page link per brand (the shape above) saved as a links file the rip can consume, and the brands added to Atria's followed list by hand in the app. When the brand is set up in Exodus, the Scout feed covers the Instagram side.

**Push the watch list into Exodus (the Mining page).** The CLI verb is `npx @aicopycoders/exodus swipe brands`, not `competitors`. Write the FOLLOW rows as a CSV (`name,igHandle,fbPageId,category[,website][,youtubeHandle]`; the Ad Library `view_all_page_id` is the `fbPageId`) and run `npx @aicopycoders/exodus swipe brands bulk-import <file.csv>`: it checks each brand's page on the member's own Scrape Creators key and starts collecting its ads. `swipe brands add "<Name>" --fb <pageId>` adds one brand but does not start the research yet (open issue #1366), so prefer the CSV route even for one brand. `swipe brands list` shows what is on the page.

## Hand-offs

- **Rip:** the FOLLOW rows and their longest-running ads go to the swipe process (transcript, headline, body, rank, on-screen text) and into the ad bank next to the brand's own ads.
- **Patterns:** what the FOLLOW set has in common is the `patterns-and-gaps` skill's job.
- **Gaps:** the empty cells and the competitor column go to `patterns-and-gaps` and the `odf` grid.
- **Positioning:** the `positioning-spiral` calls this at its research station.

## Worked example (fictional)

Evenkeel Reset Gummies, an evening saffron and magnesium gummy. Entry point BRIEF. Query grid of 28 lanes (see the reference). Sweep returned 214 advertisers; 31 appeared in three or more lanes. Signal check on those 31 plus four brands from the Amazon top tens. Result: nine FOLLOW, eight WATCH, the rest SKIP. The nine grouped into three UMPs: cortisol (four brands, all symptom-stacking in the hook, one at 289 days on a doctor-skit), perimenopause (three, all persona-page funnels), and sleep-onset (two, both melatonin-adjacent, both fatiguing). What it changed upstream: nobody strong owns "stay asleep" as a UMP; the cortisol brands own belly and face, not the night. That is a lane, and it went back to the positioning spiral as the mechanism station's next question.

## What this skill is not

It does not rip ads, find the patterns across them, or rank the gaps. It does not decide the mechanism. It finds who is strong, proves it with numbers, and puts them where the rest of the process can reach them.

## Standards

Before producing anything, read `STANDARDS.md` at the workspace root (and the section for this output type). Grade the draft against it before showing it; rewrite failures first. When the user reacts with a judgment, a banking phrase, or the same note twice, hand the reaction to `remember-that`. At the end of the session, `handoff` scrapes the chat and proposes entries.
