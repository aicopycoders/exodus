---
name: handoff
description: End a working session properly, and periodically read the sessions back. Fires on "handoff", "wrap up", "scrape this chat", "save this session", "add this to my workflow", "note your place and close", "what did we do today", or at the natural end of a session. It (1) scrapes the chat into a dated session file with verbatim asks, outputs and where they live, corrections, and the steering behind each ask; (2) proposes STANDARDS.md entries from what it saw the user say, edit, and pick, and waits for a yes; (3) writes a resume prompt so the next session starts warm; (4) updates the one-page distilled workflow. In review mode ("handoff review", "read my last ten sessions", "how do I actually work") it reads the session files and standards and writes an end-to-end read of the user's workflow with patterns, disagreements between their own versions, and suggestions. The session files are the most valuable asset in the folder: the before-and-after record of how the user thinks. Never edit one after it is written.
---

# Handoff

The chat is where feedback actually lives: what was said, what was edited, what was picked. Most of it evaporates when the window closes. This skill catches it, once, at the end.

Read `STANDARDS.md` first ("How I give feedback" decides how much this skill proposes). Sessions live in `workflow/` at the workspace root: `workflow/sessions/` for the dated session files, `workflow/workflow.md` for the one-page distilled workflow, `workflow/reviews/` for review reads. Create the folder on first use.

## Mode 1: session (default)

Start with one question and nothing else: "Pull this session into your workflow?" No means write nothing. Yes means all four steps, then a short reply.

### Step 1. Scrape the chat

Write `workflow/sessions/YYYY-MM-DD_<brand>-<topic>.md` (date is the session start). Split the chat into phases by intent (setup, research, planning, build, review, meta). Per phase:

1. **Ask (verbatim).** The user's exact words in a blockquote, typos included. Several quotes if the ask evolved. Never paraphrase here.
2. **What happened.** Two to four sentences.
3. **Outputs.** Paths, artifact links, Drive links, Exodus surfaces. Exact.
4. **Steering.** Why they asked it, what it reveals about how they work, the rule or preference it implies. One paragraph.
5. **Corrections.** Anything redirected, quoted verbatim, with the lesson.
6. **Tool feedback.** Gaps hit in Exodus or any tool.

At the end of the file: **Where everything lives** (a table), **Principles extracted** (numbered, from this session's quotes only), **What to make better next time** (concrete, from the corrections).

Rules: quotes exact; include the meta-asks (honesty checks, "can you see the context"); include reversals; note when another person or session edited files; never save secrets (write "keys pasted in chat" and nothing else); if context was summarised, say so and mark unquotable phases "reconstructed". Once written, the file is read-only to the system.

### Step 2. Propose standards

Read the session back for three kinds of signal and turn each into a proposed entry in the shape STANDARDS.md uses (one dated line, the quote underneath, the section):

- **Said.** Anything with always, never, from now on, I hate, I love, do it like this. Also any note given twice across this and earlier sessions (check the Log).
- **Edited.** Any place the user changed a draft: what was there, what they made it, the principle in one line. These are before-and-after pairs; record them as pairs.
- **Picked.** Any place the user chose from a set (three hooks out of twenty, one option of four): what they kept, what they rejected, the pattern in one line.

Present them as a numbered list, at most ten, strongest first. The user answers by number. Write only the approved ones, exactly as `remember-that` would (section, log line, bank promote for approved winning lines, offer for anything that touches a workflow or primer). If "How I give feedback" says no proposals, skip this step and say so.

### Step 3. Write the resume prompt

Append to the session file a section **Resume** with: what is done, what is missing, what is next (in that order, the way "note your place" works), the files to read first, and one paragraph the user can paste into a new session to start warm. Say the paragraph back in the reply so it is one copy away.

### Step 4. Update the distilled workflow

Open `workflow/workflow.md` (create it if it does not exist). Add or adjust only what this session changed. Keep it one page. Do not rewrite it.

### The reply

Short: the session file path, the two or three strongest steering signals in one line each, the proposals awaiting a yes (or that they were written), the resume paragraph, and any change to `workflow.md`. No essay.

## Mode 2: review

Fires on "handoff review", "read my sessions", "how do I actually work", or when the session count since the last review passes the number in "How I give feedback" (default ten). Reads every session file, `workflow.md`, and `STANDARDS.md`, and writes `workflow/reviews/YYYY-MM-DD_review.md`:

1. **The shape of it.** The user's workflow as a numbered sequence of stages, drawn from what they actually did across sessions, not what any skill says they should do.
2. **The rules underneath it.** What drives the work: the modes they switch between, what they read raw before trusting, how they brief (by example, by list), the taxonomy they use, what they check every time.
3. **Where their own versions disagree.** Places the sessions contradict each other or the standards, one line each, with the decision it implies.
4. **Where it stands.** What is done, unfinished, blocked, and what has moved on disk since the last scrape.
5. **Suggestions.** Three to five, each with the evidence rung it rests on (own sessions, standards, logic marked HYPOTHESIS). Things to make into rules, tools, or skills; things to retire; things the user keeps doing by hand that should be a bot (hand to `bot-builder`).
6. **Standards proposals** from the review, same numbered shape as Mode 1, waiting for a yes.

Then say the three biggest findings in the reply and stop. The user decides what to act on.

## Mode 3: resume

At the start of a session, check the newest file in `workflow/sessions/`. If it has a Resume section, offer it: "Last session ended at: <done / missing / next>. Continue from there?" Yes means read the files it names and pick up at "next". Do not re-derive what was already decided.

## Rules

- Session files are never edited after writing. A correction to a scrape is a new note in the next session.
- Quotes are the asset. Steering is your read of them, labelled as such.
- Plain language throughout. Collaborators will read these. No jargon that needs explaining. Do not call anyone a junior.
- Keep the where-it-lives table current; the scrape is mechanical when the index was kept during the session.
- Never propose the same standard twice. Check the Log.
- The user is the only source of rules. Proposals wait.

## Changelog

- 2026-09-14 · v1. Absorbs the earlier workflow-scrape skill; adds proposals from said, edited, picked; adds review and resume modes.
