# Bot prompts for the mechanism skill

All calls go through the `genesis-bots` helper, one at a time:

```
node .claude/skills/genesis-bots/scripts/genesis-stream.mjs <bot-slug> <prompt.txt> <out.md>
```

Slugs (confirm against the live list; they can change): `health-mechanism-matrix-bot`, `universal-mechanism-bot`, `characterizations-bot`, `metaphors-bot`, `surprising-culprit-bot`, `segmentmech-swapper-bot`.

Limits: one concurrent stream per key, 60 requests a minute. Each run is a long completion on the provider key. Run per segment cell, save under `state/mechanisms/<segment-slug>/`.

## The constraint block (goes in every prompt)

```
CONSTRAINT: I want ONE problem and ONE solution. Two links maximum (A happens → B is the symptom; the fix inverts A).
Simple, intuitive, visual, concrete. No multi-headed mechanisms. Name the problem in two or three words and make the name imply the fix.
Star ingredient: <name>. It must lead. <Booster> may support. <Delivery / timing> may carry the mechanism. Supporting ingredients never lead.
Avoid the crowded corners: <list the competitor words and the corners they own>. Take an empty corner if one exists.
Keep the output compact.
```

## health-mechanism-matrix-bot (supplements)

Tested prompt shape. Output: STEP 1 a research prompt covering 12 matrix mechanisms; STEP 2 a scoring table (Understand, Attention, Visualise, A→B Path, Body-Feel, total /50), the top four with mechanism, ingredient fix, criterion notes, marketing application and weakness, then a final recommendation. Told to "run your full process", it ranks from its own knowledge instead of waiting for external research. If you want the deeper version, take its STEP 1 research prompt, run it yourself (with the model, or a research tool the user has approved), paste the findings back to the bot, and ask it to re-rank.

```
PRODUCT: <name>. <form factor and timing>. <formula with doses>. <founder and story in one line>.

SEGMENT / PERSONA: <outcome → sub-outcome · demographic · facets>. <what they have tried>. <what they believe causes it>. Money symptom: <the one they would pay anything to erase>.

COMPETITOR MECHANISMS ALREADY IN MARKET: <from the competitor file: word → who owns it → which corner>. Nobody strong owns <empty corner>.

<constraint block>

Run your full process on this.
```

## universal-mechanism-bot (any market; second pass on supplements)

Output: 9-box matrix × 3 examples each with names, a scoring table (zeitgeist 40, intuitive simplicity 40, novelty 20), top three with why-it-works and implementation notes. It will produce 27 to 36 candidates; expect most to be too complex, that is what Step 3 of the skill is for.

```
BUILD A BUYER: <persona card or the ODF coordinate with self-ID line, tried-and-failed, belief>.

MARKET INFORMATION: <sophistication in one line>. <competitor mechanism census: the crowded words and their corners>. <zeitgeist words the market is using this quarter>.

OFFER BRIEF: <product, features, star ingredient or feature, delivery, founder, proof, transformation>.

<constraint block>

Generate the full matrix, score it, and give the top 3. For each of the top 3 also write the A → B in one line and the one picture I would draw on a whiteboard.
```

## characterizations-bot (after a mechanism is chosen)

```
MECHANISM (UMP): <A → B in one line>. Problem name so far: "<name>".
SOLUTION (UMS): <the fix in one line>. Star: <ingredient or feature>. Delivery: <form/timing>.
SEGMENT: <coordinate and self-ID line>.
AVOID: names that imply the problem is permanent (eating, mutated, degenerating). Names must imply the fix.
Give 20 characterizations, classified UMP / UMS, then a ranked top 3 with one line on why each would stop the scroll.
```

## metaphors-bot (the one picture)

```
UMP: <A → B>. UMS: <the fix>. Body-feel of the problem: <how it feels, in their words>. Body-feel of the fix: <the opposite>.
Give natural, mechanical, and object metaphors. Prefer ones I can draw in one frame and feel in the body (termites, not bulldozers). Mark the three you would put in a hook.
```

## surprising-culprit-bot (the villain, when the thesis needs one)

```
PROBLEM: <money symptom>. SEGMENT: <coordinate>. MECHANISM: <A → B>.
What they are doing now to fix it: <the tried-and-failed list>.
Give 15 surprising culprits where something they trust or do every day is the cause. Rank by which the segment would believe in one sentence. Blame the product or the industry, never the person's body or discipline.
```

## segmentmech-swapper-bot (aim a winner at a new cell)

```
WINNING AD: <full transcript or copy>.
KEEP: the structure, beat order, proof, offer, CTA, certainty.
SWAP: the mechanism from "<old A → B>" to "<new A → B>" and the segment from <old coordinate> to <new coordinate>, self-ID line "<line>".
Change only the lines the swap forces. List every line you changed.
```

## Reading bot output

- Take the scoring tables as a first sort, not a decision. The skill's Step 3 gates decide.
- Bots over-complicate. A "mechanism" with three arrows is two mechanisms or a paragraph. Collapse or split.
- Bots invent numbers and studies. Anything with a percentage or a citation gets marked as the compliance rung until checked.
- Keep the bot's "potential weakness" lines; they are usually right.
