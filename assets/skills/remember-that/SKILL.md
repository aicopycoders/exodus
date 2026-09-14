---
name: remember-that
description: Bank a reaction so it never has to be given again. Fires the moment the user says "remember that", "lock that in", "bank that", "add that to my rules", "always do X", "never do Y", "from now on", "make sure this never happens again", or gives the same note a second time. Also fires when they react to a draft with a clear judgment ("perfect, keep that", "that joke was too much", "not like that, like this"). It quotes the reaction verbatim, decides the rung (note, rule, tool, skill), writes it to STANDARDS.md in the right section, pushes winning lines to the matching Exodus bank, offers rather than pushes anything that would change a workflow or primer, and says in one line where it went. This is the Standards Ladder's "correct once, remember forever" move, packaged.
---

# Remember that

A reaction that is not banked evaporates by the next session. This skill makes the bank happen in ten seconds, without the user opening a file.

Read `STANDARDS.md` first, especially "How I give feedback". It governs this skill.

## When it fires

- A banking phrase: remember that, lock that in, bank that, add to my rules, always, never, from now on.
- A tool phrase: make sure this never happens again, this can never slip through, set up a check.
- A repeat: the same note given twice in this or a previous session (the Log section shows previous ones).
- A judgment on a draft, when "How I give feedback" allows proposals: perfect keep that, too much, not like that.

If it is a judgment rather than a phrase, propose the entry and wait for a yes. Never write a rule the user has not approved.

## What it does, in order

1. **Quote it exactly.** The raw words, typos included. The quote is the evidence; the rule is the interpretation.
2. **Name the rung.**
   - Note: said once, unclear if it generalises. Log it, do not write a rule yet. Say "logged; say it again and it becomes a rule."
   - Rule: said with "always / never / from now on", or said twice. Write the one-line rule.
   - Tool: "make sure this never happens again", or a rule that has been broken twice since it was banked. Say it should be a tool, describe the check in one line, build it under `standards/tools/` if the user says go (a script, a lint, a checklist the skill must run). Log it under Tools.
   - Skill: a whole job that keeps repeating. Hand to `bot-builder`.
3. **Pick the section.** Hooks, Copy, Statics, Workflows, Skills, Gnomes, Tools. A phrase the bots over-use goes to Gnomes. A change to how a skill behaves goes to Skills. Never edit the skill file itself: `exodus update` rewrites every skill folder, so the edit would be lost. The skills read their Skills rules from `STANDARDS.md`.
4. **Write the entry.** One line, dated, then the quote underneath:
   ```
   - 2026-09-14 · Open on a declarative line, never a question.
     > "Stop opening my emails with a question. It reads soft."
   ```
   Add the same line to Log with the rung and the destination.
5. **Push what belongs on the server.**
   - A winning line the user approved (a hook, a headline, a body) → `npx @aicopycoders/exodus bank promote <key> "<text>"` with `--awareness <pair>` for body banks. Automatic when "How I give feedback" says so. Keys: `hooks`, `headlines`, `body:unawareProblemAware`, `body:solutionProductAware`, `body:mostAware`, `modules`.
   - A style rule that should change how a pipeline writes → offer, do not push: "This would go into the brand voice (`exodus foundation set brandVoice`) or the Guidelines note on the bot nodes in your workflow (`customInstructions`; a Prompt node has no such note, its text is `promptText`). Want it there?" Only on a yes: export, edit, validate, import.
6. **Say where it went, in one line.** "Banked as a rule under Copy, and promoted to the hooks bank." Then continue the work; do not stop the session.

## Rules for the skill itself

- The user is the only source of rules. Proposals wait. Nothing the AI wrote goes in as if the user said it.
- One entry per reaction. Do not merge, generalise, or rewrite old entries. If a new one contradicts an old one, add the new one and mark the old one superseded with the date.
- Hand-edited files are read-only. If the reaction is about a file the user touched, write the rule, do not edit the file.
- When a section passes a page, move it to `standards/<section>.md`, leave a one-line pointer in STANDARDS.md, and say so.
- When a rule has been broken twice since it was banked, say so and offer the tool rung. A recurring failure is not a reason to nag harder.
- Reading rules back: "show me my rules for hooks" prints that section verbatim.

## What this skill is not

It does not review a whole session for things worth banking; that is `handoff`. It does not build bots; that is `bot-builder`. It catches one reaction and puts it where the system will always see it.

## Changelog

- 2026-09-14 · v1.
