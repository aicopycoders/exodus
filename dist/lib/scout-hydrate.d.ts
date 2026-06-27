export declare function hydrateScoutIdeasCount<T extends Record<string, unknown>>(runId: string, data: T, fetchCount: (runId: string) => Promise<number | null>): Promise<T>;
