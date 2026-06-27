---
name: exodus-primer
description: Build an Exodus brand's primer — the single onboarding step that unlocks every Exodus pipeline. The primer reads a brand's winning ads + product facts and writes the modular document the writers use to construct new ads; primers built here live in the Exodus dashboard, NOT in the user's local files. It runs ONE clean intake → build → save → verify pass; if the brand has NO winning ads to paste, it hands off to the `exodus-foundation` skill (the legacy / no-ads path) instead of forcing a primer. Only invoke when the user has explicitly invoked Exodus — they said "exodus" in the request ("exodus, set up my brand primer", "build the exodus primer", "onboard this brand in exodus"), named this skill or /exodus-primer, ran an `npx exodus` command, asked why an Exodus brand can't run pipelines yet, or the exodus hub skill routed here. "Primer" is an overloaded word — other toolkits build their own local primers, so never claim generic primer requests ("rebuild my primer", "update the primer doc") without Exodus context; a "primer" in the user's local files belongs to their other system. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus.
---

```operator-guide
The primer is the ONE gate before any pipeline runs. Build it in one pass:

0. STATUS FIRST (always cheap — never rebuild blind):
     npx @aicopycoders/exodus primer status

1. INTAKE — collect the fill-in template below in a single reply.

2. ASSEMBLE the reply into state/primer-submission.md.

3. BUILD + SAVE (non-interactive — the --yes is what makes this safe in
   Claude Code's non-TTY shell):
     npx @aicopycoders/exodus primer --file state/primer-submission.md --yes

4. VERIFY:
     npx @aicopycoders/exodus primer status        # → ✓ Ready

NO WINNING ADS? Don't force the primer — hand off to the `exodus-foundation`
skill (extract from a brand doc / URL / notes), which unlocks the
pipelines via the legacy path:
     npx @aicopycoders/exodus foundation
```

# Primer — The Single Onboarding Gate

## Strategic Context

A brand needs exactly **one** thing before it can run any pipeline — Genesis, Creative, Template, Meme, all of them: a **primer**. The primer builder reads the brand's winning ads plus its product facts and writes a modular primer document — the reference the writers draw from to construct every new ad, at every awareness level. One document serves the whole operation. Until it's saved, the brand is **not ready** and the pipelines are gated.

This skill exists because a fresh session with no guidance improvises the onboarding badly — it grabs the ads first, then has to stop and ask for the product name in a second round-trip, peppering the user piecemeal. The fix is discipline: **check status, ask for everything once in a template, build, save without hanging, verify.** That's the whole job.

Two hard rules carry through every step:

- **Never fabricate the product facts.** The winning ads often don't name the product, the offer, or the price — that's exactly why the intake template asks for them explicitly. Ask once, up front; don't invent them after the fact to avoid a second question.
- **Fewer ads is fine; zero ads means a different path.** 10+ winning ads is the guidance, not a floor — the builder works with fewer. But a brand with *no* winning examples shouldn't be pushed through the primer at all. Route it to `exodus-foundation` (see the No-Ads Branch).

## Workflow

### Step 0 — Status first, always

```bash
npx @aicopycoders/exodus primer status
```

Cheap, one query. It tells you whether this brand already has a primer.

- **✗ Not ready** — no primer yet. Proceed to Step 1.
- **✓ Ready** — a primer is already saved. **Don't rebuild blind.** Surface it and offer the lighter moves first:
  - `npx @aicopycoders/exodus primer show` — print the saved primer so the user can see what's there.
  - Rebuild only if the user explicitly wants to replace it (they've got better winning ads, the product changed). A rebuild *replaces* the existing primer.

This follows the same "check first, don't re-ask" discipline as the `exodus-foundation` skill. Use the status result to decide what to do — don't open by asking the user where they want to start.

### Step 1 — One-pass intake

Present this template and ask the user to fill it in a **single reply**. Don't collect it in pieces — everything the builder needs is here:

```
PRODUCT NAME:
WHAT IT DOES (1-2 lines):
WHO IT'S FOR:
OFFER / PRICE (optional):
PROOF / NUMBERS (optional):

WINNING ADS (paste 10, full copy; fewer is OK — tell me if you have none):
--- Ad 1: …
--- Ad 2: …
```

State plainly that the product facts matter as much as the ads — the winning ads frequently don't name the product, and you will **not** invent it. If the user says they have *no* winning ads, stop here and jump to the **No-Ads Branch** below; don't push them to manufacture examples.

### Step 2 — Assemble the submission

Write the user's filled-in template to the active brand's `state/primer-submission.md` exactly as given — in a multi-brand install that's inside the brand's subfolder (e.g. `<brand-slug>/state/primer-submission.md`; the subfolder carries a `.exodus-brand.json` marker), on a legacy single-brand install it's `state/` at the workspace root. Use that same path everywhere this skill says `state/primer-submission.md`. This makes the build reproducible (you can rebuild from the same file), keeps a record of what went in, and matches the saved-submission flow. Don't paraphrase or "improve" their winning ads — paste the full copy verbatim; the builder extracts modules from the real text.

### Step 3 — Build + save (non-interactive)

```bash
npx @aicopycoders/exodus primer --file state/primer-submission.md --yes
```

The build reads every ad and writes the full module taxonomy. **The `--yes` is load-bearing in Claude Code:** without it, the final "accept & save" prompt silently no-ops in the non-TTY shell and the primer is never saved (the symptom that forced a `printf 'a\n' |` hack before this flag existed). With `--yes`, the command builds and saves in one shot and prints the same `✓ saved` / `✓ ready` output.

If a primer already exists, `--yes` rebuilds in place (replaces it) rather than prompting — which is what you want when the user has explicitly asked to rebuild.

### Step 4 — Verify

```bash
npx @aicopycoders/exodus primer status      # → ✓ Ready — primer saved
```

Don't declare victory on the build log alone — confirm the status flipped to **✓ Ready**. `npx @aicopycoders/exodus whoami` is a fine second check that the active brand is the one you just primed. Once it's Ready, the pipelines are unlocked.

## No-Ads Branch — route to `exodus-foundation`

If the user has **no winning ads** to paste, don't force the primer — it's built to learn from real winners, and there's nothing to learn from. Hand off to the **`exodus-foundation` skill**, which satisfies the same readiness gate via the legacy path by extracting from a brand doc, a web page, or raw notes:

```bash
npx @aicopycoders/exodus foundation              # interactive walkthrough — pick a source
npx @aicopycoders/exodus foundation --doc <url>  # Google Doc brand brief
npx @aicopycoders/exodus foundation --url <url>  # live About / brand page
npx @aicopycoders/exodus foundation --file ./brand-brief.md
```

This unlocks the pipelines just like a primer does. State plainly that the output **sharpens noticeably once real winning ads exist** — adding a primer later and re-running is cheap. Don't treat "no ads" as a blocker; treat it as a different on-ramp.

## Common Commands

```bash
npx @aicopycoders/exodus primer status                                   # is this brand ready? (run first)
npx @aicopycoders/exodus primer show                                     # print the saved primer
npx @aicopycoders/exodus primer --file state/primer-submission.md --yes  # build + save, non-interactive
npx @aicopycoders/exodus primer set --file <path>                        # save a primer you already have (skip the bot)
npx @aicopycoders/exodus primer set --stdin                              # same, piped in
```

- `primer` (no subcommand) runs the interactive build; add `--file` to read the submission from a file, `--yes` to save without the confirmation prompt.
- `primer set` is for when you *already have a finished primer document* and want to store it as-is — it skips the builder bot entirely.
- Use `--file -` to read the submission from stdin if you're piping it.

## Anticipate the Next Move

- After **✓ Ready** — hand off to `exodus-write` (or `exodus-genesis` directly) to run the first real pass: "Primer's in and the brand is ready. Want me to take a winning angle through Genesis to see how the voice lands?"
- After a **rebuild** — offer a verification Genesis run so the user sees the new primer actually change the output, not just the status badge.
- After the **No-Ads Branch** reaches Ready via `exodus-foundation` — remind the user the output gets sharper once they have winners, and offer to come back and build a real primer later.
- If `status` was already **✓ Ready** at Step 0 — don't rebuild reflexively; `show` it and ask whether anything actually needs to change.

## Gotchas

- **Non-TTY save hang.** In Claude Code's shell the interactive accept/save prompt no-ops silently — the build runs but nothing saves. Always pass `--yes` for the build-and-save path. (`primer set` already saves non-interactively and needs no flag.)
- **Duplicate ads collapse.** The builder extracts from *unique* ads. If the user pastes the same ad twice (or near-identical variants), the effective sample shrinks — 10 pasted ads with 3 dupes is really 7. Dedupe before assembling `state/primer-submission.md`, and if the user is short, ask for more distinct winners rather than padding.
- **Missing offer / guarantee / urgency.** These are common gaps in a raw ad dump. Flag them as gaps to fill — ask the user for them — but **never invent** an offer, guarantee, or urgency hook. A primer built on fabricated proof teaches the writers to fabricate.
- **`--yes` with no submission source.** `--yes` pairs with `--file`/`--stdin`. Without one, the build still falls back to an interactive paste, which will hang in a non-TTY shell. Always give it a `--file` in Claude Code.
- **Don't rebuild a Ready brand by reflex.** Step 0 exists so you don't replace a good primer the user spent effort on. Rebuild only on an explicit ask.

## Not the Right Skill For

- **Editing brand metadata** (name, slug, ad account) — those live on the dashboard at Settings → Brands.
- **Running pipelines** — once `primer status` shows ✓ Ready, switch to `exodus-write` / `exodus-genesis` (or `exodus-creative`, `exodus-template`, `exodus-meme`).
- **Hand-tuning individual foundation fields** (audience concerns, the two awareness primers, brand voice) — that's the `exodus-foundation` skill's surgical `set <field>` path. Use `exodus-foundation` for the no-ads on-ramp and for field-level edits; use `exodus-primer` for the one-pass "I have winning ads, make this brand ready" build.
