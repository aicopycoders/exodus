---
name: exodus-hooks
description: Read the brand's Scout library — the pool of hook cards captured from Instagram outliers — through the read-only `npx @aicopycoders/exodus hooks` command family. Use it to answer questions about what's working organically: "exodus, what do my 15×+ hooks have in common?", "exodus, show me my Spanish on-screen hooks from the last two weeks", "exodus, why did that reel score 22×?", "exodus, find other cards with the same hook pattern", "exodus, export my hook library to a spreadsheet". The power is in composing filters — score, lane, validation status, language, market, creator, hook type, recency, discovery door — into one query, then reading the cards back and finding the pattern. Only invoke when the user has explicitly invoked Exodus: they said "exodus" in the request, named this skill or /exodus-hooks, ran an `npx @aicopycoders/exodus hooks` command, or the `exodus` hub skill routed here. Never claim generic hook questions ("what makes a good hook", "write me some hooks") — hook *writing* belongs to `exodus-genesis`/`exodus-write` and hook *judgment* to `exodus-strategist`; in shared folders generic asks may belong to the user's other tools. A hook card is NOT an Idea Bank card — `exodus idea` questions ("what's in my idea bank", "write from idea G3") are a different object with a different lifecycle and do not route here.
---

```operator-guide
Read-only. Nothing in this family changes a card — promoting a hook is a dashboard act.

  npx @aicopycoders/exodus hooks list [filters] [--limit n] [--json]
  npx @aicopycoders/exodus hooks show <ref> [--json]
  npx @aicopycoders/exodus hooks find-similar <ref> [--json]
  npx @aicopycoders/exodus hooks explain-score <ref>
  npx @aicopycoders/exodus hooks export --csv|--json [same filters as list] [--out <file>]

Filters (compose freely — each one narrows the same query):
  --min-score N        viral score at or above N (10 = "did 10× the creator's normal")
  --lane relative|absolute|velocity|evergreen        which detection lane caught it
  --status unproven|corroborated|cross-validated|saturated|virgin-market
  --lifecycle new|reviewed|promoted|tested|killed
  --creator <handle>   one creator (no @)
  --language xx        the post's language (es, pt, en …)
  --market xx          the market it was seen in
  --via paste|seed|expansion|spotter                 which door captured it
  --days N             captured in the last N days
  --extract pending|complete|partial|failed|skipped  hook-extraction state
  --has spoken|onscreen|caption                      that hook type is present
  --pattern "text"     match against the hook pattern
  --limit N            default 50, max 200

<ref> is a card id, an Instagram shortcode, or the post URL — all three work.
Returns: a table by default, structured data with --json, a file with export.
```

# Hooks — read the Scout library

## Strategic Context

The **Scout library** is the brand's pool of **hook cards** — one card per captured Instagram outlier, carrying the three verbatim hooks (spoken, on-screen, caption) with their type tags, the **hook pattern** (the hook with its blanks exposed: "I'm {age}, I tried {thing} for {duration} — here's what happened"), the format skeleton, the viral score with its evidence sentence, the validation status, language and market, the relevance tag, the transcript, and the source link.

The dashboard shows that library as five bucket rails with filter chips. This CLI family is the *other* window on the same cards — the one where filters compose. That's the whole point: the dashboard answers "show me my breakouts"; `hooks list` answers "10×+, on-screen hooks, Spanish, captured in the last two weeks" in one query. When a member asks a pattern question, you are not browsing for them — you are pulling the right slice and telling them what it says.

## When to Use

- "What do my 15×+ hooks have in common?"
- "Which hook type is winning — spoken, on-screen, or caption?"
- "Show me the cross-validated cards I haven't reviewed yet."
- "Why did that reel score 22×?"
- "Are there other cards using this same hook pattern?"
- "Export my hook library so I can look at it in a spreadsheet."

## Composing filters — the move to reach for first

Every filter narrows the same query, so translate the member's sentence into flags rather than pulling a big list and squinting at it. The spec's own example:

> "10×+, on-screen hooks, Spanish, under 14 days"

```bash
npx @aicopycoders/exodus hooks list --min-score 10 --has onscreen --language es --days 14
```

More of the same shape:

```bash
# Structural winners nobody has run yet
npx @aicopycoders/exodus hooks list --status cross-validated --lifecycle new

# The highest-opportunity find: proven elsewhere, absent in your language
npx @aicopycoders/exodus hooks list --status virgin-market --limit 25

# One creator's breakouts, newest first
npx @aicopycoders/exodus hooks list --creator someonehandle --min-score 5

# What the feed spotter caught this week vs. what seeds brought in
npx @aicopycoders/exodus hooks list --via spotter --days 7
npx @aicopycoders/exodus hooks list --via seed --days 7
```

Default limit is 50, max 200. For a real corpus sweep use `export`, which cursor-walks the whole filtered set instead of stopping at the cap.

## Worked example — "what do my 15×+ hooks have in common?"

1. **Pull the slice as data, not a table.** You're going to analyze it, so ask for JSON:

   ```bash
   npx @aicopycoders/exodus hooks list --min-score 15 --json
   ```

2. **Read the fields that carry the pattern.** `hookPattern` (the blanks-exposed hook) and `formatSkeleton` (the shape of the video) are what group; the verbatim `hookSpoken` / `hookOnScreen` / `hookCaption` are the evidence you quote back. Also worth counting: which `lanes` fired, `validationStatus`, `language`, and which hook type is filled.

3. **Group and summarize in plain words.** Name the two or three recurring shapes, say how many cards each covers, quote one real hook per shape, and note what the numbers say ("11 of your 14 cards above 15× lead with an on-screen hook; 9 are personal-timeline claims — 'I did {thing} for {duration}'").

4. **Go deeper on the strongest shape.** Take the best card and ask the library whether it's a one-off:

   ```bash
   npx @aicopycoders/exodus hooks find-similar <ref>
   npx @aicopycoders/exodus hooks explain-score <ref>
   ```

5. **Hand back a move, not just a report.** The strategist call (which shape to write from, which awareness level) belongs to `exodus-strategist`; the writing belongs to `exodus-write` / `exodus-genesis`.

## Going deeper on one card

- **`show <ref>`** — the full card: every hook and its type, pattern, format skeleton, scores with evidence, validation status, lifecycle, language/market, relevance tag, transcript, source link.
- **`find-similar <ref>`** — other cards in this brand sharing the same canonical hook pattern. This is how you tell a repeatable structure from a lucky post.
- **`explain-score <ref>`** — the receipts: the evidence sentence saying why the card scored what it scored, the baseline numbers behind it, and each detection lane's own reason ("1.2M views clears the absolute bar"). Reach for this any time a member doubts a number, and quote the sentence rather than paraphrasing it.

## Honesty rules — never paper over a gap

The cards are built so a gap always announces itself. Relay the gap; do not fill it in.

- **No score is a real answer.** A card with `baselineInsufficient` has **no viral score** — the creator's baseline was too thin to divide by. Its `scoreEvidence` sentence says exactly that. Never estimate, average, or invent a multiple for it, and don't quietly drop it from a summary — say "3 cards can't be scored yet (too few posts to compare against)".
- **Missing hooks have a reason.** `extractStatus` of `partial`, `failed`, or `skipped` means some or all hook text is absent, and `extractEvidence` says why. If a slice looks thin, check extraction before concluding the hooks aren't there.
- **"unproven" is not a defect.** Every card lands as `unproven` at capture — one post, one creator, no corroboration run yet. It means "not checked", not "checked and found weak". Only call something weak on evidence.
- **Views decide; likes and comments don't.** They're recorded as evidence, never as score. Rank on `viralScore`, never on engagement.
- **Relevance ranks, it never gates.** A low relevance tag with a huge score is a structure to steal, not a card to discard.

## Output — table, JSON, or CSV

- **Table (default)** — when the member just wants to look at what's there. Don't paste 50 rows back; surface the handful that answers the question and name them.
- **`--json`** — whenever *you* are doing the analysis: grouping, counting, comparing hook types, chasing a pattern. Parse it, then answer in plain language.
- **`export --csv`** — when they ask for a spreadsheet or want to work outside Claude. `export` walks the whole filtered corpus past the list cap; `--out <file>` writes it, otherwise it prints.

```bash
npx @aicopycoders/exodus hooks export --csv --min-score 10 --days 30 --out hooks-30d.csv
```

Same filters as `list`, so build the query with `list` first, eyeball that it's the right slice, then re-run it as an export.

## Read-only — and not the Idea Bank

This family **only reads**. There is no promote, edit, kill, or re-score command here. Promoting a hook card (and moving its lifecycle along) is a **dashboard act** — if the member wants a card promoted, point them at the Scout page (Sources → Scout) on the dashboard rather than hunting for a flag that doesn't exist.

And keep the two objects straight: a **hook card** is a capture in the Scout library — every outlier the system found. An **Idea Bank card** is work-queue material the member is about to write from. Different object, different lifecycle, different command family. "What's in my idea bank?" / "write from idea G3" is `exodus idea …` — route that back through the `exodus` hub skill (or `exodus-write` for the writing flow), never through `exodus hooks`.
