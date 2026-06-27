import fs from "node:fs";
import path from "node:path";
import { apiGetDashboard, apiPostDashboard } from "../lib/client.js";
import { getActiveBrand, setActiveBrand, clearActiveBrand, findWorkspaceRoot, } from "../lib/state.js";
import { detectLayout, ensureBrandDir, resolveActiveBrand, brandStateDir, brandDirFor, } from "../lib/layout.js";
import { promptYesNo } from "../lib/prompts.js";
const AUTO_END_MARKER = "<!-- exodus:auto-section-end — manual brand notes below survive `brand use` refreshes -->";
export const helpText = `
exodus brand — list, switch, and inspect brands available to your CLI

Subcommands:
  exodus brand list             Show all brands your key has access to
  exodus brand create "<name>"  Create a new brand you own and switch into it
  exodus brand use <slug>       Set the active brand for this CLI
  exodus brand current          Print the active brand
  exodus brand clear            Stop overriding the brand (use the key's default)
  exodus brand delete <slug>    Delete a brand you own (asks before removing the local folder)

Any user can create and own unlimited brands (\`brand create\`) — you do NOT
need to be an admin, and brands are scoped to you (two users can have the
same brand name). Your key gives access to every brand you own; switch with
\`brand use\` (admins also see every brand). The only "locked to one brand"
case is a brand someone ELSE invited you into: you don't own it, so it's the
single brand your key sees and you can't switch away from it.

When the active brand is set, every CLI command (genesis, image, creative,
foundation, etc.) targets it via the X-Active-Brand header. In a
multi-brand install, running a command from inside a brand's subfolder
targets that brand automatically — the folder wins over \`brand use\`.
The dashboard's brand-switcher in the top-right is independent — your
CLI active brand and your dashboard active brand can differ.
`.trim();
function fail(msg, code = 1) {
    console.error(`exodus brand: ${msg}`);
    process.exit(code);
}
export async function fetchMine() {
    const res = await apiGetDashboard("/api/brands/mine");
    if (!res.ok) {
        const body = res.data;
        fail(body?.hint ?? body?.error ?? `HTTP ${res.status}`);
    }
    return res.data;
}
export async function fetchMineOrThrow() {
    const res = await apiGetDashboard("/api/brands/mine");
    if (!res.ok) {
        const body = res.data;
        throw new Error(body?.hint ?? body?.error ?? `HTTP ${res.status}`);
    }
    return res.data;
}
async function runList() {
    const data = await fetchMine();
    const resolved = resolveActiveBrand();
    const effective = resolved.slug ?? data.activeBrandSlug;
    if (data.brands.length === 0) {
        console.log("No brands available for this key.");
        if (data.role === "member") {
            console.log("Ask an admin to assign you to a brand in Settings → Team.");
        }
        return;
    }
    console.log(`\nRole: ${data.role}`);
    const sourceNote = resolved.source === "folder" ? " (from this brand folder)" : "";
    console.log(`Active: ${effective ?? "(none — using key default)"}${sourceNote}\n`);
    const slugWidth = Math.max(...data.brands.map((b) => b.slug.length), 4);
    for (const b of data.brands) {
        const marker = b.slug === effective ? "★" : " ";
        console.log(`  ${marker} ${b.slug.padEnd(slugWidth)}  ${b.name}`);
    }
    if (resolved.source === "folder") {
        const pointer = getActiveBrand();
        if (pointer && pointer !== resolved.slug) {
            console.log(`\nNote: you're inside the "${resolved.slug}" brand folder, which`);
            console.log(`overrides the \`brand use\` pointer ("${pointer}") while you're here.`);
        }
    }
    if (effective && !data.brands.some((b) => b.slug === effective)) {
        console.log(`\n⚠ Active brand "${effective}" is set locally but you don't have access to it.`);
        console.log(`  Run \`exodus brand use <slug>\` to pick a different brand,`);
        console.log(`  or \`exodus brand clear\` to fall back to the key default.`);
    }
    console.log("");
}
export async function refreshBrandProfileMd(opts) {
    const res = await apiGetDashboard("/api/brands/profile-md", opts?.slug ? { activeBrandOverride: opts.slug } : undefined);
    const root = findWorkspaceRoot();
    const stateDir = brandStateDir({ slug: opts?.slug, root });
    const filePath = path.join(stateDir, "brand-profile.md");
    const pathRel = path.relative(root, filePath);
    if (!res.ok) {
        const body = res.data;
        return {
            written: false,
            pathRel,
            reason: body?.hint ?? body?.error ?? `HTTP ${res.status}`,
        };
    }
    const data = res.data;
    let next;
    if (!fs.existsSync(filePath)) {
        next = `${data.autoSection}\n${data.manualTemplate}`;
    }
    else {
        const existing = fs.readFileSync(filePath, "utf-8");
        const idx = existing.indexOf(AUTO_END_MARKER);
        if (idx >= 0) {
            const manual = existing.slice(idx + AUTO_END_MARKER.length);
            next = `${data.autoSection}${manual}`;
        }
        else {
            next = `${data.autoSection}\n\n${existing.trimStart()}`;
        }
    }
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(filePath, next, "utf-8");
    return { written: true, pathRel };
}
async function runUse(slug) {
    if (!slug)
        fail("missing slug. usage: exodus brand use <slug>");
    const data = await fetchMine();
    const match = data.brands.find((b) => b.slug === slug);
    if (!match) {
        const available = data.brands.map((b) => b.slug).join(", ") || "(none)";
        fail(`brand "${slug}" is not in your accessible list. available: ${available}`);
    }
    setActiveBrand(slug);
    console.log(`✓ Active brand set to ${slug} (${match.name}).`);
    const root = findWorkspaceRoot();
    if (detectLayout(root) === "v2") {
        const ensured = ensureBrandDir(root, { slug, name: match.name });
        if (ensured.created) {
            console.log(`✓ Created brand folder ${path.relative(root, ensured.dir) || ensured.dir}/.`);
        }
    }
    const refresh = await refreshBrandProfileMd({ slug });
    if (refresh.written) {
        console.log(`✓ Refreshed ${refresh.pathRel} from the dashboard foundation.`);
    }
    else {
        console.log(`⚠ Could not refresh ${refresh.pathRel}: ${refresh.reason}.`);
        console.log("  The brand was switched locally; Genesis may use stale brand context");
        console.log("  until you re-run `exodus brand use` with network access.");
    }
    const resolved = resolveActiveBrand();
    if (resolved.source === "folder" && resolved.slug !== slug) {
        console.log(`\nHeads up: you're currently inside the "${resolved.slug}" brand folder,`);
        console.log(`which takes precedence while you're here. Commands run from this folder`);
        console.log(`still target ${resolved.slug}; run from the install root (or`);
        console.log(`the ${slug} folder) to target ${slug}.`);
    }
}
async function runCreate(name) {
    if (!name)
        fail('missing name. usage: exodus brand create "<name>"');
    const res = await apiPostDashboard("/api/brands/create", { name });
    if (!res.ok || !res.data?.slug) {
        fail(res.data?.error ?? `HTTP ${res.status}`);
    }
    const slug = res.data.slug;
    const createdName = res.data.name ?? name;
    console.log(`✓ Brand "${createdName}" created (slug: ${slug}).`);
    setActiveBrand(slug);
    console.log(`✓ Active brand set to ${slug}.`);
    const root = findWorkspaceRoot();
    if (detectLayout(root) === "v2") {
        const ensured = ensureBrandDir(root, { slug, name: createdName });
        if (ensured.created) {
            console.log(`✓ Created brand folder ${path.relative(root, ensured.dir) || ensured.dir}/.`);
        }
    }
    const refresh = await refreshBrandProfileMd({ slug });
    if (refresh.written) {
        console.log(`✓ Wrote ${refresh.pathRel}.`);
    }
    console.log(`\nNext: set up the brand's primer to unlock the pipelines —\n` +
        `  say "exodus, set up my brand primer" (or run \`npx @aicopycoders/exodus primer\`).`);
}
async function runDelete(slug, flags) {
    if (!slug)
        fail("missing slug. usage: exodus brand delete <slug>");
    const skipConfirm = flags.yes === true || flags.y === true;
    const purgeLocal = flags["purge-local"] === true || skipConfirm;
    if (!skipConfirm) {
        const ok = await confirmSlugTyped(slug);
        if (!ok) {
            console.log("Aborted — nothing was deleted.");
            return;
        }
    }
    const res = await apiPostDashboard("/api/brands/delete", {
        slug,
        confirmSlug: slug,
    });
    if (!res.ok) {
        fail(res.data?.error ?? `HTTP ${res.status}`);
    }
    console.log(`✓ Brand '${slug}' deleted (server).`);
    if (getActiveBrand() === slug) {
        clearActiveBrand();
        console.log("✓ Cleared local active-brand pointer (it pointed at this brand).");
    }
    const root = findWorkspaceRoot();
    if (detectLayout(root) === "v2") {
        const dir = brandDirFor(root, slug);
        if (fs.existsSync(dir)) {
            const rel = path.relative(root, dir) || dir;
            const remove = purgeLocal
                ? true
                : await promptYesNo(`Also remove the local folder ${rel}/?`, false);
            if (remove) {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`✓ Removed local folder ${rel}/.`);
            }
            else {
                console.log(`ℹ Left local folder ${rel}/ in place — delete it yourself if you don't need the files.`);
            }
        }
    }
}
async function confirmSlugTyped(slug) {
    const { createInterface } = await import("node:readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await new Promise((resolve) => {
            rl.question(`This permanently deletes the brand "${slug}".\nType "${slug}" to confirm: `, resolve);
        });
        return answer.trim() === slug;
    }
    finally {
        rl.close();
    }
}
function runCurrent() {
    const resolved = resolveActiveBrand();
    if (resolved.slug) {
        const source = resolved.source === "folder"
            ? "from this brand folder"
            : "from `brand use`";
        console.log(`${resolved.slug} (${source})`);
        if (resolved.source === "folder") {
            const pointer = getActiveBrand();
            if (pointer && pointer !== resolved.slug) {
                console.log(`pointer: ${pointer} (overridden while inside this folder)`);
            }
        }
    }
    else {
        console.log("(none — falling back to the key's default brand)");
    }
}
function runClear() {
    clearActiveBrand();
    console.log("✓ Cleared local active brand. Falling back to the key's default.");
    const resolved = resolveActiveBrand();
    if (resolved.source === "folder") {
        console.log(`Note: you're inside the "${resolved.slug}" brand folder — commands run`);
        console.log("from here still target it (the folder wins over the pointer).");
    }
}
export async function run(flags) {
    const positionals = process.argv.slice(3).filter((a) => !a.startsWith("--"));
    const sub = positionals[0];
    const arg = positionals[1];
    switch (sub) {
        case "list":
        case undefined:
            await runList();
            return;
        case "create":
            await runCreate(positionals.slice(1).join(" ").trim());
            return;
        case "use":
            await runUse(arg ?? "");
            return;
        case "delete":
            await runDelete(arg ?? "", flags);
            return;
        case "current":
            runCurrent();
            return;
        case "clear":
            runClear();
            return;
        default:
            console.error(`exodus brand: unknown subcommand "${sub}"\n`);
            console.log(helpText);
            process.exit(1);
    }
}
