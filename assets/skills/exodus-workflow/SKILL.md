---
name: exodus-workflow
description: Run, chain, build, edit, and automate saved Exodus Workflows — the multi-node automations that wire Genesis bots, primers, briefs, transforms, and image nodes together on the dashboard canvas — from the CLI. Use it to list a brand's workflows, describe what a workflow needs before running it (inputs, per-workspace primer prerequisites, outputs), run one and collect its outputs, chain one workflow's output into another's input, browse the bot catalog, author or update a workflow contract via templates → edit → validate → import, resolve runs that park (approve a step paused at a checkpoint, check the workflow inbox, repair a stalled run, answer a nested workflow's slots), continue a bot session in chat, enable/disable/fire triggers, read the brand's copy banks or promote a winner, and list versions or roll one back. Only invoke when the user has explicitly invoked Exodus: they said "exodus" in the request ("exodus, run my launch workflow", "exodus, what does this workflow need", "exodus, build a workflow that turns a swipe into hooks then ads", "list my exodus workflows", "exodus, edit that workflow", "exodus, approve that checkpoint", "exodus, check my workflow inbox", "exodus, resolve that parked run", "exodus, continue that session", "exodus, enable/fire the trigger", "exodus, read my hooks bank", "exodus, promote this winner", "exodus, list the versions / roll it back"), named this skill or /exodus-workflow, ran an `npx @aicopycoders/exodus workflow` / `session` / `bank` command, or the `exodus` hub skill routed here. Never claim generic "workflow"/"automation"/"inbox"/"promote a winner"/"continue the session" requests ("automate this", "build me a workflow", "check my inbox") without Exodus context — in shared folders those may belong to the user's other tools; if the user did not say exodus, this skill is not for them. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus.
---

```operator-guide
Core — discover & run:
  exodus workflow list [--json]                              List the brand's saved workflows
  exodus workflow describe <workflowId|name> [--json]        Inputs, prerequisites, outputs
  exodus workflow bots [--category <cat>] [--slug <slug>] [--json]   Bot catalog / one bot's spec
  exodus workflow run <workflowId|name> [--input key=value ...] [--fill <name>] [--terminal <nodeId> ...] [--wait] [--out <dir>] [--json]   Run it
  exodus workflow status [--id <runId>] [--out <dir>] [--json]   Poll a run / read its outputs
  exodus workflow export <workflowId|name> [--version <n>] [--out <file>] [--json]   Dump the contract (YAML)

Authoring:
  exodus workflow templates [list] [--json]                  List starter templates
  exodus workflow templates export <key> [--out <file>] [--json]   Write a template's YAML to edit
  exodus workflow schema [--kind <kind>] [--face <face>] [--json]   Live graph vocabulary
  exodus workflow validate <file> [--update <workflowId>] [--json]   Check a file (import --dry-run's door)
  exodus workflow import <file> [--update <workflowId>] [--dry-run] [--json]   Create/update a workflow

Parked runs:
  exodus workflow inbox [--json]                             Every run parked waiting on you
  exodus workflow checkpoint <runId> [show | edit <n> | approve [--reject <n,..>] [--wait] | retry [--wait] | cancel [--reason "..."]] [--json]   Resolve a checkpoint park
  exodus workflow gate <runId>                              RETIRED in 2.0 — prints a pointer at "checkpoint" and exits 1
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
  --input key=<path>   (run) A FILE input — one `describe` reports with source
                       "asset" — takes a local file path instead of text: the CLI
                       uploads the file and sends the stored asset in its place
                       (--input hero=./photos/hero.png). An asset id from an
                       earlier upload is relayed as-is. Accepted: image PNG/JPEG/
                       WebP/GIF ≤15MB, video MP4/MOV/WebM ≤200MB, audio MP3/M4A/
                       WAV/OGG ≤50MB, document PDF/TXT/MD/DOC/DOCX ≤25MB.
  --terminal <nodeId>  (run) Repeatable. Scope the run to the upstream closure of
                       these end node(s); omit to run the whole graph.
  --out <dir>          (run --wait / status --id) Save the finished run's delivered
                       outputs into this directory and print the paths: text as
                       .md, storyboards/frame sets as .json, images/video/audio
                       downloaded. Unfulfilled slots are reported, not written.
  --version <n>        (export) A real 1-based id from `workflow versions`; a
                       version export carries NO triggers/description.
  --reject <n,..>      (checkpoint approve) Only when the paused step ran once
                       per item (a Splitter fan-out). Drops those item numbers —
                       the "Item N of M" headings in `checkpoint show` — and
                       approves the rest. Rejecting every item is refused.

Every workflow/session/bank verb takes --json, and that output IS the machine API —
there is no separate agent command set.

Auth: Bearer (EXODUS_API_KEY). The canvas lives on the dashboard at /workflows.
```

# Workflow — Run, Resolve, Build, and Automate Saved Workflows

An Exodus **Workflow** is a saved graph the member builds on the dashboard canvas (`/workflows`): brief and primer sources feed Genesis bots, bots feed transforms, formatters, other bots, or an image node, deposits land copy in banks, and an Output node collects the deliverables. This skill is the CLI operator for those graphs — a **peer door** to the same artifact the web canvas edits. Anything you can do to a run in the browser (approve a checkpoint, repair a stall, continue a session, promote a winner), you can do here.

**The `--json` contract (read this once).** Every `workflow`, `session`, and `bank` verb takes `--json`, and that structured output **is** the machine API — there is no separate agent command set and no MCP server. Read for humans without it; parse `--json` when you need to chain or branch on the result.

**Auth is one bearer key.** `EXODUS_API_KEY` from `.env` authorizes every verb; there are no scoped tokens. If a call 401s, run `npx @aicopycoders/exodus doctor`.

## The agent operating loop

The end-to-end narrative, every step naming its verb. You rarely walk all of it — jump to the section you need — but this is the spine when you're driving a workflow from nothing to a promoted winner:

1. **Author** — start from a template (`workflow templates`, then `templates export <key>`), edit the YAML, and pull live vocabulary with `workflow schema` as you go.
2. **Validate** — `workflow validate <file>` until it comes back clean (it's `import --dry-run` under its own door).
3. **Import** — `workflow import <file>` to create, or `import <file> --update <id>` to edit in place.
4. **Describe** — `workflow describe` to confirm inputs, prerequisites (✓/✗ primers), and outputs before spending a run.
5. **Run** — `workflow run … --wait` (streams progress, prints outputs) or omit `--wait` and poll `workflow status --id <runId>`. Inputs come from `--input key=value` flags, from `--fill <name>` (a saved fill — a named, reusable set of launch answers saved from the app's Run dialog; flags win per key when you pass both), or a mix. Launches that don't satisfy the workflow's entry contract are rejected at the door with the gap named — `describe` shows each input's type, required/optional, and accepted values.
6. **Notice the park** — a run can stop and wait on you. There are no webhooks in v1; you notice a park one of three ways: `run --wait` prints a pause notice naming the verb to use (the command keeps waiting — resolve from another shell, or Ctrl-C and pick it up via `inbox`), `workflow inbox` lists it, or `workflow status` shows `awaiting-review`.
7. **Resolve** — `workflow checkpoint <runId> …` (a step flagged "pause for approval"), `workflow repair <runId> …` (a stalled collector), or `workflow answer <runId> …` (a nested workflow's slots).
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

- **Inputs** — each free input the run needs: field name, source (`text`, `swipe-ad`, `swipe-bundle`, `organic-url`, `ad-url`, `asset`), whether it's required, and a description. These are the `--input key=value` pairs you'll pass. A source of **`asset`** is a **file** input — the workflow wants an actual image, video, audio clip, or document, and describe names which family it takes (e.g. `hero — asset (image), required`).
- **Prerequisites** — the per-workspace primer markers the graph's primer nodes depend on, each shown **✓ stored** or **✗ missing** for *this brand*. **If any prerequisite is ✗, warn the user before running** — the run will not produce good output (or will fail) without it. Route them to the `exodus-primer` / `exodus-foundation` skill to fill the gap first, rather than burning a run.
- **Outputs** — the deliverables the Output node collects (text or image, with labels), so you know what to expect back.

### Step 3 — Gather inputs

Fill every required input. For a free-text brief you can compose a **bespoke brief from in-session research** — the winning angle you just worked out, the swipe you analyzed — and pass it inline (`--input brief="..."`) or, if it's long, write it to a project file and pass it with `@file` (see Chain, below). For URL/swipe sources, pass the value the source expects.

For an **`asset` (file) input, pass the path to a local file** and the CLI does the uploading for you — mint, push the bytes, register, then start the run with the stored asset:

```bash
npx @aicopycoders/exodus workflow run "Product Shots" --input hero=./photos/hero.png --wait
```

A bare path is the argument (a leading `@` is accepted and ignored — a file field never text-expands). Accepted files: **image** PNG/JPEG/WebP/GIF ≤15MB · **video** MP4/MOV/WebM ≤200MB · **audio** MP3/M4A/WAV/OGG ≤50MB · **document** PDF/TXT/MD/DOC/DOCX ≤25MB. **Every file you passed is checked first — all of them — before a single byte moves**, so one bad path can't leave the others half-uploaded; you get every problem in one message and fix them in one edit. If an upload itself dies partway, the message names the asset ids that DID land so you can pass those instead of re-uploading them.

There is no file picker and no prompt: a required file input with no `--input` fails immediately, naming the flag to pass — **unless you scoped the run with `--terminal`**, since the file's node may not even be in that slice; there the server decides. If you already uploaded the file on an earlier run, pass the asset id instead of the path and it's relayed as-is.

One edge case worth knowing: the CLI reads the workflow's input list before it uploads anything. If that read fails (the server is down or flaking) and any value you passed looks like a file path, the run stops right there rather than sending your path as literal text. Retry, or pass an already-uploaded asset id.

### Step 4 — Run and collect

```bash
npx @aicopycoders/exodus workflow run "Launch Flow" --input brief="new cortisol offer, problem-aware" --wait
```

`--wait` polls to a terminal status and prints the run's collected outputs — text inline, image URLs. Without `--wait` the command returns the `runId` and you poll it yourself:

```bash
npx @aicopycoders/exodus workflow status --id <runId>
```

To run only part of a graph, scope it with `--terminal <nodeId>` (repeatable): only nodes feeding the picked end node(s) execute; the rest are recorded out-of-scope.

**Read the `Deliveries:` block first.** Each Output node on the canvas is a named, typed promise — "Final ad copy · text", "Hero image · asset" — and a finished run answers every one of them: `delivered` with the artifacts underneath, or `unfulfilled` with the reason the upstream node gave. That block is the honest scorecard; the `Outputs:` block below it is the same artifacts as one flat pile, kept for chaining. If a run says `completed` but a slot says `unfulfilled`, the workflow did NOT deliver what it promised — say so.

**Save the deliverables to disk with `--out <dir>`** (works on `run --wait` and on `status --id`):

```bash
npx @aicopycoders/exodus workflow run "Launch Flow" --input brief="new offer" --wait --out ./deliverables
npx @aicopycoders/exodus workflow status --id <runId> --out ./deliverables
```

Every delivered slot becomes a file named `<workflow>-<runId tail>-<slot key>.<ext>` — text as `.md`, storyboards and frame sets as `.json`, images/video/audio downloaded from their URLs — and each written path is printed. Unfulfilled slots are reported, never written. The directory is created if it doesn't exist.

Report the outputs plus a short take. Don't call a run "done" off the kickoff line alone — a run reaches `completed`, `partial`, `failed`, or **parks** (`awaiting-review`). A `partial` means some nodes were skipped or failed; a park means it's waiting on you (see the next section). Read `status` before declaring victory.

## 2. Runs that park

A run doesn't always finish on its own — it can **park** and wait for a human decision. There are three actionable park kinds:

- **checkpoint** — any step whose author flipped the "pause for approval" switch has finished, and the run is holding until you approve what it wrote.
- **repair** — a require-all collector stalled on a dead input and needs a decision.
- **slots** — a nested sub-workflow is waiting on inputs (slot answers).

**No webhooks in v1 — nothing parks silently, but nothing pings you either.** You find parks three ways: `run --wait` prints a pause notice naming the verb to use (a park is not terminal — the command keeps polling so it can resume after you resolve; resolve from another shell, or Ctrl-C and pick it up via `inbox`); `workflow inbox` lists every parked run badged by kind (`checkpoint`/`repair`/`slots`; the badge `gate` shows up only on a pre-2.0 run parked at the retired Gate node — those can't be resumed, cancel and run the workflow again) and how it started (`bg`, `trig:<event>`); or `workflow status` shows `awaiting-review`. **`inbox` is the one place nothing hides** — including background runs a trigger fired or a promote's flywheel kicked off.

```bash
npx @aicopycoders/exodus workflow inbox
```

### The `gate` verbs retired in 2.0

`exodus workflow gate …` no longer does anything: the Gate node it drove was
removed. Running it prints a pointer at `workflow checkpoint` and exits 1.

A run that parked at a Gate box **before** 2.0 is frozen there — it can't be
resumed, because the step it's waiting on no longer exists. Cancel it and run the
workflow again:

```bash
npx @aicopycoders/exodus workflow checkpoint <runId> cancel --reason "legacy gate park"
```

### Checkpoint parks — show / edit / approve / retry / cancel

A **checkpoint** is the "pause for approval" switch on an ordinary step (any node kind can carry it). The step runs, finishes, and then the whole run stops there until a human signs off — it waits **indefinitely**, so a `run --wait` left unattended simply keeps polling; nothing times out and nothing is lost.

There are **no candidates to pick** — there's one step's output to read and either bless, fix, or redo. Outputs are numbered **1-based**:

```bash
npx @aicopycoders/exodus workflow checkpoint <runId>                  # show the paused step + its output
npx @aicopycoders/exodus workflow checkpoint <runId> edit 1 --text "tighter opener"   # rewrite an output in place
npx @aicopycoders/exodus workflow checkpoint <runId> approve --wait   # sign off, the run continues
npx @aicopycoders/exodus workflow checkpoint <runId> retry --wait     # redo the step, wait for its fresh output
npx @aicopycoders/exodus workflow checkpoint <runId> cancel --reason "wrong direction"   # stop the run here
```

- **`edit`** takes `--text`, `--file <path>`, or piped stdin. It does **not** resume the run — edit first, then `approve`.
- **`retry`** discards what the step produced and runs that one step again. The run parks right back at the *same* checkpoint with the fresh output — that re-park **is** the success. So `retry --wait` finishes as soon as the new output is ready, prints it, and hands you back the same four choices; it does **not** wait for the run to complete (it never would). Review the fresh output and `approve` when you're happy.
- **`cancel`** stops the run for good, recording your reason — the same audit trail the web uses.

#### When the step ran once per item (a Splitter fan-out)

If a Splitter (below) sits upstream, the flagged step ran **once per item**, and `show` groups its output under **`Item 1 of 7`**-style headings. The run still parks **once**, after every lane has finished — you review the whole batch in one sitting.

The numbering does **not** restart per item: rows are numbered straight through, so `edit 4` still means row 4 wherever it sits. What's new is that you can drop whole items:

```bash
npx @aicopycoders/exodus workflow checkpoint <runId>                        # grouped by item
npx @aicopycoders/exodus workflow checkpoint <runId> approve --reject 2 --wait      # keep all but item 2
npx @aicopycoders/exodus workflow checkpoint <runId> approve --reject 2,5 --wait    # drop items 2 and 5
```

- `--reject` takes the **item numbers you see** (1-based, comma-separated) — not row numbers, not the 0-based indexes in `--json`.
- **Rejecting is filtering, not failing.** The dropped items disappear from the batch and the run carries on with the survivors; nothing is marked failed and no warning is raised. Say it that way to the user: "kept 5 of 7."
- **Approve with no `--reject` keeps everything** — the ordinary approve, unchanged.
- **Rejecting every item is refused.** If nothing is worth keeping, `cancel` the run — that's the honest action, and the CLI relays the server's message telling you so.
- `edit <n>` works inside a fan exactly as it does anywhere else; edit the rows you want to fix, then approve (with or without `--reject`).

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
- **`fire`** starts a **real** background run on the workflow owner's keys. An event trigger's `fire` needs `--text` (the input the event would carry); a cron trigger's `fire` rejects `--text`. Its checkpoints park into the **inbox** like any other run.

**The ruled test flow:** author the workflow with the trigger **disabled** → `fire <n> --text "fake winner copy"` to dry-fire it and watch the run (checkpoints land in the inbox) → `enable <n>` once you're happy with what it produces.

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
npx @aicopycoders/exodus workflow schema                   # LIVE node kinds, ports, config rules, faces, wiring rules
npx @aicopycoders/exodus workflow schema --kind transform  # one node kind
npx @aicopycoders/exodus workflow schema --kind formatter  # the Formatter's two modes, bounds, and notes
npx @aicopycoders/exodus workflow schema --kind splitter   # the Splitter's three modes, the item cap, and the lane rules
npx @aicopycoders/exodus workflow schema --face splitter   # one transform face's ports + spec
```

Per bot you get its **input ports** (id, what it `accepts` — `text` / `primer` / `image`, whether it's required, and for primer ports which `primerKinds` gate it), its **params**, and its output type. `workflow schema` prints the **live** graph grammar from the backend you're deployed against — node kinds, port ids, config rules, transform faces, collector policy, wiring rules — so what you author matches what will validate. This is always current; pull it fresh rather than trusting memory.

**Faces now carry a `retired` flag.** `schema` (and `schema --face <face>`) reports it per face. Five faces are retired — `parser` (Parser/Extractor), `edit-shorten` (Shorten), the old `formatter` reshaper, and (newest) `splitter` (Splitter (Text)) and `decomposer`. **Retired means "no new ones," not "broken":** they still validate, still run, and every existing graph that names one keeps working unchanged, so never rewrite a member's graph to get rid of one. Just don't author a fresh one — use the `formatter` node kind instead of `parser`/`formatter`, and the `splitter` **node kind** instead of the `splitter`/`decomposer` faces (both below). The ad-hoc edit-pass buttons on finished run results, Shorten included, are a different surface and are unaffected.

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

`validate` is the front door; `import --dry-run` is the same check under a different door. It **needs network + login** — there is no offline validation, ever. It returns compiler-style issues, each naming the **node id**, the **port id** where relevant, and a concrete **remedy**. Codes include `dangling-edge`, `unknown-port`, `type-mismatch`, `missing-required-input`, `duplicate-input`, `cycle`, `unknown-kind`, `bad-config`, and the three Splitter lane rules `nested-split`, `lane-ineligible`, and `fan-overlap`. Fix, re-run `validate`, repeat until clean.

### Step 4 — Import (create or update)

```bash
npx @aicopycoders/exodus workflow import my.yaml                 # create a new workflow
npx @aicopycoders/exodus workflow import my.yaml --update wf_123 # update in place
```

Then **tell the user to review it on the canvas at `/workflows`** — the CLI writes the graph; the human eye confirms it reads right.

**The 409 rule.** `--update` sends the export's `updatedAt` as an optimistic-concurrency guard. If the workflow moved on the dashboard since your export, the import 409s. Re-export the current workflow, reapply your edits onto the fresh contract, and import again — never force past a 409, or you'll clobber their change.

### The `formatter` node — guarantee the shape of what comes out

Reach for a `formatter` node whenever the next step needs a **known shape**: a rendered layout, or named fields split onto their own wires. Two modes on one kind, chosen by `config.mode`. Its ports are **derived from its config** in both modes, so edit the config and the handles change — re-check your edges after any edit.

**`mode: template`** — deterministic, no model call. Write a layout with `{{variable}}` slots; **each distinct slot becomes a required `text` input port named for the variable**, and the single output port is `formatted`. Same inputs → identical output, every time. A slot that gets nothing renders empty and warns; it never fails the run.

```yaml
- id: assemble
  kind: formatter
  config:
    mode: template
    template: |
      HOOK: {{hook}}

      {{body}}

      CTA: {{cta}}
```

Ports: inputs `hook`, `body`, `cta` (all required, one wire each); output `formatted`.

**`mode: extract`** — the AI reads loose text, the node **validates the answer against your declaration**. Declare 1–12 fields; **each field key becomes its own output port**, and the one input port is `source` (required, accepts many wires — their texts are joined). A `list` field emits **one artifact per element** on its port, so downstream nodes get hooks one at a time, not one blob.

```yaml
# Winner ad text in → hooks, offer, and a mechanism line out, each on its own wire.
- id: mine-winner
  kind: formatter
  config:
    mode: extract
    temperature: 0.2      # 0..1, default 0.2
    maxRetries: 2         # 0..3, default 2 → up to 3 model attempts
    fields:
      - { key: hooks, label: Hooks, type: list, required: true }
      - { key: offer, label: Offer, type: text, required: true }
      - { key: mechanism, label: Mechanism, type: text, required: false }
```

Ports: input `source`; outputs `hooks`, `offer`, `mechanism`. Wire `sourceHandle: hooks` into a hook-consuming bot.

**The contract that makes it worth using: extract mode never emits a wrong shape.** If the reply isn't a JSON object with exactly the declared keys, correctly typed, and non-empty where you marked `required`, the node re-asks the model with the exact violations attached. `maxRetries` counts those re-asks *after* the first attempt (default `2` = up to 3 attempts). When the budget is spent the node **fails the run** with the last answer and its errors on the failure note — it never passes nonconforming output downstream. Tell the user that plainly when an extract node fails: the model couldn't produce the declared shape, so the node refused to guess.

**Field rules** (each row needs all three of `key`/`type`/`required`): `key` is letters, digits, spaces, underscores, hyphens, ≤40 chars, unique in the list; `type` is `text`, `number`, or `list`; `required` must be an explicit `true`/`false`. `label` is optional and defaults to the key.

### The `splitter` node — one thing in, N parallel lanes out

A **Splitter** turns one thing into many. Feed it a list (or text a model can cut into pieces) and it emits N **items** — and here is the part that matters: **every box after it runs once per item.** Five items means five copies of the same downstream chain running side by side, like five assembly lines. Each piece of work knows its own number, so the run view and the CLI can say "Item 3 of 7".

It has the same ports in every mode: one required input `source` (it accepts several wires), one output `items`. Three modes, picked by `config.mode`:

- **`structural`** — no model call. Whatever artifacts arrive on `source` **are** the items. This is the natural partner of a Formatter `list` field, which already emits one artifact per element. (A single artifact whose text is a JSON list of strings gets exploded too.)
- **`rule`** — no model call. Joins the incoming text and cuts it on a `delimiter`: `newline`, `blank-line`, `numbered` (1. 2. 3. list markers), or `custom` plus a `customPattern` (a **literal** separator, not a regular expression).
- **`semantic`** — the only mode that calls a model. Your `instruction` says what counts as one item ("separate this into ad concepts"); the reply must be a clean list, and a bad one is re-asked before the node gives up.

```yaml
- id: split-modules
  kind: splitter
  config:
    mode: semantic
    instruction: "Break this winning ad into its reusable modules — hook, mechanism, proof, offer, CTA. One module per item."
    maxItems: 25
```

**`maxItems` is a hard cap and it is required in every mode** (default 25, raise it to at most 100 deliberately — you cannot remove it). Going over the cap **fails the node loudly** with the real count ("Splitter produced 61 items; cap is 25"). It never quietly trims the list: silent data loss is worse than a visible failure. Producing **zero** items fails too, for the same reason.

**Reviewing a fan item by item.** If a step inside the fan has the "pause for approval" switch on, the run parks once, after all the lanes finish, and you approve or reject **each item**. Rejecting is filtering, not failing — see "When the step ran once per item" above.

**Three rules the validator enforces — all three scoped to a Splitter's OPEN fan** (the chain running once per item, which ends at the Collector that closes it):

- **No split inside an open fan** (`nested-split`) — a Splitter can't sit inside another Splitter's open fan. An artifact carries exactly one item number, so items-of-items has nowhere to live. The way through is **sequential**: close the first fan with a Collector, then split the combined result again. That is fully legal.
- **One open fan per node** (`fan-overlap`) — no node may sit inside two different Splitters' open fans at once. Their item numbering is unrelated, so the lanes can't merge mid-fan. Two fans that have **each closed through their own Collector** may merge downstream freely.
- **Lane eligibility** (`lane-ineligible`) — every node inside the open fan must be a `bot`, `formatter`, `transform`, or `output` node. Video nodes, Call nodes, and the video member-gate kinds are blocked, because running them once per item would corrupt state they keep per node. The `collector` kind is **exempt** (it ends the lane rather than running in it), and **after** a Collector any kind at all is allowed again — video, Call, all of it.

**One lane failing doesn't sink the batch.** If a lane exhausts its retries, that item drops out and the others carry on; the step ends `done` with a warning naming the casualties. Only *every* item failing fails the step. (A Collector downstream can be told to be stricter than that — see the next section.)

**The old cards are gone, the old graphs are fine.** The `splitter` (Splitter (Text)) and `decomposer` **transform faces** are retired — they put N snippets on one wire and ran downstream **once**, which is a different thing entirely. Existing workflows that use them keep running exactly as before, and there is no migration; just don't author new ones. The Winner Flywheel starter has been rebuilt on the Splitter node, so its Output step now files each module separately.

**Blocks Run** (`bad-config`, so `validate` catches it): no/unknown `mode`; template mode with an empty template, over 20000 characters, or more than 12 distinct slots; extract mode with fewer than 1 or more than 12 fields, a bad/duplicate key, a bad type, a non-boolean `required`, a `temperature` outside 0..1, or a `maxRetries` outside 0..3. A template slot with no wire into it is `missing-required-input` — same block, different code.

### The `collector` node — close the lanes

A **Collector** is the Splitter's other half. Where a Splitter opens N lanes, a Collector waits for all of them and folds them back into **one** result. That result carries no item number, which is the whole point: **after a Collector the run is ordinary again.** Anything may follow it, you may split again, and two fans that each closed through their own Collector may merge.

Its ports are fixed in every mode: one required input `items` (a whole fan lands on that single port), one output `combined`. Three modes, picked by `config.mode`:

- **`assemble`** — no model call. Stitches the surviving items into one block, in order, joined by `separator` (`newline`, `blank-line`, or `custom` plus a literal `customSeparator`; newline if you say nothing). An optional `itemTemplate` wraps each item, with the slots `{{item.value}}`, `{{item.index}}` (1-based), and `{{item.total}}`.
- **`list`** — no model call. Emits one artifact whose text is JSON: the items with their numbers, a count, and what dropped out. Use it when the next step wants structure, not prose. It is the only mode that puts the dropped detail *in* the artifact.
- **`synthesize`** — the only mode that calls a model. Your `instruction` says what the merge should produce; the model writes one new piece out of every item. The model itself is sealed (you get `temperature` and `maxRetries`, not a model pick).

```yaml
- id: fold-modules
  kind: collector
  config:
    mode: assemble
    separator: blank-line
    itemTemplate: |
      ### Module {{item.index}} of {{item.total}}
      {{item.value}}
    onBranchFailure: survivors
    minItems: 2
```

**The lane policies ride every mode.** `onBranchFailure: survivors` (the default) carries on with whatever made it through and warns you who didn't; `strict` stops the run right there if any lane broke. `minItems` (default 1, up to 100) is a floor that applies under **both** policies — fewer survivors than that and the node fails, so a fan where everything died can never quietly hand you an empty result. `ordering` is `index` (the Splitter's original order, the default) or `arrival` (whichever lane finished first).

**A rejection is never a failure.** An item the user rejected at a checkpoint was filtered on purpose, so it never trips `strict` — it only counts against `minItems` by not being there. The node's warning spells the difference out, and it's the sentence to quote back to a user asking why the run kept going: *"Collected 7 of 10 items — items 2 and 5 rejected at your checkpoint; item 8 failed."*

**Every wire into a Collector must come from inside ONE Splitter's open fan** (`collector-unpaired`, blocks Run) — the Splitter itself or a node running in its lanes. A Collector with nothing split upstream has no fan to close, and a Brief wired straight into one is merging unrelated branches, which is a Formatter's job in template mode, not a Collector's.

**The old card is gone, the old graphs are fine.** The `collector` **transform face** is retired — it compiled whatever text arrived on merged wires and ran once, which is a different job from closing a lane fan. Existing workflows using the face keep running unchanged and there is no migration; author the `collector` **node** instead. Note the vocabulary split while you're at it: the node reads `onBranchFailure`, and the legacy `onFailedInput` key is rejected on it outright.

**Blocks Run** (`bad-config`): no/unknown `mode`; assemble mode with an illegal `separator`, an empty or over-200-character `customSeparator` on `custom`, or an `itemTemplate` over 4000 characters; synthesize mode with an empty or over-2000-character `instruction`, a `temperature` outside 0..1, or a `maxRetries` outside 0..3; any mode with an illegal `onBranchFailure`/`ordering`, a `minItems` outside 1..100, or a stray `onFailedInput`.

### Authoring gotchas

A hand-picked list of the traps that bite first. `workflow schema` is authoritative on any conflict with what's written here:

- **Edge handles are port ids** — `sourceHandle`/`targetHandle` name a **port**, not a node id or a label. An edge only connects if the target port `accepts` the source port's type.
- **Required inputs hard-block** — a run refuses to start until every required input is supplied; there's no "run anyway".
- **Transform faces are sealed** — each face has fixed, per-face **output port ids** you must wire from by name; `workflow schema --face <face>` prints them, along with whether the face is `retired`.
- **Don't author a retired face** — `parser`, `edit-shorten`, the old `formatter` face, `splitter` / `decomposer`, and now `collector` are no longer offered; author a `formatter` node (parser/formatter), a `splitter` node (splitter/decomposer), or a `collector` node instead. Existing graphs that use them keep running, so leave those alone.
- **The fan rules are scoped to the OPEN fan** — inside a Splitter's open fan (the chain up to the Collector that closes it) you may not place another Splitter (`nested-split`), every node must be a `bot`, `formatter`, `transform`, or `output` (`lane-ineligible`), and no node may sit in two Splitters' open fans at once (`fan-overlap`). Close the fan with a Collector and all three restrictions lift: split again, run any kind, merge two collected fans.
- **A Collector must be paired** — every wire into a `collector` node has to come from inside one Splitter's open fan, or it's `collector-unpaired` and the run is blocked. To merge branches that were never split, use a Formatter in template mode.
- **A Formatter's handles come from its own config** — template slots name its inputs, field keys name its outputs. Change the config and old edges go `unknown-port`.
- **`session` outputs have nowhere to wire** — a session-typed output exists so you can re-open the chat from the run page; no node kind accepts a session wire.
- **Deposit shapes are strict** — a deposit's config must match the target bank's expected shape exactly, or import rejects it.
- **Empty defaults are deliberately invalid** — `rig`, `call`, `transform`, `bot`, and `formatter` nodes ship with empty config placeholders that fail validation on purpose; you MUST fill them, not leave them.
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

The inbox/checkpoint/session/bank verbs have v2 routes too, but the CLI is the maintained path — reach for HTTP only when you're already scripting, and prefer the CLI's `--json` output over hand-rolling routes. Both are Bearer-auth'd (`EXODUS_API_KEY`) like every v2 route.

## Failure handling

- **`describe` shows a ✗ prerequisite** — don't run yet. Fill the primer via `exodus-primer` / `exodus-foundation`, then re-check `describe`.
- **Run comes back `partial` or `failed`** — read `status --id <runId>` (drop `--json` for a readable view) to see which node failed and why **before re-running**. A partial still has usable outputs; harvest them first.
- **A verb refuses because the run isn't in that state** — the checkpoint/repair/answer verbs preflight the run and name its **actual** state (e.g. "parked for repair" when you tried a checkpoint verb). Read the state it reports and switch to the matching verb, or check `inbox` for what's actually pending.
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
