---
name: exodus-browse
description: View past Exodus pipeline runs and pull outputs from previous sessions. This skill should not just dump the run table back at the user — it should filter, name the most relevant entry, and offer the next move (open the doc, re-run with a sharper brief, rerun with tweaks). Only invoke when the user has explicitly invoked Exodus: they said "exodus" in the request ("exodus, what did we run today", "show me my exodus runs", "did the exodus genesis run from earlier finish"), named this skill or /exodus-browse, ran an `npx exodus` command, or the `exodus` hub skill routed here. Never claim generic history questions ("what did we run today", "show me past runs") — in shared folders those may belong to the user's other tools; if the user did not say exodus, this skill is not for them.
---

```operator-guide
Inputs:
  none required — defaults to recent runs across all pipelines
Flags:
  --limit (default: 20) — max runs to list
  --agent — filter by agent: genesis | creative | template | meme
Returns: terminal table of recent runs with timestamps, agents, statuses, and Doc URLs
```

# Browse — View History and Surface the Right Run

## Strategic Context

`exodus-browse` (the `npx @aicopycoders/exodus browse` command) is the cheap, fast read on what's happened recently in Exodus. Almost every exodus-invoked "where did that go?" / "what did we run?" question routes here. The mistake to avoid is treating it as a dumb proxy — pasting the full table back to the user is more noise than signal. Your job is to find the run they actually mean and queue up the next move on it.

## When to Use

- "What did we run today / this week?"
- "Find that Genesis run about cortisol from this morning."
- "Did the Creative run finish yet?"
- "Show me all our Template runs."
- "Where's the doc from earlier?"

## Workflow

### 1. Run the query that matches the user's intent

If they named a pipeline, filter by it — don't make them re-ask:

```bash
npx @aicopycoders/exodus browse --agent genesis --limit 20
```

If they didn't name one, list across all:

```bash
npx @aicopycoders/exodus browse --limit 30
```

Bump `--limit` higher when they say "this week" or "all our runs" — the default 20 will miss things on a busy day.

### 2. Parse the output, then surface the relevant entry

Don't paste the whole table. Read it, find the run that matches what the user asked for (by topic keyword, time, status), and call it out by name. Examples:

> "The cortisol Genesis run from this morning is `gen_xyz123` — finished at 9:42am, doc here: <url>."

> "Three Creative runs this week. The most recent (`run_abc789`) is the only one that completed — the other two failed mid-render."

If multiple runs match, list 2-3 with one-line context each, then ask which one. If nothing matches, say so directly and suggest the closest neighbor ("nothing today, but here's yesterday's Genesis run on a similar angle").

### 3. Anticipate the next move

The user almost never wants `exodus-browse` for its own sake. They want to do something with what they find. Offer the obvious next step inline:

- "Want me to read the doc for `gen_xyz123` and pull the top hooks?"
- "Should I re-run that with a sharper brief and a new awareness level?"
- "Want me to check the run that just finished?"
- "Ready to rerun the failed one with the fix?"

Pick the one that fits their pattern, don't list all four.

### 4. For "is it done yet?" questions

Use `status` directly with the run ID — it's faster than re-listing:

```bash
npx @aicopycoders/exodus status --id <runId> --type genesis
```

`--type` is required and pipeline-specific. Get it wrong and you get a 400. For standalone Genesis runs, use `--type genesis`. Creative-suite runs (native / copy-derived / ref-match / meme) use `--type creative`; Template runs use `--type template`.

## Reading a Run's Doc

Once you've identified the run, prefer `read-doc` over the Drive MCP — it walks every tab. The MCP only sees tab 1 and will misreport the run as empty:

```bash
npx @aicopycoders/exodus read-doc <runId>
```

Falls back to the Drive MCP only if `read-doc` exits with code 2 (`unavailable`).

## Run Types Reference

| Type | Used For |
|------|----------|
| `genesis` | Standalone Genesis runs |
| `creative` | Creative-suite runs — native, copy-derived, ref-match, and meme |
| `template` | Template (ad-type format) runs |

All of them also render live in the creative-suite library / dashboard if you'd rather watch there.
