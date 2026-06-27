// Shared Intel result formatter. Lives in lib/ (not commands/intel.ts) so base
// commands like `status` can render Intel runs without importing a CUSTOM-tier
// command module. intel.ts re-exports this for backward compatibility. (I-N12)
export function formatIntelResult(data: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push("## Intel Analysis Result");
  lines.push(`**Status:** ${data["status"] ?? "unknown"}`);

  if (data["mode"]) lines.push(`**Mode:** ${data["mode"]}`);
  if (data["phase"] !== undefined) lines.push(`**Phase:** ${data["phase"]}`);
  if (data["adsAnalyzed"] !== undefined) lines.push(`**Ads Analyzed:** ${data["adsAnalyzed"]}`);
  if (data["winnersFound"] !== undefined) lines.push(`**Winners Found:** ${data["winnersFound"]}`);
  if (data["losersFound"] !== undefined) lines.push(`**Losers Found:** ${data["losersFound"]}`);

  const attempted = data["combinationsAttempted"];
  const succeeded = data["combinationsSucceeded"];
  const total = data["combinationsCount"];
  if (total !== undefined) lines.push(`**Combinations (total):** ${total}`);
  if (attempted !== undefined || succeeded !== undefined) {
    lines.push(`**Phase 3 outputs:** ${succeeded ?? 0} of ${attempted ?? 0} attempted`);
  } else if (data["adsWritten"] !== undefined) {
    lines.push(`**Ads Written:** ${data["adsWritten"]}`);
  }

  // Prefer new per-phase URLs; fall back to legacy googleDocUrl for older runs
  if (data["phase1DocUrl"]) lines.push(`**Phase 1 Doc:** ${data["phase1DocUrl"]}`);
  if (data["phase3DocUrl"]) lines.push(`**Phase 3 Doc:** ${data["phase3DocUrl"]}`);
  if (!data["phase1DocUrl"] && !data["phase3DocUrl"] && data["googleDocUrl"]) {
    lines.push(`**Google Doc:** ${data["googleDocUrl"]}`);
  }
  if (data["googleSheetUrl"]) lines.push(`**Sheet:** ${data["googleSheetUrl"]}`);

  if (data["error"]) lines.push(`**Error:** ${data["error"]}`);

  return lines.join("\n");
}
