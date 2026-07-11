import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { apiGet, apiGetDashboard } from "../lib/client.js";
import { getActiveBrand, setLayoutVersion, findWorkspaceRoot } from "../lib/state.js";
import {
  detectLayout,
  brandDirFor,
  ensureBrandDir,
  BRAND_MARKER_FILE,
} from "../lib/layout.js";
import { pkgRef } from "../lib/channel.js";

export const helpText = `
exodus migrate — convert a single-brand install to the multi-brand layout

Usage:
  exodus migrate

What it does (one-time, opt-in — updates never force this):
  1. Figures out which brand this install belongs to (your active brand,
     falling back to the key's bound brand).
  2. Creates a subfolder for it and MOVES your brand-specific files in:
     state/  and  output/  →  <brand>/state/  and  <brand>/output/
  3. Marks the install as multi-brand. From then on, \`npx ${pkgRef()} init\`
     creates a subfolder for every brand you own, and running a command
     from inside a brand's folder targets that brand automatically.

Shared files (.env, exodus/, .claude/skills/, references/) stay where they
are. Safe to re-run: an already-migrated install exits immediately. Your
state/ files are backed up under .backup/ before anything moves.

Already on the multi-brand layout (fresh installs after the redesign)?
You don't need this command.
`.trim();

interface WhoamiResponse {
  workspaceSlug: string | null;
  workspaceName: string | null;
}

interface MineResp {
  brands?: Array<{ slug: string; name: string }>;
}

function fail(msg: string, code = 1): never {
  console.error(`exodus migrate: ${msg}`);
  process.exit(code);
}

function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Pre-scan for files that would collide if `src` were merged into `dest`.
 * A collision is a file that exists in both with different contents —
 * identical files merge silently. Pure-ish (reads only) so migration can
 * abort BEFORE moving anything.
 */
export function findMergeConflicts(src: string, dest: string): string[] {
  if (!fs.existsSync(src) || !fs.existsSync(dest)) return [];
  const conflicts: string[] = [];
  const walk = (rel: string): void => {
    const srcFull = path.join(src, rel);
    for (const entry of fs.readdirSync(srcFull, { withFileTypes: true })) {
      const childRel = path.join(rel, entry.name);
      const destFull = path.join(dest, childRel);
      if (entry.isDirectory()) {
        if (fs.existsSync(destFull)) walk(childRel);
      } else if (entry.isFile() && fs.existsSync(destFull)) {
        try {
          const a = fs.readFileSync(path.join(src, childRel));
          const b = fs.readFileSync(destFull);
          if (!a.equals(b)) conflicts.push(childRel);
        } catch {
          conflicts.push(childRel);
        }
      }
    }
  };
  walk("");
  return conflicts;
}

/** Move src into dest: plain rename when dest is absent, merge otherwise. */
function moveDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.renameSync(src, dest);
      return;
    } catch {
      /* cross-device — fall through to copy+rm */
    }
    execSync(`cp -R "${src}" "${dest}"`);
    fs.rmSync(src, { recursive: true, force: true });
    return;
  }
  // Merge (conflicts were ruled out by the pre-scan): copy over, then remove.
  execSync(`cp -R "${src}/." "${dest}/"`);
  fs.rmSync(src, { recursive: true, force: true });
}

async function resolveBrand(): Promise<{ slug: string; name: string }> {
  let slug = getActiveBrand();
  let name: string | null = null;

  if (!slug) {
    const res = await apiGet<WhoamiResponse>("/api/v2/whoami");
    if (res.ok && res.data?.workspaceSlug) {
      slug = res.data.workspaceSlug;
      name = res.data.workspaceName ?? null;
    }
  }
  if (!slug) {
    fail(
      "could not determine which brand this install belongs to.\n" +
        `  Run \`npx ${pkgRef()} brand use <slug>\` first (or check your network/.env), then re-run \`npx ${pkgRef()} migrate\`.`,
    );
  }

  if (!name) {
    try {
      const res = await apiGetDashboard<MineResp>("/api/brands/mine", {
        timeoutMs: 10_000,
      });
      if (res.ok) {
        name = res.data?.brands?.find((b) => b.slug === slug)?.name ?? null;
      }
    } catch {
      /* best-effort — slug works fine as the display name */
    }
  }
  return { slug, name: name ?? slug };
}

export async function run(
  flags: Record<string, string | boolean>,
): Promise<void> {
  void flags;
  const root = findWorkspaceRoot();

  if (detectLayout(root) === "v2") {
    console.log("✓ Already on the multi-brand layout — nothing to migrate.");
    console.log(`  Run \`npx ${pkgRef()} init\` to sync brand folders.`);
    return;
  }

  const brand = await resolveBrand();
  const brandDir = brandDirFor(root, brand.slug);
  const brandDirRel = path.relative(root, brandDir) || brandDir;

  // Abort BEFORE moving anything if a previous partial attempt (or a
  // hand-made folder) holds conflicting files.
  const conflicts = [
    ...findMergeConflicts(path.join(root, "state"), path.join(brandDir, "state")).map(
      (f) => path.join("state", f),
    ),
    ...findMergeConflicts(path.join(root, "output"), path.join(brandDir, "output")).map(
      (f) => path.join("output", f),
    ),
  ];
  if (conflicts.length > 0) {
    fail(
      `"${brandDirRel}/" already contains different versions of:\n` +
        conflicts.map((f) => `    ${f}`).join("\n") +
        `\n  Reconcile or remove them, then re-run \`npx ${pkgRef()} migrate\`. Nothing was changed.`,
    );
  }

  console.log(`Migrating this install to the multi-brand layout...`);
  console.log(`  brand: ${brand.slug} (${brand.name})`);

  // Backup the (small) state/ dir — the part with hand-edited content.
  const stateSrc = path.join(root, "state");
  if (fs.existsSync(stateSrc)) {
    const backupRoot = path.join(root, ".backup", `${ts()}-migrate`);
    fs.mkdirSync(backupRoot, { recursive: true });
    execSync(`cp -R "${stateSrc}" "${path.join(backupRoot, "state")}"`);
    console.log(`  backup: ${path.relative(root, backupRoot)}/state/`);
  }

  moveDir(path.join(root, "state"), path.join(brandDir, "state"));
  moveDir(path.join(root, "output"), path.join(brandDir, "output"));

  // Finalize: marker file + state/output dirs (no-ops where already present),
  // then flag the layout so every command resolves the new paths.
  ensureBrandDir(root, brand);
  setLayoutVersion(2);

  console.log(`
✓ Migrated. New structure:
    ${brandDirRel}/${path.basename(BRAND_MARKER_FILE)}   (brand marker)
    ${brandDirRel}/state/    ${brandDirRel}/output/

  Shared files (.env, exodus/, .claude/skills/, references/) did not move.

Next steps:
  • Run \`npx ${pkgRef()} init\` to pull folders for your other brands.
  • Run commands from inside ${brandDirRel}/ to target it automatically,
    or keep using \`npx ${pkgRef()} brand use <slug>\` from anywhere.
`.trimEnd());
}
