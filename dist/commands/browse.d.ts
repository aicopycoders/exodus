export declare const helpText: string;
export declare function computeFetchLimit(userLimit: number, pipeline: string | undefined): number;
export declare function matchesPipeline(item: Record<string, unknown>, pipeline: string): boolean;
declare const EXTRA_PIPELINES: readonly ["creative", "template"];
type ExtraPipeline = (typeof EXTRA_PIPELINES)[number];
export declare function shouldFetchExtra(filter: string | undefined, pipeline: ExtraPipeline): boolean;
export declare function resolvePipelineFilter(flags: Record<string, string | boolean>): string | undefined;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
export {};
