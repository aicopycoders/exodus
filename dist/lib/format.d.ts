export declare function formatGeneration(data: Record<string, unknown>): string;
export declare function formatGenesisRun(data: Record<string, unknown>): string;
export declare function formatBrowse(generations: unknown[]): string;
export declare function formatError(res: {
    ok: boolean;
    status: number;
    data: unknown;
}): string;
