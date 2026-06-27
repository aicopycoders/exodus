import { apiGetDashboard } from "../lib/client.js";

interface DocEntry {
  docId: string;
  label: string;
  driveUrl: string;
  source: "gws-live" | "cache" | "unavailable";
  generatedAt?: string;
  content?: string;
  hint?: string;
}
interface ReadDocResponse {
  runId: string;
  docs: DocEntry[];
  generatedAt: string;
}

export const helpText = `
exodus read-doc — Print all tabs of a run's Google Doc(s) as markdown

Usage:
  exodus read-doc <runId>

Exit codes:
  0  Content returned (gws-live or cache)
  2  All docs unavailable — fall back to Drive MCP
  1  Error (network failure, runId not found, missing arg)
`.trim();

export async function runReadDoc(args: string[]): Promise<void> {
  const runId = args[0];
  if (!runId) {
    console.error("Usage: exodus read-doc <runId>");
    process.exit(1);
    return;
  }

  const res = await apiGetDashboard<ReadDocResponse | { error?: string }>(
    `/api/runs/${encodeURIComponent(runId)}/document`,
  );
  if (!res.ok) {
    const err = (res.data as { error?: string })?.error ?? `HTTP ${res.status}`;
    console.error(`exodus read-doc: ${err}`);
    process.exit(1);
    return;
  }

  const body = res.data as ReadDocResponse;
  const allUnavailable = body.docs.every((d) => d.source === "unavailable");
  let printedAny = false;

  body.docs.forEach((doc, idx) => {
    if (idx > 0) console.log("\n---\n");
    const provenance =
      `<!-- source: ${doc.source} | docId: ${doc.docId} | label: ${doc.label}` +
      `${doc.generatedAt ? ` | generatedAt: ${doc.generatedAt}` : ""} -->`;
    console.log(provenance);
    if (doc.content) {
      console.log(doc.content);
      printedAny = true;
    } else {
      console.log(`<!-- driveUrl: ${doc.driveUrl} -->`);
      if (doc.hint) console.error(`exodus read-doc: ${doc.hint}`);
    }
  });

  if (allUnavailable) {
    process.exit(2);
    return;
  }
  if (!printedAny) {
    process.exit(1);
    return;
  }
  process.exit(0);
}

export async function run(flags: Record<string, string | boolean>): Promise<void> {
  // Collect positional args after the command name — flags parser strips
  // --flag values, leaving bare strings as unrecognised tokens. For
  // read-doc, the runId is the only positional and it won't start with "--".
  // Re-read from process.argv to get raw positionals.
  const argv = process.argv.slice(2); // strip 'node' + script
  const positionals = argv.filter(
    (a, i) =>
      !a.startsWith("--") &&
      (i === 0 || !argv[i - 1]?.startsWith("--") || argv[i - 1] === "--"),
  );
  // positionals[0] is the command name ("read-doc"), positionals[1] is the runId
  const runId = positionals[1];
  await runReadDoc(runId ? [runId] : []);
}
