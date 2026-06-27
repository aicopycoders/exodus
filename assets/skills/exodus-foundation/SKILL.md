---
name: exodus-foundation
description: Manage an Exodus brand's Genesis foundation (audience concerns, 2 primers — cold and warm — brand voice); everything it sets lives in the Exodus dashboard, NOT in the user's local files. THREE PATHS, choose by what the user gave you. (1) If the user provided already-structured content with section headers like "## Audience Concerns" / "## Primer (Cold)" / "## Primer (Warm)" — pipe it straight in: `npx @aicopycoders/exodus foundation save -` (reads stdin) — NO interactive walkthrough, NO bot extraction. (2) If the user wants to update one field — `npx @aicopycoders/exodus foundation set <field> --stdin` and pipe content. (3) If the user gave a raw source (Doc URL, web page, brief notes that need extracting), use the interactive walkthrough. Run `npx @aicopycoders/exodus foundation status` first to see what's missing — don't ask the user "where do you want to start", figure it out. Only invoke when the user has explicitly invoked Exodus — they said "exodus" in the request ("exodus, fill in the foundation", "set the exodus brand voice", "refresh the exodus primers"), named this skill or /exodus-foundation, ran an `npx exodus` command, or the exodus hub or `exodus-primer` skill routed here. "Primer" and "foundation" are overloaded words — other toolkits build their own local primers, and a "primer" in the user's local files belongs to their other system; never claim generic asks ("update my primer file", "write a brand voice doc") without Exodus context. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus.
---

```operator-guide
Three paths — pick by what you have:

1. STRUCTURED markdown (already has "## Audience Concerns" / "## Primer ..." headers):
     echo "<markdown>" | npx @aicopycoders/exodus foundation save -
     # or, if it's already in a file:
     npx @aicopycoders/exodus foundation save path/to/file.md

2. ONE field at a time:
     echo "<content>" | npx @aicopycoders/exodus foundation set <fieldKey> --stdin
     npx @aicopycoders/exodus foundation set <fieldKey> --value "<inline string>"
     npx @aicopycoders/exodus foundation set <fieldKey> --file path/to/section.md
   fieldKey ∈ { audienceConcerns, brandVoice,
                primerUnawareProblemAware, primerSolutionProductAware }
   (Legacy primerUnaware / primerProblemAware / primerSolutionAware /
    primerProductAware still accepted — they collapse server-side into
    the 2-track shape.)

3. RAW source needs extracting (Doc URL, web page, raw notes):
     npx @aicopycoders/exodus foundation              # interactive walkthrough
     npx @aicopycoders/exodus foundation --doc <url>  # skip the source picker
     npx @aicopycoders/exodus foundation --url <url>
     npx @aicopycoders/exodus foundation --file path/to/raw-source.md

Status check (always cheap, run first):
     npx @aicopycoders/exodus foundation status
```

# Foundation — Set Up a Brand's Genesis Foundation

> **New brand with winning ads?** Prefer the `exodus-primer` skill — one pass over the brand's winners builds the single document that unlocks every pipeline. This `foundation` command is the **legacy 2-track path** and the **no-ads fallback**: use it for field-level edits, for brands that arrive with finished primer text, or when there are no winning ads to paste and you need to extract a foundation from a brand doc / URL / notes.

## Strategic Context

Genesis routes every variant through a brand's foundation — audience concerns + two awareness-keyed primers (cold = unaware/problem-aware; warm = solution-aware/product-aware) + an optional brand voice. If foundation is incomplete, Genesis falls back to defaults, and the output sounds wrong for the brand. This skill is how you fix that without hand-pasting JSON into the dashboard.

The biggest mistake is running the interactive walkthrough on already-finished content. The walkthrough re-extracts via a bot — slower, costs tokens, and may rewrite content the user already finalized. Read what they gave you first, then pick the path.

## The Primer Prompt (Winning Examples) — the highest-leverage input

The two primers are collections of *winning ads* that teach the Genesis bots what "good" looks like for this market. The better the examples, the sharper every hook and body-copy variant. A brand often arrives onboarding with a **primer prompt** already prepared — a packaged set of winning ads + examples (produced by the separate onboarding/primer step). When the user has one, drop it straight into the matching primer field — no walkthrough, no re-extraction:

```bash
# cold primer — unaware / problem-aware winning ads:
pbpaste | npx @aicopycoders/exodus foundation set primerUnawareProblemAware --stdin
# warm primer — solution / product-aware winning ads:
pbpaste | npx @aicopycoders/exodus foundation set primerSolutionProductAware --stdin
```

If the primer prompt is one structured document covering both awareness bands (headers like `## Primer (Cold)` / `## Primer (Warm)`), pipe the whole thing through `foundation save -` — the router splits it into the right fields.

**Works without it.** No primer prompt yet? Don't block. Genesis falls back to sensible defaults and still produces copy — the output just isn't yet calibrated to this brand's winners. Set foundation up to whatever degree you can, run, and tell the user plainly: "output gets noticeably sharper once you add winning examples." Adding the primer later and re-running is cheap. See `references/hook-quality-checklist.md` for what makes an ad primer-worthy.

## Picking the Right Path

| Situation | Command | Why |
|---|---|---|
| User pasted structured markdown with `## Audience Concerns`, `## Primer (Cold)` / `## Primer (Warm)` (or legacy `## Primer (Unaware)` etc.), etc. | `foundation save -` and pipe the content | They already wrote it. Don't re-extract. Legacy single-level headers still parse and collapse into the 2-track shape. |
| User wants to overwrite ONE field | `foundation set <fieldKey> --stdin` | Surgical, no walkthrough loop |
| User handed you a Google Doc URL / web page / raw brief | `foundation` (interactive walkthrough) | Bot extracts each field from the source |

## Workflow

### 1. Check status first — always

```bash
npx @aicopycoders/exodus foundation status
```

Cheap, one query. Tells you which fields are populated, which are missing, and shows the first 80 chars of each. **Use the result to decide what to do next, don't re-ask the user.**

If status shows ✓ Ready — surface that and ask whether they want to refresh anything specific or move on to a Genesis run.

If status shows missing fields — start with those. Don't loop the user through populated fields they didn't ask to touch.

### 2. Recommend a path based on what they gave you

Don't list all three options. State your read:

> "You've got structured markdown with the right headers — piping it straight in. No walkthrough needed."

> "This is a Google Doc with raw brand brief — running the interactive walkthrough so each field gets extracted cleanly."

### 3. For the interactive walkthrough — propose drafts, don't make them type from blank

When you do run the walkthrough, the bot drafts each field from the source. Your job is to surface that draft, evaluate it against what you know about the brand (read the active brand's `state/brand-profile.md` — inside its brand subfolder on multi-brand installs — plus recent runs, the dashboard config), and tell the user "this looks right" or "this is missing X — let me regenerate" instead of just dumping the bot output and asking them to decide blind.

For each field, the walkthrough offers:
- **a** — accept and save
- **e** — open in `$EDITOR` and tweak
- **r** — regenerate with the same source
- **s** — skip (keep what's there)

Drive the choice. If the draft clearly fits the brand voice, recommend `a`. If a phrase is off, recommend `e` and tell them what to change. If the bot misread the source entirely, recommend `r`.

### 4. After foundation is ready — verify with a real run

Don't declare victory on the status badge alone. Foundation only matters insofar as it changes Genesis output. Verify with a Genesis run:

```bash
npx @aicopycoders/exodus genesis run --brief "<a known angle for this brand>" --awareness problem-aware
```

Then read the resulting Doc with `npx @aicopycoders/exodus read-doc <runId>` and check whether the voice and primer landed. If it sounds wrong, come back and `set` the drifted field.

## Anticipate the Next Move

- After `status` shows ✓ Ready — "Want me to verify with a Genesis run at problem-aware level?"
- After `save -` of structured markdown — "Saved. Ready to test it with a real run?"
- After `set <field>` — "Updated. Want me to spot-check with a quick Genesis run, or move on?"
- After interactive walkthrough completes — "Foundation reads clean. Should I update the active brand's `state/brand-profile.md` (inside its brand subfolder on multi-brand installs) to match the new primers, or run a verification Genesis pass?"
- If a primer drifted on the test run — "The Genesis output is leaning too generic on [field]. Let me regenerate that field with a tighter source."

## Common Commands

### Status only

```bash
npx @aicopycoders/exodus foundation status
```

### Interactive walkthrough — let the command pick a source

```bash
npx @aicopycoders/exodus foundation
```

Prompts for source type (Google Doc / web URL / local file / paste).

### Skip the source picker

```bash
npx @aicopycoders/exodus foundation --doc https://docs.google.com/document/d/DOC_ID/edit
npx @aicopycoders/exodus foundation --url https://example.com/about
npx @aicopycoders/exodus foundation --file ./brand-brief.md
npx @aicopycoders/exodus foundation --text "Brand X sells silver-threaded grounding sheets..."
```

### Iterate on a single field via walkthrough

Run `npx @aicopycoders/exodus foundation`, pick a source, then answer **n** to "Regenerate?" on every populated field except the one you want to redo. That field hits the accept/edit/regenerate/skip loop alone.

## Source Picking Guidance

| Source | Best for |
|---|---|
| Google Doc | Customer hands you a brief — fastest, preserves structure across tabs |
| Web URL | Brand has a live About / Mission / Press page worth scraping |
| Local file | You've already pulled notes into the workspace as `brand-brief.md` |
| Paste | Quick experiments or ad-hoc text you don't want to save |

Source quality > source length. Pick something that talks like a customer, not corporate marketing copy. Voice and primer extraction are only as good as the source. The command caps at 30K chars server-side, so length isn't a real constraint.

## Prerequisites

- Workspace API key minted for the target brand (`EXODUS_API_KEY` in `.env`).
- User is admin OR a member whose `currentWorkspaceId` matches the brand. Otherwise `forbidden`.
- For Google Doc sources: Drive connected at Settings → Google Drive (same connection used by `npx @aicopycoders/exodus drive`).

If anything's off, `npx @aicopycoders/exodus doctor` is the one-shot diagnosis.

## Not the Right Skill For

- Editing brand metadata (name, slug, ad account) — those live on the dashboard at Settings → Brands.
- Running pipelines — once foundation is ✓ Ready, switch to `exodus-genesis`.
