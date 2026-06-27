#!/usr/bin/env python3
"""
Genesis API streaming helper.

Usage:
    python3 genesis-stream.py <bot-slug> <prompt-file> <output-file> [temperature]

Reads the prompt from <prompt-file>, calls the Genesis chat/completions endpoint with
streaming on (the API default), accumulates the SSE stream, and writes the full text to
<output-file>. Streaming is used because long generations would otherwise hit proxy
read-timeouts; the server sends SSE heartbeats to keep the connection alive.

Credentials are read from a local .env file automatically (see load_env below) — copy
.env.example to .env and fill in your keys. Real shell env vars, if set, take precedence.

Required values (in .env or the environment) — names match the member portal:
    GENESIS_BASE_URL   API base. Default https://gas.copycoders.ai/api/v1
                       (works with or without the /api/v1 suffix).
    GENESIS_API_KEY    your Genesis access key (gen_...), sent as Authorization: Bearer
    Provider key       your LLM key, sent as X-Provider-Key — you pay usage.
                       ANTHROPIC_API_KEY (sk-ant-...) serves Claude models;
                       OPENROUTER_API_KEY (sk-or-...) serves everything (Claude,
                       GPT-5, Gemini, ...). You may set BOTH — this helper auto-picks
                       the right one for the requested model: a non-Claude override
                       (e.g. @openai/gpt-5) uses the OpenRouter key; Claude or no
                       override prefers the Anthropic key (direct, cheaper), falling
                       back to OpenRouter. Keys are classified by prefix, so one
                       pasted into the "wrong" variable still routes correctly.
                       GENESIS_PROVIDER_KEY (legacy alias) is honored too. These are
                       the names `exodus keys pull` writes.
"""
import sys, json, os, urllib.request, urllib.error
from pathlib import Path


def find_project_root_env(start):
    """Walk up from `start` to the project root (the dir holding `.claude/`) and
    return its `.env`. This is how one root .env serves the bundled Exodus install
    no matter which subdir the agent runs from. Returns None if no .claude root."""
    p = Path(start).resolve()
    for parent in p.parents:
        if (parent / ".claude").is_dir():
            return parent / ".env"
    return None


def load_env():
    """Auto-load a .env (KEY=VALUE per line) so users never touch shell env vars.

    Order (first to set a key wins, real shell env always wins via setdefault):
    next to this script, the skill folder above it, the project root (.claude
    parent — the bundled Exodus install's single root .env), then the cwd.
    No external dependencies.
    """
    here = Path(__file__).resolve().parent
    candidates = [here / ".env", here.parent / ".env"]
    root_env = find_project_root_env(__file__)
    if root_env is not None:
        candidates.append(root_env)
    candidates.append(Path.cwd() / ".env")
    loaded = []
    for candidate in candidates:
        if not candidate.is_file():
            continue
        loaded.append(str(candidate))
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            os.environ.setdefault(key, val)
    return loaded


loaded_env_files = load_env()

if len(sys.argv) < 4:
    print("usage: genesis-stream.py <bot-slug> <prompt-file> <output-file> [temperature]")
    sys.exit(2)

model = sys.argv[1]
prompt_file = sys.argv[2]
output_file = sys.argv[3]
# Temperature is optional. Omit it when not passed so the bot's own configured
# default applies (don't force a value over it). The server also drops temperature
# automatically for models that don't accept it (Opus 4.7+/Fable), so passing one
# there is harmless — it's simply ignored.
temperature = float(sys.argv[4]) if len(sys.argv) > 4 else None

# Model-aware provider-key selection. The model field may carry a per-request
# override "<bot-slug>@<model>"; the part after the first "@" decides which key we
# need. Classify every key the user set by prefix (sk-or- = OpenRouter, else
# Anthropic) regardless of which env var it landed in, so a key pasted into the
# "wrong" variable still routes correctly.
_candidate_keys = [
    os.environ.get("ANTHROPIC_API_KEY"),
    os.environ.get("OPENROUTER_API_KEY"),
    os.environ.get("GENESIS_PROVIDER_KEY"),
]
anthropic_key = next((k for k in _candidate_keys if k and not k.startswith("sk-or-")), None)
openrouter_key = next((k for k in _candidate_keys if k and k.startswith("sk-or-")), None)

override_model = model.split("@", 1)[1] if "@" in model else ""
# A non-Claude override (openai/gpt-5, google/...) can only run via OpenRouter.
# Claude ids are "claude-*" (no slash); "anthropic/..." is Claude-via-OpenRouter.
needs_openrouter = "/" in override_model and not override_model.startswith("anthropic/")

if needs_openrouter:
    provider_key, routing = openrouter_key, "OpenRouter"
    if not provider_key:
        print(
            f"ERROR: model '{override_model}' needs an OpenRouter key (sk-or-…), but your "
            f".env has no OpenRouter key. Add one from openrouter.ai/keys (as "
            f"OPENROUTER_API_KEY) — an OpenRouter key serves every model. Or request a "
            f"Claude model (claude-*) to use your Anthropic key.",
            file=sys.stderr,
        )
        sys.exit(2)
elif anthropic_key:
    provider_key, routing = anthropic_key, "Anthropic"
elif openrouter_key:
    provider_key, routing = openrouter_key, "OpenRouter"
else:
    print(
        "ERROR: no provider key found. Add ANTHROPIC_API_KEY (sk-ant-…) or "
        "OPENROUTER_API_KEY (sk-or-…) to your .env — or run `npx @aicopycoders/exodus keys pull` "
        "to sync it from the dashboard.",
        file=sys.stderr,
    )
    sys.exit(2)

# Transparency: which .env was loaded and which provider we're using — surfaces the
# "I edited the wrong .env" / "why isn't my OpenRouter key used" confusion instantly.
# Stderr so it never mixes into the generated output file.
_env_src = ", ".join(loaded_env_files) if loaded_env_files else "none found (shell env only)"
print(f"[genesis] model '{model}' → {routing}; .env: {_env_src}", file=sys.stderr)

with open(prompt_file) as f:
    prompt = f.read()

# Accept the base URL with or without the /api/v1 suffix, so pasting the value
# straight from the portal (https://gas.copycoders.ai/api/v1) also works.
base = os.environ["GENESIS_BASE_URL"].rstrip("/")
if not base.endswith("/api/v1"):
    base = base + "/api/v1"

payload_obj = {
    "model": model,
    "messages": [{"role": "user", "content": prompt}],
    "stream": True,
}
if temperature is not None:
    payload_obj["temperature"] = temperature
payload = json.dumps(payload_obj).encode()

req = urllib.request.Request(
    f"{base}/chat/completions",
    data=payload,
    headers={
        "Authorization": f"Bearer {os.environ['GENESIS_API_KEY']}",
        "X-Provider-Key": provider_key,
        "Content-Type": "application/json",
    },
)

# Fail LOUDLY. The server sends errors three ways and a silent zero-char "success"
# is worse than any of them: (1) non-200 JSON before the stream starts, (2) a
# `data: {"error": ...}` SSE event mid-stream, (3) a dropped connection — detected
# because a healthy stream always ends with finish_reason then `data: [DONE]`.
content = ""
finish_reason = None
saw_done = False
error_msg = None
try:
    with urllib.request.urlopen(req, timeout=600) as resp:
        for raw_line in resp:
            line = raw_line.decode().strip()
            if not line.startswith("data: "):
                continue
            if line == "data: [DONE]":
                saw_done = True
                break
            try:
                chunk = json.loads(line[6:])
            except Exception:
                continue
            if "error" in chunk:
                err = chunk["error"]
                error_msg = f"{err.get('type', 'stream_error')}: {err.get('message', json.dumps(err))}"
                break
            choice = (chunk.get("choices") or [{}])[0]
            content += (choice.get("delta") or {}).get("content", "")
            finish_reason = choice.get("finish_reason") or finish_reason
except urllib.error.HTTPError as e:
    detail = ""
    try:
        detail = json.loads(e.read().decode()).get("error", {}).get("message", "")
    except Exception:
        pass
    error_msg = f"HTTP {e.code}: {detail or e.reason}"
except Exception as e:
    error_msg = str(e)

if error_msg is None and not saw_done:
    error_msg = "stream ended early (no [DONE] sentinel) — output is likely truncated, retry"
if error_msg is None and not content:
    error_msg = "stream completed but produced no content — retry, and check your keys if it persists"

# Always write whatever arrived — partial output can still be useful for debugging.
with open(output_file, "w") as f:
    f.write(content)

if error_msg:
    print(f"ERROR: {error_msg}", file=sys.stderr)
    if content:
        print(f"(partial output, {len(content)} chars, saved to {os.path.basename(output_file)})", file=sys.stderr)
    sys.exit(1)
print(f"Done: {os.path.basename(output_file)} ({len(content)} chars, finish_reason={finish_reason})")
