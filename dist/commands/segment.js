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
export function asSummary(data) {
    const d = (typeof data === "object" && data !== null ? data : {});
    const list = (v) => (Array.isArray(v) ? v : []);
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
export function isDestructive(summary) {
    return (summary.deleted.length > 0 ||
        summary.subsDeleted.length > 0 ||
        summary.demoValuesDeleted.length > 0 ||
        summary.facetValuesDeleted.length > 0 ||
        summary.personasArchived.length > 0 ||
        summary.personasDeleted.length > 0);
}
function line(label, names) {
    const detail = names.length > 0 ? `  (${names.join(", ")})` : "";
    return `  ${label.padEnd(24)} ${String(names.length).padStart(3)}${detail}`;
}
export function formatImportSummary(summary) {
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
export function formatMapSummary(map) {
    const lines = [];
    lines.push(`Segment map — ${map.brandLabel} (product: ${map.productWord})`);
    lines.push(`\nOutcomes (${map.outcomes.length}):`);
    for (const o of map.outcomes) {
        const lens = o.lens ? ` [${o.lens}]` : "";
        const subs = o.subs.length > 0 ? `  · subs: ${o.subs.map((s) => s.name).join(", ")}` : "";
        lines.push(`  ${o.slug.padEnd(24)} ${o.name}${lens}${subs}`);
    }
    const groupBlock = (title, groups) => {
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
const IMPORT_PATH = "/api/v2/segments/import";
export async function importFlow(file, opts, deps) {
    const calls = [];
    let text;
    try {
        text = deps.readFile(file);
    }
    catch {
        return { code: 1, lines: [`Error: file not found: ${file}`], calls };
    }
    let contract;
    try {
        contract = JSON.parse(text);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { code: 1, lines: [`Error: ${file} is not valid JSON: ${msg}`], calls };
    }
    if (typeof contract !== "object" || contract === null || Array.isArray(contract)) {
        return { code: 1, lines: [`Error: ${file} is not a segment map (expected a JSON object).`], calls };
    }
    const clean = { ...contract };
    delete clean.dryRun;
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
export async function run(flags) {
    const positional = parsePositional();
    const [sub, ...rest] = positional;
    if (!sub || sub === "show")
        return runShow(flags);
    if (sub === "export")
        return runExport(flags);
    if (sub === "import")
        return runImport(rest, flags);
    if (sub === "personas")
        return runPersonas(flags);
    console.error(`Unknown subcommand: "${sub}"\n`);
    console.log(helpText);
    process.exit(1);
}
function parsePositional() {
    const args = process.argv.slice(3);
    const out = [];
    let i = 0;
    while (i < args.length) {
        const a = args[i];
        if (a.startsWith("--")) {
            const next = args[i + 1];
            if (next !== undefined && !next.startsWith("--")) {
                i += 2;
            }
            else {
                i++;
            }
            continue;
        }
        out.push(a);
        i++;
    }
    return out;
}
async function runShow(flags) {
    const json = !!flags["json"];
    const res = await apiGet("/api/v2/segments");
    if (!res.ok) {
        if (json)
            console.log(JSON.stringify({ ok: false, status: res.status, data: res.data }));
        else
            console.log(formatError(res));
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
async function runExport(flags) {
    const out = typeof flags["out"] === "string" ? flags["out"] : undefined;
    const res = await apiGet("/api/v2/segments/export");
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
async function runImport(positional, flags) {
    const file = positional[0];
    if (!file) {
        console.error("Error: a contract JSON file is required");
        console.log("Usage: exodus segment import <file> [--yes]");
        process.exit(1);
    }
    const result = await importFlow(file, { yes: !!flags["yes"], json: !!flags["json"] }, {
        post: (path, body) => apiPost(path, body),
        readFile: (p) => fs.readFileSync(p, "utf-8"),
    });
    for (const l of result.lines)
        console.log(l);
    if (result.code !== 0)
        process.exit(result.code);
}
async function runPersonas(flags) {
    const json = !!flags["json"];
    const res = await apiGet("/api/v2/segments/personas");
    if (!res.ok) {
        if (json)
            console.log(JSON.stringify({ ok: false, status: res.status, data: res.data }));
        else
            console.log(formatError(res));
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
        if (p.description)
            console.log(`    ${p.description}`);
    }
}
