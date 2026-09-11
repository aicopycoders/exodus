import {
  count,
  dateOrDash,
  defaultMetaAdsDeps,
  errorFor,
  safeText,
  truncate,
  type AdComment,
  type CommentsResponse,
  type FlowResult,
  type MetaAdsDeps,
} from "../lib/meta-ads.js";

export const helpText = `
exodus comments — read the comments on your own synced Meta ads (read-only)

The daily Meta sync stores the comments people left on the brand's ads, on both
Facebook and Instagram. This reads them back. Commenter names and profile links
are stripped server-side before they are ever stored — you get the words, not
the person.

Usage:
  exodus comments list [--ad <adId>] [--platform x] [--limit n] [--json]

Flags:
  --ad <adId>        Only this ad's comments (ad ids come from exodus ads list)
  --platform <x>     facebook | instagram — one surface only
  --limit <n>        How many comments, 1–500 (default 100)
  --json             Machine-readable JSON instead of the human list

Notes:
  • Newest first.
  • Scopes to your active brand (exodus brand current).
  • Nothing here posts, replies, hides or deletes — reading is all it does.
  • Counts per ad live on \`exodus ads show <adId>\`.

Examples:
  exodus comments list
  exodus comments list --ad 120210000000000
  exodus comments list --platform instagram --limit 50
  exodus comments list --ad 120210000000000 --json
`.trim();

// ── Flags (pure) ──────────────────────────────────────────────────────────

export const PLATFORMS = ["facebook", "instagram"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const VALUE_FLAGS = new Set(["ad", "platform", "limit"]);

export const MAX_LIMIT = 500;

export interface CommentsListOptions {
  adId?: string;
  platform?: Platform;
  limit?: number;
}

export type ParseResult =
  | { ok: true; options: CommentsListOptions }
  | { ok: false; message: string };

export function parseCommentsFlags(flags: Record<string, string | boolean>): ParseResult {
  const options: CommentsListOptions = {};

  const ad = flags["ad"];
  if (ad !== undefined) {
    if (typeof ad !== "string" || !ad.trim()) {
      return { ok: false, message: "--ad needs an ad id (see: exodus ads list)" };
    }
    options.adId = ad.trim();
  }

  const platform = flags["platform"];
  if (platform !== undefined) {
    if (
      typeof platform !== "string" ||
      !PLATFORMS.includes(platform.trim().toLowerCase() as Platform)
    ) {
      return {
        ok: false,
        message: `--platform must be one of: ${PLATFORMS.join(", ")} (got "${String(platform)}")`,
      };
    }
    options.platform = platform.trim().toLowerCase() as Platform;
  }

  const limitRaw = flags["limit"];
  if (limitRaw !== undefined) {
    const n = typeof limitRaw === "string" ? Number(limitRaw) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
      return {
        ok: false,
        message: `--limit must be a whole number 1–${MAX_LIMIT} (got "${String(limitRaw)}")`,
      };
    }
    options.limit = n;
  }

  return { ok: true, options };
}

/**
 * Two routes carry the same rows: the per-ad one (`/api/v2/ads/<id>/comments`)
 * and the brand-wide one (`/api/v2/comments`). Naming an ad uses the per-ad
 * route, so an unknown ad answers a clean 404 instead of an empty list that
 * reads like "this ad had no comments".
 */
export function commentsPath(options: CommentsListOptions): string {
  const params = new URLSearchParams();
  if (options.platform) params.set("platform", options.platform);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";
  return options.adId
    ? `/api/v2/ads/${encodeURIComponent(options.adId)}/comments${suffix}`
    : `/api/v2/comments${suffix}`;
}

// ── Rendering (pure) ──────────────────────────────────────────────────────

const PLATFORM_TAGS: Record<string, string> = {
  facebook: "fb",
  instagram: "ig",
};

export function platformTag(platform: unknown): string {
  const clean = safeText(platform).toLowerCase();
  if (!clean) return "??";
  return PLATFORM_TAGS[clean] ?? clean.slice(0, 2);
}

/**
 * One comment, two lines: a meta line then the words.
 *
 * Comment text is written by strangers on the internet and may carry newlines,
 * runs of emoji, or padding meant to break a layout — flatten it to one line so
 * a hostile comment can never restructure the terminal output around it.
 */
export function commentLines(comment: AdComment, opts: { showAdId: boolean }): string[] {
  const meta = [
    `[${platformTag(comment.platform)}]`,
    dateOrDash(comment.createdAt),
    typeof comment.likeCount === "number" && comment.likeCount > 0
      ? `${count(comment.likeCount)} like${comment.likeCount === 1 ? "" : "s"}`
      : null,
    comment.parentId ? "reply" : null,
    opts.showAdId && comment.adId ? `ad ${safeText(comment.adId)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const text = truncate(comment.text, 400) || "(no text — media-only comment)";
  return [`  ${meta}`, `    ${text}`];
}

export function formatComments(
  data: CommentsResponse,
  options: CommentsListOptions,
): string[] {
  const comments = Array.isArray(data.comments) ? data.comments : [];
  const scope = options.adId ? `ad ${options.adId}` : "this brand's ads";
  const surface = options.platform ? ` on ${options.platform}` : "";

  if (comments.length === 0) {
    return [
      `No stored comments for ${scope}${surface}.`,
      "The daily Meta sync stores comments as it finds them — an ad with no comments yet, or one synced before comments landed, shows nothing here.",
    ];
  }

  const total = typeof data.count === "number" ? data.count : comments.length;
  const lines = [
    `Comments (${comments.length}${total > comments.length ? ` of ${total}` : ""}) — ${scope}${surface}, newest first`,
    "",
  ];
  const showAdId = !options.adId;
  for (const comment of comments) {
    lines.push(...commentLines(comment, { showAdId }));
  }
  lines.push("");
  lines.push("Commenter names and links are stripped before storage — the words are all Exodus keeps.");
  if (total > comments.length) {
    lines.push(`Raise --limit (max ${MAX_LIMIT}) to see more.`);
  }
  return lines;
}

// ── Flow (network, dependency-injected) ───────────────────────────────────

export async function listFlow(
  options: CommentsListOptions,
  json: boolean,
  deps: MetaAdsDeps,
): Promise<FlowResult> {
  const res = await deps.get(commentsPath(options));
  if (!res.ok && res.status === 404 && options.adId && !json) {
    const laddered = errorFor(res, "comments list", json, deps, (id) =>
      `exodus comments list --account ${id}`,
    );
    if (laddered && laddered.lines[0]?.startsWith("this server does not support")) {
      return laddered;
    }
    return {
      code: 1,
      lines: [
        `No synced ad matches "${options.adId}".`,
        "Ad ids come from `exodus ads list`.",
      ],
    };
  }
  const err = errorFor(res, "comments list", json, deps, (id) =>
    `exodus ads list --account ${id}`,
  );
  if (err) return err;
  const data = (res.data ?? {}) as CommentsResponse;
  if (json) return { code: 0, lines: [JSON.stringify(data)] };
  return { code: 0, lines: formatComments(data, options) };
}

// ── Dispatch ──────────────────────────────────────────────────────────────

export function parsePositional(args = process.argv.slice(3)): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2).split("=", 1)[0] ?? "";
      if (!arg.includes("=") && VALUE_FLAGS.has(key)) i += 2;
      else i++;
      continue;
    }
    out.push(arg);
    i++;
  }
  return out;
}

function printResult(result: FlowResult): void {
  for (const line of result.lines) console.log(line);
  for (const warning of result.warnings ?? []) console.error(warning);
  if (result.code !== 0) process.exit(result.code);
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  const [sub] = parsePositional();
  const json = flags["json"] === true;

  if (!sub || sub === "help") {
    console.log(helpText);
    return;
  }

  if (sub === "list") {
    const parsed = parseCommentsFlags(flags);
    if (!parsed.ok) {
      console.error(`Error: ${parsed.message}`);
      console.log("Usage: exodus comments list [--ad <adId>] [--platform x] [--limit n] [--json]");
      process.exit(1);
    }
    return printResult(await listFlow(parsed.options, json, defaultMetaAdsDeps));
  }

  console.error(`Unknown subcommand: "${sub}"\n`);
  console.log(helpText);
  process.exit(1);
}
