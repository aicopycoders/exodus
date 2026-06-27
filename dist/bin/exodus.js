#!/usr/bin/env node
import { loadWorkspaceEnv } from "../lib/load-env.js";
loadWorkspaceEnv();
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getVersion } from "../lib/version.js";
const OTHER_COMMANDS = new Set([
    "browse",
    "status",
    "read-doc",
    "whoami",
    "brand",
    "primer",
    "foundation",
    "drive",
    "doctor",
    "init",
    "migrate",
    "idea",
]);
const HIDDEN_COMMANDS = new Set([
    "creative",
    "template",
]);
const EXAMPLES = [
    'exodus genesis run --brief "joint pain relief in 30 days" --variants 6',
    'exodus genesis run --brief brief.txt --seeds seeds.txt',
    'exodus genesis --list-swipes',
    'exodus genesis --swipe <id>',
    'exodus image --ad "grounding sheets reduce inflammation"',
    'exodus image --type template --input "1. first ad ... 2. second ad ..."',
    'exodus image --type ref-match --refs k57abc123,k57def456 --subject "morning routine"',
    'exodus template ad-types',
    'exodus meme recommend --brief "grounding sheets reduce inflammation"',
    'exodus meme run --brief "grounding sheets reduce inflammation" --formats \'[...]\'',
    'exodus browse',
    'exodus status --id <runId> --type genesis',
];
function installedCommands() {
    const here = dirname(fileURLToPath(import.meta.url));
    const cmdDir = join(here, "..", "commands");
    try {
        return readdirSync(cmdDir)
            .filter((f) => f.endsWith(".js"))
            .map((f) => f.slice(0, -3));
    }
    catch {
        return [];
    }
}
function summaryOf(helpText) {
    if (!helpText)
        return "";
    const firstLine = helpText.split("\n").map((s) => s.trim()).find(Boolean) ?? "";
    const m = firstLine.match(/—\s*(.+)$/);
    return m ? m[1].trim() : "";
}
async function buildHelp() {
    const names = installedCommands().sort();
    const present = new Set(names);
    const pipeline = [];
    const other = [];
    for (const name of names) {
        if (HIDDEN_COMMANDS.has(name))
            continue;
        let summary = "";
        try {
            const mod = await import(`../commands/${name}.js`);
            summary = summaryOf(mod.helpText);
        }
        catch {
        }
        (OTHER_COMMANDS.has(name) ? other : pipeline).push([name, summary]);
    }
    other.push(["help", "Show this help message"]);
    const fmt = (rows) => rows.map(([n, s]) => `  ${n.padEnd(18)} ${s}`.trimEnd()).join("\n");
    const commonOptions = [
        "Common Options:",
        "  --awareness <level>    Awareness level: unaware, problem-aware, solution-aware, product-aware",
        "  --wait                 Wait for completion (default)",
        "  --no-wait              Return immediately after starting",
        "  --help, -h             Show help (top-level or per-subcommand)",
        "  --version, -v          Print the installed exodus version",
    ].join("\n");
    const examples = EXAMPLES.filter((ex) => {
        const cmd = ex.replace(/^exodus\s+/, "").split(/\s+/)[0];
        return present.has(cmd);
    });
    const sections = [
        [
            "exodus — CLI for the Viral Ad Dashboard API",
            "",
            "Usage:",
            "  exodus <command> [options]",
            "  exodus <command> --help",
        ].join("\n"),
        `Pipeline Commands:\n${fmt(pipeline)}`,
        `Other Commands:\n${fmt(other)}`,
        commonOptions,
        `Examples:\n${examples.map((e) => `  ${e}`).join("\n")}`,
    ];
    return sections.filter((s) => s.trim() !== "").join("\n\n");
}
function parseArgs(argv) {
    const [, , rawCommand = "help", ...rest] = argv;
    const command = ["--help", "-h", "-help"].includes(rawCommand) ? "help" : rawCommand;
    const flags = {};
    let i = 0;
    while (i < rest.length) {
        const arg = rest[i];
        if (arg === "--help" || arg === "-h") {
            flags["help"] = true;
            i++;
            continue;
        }
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            const next = rest[i + 1];
            if (key.startsWith("no-")) {
                flags[key.slice(3)] = false;
                i++;
            }
            else if (next !== undefined && !next.startsWith("--")) {
                flags[key] = next;
                i += 2;
            }
            else {
                flags[key] = true;
                i++;
            }
        }
        else {
            i++;
        }
    }
    return { command, flags };
}
async function main() {
    const { command, flags } = parseArgs(process.argv);
    if (["--version", "-v", "-V", "version"].includes(command)) {
        console.log(getVersion());
        process.exit(0);
    }
    if (!command || command === "help") {
        console.log(await buildHelp());
        process.exit(0);
    }
    let commandModule;
    try {
        commandModule = await import(`../commands/${command}.js`);
    }
    catch {
        console.error(`Unknown command: "${command}"\n`);
        console.log(await buildHelp());
        process.exit(1);
    }
    if (flags["help"] === true) {
        if (commandModule.helpText) {
            console.log(commandModule.helpText);
        }
        else {
            console.log(`No detailed help is available for "${command}" yet.\n`);
            console.log(await buildHelp());
        }
        process.exit(0);
    }
    if (typeof commandModule.run !== "function") {
        console.error(`Command "${command}" does not export a run() function.`);
        process.exit(1);
    }
    await commandModule.run(flags);
}
main().catch((err) => {
    console.error("Fatal error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
});
