---
name: bot-builder
description: Build a custom bot (a prompt that does one job well) the way Luke and Mario build the Genesis bots, and put it where it runs: an Exodus workflow Prompt node (variables, model, temperature, loops), a Genesis bot via the bot-builder-bot, or a Claude Code skill. Use it whenever someone says "build me a bot", "I want a bot that…", "turn this into a prompt", "make a node for the workflow", "clone my voice", "the bot keeps doing X, fix the prompt", "write the system prompt", or whenever, mid-task, a repeated step would be better as its own bot (then say: we'll just build that for you). The method is SEAK: Structure, Examples, Ask AI, Knowledge. The two things that matter most are domain knowledge and seven to ten high-quality, diverse examples, and this workspace already knows where the examples live (the ad bank, the swipe files, the winners, the reviews). Also covers the advanced stack (mandate, elite intelligence unit, operational protocol, quality-control checklist, creative-freedom filter, automatic failure triggers, anti-AI module) and the iterate loop (test, note everything you hate, ask AI to fix it, preserve don't compress).
---

# Bot builder

A bot is a prompt with a structure, examples, and knowledge that does one job. Luke's crash course, in full: pick the right structure, find seven to ten high-quality examples, put in the domain knowledge and modules, test it, note everything you hate, tell AI to fix it, repeat until done. Everything else in this skill is detail on those five moves.

Two rules before anything:

- **Domain knowledge plus examples is the alchemy.** A rigorous concept with ten clear examples lets a model do the job better than most humans. Take either away and the bot gets worse. If you can only have one, examples win.
- **One task per bot.** Ideate, generate, and edit are different modes. Mixing them in one call makes every output muddier. A story-idea bot feeding a writing bot beats one bot that does both.

Think mode for scoping (what is it, who uses it, what comes out). Build mode for writing the prompt and running the test loop. Read `thinking-vs-build` if installed.

## Step 0. Say what it is

Before writing a line, answer these in a few lines and say them back:

- **Who uses it and in what mindset?** A coach sitting down to write an email. A strategist who just ripped twenty ads. A node in a workflow that nobody talks to. This decides the whole operational protocol.
- **Inputs.** What they will actually have in hand: a buyer profile, a sales page URL, a dump of transcripts, a voice note. Give them two or three ways in; forcing one path is annoying.
- **Output.** The exact shape. A menu of twenty ideas. A rewritten email. A table with fixed columns. A one-breath mechanism.
- **Type.** Two dials, four types. Generative (a little in, a lot out) or analytical (a lot in, a little out). Interactive (back and forth, a process) or node (one in, one out, no conversation). A writing bot is generative and mostly node. A copy chief is analytical and interactive. An extract bot is analytical and node. Two modifiers: how polished (internal, or emoji-and-hierarchy pretty for perceived value) and how autonomous.
- **Where it runs.** An Exodus workflow Prompt node, a Genesis bot, or a Claude Code skill. See "Where it lives" below. The structure is the same everywhere.

Do not get stuck on the type. It is a tool to pick the structure, not a gate. If in doubt, build the node version first; it is the easiest and it slots into workflows.

## Step 1. Structure (the S)

The building blocks, in the order that works for most bots:

| Block | What it is |
|---|---|
| Identity | The role, or better, the task and the team (see elite intelligence unit) |
| Purpose | The outcome, stated as the one thing success is measured on |
| Process | The steps, only for interactive bots; each step is its own subroutine with its own purpose, knowledge, and examples |
| Domain knowledge | The concepts the job runs on (copy blocks, ODF, the mechanism rules, a theory of humour) |
| Examples | Seven to ten, diverse, best first |
| Modules | Plug-in blocks reused across bots: copy chief, copy blocks, rhetorical frames, anti-AI |
| Formatting | The exact output shape |
| Guidelines | Do's and don'ts, then a recap of the mandates |

Order changes by type. **Voice and writing bots put examples before knowledge** (a voice is thousands of dimensions; examples carry them, descriptions do not). **Asset and analysis bots put knowledge before examples** (the concept is the job; examples show its shape). **Process bots put the process early** so the bot knows the flow, then each step carries its own purpose, knowledge, and examples.

Full block templates, by type, with the advanced additions: `references/prompt-blocks.md`.

## Step 2. Examples (the E)

The most important input. Rules:

- **Seven to ten.** More rarely helps. Fewer than five overfits.
- **Diverse.** Short and long, with and without a call to action, selling and value, emotional and neutral. Diversity is what stops every output sounding like example one.
- **Best first.** Earlier examples carry more weight. The first example is the one the bot will sound most like.
- **Explain why.** An example plus one line on what makes it good beats the example alone. The bot learns the boundary, not just the shape.
- **Micro-examples too.** For structured outputs, show one example per component (a hook type with its example, a reframe with its example), not only whole pieces.
- **Show what to do, not what not to do.** Negative examples teach the negative.
- **Drip a little of what you want more of.** If the outputs are not hitting hard enough, add one example from a writer whose edge you want. A dash of it changes the alchemy.

Where the examples come from, in this workspace:

- Own winning ads, transcripts and copy, in the ad bank and the tested-ads master file. Highest quality.
- Competitor long-running ads from the swipe files (the rip). Proven in the wild.
- Reviews and comments with counts, from the research folders, for anything that needs the market's own words.
- The Scout library in Exodus for organic hooks.
- Genesis bank keys (hooks, headlines, body by awareness, modules) when the bot runs as a workflow node.

When no examples exist, **bootstrap them**. Start with one to three seed examples, even if you have to write them by hand. Build the v0 bot with the structure and the seeds. Generate one output. Edit it until it is as good as you can make it (or bring it to a feedback call). Put it back in as example four. Generate again. After five or six rounds the bot writes examples you no longer need to edit. Mario built almost every Genesis bot this way. A universal writing bot with a large example bank can also write your first seeds in any style ("write in this style, do not copy the content or structure, just the voice"), then you edit them. If a swipe feels too close to steal, have the model rewrite it into a different niche with the same idea, and use that.

## Step 3. Ask AI (the A)

You are not asking enough. Ask at every step: what bot am I even building, how should I structure it, what is missing, where should this new block go, why does it keep ignoring rule four. Habits that make the answers better:

- Ask for its honest read, not confirmation: "you can say yes, no, or no opinion; tell me why."
- Ask for reasoning; it thinks harder when it has to explain.
- Refresh the chat between tasks; one chance to get it right beats a long muddied thread.
- Separate ideate, generate, edit into different calls.
- Use `###` as section separators; it reads them cleanly.
- "Do not be afraid to use tokens; go as long as you can." Models conserve by default.
- When optimising a prompt: **preserve, do not compress.** "Keep everything I wrote, only add what is missing, change words only where you say so explicitly." Left alone, the model simplifies and makes the prompt generic.
- Feed the model the prompt plus two or three bad outputs and say: fix the prompt so it never does this again. Then ask it exactly where to paste the fix.

## Step 4. Knowledge (the K)

Domain knowledge is where the moat is. Three sources: theories that already exist, your own ideas, or examples you make the model find the pattern in. When the concept does not exist yet, build it with **expand, contract, refine**:

1. **Expand.** "Give me every theory of X ever made." Then "more, you are missing some." Then "a detailed paragraph with examples for each." Push until it covers everything.
2. **Contract.** Order it into one clear, unified system with a conceptual hierarchy (the model is bad at hierarchy on its own; it mixes levels). Ask the model to "organise all of these into a rigorous hierarchy: principles, then mechanisms, then moves, then examples, no level mixing."
3. **Refine.** Read it. Argue with it. Cut. "Add anything we are missing." Expand again. Repeat until it is yours.

For voice bots the knowledge is small: a paragraph on how they speak (language, tone, relationship to audience, personality) and a paragraph on what they say (point of view, philosophy). Twenty to thirty percent of the way is enough; the examples carry the rest.

## Step 5. The advanced stack (when v1 is not good enough)

Most of this was added by trial and error when a bot would not behave. Add pieces as the bot earns them; do not start here.

- **Mandate at the top.** The one metric success is measured on, before identity. "Your success is measured solely by X. Err on the side of Y." It sets the lens for everything below.
- **Elite intelligence unit** instead of one role. Name the task, then five to seven specialists whose skill sets serve it, each with credentials, purpose, and contribution. Include non-obvious ones (a method actor to embody the prospect, a courtroom psychologist for proof, a Disney experience designer for the user's journey). Give a rule for when they disagree.
- **Operational protocol.** The exact steps the user sees: how to give inputs (two or three doors), what the bot does with them, what it asks before writing. Complex behind the scenes, simple in front. Menus as numbers for one list and letters for the next so it never confuses them.
- **Decision rules, conditional.** Awareness level, traffic temperature, towards versus away motivation. "If solution-aware and towards, open with the differentiation; if problem-aware and away, open with pain amplification."
- **Framework with explanation.** Whatever system the copy runs on (copy blocks, AIP, your own), explained with why each part matters, not just listed.
- **Quality-control checklist.** A mandatory pre-delivery check per section, run before anything is shown. It makes the bot justify its choices; it does not stop every hallucination, but it catches most.
- **Proof confirmation step.** Before writing, the bot lists the proof elements it will use and asks the user to strike any it cannot verify. Cheapest hallucination fix there is.
- **Creative-freedom filter.** Permission to invent new hook types, structures, sequences, as long as the core principles hold. Without it the bot is a keyboard monkey; with it, consistency drops a little and the ceiling rises a lot.
- **Automatic failure triggers.** "If the hook and the insight do not align, the script is a failure regardless of quality." Repeat the ones that matter at the start, in the middle, and at the end; the end recap uses recency.
- **Anti-AI module.** The gnome list for this market plus the generic ones (triplets, "it's not X, it's Y", "here's the kicker", brutal truth, 2:47 AM, colons in headlines, inconsistent breaks). Kill gnomes in four places: the examples first, the module, the input method (voice notes keep the human in), then manual editing.
- **Copy chief module** at the end of writing bots: a menu of dimensions the user can turn (more insight, stronger hook, shorter, more natural, more feminine, less salesy) so chiefing becomes "more like this, less like that."
- **Prompt protection and a demo mode** when the bot faces other people.
- **Tone with the model.** Be strict where it matters ("automatic failure", "you must"), and give it a reason. Redundancy is fine; the extra tokens are cheaper than a bad output.

Mario's fully worked talking-head bot is a caricature on purpose: fifteen thousand words, too many specialists, every block present. Build the simple one first, then weed. The real expertise is curation: fewer specialists, better examples, tighter frameworks.

## Step 6. Test and iterate

1. Run it on a real input. Read the output cold.
2. Write down everything you hate, in plain words. "It says 'here's the kicker'. It gave ten options when I wanted one. It invented a study."
3. Give the model the prompt, the outputs, and the list. "Fix the prompt so this never happens. Preserve everything else. Tell me where you put each fix."
4. Paste the fixes where it said. Run again.
5. Stop when it saves you time and you would ship the output with light edits. The first bot takes five to ten hours. The tenth takes an afternoon, because you steal blocks from the previous nine.

If the bot is meant to learn your taste over time, keep the before-and-after pairs from every edit; that is the instinct-transfer material.

## Where it lives

Same prompt, three homes. Pick by who runs it.

**Exodus workflow: the Prompt node.** Author it when the bot is a step in a saved automation. The prompt is the node: what you write is sent as one call on the workspace's own LLM key, no Genesis slug needed. Every distinct `{{variable}}` in the body becomes a required input port (up to 12), fed by a text wire or a Primer node. Config: `model` (Claude ids work on any key; slashed ids need OpenRouter), `temperature` 0 to 1 (honoured here, ignored on Genesis-routed bots), `loops` 1 to 5 (self-critique-and-rewrite passes; only the final flows downstream) with `loopInstructions` per extra pass, `bankKeys` to ride the brand's hooks, headlines, body, or modules banks along as reference, `sessionMode` to keep a chat handle. Fan it out with a Splitter (one lane per item), close with a Collector, gate with a Checkpoint. Contract, YAML, and gotchas in `references/exodus-prompt-node.md`. Validate before import; the schema is live, pull it fresh.

**Genesis bot via bot-builder-bot.** When the bot should be a reusable Genesis bot or you want a first draft of the whole prompt from a concept. The `bot-builder-bot` (slug in the live catalog) takes a concept and returns a complete prompt in the eight-block shape (identity, purpose, process, domain knowledge, examples placeholder, formatting, guidelines) plus implementation notes: type, temperature, model, testing priorities. It leaves the examples slot for you, correctly, and tells you what to put there. Prompt template that produced a clean node-safe draft in one shot: `references/prompt-blocks.md`, last section. Call it through the `genesis-bots` helper. Then run Step 6 on the draft; it is a v0.1, not a release.

**Claude Code skill.** When the bot is a method you want fired by phrases in this folder, or handed to a collaborator as a zip. Same blocks, written as a SKILL.md with a pushy description. The skills in this folder are the examples.

**The rule for offering it.** Any time a step in a session repeats (a third rip, a second grid, the same extraction on every swipe), say: this should be a bot, we will build it for you. Then run Step 0 in three lines and build the node version.

## Worked example (fictional brand, real run)

Concept: a "segments seen" node for the fictional Evenkeel account. Analytical, node. Input: a dump of competitor transcripts. Output: every segment the ads call out, as Outcome × Demographic × Facet, with the exact quote, the ad id, and a note on whether it is a segment, a copy line, or a hypothesis. Runs silently inside a workflow.

Step 0 took four lines. Step 1: the bot-builder-bot returned identity (competitive intelligence analyst), purpose (silent, one in one out), a six-step process (inventory, extract signals in four categories, apply the grammar, copy-line test, mark hypotheses, compile), domain knowledge (the four facet families with examples, the validity rules, confidence tiers), an examples placeholder with instructions to include one copy-line case and one hypothesis case, a fixed output block per segment, and guidelines (quote exactly or not at all, silence is default, one signal one segment, volume does not equal validity, no editorial opinion, workflow-safe). Implementation notes: analytical one-shot, temperature 0.5, a high-reasoning model, four testing priorities. Step 2: three hand-marked transcripts go in the examples slot, best first. Step 6: test on five ads for quote fidelity, two ads with identical phrases for the copy-line trigger, one transcript-heavy ad for over-extraction, fifty ads for scale. Home: a Prompt node with `{{transcripts}}` as the one slot, temperature 0.3, loops 2 with the second pass told "check every quote against the source and drop any that are not verbatim", output wired to the segments-seen file.

## What this skill is not

It does not decide what the copy should say (copy-instincts), who it is for (odf), or why the product works (mechanism). It packages a job into a prompt that runs without you, and puts it where it runs.

## Standards

Before producing anything, read `STANDARDS.md` at the workspace root (and the section for this output type). Grade the draft against it before showing it; rewrite failures first. When the user reacts with a judgment, a banking phrase, or the same note twice, hand the reaction to `remember-that`. At the end of the session, `handoff` scrapes the chat and proposes entries.
