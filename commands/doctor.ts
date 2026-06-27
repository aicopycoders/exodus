// exodus/commands/doctor.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { apiGet, apiGetDashboard, getApiUrl } from "../lib/client.js";
import { findWorkspaceRoot } from "../lib/state.js";
import {
  detectLayout,
  listBrandDirs,
  resolveActiveBrand,
  brandStateDir,
} from "../lib/layout.js";
import { auth401Hint, isPlaceholderApiUrl } from "../lib/backend-hint.js";
import {
  compareVersions,
  readPackageVersion,
} from "../lib/release.js";

export const helpText = `
exodus doctor — Preflight checks for your local Claude Code setup

Usage:
  exodus doctor

Runs through every check (Node version, claude CLI, .env, API key, Google
Drive on the dashboard, dashboard auth). Install problems show ✅ / ❌;
expected brand setup (primer, profile depth) shows as cyan ▸ next-steps, not
errors. On any red, prints exactly what to do about it.

Exit code: 0 when the install is healthy (next-steps don't fail it), 1 on any red.
`.trim();

export interface CheckResult {
  ok: boolean;
  /**
   * Non-blocking advisory. When `ok` is true and `warn` is true, the check
   * renders yellow and still prints its `fix`/note, but does NOT count toward
   * the failure tally or flip the exit code. Used when something is expected
   * in one supported setup but absent in another — e.g. the standalone
   * `claude` CLI is not on PATH inside the Claude Desktop app's Code tab.
   */
  warn?: boolean;
  /**
   * Brand-content "next step", not an install failure. When `ok` is true and
   * `todo` is true the check renders as a cyan next-step (never a red ❌), is
   * excluded from the failure tally + exit code, and is surfaced in the
   * post-install "next steps" block. Used for setup a brand-new brand always
   * needs (the primer/foundation, brand-profile depth) — expected, not broken.
   * A fresh install showing these is healthy, so they must not read as errors.
   */
  todo?: boolean;
  label: string;
  detail?: string;
  fix?: string;
}

export function checkNodeVersion(): CheckResult {
  const version = process.versions.node;
  const major = parseInt(version.split(".")[0], 10);
  if (major >= 20) {
    return { ok: true, label: "Node.js", detail: `v${version} detected` };
  }
  return {
    ok: false,
    label: "Node.js",
    detail: `v${version} is too old`,
    fix: "install Node 20+ from https://nodejs.org (LTS) — see the “If Node isn't installed” section of the README",
  };
}

export function checkClaudeCli(): CheckResult {
  try {
    const out = execSync("which claude", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (out) return { ok: true, label: "Claude CLI", detail: `installed at ${out}` };
    throw new Error("empty output");
  } catch {
    // Not a failure. The Claude Desktop app's Code tab runs Claude Code without
    // the standalone `claude` binary on PATH (and `which` itself may be absent
    // on Windows). Surface as a non-blocking warning so Desktop users don't get
    // a false red; terminal users still get the nudge to install it.
    return {
      ok: true,
      warn: true,
      label: "Claude CLI",
      detail:
        "not on PATH — expected if you're in the Claude Desktop app; only terminal users need the standalone CLI",
      fix: "Terminal users: `curl -fsSL https://claude.ai/install.sh | bash` (Mac/Linux) or the Windows quickstart at https://code.claude.com/docs/en/quickstart",
    };
  }
}

export function checkEnvFile(): CheckResult {
  // Resolve the install root rather than assuming cwd — in the multi-brand
  // layout doctor often runs from inside a brand subfolder, where there is
  // (correctly) no .env.
  const envPath = path.join(findWorkspaceRoot(), ".env");
  if (!fs.existsSync(envPath)) {
    return {
      ok: false,
      label: ".env",
      fix: "run `npx @aicopycoders/exodus init`, then paste your dashboard .env block (Settings → Claude Code → Copy .env block)",
    };
  }
  const content = fs.readFileSync(envPath, "utf8");
  const hasUrl = /EXODUS_API_URL\s*=/.test(content);
  const hasKey = /EXODUS_API_KEY\s*=/.test(content);
  const urlValue = content.match(/EXODUS_API_URL\s*=\s*(\S+)/)?.[1] ?? "";
  if (hasUrl && isPlaceholderApiUrl(urlValue)) {
    return {
      ok: false,
      label: ".env",
      detail: "EXODUS_API_URL is still the placeholder / not set",
      fix: "set EXODUS_API_URL from your install instruction (xo.copycoders.ai → accomplished-tapir-106; dev.xo.copycoders.ai → good-cod-360)",
    };
  }
  if (hasUrl && hasKey) {
    return { ok: true, label: ".env", detail: "present with required keys" };
  }
  return {
    ok: false,
    label: ".env",
    detail: "missing EXODUS_API_URL or EXODUS_API_KEY",
    fix: "run `npx @aicopycoders/exodus init`, then paste your dashboard .env block (Settings → Claude Code → Copy .env block)",
  };
}

/**
 * Resolve which brand the current API key targets and confirm the brand has
 * full Genesis foundation (audienceConcerns + 4 awareness primers). Without
 * a complete foundation, every Genesis run will be rejected at the Convex
 * gate — surfacing it here saves a round-trip through the pipeline.
 */
export async function checkWhoami(): Promise<CheckResult> {
  try {
    const { apiGet } = await import("../lib/client.js");
    const res = await apiGet<{
      workspaceSlug: string | null;
      workspaceName: string | null;
      foundationReady: boolean;
      foundationMissing: string[];
    }>("/api/v2/whoami");
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        let host = getApiUrl();
        try {
          host = new URL(getApiUrl()).host;
        } catch {
          // keep the raw value as the host label
        }
        return {
          ok: false,
          label: "Brand resolution",
          detail: `API key rejected by ${host} (HTTP ${res.status})`,
          fix: auth401Hint(getApiUrl()),
        };
      }
      return {
        ok: false,
        label: "Brand resolution",
        detail: `whoami returned HTTP ${res.status}`,
        fix: "verify EXODUS_API_KEY in .env is valid + workspace-bound",
      };
    }
    const d = res.data;
    if (!d.workspaceSlug) {
      return {
        ok: false,
        label: "Brand resolution",
        detail: "API key did not resolve to a workspace",
        fix: "ask an admin to mint a brand-scoped API key in Settings → Brands → API keys",
      };
    }
    if (!d.foundationReady) {
      // A brand-new brand has no primer yet — that's the expected FIRST setup
      // step, not an install failure. Surface it as a next-step (cyan, exit 0)
      // so a fresh install doesn't look broken.
      return {
        ok: true,
        todo: true,
        label: "Brand primer",
        detail: `${d.workspaceSlug} has no primer yet — set one up to unlock the pipelines`,
        fix: `say "exodus, set up my brand primer" (or run \`npx @aicopycoders/exodus foundation\` from a source doc, or paste it at /settings?tab=brands&brand=${d.workspaceSlug})`,
      };
    }
    return {
      ok: true,
      label: "Brand resolution",
      detail: `${d.workspaceName} (${d.workspaceSlug}) — foundation ready`,
    };
  } catch (err) {
    return {
      ok: false,
      label: "Brand resolution",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Detect when the local active brand pointer disagrees with the brand the API
 * key is naturally bound to. Without this check, an admin who runs `brand use
 * flow` against a key minted for grounding-co silently produces grounding-co
 * output (X-Active-Brand only overrides for admin keys; member keys ignore it,
 * but admin keys override silently). The fix is always one of two commands.
 */
export async function checkActiveBrandMatch(): Promise<CheckResult> {
  const resolved = resolveActiveBrand();
  if (!resolved.slug) {
    return {
      ok: true,
      label: "Active brand",
      detail: "no local override — using key's default brand",
    };
  }
  const source =
    resolved.source === "folder" ? "from brand folder" : "from `brand use`";

  // A local brand that differs from the key's bound brand is EXPECTED now —
  // one account key serves every brand the user owns. The real failure mode
  // is a local brand the key can't actually access (renamed/deleted brand,
  // or a brand someone else owns): the server silently ignores the header
  // and every command targets the key default instead. Verify against the
  // accessible-brands list.
  let res;
  try {
    res = await apiGetDashboard<{
      brands?: Array<{ slug: string; name: string }>;
    }>("/api/brands/mine", { timeoutMs: 10_000 });
  } catch (err) {
    return {
      ok: true,
      label: "Active brand",
      detail: `${resolved.slug} (${source}) — access check skipped: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!res.ok || !Array.isArray(res.data?.brands)) {
    return {
      ok: true,
      label: "Active brand",
      detail: `${resolved.slug} (${source}) — access check skipped (HTTP ${res.status})`,
    };
  }
  const match = res.data.brands.find((b) => b.slug === resolved.slug);
  if (match) {
    return {
      ok: true,
      label: "Active brand",
      detail: `${resolved.slug} (${source}) — accessible`,
    };
  }
  const available =
    res.data.brands.map((b) => b.slug).join(", ") || "(none)";
  return {
    ok: false,
    label: "Active brand",
    detail: `local active brand "${resolved.slug}" (${source}) is NOT in your accessible list — the server ignores it and every command silently targets the key's default brand. available: ${available}`,
    fix: `run \`npx @aicopycoders/exodus brand use <slug>\` with one of your brands, or \`npx @aicopycoders/exodus brand clear\` to fall back to the key default`,
  };
}

// Subtrees that ship in the compiled CLI. lib/ was missing pre-PR-#13: stale
// auth/transport code surfaced as 401s on exodus image-ads while raw curl with
// the same key worked, and doctor reported green because it only walked
// commands/. bin/ is included for the same reason.
const FRESHNESS_SUBTREES = ["commands", "lib", "bin"] as const;

function newestMtimeIn(dir: string): number {
  let max = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      max = Math.max(max, newestMtimeIn(full));
    } else {
      max = Math.max(max, stat.mtimeMs);
    }
  }
  return max;
}

export function checkExodusDistFreshness(pkgRootOverride?: string): CheckResult {
  // Find the exodus package root — doctor.ts lives at <root>/commands/doctor.ts
  // at source time, <root>/dist/commands/doctor.js when running compiled. Walk
  // up from this file's URL to find the nearest package.json. Tests can
  // override with a fixture pkgRoot.
  let pkgRoot: string;
  if (pkgRootOverride) {
    pkgRoot = pkgRootOverride;
  } else {
    // fileURLToPath decodes %20 etc.; .pathname does NOT, so an install path
    // with a space (e.g. "~/Cursor Projects/") resolved to a bogus directory
    // and the dist/ check failed → false "build missing" + exit 1 (Max R3 #2).
    const here = path.dirname(fileURLToPath(import.meta.url));
    pkgRoot = here;
    while (pkgRoot !== "/" && !fs.existsSync(path.join(pkgRoot, "package.json"))) {
      pkgRoot = path.dirname(pkgRoot);
    }
  }

  const distBase = path.join(pkgRoot, "dist");
  if (!FRESHNESS_SUBTREES.some((s) => fs.existsSync(path.join(pkgRoot, s)))) {
    return { ok: true, label: "Exodus CLI build", detail: "running from installed package" };
  }
  if (!fs.existsSync(distBase)) {
    return {
      ok: false,
      label: "Exodus CLI build",
      detail: "dist/ missing",
      fix: "run `cd exodus && npm run build` (or `npm install` if in a fresh clone)",
    };
  }

  const stale: string[] = [];
  let worstLagMs = 0;
  for (const sub of FRESHNESS_SUBTREES) {
    const srcRoot = path.join(pkgRoot, sub);
    const distRoot = path.join(distBase, sub);
    if (!fs.existsSync(srcRoot) || !fs.existsSync(distRoot)) continue;
    const srcMtime = newestMtimeIn(srcRoot);
    const distMtime = newestMtimeIn(distRoot);
    // 5s grace to avoid clock-skew false positives right after a build
    if (srcMtime > distMtime + 5000) {
      stale.push(sub);
      worstLagMs = Math.max(worstLagMs, srcMtime - distMtime);
    }
  }

  if (stale.length > 0) {
    const lagSec = Math.round(worstLagMs / 1000);
    return {
      ok: false,
      label: "Exodus CLI build",
      detail: `source newer than dist in ${stale.join(", ")} (lag ${lagSec}s) — CLI ships stale code`,
      fix: "run `cd exodus && npm run build` to rebuild dist",
    };
  }
  return { ok: true, label: "Exodus CLI build", detail: "dist up-to-date" };
}

const NPM_REGISTRY = "https://registry.npmjs.org/@aicopycoders/exodus/latest";

/**
 * Network-tolerant version-currency check. Compares the installed exodus
 * version to the latest published npm release and nudges the user toward
 * update when they're behind. Always a non-blocking advisory:
 *  - up to date         → green
 *  - behind             → yellow with the fix command (never red)
 *  - offline / API err  → yellow (we couldn't check), never red
 *
 * Tests can inject a fixture pkg root via `pkgRootOverride` and stub the
 * fetch implementation via `fetchImpl`.
 */
export async function checkVersionCurrency(
  pkgRootOverride?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckResult> {
  let pkgRoot: string;
  if (pkgRootOverride) {
    pkgRoot = pkgRootOverride;
  } else {
    const here = path.dirname(fileURLToPath(import.meta.url));
    pkgRoot = here;
    while (pkgRoot !== "/" && !fs.existsSync(path.join(pkgRoot, "package.json"))) {
      pkgRoot = path.dirname(pkgRoot);
    }
  }

  const local = readPackageVersion(pkgRoot);

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    let res: Response;
    try {
      res = await fetchImpl(NPM_REGISTRY, { signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const latest = (await res.json()).version as string;
    if (compareVersions(local, latest) >= 0) {
      return { ok: true, label: "Exodus version", detail: `${local} — up to date` };
    }
    return {
      ok: true,
      warn: true,
      label: "Exodus version",
      detail: `${local} installed, ${latest} available`,
      fix: "run `npx @aicopycoders/exodus@latest init` to update (or `npm update -g @aicopycoders/exodus`)",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: true,
      warn: true,
      label: "Exodus version",
      detail: `installed ${local} — couldn't reach npm (${message.slice(0, 80)})`,
    };
  }
}

interface PreflightResponse {
  workspace: { id: string; name: string; slug: string } | null;
  drive: { connected: boolean; email: string | null };
  // Optional so older server builds (which only returned workspace + drive)
  // don't trip the typecheck. When absent, the kie-key check degrades to a
  // soft pass rather than crashing the doctor.
  providers?: {
    kie: boolean;
    anthropic: boolean;
    openrouter: boolean;
    // Optional so older server builds (pre-genesis-doctor) still typecheck;
    // when absent the Genesis check soft-skips.
    genesis?: boolean;
    // Optional so older server builds (pre-memes-V1.1) still typecheck; when
    // absent the Imgflip check soft-skips.
    imgflip?: boolean;
  };
}

export async function checkApiAndDrive(): Promise<CheckResult[]> {
  let res;
  try {
    res = await apiGet<PreflightResponse>("/api/v2/doctor/preflight");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      {
        ok: false,
        label: "Dashboard API key",
        detail: `request failed: ${message}`,
        fix: "check your .env has EXODUS_API_URL and EXODUS_API_KEY, then re-run",
      },
      {
        ok: false,
        label: "Google Drive (dashboard)",
        detail: "skipped — API key check failed",
      },
    ];
  }
  if (!res.ok) {
    return [
      {
        ok: false,
        label: "Dashboard API key",
        detail: `HTTP ${res.status}`,
        fix: "regenerate at Settings → API Keys, then paste the new .env block (or re-run `npx @aicopycoders/exodus init`)",
      },
      {
        ok: false,
        label: "Google Drive (dashboard)",
        detail: "skipped — API key check failed",
      },
    ];
  }
  const { workspace, drive, providers } = res.data;
  const apiResult: CheckResult = workspace
    ? {
        ok: true,
        label: "Dashboard API key",
        detail: `connected to workspace: ${workspace.name}`,
      }
    : {
        ok: false,
        label: "Dashboard API key",
        detail: "no workspace found for this key",
        fix: "contact support — your workspace may not be set up",
      };

  const driveResult: CheckResult = drive.connected
    ? {
        ok: true,
        label: "Google Drive (dashboard)",
        detail: `connected as ${drive.email ?? "unknown email"}`,
      }
    : {
        ok: false,
        label: "Google Drive (dashboard)",
        fix: "go to Settings → Google Drive on the dashboard and click Connect",
      };

  const results: CheckResult[] = [apiResult, driveResult];

  // kie.ai key is required for image renders (Nano Banana via kie.ai) used by
  // the creative-suite, template, and meme pipelines. Surface it here as a
  // Day-1 check so workshop students don't
  // discover the gap mid-run. Only checked when the server returns the
  // `providers` field — older server builds (pre-images-batch-cli) won't
  // include it, and we soft-skip rather than fail.
  if (providers) {
    results.push(
      providers.kie
        ? {
            ok: true,
            label: "kie.ai key (image renders)",
            detail: "configured for the active user",
          }
        : {
            ok: false,
            label: "kie.ai key (image renders)",
            detail: "no kie.ai key found for the active user",
            fix: "add it at Settings → Keys on the dashboard (image renders will fail without it)",
          },
    );

    // LLM key — every copy and image pipeline needs an OpenRouter OR Anthropic
    // key to write the copy / image prompts. Previously doctor checked only
    // kie, so a user with kie-but-no-LLM-key saw all green and still failed at
    // run time on a missing-LLM-key error.
    const hasLlm = providers.openrouter || providers.anthropic;
    results.push(
      hasLlm
        ? {
            ok: true,
            label: "LLM key (OpenRouter or Anthropic)",
            detail: `configured: ${providers.openrouter ? "OpenRouter" : "Anthropic"}`,
          }
        : {
            ok: false,
            label: "LLM key (OpenRouter or Anthropic)",
            detail: "no OpenRouter or Anthropic key found for the active user",
            fix: "add an OpenRouter or Anthropic key at Settings → Keys (copy + image pipelines fail without one)",
          },
    );

    // Genesis key — the copy writer (genesis) and the native/copy-derived image
    // engines route writing through Genesis. Onboarding auto-links this per
    // member, so a missing one usually means the auto-link hasn't run yet.
    // Soft-skip when the server build predates this field.
    if (providers.genesis !== undefined) {
      results.push(
        providers.genesis
          ? {
              ok: true,
              label: "Genesis key (copy writing)",
              detail: "configured for the active user",
            }
          : {
              ok: false,
              label: "Genesis key (copy writing)",
              detail: "no Genesis key linked for the active user",
              fix: "re-run onboarding or contact support — Genesis auto-links on first sign-in",
            },
      );
    }

    // Imgflip login — classic (layer-1) memes render on the member's own
    // Imgflip account (memes V1.1, strict BYOK). AI memes only need kie + LLM,
    // so a missing login is a warning-shaped failure, not a blocker for the
    // rest of the toolset. Soft-skip when the server build predates the field.
    if (providers.imgflip !== undefined) {
      results.push(
        providers.imgflip
          ? {
              ok: true,
              label: "Imgflip login (classic memes)",
              detail: "configured for the active user",
            }
          : {
              // Optional — only classic (layer-1) memes need it; AI memes work
              // without it. Non-blocking warning, never a red failure.
              ok: true,
              warn: true,
              label: "Imgflip login (classic memes — optional)",
              detail: "not set — classic meme formats need it; AI memes are unaffected",
              fix: "add your Imgflip username/password at Settings → Keys if you want classic meme formats",
            },
      );
    }
  }

  return results;
}

interface DashboardPingResponse {
  ok?: boolean;
  error?: string;
  hint?: string;
}

/**
 * Probe the dashboard's Bearer-auth path.
 *
 * The standard Convex preflight (checkApiAndDrive) goes through `apiGet`,
 * which has always attached the Authorization header. CLI versions before
 * 2026.4.28.00 had an `apiPostDashboard` helper that DIDN'T attach the
 * header — so dashboard-routed pipelines (creative-suite, template)
 * would 401 while doctor showed all green. This check exercises the dashboard
 * path end-to-end so a stale install fails loud here instead of in a run.
 */
export async function checkDashboardAuth(): Promise<CheckResult> {
  let res;
  try {
    res = await apiGetDashboard<DashboardPingResponse>("/api/doctor/dashboard-ping");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      label: "Dashboard auth (dashboard-routed pipelines)",
      detail: `request failed: ${message}`,
      fix: "check your network and EXODUS_DASHBOARD_URL, then re-run",
    };
  }
  if (res.ok) {
    return {
      ok: true,
      label: "Dashboard auth (dashboard-routed pipelines)",
      detail: "Bearer token reaches dashboard route",
    };
  }
  if (res.status === 401) {
    const hint = res.data?.hint;
    return {
      ok: false,
      label: "Dashboard auth (dashboard-routed pipelines)",
      detail: res.data?.error ?? "401 from /api/doctor/dashboard-ping",
      fix: hint ?? "run `npx @aicopycoders/exodus@latest init` to update the CLI — older releases skipped the Bearer header on dashboard routes",
    };
  }
  return {
    ok: false,
    label: "Dashboard auth (image-ads path)",
    detail: `HTTP ${res.status}`,
    fix: "report to support — dashboard auth probe returned an unexpected status",
  };
}

function printResult(r: CheckResult): void {
  const icon = r.todo
    ? "\x1b[36m▸\x1b[0m" // cyan next-step — expected setup, not an error
    : r.ok && r.warn
      ? "\x1b[33m⚠️\x1b[0m"
      : r.ok
        ? "\x1b[32m✅\x1b[0m"
        : "\x1b[31m❌\x1b[0m";
  const detail = r.detail ? ` — ${r.detail}` : "";
  console.log(`${icon} ${r.label}${detail}`);
  if ((!r.ok || r.warn || r.todo) && r.fix) {
    console.log(`   → ${r.fix}`);
  }
}

/**
 * Report which folder layout this install uses and, for multi-brand (v2)
 * installs, whether each brand folder is healthy (has its brand profile).
 * Informational + soft: a missing profile is a warn, not a failure — `exodus
 * update` or `brand use` regenerates it.
 */
export function checkLayout(): CheckResult {
  const root = findWorkspaceRoot();
  const layout = detectLayout(root);
  if (layout === "legacy") {
    return {
      ok: true,
      label: "Layout",
      detail:
        "single-brand (legacy) — run `npx @aicopycoders/exodus migrate` to switch to the multi-brand layout",
    };
  }
  const brands = listBrandDirs(root);
  const resolved = resolveActiveBrand();
  const active = resolved.slug
    ? `active: ${resolved.slug} (${resolved.source === "folder" ? "from brand folder" : "from \`brand use\`"})`
    : "active: key default";
  if (brands.length === 0) {
    return {
      ok: true,
      warn: true,
      label: "Layout",
      detail: `multi-brand — no brand folders yet; ${active}`,
      fix: "run `npx @aicopycoders/exodus@latest init` (or `npx @aicopycoders/exodus brand use <slug>`) to create your brand folders",
    };
  }
  const missingProfiles = brands.filter(
    (b) => !fs.existsSync(path.join(b.dir, "state", "brand-profile.md")),
  );
  if (missingProfiles.length > 0) {
    return {
      ok: true,
      warn: true,
      label: "Layout",
      detail: `multi-brand, ${brands.length} brand folder(s); ${active}; missing brand profile in: ${missingProfiles.map((b) => b.slug).join(", ")}`,
      fix: "run `npx @aicopycoders/exodus@latest init` to refresh every brand folder's profile",
    };
  }
  return {
    ok: true,
    label: "Layout",
    detail: `multi-brand, ${brands.length} brand folder(s) [${brands.map((b) => b.slug).join(", ")}]; ${active}`,
  };
}

export function checkBrandProfileGenesisDepth(): CheckResult {
  // Brand-profile.md is split into an auto section (rewritten by `brand
  // use`) and a manual section (per-brand depth — proven angles, segments,
  // ICP elaboration). Until the manual section is filled in for a brand,
  // it carries the placeholder banner. Genesis output stays generic in
  // that state. We surface the gap as a soft warning so admins see it.
  const stateDir = brandStateDir();
  const filePath = path.join(stateDir, "brand-profile.md");
  const rel = path.relative(findWorkspaceRoot(), filePath) || filePath;
  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      label: "brand-profile",
      detail: `${rel} is missing`,
      fix: "run `npx @aicopycoders/exodus brand use <slug>` to generate it",
    };
  }
  const contents = fs.readFileSync(filePath, "utf-8");
  if (contents.includes("exodus:genesis-depth-pending")) {
    // Placeholder depth is the normal state for a freshly-created brand — a
    // next-step to sharpen output, not an install failure. Cyan, exit 0.
    return {
      ok: true,
      todo: true,
      label: "Brand-profile depth",
      detail:
        "manual section is still on the placeholder — fill it in so Genesis output isn't generic",
      fix: `open ${rel} and replace the TO-BE-FILLED-IN sections (Proven Angles, Segments, Key Differentiators, ICP Notes) with this brand's tested patterns`,
    };
  }
  return {
    ok: true,
    label: "brand-profile (Genesis depth)",
    detail: "manual section is filled in",
  };
}

export async function run(_flags: Record<string, string | boolean>): Promise<void> {
  const results: CheckResult[] = [];

  // Local checks first
  results.push(checkNodeVersion());
  results.push(checkClaudeCli());
  results.push(checkEnvFile());
  results.push(checkLayout());
  results.push(checkExodusDistFreshness());
  results.push(checkBrandProfileGenesisDepth());

  // Network checks
  const apiAndDrive = await checkApiAndDrive();
  results.push(...apiAndDrive);
  results.push(await checkDashboardAuth());
  results.push(await checkWhoami());
  results.push(await checkActiveBrandMatch());
  results.push(await checkVersionCurrency());

  // Print
  for (const r of results) printResult(r);

  const failures = results.filter((r) => !r.ok).length;
  const warnings = results.filter((r) => r.ok && r.warn && !r.todo).length;
  const todos = results.filter((r) => r.ok && r.todo);
  console.log("");

  // Real install failures block the user — surface loudly and exit 1.
  if (failures > 0) {
    console.log(
      `${failures} ${failures === 1 ? "issue" : "issues"} found. Fix the item(s) above and run \`exodus doctor\` again.`
    );
    process.exit(1);
  }

  // Install is healthy. Brand-content "todo" items are expected on a fresh
  // brand and must NOT read as errors — they become positive next steps.
  const warnNote =
    warnings > 0
      ? ` (${warnings} non-blocking ${warnings === 1 ? "warning" : "warnings"} above — safe to ignore)`
      : "";
  console.log(`✅ Install healthy — Exodus + Genesis are installed and connected.${warnNote}`);

  if (todos.length > 0) {
    const needsPrimer = todos.some((t) => /primer/i.test(t.label));
    console.log("");
    console.log("To start creating — in THIS folder:");
    console.log(
      "  1. Restart Claude Code here (or run /clear) so the Exodus + Genesis skills load.",
    );
    if (needsPrimer) {
      console.log(
        "  2. Set up your brand primer first — it unlocks every pipeline:",
      );
      console.log('       say  "exodus, set up my brand primer"');
    }
    const rest = todos.filter((t) => !/primer/i.test(t.label));
    if (rest.length > 0) {
      console.log("");
      console.log("  Then, when you're ready (optional):");
      for (const t of rest) {
        console.log(`    • ${t.label}${t.detail ? ` — ${t.detail}` : ""}`);
      }
    }
  } else {
    console.log("You're ready to run pipelines.");
  }
  process.exit(0);
}
