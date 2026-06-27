#!/usr/bin/env node
/**
 * Genesis API streaming helper (Node) — feature-parity port of genesis-stream.py.
 *
 * Usage:
 *   node genesis-stream.mjs <bot-slug> <prompt-file> <output-file> [temperature]
 *
 * Reads the prompt from <prompt-file>, calls the Genesis chat/completions endpoint
 * with streaming on, accumulates the SSE stream, and writes the full text to
 * <output-file>. Streaming is used because long generations would otherwise hit
 * proxy read-timeouts; the server sends SSE heartbeats to keep the connection alive.
 *
 * Credentials are read from a local .env automatically (see loadEnv). Real shell
 * env vars take precedence. Dependency-free — Node built-ins only.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── Pure logic (unit-tested) ───────────────────────────────────────

export function parseEnvText(text) {
  const out = {};
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// Bucket candidate keys by prefix (sk-or- = OpenRouter, else Anthropic),
// first match wins — regardless of which env var they came from.
export function classifyKeys(candidates) {
  const present = candidates.filter((k) => k);
  const anthropicKey = present.find((k) => !k.startsWith("sk-or-")) ?? null;
  const openrouterKey = present.find((k) => k.startsWith("sk-or-")) ?? null;
  return { anthropicKey, openrouterKey };
}

export function overrideModelOf(model) {
  const at = model.indexOf("@");
  return at === -1 ? "" : model.slice(at + 1);
}

// A non-Claude override (openai/gpt-5, google/…) can only run via OpenRouter.
// Claude ids are "claude-*" (no slash); "anthropic/…" is Claude-via-OpenRouter.
export function needsOpenRouter(overrideModel) {
  return overrideModel.includes("/") && !overrideModel.startsWith("anthropic/");
}

export function selectProviderKey({ anthropicKey, openrouterKey }, overrideModel) {
  if (needsOpenRouter(overrideModel)) {
    if (!openrouterKey) {
      return {
        ok: false,
        error:
          `model '${overrideModel}' needs an OpenRouter key (sk-or-…), but your .env has ` +
          `no OpenRouter key. Add one from openrouter.ai/keys (as OPENROUTER_API_KEY) — an ` +
          `OpenRouter key serves every model. Or request a Claude model (claude-*) to use ` +
          `your Anthropic key.`,
      };
    }
    return { ok: true, providerKey: openrouterKey, routing: "OpenRouter" };
  }
  if (anthropicKey) return { ok: true, providerKey: anthropicKey, routing: "Anthropic" };
  if (openrouterKey) return { ok: true, providerKey: openrouterKey, routing: "OpenRouter" };
  return {
    ok: false,
    error:
      "no provider key found. Add ANTHROPIC_API_KEY (sk-ant-…) or OPENROUTER_API_KEY " +
      "(sk-or-…) to your .env — or run `npx @aicopycoders/exodus keys pull` to sync it from the dashboard.",
  };
}

// Extract delta text / finish_reason / error from one parsed SSE chunk.
// Tolerates empty or absent `choices` arrays (final/usage-only chunks send
// `choices: []`, which is truthy in JS — the Python original leaned on
// empty-list-is-falsy, which does not port).
export function parseStreamChunk(chunk) {
  if (chunk && chunk.error) {
    const e = chunk.error;
    return { error: `${e.type || "stream_error"}: ${e.message || JSON.stringify(e)}` };
  }
  const choice = ((chunk && chunk.choices) || [])[0] || {};
  return {
    content: (choice.delta || {}).content || "",
    finishReason: choice.finish_reason || null,
  };
}

export function normalizeBase(url) {
  let base = url.replace(/\/+$/, "");
  if (!base.endsWith("/api/v1")) base += "/api/v1";
  return base;
}

// ── .env autoload (mirrors the Python loader) ──────────────────────
// Walk up from `start` to the project root (the dir holding `.claude/`) and
// return its `.env`, so one root .env serves a bundled install from any subdir.
function findProjectRootEnv(startFile) {
  let dir = dirname(startFile);
  while (true) {
    const parent = dirname(dir);
    if (parent === dir) return null; // reached fs root
    dir = parent;
    if (existsSync(join(dir, ".claude")) && statSync(join(dir, ".claude")).isDirectory()) {
      return join(dir, ".env");
    }
  }
}

// Order (first to set a key wins; real shell env always wins): next to this
// script, the skill folder above it, the project root (.claude parent), the cwd.
function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, ".env"), join(dirname(here), ".env")];
  const rootEnv = findProjectRootEnv(fileURLToPath(import.meta.url));
  if (rootEnv) candidates.push(rootEnv);
  candidates.push(join(process.cwd(), ".env"));

  const loaded = [];
  for (const file of candidates) {
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    loaded.push(file);
    const parsed = parseEnvText(readFileSync(file, "utf8"));
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v; // setdefault: shell env wins
    }
  }
  return loaded;
}

// Apply one raw SSE line to the streaming accumulator. Returns the next state.
// `state` = { content, finishReason, sawDone, errorMsg, stop }.
// `stop` signals the caller to stop reading (saw [DONE] or an error).
export function applySSELine(rawLine, state) {
  if (state.stop) return state;
  const line = rawLine.trim();
  if (!line.startsWith("data: ")) return state;
  if (line === "data: [DONE]") return { ...state, sawDone: true, stop: true };
  let chunk;
  try {
    chunk = JSON.parse(line.slice(6));
  } catch {
    return state;
  }
  const parsed = parseStreamChunk(chunk);
  if (parsed.error) return { ...state, errorMsg: parsed.error, stop: true };
  return {
    ...state,
    content: state.content + parsed.content,
    finishReason: parsed.finishReason || state.finishReason,
  };
}

// ── CLI ────────────────────────────────────────────────────────────

async function main() {
  const loadedEnvFiles = loadEnv();
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("usage: genesis-stream.mjs <bot-slug> <prompt-file> <output-file> [temperature]");
    process.exit(2);
  }
  const [model, promptFile, outputFile] = args;

  // Fix 2: loudly reject a non-numeric temperature arg.
  let temperature = null;
  if (args.length > 3) {
    const raw = args[3];
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      console.error(`ERROR: temperature must be a number (got '${raw}')`);
      process.exit(2);
    }
    temperature = parsed;
  }

  const { anthropicKey, openrouterKey } = classifyKeys([
    process.env.ANTHROPIC_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.GENESIS_PROVIDER_KEY,
  ]);
  const sel = selectProviderKey({ anthropicKey, openrouterKey }, overrideModelOf(model));
  if (!sel.ok) {
    console.error(`ERROR: ${sel.error}`);
    process.exit(2);
  }

  // Transparency (stderr so it never mixes into the output file).
  const envSrc = loadedEnvFiles.length ? loadedEnvFiles.join(", ") : "none found (shell env only)";
  console.error(`[genesis] model '${model}' → ${sel.routing}; .env: ${envSrc}`);

  if (!process.env.GENESIS_BASE_URL) {
    console.error("ERROR: GENESIS_BASE_URL is not set (.env or shell env).");
    process.exit(2);
  }
  if (!process.env.GENESIS_API_KEY) {
    console.error("ERROR: GENESIS_API_KEY is not set (.env or shell env).");
    process.exit(2);
  }

  const prompt = readFileSync(promptFile, "utf8");
  const base = normalizeBase(process.env.GENESIS_BASE_URL);
  const payload = {
    model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  };
  if (temperature !== null && !Number.isNaN(temperature)) payload.temperature = temperature;

  // Fail LOUDLY. The server signals errors three ways and a silent zero-char
  // "success" is worse than any: (1) non-200 before the stream, (2) a
  // data:{"error":…} SSE event mid-stream, (3) a dropped connection — caught
  // because a healthy stream ends with [DONE].
  let content = "";
  let finishReason = null;
  let sawDone = false;
  let errorMsg = null;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GENESIS_API_KEY}`,
        "X-Provider-Key": sel.providerKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      let detail = "";
      try {
        const j = JSON.parse(await res.text());
        detail = j?.error?.message ?? "";
      } catch {
        /* non-JSON body */
      }
      errorMsg = `HTTP ${res.status}: ${detail || res.statusText}`;
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let state = { content: "", finishReason: null, sawDone: false, errorMsg: null, stop: false };
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Flush any remainder that arrived without a trailing newline.
          if (buffer.trim()) {
            state = applySSELine(buffer, state);
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          state = applySSELine(raw, state);
          if (state.stop) break;
        }
        if (state.stop) break;
      }
      // Map final state back to the existing post-loop variables.
      content = state.content;
      finishReason = state.finishReason;
      sawDone = state.sawDone;
      errorMsg = state.errorMsg;
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  if (errorMsg === null && !sawDone) {
    errorMsg = "stream ended early (no [DONE] sentinel) — output is likely truncated, retry";
  }
  if (errorMsg === null && !content) {
    errorMsg = "stream completed but produced no content — retry, and check your keys if it persists";
  }

  // Always write whatever arrived — partial output can still help debugging.
  writeFileSync(outputFile, content);

  if (errorMsg) {
    console.error(`ERROR: ${errorMsg}`);
    if (content) {
      console.error(`(partial output, ${content.length} chars, saved to ${basename(outputFile)})`);
    }
    process.exit(1);
  }
  console.log(`Done: ${basename(outputFile)} (${content.length} chars, finish_reason=${finishReason})`);
}

// Run as CLI only when invoked directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
