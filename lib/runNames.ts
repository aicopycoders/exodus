// exodus/lib/runNames.ts
//
// #1347 — how the CLI NAMES and TYPES one workflow run. Both screens that
// print a run (the detail heading and the recent-runs table) call these, so
// the CLI cannot disagree with itself, and both rules are stated once here so
// it cannot drift from the dashboard either.
//
// The dashboard's copies are `runNameForRow` and `runLabelForHit` in
// src/lib/creative-suite/global-search.ts. The CLI cannot import them (this
// package compiles bin/lib/commands only), so the pair is locked by a parity
// test over a shared fixture table in exodus/__tests__/runNames.test.ts.
//
// Pure module: no Node imports, no HTTP, no I/O.

/**
 * The module key of the "+ New → Copy" face. Mirrors COPY_FACE_MODULE_KEY in
 * convex/lib/runLabels.ts — the server sends the key, not the word, so the
 * word stays a display decision each client makes for itself.
 */
export const COPY_FACE_MODULE_KEY = "copy-face";

/** What the naming rules read off a run. All optional: an older backend sends
 *  none of them, and every ordinary member workflow's run has none either. */
export interface RunNameFields {
  workflowName?: string;
  runTitle?: string;
  title?: string;
  moduleKey?: string;
}

/**
 * The run's own name: the member's rename, then the brief line the launch
 * clipped, then the workflow's name. Every run of the Copy face shares one
 * `workflowName`, so a screen reading that alone lists them all under one
 * word. "" only when the run carries nothing at all.
 */
export function runDisplayName(run: RunNameFields): string {
  return run.title || run.runTitle || run.workflowName || "";
}

/** The kind word for a table cell — the word the dashboard badges a row with. */
export function runTypeWord(run: RunNameFields): string {
  return run.moduleKey === COPY_FACE_MODULE_KEY ? "Copy run" : "Workflow";
}

/**
 * The same kind, as the noun a detail heading needs. "Copy run" already reads
 * as one; "Workflow" does not, and "Workflow run" is the exact heading this
 * screen has always printed.
 */
export function runHeadingWord(run: RunNameFields): string {
  return run.moduleKey === COPY_FACE_MODULE_KEY ? "Copy run" : "Workflow run";
}
