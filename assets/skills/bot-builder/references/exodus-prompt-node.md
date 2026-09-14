# Putting a bot into an Exodus workflow

Two shapes exist. Author the **`prompt` node kind** for new work. The older bot node with `slug: prompt` still runs and is never auto-converted; leave existing graphs alone.

Always pull the live grammar before authoring; it changes:

```
npx @aicopycoders/exodus workflow schema --kind prompt
npx @aicopycoders/exodus workflow schema --kind splitter
npx @aicopycoders/exodus workflow schema --kind collector
npx @aicopycoders/exodus workflow bots            # curated slugs and blurbs; --slug <slug> shows one bot's ports
npx @aicopycoders/exodus workflow templates       # starters to export and edit
```

## The `prompt` node

The prompt is the node. What you write in `promptText` is sent as one call to the writing model on the workspace's own LLM key. No Genesis slug, no Genesis key needed.

| Key | What it does |
|---|---|
| `promptText` | Required, ≤ 20000 characters. Every distinct `{{variable}}` becomes a required input port named for it (max 12), in first-appearance order. A slot accepts a text wire or a Primer node (the primer's text fills it). No slots is legal: a self-contained prompt takes no inputs. Slot names are flat identifiers; no `{{node.field}}` syntax; not named after JS object members. |
| `model` | Optional override. Claude ids run on any key; slashed ids (openai/…, google/…) need an OpenRouter key. Empty = the default writing model. |
| `temperature` | 0 to 1, default 0.7. Honoured here. (On a Genesis-routed bot node it is inert.) |
| `loops` | 1 to 5, stored as total passes. 3 means draft, critique-and-rewrite, critique-and-rewrite. Only the final flows downstream; intermediates land in the run log. The builder shows this as N-1. |
| `loopInstructions` | Array indexed by pass; entry 1 is reserved and never read. With `loops: 3` write `["", "steer the first rewrite", "steer the second rewrite"]`. Each ≤ 2000 characters, a nudge not a second brief. |
| `bankKeys` | Up to six of `hooks`, `headlines`, `body:unawareProblemAware`, `body:solutionProductAware`, `body:mostAware`, `modules`. Their entries ride along as reference material. |
| `sessionMode` | true appends a `session` output so a member can continue the chat by hand. No node accepts a session wire. |

Output: one `text` port.

There is no dedicated primer port and no implicit brief. To feed a stored primer, wire the Primer node into one of the `{{slots}}`. An unwired slot blocks the run (`missing-required-input`); there is no run-anyway.

## Minimal YAML

```yaml
nodes:
  - id: transcripts-in
    kind: brief
    config:
      label: Competitor transcripts
  - id: segments-seen
    kind: prompt
    config:
      promptText: |
        ### MANDATE
        You extract every segment the following ads call out or imply. Quote exactly or not at all. Never ask a question; this runs as a node.
        ### INPUT
        {{transcripts}}
        ### OUTPUT
        One block per segment: ODF label · confidence (DIRECT / IMPLIED / HYPOTHESIS) · source ad · exact quote · one-line note (segment / copy line / hypothesis).
      model: claude-sonnet-5
      temperature: 0.3
      loops: 2
      loopInstructions:
        - ""
        - "Check every quote against the source text and drop any that are not verbatim. Re-sort by facet family."
  - id: out
    kind: output
    config:
      label: Segments seen
edges:
  - source: transcripts-in
    sourceHandle: text
    target: segments-seen
    targetHandle: transcripts
  - source: segments-seen
    sourceHandle: text
    target: out
    targetHandle: in
```

Check the Brief and Output port ids against `workflow schema --kind brief` and `--kind output` before importing; the ids above are the usual ones, not a promise.

## Fan-out: one bot, many items

A Splitter turns one input into N items and every node after it runs once per item, like N assembly lines. A Collector waits for all lanes and folds them back into one result.

- Splitter modes: `structural` (the artifacts are the items; aim at one field of a JSON payload with `sourceField`), `rule` (cut on newline, blank-line, numbered, or a literal custom pattern; no model call), `semantic` (a model cuts by your instruction). `maxItems` is required and a hard cap; over it fails loudly, zero items fails too.
- Collector modes: `assemble` (stitch with a separator and an optional `itemTemplate` using `{{item.value}}`, `{{item.index}}`, `{{item.total}}`), `list` (one JSON artifact with counts and what dropped), `synthesize` (a model writes one piece from all items). Policies: `onBranchFailure: survivors | strict`, `minItems`, `ordering: index | arrival`.
- Inside an open fan only bot, formatter, transform, checkpoint, output, image, and image-rig may sit. No nested splits, no node in two fans. Close with a Collector and everything is allowed again.
- A Checkpoint inside the fan parks once after all lanes finish and lets the user approve or reject each item. Rejection is filtering, not failure.

Pattern for "run my bot on every ad in a swipe file": Brief → Splitter (rule, blank-line, maxItems 50) → Prompt node with `{{ad}}` → Collector (assemble, itemTemplate `### Ad {{item.index}} of {{item.total}}\n{{item.value}}`) → Output.

## Formatter, the shape guarantee

When the next step needs a known shape: `formatter` in `template` mode (deterministic, `{{slots}}` become input ports, no model call) or `extract` mode (a model pulls declared fields out of loose text and the node validates; a `list` field emits one artifact per element; violations are re-asked up to `maxRetries`, then the node fails rather than passing a wrong shape). Extract mode also emits `bundle:all`, the whole sheet as one artifact.

## Validate, import, review

```
npx @aicopycoders/exodus workflow validate my.yaml     # compiler loop; needs network and login
npx @aicopycoders/exodus workflow import my.yaml       # create
npx @aicopycoders/exodus workflow import my.yaml --update <id>   # update in place; a 409 means re-export first
```

Then tell the user to look at it on the canvas at `/workflows`. The CLI writes the graph; a human eye confirms it reads right.

## Gotchas that bite first

- Edge handles are port ids, not node ids or labels.
- Required inputs hard-block; an unwired `{{slot}}` never runs.
- Empty default configs for `bot`, `prompt`, `formatter`, `transform`, `rig`, `call` fail validation on purpose; fill them.
- Quote YAML that looks numeric or boolean (`"true"`, `"3.0"`, `"01"`).
- `temperature` on a curated or custom Genesis bot node does nothing; only `prompt` honours it.
- A Genesis-routed bot's required input, if unwired, becomes a warning and a thinner answer, not a block. A `custom` slug nobody's registry knows still blocks.
- `customInstructions` on a bot node (≤ 4000 characters) layers house rules over a curated bot's hidden prompt; it is a note, not a second brief. The material the bot works on arrives on wires.

## Choosing bot node versus prompt node

- The job exists as a curated Genesis bot (write a hook, a VSL section, a buyer profile) → `bot` node with the curated slug, `customInstructions` for house rules, `bankKeys` and `primerId` for brand material.
- The job is yours, or the temperature matters, or you want self-review loops with per-pass steering → `prompt` node.
- The job should be reusable across brands and members as a Genesis bot → design it with the bot-builder-bot, then wire it in as `custom` with its slug once it is published.
