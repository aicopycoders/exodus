# Segment Grid Kit

Build a segment map (outcomes × demographics × facets) with Claude Code, then push it into Exodus. Serene Herbs (a fictional brand) and its Nervous Balance Drops are the worked example.

## What's in this folder

- `SKILL.md` — the method. Tell Claude Code "build the segment grid" and it walks you through it one axis at a time. The `odf` skill is the newer, fuller version of the same method; this one stays for the hand-off doc.

## How to run it

1. The skill is installed with Exodus. Start Claude Code in your workspace folder.
2. Give Claude what you have: product facts and formula, current ads and results, competitor ads, reviews, comments. More human language = better facets.
3. Say "build the segment grid". Answer in short lists. One or two words per item. Let it stress-test.
4. When the grid is agreed, Claude writes `segment-grid.md`.

## Push it into Exodus

Exodus keeps the map under Plan → Map. The CLI is the edit surface:

```
npx @aicopycoders/exodus segment export --out segments.json   # pull the current map (empty is fine)
# edit segments.json
npx @aicopycoders/exodus segment import segments.json          # dry-runs first, then applies
npx @aicopycoders/exodus segment show                          # verify
```

The JSON shape:

```json
{
  "brand": "Your Brand",
  "product": "Your Product",
  "outcomes": [ { "name": "Sleep", "subs": [ { "name": "3AM" }, { "name": "Racing mind" } ] } ],
  "demos":    [ { "name": "Age", "values": [ { "name": "45–60" } ] } ],
  "facets":   [ { "name": "State", "values": [ { "name": "On HRT and still" } ] } ],
  "personas": []
}
```

Things to know:

- Import is a full replace, matched by name. Names missing from the file get deleted; personas they orphan get archived. If anything would be deleted the CLI refuses without `--yes`.
- The dashboard keeps exactly five demographic rows: Buyer, Gender, Age, Race / Ethnicity, Identity. Extra demo groups are dropped silently. Put life stage under Age, occupation under Identity, medical conditions under the State facet.
- Facet families are Belief, Identity, State, Value, Occasion.
- Make sure the right brand is active first: `npx @aicopycoders/exodus brand current`.
