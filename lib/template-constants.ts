// Vendored from scout/src/creative-suite/template/validation/concepts.ts.
//
// Source of truth lives in the scout/ tree (Fernando's drop — immutable).
// We duplicate the literal arrays here because the exodus package is shipped
// as its own tree by scripts/publish-release.sh — cross-tree imports to
// scout/ would break at runtime even if they compiled.
//
// If you update the source, mirror the change here. Both files must stay
// in lockstep.

export const AD_TYPES = [
  "before-after",
  "native-news",
  "testimonial",
  "bold",
  "meme",
  "screenshot",
  "hero",
  "holding-sign",
  "handwritten",
  "comment",
  "breaking-news",
  "lofi",
  "comparison",
  "infographic",
  "headline",
  "collage",
  "product-breakdown",
  "scientific",
  "animation",
  "founder-note",
  "carousel",
  "statistics",
  "post-it-notes",
  "happy-avatar",
  "problem-solution",
  "writing-on-body",
  "multi-testimonial",
  "receipt",
  "step-by-step",
  "sale-promotional-offer",
  "cost-of-inaction",
  "ugc",
  "quiz-interactive",
] as const;

export type AdType = (typeof AD_TYPES)[number];

export const AD_TYPE_NAMES: Record<AdType, string> = {
  "before-after": "Before / After",
  "native-news": "Native News",
  testimonial: "Testimonial",
  bold: "Bold Typography",
  meme: "Meme",
  screenshot: "Screenshot",
  hero: "Hero",
  "holding-sign": "Holding Sign",
  handwritten: "Handwritten Note",
  comment: "Comment / Review",
  "breaking-news": "Breaking News",
  lofi: "Lo-Fi",
  comparison: "Comparison",
  infographic: "Infographic",
  headline: "Headline + Image",
  collage: "Curiosity Collage",
  "product-breakdown": "Product Breakdown",
  scientific: "Scientific Study",
  animation: "Animation",
  "founder-note": "Founder Note",
  carousel: "Carousel",
  statistics: "Statistics",
  "post-it-notes": "Post-It Notes",
  "happy-avatar": "Happy Avatar",
  "problem-solution": "Problem-Solution",
  "writing-on-body": "Writing On Body",
  "multi-testimonial": "Multi-Testimonial",
  receipt: "Receipt",
  "step-by-step": "Step by Step",
  "sale-promotional-offer": "Sale / Promotional Offer",
  "cost-of-inaction": "Cost of Inaction",
  ugc: "UGC",
  "quiz-interactive": "Quiz / Interactive Self-Selection",
};

export const REPTILE_TRIGGERS = [
  "ultra-real",
  "bizarre",
  "voyeur",
  "suffering",
  "gory",
  "sexual",
  "primal-fear",
  "odd-contrast",
  "inside-joke",
  "time-warp",
  "victory-lap",
  "selfie",
  "uncanny-objects",
] as const;
