import {
  accountLine,
  count,
  dateOrDash,
  defaultMetaAdsDeps,
  displayOr,
  errorFor,
  mediaUrl,
  money,
  percent,
  safeText,
  safeTextOr,
  table,
  truncate,
  type AdAccountRef,
  type AdShowResponse,
  type AdSummary,
  type AdWindowStats,
  type AdsListResponse,
  type FlowResult,
  type MetaAdsDeps,
} from "../lib/meta-ads.js";

export const helpText = `
exodus ads — read your own connected Meta ads (read-only)

Once a brand's Meta ad account is connected on the dashboard, Exodus syncs its
ads — the copy, the creative, the numbers and the comments — once a day. This
family READS that stored copy. Nothing here calls Meta, changes an ad, or
spends a cent, and no Meta Ads MCP is needed to use it.

Usage:
  exodus ads list [--sort x] [--since 90d] [--account act_…] [--limit n] [--json]
  exodus ads show <adId> [--json]

List flags:
  --sort <x>       cost-per-result (default, cheapest first) | spend | ctr
  --since 90d      The last 90 days instead of the ad's lifetime. 90d is the
                   only value — lifetime (the default) and the last 90 days are
                   the two windows the daily sync keeps.
  --account <id>   Narrow to one connected ad account, e.g. act_1234567890.
                   Leave it off and you get every connected account's ads in
                   one list, with an "account" column saying which is which.
  --limit <n>      How many ads to show, 1–200 (default 50)
  --json           Machine-readable JSON instead of the table

Reading the table:
  cost/result is the ranking column — the account's own result type (purchases,
  leads, appointments) priced per unit. Ads with no result yet sort last.
  "winner" marks an ad the brand has designated: confirmed (a human said so) or
  proposed (the rule put it forward, nobody has agreed yet).
  The "account" column only appears when the list spans several ad accounts —
  their currencies and result types differ, so don't compare across it blind.

Notes:
  • Scopes to your active brand (exodus brand current).
  • Numbers are as of the last daily sync — \`show\` prints the sync stamp.
  • Media links (image / video / poster) are fetchable URLs that redirect to a
    fresh file each time; they are not permanent links to save.
  • What this brand MEANS by a winner: exodus winners definition

Examples:
  exodus ads list
  exodus ads list --sort spend --limit 20
  exodus ads list --since 90d --sort ctr
  exodus ads list --account act_1234567890 --json
  exodus ads show 120210000000000
`.trim();

// ── Flags (pure) ──────────────────────────────────────────────────────────

export const SORTS = ["cost-per-result", "spend", "ctr"] as const;
export type AdSort = (typeof SORTS)[number];

export type AdWindow = "lifetime" | "last90d";

/** Flags that take the NEXT token as their value (so positional parsing skips it). */
export const VALUE_FLAGS = new Set(["sort", "since", "account", "limit"]);

export const MAX_LIMIT = 200;

export interface AdsListOptions {
  sort?: AdSort;
  window?: AdWindow;
  account?: string;
  limit?: number;
}

export type ParseResult =
  | { ok: true; options: AdsListOptions }
  | { ok: false; message: string };

/**
 * `--since` is deliberately NOT a free date range.
 *
 * The daily sync stores exactly two windows per ad — lifetime and the last 90
 * days — because those are the two Meta insight pulls it makes. Accepting
 * `--since 30d` and silently answering with 90-day numbers would be a wrong
 * answer that looks right, so anything but `90d` is refused with the reason.
 */
export function parseSince(raw: unknown): { ok: true; window?: AdWindow } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      ok: false,
      message:
        "--since needs a value, and 90d is the only one: the daily sync keeps the ad's lifetime (the default) and the last 90 days, nothing else.",
    };
  }
  const value = raw.trim().toLowerCase();
  if (value === "90d") return { ok: true, window: "last90d" };
  if (value === "lifetime" || value === "all") return { ok: true, window: "lifetime" };
  return {
    ok: false,
    message: `--since only accepts 90d (got "${raw.trim()}") — the daily sync keeps two windows per ad: the ad's lifetime, which is the default, and the last 90 days. There is no other range to ask for.`,
  };
}

export function parseAdsListFlags(flags: Record<string, string | boolean>): ParseResult {
  const options: AdsListOptions = {};

  const sortRaw = flags["sort"];
  if (sortRaw !== undefined) {
    if (typeof sortRaw !== "string" || !SORTS.includes(sortRaw.trim() as AdSort)) {
      return {
        ok: false,
        message: `--sort must be one of: ${SORTS.join(", ")} (got "${String(sortRaw)}")`,
      };
    }
    options.sort = sortRaw.trim() as AdSort;
  }

  const since = parseSince(flags["since"]);
  if (!since.ok) return { ok: false, message: since.message };
  if (since.window) options.window = since.window;

  const account = flags["account"];
  if (account !== undefined) {
    if (typeof account !== "string" || !account.trim()) {
      return { ok: false, message: "--account needs an ad account id, e.g. act_1234567890" };
    }
    options.account = account.trim();
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

/** Only what the caller actually asked for — server defaults own the rest. */
export function adsListQuery(options: AdsListOptions): string {
  const params = new URLSearchParams();
  if (options.sort) params.set("sort", options.sort);
  if (options.window) params.set("window", options.window);
  if (options.account) params.set("account", options.account);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ── Rendering (pure) ──────────────────────────────────────────────────────

const SORT_LABELS: Record<string, string> = {
  "cost-per-result": "cost per result (cheapest first)",
  spend: "spend (highest first)",
  ctr: "click-through rate (highest first)",
};

const WINDOW_LABELS: Record<string, string> = {
  lifetime: "lifetime",
  last90d: "last 90 days",
};

/** "confirmed" / "proposed" / "—" — a badge only a human's yes makes solid. */
export function winnerBadge(status: unknown): string {
  const clean = safeText(status);
  if (!clean) return "—";
  const value = clean.toLowerCase();
  if (value === "confirmed") return "✓ winner";
  if (value === "proposed") return "· proposed";
  return value;
}

export function costPerResultCell(ad: AdWindowStats): string {
  return displayOr(ad.costPerResultDisplay, ad.costPerResult, (n) => money(n, ad.currency));
}

export function spendCell(ad: AdWindowStats): string {
  return displayOr(ad.spendDisplay, ad.spend, (n) => money(n, ad.currency));
}

export function ctrCell(ad: AdWindowStats): string {
  return displayOr(ad.ctrDisplay, ad.ctr, percent);
}

export function cpcCell(ad: AdWindowStats): string {
  return displayOr(ad.cpcDisplay, ad.cpc, (n) => money(n, ad.currency));
}

/** "2,214 purchases" — a bare count is meaningless without the account's label. */
export function resultsCell(ad: AdWindowStats): string {
  const n = count(ad.results);
  const label = safeText(ad.resultType);
  if (n === "—") return label ? `— ${label}` : "—";
  return label ? `${n} ${label}` : n;
}

const NAME_WIDTH = 38;

export const AD_TABLE_HEADERS = [
  "cost/result",
  "spend",
  "ctr",
  "cpc",
  "results",
  "status",
  "winner",
  "name",
] as const;

const ACCOUNT_WIDTH = 24;

/**
 * `accountCell` is appended only when the rows span several accounts — see
 * `formatAdsList`. Without it a mixed list silently invites the reader to
 * compare a purchase in dollars against a lead in euros.
 */
export function adRow(ad: AdSummary, accountCell?: string): string[] {
  const row = [
    costPerResultCell(ad),
    spendCell(ad),
    ctrCell(ad),
    cpcCell(ad),
    resultsCell(ad),
    safeTextOr(ad.status, "—"),
    winnerBadge(ad.winnerStatus),
    truncate(ad.name, NAME_WIDTH) || safeTextOr(ad.adId, "—"),
  ];
  if (accountCell !== undefined) row.push(accountCell);
  return row;
}

/** The account's name for a table cell, falling back to its id. */
export function accountCellFor(
  accounts: AdAccountRef[],
  accountId: string | null | undefined,
): string {
  const match = accounts.find((a) => a.accountId === accountId);
  const name = truncate(match?.name, ACCOUNT_WIDTH);
  return name || safeTextOr(accountId, "—");
}

/** Headers for the table; the account column exists only in a mixed list. */
export function adTableHeaders(withAccount = false): string[] {
  return withAccount ? [...AD_TABLE_HEADERS, "account"] : [...AD_TABLE_HEADERS];
}

export function formatAdsTable(
  ads: AdSummary[],
  opts: { accounts?: AdAccountRef[]; showAccount?: boolean } = {},
): string {
  const accounts = opts.accounts ?? [];
  const showAccount = opts.showAccount === true;
  return table(
    adTableHeaders(showAccount),
    ads.map((ad) => adRow(ad, showAccount ? accountCellFor(accounts, ad.accountId) : undefined)),
  );
}

/** "Ground Co (act_123)" for the header line; the id alone when unnamed. */
export function accountLabel(
  accounts: AdAccountRef[],
  accountId: string | null | undefined,
): string {
  if (!accountId) return accounts.length === 1 ? accountLabel(accounts, accounts[0]?.accountId) : "";
  const match = accounts.find((a) => a.accountId === accountId);
  const name = safeText(match?.name);
  const id = safeText(accountId);
  return name ? `${name} (${id})` : id;
}

/**
 * With no `--account`, a brand with several connected accounts gets ads from
 * ALL of them in one list. Naming the first ad's account in the heading would
 * be a wrong answer that looks right, so say how many accounts are in play,
 * list them, and give every row an `account` column.
 */
export function formatAdsList(data: AdsListResponse, options: AdsListOptions): string[] {
  const ads = Array.isArray(data.ads) ? data.ads : [];
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const windowLabel = WINDOW_LABELS[data.window ?? options.window ?? "lifetime"] ?? "lifetime";
  const sortLabel = SORT_LABELS[data.sort ?? options.sort ?? "cost-per-result"] ?? "cost per result";
  const mixed = accounts.length > 1 && !options.account;
  const account = mixed
    ? ""
    : accountLabel(accounts, options.account ?? ads[0]?.accountId ?? null);

  if (ads.length === 0) {
    const lines = [
      account
        ? `No synced ads for ${account} in the ${windowLabel} window.`
        : `No synced ads for this brand yet.`,
      "The daily sync fills this in once the ad account is connected on the dashboard (Settings → Meta).",
    ];
    if (accounts.length > 1) {
      lines.push("");
      lines.push("Connected ad accounts:");
      for (const a of accounts) lines.push(accountLine(a));
    }
    return lines;
  }

  const scope = mixed ? `All ${accounts.length} connected accounts` : account || null;
  const header = [`Ads (${ads.length})`, scope, `${windowLabel} · sorted by ${sortLabel}`]
    .filter(Boolean)
    .join(" — ");

  const lines = [header];
  if (mixed) {
    lines.push("");
    for (const a of accounts) lines.push(accountLine(a));
  }
  lines.push("", formatAdsTable(ads, { accounts, showAccount: mixed }), "");

  const total = typeof data.count === "number" ? data.count : ads.length;
  if (total > ads.length) {
    lines.push(`Showing ${ads.length} of ${total}. Raise --limit (max ${MAX_LIMIT}) for more.`);
  }
  lines.push("Open one:  exodus ads show <adId>");
  if (mixed) {
    const first = accounts.find((a) => !!a.accountId)?.accountId;
    if (first) lines.push(`One account at a time:  exodus ads list --account ${safeText(first)}`);
  } else if (accounts.length > 1) {
    const others = accounts
      .map((a) => safeText(a.accountId))
      .filter((id) => !!id && id !== safeText(options.account ?? ads[0]?.accountId));
    if (others.length > 0) {
      lines.push(`Other connected accounts: ${others.join(", ")} (--account)`);
    }
  }
  return lines;
}

function windowBlock(label: string, stats: AdWindowStats | null | undefined): string[] {
  if (!stats) return [`${label}`, "  (no numbers recorded for this window)"];
  return [
    label,
    `  results:      ${resultsCell(stats)}`,
    `  cost/result:  ${costPerResultCell(stats)}`,
    `  spend:        ${spendCell(stats)}`,
    `  ctr:          ${ctrCell(stats)}`,
    `  cpc:          ${cpcCell(stats)}`,
    `  impressions:  ${count(stats.impressions)} · clicks ${count(stats.clicks)}`,
  ];
}

/**
 * Body copy is the one place a newline survives — an ad's copy is written in
 * lines and reads wrong as one blob — so each line is scrubbed on its own.
 */
function copyBlock(label: string, text: unknown): string[] {
  const clean = safeText(text);
  if (!clean) return [`${label}`, "  (none on the ad)"];
  return [label, ...clean.split("\n").map((line) => `  ${safeText(line)}`)];
}

export function formatAdShow(ad: AdShowResponse, apiBase: string): string[] {
  const lines: string[] = [];
  lines.push(`${safeTextOr(ad.name, "(unnamed ad)")}  —  ${safeTextOr(ad.adId, "(no id)")}`);
  lines.push(
    `status ${safeTextOr(ad.status, "—")} · format ${safeTextOr(ad.format, "—")} · winner ${winnerBadge(ad.winnerStatus)}`,
  );
  lines.push(`account ${safeTextOr(ad.accountId, "—")} · created ${dateOrDash(ad.createdTime)}`);
  const objective = safeText(ad.campaign?.objective);
  const goal = safeText(ad.adset?.optimizationGoal);
  lines.push(`campaign: ${safeTextOr(ad.campaign?.name, "—")}${objective ? ` (${objective})` : ""}`);
  lines.push(`ad set:   ${safeTextOr(ad.adset?.name, "—")}${goal ? ` (${goal})` : ""}`);

  lines.push("");
  lines.push(...copyBlock("Headline", ad.headline));
  lines.push("");
  lines.push(...copyBlock("Body copy", ad.bodyText));

  lines.push("");
  lines.push(...windowBlock("Lifetime", ad.lifetime ?? ad));
  lines.push("");
  lines.push(...windowBlock("Last 90 days", ad.last90d));

  lines.push("");
  lines.push("Media");
  const media = ad.media ?? {};
  const image = mediaUrl(apiBase, media.image);
  const video = mediaUrl(apiBase, media.video);
  const poster = mediaUrl(apiBase, media.poster);
  if (!image && !video && !poster) {
    lines.push("  (no creative file stored for this ad)");
  } else {
    if (image) lines.push(`  image:  ${image}`);
    if (video) lines.push(`  video:  ${video}`);
    if (poster) lines.push(`  poster: ${poster}`);
    lines.push("  Each link redirects to a fresh file — fetch it now, don't save the URL.");
  }

  lines.push("");
  const fb = ad.commentCounts?.facebook ?? 0;
  const ig = ad.commentCounts?.instagram ?? 0;
  lines.push(`Comments — ${count(fb)} on Facebook · ${count(ig)} on Instagram`);
  if ((typeof fb === "number" ? fb : 0) + (typeof ig === "number" ? ig : 0) > 0) {
    lines.push(`  Read them:  exodus comments list --ad ${ad.adId ?? "<adId>"}`);
  }

  lines.push("");
  lines.push(`Synced ${dateOrDash(ad.syncedAt)} — every number above is as of that daily sync.`);
  return lines;
}

// ── Flows (network, dependency-injected) ──────────────────────────────────

const LIST_PATH = "/api/v2/ads";

export async function listFlow(
  options: AdsListOptions,
  json: boolean,
  deps: MetaAdsDeps,
): Promise<FlowResult> {
  const res = await deps.get(`${LIST_PATH}${adsListQuery(options)}`);
  const err = errorFor(res, "ads list", json, deps, (id) =>
    `exodus ads list --account ${id}`,
  );
  if (err) return err;
  const data = (res.data ?? {}) as AdsListResponse;
  if (json) return { code: 0, lines: [JSON.stringify(data)] };
  return { code: 0, lines: formatAdsList(data, options) };
}

export async function showFlow(
  adId: string,
  json: boolean,
  deps: MetaAdsDeps,
): Promise<FlowResult> {
  const res = await deps.get(`${LIST_PATH}/${encodeURIComponent(adId)}`);
  if (!res.ok && res.status === 404 && !json) {
    const unsupported = errorFor(res, "ads show", json, deps, (id) => `exodus ads list --account ${id}`);
    if (unsupported && unsupported.lines[0]?.startsWith("this server does not support")) {
      return unsupported;
    }
    return {
      code: 1,
      lines: [
        `No synced ad matches "${adId}".`,
        "Ad ids come from `exodus ads list` — the sync only stores ads from connected accounts.",
      ],
    };
  }
  const err = errorFor(res, "ads show", json, deps, (id) => `exodus ads list --account ${id}`);
  if (err) return err;
  const ad = (res.data ?? {}) as AdShowResponse;
  if (json) return { code: 0, lines: [JSON.stringify(ad)] };
  return { code: 0, lines: formatAdShow(ad, deps.apiUrl()) };
}

// ── Dispatch ──────────────────────────────────────────────────────────────

/** Positionals after the `ads` command word, skipping every flag value. */
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

function usageError(message: string, usage: string): never {
  console.error(`Error: ${message}`);
  console.log(`Usage: ${usage}`);
  process.exit(1);
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  const [sub, ...rest] = parsePositional();
  const json = flags["json"] === true;

  if (!sub || sub === "help") {
    console.log(helpText);
    return;
  }

  if (sub === "list") {
    const parsed = parseAdsListFlags(flags);
    if (!parsed.ok) {
      usageError(parsed.message, "exodus ads list [--sort x] [--since 90d] [--account act_…] [--limit n] [--json]");
    }
    return printResult(await listFlow(parsed.options, json, defaultMetaAdsDeps));
  }

  if (sub === "show") {
    const adId = rest[0];
    if (!adId) usageError("ads show needs an ad id.", "exodus ads show <adId> [--json]");
    return printResult(await showFlow(adId, json, defaultMetaAdsDeps));
  }

  console.error(`Unknown subcommand: "${sub}"\n`);
  console.log(helpText);
  process.exit(1);
}
