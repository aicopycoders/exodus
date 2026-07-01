---
name: exodus-genesis
description: Run the standalone Exodus Genesis pipeline — Luke's full writing process. Hooks come from the dedicated new-hook-bot (a single ~10-hook pool); the human hook gate then lets the user review and pick those hooks RIGHT IN CLAUDE CODE (the primary venue; dashboard is ad-hoc) — each pick becomes one ad — or auto-pick and write straight through. Body copy is written across two voices (MarioBot + Infeed VSL) on the brand primer; in auto mode the default is one pass per bot = 2 variants and more passes widen coverage / bring in the Top-Ads-Biased primer (passes don't apply in manual mode). Includes the per-variant editing menu (Natural Language / Shorten / Cut / Simplify / Make Better). Only invoke when the user has explicitly invoked Exodus: they said "exodus" in the request ("run the exodus genesis pipeline", "exodus, run another pass"), named this skill or /exodus-genesis, ran an `npx exodus` command, or the `exodus` hub skill routed here. Never claim generic requests ("run the Genesis pipeline") — in shared folders those may belong to the user's other tools; if the user did not say exodus, this skill is not for them. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus — never hijack their direct Genesis workflows into this pipeline.
---

```operator-guide
Input:
  brief — concept, derived hook, or paste of the source ad   (genesis run --brief)
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

Hook gate (manual mode — review hooks in Claude Code):
  on pause the run prints a numbered hook pool, then:
  genesis continue   --id <runId> --hooks 1,3,5       write the picked hooks (one ad each)
  genesis regenerate --id <runId> [--steering "…"]    re-roll the pool (reject + steer)
  genesis hooks      --id <runId>                      re-print the pool (fresh-session resume)
```

# Genesis — Brief + Seeds → Mario + Infeed Variants → Editing Menu

Luke's full Ad Writing Process end-to-end:

- Hook generation from the dedicated **new-hook-bot** (single source, ~10 strategically
  ordered hooks) — the pool the user reviews at the hook gate
- Body-copy variants in two voices, **scaled by passes** (auto mode):
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
> This skill owns the run once the brief, awareness, and (in auto mode) pass count are settled.
> **In manual mode the passes question disappears** — the ad count equals the number of hooks the
> user picks, so don't ask "how many passes?" Passes only apply to **auto** mode (default 1 pass =
> 2 variants, recommended); if the user is in auto and didn't say how many, surface the quick passes
> menu before firing — don't silently assume a big run.

## Workflow

### 1. Shape the brief (Stage 4)

Genesis writes from a **brief** — a 1–2 paragraph natural-language *description* of the ad, not the ad itself. If the user gave you an idea, a winning ad, or a rough angle, you write the brief from it; surface it for a quick gut-check before running.

A brief covers: what the ad is about · what happens in it · the emotional core (heartbreak, rage, shame, mischief…) · the mechanism bridge to the product · the tone · why it's vicious. It is NOT the copy, NOT a hook list, NOT a format spec, and NOT over-specified — leave the bots room.

```
BRIEF: "[short evocative title]"
Hook: "[verbatim hook if the user gave one, else a hook DIRECTION or leave open]"
Source: [where the idea came from]
[1–2 paragraphs: scenario, emotional core, mechanism bridge, tone, why it works]
```

Worked brief examples and the awareness→primer mapping are in `references/awareness-framework.md`. Hook direction and the vicious standard are in `references/hook-quality-checklist.md`.

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

**Pass count is the user's knob** — if they didn't specify, surface a quick menu (1 pass / 2 variants recommended · 2 passes / 4 variants · more) rather than assuming. Always `run_in_background: true` — these runs exceed Claude Code's foreground limit. Never quote the user a finish time; just say it's running and you'll surface the Doc when it lands.

```bash
# Resolve hook mode FIRST (see "Hook selection mode" below) — these commands
# assume a saved default exists, else add --stop-at-hooks or --auto-hooks or they error.

# Manual (default) — pause so the user picks hooks IN CLAUDE CODE; one ad per pick.
# Passes do NOT apply in manual mode (ad count = hooks chosen):
npx @aicopycoders/exodus genesis run --brief "<brief>" --awareness <level> --stop-at-hooks

# Auto — auto-pick the top N hooks (N = passes default) and write straight through:
npx @aicopycoders/exodus genesis run --brief "<brief>" --awareness <level> --auto-hooks

# Auto, more coverage — 2 passes = 4 variants (adds the Top-Ads-Biased pass):
npx @aicopycoders/exodus genesis run --brief "<brief>" --awareness <level> --auto-hooks --passes 2

# With seeds:
npx @aicopycoders/exodus genesis run --brief "<brief>" --seeds /tmp/genesis-seeds.txt --awareness <level> --stop-at-hooks
```

`--brief` accepts inline text or a file path. `--passes <n>` (1–5) is the friendly knob (auto mode only); `--variants <n>` (1–10) is an advanced raw-total override that wins if both are given.

**Hook selection mode — REQUIRED gate before EVERY run (do not skip):**
The pipeline can pause after hook generation so the user picks which hooks become body copy — the human quality gate, and **reviewing those hooks right here in Claude Code is the primary venue** (the dashboard is an ad-hoc escape hatch). You MUST resolve the mode **before** firing a run. A `genesis run` with **no** `--stop-at-hooks`/`--auto-hooks` **and** no saved preference now **hard-errors** (`Hook-selection preference not set`) **by design** — so the gate can't be silently skipped. If you see that error, you skipped this step; do it now.

Resolve it in this order, every time, BEFORE you run:
1. **Check the saved default:** run `npx @aicopycoders/exodus genesis hook-pref` (no argument). It prints `manual`, `auto`, or `unset` on the first line.
2. **If it prints `manual` or `auto`:** just fire the run — the saved default applies, no flag needed. (`manual` = review the hooks here in Claude Code.)
3. **If it prints `unset`:** STOP and ask the user once — **mode only, two options, in-Claude-Code first:**
   > ① **Show me the hooks here — I'll pick** (review in Claude Code) · ② **Just write the ads — auto-pick the hooks**
   > *(Prefer the dashboard? Say so and I'll give you the link.)*

   Don't ask "how many passes?" in this question — that only matters in auto mode. Fire the run with the matching flag (`--stop-at-hooks` = ①, `--auto-hooks` = ②). **Do NOT fire the run before they answer.** Then, **after** the run kicks off (a separate step), ask **once** whether to save it as the default so you never ask again: `npx @aicopycoders/exodus genesis hook-pref <manual|auto>`. (Only `manual`/`auto` are savable — never save "dashboard".)

Flags:
- **`--stop-at-hooks`** — manual: pause after hook generation. The run lands in `awaiting_hook_selection` and **the CLI prints the hook pool as a numbered list** (see *Manual hook selection* below). Picking resumes the pipeline to body copy; rejecting re-rolls the pool (`regenerate`).
- **`--auto-hooks`** — auto: pick the top N hooks in bot order and write straight through (also overrides a saved "manual" default for this one run). Stay silent — just deliver the Doc.

### 3b. Manual hook selection — review and pick IN CLAUDE CODE

When a manual run pauses, the `run` command prints the generated pool as a flat numbered list. Surface it to the user **verbatim — hook text only, numbered.** Do **not** add ratings, tags, voice labels, or your own opinion about which hooks are best; the user picks.

```
⏸  Paused for hook selection (10 hooks).

  1. <hook text>
  2. <hook text>
  …
```

Then the user does one of two things — **pick** or **re-roll**:

**A. Pick the hooks to write:**
1. Ask the user which hooks to write — **by number ("1, 3, 5") or in natural language** ("the first one and the curiosity one about cortisol"). Resolve any natural-language reference to the actual hook numbers yourself.
2. Each pick becomes one ad. If the user picks **more than 10**, warn and confirm before continuing — the pipeline caps at 10 and would drop the rest; don't let that happen silently.
3. Write the chosen hooks:
   ```bash
   npx @aicopycoders/exodus genesis continue --id <runId> --hooks 1,3,5
   ```
   This resumes the run (one ad per hook) and polls to the Doc.

**B. Reject the pool and re-roll (regenerate):** when the user says "these all suck, try again" — optionally with direction ("…and lead with the cost, not the shame"):
```bash
npx @aicopycoders/exodus genesis regenerate --id <runId> --steering "lead with the cost, not the shame"
```
- Drop `--steering` entirely for a plain "just try again" — it re-rolls on the brand steering alone.
- The whole pool is **replaced** with a fresh set, the run re-pauses, and the new numbered list prints. Surface it the same way (verbatim, hook text only) and loop back to A or B. **Unlimited rounds** — keep re-rolling until the user picks or walks away.
- Steering is **additive across rounds**: round 2's "punchier" stacks on round 1's "lead with the cost" — pass only the *new* direction each time; the backend accumulates.
- If the user references a specific hook ("**7** is the closest but too aggressive"), **resolve that number to the real hook text yourself** and fold it into the steering you pass — e.g. `--steering "build on 'Your cortisol is wrecking your sleep' but soften the aggression"`. The CLI sends steering as plain text; the bot never sees your numbering.

**Fresh session / lost the list?** Re-fetch and reprint the pool any time with:
```bash
npx @aicopycoders/exodus genesis hooks --id <runId>
```
A paused run resumes cleanly from a cold session this way — fetch the pool, then pick (`continue`) or re-roll (`regenerate`).

> "Genesis paused with 10 hooks — here they are. Tell me which to write (numbers or describe them), or say the word and I'll re-roll the whole set."

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

- **new-hook-bot fails** — hooks now come from a single source (no two-lane fallback), so a hook-gen failure fails the run cleanly with no pool. Re-run; if it persists, it's a Tool Feedback item.
- **Empty hook bank** — if the brand's hook primer is empty the pool is generated from the brief alone (weaker hooks). Surface it so the user knows to fill the foundation.
- **In-feed-vsl-bot fails** — affects **body copy** only (Phase 2): the Infeed variant degrades to Mario-only; the Infeed variant still runs if recovered. Note in report.
- **Top-ads primer empty (2+ passes)** — the 2nd pass's two variants fall back to the brand primer. Pipeline completes; flag it.
- **Pipeline timeout** — rare, and only realistic on a large pass count. Check run-detail for partial variants; trigger an editing pass from the UI to recover usable output.
- **`status` 400 "Invalid generation ID format"** — missing `--type genesis`.
