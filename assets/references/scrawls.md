# SCRAWLS Pipeline Reference

> Comprehensive reference for building the SCRAWLS static image ad pipeline into Exodus.
> Compiled from the Creative Strategy Knowledge Base: Monday Gospels (Jan 5, Jan 12, Mar 16, Mar 23 2026), Creative Strategist Ascension Workshop (Day 3), meeting notes, and wiki concepts.

---

## What SCRAWLS Is

SCRAWLS is Luke Mills' proprietary framework for generating static image ad concepts, specifically for **unaware and problem-aware** audiences. It is the image counterpart to STORMING (which handles copy ideation).

The name is an acronym for 7 concept sources. The rule: **"Scrawl through every source before you generate a single image."**

SCRAWLS applies specifically to in-feed native static image ads -- ads designed to look like organic Facebook/Instagram content, not polished brand creative.

> **Where this sits in the v2 set.** SCRAWLS is the **native-static** branch of the Re-Skin
> knob in the iterations framework (`iterations.md`); templated and branded statics are the
> other two branches. The hooks/copy SCRAWLS derives from follow the Copy Blocks model
> (`copy-blocks.md`), and for the video equivalent of "swap the format to manufacture novelty"
> see the CAST grammar (`cast-video.md`). In Exodus you brief these renders through `image` →
> `creative` (native / copy-derived) and `template` (structured formats).

---

## Where SCRAWLS Fits in the System

Luke's system has two parallel tracks based on awareness level:

| Awareness Level | Copy Ideation | Image Ideation |
|----------------|--------------|----------------|
| Unaware / Problem Aware | STORMING | **SCRAWLS** |
| Solution Aware / Product Aware | STORMING | Standard Static Ad Types (21+ formats) |

**The awareness level should be auto-detected.** When an ad idea comes in, the system classifies it and routes to the right image pipeline. Luke was explicit about this in the April 20 meeting: "It should just do it automatically. The goal is when I get the idea, it looks -- is this unaware problem aware? Or is it solution aware, product aware? There's two buckets and it just automatically detects which one it is. And then uses the right primer."

---

## The 7 SCRAWLS Sources (Deep Detail)

### S -- Swipe Mining

**What:** Find static image ads that are already spending money in the market or adjacent markets.

**Where to look:**
- Facebook Ad Library (direct competitors)
- AdSpy (broader market, essential when Ad Library doesn't surface health ads)
- Foreplay (discovery feature with filters: image, platform, language, recency, niche)
- Dummy Facebook/Instagram accounts (follow brands, let the algorithm serve you ads)
- App Spy Hero (affiliate ads)
- Anstrex (native ads)

**What to look for:** Non-branded accounts running native-looking statics. Accounts that look like regular people, not brands. These are the ones spending real money on direct response.

**Key principle from Luke:** "If you can only do one thing, swiping is better." Swiping is the highest-probability approach because something already proven in-market has a head start over any novel idea.

**Modular swiping (not wholesale):** Don't copy the whole ad. Break it into components using CASH (Concept, Angle, Style, Hook) and swipe individual elements. Swipe the CONCEPT from Ad A but use a different STYLE. Swipe the visual STYLE from Ad B but apply it to a different CONCEPT. This creates novel combinations while maintaining proven DNA.

**AdSpy search methods:**
- By brand name
- By keyword
- By URL
- Filters: static images only, likes threshold, language

**Data sources:** competitor ad libraries (Meta Ad Library) and high-engagement organic content (Instagram/TikTok).

---

### C -- Copy-Derived

**What:** Feed finished ad text into image concept generation. Let the copy inspire the visual.

**How:** Take the completed body copy for an ad and ask: "What images does this specific copy evoke?"

**Critical instruction:** Push twice. The first pass is always literal and boring. The first set of ideas will be obvious (product shots, generic lifestyle). Push past that to get concepts that are unexpected, visceral, metaphorical.

**Example from an example brand (March 23 Gospel):**
- Ad copy is about inflammation, electrical disconnection, rubber-soled shoes blocking the Earth's charge
- First-pass images might be: feet on grass, grounding sheet on bed (boring, literal)
- Pushed concepts: car battery with corroded terminals (metaphor for electrical disconnection), swollen ankles in compression socks on a La-Z-Boy (visceral reality of the audience), writing on body showing electrical pathways
- The car battery concept works because "the corrosion is visually gross -- something familiar rendered disgusting. Works as a perfect metaphor for electrical disconnection inside the body without ever saying a word about it. People post this exact photo when their car dies."

**Genesis bots for this step:** Universal Static Ad Idea Bot takes finished copy and generates image concepts.

---

### R -- Reptile Triggers

**What:** Run your concepts through 13 primal psychological triggers that bypass rational thinking and activate the reptilian brain. Each trigger creates an involuntary attention response.

**The 13 Triggers:**

| # | Trigger | Description | Examples |
|---|---------|-------------|----------|
| 1 | **Ultra-Real** | Facebook group photos, unpolished candids, hyper-specific real moments | Phone photos in bad lighting, grainy shots of real situations |
| 2 | **Bizarre** | Strange situations, WTF imagery, things that don't compute | Unexpected combinations, things that make you do a double-take |
| 3 | **Voyeur** | Screenshots of texts/DMs, private conversations, leaked moments | Text message screenshots, private group posts, "wasn't meant to be shared" |
| 4 | **Suffering** | Gripping lower back, rubbing temples, can't get out of bed | Physical expressions of pain that trigger empathy |
| 5 | **Gorey** | Medical close-ups, weird body parts, visceral imagery | Bloodshot eyes, corroded car batteries, close-ups of skin conditions |
| 6 | **Sexual** | Suggestive poses, attractive people, subtle heat | "Sexy grandma" concept from an example brand |
| 7 | **Primal Fear** | Danger signals, alarming visuals, something feels wrong | Warning signs, alarms, visuals that trigger fight-or-flight |
| 8 | **Odd Contrast** | Two things that don't belong together, jarring pairings | Unexpected juxtaposition (was originally called "Inside Joke" but expanded) |
| 9 | **Inside Joke** | Niche-specific imagery, tribal knowledge, stuff only they recognize | Things the target audience would instantly identify with |
| 10 | **Time Warp** | Vintage photos, old newspaper clippings, historical imagery | Historical photos, sepia-toned images, "remember when" visuals |
| 11 | **Victory Lap** | Aspirational outcome, transformation moment, life on the other side | Active seniors, before/after moments, celebrations |
| 12 | **Selfie** | Demographic reflected back, "that's literally me," age/lifestyle match | People who look exactly like the target audience in their natural habitat |
| 13 | **Uncanny Objects** | Weird fruits, strange foods, objects that feel off | Objects that look slightly wrong, unusual shapes, things that feel "off" |

**Top 5 Most Reliable (Luke's ranking):**
1. Bizarre
2. Ultra-Real
3. Gorey
4. Sexual/Hot
5. Niche-Specific (Inside Joke)

**How to apply:** Take any concept and run it through each trigger. Not all will apply, but some will transform a bland concept into something vicious. The Reptile Trigger step is "where concepts get vicious."

**Genesis bots:** 13 Reptile Triggers Bot generates reptile-trigger-enhanced prompts from ad concepts.

---

### A -- Audience Language

**What:** Mine real customer language for visual scenes. Real people describe their reality in vivid, specific, visual terms that make perfect image concepts.

**Where to mine:**
- Ad comments (from winning ads)
- Amazon reviews
- Facebook group posts
- Testimonials
- Customer support tickets
- Reddit threads

**The key insight:** Customers describe real scenes in their own words. These descriptions are already proven to resonate because they come from the audience itself.

**Example:** "I was white-knuckling the toilet seat" -- that's an instant image concept. Someone gripping a toilet seat in desperation. It's visceral, real, and immediately understood by the audience.

**Other examples from an example brand:**
- "Yes, I tried to copper wire duct tape..."
- "Use direct metal to skin contact strap, connected to same ground"
- "Piece of silver in water"
- These are real customer comments that reveal visual concepts: copper/duct tape rigs, DIY grounding attempts

**Data sources:** ad-comment scraping and analysis, plus prior winning-ad data (loopback).

---

### W -- Wild Sourcing

**What:** Find real native photos from the wild internet. High-engagement organic posts that are proven scroll-stoppers.

**Where to look:**
- Reddit (search by niche keywords + objects from your concepts)
- Google Images (reverse image search, keyword search)
- Facebook groups (the less polished, the better)
- TikTok/Instagram (look for organic posts with outsized engagement)

**What makes this different from Swipe Mining:** Swipe Mining looks at paid ads. Wild Sourcing looks at organic content that got outsized engagement. These images weren't designed as ads -- they're real moments that stopped people's scroll organically.

**Search strategy:** Use niche keywords + objects that came up in your concepts. If you generated a concept about "corroded car battery," search Reddit and Google Images for exactly that. Find the most visceral, real-looking version.

**Why it works:** Real native photos trigger the Ultra-Real reptile trigger. They look like something a friend posted, not something a brand made. This is the core of "in-feed native" creative.

---

### L -- Loopback

**What:** Feed winners back into the system. Analyze what worked, extract vectors (ranked features), expand into new territory. The flywheel that makes every batch smarter.

**The process:**
1. **Collect** what's working (winning ad images, high-CTR statics)
2. **Analyze** with your brain + AI: "Why is this working?"
3. **Isolate vectors** -- Every winning element is a vector:
   - Visual style (grainy, polished, dark, bright)
   - Subject matter (body parts, objects, people, text)
   - Composition (close-up, wide, overhead, POV)
   - Lighting (dim, natural, fluorescent, harsh)
   - Emotional tone (fear, curiosity, disgust, hope)
   - Trigger category (which reptile trigger does it activate?)
4. **Expand** each vector independently

**Vector Expansion Example (from Jan 5 Gospel):**

Starting point: "bloodshot eye" (Gorey trigger)

Vectors identified and expanded:
- bloodshot eye --> other bloodshot eyes, more bloodshot, yellow eyes
- ultra close-up --> ultra close-up of other body parts (feet, toes, nails, mouth, lips, nose)
- eye --> both eyes (two instead of one)
- eye details --> eye bags, eye wrinkles, dilated pupils
- environmental version --> foggy bathroom mirror (same "exhaustion" concept, totally different visual)

Each expansion creates a new image concept that shares the DNA of the winner but explores new territory.

**Why this is critical for automation:** The Loopback step is what creates the learning loop. Once ads are deployed and performance data comes back, the system can identify winners and automatically generate expanded concepts. This is the "flywheel" Luke references repeatedly.

**Data sources:** ad performance data (Meta API) and winning-ad identification.

---

### S -- Source

**What:** Your own brain. Personal observation and creative intuition.

**Luke's philosophy:** After saturating yourself with all the other sources, let ideas come naturally. This is the "intuition" source from Luke's Ad Concept Generation framework. It produces the majority of losers AND the majority of big outlier winners. It has the lowest floor and the highest ceiling.

**In an automated pipeline:** This maps to the "human input" step. The user can inject their own ideas, observations, or creative directions that don't come from any data source. Important to keep this as an explicit input option.

---

## The 3-Step Static Image Creation Workflow

After generating concepts through SCRAWLS, the actual image creation follows three steps:

### Step 1: Generate Ideas via SCRAWLS
Run through all 7 sources to build a pool of image concepts. Each concept should include:
- A description of the visual scene
- Which reptile trigger(s) it activates
- The awareness level it targets
- A brief rationale for why it should work

### Step 2: Pull Starter/Reference Images
For each concept, find a reference image that captures the vibe:
- From swipes (actual winning ad images)
- From wild sourcing (Reddit, Google Images)
- From existing brand assets
- From stock photos that match the aesthetic

The reference image is NOT the final ad. It's the visual starting point for AI generation.

### Step 3: Generate Using AI
Two sub-paths:

**Path A: Reverse Image Prompt**
1. Take the reference image
2. Generate a detailed description of it (AI describes what it sees)
3. Modify the description to match your concept
4. Feed the modified prompt into an image generator

**Path B: Create New Prompt from Concept**
1. Take the concept description directly
2. Create an image generation prompt from it
3. Generate the image

**Image generation tools:**
- Nano Banana Pro (Gemini) -- primary tool, best for native-looking statics
- ChatGPT Image Generator (GPT image model)
- Flux
- Midjourney (original tool, less used now)

**Batch generation:** Poe allows generating multiple images at once. NanoBanana requires waiting for each. For high-volume production, batch generation is essential.

**"Less is More" principle:** Luke is emphatic that over-engineering AI inputs makes it behave like an "overeager intern trying to use everything." Give minimum information and let it have confidence to figure things out. Don't dump the entire foundation doc into an image prompt.

---

## The 21+ Standard Static Ad Types (Solution/Product Aware Path)

When awareness is solution-aware or product-aware, skip SCRAWLS and route to format-specific generation using one of these types:

1. Headline + Image
2. Side by Side / Before and After
3. Infographic
4. Product Breakdown
5. Animation
6. Comparison
7. Scientific Study
8. Collage
9. Holding Sign
10. Native News
11. Note From The Founder
12. Testimonial
13. Lofi / Ugly Ads
14. Bold
15. Meme
16. Hero
17. Comment/Review
18. Handwritten Note
19. Screenshot
20. Breaking News
21. Carousel

**Workflow for these types:**
1. Generate idea using Universal Static Idea Bot, Static Swiper Bot, or a specific type bot
2. Create image using Static Ad Image Generator (1:1 or 9:16)

**User choice vs auto-selection (from Apr 20 meeting):**
Luke doesn't fully trust the universal chatbot's auto-selection of which type to use. The options are:
- Let the user choose which types they want
- Auto-generate from all types (gets expensive)
- Hybrid: "Do you want to decide which options, or do you want me to just choose the ones for you? And then how many do you want of each?"

---

## Genesis Bots for the Image Pipeline

From the Creative Strategist Ascension Workshop (Day 3), there are 4 categories of static image bots:

### 1. Universal Static Ad Idea Bot
- Input: finished ad copy
- Output: image concept ideas across multiple triggers and styles
- Use when you have no specific visual direction

### 2. Static Ad Swiper Bot
- Input: an existing static ad image you want to adapt
- Output: a swiped version adapted for your product
- Use when you find a winning ad image you want to riff on

### 3. 21+ Static Ad Type Bots (one per format)
- Input: product info, messaging, and the specific format
- Output: ideas tailored to that format (infographic, meme, native news, etc.)
- Use when you want a specific format

### 4. Image Generators
- Static Ad Image Generator (1:1)
- Static Ad Image Generator (9:16)
- Input: concept description and/or reference image
- Output: generated image

There are **48 Genesis bots** specifically for image prompt generation in the current bot catalog.

Additionally, standalone bots on Poe (from the SOP documents):
- **Copy to Native Image Generation Bot** -- Takes copy and generates native-looking image concepts
- **13 Reptile Triggers Bot** -- Generates reptile-trigger-enhanced prompts from concepts
- **Winner Analysis Prompt Bot** -- Analyzes winning images to extract vectors
- **Vector Expansion Prompt Bot** -- Takes extracted vectors and generates expanded concepts

---

## Standard Output Per Concept

Per Luke's workflow, each ad concept should produce:
- 2 hooks
- 2 headlines
- 1 body copy
- **6-8 static images**

The images are the high-volume component. A batch of 10 ads = 60-80 static images.

---

## Awareness Level Distribution

For a standard batch of 10 ads:
- **6 Unaware/Problem Aware** (4 unaware, 2 problem aware) --> SCRAWLS pipeline
- **4 Solution Aware/Product Aware** --> Standard static ad types

This means roughly 60% of image generation should go through the SCRAWLS process and 40% through standard types.

---

## The Creative Diversity Matrix

SCRAWLS serves creative diversity at multiple levels:

| Diversity Level | What It Covers | How SCRAWLS Helps |
|----------------|---------------|-------------------|
| Level 1: Segments | Different audience personas | Audience Language source mines segment-specific visuals |
| Level 2: Awareness | Where on the spectrum | SCRAWLS = unaware/problem; Types = solution/product |
| Level 3: Source | Where the concept came from | Each SCRAWLS letter is a different source |
| Level 4: Styles | Format and visual treatment | Reptile triggers create style diversity |

The Diversity Matrix is 5 Segments x 5 Awareness Levels = 25 Buckets. SCRAWLS helps ensure image concepts cover as many buckets as possible, not just cluster in the obvious ones.

---

## Key Principles for Pipeline Design

### 1. Auto-detect awareness level
The system reads the ad idea/brief and classifies: unaware/problem-aware vs solution/product-aware. Then routes to the right pipeline. No manual selection.

### 2. Run all SCRAWLS sources, not just one
The whole point is diversity. Don't let the system shortcut to just Copy-Derived or just Swipe Mining. Run all available sources and aggregate the concepts.

### 3. Push past the literal
First-pass image concepts are always boring and literal. The pipeline should include a "push" step that forces more creative, unexpected, visceral concepts. This is especially important for the Copy-Derived source.

### 4. Reference images before generation
Don't go straight from concept to AI image generation. Finding/selecting a reference image first dramatically improves output quality.

### 5. Less is more with prompts
Don't dump entire foundation docs into image generation prompts. Minimal, specific, confident prompts produce better results.

### 6. The Loopback flywheel is the long-term differentiator
Building the feedback loop from performance data back into concept generation is what makes the system get smarter over time. V1 can work without it, but it needs to be designed in as a data path.

### 7. Human approval gates
Luke was clear in the April 20 meeting: "Do you want to decide which options, or do you want me to just choose?" There should be a checkpoint between concept generation and image generation where the user can curate, modify, or reject concepts before spending compute on generation.

---

## Existing Exodus Infrastructure That Maps to SCRAWLS

| SCRAWLS Source | Data source | Status |
|---------------|----------------------|--------|
| Swipe Mining | Competitor ad libraries (Meta Ad Library) | Working (needs brand population) |
| Copy-Derived | Copy pipeline output (Genesis runs) | Working |
| Reptile Triggers | Image classification taxonomy | Taxonomy defined |
| Audience Language | Ad-comment scraping & analysis | Comment scraping working |
| Wild Sourcing | Organic content (Instagram/TikTok) | Partial |
| Loopback | Ad performance data | Needs connection |
| Source | User input via CLI | Available |

The static-images run kind is defined in the dashboard schema (`kind: "static-images"`) with feed card and detail components built but no runs yet.

---

## Example Brand: Full SCRAWLS Walkthrough

From the March 23, 2026 Monday Gospel, Luke walked through SCRAWLS live for an example brand:

**Ad:** "The 1 Daily Habit Silently Destroying Seniors From The Inside Out"

**Copy-Derived concepts (Tab 20):**
1. Car battery with corroded terminals
2. Swollen ankles in compression socks
3. Writing on body (showing electrical pathways)
4. Montage of body parts
5. Sexy grandma
6. Whiteboard
7. Anatomy diagram
8. Silvadene (medical cream)
9. Copper/duct tape (DIY grounding attempt)
10. Sisters picture (from the story in the ad)

**Additional concepts from other sources:**
- Historical images (Time Warp trigger)
- Feet pictures (Ultra-Real trigger)
- Pets -- dogs, cats (Selfie/relatable trigger)

**Reptile triggers activated:**
- Car battery = Gorey + Uncanny Object + Ultra-Real
- Swollen ankles = Suffering + Ultra-Real
- Sexy grandma = Sexual
- Anatomy = Scientific/Bizarre
- Copper/duct tape = Ultra-Real + Bizarre

**Then the workflow continued:**
1. Pull starter images (find reference photos for each concept)
2. Reverse prompt from reference (describe the reference image)
3. Generate via Midjourney or Nano Banana

---

## Data Inputs the Pipeline Needs

For each brand/workspace, the SCRAWLS pipeline needs access to:

1. **Finished ad copy** (from any copy pipeline run) -- for Copy-Derived
2. **Competitor brand data** (ad libraries) -- for Swipe Mining
3. **Ad comment data** (comment scraping & analysis) -- for Audience Language
4. **Winning ad performance data** (Meta API) -- for Loopback
5. **Organic post data** (organic content scraping) -- for Wild Sourcing + Swipe Mining
6. **Foundation docs** (buyer profile, pain matrix, offer brief) -- for Reptile Triggers context
7. **Image classification taxonomy** -- for routing and tagging output
8. **User input/creative direction** -- for Source

---

## Sources

- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/scrawls-framework.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/storming-framework.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/reptile-triggers.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/vector-expansion.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/static-ad-workflows.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/static-ad-types.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/creative-diversity.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/creative-coverage.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/swiping-strategy.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/modular-swiping.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/ad-concept-generation.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/concepts/hook-types.md`
- `domain-knowledge/creative-strategy/Domain Creative Strategy/topics/static-ad-formats.md`
- `domain-knowledge/creative-strategy/wiki/topics/creative-strategist-ascension-workshop.md`
- `domain-knowledge/creative-strategy/wiki/topics/keyword-research-by-vertical.md`
- `domain-knowledge/creative-strategy/wiki/entities/luke-mills.md`
- `domain-knowledge/creative-strategy/raw/weekly-monday-gospels/january-5-2026-creating-winning-static-image-ads.md`
- `domain-knowledge/creative-strategy/raw/weekly-monday-gospels/march-23-2026-how-to-write-better-ads-faster-part-2.md`
- `domain-knowledge/creative-strategy/raw/creative-strategist-ascension/day-3.md`
- `meeting-notes/2026-04-20-brad-x-luke.md` (transcript provided in conversation)
- `meeting-notes/2026-04-13-brad-x-luke.md`
- `meeting-notes/2026-04-01-ai-agent-meeting.md`
- `meeting-notes/2026-03-23-brad-x-luke.md`
