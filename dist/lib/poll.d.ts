export interface PollOptions {
    path: string;
    intervalMs?: number;
    timeoutMs?: number;
    terminalStatuses?: string[];
    onProgress?: (data: Record<string, unknown>) => void;
    isDone?: (data: Record<string, unknown>) => boolean;
}
export interface PollResult {
    ok: boolean;
    data: Record<string, unknown>;
    timedOut: boolean;
}
export declare function pollUntilDone(opts: PollOptions): Promise<PollResult>;
