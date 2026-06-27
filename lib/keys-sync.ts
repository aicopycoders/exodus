import fs from "node:fs";
import path from "node:path";
import { apiGetDashboard } from "./client.js";

/**
 * Pulls the caller's own pipeline keys from the dashboard
 * (GET /api/settings/keys, decrypted server-side, scoped to the API key's
 * user) and writes them into the workspace `.env` so the local Pixar host can
 * read them via process.env. The user enters keys once in the dashboard
 * (Settings → Pipeline Keys); this is the bridge to local files.
 *
 * Zero-dependency by design — exodus keeps an empty `dependencies` list, so
 * this uses node builtins only (matches lib/load-env.ts, lib/client.ts).
 */

// Maps a dashboard pipeline-key provider to the env var the Pixar pipeline
// code actually reads. Verified against scout/src/pixar/keys.ts (resolveLlmKey
// / resolveElevenLabsKey / resolveKieKey) and bot-call.ts (GENESIS_API_KEY).
export const PROVIDER_ENV_MAP: Record<string, string> = {
  genesis: "GENESIS_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  kie: "KIE_API_KEY",
};

export interface RemoteKeys {
  /** provider → plaintext key (only providers the user has set) */
  keys: Record<string, string>;
  /** providers whose stored ciphertext failed to decrypt server-side */
  failed: string[];
}

export async function fetchRemoteKeys(): Promise<RemoteKeys> {
  const res = await apiGetDashboard<RemoteKeys & { error?: string }>(
    "/api/settings/keys",
  );
  if (!res.ok) {
    const msg =
      (res.data as { error?: string } | null)?.error ??
      `failed to fetch keys from dashboard (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return { keys: res.data.keys ?? {}, failed: res.data.failed ?? [] };
}

/**
 * Find the nearest `.env` walking up from cwd (matches load-env / client). If
 * none exists, fall back to `<cwd>/.env` so a fresh workspace still gets one.
 */
export function resolveEnvFilePath(): string {
  let dir = process.cwd();
  for (let i = 0; i <= 5; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(process.cwd(), ".env");
}

export interface UpsertResult {
  name: string;
  action: "added" | "updated" | "unchanged";
}

/**
 * Upsert KEY=value lines into an `.env` file, preserving every other line and
 * comment. Callers must never log the values. A value containing whitespace,
 * `#`, or quotes is double-quoted so the file stays parseable.
 */
export function upsertEnvVars(
  filePath: string,
  vars: Record<string, string>,
): UpsertResult[] {
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    content = "";
  }
  const lines = content.length ? content.split(/\r?\n/) : [];
  const results: UpsertResult[] = [];

  for (const [name, value] of Object.entries(vars)) {
    const formatted = `${name}=${formatEnvValue(value)}`;
    const idx = lines.findIndex((l) => {
      const t = l.trim();
      if (!t || t.startsWith("#")) return false;
      const eq = t.indexOf("=");
      return eq > 0 && t.slice(0, eq).trim() === name;
    });
    if (idx === -1) {
      lines.push(formatted);
      results.push({ name, action: "added" });
    } else if (lines[idx] === formatted) {
      results.push({ name, action: "unchanged" });
    } else {
      lines[idx] = formatted;
      results.push({ name, action: "updated" });
    }
  }

  let out = lines.join("\n");
  if (!out.endsWith("\n")) out += "\n";
  // mode is honored only when the file is newly created; existing files keep
  // their permissions. Secrets-bearing, so create tight.
  fs.writeFileSync(filePath, out, { mode: 0o600 });
  return results;
}

/**
 * Map remote provider keys to their env-var names. Unknown providers (not in
 * PROVIDER_ENV_MAP) are skipped rather than written under a guessed name.
 */
export function mapKeysToEnvVars(
  keys: Record<string, string>,
): { vars: Record<string, string>; skipped: string[] } {
  const vars: Record<string, string> = {};
  const skipped: string[] = [];
  for (const [provider, value] of Object.entries(keys)) {
    const envName = PROVIDER_ENV_MAP[provider];
    if (envName) vars[envName] = value;
    else skipped.push(provider);
  }
  return { vars, skipped };
}

function formatEnvValue(value: string): string {
  if (/[\s#'"]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}
