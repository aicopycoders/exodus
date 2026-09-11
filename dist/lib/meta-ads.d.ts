import { type ApiResponse } from "./client.js";
import { type Channel } from "./channel.js";
export interface AdAccountRef {
    accountId?: string | null;
    name?: string | null;
    currency?: string | null;
}
export interface AdMedia {
    image?: string | null;
    video?: string | null;
    poster?: string | null;
}
export interface AdWindowStats {
    resultType?: string | null;
    results?: number | null;
    costPerResult?: number | null;
    costPerResultDisplay?: string | null;
    ctr?: number | null;
    ctrDisplay?: string | null;
    cpc?: number | null;
    cpcDisplay?: string | null;
    spend?: number | null;
    spendDisplay?: string | null;
    impressions?: number | null;
    clicks?: number | null;
    currency?: string | null;
}
export interface AdSummary extends AdWindowStats {
    adId?: string | null;
    accountId?: string | null;
    name?: string | null;
    status?: string | null;
    format?: string | null;
    campaign?: {
        id?: string | null;
        name?: string | null;
        objective?: string | null;
    } | null;
    adset?: {
        id?: string | null;
        name?: string | null;
        optimizationGoal?: string | null;
    } | null;
    createdTime?: string | number | null;
    headline?: string | null;
    bodyText?: string | null;
    winnerStatus?: string | null;
    media?: AdMedia | null;
    syncedAt?: string | number | null;
}
export interface AdsListResponse {
    ads?: AdSummary[];
    count?: number;
    window?: string;
    sort?: string;
    accounts?: AdAccountRef[];
}
export interface AdShowResponse extends AdSummary {
    lifetime?: AdWindowStats | null;
    last90d?: AdWindowStats | null;
    commentCounts?: {
        facebook?: number | null;
        instagram?: number | null;
    } | null;
}
export interface AdComment {
    id?: string | null;
    adId?: string | null;
    platform?: string | null;
    text?: string | null;
    createdAt?: string | number | null;
    likeCount?: number | null;
    parentId?: string | null;
    syncedAt?: string | number | null;
}
export interface CommentsResponse {
    adId?: string | null;
    comments?: AdComment[];
    count?: number;
}
export interface FlowResult {
    code: number;
    lines: string[];
    warnings?: string[];
}
export interface MetaAdsDeps {
    get: (path: string) => Promise<ApiResponse<unknown>>;
    channel: Channel;
    apiUrl: () => string;
    now: () => number;
}
export declare const defaultMetaAdsDeps: MetaAdsDeps;
export declare function displayOr(display: unknown, value: unknown, format: (n: number) => string): string;
export declare function money(n: number, currency?: string | null): string;
export declare function percent(n: number): string;
export declare function count(n: unknown): string;
export declare function sanitizeForTerminal(text: unknown): string;
export declare function safeText(text: unknown): string;
export declare function safeTextOr(text: unknown, fallback: string): string;
export declare function truncate(text: unknown, max: number): string;
export declare function dateOrDash(value: unknown): string;
export declare function table(headers: string[], rows: string[][]): string;
export declare function accountLine(account: AdAccountRef): string;
export declare function mediaUrl(apiBase: string, relative: unknown): string | null;
export declare function errorCode(data: unknown): string | undefined;
export declare function accountsOf(data: unknown): AdAccountRef[];
export declare function accountRequiredLines(res: ApiResponse<unknown>, example: (accountId: string) => string): string[];
export declare function errorFor(res: ApiResponse<unknown>, verb: string, json: boolean, deps: MetaAdsDeps, example: (accountId: string) => string): FlowResult | undefined;
