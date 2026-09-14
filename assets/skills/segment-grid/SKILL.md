---
name: segment-grid
description: Build a segment grid for a product before writing personas or ads. Outcomes (1–2 words, with sub-outcomes) × Demographics × Identity × Facets (belief, state, value, occasion), stress-tested against ads, competitors, reviews, comments and logic. Use when someone says "map the segments", "who are we selling to", "build the grid", or before any persona or creative-strategy work. Works with no tools: a conversation, whatever data they have, this file.
---

# Segment Grid

Think first, build second. This runs as a short back-and-forth: propose a list, get it argued down, move to the next axis. Every list item is one or two words. No documents until the grid is agreed.

## The four axes

1. **Outcomes** — what the buyer wants fixed. The spine. Each outcome has sub-outcomes (the different humans inside it).
2. **Demographics** — what you could tick from across the room: gender, age band, race, buying for whom, occupation, life stage, medical identity.
3. **Identity** — who they *say* they are ("the one who holds everyone together", "not a pill person", "the researcher").
4. **Facets** — why they're here, invisible from across the room, in four families: **Belief** (what they think causes it), **State** (what they're on or have tried), **Value** (what they prefer), **Occasion** (something that happened; it has a date).

A segment = one outcome × one demographic × one or two facets. A persona is a segment named as a human. This skill stops at the grid.

## Steps

1. **Load what they have.** Product and its fixed formula or spec, what it sells today, who buys now, what's winning and fatiguing, the other SKUs it must not collide with. Say it back in one paragraph.
2. **Outcomes first.** Ask for their starting list. Sort each item into what it actually is: an outcome, a mechanism (cortisol), a demographic (menopause), or a copy line (brain fog). Propose additions from the data. Get to 6–10 outcomes, one or two words each.
3. **Sub-outcomes.** Under each outcome, 3–5 sub-outcomes, one or two words each. Use the five lenses to find them: type (which kind), location (where it shows), function (what stops working), moment (when it hits), severity (how bad). Then stress-test (rules below).
4. **Demographics.** Gender, age bands, race, buying-for, occupation, life stage, medical. Include the groups the product isn't for yet; mark exclusions.
5. **Identity.** Pull from comments, reviews, the brand's own cast, and the ads that got the best hold. Include the other gender's versions.
6. **Facets by family.** Belief, State, Value, Occasion. Check both genders. Sources: reviews ("what I tried", "what I replaced"), Reddit, comments, competitor ads (what they name and disqualify), logic (the conditions the category obviously has: shift worker, on a GLP-1, on an SSRI, postpartum).
7. **Write the grid.** One markdown file: the four axes, the agreed focus order, and an empty coverage grid (outcomes × primary demographic columns) to fill with persona names later.

## Stress-test rules

- **One word or two per item.** If it needs a sentence it isn't an item yet.
- **Different human, not a synonym.** Two sub-outcomes that describe the same person get merged.
- **Nothing in two rows.** A symptom lives in one outcome (3AM lives in Sleep, not in Menopause or Cortisol).
- **States are facets, not outcomes.** "On HRT", "off an SSRI", "tried everything" go under State.
- **Occasions are facets, not outcomes.** "Doctor shrugged" goes under Occasion.
- **Mechanisms are not outcomes** unless the market has adopted the word as the problem (cortisol qualifies; its row holds the visible symptoms).
- **Life stages can be outcomes** when buyers name the stage as the problem ("my peri symptoms"). Keep it also as a layer over the other rows.
- **The AI-artifact test.** A phrase that appears in many ads and few human mouths ("2PM crash", "wired but tired", "brain fog") is a copy line, not a segment. Count it in reviews and comments, not in ads.
- **Formula fit.** Drop outcomes the product can't honestly touch (for a calming formula: hot flashes, libido, weight loss as the outcome).
- **Compliance-hot words** (anxiety, panic, disease names) can be sub-outcomes but not headline outcomes; mark them.
- **Exclusions are not segments.** A contraindication (SSRI + a serotonergic herb) goes in the medical list marked as an exclusion.

## Evidence strength (when arguing an item)

Own winning ad > long-running competitor ad > comment under a running ad > review or Reddit quote > logic. Mark pure logic as HYPOTHESIS.

## Output template

```
# <Brand> — <Product> — Segment Grid (v1, <date>)

## OUTCOMES
| # | Outcome | Sub-outcomes |
| 1 | <word> | <a> · <b> · <c> |

## DEMOGRAPHICS
| Gender | ... | Age | ... | Race | ... | Buying for | ... | Occupation | ... | Life stage | ... | Medical | ... (exclusions marked) |

## IDENTITY
<a> · <b> · <c> ...

## FACETS
| Belief | ... |
| State | ... |
| Value | ... |
| Occasion | ... |

## FOCUS ORDER
1. <outcome → sub-outcome · demographic · facet> — one-line argument
2. ...
Hold: ...

## COVERAGE GRID
| Outcome | <demo col 1> | <demo col 2> | ... |
(blank cells = gaps; fill with persona names later)
```

## How to run it in conversation

- Propose, don't ask. Put a list down, let them cut it.
- One axis per message. Outcomes → sub-outcomes → demographics → identity → facets → focus.
- When they say "stress test", apply the rules above and show only what moved and why.
- When they ask "are we missing anything", check the data for the biggest themes not on the list (fatigue and energy is the usual one) and name at most three.
- Only write the file when the grid is agreed.
