/**
 * Scout scan completion records `ideasGenerated = 0` before the ideas writer runs.
 * Re-fetch the ideas endpoint to get the real count before displaying to the user.
 *
 * `fetchCount` is injectable to keep this helper pure and testable. Callers pass
 * an adapter that wraps `apiGet` against `/api/v2/scout/ideas?runId=X&limit=1`.
 */
export async function hydrateScoutIdeasCount<T extends Record<string, unknown>>(
  runId: string,
  data: T,
  fetchCount: (runId: string) => Promise<number | null>,
): Promise<T> {
  const generated = data["ideasGenerated"];
  if (generated === 0 || generated === undefined) {
    const count = await fetchCount(runId);
    if (count !== null && typeof count === "number") {
      (data as Record<string, unknown>)["ideasGenerated"] = count;
    }
  }
  return data;
}
