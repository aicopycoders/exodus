# @aicopycoders/exodus

The Exodus CLI + Claude Code skills for the Copycoders ad pipeline. It drives the
Genesis creative bots, workflows, banks, and image/meme pipelines against your
brand — from your terminal and from Claude Code.

You don't install it globally. Run it with `npx` from your workspace folder.

## Quickstart

```bash
# 1. Scaffold (or refresh) the workspace in the current folder
npx -y @aicopycoders/exodus@beta init
```

`init` creates the workspace (the `.claude/` skills, docs, and your brand
subfolder) and prints the next steps. The `@beta` tag is the dev/preview channel;
drop it (`@aicopycoders/exodus`) for the stable release channel.

### Connect your account

1. Open the Exodus dashboard → **Settings → Claude Code**.
2. Copy the `.env` snippet it shows you (your `EXODUS_API_KEY` + dashboard URL)
   and paste it into a `.env` file in your workspace folder.
3. Pull your provider keys down so the local tools have them:

   ```bash
   npx -y @aicopycoders/exodus@beta keys pull
   ```

   This writes your dashboard provider + image keys into `.env` (it only upserts
   those keys and preserves the rest of the file). Values are never printed.

### Check everything is wired up

```bash
npx -y @aicopycoders/exodus@beta doctor
```

`doctor` diagnoses local and dashboard-side issues in one shot — keys, workspace
health, CLI currency — and tells you exactly what to fix.

## Where to go next

- `npx -y @aicopycoders/exodus@beta --help` — the full command surface.
- `npx -y @aicopycoders/exodus@beta workflow --help` — run, build, and automate
  saved multi-node workflows; resolve gate/repair parks from the inbox; read
  banks and promote winners.

Inside Claude Code, just say **"exodus"** plus what you want
("exodus, write me some ads") and the skills route the rest.
