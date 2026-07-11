import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { apiGet, apiGetDashboard, getApiUrl } from "../lib/client.js";
import { findWorkspaceRoot } from "../lib/state.js";
import { detectLayout, listBrandDirs, resolveActiveBrand, brandStateDir, } from "../lib/layout.js";
import { auth401Hint, isPlaceholderApiUrl } from "../lib/backend-hint.js";
import { compareVersions, readPackageVersion, } from "../lib/release.js";
import { channelOf, pkgRef, stampChannel } from "../lib/channel.js";
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
export function checkNodeVersion() {
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
export function checkClaudeCli() {
    try {
        const out = execSync("which claude", { stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
        if (out)
            return { ok: true, label: "Claude CLI", detail: `installed at ${out}` };
        throw new Error("empty output");
    }
    catch {
        return {
            ok: true,
            warn: true,
            label: "Claude CLI",
            detail: "not on PATH — expected if you're in the Claude Desktop app; only terminal users need the standalone CLI",
            fix: "Terminal users: `curl -fsSL https://claude.ai/install.sh | bash` (Mac/Linux) or the Windows quickstart at https://code.claude.com/docs/en/quickstart",
        };
    }
}
export function checkEnvFile() {
    const envPath = path.join(findWorkspaceRoot(), ".env");
    if (!fs.existsSync(envPath)) {
        return {
            ok: false,
            label: ".env",
            fix: `run \`npx ${pkgRef()} init\`, then paste your dashboard .env block (Settings → Claude Code → Copy .env block)`,
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
        fix: `run \`npx ${pkgRef()} init\`, then paste your dashboard .env block (Settings → Claude Code → Copy .env block)`,
    };
}
export async function checkWhoami() {
    try {
        const { apiGet } = await import("../lib/client.js");
        const res = await apiGet("/api/v2/whoami");
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                let host = getApiUrl();
                try {
                    host = new URL(getApiUrl()).host;
                }
                catch {
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
            return {
                ok: true,
                todo: true,
                label: "Brand primer",
                detail: `${d.workspaceSlug} has no primer yet — set one up to unlock the pipelines`,
                fix: `say "exodus, set up my brand primer" (or run \`npx ${pkgRef()} foundation\` from a source doc, or paste it at /settings?tab=brands&brand=${d.workspaceSlug})`,
            };
        }
        return {
            ok: true,
            label: "Brand resolution",
            detail: `${d.workspaceName} (${d.workspaceSlug}) — foundation ready`,
        };
    }
    catch (err) {
        return {
            ok: false,
            label: "Brand resolution",
            detail: err instanceof Error ? err.message : String(err),
        };
    }
}
export async function checkActiveBrandMatch() {
    const resolved = resolveActiveBrand();
    if (!resolved.slug) {
        return {
            ok: true,
            label: "Active brand",
            detail: "no local override — using key's default brand",
        };
    }
    const source = resolved.source === "folder" ? "from brand folder" : "from `brand use`";
    let res;
    try {
        res = await apiGetDashboard("/api/brands/mine", { timeoutMs: 10_000 });
    }
    catch (err) {
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
    const available = res.data.brands.map((b) => b.slug).join(", ") || "(none)";
    return {
        ok: false,
        label: "Active brand",
        detail: `local active brand "${resolved.slug}" (${source}) is NOT in your accessible list — the server ignores it and every command silently targets the key's default brand. available: ${available}`,
        fix: `run \`npx ${pkgRef()} brand use <slug>\` with one of your brands, or \`npx ${pkgRef()} brand clear\` to fall back to the key default`,
    };
}
const FRESHNESS_SUBTREES = ["commands", "lib", "bin"];
function newestMtimeIn(dir) {
    let max = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith("."))
            continue;
        const full = path.join(dir, entry.name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            max = Math.max(max, newestMtimeIn(full));
        }
        else {
            max = Math.max(max, stat.mtimeMs);
        }
    }
    return max;
}
export function checkExodusDistFreshness(pkgRootOverride) {
    let pkgRoot;
    if (pkgRootOverride) {
        pkgRoot = pkgRootOverride;
    }
    else {
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
    const stale = [];
    let worstLagMs = 0;
    for (const sub of FRESHNESS_SUBTREES) {
        const srcRoot = path.join(pkgRoot, sub);
        const distRoot = path.join(distBase, sub);
        if (!fs.existsSync(srcRoot) || !fs.existsSync(distRoot))
            continue;
        const srcMtime = newestMtimeIn(srcRoot);
        const distMtime = newestMtimeIn(distRoot);
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
function npmRegistryUrl(channel) {
    return `https://registry.npmjs.org/@aicopycoders/exodus/${channel}`;
}
export async function checkVersionCurrency(pkgRootOverride, fetchImpl = fetch) {
    let pkgRoot;
    if (pkgRootOverride) {
        pkgRoot = pkgRootOverride;
    }
    else {
        const here = path.dirname(fileURLToPath(import.meta.url));
        pkgRoot = here;
        while (pkgRoot !== "/" && !fs.existsSync(path.join(pkgRoot, "package.json"))) {
            pkgRoot = path.dirname(pkgRoot);
        }
    }
    const local = readPackageVersion(pkgRoot);
    const channel = channelOf(local);
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8_000);
        let res;
        try {
            res = await fetchImpl(npmRegistryUrl(channel), { signal: ctrl.signal });
        }
        finally {
            clearTimeout(t);
        }
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const published = (await res.json()).version;
        if (compareVersions(local, published) >= 0) {
            return { ok: true, label: "Exodus version", detail: `${local} — up to date` };
        }
        return {
            ok: true,
            warn: true,
            label: "Exodus version",
            detail: `${local} installed, ${published} available`,
            fix: `run \`npx ${pkgRef(channel)} init\` to update (or \`npm install -g ${pkgRef(channel)}\`)`,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            ok: true,
            warn: true,
            label: "Exodus version",
            detail: `installed ${local} — couldn't reach npm (${message.slice(0, 80)})`,
        };
    }
}
export async function checkApiAndDrive() {
    let res;
    try {
        res = await apiGet("/api/v2/doctor/preflight");
    }
    catch (err) {
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
                fix: `regenerate at Settings → API Keys, then paste the new .env block (or re-run \`npx ${pkgRef()} init\`)`,
            },
            {
                ok: false,
                label: "Google Drive (dashboard)",
                detail: "skipped — API key check failed",
            },
        ];
    }
    const { workspace, drive, providers } = res.data;
    const apiResult = workspace
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
    const driveResult = drive.connected
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
    const results = [apiResult, driveResult];
    if (providers) {
        results.push(providers.kie
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
            });
        const hasLlm = providers.openrouter || providers.anthropic;
        results.push(hasLlm
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
            });
        if (providers.genesis !== undefined) {
            results.push(providers.genesis
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
                });
        }
        if (providers.imgflip !== undefined) {
            results.push(providers.imgflip
                ? {
                    ok: true,
                    label: "Imgflip login (classic memes)",
                    detail: "configured for the active user",
                }
                : {
                    ok: true,
                    warn: true,
                    label: "Imgflip login (classic memes — optional)",
                    detail: "not set — classic meme formats need it; AI memes are unaffected",
                    fix: "add your Imgflip username/password at Settings → Keys if you want classic meme formats",
                });
        }
    }
    return results;
}
export async function checkDashboardAuth() {
    let res;
    try {
        res = await apiGetDashboard("/api/doctor/dashboard-ping");
    }
    catch (err) {
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
            fix: hint
                ? stampChannel(hint)
                : `run \`npx ${pkgRef()} init\` to update the CLI — older releases skipped the Bearer header on dashboard routes`,
        };
    }
    return {
        ok: false,
        label: "Dashboard auth (image-ads path)",
        detail: `HTTP ${res.status}`,
        fix: "report to support — dashboard auth probe returned an unexpected status",
    };
}
function printResult(r) {
    const icon = r.todo
        ? "\x1b[36m▸\x1b[0m"
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
export function checkLayout() {
    const root = findWorkspaceRoot();
    const layout = detectLayout(root);
    if (layout === "legacy") {
        return {
            ok: true,
            label: "Layout",
            detail: `single-brand (legacy) — run \`npx ${pkgRef()} migrate\` to switch to the multi-brand layout`,
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
            fix: `run \`npx ${pkgRef()} init\` (or \`npx ${pkgRef()} brand use <slug>\`) to create your brand folders`,
        };
    }
    const missingProfiles = brands.filter((b) => !fs.existsSync(path.join(b.dir, "state", "brand-profile.md")));
    if (missingProfiles.length > 0) {
        return {
            ok: true,
            warn: true,
            label: "Layout",
            detail: `multi-brand, ${brands.length} brand folder(s); ${active}; missing brand profile in: ${missingProfiles.map((b) => b.slug).join(", ")}`,
            fix: `run \`npx ${pkgRef()} init\` to refresh every brand folder's profile`,
        };
    }
    return {
        ok: true,
        label: "Layout",
        detail: `multi-brand, ${brands.length} brand folder(s) [${brands.map((b) => b.slug).join(", ")}]; ${active}`,
    };
}
export function checkBrandProfileGenesisDepth() {
    const stateDir = brandStateDir();
    const filePath = path.join(stateDir, "brand-profile.md");
    const rel = path.relative(findWorkspaceRoot(), filePath) || filePath;
    if (!fs.existsSync(filePath)) {
        return {
            ok: false,
            label: "brand-profile",
            detail: `${rel} is missing`,
            fix: `run \`npx ${pkgRef()} brand use <slug>\` to generate it`,
        };
    }
    const contents = fs.readFileSync(filePath, "utf-8");
    if (contents.includes("exodus:genesis-depth-pending")) {
        return {
            ok: true,
            todo: true,
            label: "Brand-profile depth",
            detail: "manual section is still on the placeholder — fill it in so Genesis output isn't generic",
            fix: `open ${rel} and replace the TO-BE-FILLED-IN sections (Proven Angles, Segments, Key Differentiators, ICP Notes) with this brand's tested patterns`,
        };
    }
    return {
        ok: true,
        label: "brand-profile (Genesis depth)",
        detail: "manual section is filled in",
    };
}
export async function run(_flags) {
    const results = [];
    results.push(checkNodeVersion());
    results.push(checkClaudeCli());
    results.push(checkEnvFile());
    results.push(checkLayout());
    results.push(checkExodusDistFreshness());
    results.push(checkBrandProfileGenesisDepth());
    const apiAndDrive = await checkApiAndDrive();
    results.push(...apiAndDrive);
    results.push(await checkDashboardAuth());
    results.push(await checkWhoami());
    results.push(await checkActiveBrandMatch());
    results.push(await checkVersionCurrency());
    for (const r of results)
        printResult(r);
    const failures = results.filter((r) => !r.ok).length;
    const warnings = results.filter((r) => r.ok && r.warn && !r.todo).length;
    const todos = results.filter((r) => r.ok && r.todo);
    console.log("");
    if (failures > 0) {
        console.log(`${failures} ${failures === 1 ? "issue" : "issues"} found. Fix the item(s) above and run \`exodus doctor\` again.`);
        process.exit(1);
    }
    const warnNote = warnings > 0
        ? ` (${warnings} non-blocking ${warnings === 1 ? "warning" : "warnings"} above — safe to ignore)`
        : "";
    console.log(`✅ Install healthy — Exodus + Genesis are installed and connected.${warnNote}`);
    if (todos.length > 0) {
        const needsPrimer = todos.some((t) => /primer/i.test(t.label));
        console.log("");
        console.log("To start creating — in THIS folder:");
        console.log("  1. Restart Claude Code here (or run /clear) so the Exodus + Genesis skills load.");
        if (needsPrimer) {
            console.log("  2. Set up your brand primer first — it unlocks every pipeline:");
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
    }
    else {
        console.log("You're ready to run pipelines.");
    }
    process.exit(0);
}
