---
name: exodus-genesis
description: Run the standalone Exodus Genesis pipeline — Luke's full writing process across two voices (MarioBot + Infeed VSL) on the brand primer. The default is one pass per bot = 2 variants (1 Mario × Brand + 1 Infeed × Brand); the user can run more passes to widen coverage and bring in the Top-Ads-Biased primer. Includes the per-variant editing menu (Natural Language / Shorten / Cut / Simplify / Make Better). `--reel` also writes ads on the spot from a pasted Instagram/TikTok reel — it transcribes the reel into an idea and writes it through this same writer (just another input, nothing custom); to COLLECT reels/ideas into a bank to curate before writing, that's the `exodus-idea` skill. Only invoke when the user has explicitly invoked Exodus: they said "exodus" in the request ("run the exodus genesis pipeline", "exodus, run another pass", "exodus, make me ads from this reel"), named this skill or /exodus-genesis, ran an `npx exodus` command, or the `exodus` hub skill routed here. Never claim generic requests ("run the Genesis pipeline", "write ads from this reel") — in shared folders those may belong to the user's other tools; if the user did not say exodus, this skill is not for them. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus — never hijack their direct Genesis workflows into this pipeline.
---

```operator-guide
Inputs (choose one source):
  brief — concept, derived hook, or paste of the source ad   (genesis run --brief)
  reel  — an Instagram/TikTok reel URL to write ads from      (genesis --reel "<url>")
Optional:
  seeds — per-run creative angles extracted from the source ad
          (file path with one seed per line, OR an inline string)
  awareness (default: problem-aware)
  passes — writing passes per bot (1-5, default 1). 1 pass = 2 variants
           (1 Mario × Brand + 1 Infeed × Brand). Each added pass writes one
           more Mario + one more Infeed; pass 2 brings in the Top-Ads-Biased primer.
  variants — advanced: raw total count (1-10) that overrides passes
  ad-account — Meta ad account ID for the top-ads track
Returns:
  Google Doc with one tab per variant (Headlines + Hook + Body Copy)
  Per-variant editing menu surfaced on the dashboard run page
```

# Genesis — Brief + Seeds → Mario + Infeed Variants → Editing Menu

Luke's full Ad Writing Process end-to-end:

- Two parallel hook voices (MarioBot + InfeedVSL) producing ~40 hooks total
- Body-copy variants in two voices, **scaled by passes**:
  - **Mario × Brand primer** — established brand voice
  - **Infeed × Brand primer** — InfeedVSL voice on the same brand reference
  - **Top-Ads-Biased** — primed with the brand's actual top performers (CTR × spend),
    so output is biased toward what's currently winning. This enters on the **2nd pass**.
- 15-point QA across every variant
- Editing menu on the dashboard (5 transforms per variant)

**The default is one pass per bot — 2 variants** (1 Mario × Brand + 1 Infeed × Brand): the
fastest useful read on the two voices against the same brief. Scale up with **passes** when the
user wants a heavier pass — a new sprint, a fatigue plateau, or wider coverage (see *Passes —
How Much Coverage* below).

> If the user hasn't named the pipeline specifically and just wants Exodus to "write some ads,"
> start from the `exodus-write` skill — it walks brand → foundation → brief → here, and it owns the passes menu.
> This skill owns the run once the brief, awareness, and pass count are settled. If the user
> invoked Genesis directly and didn't say how many, surface the same quick passes menu (default
> 1 pass = 2 variants, recommended) before firing — don't silently assume a big run.

## Workflow

### 1. Shape the brief (Stage 4)

Genesis writes from a **brief** — a 1–2 paragraph natural-language *description* of the ad, not the ad itself. If the user gave you an idea, a winning ad, or a rough angle, you write the brief from it; surface it for a quick gut-check before running.

A brief covers: what the ad is about · what happens in it · the emotional core (heartbreak, rage, shame, mischief…) · the mechanism bridge to the product · the tone · why it's vicious. It is NOT the copy, NOT a hook list, NOT a format spec, and NOT over-specified — leave the bots room.

```
BRIEF: "[short evocative title]"
Hook: "[verbatim hook if from a swipe/organic source, else a hook DIRECTION or leave open]"
Source: [where the idea came from]
[1–2 paragraphs: scenario, emotional core, mechanism bridge, tone, why it works]
```

Worked brief examples and the awareness→primer mapping are in `references/awareness-framework.md`. Hook direction and the vicious standard are in `references/hook-quality-checklist.md`.

### 1b. Writing from a reel (`--reel`)

When the user pastes an Instagram/TikTok reel and wants ads from it, you don't shape a brief by hand — the reel *is* the source. Fire it in the background:

```bash
npx @aicopycoders/exodus genesis --reel "<url>" --awareness <level> [--passes n]
```

This transcribes the reel into an Idea Bank "organic" idea, then writes that idea through this same Genesis writer (Mario + Infeed) — a reel is just another input to the standard writer. It banks the idea (so there's a reusable record) AND writes in one shot, returning a Genesis run. Capture is async, so it takes a beat longer than a typed brief before writing starts. If the reel is private/region-locked/has no transcript, capture yields nothing — surface that and ask for an alternate. When the user wants to collect several reels to curate *before* writing, route to the `exodus-idea` skill instead.

### 2. Extract seeds (when there's a source ad)

When the user pastes a winning ad, extract seeds yourself. A seed is a creative angle, mechanism, or pattern surfaced from the source — examples:

```
Coffee = morning ritual — swap to gym, sex, alcohol tolerance, social media
"It's not low T..." — reframe to "It's too high cortisol"
Defective mitochondria — mechanism seed (cell-energy story)
The whole ad is mechanism-heavy — replicate this structure
```

Save to `/tmp/genesis-seeds.txt` (one per line, `#` comments allowed), or pass `--seeds "..."` inline. Skip seeds when there's no source ad — the brief carries the load.

### 3. Resolve awareness + pass count, then run in background

**Awareness is your call** (Principle 2) — state your read, don't make the user pick: "this reads problem-aware because X — sound right?" The primer is awareness-keyed: `--awareness` picks which of the brand's two foundation primers (`primerUnawareProblemAware` cold / `primerSolutionProductAware` warm) the bots receive. Default `problem-aware` when unsure. Pick ONE level; never mix buckets in a run.

**Pass count is the user's knob** — if they didn't specify, surface a quick menu (1 pass / 2 variants recommended · 2 passes / 4 variants · more) rather than assuming. Always `run_in_background: true` — these runs are past the 10-min foreground cap.

```bash
# Resolve hook mode FIRST (see "Hook selection mode" below) — these commands
# assume a saved default exists, else add --stop-at-hooks or --auto-hooks or they error.

# Default — 1 pass per bot = 2 variants (1 Mario × Brand + 1 Infeed × Brand):
npx @aicopycoders/exodus genesis run --brief "<brief>" --awareness <level>

# More coverage — 2 passes = 4 variants (adds the Top-Ads-Biased pass):
npx @aicopycoders/exodus genesis run --brief "<brief>" --awareness <level> --passes 2

# With seeds:
npx @aicopycoders/exodus genesis run --brief "<brief>" --seeds /tmp/genesis-seeds.txt --awareness <level> --passes 2

# Manual hook selection — pause after hook generation:
npx @aicopycoders/exodus genesis run --brief "<brief>" --awareness <level> --stop-at-hooks

# Force auto-select (overrides a saved "manual" preference):
npx @aicopycoders/exodus genesis run --brief "<brief>" --awareness <level> --auto-hooks
```

`--brief` accepts inline text or a file path. `--passes <n>` (1–5) is the friendly knob; `--variants <n>` (1–10) is an advanced raw-total override that wins if both are given.

**Hook selection mode — REQUIRED gate before EVERY run (do not skip):**
The pipeline can pause after hook generation so the user picks which hooks become body copy — the human quality gate. You MUST resolve the mode **before** firing a run. A `genesis run` with **no** `--stop-at-hooks`/`--auto-hooks` **and** no saved preference now **hard-errors** (`Hook-selection preference not set`) **by design** — so the gate can't be silently skipped. If you see that error, you skipped this step; do it now.

Resolve it in this order, every time, BEFORE you run:
1. **Check the saved default:** run `npx @aicopycoders/exodus genesis hook-pref` (no argument). It prints `manual`, `auto`, or `unset` on the first line.
2. **If it prints `manual` or `auto`:** just fire the run — the saved default applies, no flag needed.
3. **If it prints `unset`:** STOP and ask the user once, plainly — *"Want to choose the hooks yourself before I write the copy, or have me auto-pick and write straight through?"* Then fire the run with the matching flag (`--stop-at-hooks` = they choose, `--auto-hooks` = auto), and after it starts, offer to save it as their default so you never ask again: `npx @aicopycoders/exodus genesis hook-pref <manual|auto>`. **Do NOT fire the run before they answer.**

Flags:
- **`--stop-at-hooks`** — pause after hook generation. The run lands in `awaiting_hook_selection` and the CLI prints a dashboard URL; the user picks hooks on the run-detail page and the pipeline continues automatically to body copy.
- **`--auto-hooks`** — auto-pick the strongest hooks and write straight through (also overrides a saved "manual" default for this one run).

> "Genesis run started at problem-aware — 1 pass per bot (2 variants: Mario × Brand + Infeed × Brand). I'll surface the Doc when it lands."

Status check (only if user asks): `npx @aicopycoders/exodus status --id <runId> --type genesis` — `--type genesis` required.

### 4. Report

Per the **Default Post-Run Reporting** rule in `exodus-strategist`: surface the Doc URL and the variant breakdown plus a 2-line take. At the default that's **V1 Mario × Brand, V2 Infeed × Brand**; with more passes, each added pass is another Mario + Infeed pair, and **pass 2 uses the Top-Ads-Biased primer**. **Plus one Genesis-specific check**: if a 2nd pass was requested and the top-ads primer was empty (account has no qualifying ads, or lookup failed), that pass's two variants silently fall back to the brand primer — surface it so the user knows they got brand-primer variants instead of top-ads-biased ones.

Mention the **editing menu** on the run-detail page (5 buttons per variant: Natural Language, Shorten, Cut, Simplify, Make Better — each appends a new tab with the edited version, originals stay).

Don't auto-`read-doc` every variant. Pull the Doc only if the user wants vicious-hook critique, or you're picking the strongest variant for a follow-up.

Then propose 1-2 fitting next moves: apply Shorten/Make Better to a specific variant, run another Genesis pass with different seeds or awareness, or pair with the `exodus-image` skill to render statics from the winning variant.

## Cleanup & QA (Stage 6 — built into the pipeline)

You do **not** hand-clean Genesis output. The pipeline runs Luke's cleanup + a 15-point QA pass on every variant before the Google Doc is written, so the Doc lands as a clean deliverable:

- Bot commentary stripped — emotional-excavation notes, STEP/TEST labels, quality-gate/viciousness checks, hook-analysis paragraphs, category labels.
- Markdown artifacts stripped — `**`, `*`, `##`, `---`, backticks.
- Body copy continues from the hook (never repeats it), runs 700–1500 words — a design target of the writing process, not a hard limit of the bots (use the editing menu's Shorten/Cut if the user wants tighter) — and reads at a 3rd–5th-grade level.
- Google Doc formatting: 14pt throughout, bold only on section/item labels (HEADLINES:, HOOKS:, BODY COPY 1/2:, H1:, Hook 1:), clean spacing.

What still needs *your* judgment after the run: **verify any statistics, studies, or claims** — Genesis bots fabricate proof points (Principle 14). Fact-check before anything ships. If you spot junk that slipped past cleanup, that's a Tool Feedback item (see `exodus-strategist`).

## Passes — How Much Coverage

`--passes` is the friendly knob: one pass = one Mario + one Infeed. The user owns this number — menu it when unspecified, don't assume.

- **1 pass = 2 variants (default)** — one Mario × Brand + one Infeed × Brand. The fastest two-voice read.
- **2 passes = 4 variants** — adds a Mario + Infeed pair on the **Top-Ads-Biased** primer (falls back to brand if the account has no qualifying winners).
- **3–5 passes = 6–10 variants** — wider net for a sprint; the extra passes repeat the Mario × Brand + Infeed × Brand pairing.
- **Advanced — `--variants <n>` (1–10)** — a raw total that overrides `--passes`. Odd counts alternate Mario → Infeed (e.g. `--variants 3` = Mario, Infeed, Mario), with the top-ads primer entering on the 3rd variant.

## Common Failure Modes

- **In-feed-vsl-bot fails** — InfeedVSL hook generation degrades to Mario-only; the Infeed variant still runs if recovered. Note in report.
- **Top-ads primer empty (2+ passes)** — the 2nd pass's two variants fall back to the brand primer. Pipeline completes; flag it.
- **Pipeline timeout** — rare, and only realistic on a large pass count. Check run-detail for partial variants; trigger an editing pass from the UI to recover usable output.
- **`status` 400 "Invalid generation ID format"** — missing `--type genesis`.
