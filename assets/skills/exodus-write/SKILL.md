---
name: exodus-write
description: The front door for writing ad copy with Luke's Genesis process inside Exodus. It figures out where the user is (new brand → onboarding, brief in hand → write, want to rerun → exodus-browse), walks the brief → genesis → Google Doc flow end to end, and hands off to the exodus-genesis skill for the actual writing pass; it routes — it doesn't replace the exodus-genesis/exodus-foundation skills, it sequences them. Only invoke when the user has explicitly invoked Exodus and hasn't named a specific pipeline: they said "exodus" in the request ("exodus, write me some ads", "exodus, I have a brief", "exodus, turn this winning ad into copy"), named this skill or /exodus-write, ran an `npx exodus` command, or the `exodus` hub skill routed here. Never claim generic copywriting requests ("write me some ads", "help me write hooks") — in shared folders those may belong to the user's other tools; if the user did not say exodus, this skill is not for them. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus — do not hijack it into this flow.
---

# Write — The Guided Copywriting Flow

This is the single entry point for "write me ad copy the Genesis way." It sequences the existing pieces — brand → foundation → brief → genesis → Google Doc — so the user never has to know which command runs when. You stay in `exodus-strategist` the whole time (persona, operating rules, creative principles). Per that persona: **recommend the strategy, menu the run.** You own the creative calls — the awareness read, the angle, the brief itself — so state those and move; the user owns the run's knobs (how many passes), so present those as a quick menu, the way the `exodus-image` skill does for static images. Reach into `exodus-genesis` and `exodus-foundation` for the heavy lifting, and `exodus-strategist`'s Framework Index for depth; this skill is the conductor.

The job, every awareness level, every brand: **install the mechanism → create desire → bridge to the product.** Only the starting place changes.

---

## First-Message Routing — Figure Out Where They Are

Don't interrogate. Read the opening message + run `npx @aicopycoders/exodus brand current` and `npx @aicopycoders/exodus foundation status`, then route:

| Signal | Route to |
|---|---|
| New brand, or `foundation status` shows missing fields | **Onboard** (below), then Write |
| They pasted a winning ad / gave an idea / have a brief | **Write** (skip onboarding if foundation is ✓ Ready) |
| "rerun", "tweak that", "make a variant", references a past run | **Rerun** — `npx @aicopycoders/exodus browse`, then the genesis editing menu |
| Pure question about an angle/hook/awareness call | Answer from `exodus-strategist`'s Framework Index + `references/`; offer to write it |

State your read in one line ("New brand, no foundation yet — setting that up first, then we write") and move. The user redirects if you misread.

---

## Stage A — Onboard (only when the brand isn't ready yet)

A brand needs one thing before any pipeline runs: a ready foundation. The default, fastest on-ramp is the **primer** — a single document built from the brand's winning ads that unlocks every pipeline. Check readiness first:

```bash
npx @aicopycoders/exodus primer status            # always first — is this brand ready?
```

**Primer-first (the default).** If the user has winning ads, build the primer — one doc, one pass, every pipeline unlocked. Hand off to the `exodus-primer` skill: it runs a one-pass intake (product facts + winning ads) → build → save → verify. Don't re-implement it here.

**No winning ads, or a legacy 2-track setup?** Fall back to the `exodus-foundation` skill. It extracts audience concerns + the two awareness primers from a brand doc / URL / notes and satisfies the same readiness gate. Fill what's missing via its three paths (paste structured markdown → `foundation save -`; one field → `foundation set <field>`; raw source → interactive walkthrough). The fields:

- `audienceConcerns` — who you're talking to and what keeps them up at night
- `primerUnawareProblemAware` — the **cold** primer (winning ads for unaware / problem-aware)
- `primerSolutionProductAware` — the **warm** primer (winning ads for solution / product-aware)
- `brandVoice` — optional voice guide

### The primer — the highest-leverage input

Winning ads are the highest-leverage input: they teach the bots what "good" looks like for this market (see `references/hook-quality-checklist.md` for what makes an ad primer-worthy). The better the examples, the better every hook and body-copy variant. The **`exodus-primer` skill** is the clean way to turn a brand's winning ads into that document in one pass — prefer it for any brand that has winners to paste.

If a brand instead arrives with **finished primer text already prepared** — a packaged set of winning ads + examples per awareness band — you can paste it straight into the matching foundation field, no rebuild needed:

```bash
# cold (unaware / problem-aware) winning ads:
pbpaste | npx @aicopycoders/exodus foundation set primerUnawareProblemAware --stdin
# warm (solution / product-aware) winning ads:
pbpaste | npx @aicopycoders/exodus foundation set primerSolutionProductAware --stdin
```

**Works without it.** If there's no primer prompt yet, don't block — Genesis falls back to sensible defaults and still produces copy. Tell the user plainly: "We can write now; output gets noticeably sharper once you add winning examples to the foundation." Then proceed. Adding the primer later and re-running is cheap.

Confirm `foundation status` shows the fields you set, then move to Write.

---

## Stage B — Write the Brief (Stage 4 of Luke's process)

Genesis takes a **brief**, not raw copy. A brief is a 1–2 paragraph natural-language *description* of the ad — not the ad itself. Most of the time you write this yourself from what the user gave you; surface it for a quick gut-check before running.

**A brief covers:** what the ad is about · what happens in it · the emotional core (heartbreak, rage, shame, mischief…) · the mechanism bridge to the product · the tone · why it's interesting / what makes it vicious.

**A brief is NOT:** the actual copy · a hook list · a format spec (don't say "video/static") · over-specified (leave the bots room).

Format:

```
BRIEF: "[short evocative title]"
Hook: "[verbatim hook if from a swipe/organic source, else a hook DIRECTION or leave open]"
Source: [where the idea came from — a winning ad, a comment, an angle]
[1–2 paragraphs describing the ad: scenario, emotional core, mechanism bridge, tone, why it works]
```

See `references/awareness-framework.md` for the brief→primer mapping and worked brief examples. For hook direction and the vicious standard, see `references/hook-quality-checklist.md`.

### Extract seeds when there's a source ad

If the user pasted a winning ad, mine it for **seeds** — creative angles to carry into the run (a ritual to transfer, a "it's not X, it's Y" reframe, a buried line worth promoting to the hook). One per line:

```
Coffee = morning ritual — swap to gym, sex, alcohol tolerance
"It's not low T..." — reframe to "too high cortisol"
Mechanism-heavy structure — replicate it
```

Save to `/tmp/genesis-seeds.txt` or pass inline via `--seeds`. Skip seeds when there's no source ad — the brief carries it.

### Classify awareness

Pick ONE level — don't ask the user to choose, state your read:

| Level | Starting place |
|---|---|
| **Unaware** | symptom / curiosity / hidden problem |
| **Problem-aware** | known problem, reframe the cause (default when unsure) |
| **Solution-aware** | solution category, comparison, skepticism |
| **Product-aware** | product comparison, "why you over them" |

Awareness picks the primer; never mix buckets in one run. Detail in `references/awareness-framework.md`.

---

## Stage C — Resolve the hook gate, then run Genesis

**First, resolve the hook-selection gate — it decides the whole shape of the run** (the `exodus-genesis` skill's "Hook selection mode" step). Run `npx @aicopycoders/exodus genesis hook-pref`:

- **`manual`** — the user reviews and picks the hooks **right here in Claude Code** (the primary venue). The run pauses, the CLI prints a numbered hook pool, the user picks, and each pick becomes one ad. **Passes do not apply — ad count = hooks chosen — so skip the passes menu entirely.** Fire with `--stop-at-hooks`.
- **`auto`** — auto-pick the top hooks and write straight through. Passes apply here (see below). Fire with `--auto-hooks`.
- **`unset`** — STOP and ask **mode only, two options, in-Claude-Code first**: *① Show me the hooks here — I'll pick · ② Just write the ads — auto-pick the hooks. (Prefer the dashboard? I'll give you the link.)* Then fire with the matching flag, and **after** the run kicks off, offer **once** to save it as the default (`genesis hook-pref <manual|auto>` — never "dashboard"). A run with no flag and no saved default hard-errors by design — don't skip this.

**Passes (auto mode only).** Genesis writes body copy in two voices — **MarioBot** and the **Infeed VSL bot**. The default is **one pass per bot = 2 variants** (1 Mario × Brand + 1 Infeed × Brand). How many passes is the user's call — **menu it** (one AskUserQuestion call) rather than assuming, but only when the user chose auto:

- **1 pass — 2 variants (recommended)** — one Mario, one Infeed, on the brand primer. Fast.
- **2 passes — 4 variants** — adds a Mario + Infeed pair on the brand's top-performers primer.
- **3+ passes — 6+ variants** — a wider sprint; "Other" takes a custom number.

Skip the passes menu if the user already said how many, or whenever the mode is manual. Awareness you do *not* menu — that's your strategist call from Stage B; state it and move.

Hand off to the `exodus-genesis` skill — it owns the run (the built-in 15-point QA, the in-Claude-Code hook review, the editing menu). Always background it — these runs run past Claude Code's foreground limit. Don't tell the user how long it'll take; say it's running and you'll surface the Doc when it lands.

```bash
# Manual — review & pick hooks in Claude Code (one ad per pick; no passes):
npx @aicopycoders/exodus genesis run --brief "<brief>" --awareness <level> --stop-at-hooks
# Auto — auto-pick and write straight through (default 1 pass = 2 variants):
npx @aicopycoders/exodus genesis run --brief "<brief>" --awareness <level> --auto-hooks
# Auto, more coverage — 2 passes = 4 variants:
npx @aicopycoders/exodus genesis run --brief "<brief>" --awareness <level> --auto-hooks --passes 2
# with seeds:
npx @aicopycoders/exodus genesis run --brief "<brief>" --seeds /tmp/genesis-seeds.txt --awareness <level> --stop-at-hooks
```

When a manual run pauses, drive the in-Claude-Code pick loop from the `exodus-genesis` skill (§3b): print the numbered pool verbatim, let the user pick by number or natural language, then `genesis continue --id <runId> --hooks 1,3,5`.

> "Genesis run started at problem-aware — 1 pass per bot (2 variants: Mario × Brand + Infeed × Brand). I'll surface the Doc when it lands."

Quality is enforced inside the pipeline (Cleanup + QA — see the `exodus-genesis` skill): markdown stripped, bot commentary removed, body copy 700–1500 words, no hook repetition, clean 14pt Google Doc. You don't hand-clean output.

---

## Stage D — Deliver + Next Move

Per the **Default Post-Run Reporting** rule in `exodus-strategist`: surface the Doc URL + the variant breakdown + a 2-line take. At the default that's **V1 Mario × Brand, V2 Infeed × Brand**; with more passes, each added pass is another Mario + Infeed pair, and **pass 2 uses the Top-Ads-Biased primer**. Flag the Genesis-specific gotcha: if a 2nd pass was requested and the top-ads primer was empty, that pass's two variants silently fall back to the brand primer.

Don't auto-`read-doc` every variant. Pull the Doc (`npx @aicopycoders/exodus read-doc <runId>`) only to critique hooks, pick a winner for a follow-up, or diagnose a failure.

Then offer the fitting next moves (a short menu is fine here):
- Apply an edit pass to the strongest variant (Natural Language / Shorten / Cut / Simplify / Make Better — on the dashboard run page)
- Run more passes, or another Genesis pass at a different awareness level / with different seeds (creative diversity)
- Render statics from the winning variant via the `exodus-image` skill

---

## What This Skill Does NOT Do

- It doesn't replace `exodus-genesis` or `exodus-foundation` — it sequences them. Drop into those skills, or `exodus-strategist`'s Framework Index, for depth.
- It doesn't add a CLI command. The flow runs the existing `npx @aicopycoders/exodus foundation` / `genesis` / `browse` / `read-doc` commands.
- It doesn't do analysis or ideation pipelines — those stay strategist-driven via `exodus-strategist` and its `references/` (STORMING, CASH, the diversity matrix). This skill is the path from "I want to write" to a finished Doc.
