# CAST — a generative grammar for video ad formats

> Part of the creative-strategy framework set; compact index lives in `exodus-strategist`.
> A faceted system for **decoding any video ad** into its parts and **generating infinite new
> ones** — while staying human-readable. This is a *thinking* framework: the base Exodus CLI
> ships copy and statics, so use CAST to decode references, brief video concepts, and choose
> the Re-Skin knob during iterations (`iterations.md`). Video rendering itself is roadmap.

> **The big idea (the $100M-on-Meta thesis):** the new *mechanism* isn't a new claim — it's
> the **creative format itself.** A never-seen format resets the market's sophistication clock
> on two levels: the **human brain** (novelty hijacks attention) and the **machine** (Meta
> can't slot it next to your existing winners, so it finds a fresh audience). The desire is
> the permanent payload; **the format is the vehicle, and it must change constantly.** The
> real asset isn't any one format — it's a *system for manufacturing novelty faster than the
> market copies it.*

---

## The grammar: CAST = 4 axes

A video ad = a point across four independent axes. Decode any ad → its 4 coordinates
(**reverse**). Pick an empty/novel combination → a new format (**generate**).

| Axis | The question | Values (open lists) |
|---|---|---|
| **C — Conceit** | What social shape / skit / premise does it mimic? | talking-head/yapper · podcast · street interview · customer call · cue cards · whiteboard · green-screen react · tutorial/demo · listicle · skit · text-thread · thumb-fight · news/doc … *(open — this is where new types are born; a conceit is a specific TYPE/vehicle, never a generic "story")* |
| **A — Actor** | Who's on screen / whose credibility? | *buckets below* |
| **S — Style** | What substrate / visual look? | live-action · AI-3D (Pixar) · AI-2D cartoon · claymation · motion-graphics · screen-capture · static-in-motion · composite |
| **T — Terrain** | Where is it set? | bedroom/native · office/studio · street/outdoor · in-use (gym/kitchen) · abstract/none |

### Actor buckets (the trust ladder — *whose word are we trusting?*)

| Bucket | = |
|---|---|
| **Unseen** | no figure — product, hands, b-roll, screen |
| **Peer** | a real customer / someone like me |
| **Creator** | hired relatable talent (UGC actor) |
| **Founder** | the maker / brand insider |
| **Authority** | credentialed expert (doctor, coach, scientist) |
| **Celebrity** | borrowed fame |
| **Character** | fictional/animated persona (mascot, Pixar character) |

---

## Why CAST and not a flat list

The old cut — "Human-first / VO+B-roll / AI animation" — feels off because **each one keys
off a different axis**: Human-first = *who* (Actor), VO+B-roll = *how it's delivered*, AI
animation = *how it's rendered* (Style). They're not siblings; they're three different axes
flattened into one list. CAST promotes each trait to its own axis → MECE-ish, reversible, and
generative.

**Two things deliberately cut** (they failed the *"type-definer or variation-knob?"* test):
- **Delivery** (sync / VO / text-on-screen) → mostly determined by Conceit + Actor; the free
  part (VO ↔ text) is already an iterations knob, not a type axis.
- **Fidelity / polish** (ugly → branded) → that's the existing native ↔ templated ↔ branded
  wrapper tied to **awareness**, and it's *emergent* from Actor + Style + Terrain. It crosses
  all of Creative (statics too), so it stays as that layer — not a CAST axis.

---

## The discipline: stable core, test one knob

Same "turn one knob" rule as the iterations (CASHED) framework. Hold most of CAST stable,
move one axis:

- **Novelty (resets the sophistication clock):** a new **Conceit** or a new **Style** value.
  This is net-new — what makes an ad feel never-seen.
- **Diversity (varies a known winner):** swap **Actor** or **Terrain**. Same format, fresh
  face/place — scales a winner without resetting anything.

So: to *manufacture novelty* → push **C** and **S**. To *scale a winner* → vary **A** and
**T**.

**The DR skeleton is NOT a CAST axis.** It's the constant payload *underneath* every ad:
hook → story → problem → agitate → sell-against → benefits → product → unique mechanism →
offer. CAST describes the **vehicle**; the skeleton is the **engine**. Keep them separate or
you re-tangle them.

---

## Reverse test — real ads decoded into CAST

| Ad | Conceit | Actor | Style | Terrain | Novelty came from |
|---|---|---|---|---|---|
| AI "Pixar" VSL | story/VSL | Character | **AI-3D** | animated | **Style** |
| Thumb Fight | **thumb-fight** | Creator | live-action | native | **Conceit** |
| 3-person POV founder | multi-person POV | Founder | live-action | — | Conceit |
| 2D AI cartoon founder | explainer | Founder | **AI-2D** | animated | **Style × Actor cross** |
| Cue Card | **cue-cards** | hands/Peer | live-action | neutral | Conceit |
| Customer Call | **phone-call** | Peer + Founder | live/screen-cap | abstract | Conceit |

The grid tells you *where each ad's novelty lives* — and the best ones are often a **cross**
nobody had run (Founder × AI-2D).

**Weak seams to watch:** Conceit ↔ Style can bleed on AI (resolution: render = Style, story
= Conceit); some Conceits presume a Terrain (street-interview → street). Minor. **Conceit
carries the most weight and is the most generative — it's the engine room.**

---

## The Conceit Engine

Conceit is the one axis where novelty actually lives, so it's the only thing you point a
creativity pass at. Everything downstream just *applies* the conceit.

```
   what's working  ──┐
   (organic + swipes  │
    + your own ads) ──┤──►  CONCEIT pass  ──►  new conceits
                       │   (abstracts the *shape*,   (cue-card, customer-call,
   formats you've ────┘    not the copy)              thumb-fight, + net-new)
   already unlocked
```

1. **Feed** — a read on what's winning *organically* and in *ads* (the same STORMING / swipe
   sources Ideation already uses).
2. **Abstract the shape, not the words** — "2-voice overheard call," "hands swapping cards" —
   then recombine and invent new ones.
3. **Output** — each new conceit becomes its **own primer**: winning examples of that format
   + a light wrapper. Same primer philosophy, teaching the *vehicle* instead of the words.

---

## How this plugs into primers (the two-layer model)

A primer = **raw winning ads + a light meta-instruction wrapper.** Today Exodus primers are
cut by **awareness** and are copy-native. Conceit reveals a second, orthogonal layer:

- **Payload primers** *(what exists today)* — cut by **awareness × length**. Teach *what to
  say and where to enter* = the DR engine. Stable per segment.
- **Conceit primers** *(the new layer)* — cut by **format**. Teach *what shape to pour it
  into* = the vehicle.

**Apply them in sequence — don't multiply them into slots** (awareness × conceit = slot
explosion):

```
payload primer (what to say) → conceit primer (what shape) → Style / Actor / Terrain (production) → scripted ad
```

Hold the payload stable (segment + awareness + mechanism — the brand truth) and **swap the
conceit** → a net-new-*feeling* ad with zero new research. One winning payload × 5 conceits =
5 ads that reset the clock. **That's the novelty machine.**

### What a conceit primer encodes
Winning ads of that conceit + a light wrapper for: **(a)** beat → structure mapping,
**(b)** register/voice, **(c)** the conceit's native hook type, **(d)** visual-direction cues
(where Style/Terrain plug in).

| Conceit | Beat → structure | Voice | Native hook |
|---|---|---|---|
| **Cue-card** | one beat per card, ≤8 words | terse, declarative | card 1 = pattern-interrupt line |
| **Customer-call** | beats → two-voice turns | overheard, unpolished | friend's confession/question |
| **Street-interview** | beats → Q&A; respondents stack proof | reactive, real | interviewer's provocation |
| **Thumb-fight** | beats wrap a UI interaction | 4th-wall-breaking | "stop scrolling, put your thumb here" |

---

## One-line summary

**CAST (Conceit · Actor · Style · Terrain) decodes any video and generates new ones. Conceit
is the creative slot — point one pass at it, fed by what's working, outputting new
conceits-as-primers. The DR skeleton stays constant underneath; the conceit is the vehicle
you swap to manufacture novelty faster than the market copies it.**
