export interface SwipeWriteResult {
    dispatched: Array<{
        url: string;
        key: string;
        runId: string;
    }>;
    bankedFailed: string[];
}
export declare function captureSwipeAndWrite(urls: string[], opts: {
    awarenessLevel: string;
    variantCount?: number;
    steering?: string;
    stopAtHooks?: boolean;
}, rt?: {
    cc?: string;
}): Promise<SwipeWriteResult>;
