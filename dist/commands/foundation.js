import fs from "node:fs";
import path from "node:path";
import { apiGetDashboard, apiPostDashboard } from "../lib/client.js";
import { promptYesNo, promptChoice, promptText, promptMultiline, openInEditor, } from "../lib/prompts.js";
export const helpText = `
exodus foundation — (legacy) Manage a brand's 2-track Genesis foundation

NOTE: New brands should onboard with \`exodus primer\` — a single primer doc is
now all a brand needs to run the pipelines. This command edits the older
audienceConcerns + 2-track-primer fields and remains for brands set up that way.

Subcommands:
  exodus foundation              Interactive walkthrough (extracts from a source)
  exodus foundation status       Show ready/missing state, no writes
  exodus foundation save <path>  Save an already-structured markdown file
                                 directly into the brand's foundation.
                                 No bot extraction, no interactive prompts.
  exodus foundation set <field> --value <text>
  exodus foundation set <field> --file <path>
                                 Set ONE field directly. Field must be one of:
                                 audienceConcerns, brandVoice,
                                 primerUnawareProblemAware,
                                 primerSolutionProductAware.
                                 Legacy 4-level keys (primerUnaware,
                                 primerProblemAware, primerSolutionAware,
                                 primerProductAware) are still accepted and
                                 collapse server-side into the 2-track shape.

Interactive walkthrough flags (skip the source picker):
  --doc <url>      Google Doc URL
  --url <url>      Web page URL
  --file <path>    Local text file (.md / .txt / any text)
  --text <inline>  Use the literal string as the source text

WHEN TO USE WHICH
- \`save <path>\`: when the user (or you) already produced a fully-formatted
  foundation in markdown with section headers. No extraction needed; just
  write it through. This is the path Claude Code should use when it has
  generated structured content already.
- \`set <field>\`: when only one field needs updating.
- (interactive): when starting from a raw source (a brand brief, a website,
  notes the user pasted) that needs extracting + reviewing per section.

\`save\` parses H2 headers in your markdown to map sections to fields. The
foundation is now a 2-track shape (Genesis methodology): the unaware and
problem-aware levels share one primer; solution-aware and product-aware
share the other. Recognized headers (case-insensitive, dashes/parens
optional):
  Audience Concerns | Brand Voice |
  Primer Unaware/Problem-Aware (or "Cold", "TOFU") |
  Primer Solution/Product-Aware (or "Warm", "MOFU/BOFU")
Legacy single-level headers (Primer Unaware, Primer Problem Aware, Primer
Solution Aware, Primer Product Aware) still parse and route to the
correct 2-track destination.
`.trim();
const FIELD_ORDER = [
    "audienceConcerns",
    "primerUnawareProblemAware",
    "primerSolutionProductAware",
    "brandVoice",
];
function fail(msg, code = 1) {
    console.error(`exodus foundation: ${msg}`);
    process.exit(code);
}
function printApiError(prefix, status, data) {
    const body = data;
    const detail = body?.hint ?? body?.detail ?? body?.error ?? `HTTP ${status}`;
    console.error(`exodus foundation: ${prefix}: ${detail}`);
}
async function fetchStatus() {
    const res = await apiGetDashboard("/api/foundation/status");
    if (!res.ok) {
        printApiError("status check failed", res.status, res.data);
        process.exit(1);
    }
    return res.data;
}
function printStatus(s) {
    const brandLabel = s.brand
        ? `${s.brand.name} (${s.brand.slug})`
        : "(brand not resolved)";
    console.log(`\nBrand:  ${brandLabel}`);
    console.log(`Status: ${s.ready ? "✓ Ready for Genesis" : `✗ Missing: ${s.missing.join(", ")}`}`);
    console.log("");
    for (const f of s.fields) {
        const dot = f.populated ? "●" : "○";
        const tag = f.required ? "" : " (optional)";
        const right = f.populated
            ? `${f.chars} chars — ${f.preview}`
            : "empty";
        console.log(`  ${dot} ${f.label}${tag}: ${right}`);
    }
    console.log("");
}
async function pickSource(flags) {
    if (typeof flags.doc === "string" && flags.doc) {
        return { kind: "googleDoc", value: flags.doc };
    }
    if (typeof flags.url === "string" && flags.url) {
        return { kind: "url", value: flags.url };
    }
    if (typeof flags.file === "string" && flags.file) {
        const filePath = path.resolve(process.cwd(), flags.file);
        let text;
        try {
            text = fs.readFileSync(filePath, "utf-8");
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            fail(`could not read file ${filePath}: ${msg}`);
        }
        if (!text.trim())
            fail(`file is empty: ${filePath}`);
        return { kind: "text", value: text };
    }
    if (typeof flags.text === "string" && flags.text) {
        return { kind: "text", value: flags.text };
    }
    const choice = await promptChoice("Where should we pull the brand info from?", [
        { key: "1", label: "Google Doc URL" },
        { key: "2", label: "Web page URL" },
        { key: "3", label: "Local text file (.md / .txt)" },
        { key: "4", label: "Paste / type" },
        { key: "q", label: "quit" },
    ], "1");
    if (choice === "q")
        return null;
    if (choice === "1") {
        const url = await promptText("Google Doc URL or ID:");
        if (!url)
            fail("no URL provided");
        return { kind: "googleDoc", value: url };
    }
    if (choice === "2") {
        const url = await promptText("Web page URL:");
        if (!url)
            fail("no URL provided");
        return { kind: "url", value: url };
    }
    if (choice === "3") {
        const filePath = await promptText("Local file path:");
        if (!filePath)
            fail("no file path provided");
        const resolved = path.resolve(process.cwd(), filePath);
        let text;
        try {
            text = fs.readFileSync(resolved, "utf-8");
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            fail(`could not read file ${resolved}: ${msg}`);
        }
        if (!text.trim())
            fail(`file is empty: ${resolved}`);
        return { kind: "text", value: text };
    }
    const text = await promptMultiline("Paste your brand brief / notes below:");
    if (!text.trim())
        fail("no text entered");
    return { kind: "text", value: text };
}
async function fetchSource(kind, value) {
    const res = await apiPostDashboard("/api/foundation/source", { kind, value });
    if (!res.ok) {
        printApiError("source fetch failed", res.status, res.data);
        process.exit(1);
    }
    return res.data;
}
async function extract(fieldKey, sourceText) {
    const res = await apiPostDashboard("/api/foundation/extract", { fieldKey, sourceText });
    if (!res.ok) {
        printApiError(`extract ${fieldKey} failed`, res.status, res.data);
        process.exit(1);
    }
    return res.data;
}
async function saveField(fieldKey, value) {
    const res = await apiPostDashboard("/api/foundation/set", { fieldKey, value });
    if (!res.ok) {
        printApiError(`save ${fieldKey} failed`, res.status, res.data);
        process.exit(1);
    }
    return res.data;
}
function box(title, body) {
    const line = "─".repeat(64);
    console.log(`\n┌${line}`);
    console.log(`│ ${title}`);
    console.log(`├${line}`);
    for (const row of body.split("\n")) {
        console.log(`│ ${row}`);
    }
    console.log(`└${line}\n`);
}
async function walkField(field, sourceText) {
    if (field.populated) {
        const regen = await promptYesNo(`${field.label} is already populated (${field.chars} chars). Regenerate?`, false);
        if (!regen) {
            console.log(`  → keeping existing ${field.label}.`);
            return;
        }
    }
    for (;;) {
        process.stdout.write(`\nExtracting ${field.label}…\n`);
        const result = await extract(field.key, sourceText);
        box(`${field.label} — suggestion (${result.model})`, result.suggestion);
        const choice = await promptChoice(`What do you want to do with this ${field.label} suggestion?`, [
            { key: "a", label: "accept" },
            { key: "e", label: "edit in $EDITOR" },
            { key: "r", label: "regenerate" },
            { key: "s", label: "skip" },
        ], "a");
        if (choice === "a") {
            await saveField(field.key, result.suggestion);
            console.log(`  ✓ saved ${field.label}.`);
            return;
        }
        if (choice === "e") {
            const edited = openInEditor(result.suggestion);
            if (edited === null || !edited.trim()) {
                console.log("  → editor exited empty / non-zero. Try again.");
                continue;
            }
            await saveField(field.key, edited);
            console.log(`  ✓ saved ${field.label} (edited).`);
            return;
        }
        if (choice === "r") {
            continue;
        }
        if (choice === "s") {
            console.log(`  → skipped ${field.label}.`);
            return;
        }
    }
}
async function runStatus() {
    const status = await fetchStatus();
    printStatus(status);
}
const FIELD_KEYS = new Set([
    "audienceConcerns",
    "brandVoice",
    "primerUnawareProblemAware",
    "primerSolutionProductAware",
]);
function headerToFieldKey(rawHeader) {
    const norm = rawHeader
        .toLowerCase()
        .replace(/[\(\)\-–—_:\/]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (norm === "audience concerns" || norm === "audience" || norm === "concerns") {
        return "audienceConcerns";
    }
    if (norm === "brand voice" || norm === "voice") {
        return "brandVoice";
    }
    const hasUnaware = norm.includes("unaware");
    const hasProblem = norm.includes("problem");
    const hasSolution = norm.includes("solution");
    const hasProduct = norm.includes("product");
    const hasCold = /\b(cold|tofu|top of funnel)\b/.test(norm);
    const hasWarm = /\b(warm|mofu|bofu|mid funnel|bottom of funnel)\b/.test(norm);
    if ((hasUnaware && hasProblem) || hasCold)
        return "primerUnawareProblemAware";
    if ((hasSolution && hasProduct) || hasWarm)
        return "primerSolutionProductAware";
    if (norm.startsWith("primer")) {
        if (hasUnaware)
            return "primerUnawareProblemAware";
        if (hasProblem)
            return "primerUnawareProblemAware";
        if (hasSolution)
            return "primerSolutionProductAware";
        if (hasProduct)
            return "primerSolutionProductAware";
    }
    if (norm === "unaware")
        return "primerUnawareProblemAware";
    if (norm.startsWith("problem aware"))
        return "primerUnawareProblemAware";
    if (norm.startsWith("solution aware"))
        return "primerSolutionProductAware";
    if (norm.startsWith("product aware"))
        return "primerSolutionProductAware";
    return null;
}
function parseFoundationMarkdown(md) {
    const lines = md.split(/\r?\n/);
    const sections = [];
    let current = null;
    for (const line of lines) {
        const h2 = line.match(/^##\s+(.+?)\s*$/);
        if (h2) {
            if (current)
                sections.push(finalizeSection(current));
            const key = headerToFieldKey(h2[1]);
            if (key) {
                current = { fieldKey: key, body: "", headerLine: h2[1] };
            }
            else {
                current = null;
            }
            continue;
        }
        if (current) {
            current.body += line + "\n";
        }
    }
    if (current)
        sections.push(finalizeSection(current));
    const byField = new Map();
    for (const s of sections)
        byField.set(s.fieldKey, s);
    return [...byField.values()];
}
function finalizeSection(s) {
    return { ...s, body: s.body.replace(/^\s*\n+/, "").trimEnd() };
}
async function readAllStdin() {
    return await new Promise((resolve, reject) => {
        let buf = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", (chunk) => {
            buf += chunk;
        });
        process.stdin.on("end", () => resolve(buf));
        process.stdin.on("error", reject);
    });
}
async function runSave(filePath) {
    if (!filePath) {
        fail("missing path. usage: exodus foundation save <path>  (use \"-\" to read from stdin)");
    }
    let md;
    if (filePath === "-") {
        md = await readAllStdin();
    }
    else {
        const resolved = path.resolve(process.cwd(), filePath);
        try {
            md = fs.readFileSync(resolved, "utf-8");
        }
        catch (err) {
            fail(`could not read ${resolved}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    if (!md.trim())
        fail(`source is empty (path: ${filePath})`);
    const sourceLabel = filePath === "-" ? "stdin" : path.resolve(process.cwd(), filePath);
    const sections = parseFoundationMarkdown(md);
    if (sections.length === 0) {
        fail(`no recognized H2 sections found in ${sourceLabel}. ` +
            `Use headers like "## Audience Concerns", "## Brand Voice", ` +
            `"## Primer (Unaware)", etc.`);
    }
    console.log(`Found ${sections.length} section(s) in ${sourceLabel}:`);
    for (const s of sections)
        console.log(`  - ${s.fieldKey} (from "${s.headerLine}")`);
    console.log("");
    let saved = 0;
    for (const s of sections) {
        if (!s.body.trim()) {
            console.log(`  → skipping ${s.fieldKey}: section body is empty`);
            continue;
        }
        process.stdout.write(`Saving ${s.fieldKey} (${s.body.length} chars)…`);
        await saveField(s.fieldKey, s.body);
        process.stdout.write(" ✓\n");
        saved++;
    }
    console.log(`\nSaved ${saved} of ${sections.length} fields. Final status:`);
    const status = await fetchStatus();
    printStatus(status);
}
async function runSet(fieldKey, flags) {
    if (!fieldKey)
        fail("missing field. usage: exodus foundation set <field> --value <text> | --file <path>");
    if (!FIELD_KEYS.has(fieldKey)) {
        fail(`invalid field "${fieldKey}". must be one of: ${[...FIELD_KEYS].join(", ")}`);
    }
    let value = null;
    if (typeof flags.value === "string")
        value = flags.value;
    else if (flags.stdin === true) {
        value = await readAllStdin();
    }
    else if (typeof flags.file === "string") {
        if (flags.file === "-") {
            value = await readAllStdin();
        }
        else {
            const resolved = path.resolve(process.cwd(), flags.file);
            try {
                value = fs.readFileSync(resolved, "utf-8");
            }
            catch (err) {
                fail(`could not read ${resolved}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    if (value === null || !value.trim()) {
        fail("missing or empty content. provide --value <text> | --file <path> | --stdin (or --file -).");
    }
    await saveField(fieldKey, value);
    console.log(`✓ saved ${fieldKey} (${value.length} chars).`);
    const status = await fetchStatus();
    printStatus(status);
}
async function runInteractive(flags) {
    const status = await fetchStatus();
    printStatus(status);
    const source = await pickSource(flags);
    if (!source) {
        console.log("Aborted.");
        return;
    }
    process.stdout.write("\nFetching source…\n");
    const sourceResp = await fetchSource(source.kind, source.value);
    const truncNote = sourceResp.truncated ? " (truncated)" : "";
    console.log(`Source: ${sourceResp.label} — ${sourceResp.chars} chars${truncNote}`);
    const fieldByKey = new Map(status.fields.map((f) => [f.key, f]));
    for (const key of FIELD_ORDER) {
        const field = fieldByKey.get(key);
        if (!field)
            continue;
        await walkField(field, sourceResp.text);
    }
    console.log("\n── Final status ──");
    const finalStatus = await fetchStatus();
    printStatus(finalStatus);
}
function readPositionals() {
    const argv = process.argv.slice(3);
    const out = [];
    let i = 0;
    while (i < argv.length) {
        const a = argv[i];
        if (a.startsWith("--")) {
            const next = argv[i + 1];
            i += next !== undefined && !next.startsWith("--") ? 2 : 1;
            continue;
        }
        out.push(a);
        i++;
    }
    return out;
}
export async function run(flags) {
    const positionals = readPositionals();
    const sub = positionals[0];
    if (sub === "status") {
        await runStatus();
        return;
    }
    if (sub === "save") {
        await runSave(positionals[1] ?? "");
        return;
    }
    if (sub === "set") {
        await runSet(positionals[1] ?? "", flags);
        return;
    }
    await runInteractive(flags);
}
