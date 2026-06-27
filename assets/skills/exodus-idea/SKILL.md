---
name: exodus-idea
description: Capture, curate, and write from the Exodus Idea Bank — the brand's home for formed ideas (a hook + a short concept) you collect now and write later, living in the Exodus dashboard. The Organic capture path transcribes a pasted Instagram/TikTok reel into a reusable idea; `idea write` (or `organic --write`) escalates a banked idea to the Genesis writer. If the user instead wants ads written from a reel RIGHT NOW in one shot — "exodus, make me ads from this reel" — that's the `exodus-genesis` skill (`--reel`); use this skill when the bank itself is the point (collect, curate, then write). Only invoke when the user has explicitly invoked Exodus — they said "exodus" in the request ("exodus, add this to my idea bank", "save these reels to the exodus idea bank", "exodus, write idea O3"), named this skill or /exodus-idea, ran an `npx @aicopycoders/exodus idea` command, referenced Exodus idea-bank keys from a prior run (O3, G1, S4), or the exodus hub skill routed here — gate "idea bank" mentions to Exodus context. Never claim generic idea or note-taking requests ("save this idea for later", "show me my ideas") — in shared folders those may belong to the user's other tools. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus.
---

```operator-guide
Idea Bank = formed ideas (hook + 1-2 line concept), brand-agnostic, written later.
Capture (three sources):
  gambit  "<brain-dump>"        split a freeform dump into discrete ideas
  organic "<url> ..." [--write] pull ONE idea from each IG/TikTok reel (transcribe → extract)
  swipe   [--limit n]           extract concepts from the saved swipe library
Curate:
  list [--source ..] [--status raw|writing|written|archived] [--limit n]
  note <KEY> "<steering>"   ·   edit <KEY> "<new concept>"   ·   add "<hook>" [--desc ..]   ·   rm <KEY> [--hard]
Write:
  write <KEYS> [--awareness <level>] [--passes n]   one Genesis run per key (brief-mode)
Keys look like G1 (gambit) · O2 (organic) · S4 (swipe). Capture is fire-and-forget on Trigger.
Returns: banked ideas appear in `idea list`; writes return a Genesis run + Google Doc per key.
```

# Idea Bank — Collect Now, Write Later

The Idea Bank is where formed ideas live between "I saw something worth using" and "write it." An idea is a **hook + a short concept** — not the finished ad. Capture cheaply, curate the keepers, then escalate the ones you like to the Genesis writer. The analysis happens at capture; writing is a plain brief-mode Genesis run, so the brand's voice/steering is applied by the writers (Mario + Infeed), not baked into the idea — banked ideas stay reusable across runs.

> **Reel → ads, one shot vs. bank-first.** Both this skill and `exodus-genesis` can write from a pasted reel. Use **the `exodus-genesis` skill (`--reel`)** when the user wants ads *now* from one reel and doesn't care about the bank. Use **`exodus-idea`** when the bank is the point — they're collecting several reels/angles, want to review before writing, or are working through a list. `idea organic --write` is the middle path: capture to the bank AND write in one shot.

## Workflow

### 1. Capture — get ideas into the bank

Pick the source from what the user handed you:

```bash
# Reels — transcribe each IG/TikTok link into one reusable idea:
npx @aicopycoders/exodus idea organic "https://www.instagram.com/reel/abc https://www.tiktok.com/@x/video/123"

# Brain-dump — split a freeform stream into discrete ideas:
npx @aicopycoders/exodus idea gambit "joint pain at 40, sleep angle, grounding vs pills"

# Swipes — mine concepts from the saved competitor-ad library:
npx @aicopycoders/exodus idea swipe --limit 10
```

Capture is **fire-and-forget** (it scrapes/transcribes/extracts on the queue). Don't poll — tell the user the ideas will land in the bank, and that `idea list` shows them as they arrive. A reel that's private, region-locked, or has no transcript just won't produce an idea; surface that if the user expected one.

### 2. Curate — make the keepers writable

```bash
npx @aicopycoders/exodus idea list --source organic --status raw    # review what landed
npx @aicopycoders/exodus idea note O2 "lean harder on the cortisol angle, never mention sleep meds"
npx @aicopycoders/exodus idea edit O2 "A 40-something realizes their 'bad sleep' is actually high cortisol…"
npx @aicopycoders/exodus idea add "It's not low T — it's too high cortisol" --desc "reframe hook" --source gambit
npx @aicopycoders/exodus idea rm O5            # archive a dud (--hard to delete)
```

`note` attaches persistent steering that rides along into the Genesis run as a Direction block. `edit` rewrites the concept itself. Keys are stable (`O2`, `G1`, `S4`).

### 3. Write — escalate to Genesis

```bash
# Write the ones the user picked — one Genesis run per key:
npx @aicopycoders/exodus idea write O2,G1 --awareness solution-aware

# Or capture a reel AND write it immediately (bank-and-write in one shot):
npx @aicopycoders/exodus idea organic "https://www.instagram.com/reel/abc" --write --awareness problem-aware
```

`write` is fire-and-forget — it dispatches a brief-mode Genesis run per key (Mario + Infeed, default 1 pass = 2 variants; `--passes`/`--variants` scale it) and links each idea to its run. **Awareness is your call** (state your read; default `problem-aware`). The idea flips to `writing`, then `written` with a Doc link once the run lands.

### 4. Report

Per the **Default Post-Run Reporting** rule in `exodus-strategist`: for a capture, confirm what's being pulled and where it'll show up (`idea list`). For a write, surface the dispatched run(s) and that status flips to `written` with a Doc link — then propose a next move (curate the rest, write a second batch, or pair a strong result with the `exodus-image` skill).

## Notes

- **Banked ideas are brand-agnostic and reusable** — the same idea can be written for different awareness levels or re-run later. Don't re-capture a reel you've already banked; `idea list --source organic` first.
- **Reel capture reuses the same transcription as the `exodus-genesis` skill's `--reel` path** — both go reel → transcribe → organic idea → Genesis writer (the standard writer, nothing custom).
- A reel write models the reel's *angle*; the Genesis writers apply the brand's primer, hook bank, and steering, so the output is on-brand without the idea itself being brand-specific.
