export declare const helpText: string;
export declare function formatIntelResult(data: Record<string, unknown>): string;
export declare function formatPulseResult(data: Record<string, unknown>): string;
export declare function formatScoutResult(data: Record<string, unknown>): string;
export declare function formatCreativeSuiteStatus(title: string, data: Record<string, unknown>): string;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
