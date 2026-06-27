export async function hydrateScoutIdeasCount(runId, data, fetchCount) {
    const generated = data["ideasGenerated"];
    if (generated === 0 || generated === undefined) {
        const count = await fetchCount(runId);
        if (count !== null && typeof count === "number") {
            data["ideasGenerated"] = count;
        }
    }
    return data;
}
