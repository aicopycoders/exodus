Genesis Bots — Claude Code / OpenClaw skill

INSTALL (matches the setup steps on the portal — downloading this zip was
step 2):
  1. Get a provider key: create an API key with Anthropic (sk-ant-) or
     OpenRouter (sk-or-) and add $10-20 in credits. Genesis auto-detects
     which one you use.
  2. Move this "genesis-bots" folder into your agent's skills directory.
     For Claude Code that's:  .claude/skills/genesis-bots
  3. Paste your .env: on the portal (https://genesis.copycoders.ai/portal),
     click "Copy .env to clipboard" — it already contains your Genesis key
     and the server address. Paste it into a NEW file named .env inside this
     genesis-bots folder or the root of your project (either works), then
     replace the last line with your provider key from step 1.
  4. Start a NEW agent session (skills only load at session start — in
     Claude Code, /clear also works), then ask your agent to run a Genesis
     bot. Done — no other configuration needed. Try: "Use the genesis-bots
     skill and ask MarioBot for three ad hooks."

The helper runs on Node (bundled as scripts/genesis-stream.mjs — Claude Code
always has Node). A Python version (scripts/genesis-stream.py) ships alongside
it as a fallback; both take the same arguments.

Tip: create and edit the .env file in an editor like Cursor, VS Code, or
Obsidian — files starting with a dot are hidden by default in Finder (press
Cmd+Shift+. to show them). There's also a .env.example template in this
folder if you'd rather fill one in by hand.

See SKILL.md for full usage. Get your keys at https://genesis.copycoders.ai/portal
