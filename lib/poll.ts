import { apiGet } from "./client.js";

const DEFAULT_TERMINAL_STATUSES = ["completed", "failed"];

export interface PollOptions {
  path: string;
  intervalMs?: number;
  timeoutMs?: number;
  /** Additional statuses that should stop polling (e.g. phase boundaries). */
  terminalStatuses?: string[];
  onProgress?: (data: Record<string, unknown>) => void;
  /**
   * Custom done-check. When provided, runs after the default status-based
   * terminal check. Returning true stops the poll loop. Used by scoutclone
   * --idea, where the parent scrapeRun flips to "completed" before the
   * child write-pipeline lands a Doc URL on the idea row.
   */
  isDone?: (data: Record<string, unknown>) => boolean;
}

export interface PollResult {
  ok: boolean;
  data: Record<string, unknown>;
  timedOut: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntilDone(opts: PollOptions): Promise<PollResult> {
  const {
    path,
    intervalMs = 3000,
    timeoutMs = 600_000,
    terminalStatuses,
    onProgress,
    isDone,
  } = opts;

  const terminal = new Set([...DEFAULT_TERMINAL_STATUSES, ...(terminalStatuses ?? [])]);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const res = await apiGet<Record<string, unknown>>(path);

    if (onProgress) {
      onProgress(res.data);
    }

    const status =
      typeof res.data["status"] === "string" ? res.data["status"] : undefined;

    if (!res.ok) {
      return { ok: false, data: res.data, timedOut: false };
    }

    // status=failed always terminates. Otherwise both checks must agree:
    // the default status-based terminator AND any caller-supplied isDone.
    if (status === "failed") {
      return { ok: false, data: res.data, timedOut: false };
    }

    const statusTerminal = status ? terminal.has(status) : false;
    const customDone = isDone ? isDone(res.data) : true;
    if (statusTerminal && customDone) {
      return { ok: true, data: res.data, timedOut: false };
    }

    if (Date.now() + intervalMs > deadline) {
      return { ok: false, data: res.data, timedOut: true };
    }

    await delay(intervalMs);
  }
}
