---
name: mechanism
description: Luke's way of finding a product's mechanism (the unique mechanism of the problem and of the solution) for each segment and persona: one problem, one solution, simple, intuitive, visual, concrete, never multi-headed. Use it whenever someone asks "what's the mechanism", "what's our UMP / UMS", "why does this work", "name the problem", "what's the ingredient story", "find the lock", "which ingredient leads", "what mechanism for this persona", or wants mechanism ideas from the Genesis bots (Universal Mechanism Bot, Health Mechanism Matrix Bot, and the supporting characterizations, metaphors, and surprising-culprit bots). It reads the competitor mechanism file first, uses the bots for breadth, then filters everything through the simplicity criteria and matches the survivors to the product's unique features (star ingredient, booster, delivery, founder, story) until the story locks. Runs inside the positioning-spiral as the features station and hands the chosen mechanisms to copy-instincts and the writing pipeline. Needs GENESIS_API_KEY plus a provider key in .env for the bot calls; works without them as a conversation.
---

# Mechanism

A mechanism is the story of why the problem happens and why this product fixes it. The best ones are two links long. A student's mechanism has six moving parts and nothing rhymes; a great one is "your hormones deplete, so your cells can't absorb" and the star ingredient is the thing that opens the door. This skill exists to keep mechanisms that simple, to find them per segment rather than once for the brand, and to match each one to the feature that makes it ownable.

Think mode until a bot run or a competitor scrape. Those are build bursts: say the plan and cost back in two lines, get the go, run, then come back with a short list. Read `thinking-vs-build` if installed.

## The rules

1. **One problem, one solution.** Two links maximum: A happens → B is the symptom. The fix inverts A. If it needs a third link it is not a mechanism yet, it is a paragraph.
2. **Simple, intuitive, visual, concrete.** A ten-year-old gets it in three seconds. It can be drawn on a whiteboard. It matches how the problem feels in the body (stuck → flowing, heavy → light, wired → settled). "It's like a [familiar thing] for [this]" completes without effort.
3. **Not multi-headed.** One cause. Not "hormones and cortisol and gut". If the market believes three causes, pick the one this segment believes and leave the others for other segments.
4. **The name implies the fix.** A pulse can be quieted, a leak plugged, a switch flipped, gunk cleaned. Cannibal brain cannot be un-eaten. Name it in two or three words: body thing plus what it is doing wrong.
5. **Per segment, per persona.** A mechanism that explains the 3AM wake does not explain rage at the kids. Build the map cell by cell; some cells share a mechanism, most do not.
6. **Ownable.** The mechanism must land on a unique feature so no competitor can say it the same way. Star ingredient alone. Star × booster. Star × delivery. Star × booster × delivery. Feature × founder. Feature × story. Supporting ingredients never lead.
7. **Zeitgeist counts, borrowed words are fine, saturated words are not.** If the market already says "cortisol", use it and take the unowned corner of it (night cortisol, not belly). If four strong brands own the exact phrase, move one word over.
8. **Psychology first, then make it true.** Decide the mechanism that would be most intuitive, then check the science can carry it and the compliance team can live with it. Facts-first produces the same mechanism everyone has.

## Inputs

- The product's features: formula with doses, form factor and timing, founder and story, process, proof. From the `positioning-spiral` features station or the brief.
- The segment grid and any personas: the outcome, sub-outcome, and the Belief facet for each cell. From `odf`.
- The competitor mechanism file (below). From `find-competitors` and the rip.
- Voice-of-customer quote banks: the words they use for the cause ("I think it's my hormones", "wired but exhausted").

## Step 1. The competitor mechanism file

Before generating anything, know what the market is already being sold. One file, one row per competitor mechanism, built from the ad bank, the swipe file, and the sheet from `find-competitors`. Template and the operations to run on it are in `references/competitor-mechanisms.md`. The short version:

- **UMP census:** count competitors by the mechanism word they sell. Crowded words are proven; empty words are either unowned or unwanted.
- **Corner map:** for each crowded word, which corner do they own (cortisol → belly, face, morning) and which corners are empty (cortisol → night).
- **The visual each one uses**, the name each one gives the problem, and the two-link version of their story. If their story cannot be written in two links, that is a weakness you can beat.
- **What they blame** (the industry, a food, a habit, the body) and **what they absolve**.

Output in think mode: the three or four crowded words, the empty corners, one line each.

## Step 2. Breadth from the bots

The bots produce more candidates than a person will, and they are meant to be over-generated then cut. They also tend to be over-complicated; that is what Step 3 is for.

Which bot:
- **Supplements and anything with a body mechanism:** `health-mechanism-matrix-bot`. It builds a 12-mechanism research prompt from the 12-box matrix (structure / function / element × too much / too little / out of balance / dysfunctional), then ranks the top four on five criteria (understand, attention, visualise, A→B path, body-feel) out of 50. Told to "run the full process" it ranks from its own knowledge without waiting for external research.
- **Everything else, and a second pass on supplements:** `universal-mechanism-bot`. 36 candidates from the 9-box matrix, scored on zeitgeist 40, intuitive simplicity 40, novelty 20, top three with hooks.
- **After a mechanism is chosen:** `characterizations-bot` for 20 names and a top three, `metaphors-bot` for the visual, `surprising-culprit-bot` for the villain angle, `segmentmech-swapper-bot` to swap the mechanism into an existing winner.

How to call them: the `genesis-bots` skill's helper, one call at a time (one concurrent stream per key), output to a file in the folder. Prompt templates that produce the shape this skill needs are in `references/bot-prompts.md`. The prompt always carries the constraint: one problem, one solution, two links, star ingredient named, competitor words listed so the bot avoids the crowded corners.

Cost: each bot run is one long completion on the provider key (a few cents to a few tens of cents). Say it back before running.

Run one bot per segment cell you are working, not one per brand. Save each output inside the active brand's folder, under `<brand>/state/mechanisms/<segment-slug>/<bot>.md` (run `npx @aicopycoders/exodus brand current` first; never write one brand's material into another brand's folder).

## Step 3. Cut to simple

Take every candidate (bot output, competitor corners, your own) and put it through this in order. Most die at the first gate.

1. **Two links?** Write it as "A → B". If it needs "and" or a third arrow, cut or collapse it.
2. **One cause?** If it names two causes, split it into two candidates or cut one.
3. **Draw it.** One picture. If you cannot draw it, simplify until you can.
4. **Barista test.** Say it while ordering coffee. If it needs a setup sentence, cut.
5. **Body-feel.** Does the solution match how the problem feels? Wired → settled, not wired → "optimised".
6. **Belief match.** Does it use the cause this segment already believes, or one they will accept in a sentence? A mechanism the persona has to be taught is a mechanism for a different persona.
7. **Name implies fix.** Rename until it does.
8. **Corner check.** Against the competitor file: is this word crowded, and if so is this the empty corner?
9. **Plausibility.** Can the science carry the two links at the doses in the bottle? Mark the rung compliance will pull.

Survivors get the bot's scores if it gave them, otherwise score simplicity, zeitgeist, and novelty 40/40/20 by hand. Keep the top three per cell.

## Step 4. Find the lock

For each surviving mechanism, match it to the unique feature that makes it ownable. Try the combinations in this order and stop at the first that rhymes:

| Shape | Question |
|---|---|
| Star alone | Does the star ingredient's natural story explain the fix by itself? |
| Star × booster | Does one partner make the two-link story stronger without adding a link? |
| Star × delivery | Does the form factor or timing carry the mechanism (evening gummy active at 3AM; sublingual in 20 minutes; patch while you sleep)? |
| Star × booster × delivery | Only if all three say the same thing in different languages. Three dials, one rhyme. |
| Feature × founder | Does the founder's background make them the natural discoverer? |
| Feature × story | Does the origin, process, or place carry it (untouched land, forged rock)? |

Then the lock test from `copy-instincts`: one breath, no "and also", pain and solution share a root metaphor, the spokesperson is irreplaceable, proof is a chapter of the story. Write the one-breath version. If it does not lock, go back to the competitor file or the bots with the constraint tightened.

Sympathetic magic belongs here: what does the star ingredient's source do in nature that maps to the fix? Use it if it rhymes, drop it if it needs explaining.

## Step 5. The mechanism map

One row per segment cell that has a chosen mechanism. Lives in the active brand's folder as `<brand>/state/mechanism-map.md` and feeds the ingredient-story column of the segment grid.

```
# <Brand> — <Product> — Mechanism Map (v<n>, <date>)

| Segment (O → sub · D · F) | Problem, named | A → B | Solution, named | Lock (star / booster / delivery / feature) | One picture | Belief it uses | Competitor corner | Proof rung | Compliance rung |

## One-breath versions
- <segment>: "<one breath>"

## Cut and why
- <candidate> — died at gate <n>: <reason>

## Bot runs
- <segment>: health-mechanism-matrix-bot → <brand>/state/mechanisms/<slug>/health.md (top pick: …)
```

Hand-offs: `copy-instincts` for the story and the hooks (the mechanism is the curiosity block), `characterizations-bot` and `metaphors-bot` for names and visuals, the writing pipeline for ads, and back to `positioning-spiral` for the catalog collision check (a mechanism a sister SKU already claims is a collision).

## Worked example: Evenkeel Reset Gummies (fictional)

Evening gummy: saffron 30mg, magnesium glycinate 200mg, rhodiola 100mg. Founder a former ER night-shift nurse. Segment: women 45 to 60 who fall asleep fine and wake at 3AM, many on HRT and still waking, melatonin fails, Belief facet "hormones or cortisol".

**Step 1.** Competitor file: cortisol is crowded (four strong brands) but they own belly, face, and morning. Sleep-onset is crowded and fatiguing. Peri hormone-balance is crowded. Empty corner: night cortisol, "stay asleep".

**Step 2.** `health-mechanism-matrix-bot` with the template prompt. Top four, scored out of 50: 3AM Cortisol Pulse (45), Serotonin Night Drain (44), HPA Brake Failure (40), Sleep-Guard Signal Collapse (39). Its own read: lead with the pulse because it borrows the word competitors already taught and takes the unowned night corner; the evening gummy timing becomes the delivery story.

**Step 3.** Pulse: two links (cortisol fires too early and too hard → brain snaps awake). One cause. Drawable (a flare at 3AM on a line that should slide downhill). Barista: "your cortisol fires at 3AM instead of 6". Body-feel: snapping awake, exactly what they describe. Belief: cortisol, already held. Name implies fix: a pulse can be quieted. Corner: empty. Plausible at the doses with saffron's HPA evidence; "the only thing shown to quiet it" is the rung compliance pulls. HPA Brake Failure died at gate 1 (three links). Sleep-Guard died at gate 4.

**Step 4.** Star × delivery locks: saffron quiets the pulse, and an evening gummy is in the blood at 3AM when the pulse fires. Magnesium as booster adds no link, so it stays supporting. Founder rhymes: an ER nurse lived the 3AM surge every shift. One breath: "You don't have a falling-asleep problem, you have a 3AM cortisol pulse. It fires too early and snaps you awake. An evening saffron gummy is active in your blood at 3AM to quiet it, so you sleep through."

**Step 5.** Row written. Serotonin Night Drain held for the melatonin-fails persona as its own row. Collision check: Glow Collagen keeps belly and face; night is clear.

## What this skill is not

It does not position the brand (positioning-spiral), map segments (odf), or write ads. It finds the two-link story per segment, proves it is ownable, and hands it on.

## Standards

Before producing anything, read `STANDARDS.md` at the workspace root (and the section for this output type). Grade the draft against it before showing it; rewrite failures first. When the user reacts with a judgment, a banking phrase, or the same note twice, hand the reaction to `remember-that`. At the end of the session, `handoff` scrapes the chat and proposes entries.
