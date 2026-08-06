import { apiGet } from "./client.js";
import { isTerminalRunStatus, normalizeRunStatus } from "./runStatus.js";

export interface PollOptions {
  path: string;
  intervalMs?: number;
  timeoutMs?: number;
  /**
   * Additional statuses that should stop polling (e.g. phase boundaries like
   * genesis's `awaiting_hook_selection`). ADDITIVE to the canonical terminal
   * set below — never a replacement.
   */
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

  // #994: the canonical terminal check spans BOTH vocabularies (a published CLI
  // meets old and new backends), so this set only carries the caller's EXTRA
  // stop-words — phase boundaries that are not run-terminal at all.
  const extraTerminal = new Set(terminalStatuses ?? []);
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

    // A dead run always terminates, whatever isDone says — an isDone that waits
    // on downstream output would never fire, so the poll would burn to timeout.
    // #994: "dead" is failed OR cancelled, in either vocabulary
    // (failed/error/stalled, cancelled/canceled/superseded).
    const canonical = status ? normalizeRunStatus(status) : undefined;
    if (canonical === "failed" || canonical === "cancelled") {
      return { ok: false, data: res.data, timedOut: false };
    }

    // Otherwise both checks must agree: the status-based terminator (canonical
    // terminal set ∪ the caller's extra stop-words) AND any caller isDone.
    const statusTerminal = status
      ? isTerminalRunStatus(status) || extraTerminal.has(status)
      : false;
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
