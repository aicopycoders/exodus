# The competitor mechanism file

One file per brand, inside that brand's folder: `<brand>/inputs/competitor-mechanisms.md`. One row per mechanism a competitor sells, built from the ad bank, the swipe file, and the FOLLOW rows of the competitor sheet. It is the thing you read before generating anything, because the market has already paid to learn which words work.

## Row template

| Competitor | UMP word (the belief they sell) | Corner (which symptom or moment they own) | Problem, named (their words) | A → B (their story in two links, or "3+ links") | Solution, named | Star ingredient or feature | Visual they use | What they blame | What they absolve | Longest run (days) | Source (ad id) |

Rules for filling it:

- Their words, not yours. If the ad says "cortisol face", write that, not "elevated cortisol".
- One row per mechanism, not per ad. Ten ads on the same story is one row with the longest run.
- If their story cannot be written in two links, write "3+ links" and quote the extra link. That is a weakness.
- The visual is what is on screen when the mechanism is said: the diagram, the diagnosis overlay, the metaphor object.
- What they blame and what they absolve are the thesis: "the industry sold you falling asleep", "your body is fine".

## Operations to run on the file

**UMP census.** Count rows by UMP word. Crowded words are proven demand. Empty words are unowned or unwanted; the reviews decide which.

**Corner map.** For each crowded word, list the corners owned and the corners empty. Cortisol: belly, face, morning owned; night empty. Gut: bloating, biofilm owned; mood empty.

**Two-link test.** How many competitor stories are two links? The ones that are not can be beaten on simplicity alone.

**Visual census.** Which pictures repeat (the diagram, the doctor skit, the before-and-after body)? A repeated picture is a proven picture and also a saturated one.

**Blame map.** Who is the villain across the set? An enemy nobody has named is an open lane.

**Ingredient map.** Which star ingredients carry which mechanisms? If three brands lead with ashwagandha on cortisol, ashwagandha cannot be your star on cortisol.

**Plain-word check.** For each UMP word, count it in reviews and comments (the voice-of-customer files). A word that is in every ad and few human mouths is competitor coinage; the plain word underneath it is the one to map.

## Output in think mode

Three lines, then the next axis:

- Crowded: <word (n brands)> · <word (n)> · <word (n)>
- Empty corners: <word → corner> · <word → corner>
- Beatable on simplicity: <competitor, 3+ links>
