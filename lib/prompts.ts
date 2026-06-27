import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Shared interactive-prompt primitives for exodus commands. Anything
 * that reads from stdin or shells out to $EDITOR lives here so commands
 * stay focused on their own flow.
 */

export async function promptYesNo(
  question: string,
  defaultValue = false,
): Promise<boolean> {
  const suffix = defaultValue ? "(Y/n)" : "(y/N)";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer: string = await new Promise((resolve) => {
      rl.question(`${question} ${suffix} `, resolve);
    });
    const trimmed = answer.trim();
    if (!trimmed) return defaultValue;
    return /^y(es)?$/i.test(trimmed);
  } finally {
    rl.close();
  }
}

export interface ChoiceOption {
  key: string;
  label: string;
}

/**
 * Prompt the user to pick one of a small set of options by single-letter
 * key. Returns the matched option's `key`. Loops until the input matches.
 */
export async function promptChoice(
  question: string,
  options: ChoiceOption[],
  defaultKey?: string,
): Promise<string> {
  const keys = options.map((o) => o.key.toLowerCase());
  const labelLine = options
    .map((o) =>
      o.key === defaultKey ? `[${o.key.toUpperCase()}] ${o.label}` : `[${o.key}] ${o.label}`,
    )
    .join("  ");

  for (;;) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer: string = await new Promise((resolve) => {
      rl.question(`${question}\n${labelLine}\n> `, resolve);
    });
    rl.close();
    const trimmed = answer.trim().toLowerCase();
    if (!trimmed && defaultKey) return defaultKey;
    if (keys.includes(trimmed)) return trimmed;
    process.stdout.write(`Please enter one of: ${keys.join(", ")}\n`);
  }
}

/**
 * Read a multi-line block from stdin. The user terminates input with
 * EOF (Ctrl-D on Unix, Ctrl-Z<enter> on Windows). Suitable for "paste
 * your brand brief" prompts.
 */
export async function promptMultiline(prompt: string): Promise<string> {
  process.stdout.write(`${prompt}\n(end with Ctrl-D on its own line)\n`);
  return await new Promise<string>((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    const onData = (chunk: string) => {
      buf += chunk;
    };
    const onEnd = () => {
      cleanup();
      resolve(buf);
    };
    const onError = (err: unknown) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
  });
}

/**
 * Open the user's $EDITOR (defaults to `vi`) on a temp file containing
 * `initial`, return the saved contents (with trailing newline trimmed).
 * Returns null if the editor exits non-zero or the file is unchanged
 * empty.
 */
export function openInEditor(
  initial: string,
  fileSuffix = ".md",
): string | null {
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exodus-edit-"));
  const file = path.join(dir, `edit${fileSuffix}`);
  try {
    fs.writeFileSync(file, initial, "utf-8");
    const result = spawnSync(editor, [file], { stdio: "inherit" });
    if (result.status !== 0) {
      return null;
    }
    const out = fs.readFileSync(file, "utf-8");
    return out.replace(/\n+$/, "");
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* swallow cleanup errors */
    }
  }
}

export async function promptText(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer: string = await new Promise((resolve) => {
      rl.question(`${question} `, resolve);
    });
    return answer.trim();
  } finally {
    rl.close();
  }
}
