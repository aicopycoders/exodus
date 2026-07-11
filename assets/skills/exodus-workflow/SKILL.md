---
name: exodus-workflow
description: Run, chain, build, and edit saved Exodus Workflows — the multi-node automations that wire Genesis bots, primers, briefs, and image nodes together on the dashboard canvas — from the CLI. Use it to list a brand's workflows, describe what a workflow needs before running it (inputs, per-workspace primer prerequisites, outputs), run one and collect its outputs, chain one workflow's output into another's input, browse the bot catalog, and author or update a workflow contract via export → edit → import. Only invoke when the user has explicitly invoked Exodus: they said "exodus" in the request ("exodus, run my launch workflow", "exodus, what does this workflow need", "exodus, build a workflow that turns a swipe into hooks then ads", "list my exodus workflows", "exodus, edit that workflow"), named this skill or /exodus-workflow, ran an `npx @aicopycoders/exodus workflow` command, or the `exodus` hub skill routed here. Never claim generic "workflow"/"automation" requests ("automate this", "build me a workflow") without Exodus context — in shared folders those may belong to the user's other tools; if the user did not say exodus, this skill is not for them. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus.
---

```operator-guide
Subcommands:
  exodus workflow list [--json]                              List the brand's saved workflows
  exodus workflow describe <workflowId|name> [--json]        Inputs, prerequisites, outputs
  exodus workflow bots [--category <cat>] [--slug <slug>] [--json]   Bot catalog / one bot's spec
  exodus workflow run <workflowId|name> [--input key=value ...] [--wait] [--json]   Run it
  exodus workflow status [--id <runId>] [--json]             Poll a run / read its outputs
  exodus workflow export <workflowId|name> [--out <file>]    Dump the contract JSON
  exodus workflow import <file> [--update <workflowId>] [--dry-run] [--json]   Author/edit

Key flags:
  --input key=value    Repeatable run input; the value may contain "="
  --input key=@path    Load the value from a file (path resolved from the cwd);
                       use key=@@text to keep a leading "@" as a literal character
  --wait               Poll until the run reaches a terminal status, then print outputs
  --id <runId>         Run id for `status` detail
  --category <cat>     (bots) Filter the catalog to one category id
  --slug <slug>        (bots) Show a single bot's full port + param spec
  --out <file>         (export) Write JSON to a file instead of stdout
  --update <workflowId> (import) Update this workflow in place (optimistic-concurrency
                       guarded by the export's updatedAt — a 409 means re-export first)
  --dry-run            (import) Validate + resolve refs without writing; returns issues

Auth: Bearer (EXODUS_API_KEY). The canvas lives on the dashboard at /workflows.
```

# Workflow — Run, Chain, and Build Saved Automations

An Exodus **Workflow** is a saved graph the member builds on the dashboard canvas (`/workflows`): brief and primer sources feed Genesis bots, bots feed other bots or an image node, and an Output node collects the deliverables. This skill is the CLI operator for those graphs — discover and run them, chain one into the next, and author or edit the contract without opening a browser.

Three jobs, three sections below. Read the request and jump to the one that fits; don't walk all three when the user just wants a run.

## 1. Discover & run

The mistake to avoid is firing a run blind and wasting it on a missing input or an unmet prerequisite. Always **`describe` before `run`**.

### Step 1 — List

```bash
npx @aicopycoders/exodus workflow list
```

Prints the brand's saved workflows (name, id, node/edge counts, timestamps). If the user named the workflow already, skip straight to `describe`.

### Step 2 — Describe (read inputs, prereqs, outputs)

```bash
npx @aicopycoders/exodus workflow describe "Launch Flow"
```

Accepts a workflow id **or** a name. It reports three things:

- **Inputs** — each free input the run needs: field name, source (`text`, `swipe-ad`, `swipe-bundle`, `organic-url`, `ad-url`), whether it's required, and a description. These are the `--input key=value` pairs you'll pass.
- **Prerequisites** — the per-workspace primer markers the graph's primer nodes depend on, each shown **✓ stored** or **✗ missing** for *this brand*. **If any prerequisite is ✗, warn the user before running** — the run will not produce good output (or will fail) without it. Route them to the `exodus-primer` / `exodus-foundation` skill to fill the gap first, rather than burning a run.
- **Outputs** — the deliverables the Output node collects (text or image, with labels), so you know what to expect back.

### Step 3 — Gather inputs

Fill every required input. For a free-text brief you can compose a **bespoke brief from in-session research** — the winning angle you just worked out, the swipe you analyzed — and pass it inline (`--input brief="..."`) or, if it's long, write it to a project file and pass it with `@file` (see Chain, below). For URL/swipe sources, pass the value the source expects.

### Step 4 — Run and collect

```bash
npx @aicopycoders/exodus workflow run "Launch Flow" --input brief="new cortisol offer, problem-aware" --wait
```

`--wait` polls to a terminal status and prints the run's collected outputs — text inline, image URLs. Without `--wait` the command returns the `runId` and you poll it yourself:

```bash
npx @aicopycoders/exodus workflow status --id <runId>
```

Report the outputs plus a short take. Don't call a run "done" off the kickoff line alone — a run reaches `completed`, `partial`, or `failed`; a `partial` means some nodes were skipped or failed, so read the status before declaring victory.

## 2. Chain — feed one workflow's output into the next

The chaining surface is the run's flattened outputs. After a `--wait` run (or once `status` shows terminal), pull the machine-readable outputs:

```bash
npx @aicopycoders/exodus workflow status --id <runId> --json
```

The response carries a top-level `outputs` array — each entry is `{ nodeId, botSlug?, type, label, text?, imageUrl?, imageId? }`. Extract the text you want (e.g. `.outputs[].text`) and pass it into the next workflow's input:

```bash
# Inline, for short outputs
npx @aicopycoders/exodus workflow run "Ad Writer" --input hooks="<text from run A>" --wait
```

**The file-as-persistence convention.** For anything reusable or long — a brief, a sales letter, a hook pool — write the text to a **markdown file in the project** and pass it with `@file`. This is the deliberate v1 alternative to a server-side store: the file *is* the persistence layer, versioned in the project alongside the brand's other artifacts.

```bash
# Save run A's text output to a project file, then feed it to workflow B
npx @aicopycoders/exodus workflow status --id <runId> --json   # copy .outputs[].text into state/hooks.md
npx @aicopycoders/exodus workflow run "Ad Writer" --input hooks=@state/hooks.md --wait
```

`@path` is resolved from the current directory. If the literal value you need actually starts with `@`, escape it as `@@` (e.g. `--input handle=@@brand` passes the string `@brand`).

Use this pattern to compose pipelines the canvas doesn't wire directly: run the research/hook workflow, persist its best output as a file, then run the writing workflow off that file — reproducibly, because the file stays.

## 3. Build & edit — author a workflow contract

The documented way to learn the contract format is to **export an existing workflow and study it** — there is no separate schema doc. The loop is: learn the bots → learn the format → compose → dry-run until clean → import → review on the canvas.

### Step 1 — Learn the bot catalog

```bash
npx @aicopycoders/exodus workflow bots                     # full catalog, grouped by category
npx @aicopycoders/exodus workflow bots --category writing  # one category
npx @aicopycoders/exodus workflow bots --slug new-hook-bot # one bot's full port + param spec
npx @aicopycoders/exodus workflow bots --json              # raw catalog for machine use
```

Per bot you get its **input ports** (id, what it accepts — `text` / `primer` / `image`, whether it's required, and for primer ports which `primerKinds` gate it — `body` / `hook` / `headline` / `summary`), its **params** (select/text/toggle/number/multiselect, with options and defaults), and its output type. This is what tells you which node can wire into which — a port only accepts an edge whose source produces a type it lists in `accepts`.

### Step 2 — Learn the format by exporting

```bash
npx @aicopycoders/exodus workflow export "Launch Flow" --out launch.json
```

Study `launch.json`: it's the `exodus-workflow` contract — `nodes` (each with `id`, `kind` = `brief`/`bot`/`primer`/`image`/`output`, a `config`, and an optional `position`) and `edges` (`source`/`sourceHandle` → `target`/`targetHandle`, the handles being port ids). An export also carries `workflowId` + `updatedAt` at the top — those are update anchors, not part of the graph.

### Step 3 — Compose the contract

Author the JSON by hand or by adapting an export. **Node positions are optional** — leave them out and the server auto-layouts the graph on import; you don't need to compute coordinates.

### Step 4 — Dry-run like a compiler loop

```bash
npx @aicopycoders/exodus workflow import launch.json --dry-run
```

`--dry-run` validates and resolves refs without writing. It returns compiler-style issues — each names the **node id**, the **port id** where relevant, and a concrete **remedy** (the exact edit that fixes it). Codes you'll see include `dangling-edge`, `unknown-port`, `type-mismatch`, `missing-required-input`, `duplicate-input`, `cycle`, `unknown-kind`, and `bad-config`. Fix, re-run `--dry-run`, repeat until it's clean — same loop as fixing type errors.

### Step 5 — Import (create or update)

```bash
# Create a new workflow
npx @aicopycoders/exodus workflow import launch.json

# Update an existing workflow in place
npx @aicopycoders/exodus workflow import launch.json --update wf_123
```

Then **tell the user to review it on the canvas at `/workflows`** — the CLI writes the graph; the human eye confirms it reads right.

**Two rules for edits (`--update`):**

- **Always export a backup first.** v1 has no version history — a destructive `--update` overwrites the live workflow with no undo. `export --out backup.json` before you import over it.
- **A 409 means the canvas moved.** `--update` sends the export's `updatedAt` as an optimistic-concurrency guard. If someone edited the workflow on the dashboard since your export, the import 409s. Re-export the current workflow, reapply your edits onto the fresh contract, and import again — never force past a 409, or you'll clobber their change.

## Failure handling

- **`describe` shows a ✗ prerequisite** — don't run yet. Fill the primer via `exodus-primer` / `exodus-foundation`, then re-check `describe`.
- **Run comes back `partial` or `failed`** — read `status --id <runId>` (drop `--json` for a readable view) to see which node failed and why before re-running.
- **`import --dry-run` issues** — fix the exact node/port each issue names using its remedy; don't guess.
- **`import --update` 409** — re-export, reapply, re-import (see Step 5). This is a conflict, not a bug.
- **Auth / whoami failure** — run `npx @aicopycoders/exodus doctor` and confirm `EXODUS_API_KEY`.
- **Wrong brand** — workflows are per-brand. `npx @aicopycoders/exodus brand current` to confirm you're on the brand you think you are; switch with the `exodus-brand` skill.

## Not the right skill for

- **Running a single Genesis writing pass** (brief → copy in two voices) — that's `exodus-genesis`. Reach here when the member has a *saved multi-node workflow* to run or build.
- **One-off image renders** — `exodus-image` / `exodus-creative` / `exodus-template`.
- **Building the primer a workflow depends on** — `exodus-primer` (winning ads) or `exodus-foundation` (no ads).
- **Finding a past run's output doc** — `exodus-browse`.
