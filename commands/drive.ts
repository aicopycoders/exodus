import { apiGetDashboard, apiPostDashboard } from "../lib/client.js";

export const helpText = `
exodus drive — Read and write Google Drive / Docs / Sheets via the dashboard

The dashboard's Google OAuth (Settings → Google Drive) is the only auth
required. There is no local CLI to install, no keyring, no launchctl.

Usage:
  exodus drive get-doc <documentId>
  exodus drive create-doc <title> [--folder <folderId>]
  exodus drive batch-update <documentId> --requests <json>
  exodus drive list-files [--q <query>] [--page-size <n>] [--order-by <field>]
  exodus drive get-sheet <spreadsheetId> --range <A1Notation>
  exodus drive status

Examples:
  exodus drive get-doc 1abc...XYZ
  exodus drive create-doc "Draft — joint pain"
  exodus drive batch-update 1abc...XYZ --requests '[{"insertText":{"location":{"index":1},"text":"Hello"}}]'
  exodus drive list-files --q "name contains 'spark'" --page-size 10
  exodus drive get-sheet 1sht...ABC --range "Sheet1!A1:Z100"
  exodus drive status

Exit codes:
  0  Success — JSON response printed to stdout
  1  Error — message printed to stderr
  2  Drive not connected — user must visit Settings → Google Drive
`.trim();

interface ApiErrorBody {
  error?: string;
  hint?: string;
  detail?: string;
  googleError?: unknown;
  status?: number;
}

function readPositionals(): string[] {
  const argv = process.argv.slice(2);
  return argv.filter(
    (a, i) =>
      !a.startsWith("--") &&
      (i === 0 || !argv[i - 1]?.startsWith("--") || argv[i - 1] === "--"),
  );
}

function fail(msg: string, code = 1): never {
  console.error(`exodus drive: ${msg}`);
  process.exit(code);
}

function printOrFail(
  res: { ok: boolean; status: number; data: unknown },
): void {
  if (res.ok) {
    console.log(JSON.stringify(res.data, null, 2));
    process.exit(0);
  }
  const body = res.data as ApiErrorBody;
  const msg = body?.hint ?? body?.error ?? `HTTP ${res.status}`;
  // Distinguish "not connected" so the skill / doctor can react.
  if (body?.error === "drive_not_connected" || res.status === 412) {
    console.error(`exodus drive: ${msg}`);
    process.exit(2);
  }
  if (body?.googleError) {
    console.error(
      `exodus drive: ${msg}\n${JSON.stringify(body.googleError, null, 2)}`,
    );
  } else {
    console.error(`exodus drive: ${msg}`);
  }
  process.exit(1);
}

async function getDoc(documentId: string): Promise<void> {
  if (!documentId) fail("usage: exodus drive get-doc <documentId>");
  const res = await apiPostDashboard("/api/drive/docs/get", { documentId });
  printOrFail(res);
}

async function createDoc(
  title: string,
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (!title) fail("usage: exodus drive create-doc <title> [--folder <id>]");
  const folderId = typeof flags["folder"] === "string" ? flags["folder"] : undefined;
  const res = await apiPostDashboard("/api/drive/docs/create", {
    title,
    folderId,
  });
  printOrFail(res);
}

async function batchUpdate(
  documentId: string,
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (!documentId) {
    fail("usage: exodus drive batch-update <documentId> --requests <json>");
  }
  const raw = flags["requests"];
  if (typeof raw !== "string") {
    fail("--requests <json> is required (a JSON array of Docs API requests)");
  }
  let requests: unknown;
  try {
    requests = JSON.parse(raw as string);
  } catch (err) {
    fail(`--requests is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(requests)) {
    fail("--requests must be a JSON array");
  }
  const res = await apiPostDashboard("/api/drive/docs/batch-update", {
    documentId,
    requests,
  });
  printOrFail(res);
}

async function listFiles(
  flags: Record<string, string | boolean>,
): Promise<void> {
  const body: { q?: string; pageSize?: number; orderBy?: string } = {};
  if (typeof flags["q"] === "string") body.q = flags["q"];
  if (typeof flags["page-size"] === "string") {
    const n = Number(flags["page-size"]);
    if (Number.isFinite(n)) body.pageSize = n;
  }
  if (typeof flags["order-by"] === "string") body.orderBy = flags["order-by"];
  const res = await apiPostDashboard("/api/drive/files/list", body);
  printOrFail(res);
}

async function getSheet(
  spreadsheetId: string,
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (!spreadsheetId) {
    fail("usage: exodus drive get-sheet <spreadsheetId> --range <A1>");
  }
  const range = flags["range"];
  if (typeof range !== "string") {
    fail("--range <A1Notation> is required (e.g. 'Sheet1!A1:Z100')");
  }
  const res = await apiPostDashboard("/api/drive/sheets/values/get", {
    spreadsheetId,
    range,
  });
  printOrFail(res);
}

async function status(): Promise<void> {
  const res = await apiGetDashboard("/api/drive/status");
  printOrFail(res);
}

export async function run(
  flags: Record<string, string | boolean>,
): Promise<void> {
  const positionals = readPositionals();
  // positionals[0] is "drive"; positionals[1] is the subcommand.
  const sub = positionals[1];
  const arg1 = positionals[2] ?? "";

  switch (sub) {
    case "get-doc":
      return getDoc(arg1);
    case "create-doc":
      // Allow multi-word title without quotes — join remaining positionals.
      return createDoc(positionals.slice(2).join(" "), flags);
    case "batch-update":
      return batchUpdate(arg1, flags);
    case "list-files":
      return listFiles(flags);
    case "get-sheet":
      return getSheet(arg1, flags);
    case "status":
      return status();
    default:
      console.log(helpText);
      if (sub) {
        console.error(`\nUnknown subcommand: ${sub}`);
        process.exit(1);
      }
      process.exit(0);
  }
}
