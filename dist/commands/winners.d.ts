import { type AdAccountRef } from "../lib/meta-ads.js";
export declare const helpText: string;
export interface LocalValidation {
    ok: boolean;
    errors: string[];
    warnings: string[];
    winnerCount: number;
}
export declare function validatePackageLocally(pkg: unknown): LocalValidation;
export declare function contentTypeFor(filePath: string): string;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
export declare const VALUE_FLAGS: Set<string>;
export declare function parsePositional(args?: string[]): string[];
export interface WinnerDefinitionView {
    accountId?: string | null;
    campaignRoleMap?: Record<string, string> | null;
    ruleVariant?: string | null;
    otherDefinition?: string | null;
    ignoredCampaignIds?: string[] | null;
    defaults?: {
        window?: string | null;
        resultsFloor?: number | null;
        contributionLine?: number | null;
    } | null;
    lastAppliedAt?: number | null;
    setupCompletedAt?: number | null;
    summary?: WinnerDefinitionSummary | null;
}
export interface WinnerDefinitionSummaryGroup {
    resultLabel?: string | null;
    objective?: string | null;
    instanceCount?: number | null;
    creativeCount?: number | null;
    totalResults?: number | null;
    winnerCount?: number | null;
    winnerShare?: number | null;
    videoWinners?: number | null;
    imageWinners?: number | null;
    flatCurve?: boolean | null;
}
export interface WinnerDefinitionSummary {
    instanceCount?: number | null;
    creativeCount?: number | null;
    winnerCount?: number | null;
    groups?: WinnerDefinitionSummaryGroup[] | null;
    ignoredCampaignCount?: number | null;
    computedAt?: number | null;
}
export interface WinnerDefinitionResponse {
    account?: AdAccountRef | null;
    definition?: WinnerDefinitionView | null;
    accounts?: AdAccountRef[];
}
export declare function roleTally(map: Record<string, string> | null | undefined): {
    total: number;
    line: string;
};
export declare function sharePercent(value: unknown): string;
export declare function summaryLines(summary: WinnerDefinitionSummary | null | undefined): string[];
export declare function formatDefinition(data: WinnerDefinitionResponse): string[];
