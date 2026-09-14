---
name: positioning-spiral
description: The parent thinking loop for positioning a product before any ads get written. Use it whenever someone is onboarding a new brand or client, starting a new SKU, asking "who do we sell this to and what's the story", "what's the mechanism", "does this hang together", "are we positioned right", or wants segments, personas, and mechanisms figured out together. It cycles through five stations (features, targets, research, catalog, thinking) until segments, mechanisms, and story are coherent, calling the station skills (odf, mechanism, find-competitors, patterns-and-gaps) as needed. Trigger it even when the user only names one piece ("let's look at the ingredients", "find me competitors for this") if no coherent positioning exists yet, because that piece will change the others. Do not use it for writing ad copy or images; it stops when the story is coherent.
---

# Positioning Spiral

Positioning is not a line. It is a spiral. The mechanism you pick depends on the segment, the segment depends on what is provable, what is provable depends on what competitors have already paid to learn, and all of it has to fit inside a catalog that already exists. So you do not do these once each. You loop through them, and each pass changes the question at the next station, until the whole thing holds together and nothing contradicts it.

This skill is the parent (the positioning spiral). It decides which station to visit next, keeps the loop in think mode, and runs the exit test. The station skills do the depth. If a station skill is not installed, run that station as a conversation using the notes below.

## The two modes

Read the `thinking-vs-build` skill if installed. The short version:

- **Think mode** is the default for this whole loop. One station per exchange. Short lists. One or two words per item. Propose, let the user cut, move on. No documents.
- **Build bursts** happen inside a station when data needs gathering: rip these ads, scrape these reviews, pull these competitor pages. Run them comprehensively without check-ins, write files early, report spend, then come back to think mode and say what the new data changed.
- **The exit test passing is the build cue.** Only then write the story page, the grid, and the mechanism map.

The most common failure is building a document at a station that only needed a list. If the user has not said "build", "make", "write the doc", or "put that in", stay in think mode.

## The five stations

Each station answers one question. Each has inputs to ask for, a station skill for depth, and a note on what it tends to change elsewhere.

### 1. Features: what is possible to say

Ingredients first. Then everything else the brand can honestly claim: the form factor (dropper, gummy, powder), the founders and creators and their story, the brand's origin, manufacturing or sourcing facts, anything a competitor could not copy tomorrow.

Ask for: the formula with doses, the product bible or spec, founder background, what the brand already says about itself.

Output in think mode: a list of candidate mechanisms and story elements, one or two words each, with the ingredient or feature that backs each one. The star ingredient goes in every mechanism. Supporting ingredients never lead.

Depth: `mechanism` skill (competitor mechanism file, the Genesis mechanism bots, the simplicity gates, the lock).

Changes elsewhere: a mechanism the market already believes (cortisol, gut, hormones) pulls targets toward the people who use that word. A founder story pulls toward the identity axis.

### 2. Targets: who is plausible

Segments and personas. Outcomes the buyer wants fixed, the demographics you can tick from across the room, the identity they claim, the facets that explain why they are here now.

Ask for: current buyers, the ads with the best hold, comments under running ads.

Output in think mode: outcomes as one or two words with sub-outcomes beneath, then demographics, identity, facets, one axis per exchange.

Depth: `odf` skill, MAP entry point. The stress-test rules there apply: different human not synonym, nothing in two rows, states and occasions are facets, copy lines are not segments.

Changes elsewhere: every new segment needs a mechanism it believes and a competitor or review that proves someone like them buys. A segment with neither goes on hold.

### 3. Research: what is proven, and what people already say

Two halves, kept separate because they prove different things.

**Competitor products.** Who is scaling, on which mechanism (their UMP, the mechanism they sell as positioning), with what offer, for how long. Group competitors by mechanism, not by category. A long-running ad is evidence the angle converts. Rip transcript, headline, body, rank, on-screen text, and keep the user's per-brand notes verbatim next to the evidence.

**Voice of customer.** Reviews, comments, Reddit, in exact words. Rank sources by volume because volume is language richness. Count mentions. Keep quote banks by theme with reference numbers. Negatives are data.

Ask for: the brands the user already watches and their read on each, Atria or Ad Library access, Amazon categories to shortlist.

Output in think mode: the two or three angles competitors have proven, the two or three themes reviews say loudest, and one line on where they disagree with the current targets.

Depth: `find-competitors` (who is strong, proven with numbers, grouped by UMP) and `patterns-and-gaps` (what repeats, what lands, what is missing).

Changes elsewhere: this is where "stress" dies and "3AM waking" is born. If no competitor and no review backs a target, mark it hypothesis and move it down the focus order.

### 4. Catalog: what does not collide

Every proposal against the brand's other SKUs and the brand's own live ads. A sister product already claiming the mechanism is a collision. A sister product's ads targeting the same segment is a collision. The product bible saying one ingredient while the ad says another is a flag.

Ask for: the full catalog with formulas, the brand's own ad account pulled by SKU.

Output in think mode: one line per collision and the copy rule that resolves it ("cortisol belly belongs to the collagen; we take night cortisol").

Depth: none needed; this is a scan. Run it after any new mechanism or target proposal, before the user asks. They will ask anyway.

Changes elsewhere: a collision sends you back to features or targets for a lane the catalog leaves open.

### 5. Thinking: the coherent story

The station where the user and the skill sit with the other four and ask whether it holds. No new data. Say the story in three sentences: who, what they feel, what the product does about it and why it works. Then check it against the exit test.

Output in think mode: the story in three sentences, the focus order with a simple argument from ads, competitors, reviews, and logic, and the list of what is still hypothesis.

## How to run the loop

1. **Load what exists and say it back in one paragraph.** Product, formula, what it sells today, who buys now, what is winning and fatiguing, the sister SKUs. If the user has tested ads, read them raw before anything else; own winning ads outrank everything.
2. **Enter at the richest station.** Usually features if the brand is new, targets if there are tested ads, research if the user arrives with a competitor list and a hypothesis. Do not force a fixed order.
3. **One station per exchange.** Put a short list down. Let the user cut. Name what the answer changes at other stations in one line.
4. **Run build bursts only for data.** When a station needs a rip or a scrape, say the plan back in two lines, get the go, then run it comprehensively and report spend. Write files early so a cut connection loses nothing.
5. **Spiral.** After each station, ask which station the new answer weakens. Go there. Typical paths: features → targets → research → targets again → catalog → features again → thinking.
6. **Run the standing checks every pass** (below).
7. **When the exit test passes, say so and stop.** Offer the build: story page, segment grid, mechanism map. Wait for the build cue.
8. **When the user says "note your place"**: what is done, what is missing, what is next. Then wait.

## Exit test

The story is coherent when every focus segment has all five, and nothing in one row contradicts another:

| Segment | Mechanism | Proof | Quote bank | Collision |
|---|---|---|---|---|
| one outcome × one demographic × one or two facets | star ingredient plus at most one partner plus the form factor | a scaling competitor on this angle or an own winning ad | reviews or comments in their words, with counts | none, or a copy rule that resolves it |

Anything backed by logic alone is marked HYPOTHESIS and sits below the proven segments in the focus order. The story in three sentences reads the same from every row.

Evidence ladder when arguing a cell: own winning ad > long-running competitor ad > comment under a running ad > review or Reddit quote > logic.

## Standing checks

- **Collision** after any positioning or mechanism proposal, before being asked.
- **"Is this backed by the reviews?"** Answer with counts or say thin.
- **"Are we missing anything?"** Check the data for the biggest themes not on the list. Name at most three.
- **Segments seen.** Any segment spotted in a competitor ad or the brand's own ads goes on a running list, even if it is not a focus.
- **Compliance deferred.** World of possibilities first; flag hot words, do not censor them.
- **Use the user's taxonomy.** Outcome, sub-outcome, demographic, identity, facet. Mechanism = ingredient story. UMP = the mechanism a competitor sells.

## Output when the exit test passes

```
# <Brand> — <Product> — Positioning Story (v1, <date>)

## The story (three sentences)
Who. What they feel. What the product does and why it works.

## Focus segments
| # | Segment | Mechanism | Proof | Quote bank | Collision rule |

## Hold (hypothesis)
| Segment | Why it is on hold | What would prove it |

## Collisions and copy rules
- <sister SKU> owns <angle>; we take <angle>.

## Segments seen (not focus yet)
<a> · <b> · <c>

## Where the evidence lives
| Source | Path or link |
```

Then hand off: `odf` writes the grid and the personas, `mechanism` writes the mechanism map, and the production plan follows.

## Worked example: Evenkeel Reset Gummies

Fictional brand, fictional competitors, fictional numbers. The shape is what matters.

**Setup.** Evenkeel sells Reset Gummies: saffron extract, magnesium glycinate, rhodiola, in an evening gummy. The founder is a former ER nurse. Sister SKUs: Night Tea (sleep) and Glow Collagen, whose ads already say "lowers cortisol". Current ads say "stress relief" and are fatiguing.

**Pass 1, targets.** Tested ads read raw. The best hold is on an ad about waking at 3AM, not on any stress ad. Proposed outcomes: Sleep, Mood, Stress, Cortisol, Energy. User cuts Stress to a sub-outcome: "nobody buys for stress." What this changes: features needs a mechanism for night waking.

**Pass 2, features.** Saffron has mood and sleep evidence; magnesium glycinate has night waking; rhodiola is a daytime adaptogen. Candidate mechanisms: "night cortisol" (saffron + magnesium), "mood" (saffron alone), "energy" (rhodiola). Star ingredient set to saffron; it goes in every one. What this changes: research needs to prove someone buys "night cortisol".

**Pass 3, research.** Competitors grouped by UMP. Dawnfield ($2M a month) runs cortisol with symptom stacks in the hook: belly, puffy face, hips, wired at night. Nuvella runs cortisol plus gut. Root & Rise runs perimenopause. Reviews: "wake at 3AM" is the top sleep phrase by count; "puffy face" appears in cortisol product reviews, not sleep ones. What this changes: cortisol is proven as a word, but the visible symptoms are body and face, which Evenkeel cannot honestly claim to fix.

**Pass 4, catalog.** Glow Collagen already says "lowers cortisol" and shows belly and face. Collision. Copy rule: Collagen owns cortisol belly and face; Reset owns night cortisol and the 3AM wake. Night Tea owns "fall asleep"; Reset owns "stay asleep". What this changes: targets tighten to staying asleep, peri mood, and evening rage.

**Pass 5, thinking.** Story: women 40 to 55 who fall asleep fine and wake at 3AM with a racing mind; their evening cortisol never drops; saffron and magnesium bring it down so they sleep through. Proof: Dawnfield's night ads and the 3AM count in reviews. Quote bank: sleep reviews, 3AM theme. Collision: resolved by the copy rule. Hypothesis on hold: men 35 plus who wake at 4AM, no competitor proof yet.

Exit test passes on three segments. The build cue comes from the user. ODF writes the grid.

## What this skill is not

It does not write ads, hooks, or images. It does not choose formats or conceits. It does not replace the station skills; it sequences them. When the story is coherent, it stops.

## Standards

Before producing anything, read `STANDARDS.md` at the workspace root (and the section for this output type). Grade the draft against it before showing it; rewrite failures first. When the user reacts with a judgment, a banking phrase, or the same note twice, hand the reaction to `remember-that`. At the end of the session, `handoff` scrapes the chat and proposes entries.
