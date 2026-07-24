---
name: exodus-workflow
description: Run, chain, build, edit, and automate saved Exodus Workflows — the multi-node automations that wire Genesis bots, primers, briefs, transforms, and image nodes together on the dashboard canvas — from the CLI. Use it to list a brand's workflows, describe what a workflow needs before running it (inputs, per-workspace primer prerequisites, outputs), run one and collect its outputs, chain one workflow's output into another's input, browse the bot catalog, author or update a workflow contract via templates → edit → validate → import, resolve runs that park (review a gate from the terminal, check the workflow inbox, repair a stalled run, answer a nested workflow's slots), continue a bot session in chat, enable/disable/fire triggers, read the brand's copy banks or promote a winner, and list versions or roll one back. Only invoke when the user has explicitly invoked Exodus: they said "exodus" in the request ("exodus, run my launch workflow", "exodus, what does this workflow need", "exodus, build a workflow that turns a swipe into hooks then ads", "list my exodus workflows", "exodus, edit that workflow", "exodus, review this gate", "exodus, check my workflow inbox", "exodus, resolve that parked run", "exodus, continue that session", "exodus, enable/fire the trigger", "exodus, read my hooks bank", "exodus, promote this winner", "exodus, list the versions / roll it back"), named this skill or /exodus-workflow, ran an `npx @aicopycoders/exodus workflow` / `session` / `bank` command, or the `exodus` hub skill routed here. Never claim generic "workflow"/"automation"/"inbox"/"promote a winner"/"continue the session" requests ("automate this", "build me a workflow", "check my inbox") without Exodus context — in shared folders those may belong to the user's other tools; if the user did not say exodus, this skill is not for them. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus.
---

```operator-guide
Core — discover & run:
  exodus workflow list [--json]                              List the brand's saved workflows
  exodus workflow describe <workflowId|name> [--json]        Inputs, prerequisites, outputs
  exodus workflow bots [--category <cat>] [--slug <slug>] [--json]   Bot catalog / one bot's spec
  exodus workflow run <workflowId|name> [--input key=value ...] [--terminal <nodeId> ...] [--wait] [--json]   Run it
  exodus workflow status [--id <runId>] [--json]             Poll a run / read its outputs
  exodus workflow export <workflowId|name> [--version <n>] [--out <file>] [--json]   Dump the contract (YAML)

Authoring:
  exodus workflow templates [list] [--json]                  List starter templates
  exodus workflow templates export <key> [--out <file>] [--json]   Write a template's YAML to edit
  exodus workflow schema [--kind <kind>] [--face <face>] [--json]   Live graph vocabulary
  exodus workflow validate <file> [--update <workflowId>] [--json]   Check a file (import --dry-run's door)
  exodus workflow import <file> [--update <workflowId>] [--dry-run] [--json]   Create/update a workflow

Parked runs:
  exodus workflow inbox [--json]                             Every run parked waiting on you
  exodus workflow gate <runId> [pick <n,..> | edit <n> | push "<msg>" | approve | reject [--reason "..."]] [--json]   Resolve a gate
  exodus workflow repair <runId> retry|skip|kill [--wait] [--json]   Resolve a repair park
  exodus workflow answer <runId> [--slot key=value ...] [--json]   Answer a nested workflow's slots (no --slot → list them)

Sessions + triggers:
  exodus session list [--json]                               Chat sessions on the active brand
  exodus session show <sessionId> [--json]                   A session's turns
  exodus session chat <sessionId> "message" [--json]         Append a message, print the reply
  exodus workflow triggers <workflowId|name> [enable <n> | disable <n> | fire [<n>] [--text "..."] [--wait]] [--json]   List/flip/fire triggers

Banks + versions:
  exodus bank list [--json]                                  The brand's copy banks
  exodus bank show <key> [--json]                            One bank's entries (newest-first)
  exodus bank promote <key> [text] [--file <path>] [win/provenance flags] [--json]   Land a winner (fires the flywheel)
  exodus workflow versions <workflowId|name> [--json]        A workflow's saved history

Flag notes that add agent-level guidance (everything else is in --help):
  --input key=@path    Load an input's value from a file (path resolved from cwd);
                       key=@@text keeps a leading "@" as a literal character.
  --terminal <nodeId>  (run) Repeatable. Scope the run to the upstream closure of
                       these end node(s); omit to run the whole graph.
  --version <n>        (export) A real 1-based id from `workflow versions`; a
                       version export carries NO triggers/description.

Every workflow/session/bank verb takes --json, and that output IS the machine API —
there is no separate agent command set.

Auth: Bearer (EXODUS_API_KEY). The canvas lives on the dashboard at /workflows.
```

# Workflow — Run, Resolve, Build, and Automate Saved Workflows

An Exodus **Workflow** is a saved graph the member builds on the dashboard canvas (`/workflows`): brief and primer sources feed Genesis bots, bots feed transforms, other bots, gates, or an image node, deposits land copy in banks, and an Output node collects the deliverables. This skill is the CLI operator for those graphs — a **peer door** to the same artifact the web canvas edits. Anything you can do to a run in the browser (review a gate, repair a stall, continue a session, promote a winner), you can do here.

**The `--json` contract (read this once).** Every `workflow`, `session`, and `bank` verb takes `--json`, and that structured output **is** the machine API — there is no separate agent command set and no MCP server. Read for humans without it; parse `--json` when you need to chain or branch on the result.

**Auth is one bearer key.** `EXODUS_API_KEY` from `.env` authorizes every verb; there are no scoped tokens. If a call 401s, run `npx @aicopycoders/exodus doctor`.

## The agent operating loop

The end-to-end narrative, every step naming its verb. You rarely walk all of it — jump to the section you need — but this is the spine when you're driving a workflow from nothing to a promoted winner:

1. **Author** — start from a template (`workflow templates`, then `templates export <key>`), edit the YAML, and pull live vocabulary with `workflow schema` as you go.
2. **Validate** — `workflow validate <file>` until it comes back clean (it's `import --dry-run` under its own door).
3. **Import** — `workflow import <file>` to create, or `import <file> --update <id>` to edit in place.
4. **Describe** — `workflow describe` to confirm inputs, prerequisites (✓/✗ primers), and outputs before spending a run.
5. **Run** — `workflow run … --wait` (streams progress, prints outputs) or omit `--wait` and poll `workflow status --id <runId>`.
6. **Notice the park** — a run can stop and wait on you. There are no webhooks in v1; you notice a park one of three ways: `run --wait` prints a pause notice naming the verb to use (the command keeps waiting — resolve from another shell, or Ctrl-C and pick it up via `inbox`), `workflow inbox` lists it, or `workflow status` shows `awaiting-review`.
7. **Resolve** — `workflow gate <runId> …` (taste review), `workflow repair <runId> …` (a stalled collector), or `workflow answer <runId> …` (a nested workflow's slots).
8. **Harvest** — read deliverables with `workflow status --id <runId> --json`; read banked deposits with `bank show <key>`; keep thinking with a bot via `session chat`.
9. **Promote** — `bank promote <key>` lands the winner **and** fires the Winner Flywheel; then check `workflow inbox` for any background run it kicked off.

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

To run only part of a graph, scope it with `--terminal <nodeId>` (repeatable): only nodes feeding the picked end node(s) execute; the rest are recorded out-of-scope.

Report the outputs plus a short take. Don't call a run "done" off the kickoff line alone — a run reaches `completed`, `partial`, `failed`, or **parks** (`awaiting-review`). A `partial` means some nodes were skipped or failed; a park means it's waiting on you (see the next section). Read `status` before declaring victory.

## 2. Runs that park

A run doesn't always finish on its own — it can **park** and wait for a human decision. There are three actionable park kinds:

- **gate** — a taste-review Gate node is holding candidates for your pick/edit/approval.
- **repair** — a require-all collector stalled on a dead input and needs a decision.
- **slots** — a nested sub-workflow is waiting on inputs (slot answers).

**No webhooks in v1 — nothing parks silently, but nothing pings you either.** You find parks three ways: `run --wait` prints a pause notice naming the verb to use (a park is not terminal — the command keeps polling so it can resume after you resolve; resolve from another shell, or Ctrl-C and pick it up via `inbox`); `workflow inbox` lists every parked run badged by kind (`gate`/`repair`/`slots`) and how it started (`bg`, `trig:<event>`); or `workflow status` shows `awaiting-review`. **`inbox` is the one place nothing hides** — including background runs a trigger fired or a promote's flywheel kicked off.

```bash
npx @aicopycoders/exodus workflow inbox
```

### Gate parks — pick / edit / push / approve / reject

Candidates are numbered **1-based**. Show them, then act:

```bash
npx @aicopycoders/exodus workflow gate <runId>                     # show the candidates
npx @aicopycoders/exodus workflow gate <runId> pick 1,3            # keep candidates 1 and 3
npx @aicopycoders/exodus workflow gate <runId> edit 2 --text "punchier hook"   # rewrite one in place
npx @aicopycoders/exodus workflow gate <runId> push "make them shorter"        # steer the upstream session
npx @aicopycoders/exodus workflow gate <runId> approve --wait      # resume the run
npx @aicopycoders/exodus workflow gate <runId> reject --reason "off-brand"     # cancel it
```

- **`edit`** takes `--text`, `--file <path>`, or piped stdin for the replacement copy.
- **`push`** sends a steering message into the gate's live chat session and banks a **fresh** candidate from the bot's reply — use it when none of the current candidates are right but the direction is fixable by asking. It does not resume the run; approve when you're happy.
- **`reject`** records the reason on the cancel **identically to the web** — the reason is not cosmetic, it's the same audit trail.

### Repair parks — retry / skip / kill

```bash
npx @aicopycoders/exodus workflow repair <runId> retry   # re-run the dead input
npx @aicopycoders/exodus workflow repair <runId> skip    # drop the dead input, continue with the rest
npx @aicopycoders/exodus workflow repair <runId> kill    # give up on the run
```

Add `--wait` to `retry`/`kill` to poll through to the next terminal state or park.

### Slot parks — answer

A nested sub-workflow waiting on inputs is a **slots** park. Run `answer` with **no** `--slot` to list the pending slot ids, then supply them:

```bash
npx @aicopycoders/exodus workflow answer <runId>                              # list the slot ids it wants
npx @aicopycoders/exodus workflow answer <runId> --slot tone=casual --slot length=short
```

## 3. Sessions

Some bots run in **session-mode**: their run leaves behind a live chat session you can keep talking to. You don't create sessions here — they're born from runs — but you can list, read, and continue them:

```bash
npx @aicopycoders/exodus session list                        # sessions on the active brand
npx @aicopycoders/exodus session show sess_123               # the session's turns
npx @aicopycoders/exodus session chat sess_123 "make the hook punchier"   # one-shot: append + print reply
```

`session chat` is a one-shot append-and-reply, not an interactive REPL — one message, one reply per call. **Replies can take minutes** (the chat route's budget is ~5 minutes), so don't treat a long wait as a hang. The `workflow status` output names the session tied to a run — that's your run→chat jump when you want to keep thinking past what a run produced.

## 4. Triggers

A **trigger** makes a workflow run itself — on a schedule (cron) or on a platform event (e.g. a promoted winner). Triggers live on the workflow and are addressed by **1-based position**, not by id:

```bash
npx @aicopycoders/exodus workflow triggers "Winner Flywheel"            # numbered list
npx @aicopycoders/exodus workflow triggers "Winner Flywheel" enable 1  # flip one switch on
npx @aicopycoders/exodus workflow triggers "Winner Flywheel" disable 1 # flip it off
npx @aicopycoders/exodus workflow triggers "Winner Flywheel" fire 1 --text "fake winner copy" --wait
```

- **`enable`/`disable` flip exactly one switch** — never rewrite a trigger by re-importing the whole contract to toggle it. The CLI reads the live trigger list and sends a **fingerprint** of the trigger's fields as a guard, so if the workflow changed under you the flip **fails loud** rather than hitting the wrong trigger. If it fails, re-list and retry.
- **Add or remove triggers by editing the YAML export** (they live in the head export) and re-importing — enable/disable never adds or removes, only toggles.
- **`fire`** starts a **real** background run on the workflow owner's keys. An event trigger's `fire` needs `--text` (the input the event would carry); a cron trigger's `fire` rejects `--text`. Its gates park into the **inbox** like any other run.

**The ruled test flow:** author the workflow with the trigger **disabled** → `fire <n> --text "fake winner copy"` to dry-fire it and watch the run (gates land in the inbox) → `enable <n>` once you're happy with what it produces.

## 5. Banks + the flywheel

**Banks** are the brand's copy libraries (hooks, body, headlines, …) that primers and workflows fold in. A fresh brand starts with six, all empty.

```bash
npx @aicopycoders/exodus bank list                 # the brand's banks + entry counts
npx @aicopycoders/exodus bank show hooks           # entries, newest-first, with source + win metrics
npx @aicopycoders/exodus bank promote hooks "Stop scrolling — your knees will thank you"
```

`bank promote` lands a winning line **and fires the Winner Flywheel** — it emits the `winner-promoted` event with **exact web parity and no opt-out**. Any workflow with an enabled matching trigger then starts a background run. So **after a promote, check `workflow inbox`** for the background run it may have kicked off. Promote reads text from an argument, `--file <path>`, or stdin (one of the three), and takes optional flags for awareness tagging (`--awareness`, body bank), win metrics (`--spend`, `--roas`, `--ctr`, `--note`), and provenance (`--run`, `--node`) — see `bank promote --help`.

## 6. Versions

Every import saves a **version**. You can list a workflow's history and export any past version:

```bash
npx @aicopycoders/exodus workflow versions "Launch Flow"         # saved history, newest-first
npx @aicopycoders/exodus workflow export "Launch Flow" --version 3 --out v3.yaml
```

Version numbers are real **1-based ids** from `versions` (not offsets). Two patterns:

```bash
# Diff two saved versions
npx @aicopycoders/exodus workflow export X --version 3 --out v3.yaml
npx @aicopycoders/exodus workflow export X --version 5 --out v5.yaml
diff v3.yaml v5.yaml

# Roll back to an earlier version
npx @aicopycoders/exodus workflow export X --version 3 --out v3.yaml
npx @aicopycoders/exodus workflow import v3.yaml --update <id>
```

A version export **intentionally carries no triggers or description** — those aren't versioned, so a rollback leaves them unchanged; the head export (`export` with no `--version`) is the only place triggers appear. Exporting a backup before a destructive `--update` is still good habit, but rollback is a real, supported move now.

## 7. Build & edit — author a workflow contract

Cold-start is a **template, not a blank file** — there is no `workflow new`. Learn the vocabulary live (`workflow schema` replaces any notion of a static schema doc), start from a template, and treat `validate` as your compiler loop. The loop: pick a starter → export it → edit → check the schema for vocabulary → `validate` until clean → `import` → review on the canvas.

### Step 1 — Learn the bot catalog and the graph vocabulary

```bash
npx @aicopycoders/exodus workflow bots                     # full catalog, grouped by category
npx @aicopycoders/exodus workflow bots --slug new-hook-bot # one bot's full port + param spec
npx @aicopycoders/exodus workflow schema                   # LIVE node kinds, ports, config rules, faces, gate/wiring rules
npx @aicopycoders/exodus workflow schema --kind transform  # one node kind
npx @aicopycoders/exodus workflow schema --face splitter   # one transform face's ports + spec
```

Per bot you get its **input ports** (id, what it `accepts` — `text` / `primer` / `image`, whether it's required, and for primer ports which `primerKinds` gate it), its **params**, and its output type. `workflow schema` prints the **live** graph grammar from the backend you're deployed against — node kinds, port ids, config rules, transform faces, gate policies, wiring rules — so what you author matches what will validate. This is always current; pull it fresh rather than trusting memory.

### Step 2 — Start from a template

```bash
npx @aicopycoders/exodus workflow templates                          # list the starters (incl. Winner Flywheel)
npx @aicopycoders/exodus workflow templates export complete-ad-set --out my.yaml
```

`templates export` writes the server-rendered YAML verbatim — a real, valid graph to edit down, not a stub. You can also learn the format by exporting an existing workflow (`workflow export "Launch Flow" --out launch.yaml`); export writes **canonical YAML** by default (fixed key order, so equal workflows dump byte-identically and diffs stay clean). Pass `--json` on export for the legacy JSON contract; import reads either.

The contract is `nodes` (each with `id`, `kind`, a `config`, and optional `position`) and `edges` (`source`/`sourceHandle` → `target`/`targetHandle`, the handles being **port ids**). **Node positions are optional** — omit them and the server auto-layouts on import. An export also carries `workflowId` + `updatedAt` at the top — those are update anchors, not part of the graph.

### Step 3 — Validate like a compiler loop

```bash
npx @aicopycoders/exodus workflow validate my.yaml
```

`validate` is the front door; `import --dry-run` is the same check under a different door. It **needs network + login** — there is no offline validation, ever. It returns compiler-style issues, each naming the **node id**, the **port id** where relevant, and a concrete **remedy**. Codes include `dangling-edge`, `unknown-port`, `type-mismatch`, `missing-required-input`, `duplicate-input`, `cycle`, `unknown-kind`, and `bad-config`. Fix, re-run `validate`, repeat until clean.

### Step 4 — Import (create or update)

```bash
npx @aicopycoders/exodus workflow import my.yaml                 # create a new workflow
npx @aicopycoders/exodus workflow import my.yaml --update wf_123 # update in place
```

Then **tell the user to review it on the canvas at `/workflows`** — the CLI writes the graph; the human eye confirms it reads right.

**The 409 rule.** `--update` sends the export's `updatedAt` as an optimistic-concurrency guard. If the workflow moved on the dashboard since your export, the import 409s. Re-export the current workflow, reapply your edits onto the fresh contract, and import again — never force past a 409, or you'll clobber their change.

### Authoring gotchas

A hand-picked list of the traps that bite first. `workflow schema` is authoritative on any conflict with what's written here:

- **Edge handles are port ids** — `sourceHandle`/`targetHandle` name a **port**, not a node id or a label. An edge only connects if the target port `accepts` the source port's type.
- **Required inputs hard-block** — a run refuses to start until every required input is supplied; there's no "run anyway".
- **Transform faces are sealed** — each face has fixed, per-face **output port ids** you must wire from by name; `workflow schema --face <face>` prints them.
- **`session` outputs are single-consumer** — a session-typed output feeds exactly one downstream edge; a Push node's `last`/`all` output ports fan out to many consumers freely.
- **Deposit shapes are strict** — a deposit's config must match the target bank's expected shape exactly, or import rejects it.
- **Empty defaults are deliberately invalid** — `rig`, `call`, `transform`, and `bot` nodes ship with empty config placeholders that fail validation on purpose; you MUST fill them, not leave them.
- **Quote YAML that looks numeric or boolean** — `"true"`, `"3.0"`, `"01"` need quotes or the parser coerces them to the wrong type.
- **A 409 on `--update` means re-export first** — reapply your edits onto the fresh contract; don't force.

## 8. Chain — feed one workflow's output into the next

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

For persistence that lives *inside* Exodus rather than in a file, remember **banks**: a run can deposit copy into a bank, and you read it back with `bank show <key>` — that's the server-side equivalent of the file convention.

## Direct HTTP (if you're scripting past the CLI)

The same contract is on the v2 API, so a script can skip the CLI:

- **Export:** `GET /api/v2/workflows/export?id=<workflowId>&format=yaml` returns the canonical YAML (`text/yaml`); drop `format` (or `format=json`) for the legacy JSON body.
- **Import:** `POST /api/v2/workflows/import`. A JSON object body carries the contract *plus* the control fields inline (`dryRun`, `targetWorkflowId`, `expectedUpdatedAt`). A raw **YAML** body is the contract text alone — pass the control fields as **query params** instead (`?dryRun=true&targetWorkflowId=<id>&expectedUpdatedAt=<ts>`).

The gate/inbox/session/bank verbs have v2 routes too, but the CLI is the maintained path — reach for HTTP only when you're already scripting, and prefer the CLI's `--json` output over hand-rolling routes. Both are Bearer-auth'd (`EXODUS_API_KEY`) like every v2 route.

## Failure handling

- **`describe` shows a ✗ prerequisite** — don't run yet. Fill the primer via `exodus-primer` / `exodus-foundation`, then re-check `describe`.
- **Run comes back `partial` or `failed`** — read `status --id <runId>` (drop `--json` for a readable view) to see which node failed and why **before re-running**. A partial still has usable outputs; harvest them first.
- **A verb refuses because the run isn't in that state** — the gate/repair/answer verbs preflight the run and name its **actual** state (e.g. "parked for repair" when you tried a gate verb). Read the state it reports and switch to the matching verb, or check `inbox` for what's actually pending.
- **Trigger fingerprint mismatch** — the workflow changed since you listed its triggers. Re-list (`workflow triggers <wf>`) and retry the enable/disable/fire against the fresh numbering.
- **`validate` / `import` errors** — fix the exact node/port each issue names using its remedy; don't guess. `validate` needs network + login — there is no offline check.
- **`import --update` 409** — re-export, reapply, re-import. This is a conflict, not a bug.
- **After a promote** — the success line includes the flywheel note; check `workflow inbox` for the background run it may have started.
- **Auth / whoami failure** — run `npx @aicopycoders/exodus doctor` and confirm `EXODUS_API_KEY`.
- **Wrong brand** — workflows, sessions, and banks are per-brand. `npx @aicopycoders/exodus brand current` to confirm you're on the brand you think you are; switch with the `exodus-brand` skill.

## Not the right skill for

- **Running a single Genesis writing pass** (brief → copy in two voices) — that's `exodus-genesis`. Reach here when the member has a *saved multi-node workflow* to run or build.
- **One-off image renders** — `exodus-image` / `exodus-creative` / `exodus-template`.
- **Building the primer a workflow depends on** — `exodus-primer` (winning ads) or `exodus-foundation` (no ads).
- **Finding a past run's output doc** — `exodus-browse`.
