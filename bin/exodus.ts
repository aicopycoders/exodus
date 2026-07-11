#!/usr/bin/env node

// Load workspace .env BEFORE any module that may read process.env at import
// time. ES module imports are hoisted, so this runs before commands/* are
// dynamically imported. (S-N28: tester reported `EXODUS_SCOUT_CLIENT` in
// `.env` was being ignored because the CLI never read .env — only shell
// exports were respected.)
import { loadWorkspaceEnv } from "../lib/load-env.js";
loadWorkspaceEnv();

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getVersion } from "../lib/version.js";

// Commands that are utilities rather than generative pipelines. Everything else
// present on disk is grouped under "Pipeline Commands".
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
  "segment",
  "workflow",
]);

// Commands kept runnable (back-compat / power users) but hidden from the
// top-level --help Pipeline list.
// `image` is the front door for static-image creation; `creative` and
// `template` are its engines — drive them via `exodus image` or call them
// directly with `exodus creative …` / `exodus template …`.
// `idea` (Idea Bank) and `swipe` (competitor watchlist) front the deferred
// "write from a source other than a brief" surface — only brief-mode writing
// ships today, so they stay runnable for power users but are unadvertised
// until that layer is production-ready.
const HIDDEN_COMMANDS = new Set([
  "creative",
  "template",
  "idea",
  "swipe",
]);

// Curated examples; each is shown only if its leading command is installed.
const EXAMPLES = [
  'exodus genesis run --brief "joint pain relief in 30 days" --variants 6',
  'exodus genesis run --brief brief.txt --seeds seeds.txt',
  'exodus image --ad "grounding sheets reduce inflammation"',
  'exodus image --type template --input "1. first ad ... 2. second ad ..."',
  'exodus image --type ref-match --refs k57abc123,k57def456 --subject "morning routine"',
  'exodus template ad-types',
  'exodus meme recommend --brief "grounding sheets reduce inflammation"',
  'exodus meme run --brief "grounding sheets reduce inflammation" --formats \'[...]\'',
  'exodus browse',
  'exodus status --id <runId> --type genesis',
];

function installedCommands(): string[] {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/bin
  const cmdDir = join(here, "..", "commands"); // dist/commands
  try {
    return readdirSync(cmdDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => f.slice(0, -3));
  } catch {
    return [];
  }
}

// Derive a one-line summary from a command's own helpText first line, which is
// consistently formatted as "exodus <cmd> — <description>".
function summaryOf(helpText: string | undefined): string {
  if (!helpText) return "";
  const firstLine = helpText.split("\n").map((s) => s.trim()).find(Boolean) ?? "";
  const m = firstLine.match(/—\s*(.+)$/);
  return m ? m[1].trim() : "";
}

async function buildHelp(): Promise<string> {
  const names = installedCommands().sort();
  const present = new Set(names);

  const pipeline: Array<[string, string]> = [];
  const other: Array<[string, string]> = [];
  for (const name of names) {
    // Hidden commands stay runnable but are omitted from the help listing.
    if (HIDDEN_COMMANDS.has(name)) continue;
    let summary = "";
    try {
      const mod = await import(`../commands/${name}.js`);
      summary = summaryOf(mod.helpText);
    } catch {
      /* skip a command that fails to load rather than breaking help */
    }
    (OTHER_COMMANDS.has(name) ? other : pipeline).push([name, summary]);
  }
  other.push(["help", "Show this help message"]);

  const fmt = (rows: Array<[string, string]>) =>
    rows.map(([n, s]) => `  ${n.padEnd(18)} ${s}`.trimEnd()).join("\n");

  const commonOptions = [
    "Common Options:",
    "  --awareness <level>    Awareness level: unaware, problem-aware, solution-aware, product-aware, most-aware",
    "  --wait                 Wait for completion (default)",
    "  --no-wait              Return immediately after starting",
    "  --help, -h             Show help (top-level or per-subcommand)",
    "  --version, -v          Print the installed exodus version",
  ].join("\n");

  const examples = EXAMPLES.filter((ex) => {
    const cmd = ex.replace(/^exodus\s+/, "").split(/\s+/)[0];
    return present.has(cmd);
  });

  // Each section is a block; blank-filtered then joined with a blank line so an
  // absent optional section (e.g. multi-phase on a base install) leaves no gap.
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

interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [, , rawCommand = "help", ...rest] = argv;

  // Route --help/-h/-help as the command itself to the top-level help printer.
  const command = ["--help", "-h", "-help"].includes(rawCommand) ? "help" : rawCommand;

  const flags: Record<string, string | boolean> = {};
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
        // --no-wait → { wait: false }
        flags[key.slice(3)] = false;
        i++;
      } else if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else {
      i++;
    }
  }

  return { command, flags };
}

async function main() {
  const { command, flags } = parseArgs(process.argv);

  // Version: handled before dispatch so `--version`/`-v` isn't treated as a command.
  if (["--version", "-v", "-V", "version"].includes(command)) {
    console.log(getVersion());
    process.exit(0);
  }

  // Top-level help: no command, "help" command, or --help without a subcommand.
  if (!command || command === "help") {
    console.log(await buildHelp());
    process.exit(0);
  }

  let commandModule: {
    run: (flags: Record<string, string | boolean>) => Promise<void>;
    helpText?: string;
  };
  try {
    commandModule = await import(`../commands/${command}.js`);
  } catch {
    console.error(`Unknown command: "${command}"\n`);
    console.log(await buildHelp());
    process.exit(1);
  }

  // Per-subcommand help: `exodus <cmd> --help`.
  if (flags["help"] === true) {
    if (commandModule.helpText) {
      console.log(commandModule.helpText);
    } else {
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

main().catch((err: unknown) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
