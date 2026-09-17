import { type AdAccountRef, type AdShowResponse, type AdSummary, type AdWindowStats, type AdsListResponse, type FlowResult, type MetaAdsDeps } from "../lib/meta-ads.js";
export declare const helpText: string;
export declare const SORTS: readonly ["cost-per-result", "spend", "ctr"];
export type AdSort = (typeof SORTS)[number];
export type AdWindow = "lifetime" | "last90d";
export declare const VALUE_FLAGS: Set<string>;
export declare const MAX_LIMIT = 200;
export interface AdsListOptions {
    sort?: AdSort;
    window?: AdWindow;
    account?: string;
    limit?: number;
}
export type ParseResult = {
    ok: true;
    options: AdsListOptions;
} | {
    ok: false;
    message: string;
};
export declare function parseSince(raw: unknown): {
    ok: true;
    window?: AdWindow;
} | {
    ok: false;
    message: string;
};
export declare function parseAdsListFlags(flags: Record<string, string | boolean>): ParseResult;
export declare function adsListQuery(options: AdsListOptions): string;
export declare function winnerBadge(status: unknown): string;
export declare function costPerResultCell(ad: AdWindowStats): string;
export declare function spendCell(ad: AdWindowStats): string;
export declare function ctrCell(ad: AdWindowStats): string;
export declare function cpcCell(ad: AdWindowStats): string;
export declare function resultsCell(ad: AdWindowStats): string;
export declare const AD_TABLE_HEADERS: readonly ["cost/result", "spend", "ctr", "cpc", "results", "status", "winner", "name"];
export declare function adRow(ad: AdSummary, accountCell?: string): string[];
export declare function accountCellFor(accounts: AdAccountRef[], accountId: string | null | undefined): string;
export declare function adTableHeaders(withAccount?: boolean): string[];
export declare function formatAdsTable(ads: AdSummary[], opts?: {
    accounts?: AdAccountRef[];
    showAccount?: boolean;
}): string;
export declare function accountLabel(accounts: AdAccountRef[], accountId: string | null | undefined): string;
export declare function formatAdsList(data: AdsListResponse, options: AdsListOptions): string[];
export declare function formatAdShow(ad: AdShowResponse, apiBase: string): string[];
export declare function listFlow(options: AdsListOptions, json: boolean, deps: MetaAdsDeps): Promise<FlowResult>;
export declare function showFlow(adId: string, json: boolean, deps: MetaAdsDeps): Promise<FlowResult>;
export declare function parsePositional(args?: string[]): string[];
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
