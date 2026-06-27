---
name: exodus-drive
description: Read and write Google Drive / Docs / Sheets via the Exodus dashboard's existing OAuth, using `npx @aicopycoders/exodus drive` subcommands — open a Google Doc URL the user references, inspect a spreadsheet, search Drive for a file, or create new Drive artifacts outside the pipeline flow. For Exodus pipeline-run docs (genesis, creative, template), use `npx @aicopycoders/exodus read-doc <runId>` instead — the Drive MCP only sees tab 1 and will misreport multi-tab pipeline output as empty. Only invoke when the user has explicitly invoked Exodus: they said "exodus" in the request ("exodus, read the doc from that run", "exodus drive, find that file"), named this skill or /exodus-drive, ran an `npx @aicopycoders/exodus drive` command, or the `exodus` hub skill routed here. Never claim generic Drive/Docs/Sheets requests ("read this Google Doc", "pull the data from this sheet") — in shared folders those usually belong to the user's other tools (e.g. a Drive MCP); if the user did not say exodus, this skill is not for them.
---

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

# Drive — Google Drive, Docs, Sheets via the Dashboard's OAuth

## Strategic Context

There is no separate Google CLI to install, no keyring to configure, no `gws` env vars to export. The dashboard holds a single OAuth refresh token at Settings → Google Drive, auto-refreshes it, and `npx @aicopycoders/exodus drive` proxies through with the workspace API key the user already has. One connect, every command works.

If anything's wrong, run `npx @aicopycoders/exodus doctor` first — it probes the dashboard's Drive connection (label: "Google Drive (dashboard)") and tells the user exactly what to click.

## Pipeline Docs Get a Different Command

`npx @aicopycoders/exodus drive get-doc` reads tab 1 of a Doc. Pipeline runs (Genesis, and the creative-suite engines) write **multi-tab** Docs — one tab per variant, segment, or phase. Reading tab 1 of those gives you a fragment and looks like an empty/broken run.

For any pipeline run, use `read-doc` with the run ID:

```bash
npx @aicopycoders/exodus read-doc <runId>
```

It walks every tab and gives you the full output as markdown. This is the default for "read the doc from that run" — reach for `drive get-doc` only when the doc isn't a pipeline output.

## Pick the Subcommand from Intent

| User says... | Run |
|---|---|
| "Read this Google Doc URL: …" (not a pipeline) | `get-doc <docId>` |
| "Read the doc from yesterday's genesis run" | `read-doc <runId>` (NOT `drive`) |
| "Find that Drive file about cortisol" | `list-files --q "name contains 'cortisol'"` |
| "Pull the data from this sheet" | `get-sheet <sheetId> --range 'Sheet1!A1:Z100'` |
| "Write up these notes as a new Doc" | `create-doc` then `batch-update` |
| "Append this to the doc you just made" | `batch-update <docId>` with `insertText` |

Don't ask "which subcommand?" — pick from intent.

## Common Commands

### Get a Google Doc by ID

```bash
npx @aicopycoders/exodus drive get-doc DOC_ID
```

Extract `DOC_ID` from `docs.google.com/document/d/DOC_ID/edit`. Returns the Docs API `documents.get` shape; parse `.body.content` for text.

### Search Drive

```bash
npx @aicopycoders/exodus drive list-files --q "name contains 'genesis'" --page-size 10
```

Then pass the matching ID into `get-doc`.

### Read a Spreadsheet range

```bash
npx @aicopycoders/exodus drive get-sheet SPREADSHEET_ID --range "Sheet1!A1:Z100"
```

### Create a new Doc

```bash
npx @aicopycoders/exodus drive create-doc "Draft — [topic]" --folder FOLDER_ID
```

Returns `{id, name, webViewLink}` — share `webViewLink` back to the user.

### Append content to a Doc

```bash
npx @aicopycoders/exodus drive batch-update DOC_ID --requests '[{"insertText":{"location":{"index":1},"text":"Hello, world.\n"}}]'
```

Batch all `insertText` requests in a single call rather than one per paragraph.

## Workflow: "Read this Doc and help me revise it"

1. Extract the doc ID (or use `read-doc` if it's a pipeline run).
2. Fetch the contents.
3. Quote back the relevant section so the user knows you're looking at the right thing.
4. Offer revisions inline in chat — don't mutate the Doc unless they explicitly say "update the doc".

## Anticipate the Next Move

- After `get-doc` / `read-doc` — "Want me to walk through the hooks one by one?" / "Should I draft revisions inline, or push edits straight back to the doc?"
- After `create-doc` — "Want me to share this with [team email]?" / "Ready to drop the draft content in?"
- After `list-files` finds the wrong thing — "Nothing for that exact name. Want me to broaden the query, or check by date instead?"

## Errors & Recovery

`npx @aicopycoders/exodus drive` exit codes:

- **Exit 2 / `drive_not_connected`** — user hasn't connected Drive on the dashboard. Tell them to visit Settings → Google Drive → Connect, then retry.
- **Exit 1 / `insufficient_scope`** — they connected before a needed scope was added. Reconnect at Settings → Google Drive.
- **Exit 1 / `token_refresh_failed`** — refresh token was revoked. Reconnect.
- **Permission denied on a specific file** — Google account doesn't have access. Ask them to share the file with the email shown at Settings → Google Drive.

When in doubt, `npx @aicopycoders/exodus doctor` surfaces the same problems with concrete remediations.

## Not the Right Skill For

- Reading pipeline-run output — use `npx @aicopycoders/exodus read-doc <runId>`.
- Running pipelines — Genesis and the creative-suite engines write their own Drive/dashboard output and return the URL.
