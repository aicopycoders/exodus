---
name: patterns-and-gaps
description: Luke's pattern-finding and gap-finding method. Patterns are anything that occurs more often than chance and has salience, weighted by judgment, taste, and psychology, found in four places: the brand's own account, competitor accounts, organic content, and research (reviews, comments, Reddit). Gaps are what competitors and organic are doing, read through the anatomy of ads, that the brand is not doing yet, and what nobody is doing that the data says someone should. Use it whenever someone asks "what patterns do you see", "what do these have in common", "what's working across these", "what are they doing that we aren't", "where are the gaps", "what's nobody doing", "what should we steal", "compare our account to theirs", hands over a swipe file, an ad bank, a comment dump, a review corpus, or a Scout export and wants the read. Also the standing question after any rip or scrape. Patterns are found layer by layer using the anatomy-of-ads grid (WHO × WHAT × HOW × CREATIVE), so an ad set becomes comparable data before anything is counted.
---

# Patterns and gaps

The whole job, underneath everything, is looking for patterns. A pattern is anything that shows up more often than it should by chance and means something. Counting finds the "more often". Judgment, taste, and psychology decide the "means something". A gap is the space between what the market has proven and what the brand is doing, or between what the data says people want and what anyone is selling.

Think mode for the read, build mode for the counting. Read `thinking-vs-build` if installed.

## Where patterns live

Four sources, each read differently and weighted differently.

| Source | What it tells you | Weight | How you read it |
|---|---|---|---|
| Own account | What this audience actually paid for. Hook, hold, revenue, spend. | Highest. A pattern here is proof. | Sort by result, read the top and the bottom raw, then count. |
| Competitor accounts | What the market has paid to learn. Run-days, reuse, active count. | High, if the brand is strong (the `find-competitors` sheet says). | Longest-running first. A pattern across three or more strong brands is proven. One brand is a hypothesis. |
| Organic content | What people share without being paid. Outliers versus a creator's average. | Medium for angles and hooks, high for zeitgeist and language. | Outliers only (a post at 10x the account's normal). The Scout library in Exodus holds these when the brand is set up. |
| Research | Reviews, comments, Reddit, in their own words. | High for language, pain, and segments. Low for formats. | Counted mentions per term, quote banks with reference numbers, the 7-lens read. |

Evidence ladder when a pattern is argued: own winning ad > long-running competitor ad > comment under a running ad > review or Reddit quote > logic. Mark logic HYPOTHESIS.

## The layers (from `anatomy-of-ads`)

Patterns are found layer by layer, not on the whole ad. Tag every ad with the anatomy grid first, then count per layer:

- **WHO**: segment (Outcome × Demographic × Facet), persona, awareness caught at
- **WHAT**: concept (the flat fact) · angle (the family and the role starred) · mechanism (UMP, UMS, brand gate, the name) · copy blocks present and missing · copy beats present, overbuilt, unreached
- **HOW**: hook (which beat promoted, intensity, type) · structure (medium, skeleton, conceit, style)
- **CREATIVE**: static (native, template type, branded) · video (conceit, actor, style, terrain, setup)

The swap-cost rule orders what a pattern is worth: segment and mechanism patterns are driver-level (get them wrong and you are at zero); style and conceit patterns are cosmetic (cheap to copy, cheap to swap). A pattern in a cheap layer with the expensive layers held constant is the cheapest test in the account. Read `anatomy-of-ads` for the tag sheet and the tests per layer; the `message-isolator` Genesis bot dissects a single ad into its layers with exact quotes when one deserves the full read.

## Step 1. Load and normalise

Get everything into one table with the same columns, whatever the source. The ad bank is that table for own and competitor ads. For organic, the Scout export. For research, the quote banks and counts. If the sources are in different shapes, normalise before reading; a pattern across sources only shows when the columns match.

Read the raw material before counting. Top ten and bottom ten by result, read in full. The pattern you feel on the read is the hypothesis the counting tests.

## Step 2. Find patterns

Run these operations per source, then across sources. Write the count next to every claim.

**Frequency.** What repeats, per layer? Which segments, angle families, mechanism words, beats, hooks, skeletons, conceits, styles, template types. Count it. "Symptom stack → single diagnosis" appeared in nine of twenty-three cortisol competitor ads across four brands. That is a pattern. Two of twenty-three is a note.

**Salience.** Of the things that repeat, which land? Weight frequency by result: hook rate and hold on own ads, run-days and reuse on competitor ads, outlier multiple on organic, helpful votes on reviews. A thing that repeats and wins outranks a thing that only repeats.

**Co-occurrence.** What shows up together? Fake-authority actor with a diagnosis conceit. Timeline close with a week-by-week proof. Symptom stack with a named mechanism. These pairs are the reusable parts.

**Structure.** Same idea, same beat order across brands? The order is the pattern, not the words. Write it as a sequence: slap hook → symptom list → "it's cortisol" → dismiss the alternatives → mechanism → put you on the product → timeline → offer.

**Language.** Which phrases are in many ads and few human mouths (competitor coinage, copy lines) and which are in many human mouths and few ads (unclaimed language)? The second list is gold. Count both against the research corpus.

**Segments seen.** Every demographic, state, or occasion a competitor calls out goes on the running list for `odf`.

**Absence.** What does the top set never do? No one uses the founder. No one names the night. No one shows a man. Absence in a strong set is either a gap or a graveyard; the research decides which.

**Negatives are data.** The one-star reviews, the comments that argue, the ads that died. A pattern in what fails is as useful as one in what works.

Then apply judgment, taste, and psychology to rank: does the pattern explain why it works (psychology), does it feel right against everything you have seen (taste), and would it survive a hostile read (judgment)? Say which of the three you are leaning on. A pattern with a count and a psychological reason beats one with a count alone.

## Step 3. Find gaps

Gaps come in three kinds. Look for all three, in this order.

**Kind 1: they do it, we don't.** Lay the competitor pattern set against the brand's own account, layer by layer on the anatomy grid. Every proven pattern (three or more strong brands, or one brand at 90 plus days) the brand has not run is a gap. These are the cheapest wins because the market has already paid to prove them. Output: a list of proven patterns not yet in the account, with the layer they live in and the competitor ad to model.

**Kind 2: nobody does it, the data says someone should.** Lay the research against the competitor set. Words with high counts in human mouths and low counts in ads. Segments in the reviews that no strong brand addresses. A visible symptom nobody has named. An enemy nobody has blamed. A corner of a crowded mechanism word left empty (the `mechanism` skill's corner map). Output: the empty cells with the count that says they are real, marked with the evidence rung.

**Kind 3: we do it, it's fatiguing, and there is a proven replacement.** The brand's own patterns that have stopped working (hook rate falling, the word "stress" in every fatiguing ad) set against what competitors run instead. Output: what to retire and what to swap in.

Rank gaps by: size of the evidence, urgency of the outcome (usually the pain), how many strong brands prove it, how cheap it is to test (one cheap swap away from something proven beats a new segment), and zeitgeist. Then taste. Name the top three and stop; the rest go in the file.

## Step 4. Hand back

In think mode, a short list:

```
Patterns (counted, salient):
1. <pattern> — <layer> — <count / n> — <why it works, one line>
2. …
Language they say that nobody sells: <word (n)> · <word (n)>
Segments seen: <a> · <b>
Gaps:
1. <kind 1 / 2 / 3> — <the gap> — <evidence rung and count> — <the cheap test>
2. …
Hold (thin): <a> · <b>
```

In build mode, the full pattern file `<brand>/inputs/patterns-<source>-<date>.md` (inside the active brand's folder) with the operations above as sections, every count, every quote with its reference, and the gap ranking at the end. Write the "patterns across the set" section at the top of every swipe file, the way the competitor swipe already does.

Hand-offs: proven patterns go to the production plan as clusters and formats; language gaps go to `mechanism` and `copy-instincts`; segment gaps go to `odf`; retire-and-swap goes to the testing plan.

## Standing checks

- Every pattern has a count. Every gap has an evidence rung. "Feels like" is allowed only when labelled taste.
- The AI-artifact test on every language pattern: in ads or in mouths?
- A pattern from one brand is a hypothesis. From one strong brand's 90-day ad it is a strong hypothesis. From three brands it is proven.
- Absence is not automatically a gap. Check the graveyard (inactive ads with long past runs) before calling an empty space open.
- Re-run the read after every rip, scrape, or new batch of own results. Patterns move.

## Worked example (fictional)

Evenkeel Reset Gummies. Own account: twelve tested ads, best hold on a 3AM-wake story, "stress" ads fatiguing. Competitor swipe: twenty ads across six strong brands. Research: 9,000 reviews across sleep and cortisol categories, quote banks counted.

Patterns: symptom stack → single diagnosis (11 of 20, four brands, longest 289 days). Fake-authority diagnosis conceit (8 of 20, three brands). Named mechanism the viewer has not heard (all six brands). Week-by-week timeline close (7 of 20). Dismiss the alternatives by name (9 of 20; melatonin and magnesium named most). Language in mouths not ads: "wake up at 3am" (115 in reviews, 2 in ads), "wired but exhausted" (0 in reviews, 14 in ads: copy line, not a segment).

Gaps. Kind 1: the brand has never run a symptom-stack lead or a fake-authority diagnosis; both proven across three or more brands; model the 289-day ad. Kind 2: nobody sells "stay asleep" or names the night; 115 mentions say the buyer is there; corner of cortisol is empty; the founder is an ER night nurse and no competitor uses a founder at all. Kind 3: retire the word "stress" (in all four fatiguing ads, 3 mentions in 9,000 reviews); swap in the 3AM language.

Top three: symptom-stack lead aimed at the 3AM cell (kind 1, cheapest), the nurse-founder diagnosis conceit on the night corner (kind 1 and 2 together), retire "stress" for "3AM" across the account (kind 3).

## What this skill is not

It does not find the competitors (find-competitors), name the mechanism (mechanism), or write the ads. It reads what is there, counts it, weighs it, and says where the space is.

## Standards

Before producing anything, read `STANDARDS.md` at the workspace root (and the section for this output type). Grade the draft against it before showing it; rewrite failures first. When the user reacts with a judgment, a banking phrase, or the same note twice, hand the reaction to `remember-that`. At the end of the session, `handoff` scrapes the chat and proposes entries.
