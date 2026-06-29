export interface ReelWriteResult {
    dispatched: Array<{
        url: string;
        key: string;
        runId: string;
    }>;
    bankedFailed: string[];
}
export declare function captureReelAndWrite(urls: string[], opts: {
    awarenessLevel: string;
    variantCount?: number;
    stopAtHooks?: boolean;
}, rt?: {
    cc?: string;
}): Promise<ReelWriteResult>;
