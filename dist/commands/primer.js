import fs from "node:fs";
import path from "node:path";
import { apiGetDashboard, apiPostDashboard } from "../lib/client.js";
import { promptChoice, promptMultiline, openInEditor } from "../lib/prompts.js";
import { refreshBrandProfileMd } from "./brand.js";
export const helpText = `
exodus primer — Build a brand's primer (the single foundation step)

A brand needs ONE thing before it can run the pipelines: a primer. The primer
builder reads your winning ads + product facts and writes a modular primer
document the writers use to construct new ads. Once it's saved, the brand is
ready for Genesis.

The build also seeds a HOOK BANK from the primer's HOOK section. Add a HEADLINE
BANK separately with \`exodus primer headlines\`. Both banks are injected into the
hook/headline writing stages as brand-specific examples.

Subcommands:
  exodus primer                 Interactive build (paste ads → review → save)
  exodus primer status          Show whether this brand has a primer / is ready
  exodus primer show            Print the saved primer
  exodus primer set --file <path>
  exodus primer set --value <text>
  exodus primer set --stdin     Save a primer you already have, skipping the bot
  exodus primer headlines       Save the headline bank (paste, or --file/--stdin/--value)
  exodus primer steering        Set a primer's "always use / don't use" steering
  exodus primer steering show   Print the steering saved for all four primers

Steering picks one of the four primers and sets the brand's guidance for it —
the same "always use / don't use" the dashboard Primer editor writes. The
Genesis writer for that primer honors it on every run.

  exodus primer steering --lane <lane> --always "<text>" --never "<text>"
  exodus primer steering --lane <lane> --always-file <path>
  exodus primer steering        (interactive: pick a primer, then enter guidance)

  <lane> is one of: bodyUnaware | bodyAware | hooks | headlines
  (aliases: body-unaware/unaware/problem-aware, body-aware/solution-aware/
   product-aware/most-aware, hook, headline). Setting just one of --always /
   --never leaves the other field as-is.

Interactive build flags:
  --file <path>   Read the submission (winning ads + product info) from a file
                  instead of pasting it interactively. Use --file - to read
                  the submission from stdin.
  --yes           Build and save without the interactive confirmation — for
                  non-interactive shells like Claude Code. Pairs with --file
                  (or --file -); rebuilds in place if a primer already exists.

The submission should include 10+ winning ads (full copy) and the product name
and core function. Differentiators, proof points, customer stories, offer
details, and villain framing are recommended but optional.
`.trim();
const INPUT_REQUIREMENTS = `
BRAND PRIMER BUILDER — INPUT REQUIREMENTS

REQUIRED:
  - Winning ads — 10+ recommended (paste full ad copy for each)
  - Product name and core function

RECOMMENDED:
  - Product differentiators
  - Key statistics or proof points
  - Customer stories
  - Pricing and offer details
  - Villain framing
  - Urgency or scarcity language in use

Paste everything together below.
`.trim();
function fail(msg, code = 1) {
    console.error(`exodus primer: ${msg}`);
    process.exit(code);
}
function printApiError(prefix, status, data) {
    const body = data;
    const detail = body?.hint ?? body?.detail ?? body?.error ?? `HTTP ${status}`;
    console.error(`exodus primer: ${prefix}: ${detail}`);
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
async function fetchStatus() {
    const res = await apiGetDashboard("/api/primer/status");
    if (!res.ok) {
        printApiError("status check failed", res.status, res.data);
        process.exit(1);
    }
    return res.data;
}
function printStatus(s) {
    const brandLabel = s.brand ? `${s.brand.name} (${s.brand.slug})` : "(brand not resolved)";
    console.log(`\nBrand:  ${brandLabel}`);
    if (s.ready) {
        console.log(`Status: ✓ Ready — primer saved (${s.chars} chars)`);
    }
    else {
        console.log(`Status: ✗ Not ready — no primer yet. Run: exodus primer`);
    }
    console.log("");
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function buildPrimer(submission) {
    console.log("\nBuilding primer… this reads every ad and writes the full module");
    console.log("taxonomy. It runs in the background — I'll poll until it's done");
    console.log("(Ctrl-C is safe; the build keeps running).\n");
    const enqueue = await apiPostDashboard("/api/primer/build", {
        submission,
    });
    if (!enqueue.ok) {
        printApiError("primer build failed to start", enqueue.status, enqueue.data);
        process.exit(1);
    }
    const buildId = enqueue.data.buildId;
    if (!buildId)
        fail("primer build did not return a buildId");
    const POLL_INTERVAL_MS = 5_000;
    const MAX_POLLS = 180;
    for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_INTERVAL_MS);
        const res = await apiGetDashboard(`/api/primer/build/${buildId}`);
        if (!res.ok) {
            if (res.status >= 400 && res.status < 500) {
                printApiError("primer build status check failed", res.status, res.data);
                process.exit(1);
            }
            process.stdout.write("·");
            continue;
        }
        const data = res.data;
        if (!data.isTerminal) {
            process.stdout.write("·");
            continue;
        }
        if (data.status === "failed") {
            console.log("");
            fail(`primer build failed: ${data.error ?? "unknown error"}`);
        }
        const primer = (data.primer ?? "").trim();
        if (!primer)
            fail("primer build returned empty output");
        console.log("");
        return { primer, missing: data.missing ?? [] };
    }
    fail("primer build timed out; check the dashboard and retry");
}
async function savePrimer(value) {
    const res = await apiPostDashboard("/api/primer/set", { value });
    if (!res.ok) {
        printApiError("save failed", res.status, res.data);
        process.exit(1);
    }
    return res.data;
}
async function saveFoundationField(fieldKey, value) {
    const res = await apiPostDashboard("/api/primer/set", { value, fieldKey });
    if (!res.ok) {
        printApiError(`${fieldKey} save failed`, res.status, res.data);
        process.exit(1);
    }
    return res.data;
}
function reportSplit(split) {
    if (!split)
        return;
    if (split.saved.length) {
        console.log(`  ✓ split into ${split.saved.length} primers: ${split.saved.join(", ")}.`);
    }
    if (split.missing.length) {
        console.log(`  ⚠ no ads classified into: ${split.missing.join("; ")}.`);
        console.log("    These primers are empty. Re-run `exodus primer` with ads for those");
        console.log("    categories to populate them. Until then, runs for those categories");
        console.log("    fall back to your other primer.");
    }
}
async function refreshProfileAfterSave() {
    try {
        const r = await refreshBrandProfileMd();
        if (r.written) {
            console.log(`  ✓ refreshed ${r.pathRel} from the saved foundation.`);
        }
        else {
            console.log(`  ⚠ could not refresh ${r.pathRel}: ${r.reason}`);
        }
    }
    catch (err) {
        console.log(`  ⚠ could not refresh the brand profile: ${err instanceof Error ? err.message : String(err)}`);
    }
}
function readFileArg(filePath) {
    if (filePath === "-")
        return "";
    const resolved = path.resolve(process.cwd(), filePath);
    let text;
    try {
        text = fs.readFileSync(resolved, "utf-8");
    }
    catch (err) {
        fail(`could not read ${resolved}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!text.trim())
        fail(`file is empty: ${resolved}`);
    return text;
}
async function collectSubmission(flags) {
    if (typeof flags.file === "string" && flags.file) {
        if (flags.file === "-") {
            const text = await readAllStdin();
            if (!text.trim())
                fail("no submission on stdin");
            return text;
        }
        return readFileArg(flags.file);
    }
    console.log(`\n${INPUT_REQUIREMENTS}\n`);
    const text = await promptMultiline("Paste your winning ads + product info (Ctrl-D when done):");
    if (!text.trim())
        fail("no submission entered");
    return text;
}
async function afterPrimerSaved(result) {
    console.log(result.ready
        ? "  ✓ Brand is now ready for Genesis."
        : `  ✗ Still not ready: ${result.missing.join(", ")}`);
    reportSplit(result.split);
    await refreshProfileAfterSave();
}
async function confirmAndSave(build, autoYes = false) {
    if (autoYes) {
        const result = await savePrimer(build.primer);
        console.log(`\n  ✓ saved primer (${result.chars} chars).`);
        await afterPrimerSaved(result);
        return true;
    }
    box("PRIMER — review", build.primer);
    for (;;) {
        const choice = await promptChoice("Save this primer to the brand?", [
            { key: "a", label: "accept & save" },
            { key: "e", label: "edit in $EDITOR, then save" },
            { key: "v", label: "view again" },
            { key: "q", label: "quit without saving" },
        ], "a");
        if (choice === "a") {
            const result = await savePrimer(build.primer);
            console.log(`\n  ✓ saved primer (${result.chars} chars).`);
            await afterPrimerSaved(result);
            return true;
        }
        if (choice === "e") {
            const edited = openInEditor(build.primer);
            if (edited === null || !edited.trim()) {
                console.log("  → editor exited empty / non-zero. Try again.");
                continue;
            }
            const result = await savePrimer(edited);
            console.log(`\n  ✓ saved primer (${result.chars} chars, edited).`);
            await afterPrimerSaved(result);
            return true;
        }
        if (choice === "v") {
            box("PRIMER — review", build.primer);
            continue;
        }
        if (choice === "q") {
            console.log("  → not saved.");
            return false;
        }
    }
}
async function runStatus() {
    printStatus(await fetchStatus());
}
async function runShow() {
    const res = await apiGetDashboard("/api/primer");
    if (!res.ok) {
        printApiError("show failed", res.status, res.data);
        process.exit(1);
    }
    const data = res.data;
    if (!data.primer) {
        console.log("No primer saved for this brand yet. Run: exodus primer");
        return;
    }
    console.log(data.primer);
}
async function runSet(flags) {
    let value = null;
    if (typeof flags.value === "string") {
        value = flags.value;
    }
    else if (flags.stdin === true) {
        value = await readAllStdin();
    }
    else if (typeof flags.file === "string") {
        value = flags.file === "-" ? await readAllStdin() : readFileArg(flags.file);
    }
    if (value === null || !value.trim()) {
        fail("missing or empty content. provide --value <text> | --file <path> | --stdin (or --file -).");
    }
    const result = await savePrimer(value);
    console.log(`✓ saved primer (${result.chars} chars).`);
    console.log(result.ready
        ? "✓ Brand is now ready for Genesis."
        : `✗ Still not ready: ${result.missing.join(", ")}`);
    reportSplit(result.split);
    await refreshProfileAfterSave();
}
async function runHeadlines(flags) {
    let value = null;
    if (typeof flags.value === "string") {
        value = flags.value;
    }
    else if (flags.stdin === true) {
        value = await readAllStdin();
    }
    else if (typeof flags.file === "string") {
        value = flags.file === "-" ? await readAllStdin() : readFileArg(flags.file);
    }
    else {
        console.log("\nPaste your 10–15 winning headlines (one per line). Ctrl-D when done:\n");
        value = await promptMultiline("Winning headlines:");
    }
    if (value === null || !value.trim()) {
        fail("no headlines provided. Use --file <path> | --stdin | --value <text>, or paste interactively.");
    }
    const result = await saveFoundationField("headlineBank", value);
    console.log(`✓ saved headline bank (${result.chars} chars).`);
    console.log("  These headlines now prime the headline writing stage as brand examples.");
}
async function runInteractive(flags) {
    const autoYes = flags.yes === true;
    const status = await fetchStatus();
    printStatus(status);
    if (status.hasPrimer && !autoYes) {
        const choice = await promptChoice("This brand already has a primer. Rebuild it?", [
            { key: "r", label: "rebuild (replace it)" },
            { key: "s", label: "show the current one" },
            { key: "q", label: "quit" },
        ], "q");
        if (choice === "q")
            return;
        if (choice === "s") {
            await runShow();
            return;
        }
    }
    const submission = await collectSubmission(flags);
    for (;;) {
        const build = await buildPrimer(submission);
        const saved = await confirmAndSave(build, autoYes);
        if (saved)
            return;
        const again = await promptChoice("Build again from the same submission?", [
            { key: "r", label: "rebuild" },
            { key: "q", label: "quit" },
        ], "q");
        if (again === "q")
            return;
    }
}
const LANE_LABELS = {
    bodyUnaware: "PRIMER 1 — body copy (unaware / problem-aware)",
    bodyAware: "PRIMER 2 — body copy (solution / product-aware)",
    hooks: "PRIMER 3 — hooks",
    headlines: "PRIMER 4 — headlines",
};
const LANE_ALIASES = {
    bodyunaware: "bodyUnaware",
    "body-unaware": "bodyUnaware",
    unaware: "bodyUnaware",
    "problem-aware": "bodyUnaware",
    problemaware: "bodyUnaware",
    bodyaware: "bodyAware",
    "body-aware": "bodyAware",
    aware: "bodyAware",
    "solution-aware": "bodyAware",
    solutionaware: "bodyAware",
    "product-aware": "bodyAware",
    productaware: "bodyAware",
    "most-aware": "bodyAware",
    mostaware: "bodyAware",
    hooks: "hooks",
    hook: "hooks",
    headlines: "headlines",
    headline: "headlines",
};
function resolveLane(input) {
    return LANE_ALIASES[input.trim().toLowerCase()] ?? null;
}
function resolveSteeringField(flags, key) {
    const fileVal = flags[`${key}-file`];
    if (typeof fileVal === "string")
        return readFileArg(fileVal);
    const val = flags[key];
    if (typeof val === "string")
        return val;
    if (val === true) {
        fail(`--${key} needs a value, e.g. --${key} "lead with the 273% stat"`);
    }
    return undefined;
}
function printSteeringField(label, val) {
    const text = (val ?? "").trim();
    console.log(`    ${label} ${text || "— none —"}`);
}
function printSteeringShow(data) {
    const brandLabel = data.brand ? `${data.brand.name} (${data.brand.slug})` : "(brand not resolved)";
    console.log(`\nBrand: ${brandLabel}\n`);
    const ps = data.primerSteering ?? {};
    Object.keys(LANE_LABELS).forEach((lane) => {
        console.log(LANE_LABELS[lane]);
        printSteeringField("always use:", ps[lane]?.alwaysDo);
        printSteeringField("don't use: ", ps[lane]?.neverMention);
        console.log("");
    });
}
async function runSteering(flags) {
    if (readPositionals()[1] === "show") {
        const res = await apiGetDashboard("/api/primer/steering");
        if (!res.ok) {
            printApiError("steering show failed", res.status, res.data);
            process.exit(1);
        }
        printSteeringShow(res.data);
        return;
    }
    let lane;
    let alwaysDo;
    let neverMention;
    if (typeof flags.lane === "string") {
        const resolved = resolveLane(flags.lane);
        if (!resolved) {
            fail(`unknown --lane "${flags.lane}". Use one of: ${Object.keys(LANE_LABELS).join(", ")} (or an alias).`);
        }
        lane = resolved;
        alwaysDo = resolveSteeringField(flags, "always");
        neverMention = resolveSteeringField(flags, "never");
        if (alwaysDo === undefined && neverMention === undefined) {
            fail('nothing to set. Provide --always "<text>" and/or --never "<text>" (or --always-file/--never-file).');
        }
    }
    else {
        const byKey = {
            "1": "bodyUnaware",
            "2": "bodyAware",
            "3": "hooks",
            "4": "headlines",
        };
        const choiceKey = await promptChoice("Which primer's steering do you want to set?", [
            { key: "1", label: LANE_LABELS.bodyUnaware },
            { key: "2", label: LANE_LABELS.bodyAware },
            { key: "3", label: LANE_LABELS.hooks },
            { key: "4", label: LANE_LABELS.headlines },
        ], "1");
        lane = byKey[choiceKey];
        console.log(`\nSetting steering for ${LANE_LABELS[lane]}.`);
        console.log("Leave a field empty (just Ctrl-D) to leave it unchanged.\n");
        const a = (await promptMultiline("ALWAYS use (Ctrl-D when done):")).trim();
        const n = (await promptMultiline("DON'T use (Ctrl-D when done):")).trim();
        alwaysDo = a || undefined;
        neverMention = n || undefined;
        if (alwaysDo === undefined && neverMention === undefined) {
            console.log("\n  → nothing entered; steering unchanged.");
            return;
        }
    }
    const payload = { lane };
    if (alwaysDo !== undefined)
        payload.alwaysDo = alwaysDo;
    if (neverMention !== undefined)
        payload.neverMention = neverMention;
    const res = await apiPostDashboard("/api/primer/steering", payload);
    if (!res.ok) {
        printApiError("steering save failed", res.status, res.data);
        process.exit(1);
    }
    const data = res.data;
    console.log(`\n  ✓ saved steering for ${LANE_LABELS[lane]}.`);
    printSteeringField("always use:", data.steering?.alwaysDo);
    printSteeringField("don't use: ", data.steering?.neverMention);
    console.log("");
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
    const sub = readPositionals()[0];
    if (sub === "status") {
        await runStatus();
        return;
    }
    if (sub === "show") {
        await runShow();
        return;
    }
    if (sub === "set") {
        await runSet(flags);
        return;
    }
    if (sub === "headlines") {
        await runHeadlines(flags);
        return;
    }
    if (sub === "steering") {
        await runSteering(flags);
        return;
    }
    await runInteractive(flags);
}
