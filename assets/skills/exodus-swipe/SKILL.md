---
name: exodus-swipe
description: Swipe a single ad the user pastes as a Facebook Ad Library link and write fresh ads modeled after it, through Exodus. The scrape reliably captures the ad's primary text and headline; on-screen text and video transcripts are best-effort and often absent — if the user wants a video's script modeled and the transcript didn't come through, ask them to paste the script or describe the beat, and pass it as steering. Pulls the working hook and writes it through the Genesis writer for the ACTIVE Exodus brand. The one rule: before running, ASK the user what about the ad they want to model (the angle, the structure, the emotional beat, the format) and pass that along as steering — a swipe without a point of view just copies. Only invoke when the user has explicitly invoked Exodus — they said "exodus" in the request ("exodus swipe this ad", "exodus, model this competitor ad", "exodus, do our version of this"), named this skill or /exodus-swipe, ran an `npx exodus` command, or the exodus hub skill routed here. Never claim a generic "swipe this ad" / "rip this ad" or a bare pasted facebook.com/ads/library link on its own — in shared folders those may belong to the user's other tools. If the user instead wants to write from an Instagram/TikTok reel, that's the `exodus-genesis` skill (`--reel`); to collect ideas to curate before writing, that's the `exodus-idea` skill. The bare word "Genesis" without "exodus" refers to the member's own Genesis API key and personal bot recipes, NOT to Exodus.
---

```operator-guide
Swipe one pasted Facebook Ad Library link → write ads for the active brand:
  npx @aicopycoders/exodus genesis --swipe-url "<fb-ad-library-url>" --steering "<what to model>" --awareness <level>

  --swipe-url   a https://www.facebook.com/ads/library/?id=<number> link
  --steering    REQUIRED in practice: what the user wants to model from the ad
                (angle / structure / hook style / emotional beat / format)
  --awareness   unaware | problem-aware (default) | solution-aware | product-aware
  --passes N    writing passes per bot (1-5, default 1 = 2 variants)

Scoped to the active brand — confirm with `npx @aicopycoders/exodus brand current`. The output
always pitches the ACTIVE brand, never the brand in the swiped ad.
```

# Swipe — paste an ad, write your own

A swipe is the fastest way to turn a great ad someone else is running into ads for *your* brand. The user finds an ad in Facebook's Ad Library, pastes the link, and this skill scrapes it, extracts the working hook, and runs it through the Genesis writer (Mario + Infeed) for the active brand — banking a reusable idea along the way. It's the same capture → Idea Bank → Genesis path a pasted reel uses; a swiped ad is just another input to the standard writer.

This is the **basic, primary swipe**: one pasted link, written now. (Automated competitor sweeps will grow into this same skill later — for now it's one link at a time.)

## The one thing you must do first: ask what to model

**Do not fire the command the instant you see a link.** A swipe with no point of view just rewrites the ad — that's not the job. The value is in *what the user wants to borrow* from it.

So before running, ask one focused question, e.g.:

> "Got it — what is it about this ad you want to model? The angle? The hook style? The story structure? The format? Give me the gist and I'll steer the write toward it."

Take their answer and pass it verbatim-ish through `--steering`. That steering is folded into the brief as explicit direction, so the writer leans into the thing the user actually liked instead of guessing. If the user already told you what they want to model in the same breath ("swipe this — I love how it opens with the failure story"), you don't need to ask again; lift that into `--steering` and go.

Examples of good steering:

```
"the way it opens on the embarrassing moment before naming the product"
"the side-by-side before/after structure, keep that bones"
"the skeptical-friend angle — someone who didn't believe it at first"
"the punchy one-line hook style, not the long VSL build"
```

## Resolve awareness, then run in the background

**Awareness is your call** — state your read rather than making the user pick: "this reads problem-aware because X — sound right?" Default `problem-aware` when unsure. The primer is awareness-keyed, so pick one level.

Then fire it in the background (capture + a Genesis run is well past the 10-min foreground window):

```bash
npx @aicopycoders/exodus genesis --swipe-url "<url>" --steering "<what to model>" --awareness <level> [--passes n]
```

If the user didn't say how many variants, surface the quick passes menu (1 pass / 2 variants recommended) like a normal Genesis run rather than assuming a big one.

## What happens under the hood

1. The ad is scraped from the Ad Library. The primary text (body copy) and headline come through reliably; CTA and link description usually do. On-screen image text and spoken video transcripts are **best-effort and often absent** — don't promise them. If the user specifically wants the video's script modeled and the transcript didn't come through, ask them to paste the script or describe the beat, and pass it along in `--steering`.
2. The strongest hook + a one-line concept are extracted and **banked as a reusable idea** for the active brand (so there's a record you can rewrite later).
3. Your `--steering` is attached to that idea as direction.
4. The idea is written through the Genesis writer — same Mario + Infeed voices, same Google Doc output as any Genesis run.

It banks AND writes in one shot, returning a Genesis run id. Because capture is async, it takes a beat longer than a typed brief before writing starts.

## When a swipe yields nothing

Some ads can't be swiped:

- **Image-only with no readable text** — nothing to extract a hook from. Ask the user to paste the ad's text, or pick a different ad.
- **Video ad whose script didn't come through** — transcripts are best-effort, not guaranteed. If the user wanted the video's script or beats modeled, ask them to paste the script (or describe the beat) and pass it as `--steering` so the writer still gets the thing they liked.
- **Inactive / removed / not yet in the index** — the Ad Library link 404s on the scraper. Confirm the ad is still live on the page, then try again or pick another.
- **Wrong link** — the URL must carry the `?id=<number>` query param. If the user pasted a search or page URL, ask for the single-ad link (the ad's "⋯ → Copy link").

Surface the reason plainly and offer the alternate (paste the text, or another ad) rather than failing silently.

## How this relates to the other skills

- **Pasted Instagram/TikTok reel** (not a Facebook ad) → that's the `exodus-genesis` skill (`--reel`), the reel path.
- **Collecting several ads/ideas to curate before writing** → that's the `exodus-idea` skill; come back here when the user wants one written now.
- **A typed brief or an idea in their head** → that's a normal `exodus-genesis` run.

## Workspace scoping

Everything is scoped to the **active brand** — the swiped ad seeds copy *for your brand*, and the output pitches your brand, never the one in the ad. If results look off, first check `npx @aicopycoders/exodus brand current`.
