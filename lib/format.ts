// Format API responses as structured markdown-style text readable by Claude.

function stepIcon(status: unknown): string {
  if (status === "completed" || status === "done") return "✓";
  if (status === "failed" || status === "error") return "✗";
  return "…";
}

function formatSteps(steps: unknown): string {
  if (!Array.isArray(steps) || steps.length === 0) return "";
  const lines = steps.map((s: unknown) => {
    if (typeof s !== "object" || s === null) return `  ${stepIcon(null)} ${String(s)}`;
    const step = s as Record<string, unknown>;
    const name = step["label"] ?? step["name"] ?? step["key"] ?? step["step"] ?? step["id"] ?? "Step";
    const status = step["status"];
    const icon = stepIcon(status);
    const detail = step["detail"] ?? step["message"];
    const error = step["error"];
    const parts: string[] = [];
    if (detail) parts.push(String(detail));
    if (error && error !== detail) parts.push(`error: ${String(error)}`);
    const extra = parts.length > 0 ? ` — ${parts.join(" | ")}` : "";
    return `  ${icon} ${String(name)}${extra}`;
  });
  return "\n**Steps:**\n" + lines.join("\n");
}

/**
 * Format a modular generation result (spark, viral, mirror, remix, etc.)
 */
export function formatGeneration(data: Record<string, unknown>): string {
  const lines: string[] = [];

  const status = data["status"] ?? "unknown";
  lines.push(`## Generation Result`);
  lines.push(`**Status:** ${status}`);

  if (data["agentName"] || data["agent"]) {
    lines.push(`**Agent:** ${data["agentName"] ?? data["agent"]}`);
  }

  const vType = data["variationType"];
  const nVar = data["numVariations"];
  if (typeof vType === "string" && typeof nVar === "number") {
    lines.push(`**Config:** ${vType} × ${nVar}`);
  }

  if (data["googleDocUrl"] || data["docUrl"]) {
    lines.push(`**Google Doc:** ${data["googleDocUrl"] ?? data["docUrl"]}`);
  }

  if (data["error"]) {
    lines.push(`**Error:** ${data["error"]}`);
  }

  const steps = data["steps"];
  if (steps) {
    lines.push(formatSteps(steps));
  }

  if (Array.isArray(data["hooks"]) && data["hooks"].length > 0) {
    lines.push(`\n**Hooks (${data["hooks"].length}):**`);
    for (const hook of data["hooks"].slice(0, 10)) {
      lines.push(`  - ${String(hook)}`);
    }
  }

  if (Array.isArray(data["headlines"]) && data["headlines"].length > 0) {
    lines.push(`\n**Headlines (${data["headlines"].length}):**`);
    for (const h of data["headlines"].slice(0, 10)) {
      lines.push(`  - ${String(h)}`);
    }
  }

  if (data["adCopy"] || data["body"]) {
    lines.push(`\n**Ad Copy:**\n${data["adCopy"] ?? data["body"]}`);
  }

  return lines.join("\n");
}

/**
 * Format a Genesis run result.
 */
export function formatGenesisRun(data: Record<string, unknown>): string {
  const lines: string[] = [];

  const status = data["status"] ?? "unknown";
  lines.push(`## Genesis Run`);
  lines.push(`**Status:** ${status}`);

  if (data["awarenessLevel"] || data["awareness"]) {
    lines.push(`**Awareness Level:** ${data["awarenessLevel"] ?? data["awareness"]}`);
  }

  if (data["inputMethod"] || data["method"]) {
    lines.push(`**Input Method:** ${data["inputMethod"] ?? data["method"]}`);
  }

  if (data["googleDocUrl"] || data["docUrl"]) {
    lines.push(`**Google Doc:** ${data["googleDocUrl"] ?? data["docUrl"]}`);
  }

  if (data["error"]) {
    lines.push(`**Error:** ${data["error"]}`);
  }

  const hookCount =
    data["hookCount"] ??
    (Array.isArray(data["hooks"]) ? data["hooks"].length : null);
  if (hookCount !== null && hookCount !== undefined) {
    lines.push(`**Hooks:** ${hookCount}`);
  }

  const headlineCount =
    data["headlineCount"] ??
    (Array.isArray(data["headlines"]) ? data["headlines"].length : null);
  if (headlineCount !== null && headlineCount !== undefined) {
    lines.push(`**Headlines:** ${headlineCount}`);
  }

  const bodyCount =
    data["bodyCount"] ??
    (Array.isArray(data["bodies"]) ? data["bodies"].length : null);
  if (bodyCount !== null && bodyCount !== undefined) {
    lines.push(`**Body Copies:** ${bodyCount}`);
  }

  if (data["durationMs"]) {
    const secs = Math.round(Number(data["durationMs"]) / 1000);
    lines.push(`**Duration:** ${secs}s`);
  }

  const steps = data["steps"];
  if (steps) {
    lines.push(formatSteps(steps));
  }

  // Show document content when no Google Doc URL (CLI fallback)
  if (data["document"] && !data["googleDocUrl"]) {
    lines.push(`\n---\n**Document Output:**\n${data["document"]}`);
  }

  return lines.join("\n");
}

/**
 * Format a list of generations for browse output.
 * Each row: date | agent | status | doc
 */
export function formatBrowse(generations: unknown[]): string {
  if (!Array.isArray(generations) || generations.length === 0) {
    return "No generations found.";
  }

  const lines: string[] = [];
  lines.push(`## Generations (${generations.length})`);
  lines.push(`date | agent | status | doc`);
  lines.push(`-----|-------|--------|----`);

  for (const g of generations) {
    if (typeof g !== "object" || g === null) continue;
    const gen = g as Record<string, unknown>;

    const rawDate = gen["createdAt"] ?? gen["_creationTime"];
    let date = "—";
    if (typeof rawDate === "number") {
      date = new Date(rawDate).toISOString().slice(0, 10);
    } else if (typeof rawDate === "string" && rawDate !== "—") {
      const parsed = new Date(rawDate);
      date = isNaN(parsed.getTime()) ? "—" : parsed.toISOString().slice(0, 10);
    }

    const agent = gen["agentName"] ?? gen["agentId"] ?? gen["agent"] ?? gen["pipeline"] ?? "—";
    const status = gen["status"] ?? "—";
    const doc = gen["googleDocUrl"] ?? gen["docUrl"] ?? "—";

    lines.push(`${date} | ${agent} | ${status} | ${doc}`);
  }

  return lines.join("\n");
}

/**
 * Format an API error response.
 */
export function formatError(res: {
  ok: boolean;
  status: number;
  data: unknown;
}): string {
  const lines: string[] = [];
  lines.push(`## Error`);
  lines.push(`**HTTP Status:** ${res.status}`);

  if (res.data && typeof res.data === "object") {
    const d = res.data as Record<string, unknown>;
    const err = d["error"];
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      if (e["message"]) lines.push(`**Error:** ${e["message"]}`);
      if (e["code"]) lines.push(`**Code:** ${e["code"]}`);
    } else if (err) {
      lines.push(`**Error:** ${String(err)}`);
    }
    if (d["message"]) lines.push(`**Message:** ${d["message"]}`);
    if (d["code"] && !(err && typeof err === "object")) lines.push(`**Code:** ${d["code"]}`);
    if (!err && !d["message"]) {
      lines.push(`**Details:**\n\`\`\`json\n${JSON.stringify(res.data, null, 2)}\n\`\`\``);
    }
  } else if (res.data) {
    lines.push(`**Details:** ${String(res.data)}`);
  }

  return lines.join("\n");
}
