import { apiGetDashboard } from "../lib/client.js";
export const helpText = `
exodus read-doc — Print all tabs of a run's Google Doc(s) as markdown

Usage:
  exodus read-doc <runId>

Exit codes:
  0  Content returned (gws-live or cache)
  2  All docs unavailable — fall back to Drive MCP
  1  Error (network failure, runId not found, missing arg)
`.trim();
export async function runReadDoc(args) {
    const runId = args[0];
    if (!runId) {
        console.error("Usage: exodus read-doc <runId>");
        process.exit(1);
        return;
    }
    const res = await apiGetDashboard(`/api/runs/${encodeURIComponent(runId)}/document`);
    if (!res.ok) {
        const err = res.data?.error ?? `HTTP ${res.status}`;
        console.error(`exodus read-doc: ${err}`);
        process.exit(1);
        return;
    }
    const body = res.data;
    const allUnavailable = body.docs.every((d) => d.source === "unavailable");
    let printedAny = false;
    body.docs.forEach((doc, idx) => {
        if (idx > 0)
            console.log("\n---\n");
        const provenance = `<!-- source: ${doc.source} | docId: ${doc.docId} | label: ${doc.label}` +
            `${doc.generatedAt ? ` | generatedAt: ${doc.generatedAt}` : ""} -->`;
        console.log(provenance);
        if (doc.content) {
            console.log(doc.content);
            printedAny = true;
        }
        else {
            console.log(`<!-- driveUrl: ${doc.driveUrl} -->`);
            if (doc.hint)
                console.error(`exodus read-doc: ${doc.hint}`);
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
export async function run(flags) {
    const argv = process.argv.slice(2);
    const positionals = argv.filter((a, i) => !a.startsWith("--") &&
        (i === 0 || !argv[i - 1]?.startsWith("--") || argv[i - 1] === "--"));
    const runId = positionals[1];
    await runReadDoc(runId ? [runId] : []);
}
