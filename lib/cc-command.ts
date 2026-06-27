/**
 * Reconstruct the user-facing command string from argv.
 * Example: ["spark", "Grounding pads", "--mode=modular"]
 *   → '/spark "Grounding pads" --mode=modular'
 */
export function formatCcCommand(argv: string[]): string {
  const [cmd, ...rest] = argv;
  if (!cmd) return "";
  const parts = rest.map((arg) => {
    if (arg.startsWith("--")) return arg;
    if (/\s/.test(arg)) return `"${arg.replace(/"/g, '\\"')}"`;
    return arg;
  });
  return `/${cmd}${parts.length ? " " + parts.join(" ") : ""}`;
}
