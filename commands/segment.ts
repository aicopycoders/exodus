import fs from "node:fs";
import { apiGet, apiPost } from "../lib/client.js";
import { formatError } from "../lib/format.js";

export const helpText = `
exodus segment — Segment map + personas (WHAT / WHO / WHY), agentic I/O

The JSON contract is the edit surface: export the map, edit the file, import it
back. Import is a FULL REPLACE, slug-stable by name-match — existing outcomes and
values keep their slugs, new names get new ones, and names absent from the file
are deleted. Personas the new map orphans are ARCHIVED (never deleted).

Usage:
  exodus segment show                       Human-readable summary of the map
  exodus segment show --json                Raw normalized map JSON
  exodus segment export [--out <file>]      Contract JSON (map + personas) to stdout or a file
  exodus segment import <file> [--yes]      Import a contract JSON file (dry-run first)
  exodus segment personas                   List saved personas (incl. archived)
  exodus segment personas --json            Raw persona list JSON

Flags:
  --json                 Machine-readable JSON output (show / personas)
  --out <file>           Write export to a file instead of stdout
  --yes                  Apply a destructive import (deletes segments / archives personas)

Notes:
  • All operations scope to your active brand. Check with: exodus brand current
  • 'import' ALWAYS previews via a server dry-run first and prints what would
    change. If anything would be deleted at ANY layer (outcome, sub-slice,
    demo/facet value) or a persona archived/deleted, it refuses to apply
    without --yes and exits non-zero (never prompts — agents hang on prompts).
  • 'import' on a workspace with no map yet just creates it.
  • 'export' output imports back unchanged — it is the contract document.

Examples:
  exodus segment show
  exodus segment export --out segments.json
  exodus segment import segments.json
  exodus segment import segments.json --yes
  exodus segment personas --json
`.trim();

// ── Contract shapes (mirror convex/lib/segmentImport.ts) ─────────────────
// The exodus package builds standalone (rootDir = exodus/, published to npm),
// so it cannot import convex/lib directly — these are hand-maintained mirrors.
// Drift is caught at compile time: __tests__/segment.test.ts asserts mutual
// assignability against the real contract types, and the repo-root tsc
// (CI's typecheck gate) checks that test file.

interface NValue {
  slug: string;
  name: string;
}
interface MapOutcome {
  slug: string;
  name: string;
  lens?: "Type" | "Location" | "Function" | "Moment" | "Severity";
  subs: NValue[];
}
interface MapGroup {
  name: string;
  values: NValue[];
}
/** The normalized map projection returned by GET /api/v2/segments. */
export interface SegmentMap {
  productWord: string;
  brandLabel: string;
  outcomes: MapOutcome[];
  demoGroups: MapGroup[];
  facetFamilies: MapGroup[];
}

/** The change summary the import endpoint returns (matches ImportResult). */
export interface ImportSummary {
  added: string[];
  keptRenamed: string[];
  deleted: string[];
  subsDeleted: string[];
  demoValuesDeleted: string[];
  facetValuesDeleted: string[];
  personasArchived: string[];
  personasDeleted: string[];
}

interface PersonaRow {
  name: string;
  code: string;
  type: string;
  description: string;
  sortOrder: number;
  archived: boolean;
}

// ── Pure helpers (unit-tested) ───────────────────────────────────────────

/** Fill any summary field an (older) server omitted with an empty list, so the
 *  gate and the formatter never trip on undefined. */
export function asSummary(data: unknown): ImportSummary {
  const d = (typeof data === "object" && data !== null ? data : {}) as Partial<ImportSummary>;
  const list = (v: string[] | undefined) => (Array.isArray(v) ? v : []);
  return {
    added: list(d.added),
    keptRenamed: list(d.keptRenamed),
    deleted: list(d.deleted),
    subsDeleted: list(d.subsDeleted),
    demoValuesDeleted: list(d.demoValuesDeleted),
    facetValuesDeleted: list(d.facetValuesDeleted),
    personasArchived: list(d.personasArchived),
    personasDeleted: list(d.personasDeleted),
  };
}

/** An import is destructive when it would delete ANYTHING at any layer —
 *  an outcome, a sub-slice, a demo/facet value, or a persona (archived by
 *  orphaning or removed by a roster replace). The --yes gate guards all of it. */
export function isDestructive(summary: ImportSummary): boolean {
  return (
    summary.deleted.length > 0 ||
    summary.subsDeleted.length > 0 ||
    summary.demoValuesDeleted.length > 0 ||
    summary.facetValuesDeleted.length > 0 ||
    summary.personasArchived.length > 0 ||
    summary.personasDeleted.length > 0
  );
}

function line(label: string, names: string[]): string {
  const detail = names.length > 0 ? `  (${names.join(", ")})` : "";
  return `  ${label.padEnd(24)} ${String(names.length).padStart(3)}${detail}`;
}

/** The dry-run change summary, human-readable. */
export function formatImportSummary(summary: ImportSummary): string {
  return [
    "Import preview:",
    line("+ outcomes added", summary.added),
    line("~ outcomes kept", summary.keptRenamed),
    line("- outcomes deleted", summary.deleted),
    line("- subs deleted", summary.subsDeleted),
    line("- demo values deleted", summary.demoValuesDeleted),
    line("- facet values deleted", summary.facetValuesDeleted),
    line("personas archived", summary.personasArchived),
    line("personas deleted", summary.personasDeleted),
  ].join("\n");
}

/** A map summary for `segment show`. */
export function formatMapSummary(map: SegmentMap): string {
  const lines: string[] = [];
  lines.push(`Segment map — ${map.brandLabel} (product: ${map.productWord})`);

  lines.push(`\nOutcomes (${map.outcomes.length}):`);
  for (const o of map.outcomes) {
    const lens = o.lens ? ` [${o.lens}]` : "";
    const subs = o.subs.length > 0 ? `  · subs: ${o.subs.map((s) => s.name).join(", ")}` : "";
    lines.push(`  ${o.slug.padEnd(24)} ${o.name}${lens}${subs}`);
  }

  const groupBlock = (title: string, groups: MapGroup[]) => {
    lines.push(`\n${title}:`);
    for (const g of groups) {
      const vals = g.values.length > 0 ? g.values.map((val) => val.name).join(", ") : "—";
      lines.push(`  ${g.name} (${g.values.length}): ${vals}`);
    }
  };
  groupBlock("Demographics (WHO)", map.demoGroups);
  groupBlock("Facets (WHY)", map.facetFamilies);

  return lines.join("\n");
}

// ── Import flow (gate logic, dependency-injected for tests) ───────────────

export interface ImportDeps {
  /** POST a body to a path; mirrors apiPost's ApiResponse shape. */
  post: (path: string, body: unknown) => Promise<{ ok: boolean; status: number; data: unknown }>;
  /** Read a file's UTF-8 text (throws if missing). */
  readFile: (path: string) => string;
}

export interface ImportFlowResult {
  /** Process exit code: 0 applied/ok, 1 blocked or errored. */
  code: number;
  /** Lines to print (already formatted for the chosen json/human mode). */
  lines: string[];
  /** One entry per import POST actually made — `dryRun:false` proves the real
   *  import ran; a single `dryRun:true` entry proves it was gated out. */
  calls: Array<{ dryRun: boolean }>;
}

const IMPORT_PATH = "/api/v2/segments/import";

/**
 * The `segment import` flow: read + parse the file, dry-run it server-side to
 * get the change summary, print it, and either apply the import or — when it is
 * destructive and `--yes` was not passed — refuse and exit non-zero. Never
 * prompts. Dependency-injected so tests can assert the gate without a network.
 */
export async function importFlow(
  file: string,
  opts: { yes: boolean; json: boolean },
  deps: ImportDeps,
): Promise<ImportFlowResult> {
  const calls: Array<{ dryRun: boolean }> = [];

  let text: string;
  try {
    text = deps.readFile(file);
  } catch {
    return { code: 1, lines: [`Error: file not found: ${file}`], calls };
  }

  let contract: unknown;
  try {
    contract = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { code: 1, lines: [`Error: ${file} is not valid JSON: ${msg}`], calls };
  }
  if (typeof contract !== "object" || contract === null || Array.isArray(contract)) {
    return { code: 1, lines: [`Error: ${file} is not a segment map (expected a JSON object).`], calls };
  }

  // The CLI ALONE decides dryRun. Strip any smuggled top-level `dryRun` from
  // the file before building either request body — otherwise a file carrying
  // `"dryRun": true` would make the apply call silently skip the write while
  // we print "Imported."
  const clean: Record<string, unknown> = { ...(contract as Record<string, unknown>) };
  delete clean.dryRun;

  // Dry-run first — same code path the real import takes, write skipped.
  calls.push({ dryRun: true });
  const dry = await deps.post(IMPORT_PATH, { ...clean, dryRun: true });
  if (!dry.ok) {
    const lines = opts.json
      ? [JSON.stringify({ ok: false, status: dry.status, data: dry.data })]
      : [formatError({ ok: dry.ok, status: dry.status, data: dry.data })];
    return { code: 1, lines, calls };
  }
  const summary = asSummary(dry.data);
  const destructive = isDestructive(summary);

  // Blocked: destructive import without --yes. Show the summary, exit non-zero,
  // and DO NOT make the real import call.
  if (destructive && !opts.yes) {
    const lines = opts.json
      ? [JSON.stringify({ ok: false, applied: false, destructive: true, summary })]
      : [
          formatImportSummary(summary),
          "",
          "This import is destructive (deletes outcomes, sub-slices, or values,",
          "and/or archives or deletes personas). Re-run with --yes to apply it.",
        ];
    return { code: 1, lines, calls };
  }

  // Apply.
  calls.push({ dryRun: false });
  const real = await deps.post(IMPORT_PATH, clean);
  if (!real.ok) {
    const lines = opts.json
      ? [JSON.stringify({ ok: false, status: real.status, data: real.data })]
      : [formatError({ ok: real.ok, status: real.status, data: real.data })];
    return { code: 1, lines, calls };
  }
  const applied = asSummary(real.data);
  const lines = opts.json
    ? [JSON.stringify({ ok: true, applied: true, destructive, summary: applied })]
    : [formatImportSummary(applied), "", "Imported."];
  return { code: 0, lines, calls };
}

// ── Command dispatch ──────────────────────────────────────────────────────

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  const positional = parsePositional();
  const [sub, ...rest] = positional;

  if (!sub || sub === "show") return runShow(flags);
  if (sub === "export") return runExport(flags);
  if (sub === "import") return runImport(rest, flags);
  if (sub === "personas") return runPersonas(flags);

  console.error(`Unknown subcommand: "${sub}"\n`);
  console.log(helpText);
  process.exit(1);
}

// Argv parser: pull out positionals after the "segment" command itself.
function parsePositional(): string[] {
  const args = process.argv.slice(3); // drop node, script, "segment"
  const out: string[] = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a.startsWith("--")) {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    out.push(a);
    i++;
  }
  return out;
}

async function runShow(flags: Record<string, string | boolean>): Promise<void> {
  const json = !!flags["json"];
  const res = await apiGet<{ map: SegmentMap | null }>("/api/v2/segments");
  if (!res.ok) {
    if (json) console.log(JSON.stringify({ ok: false, status: res.status, data: res.data }));
    else console.log(formatError(res));
    process.exit(1);
  }
  if (json) {
    console.log(JSON.stringify(res.data.map));
    return;
  }
  if (!res.data.map) {
    console.log("No segment map yet for the active brand.");
    console.log("Build one and import it:  exodus segment import <file>");
    return;
  }
  console.log(formatMapSummary(res.data.map));
}

async function runExport(flags: Record<string, string | boolean>): Promise<void> {
  const out = typeof flags["out"] === "string" ? (flags["out"] as string) : undefined;
  const res = await apiGet<unknown>("/api/v2/segments/export");
  if (!res.ok) {
    console.log(formatError(res));
    process.exit(1);
  }
  const doc = JSON.stringify(res.data, null, 2);
  if (out) {
    fs.writeFileSync(out, doc + "\n", "utf-8");
    console.log(`Wrote segment contract to ${out}.`);
    return;
  }
  console.log(doc);
}

async function runImport(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const file = positional[0];
  if (!file) {
    console.error("Error: a contract JSON file is required");
    console.log("Usage: exodus segment import <file> [--yes]");
    process.exit(1);
  }
  const result = await importFlow(
    file,
    { yes: !!flags["yes"], json: !!flags["json"] },
    {
      post: (path, body) => apiPost(path, body),
      readFile: (p) => fs.readFileSync(p, "utf-8"),
    },
  );
  for (const l of result.lines) console.log(l);
  if (result.code !== 0) process.exit(result.code);
}

async function runPersonas(flags: Record<string, string | boolean>): Promise<void> {
  const json = !!flags["json"];
  const res = await apiGet<{ personas: PersonaRow[] }>("/api/v2/segments/personas");
  if (!res.ok) {
    if (json) console.log(JSON.stringify({ ok: false, status: res.status, data: res.data }));
    else console.log(formatError(res));
    process.exit(1);
  }
  const personas = res.data.personas ?? [];
  if (json) {
    console.log(JSON.stringify({ personas }));
    return;
  }
  if (personas.length === 0) {
    console.log("No personas saved yet for the active brand.");
    return;
  }
  console.log(`Personas (${personas.length}):`);
  for (const p of personas) {
    const tag = p.archived ? "  [archived]" : "";
    const code = p.code ? `${p.code}  ` : "";
    const type = p.type ? `  (${p.type})` : "";
    console.log(`  ${code}${p.name}${type}${tag}`);
    if (p.description) console.log(`    ${p.description}`);
  }
}
