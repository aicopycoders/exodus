# Pipelines Cheat Sheet

In Claude Code you don't click buttons. You say **"exodus"** plus what you want — "exodus, write me some ads" — and the `exodus` hub skill routes you to the right pipeline. You can also invoke a specific skill directly with a slash command: `/exodus-write`, `/exodus-image`, etc.

> This doc is the CLI/skill invocation reference for the active brand workspace. For the dashboard's clickable pipeline list, see the dashboard's Creative Suite.

## All skills at a glance

| Skill | What it does |
|-------|--------------|
| exodus-write | The front door — routes brand → foundation → brief → Genesis → Doc. Start here. |
| exodus-genesis | Brief → Ad Copy (two voices; 1 pass = 2 variants, scalable via --passes) |
| exodus-image | The front door for static images — routes to exodus-creative or exodus-template. Start here for "make me images / statics". |
| exodus-creative | Creative-Suite Engines (native / copy-derived / ref-match) — when you've already picked an engine |
| exodus-template | Ad-Type Format Variations across 50 structured formats |
| exodus-meme | Meme Ad Generator — recommend formats, one batched server-side run |
| exodus-browse | View History and Surface the Right Run |
| exodus-drive | Google Drive, Docs, Sheets via the Dashboard's OAuth |

---

## exodus-write (start here)

**What it does:** The guided front door for copywriting. You don't need to know which command to run — say "exodus" plus what you want and the exodus-write flow figures out where you are, helps shape the brief, sets up your foundation if needed, runs Genesis, and hands back the Google Doc.

```operator-guide
No command — say "exodus" plus what you want (or /exodus-write). It sequences
the existing commands (foundation, genesis, browse, read-doc) for you.

Say things like:
  "exodus, I want to write some ads: <your idea>"
  "exodus, turn this winning ad into copy: <paste>"
  "exodus, set up a new brand and write my first ad"
  "exodus, make a variant of that last run"

Routing:
  new brand / no foundation → onboarding (foundation, optional primer prompt)
  brief or idea in hand      → straight to the Genesis writing pass
  rerun / tweak              → browse past runs + the editing menu
Works without a primer (defaults); sharper once your foundation has winning examples.
```

---

## exodus-genesis

**What it does:** Take a brief through Luke's full Genesis writing process — two voices (Mario × Brand + Infeed × Brand). Default is 1 pass per bot = 2 variants; add `--passes` to widen coverage (pass 2 brings in the Top-Ads-biased primer). Also accepts per-run seeds extracted from a source ad.

```operator-guide
Inputs:
  --brief <file|"text"> (required) — path to a text file OR an inline brief string
Optional:
  --seeds <file|"text"> — per-run creative seeds (file: one per line or JSON array; inline: one string)
  --awareness — unaware | problem-aware (default) | solution-aware | product-aware
  --passes <n> — writing passes per bot (1–5, default 1). 1 pass = 2 variants
                 (1 Mario×Brand + 1 Infeed×Brand); pass 2 adds the Top-Ads-biased primer
  --variants <n> — advanced: raw total count (1–10) that overrides --passes
  --ad-account <id> — Meta ad account for the top-ads-biased track (defaults to first active account)
  --no-wait — return immediately with the run ID
Returns: Google Doc URL printed to stdout when the run completes
Examples:
  exodus genesis run --brief brief.txt --seeds seeds.txt
  exodus genesis run --brief "Grounding sheets help joint pain" --awareness problem-aware --passes 2
```

---

## exodus-image (start here for statics)

**What it does:** The front door for static image ads. Just say "exodus" plus what
you want — "exodus, make me some statics from this ad", "exodus, render AD-001" —
and Claude reads the request and runs the right engine: **exodus-creative**
(renders straight from copy, or matches a reference image) or **exodus-template**
(one piece of copy spread across 50 ad-type formats). You don't pick the engine;
the request decides it. Use the engines below directly only when you already know
exactly which one you want.

**Say something like:** "exodus, make me some image ads from this copy" · "exodus,
render this ad as statics" · "exodus, spread AD-001 across ad formats" · "exodus,
make ads that look like this library image".

---

## exodus-creative

**What it does:** Generate static creative images through the creative-suite engines — native (render image ads straight from ad copy), copy-derived (renders derived from copy variations), and ref-match (match the look of one or more reference images you've uploaded to the library).

```operator-guide
Subcommands:
  exodus creative native --ad "<text>" [options]         Render image ads from ad copy
  exodus creative copy-derived --ad "<text>" [options]   Renders derived from copy variations
  exodus creative ref-match --refs <id,id,...> [options] Match the look of reference image(s)
  exodus creative status --id <runId>                    Poll a run

Shared options (kickoffs):
  --variations N        Renders to generate (default: engine-specific)
  --aspect 1:1|4:5|9:16   Image aspect ratio (default: 1:1)
  --name "<label>"      Custom run name (otherwise auto-generated)
  --ad-group <id>       Attach to an existing ad-group

ref-match additional options:
  --refs <id,id,...>    REQUIRED. Comma-separated creativeSuiteImages ids
                        (the images must already be in the dashboard library)
  --subject "<text>"    Optional subject hint
  --objects <id,id,...> Optional object-overlay image ids

Returns: runId + dashboard URL (/creative-suite/runs/<runId>).
Status: `exodus creative status --id <runId>` → engine, status, completed/total, isTerminal.
Auth: Bearer (kickoff via Convex HTTP; status via dashboard route).
```

---

## exodus-template

**What it does:** Turn finished ad copy into many static ad images spread across structured ad-type formats (testimonial, hero, UGC, logo, infographic, and 45 more). Runs Fernando's 5-stage Template pipeline — give it one brief or a numbered list of ads and it generates format variations, then renders them.

```operator-guide
Subcommands:
  exodus template run --input "<text>" [options]   Kick off a run
  exodus template resume --id <runId>              Finalize an orphaned run (#56)
  exodus template ad-types                          Print all 50 AD_TYPES
  exodus template reptile-triggers                  Print the 13 reptile triggers

run options:
  --input "<text>"      REQUIRED. One brief, or a numbered list of finished ads
                        ("1. <ad copy> 2. <ad copy> ..."). Min 3 chars.
  --mode auto|manual|hybrid   Generation mode (default: auto)
  --render-mode images|prompts   prompts = skip render, return LLM prompts only (default: images)
  --aspect 1:1|9:16     Image aspect ratio (default: 1:1)
  --model gpt-image-2|nano-banana-pro   Kie.ai model (default: gpt-image-2)
  --realism off|realistic   Realism enforcement (default: off)
  --quantities "slug:N,slug:N"   manual-mode per-type counts (e.g. "testimonial:3,hero:2")
  --pairings '<JSON>'   hybrid-mode host/modifier pairs: '[{"host":"testimonial","modifier":"hero"}]'
  --requested-count N   auto-mode total render target (optional)

Returns:
  runId + dashboard URL. POST-only — there is NO CLI status endpoint yet.
  Live progress renders in the dashboard at /creative-suite/template/sessions/<runId>.
```

---

## exodus-meme

**What it does:** Generate meme-style ad creative for the active brand — recommends meme formats for a brief, then renders the whole batch server-side in one run (AI image memes via Kie.ai, classic Imgflip-template memes on the member's Imgflip login).

```operator-guide
Subcommands:
  exodus meme recommend --brief "<text>" [--avatar "<text>"]
  exodus meme run --brief "<text>" --formats '<json>' [--avatar "<text>"] [--name "<label>"]
  exodus meme regenerate --brief "<text>" --layer 1|2|3 <format fields> [--hint "<text>"] [--id <runId>]

Typical flow:
  1. recommend  → { recommendations: [...] } — 15 picks (5 per layer) with
                  name, layer, reasoning, ad_angle. Layer 1 = classic Imgflip
                  templates; layers 2/3 = AI-image formats.
  2. run        → pass the picked recommendation objects straight into
                  --formats (JSON array, 1–50). One enqueue; the batch renders
                  server-side via Trigger.dev — closing the session won't kill it.
  3. poll       → exodus status --id <runId> --type creative
                  (terminal: complete | partial-error | error)
  4. regenerate → re-render a single miss (layer 1: --template-id
                  --template-name --boxes; layer 2/3: --format [--hint]).

Keys (strict BYOK, preflighted server-side): classic memes need the member's
Imgflip login; AI memes need their Kie.ai key; captions always need an LLM key.
Returns: runId + dashboard URL /creative-suite/runs/<runId> (results land in the library).
```

---

## exodus-browse

**What it does:** View past pipeline runs and pull outputs from previous sessions.

```operator-guide
Inputs:
  none required — defaults to recent runs across all pipelines
Flags:
  --limit (default: 20) — max runs to list
  --agent — filter by agent: genesis | creative | template | meme
Returns: terminal table of recent runs with timestamps, agents, statuses, and Doc URLs
```

---

## exodus-drive

**What it does:** Read and write Google Drive / Docs / Sheets via the dashboard's existing OAuth, using `npx @aicopycoders/exodus drive` subcommands.

```operator-guide
Subcommands (use the one that matches intent):
  get-doc <docId>             Read a Google Doc by ID
  get-sheet <sheetId>         Read a spreadsheet range
  list-files                  Search/list Drive files
  create-doc <title>          Create a new Google Doc
  batch-update <docId>        Apply Docs API requests (insertText, etc.)
For pipeline-run docs, use:
  npx @aicopycoders/exodus read-doc <runId> — walks every tab, renders to markdown
Returns: structured JSON forwarded from Google's APIs (or markdown for read-doc)
```
