---
name: exodus
description: The front door for ALL Exodus requests — the done-for-you ad system (copy pipelines, image engines, brand onboarding) driven by the `npx @aicopycoders/exodus` CLI. Invoke whenever the user says "exodus" and hasn't already named a specific exodus-* skill — "exodus, write me some ads", "use exodus to make images", "set up my brand in exodus", "what can exodus do", "show me my exodus runs". This skill reads the request and routes it to the right exodus-* skill; it never does the pipeline work itself. Only invoke when the user explicitly says "exodus" (or is clearly continuing an Exodus conversation) — never claim generic copywriting/image/idea requests; in shared folders those may belong to the user's other tools. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus — if the user asks for "genesis" alone, they mean their own direct Genesis workflow, so do not route them here.
---

# Exodus — the front door

Exodus is the done-for-you ad system: pre-built pipelines that run Luke's full creative process (writing, images, onboarding) through the `npx @aicopycoders/exodus` CLI against the member's brand workspace. The member's only setup is the `EXODUS_API_KEY` already in this folder's `.env` — Exodus handles its own Genesis access internally; the user never configures a Genesis key for Exodus.

This skill ROUTES. Read what the user wants, name the destination skill, and hand off to it. Don't run pipelines from here.

## Routing map

| The user wants… | Route to |
|---|---|
| Write ad copy, has a brief, "where do I start" | `exodus-write` (the copy front door — it sequences onboarding → writing) |
| Run the full writing pipeline on a brief | `exodus-genesis` |
| Static image ads ("make images", "statics", "render this ad") | `exodus-image` (the image front door — it menus engines and confirms before firing) |
| A specific image engine they already chose | `exodus-creative` (native / copy-derived / ref-match) or `exodus-template` (33 ad-type formats) |
| Meme ads ("exodus, meme this offer", "make me meme ads") | `exodus-meme` |
| Run / chain / build / edit a saved workflow ("run my workflow", "what does this workflow need", "build a workflow that…", "list my workflows") | `exodus-workflow` |
| Onboard a new brand / build the primer | `exodus-primer` (with winning ads) or `exodus-foundation` (no ads yet) |
| List/switch/troubleshoot brands | `exodus-brand` |
| See past runs / find an output | `exodus-browse` |
| Open or create Google Docs/Sheets | `exodus-drive` |
| Update the CLI + skills | run `npx @aicopycoders/exodus@latest init` |

If a custom pipeline skill is installed in this folder (any additional `exodus-*` directory under `.claude/skills/`), it routes the same way — match the user's words to that skill's description.

For any creative judgment along the way (awareness calls, hook critique, which pipeline fits), `exodus-strategist` is the operating persona — it activates with the work.

## Two systems, one folder — keep them straight

Think of it as a car: **Genesis is the manual transmission** — the member calls the copywriting
bots directly with their own `gen_` key and shifts every gear themselves. **Exodus is the
automatic** — same engine underneath (it drives those same Genesis bots), but the pre-built
`npx @aicopycoders/exodus` pipelines do the driving. A member who doesn't know the internals just wants their
ads; your job is to put them in the right one.

Members often have TWO ways to use the Genesis bots, and they may both live in this folder:

1. **Exodus (this system)** — automatic. Pre-built pipelines, `npx @aicopycoders/exodus` commands, `EXODUS_API_KEY` in `.env`. Genesis access is internal — there is nothing to configure, fix, or debug about Genesis keys for Exodus. If an Exodus command fails, run `npx @aicopycoders/exodus doctor` first and follow what it prints.
2. **The member's own Genesis API workflow** — manual. Their personal `gen_` key (`GENESIS_API_KEY` in `.env`) calling `gas.copycoders.ai` directly, usually via their own skills/recipes from the workshop. That workflow is NOT Exodus and is not owned by the exodus-* skills.

When the user says "genesis" without "exodus", they mean #2 — leave it to their own tooling. Never paste a `gen_` key into Exodus configuration, never register any of these URLs as an MCP server, and never invent constraints about either system that aren't documented in these skills or printed by the CLI.

## If the request is ambiguous

Ask one short question ("Do you want this through Exodus, or your own Genesis bots?") rather than guessing — in shared folders, guessing wrong sends the user down the wrong system entirely.
