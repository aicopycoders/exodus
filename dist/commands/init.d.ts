export declare const helpText: string;
export interface InitResult {
    existing: boolean;
    envCreated: boolean;
    skills: string[];
}
export declare function scaffoldInit(root: string): InitResult;
export declare function syncBrands(root: string): Promise<{
    synced: string[];
} | {
    skipped: "no-key" | "api-error";
}>;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
