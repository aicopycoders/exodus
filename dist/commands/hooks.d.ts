import { type ApiResponse } from "../lib/client.js";
import { type Channel } from "../lib/channel.js";
export declare const helpText: string;
export declare const LANES: readonly ["relative", "absolute", "velocity", "evergreen"];
export declare const VALIDATION_STATUSES: readonly ["unproven", "corroborated", "cross-validated", "saturated", "virgin-market"];
export declare const LIFECYCLES: readonly ["new", "reviewed", "promoted", "tested", "killed"];
export declare const DISCOVERED_VIA: readonly ["paste", "seed", "expansion", "spotter"];
export declare const EXTRACT_STATUSES: readonly ["pending", "complete", "partial", "failed", "skipped"];
export declare const HAS_HOOKS: readonly ["spoken", "onscreen", "caption"];
export interface ApiHookLane {
    lane?: string | null;
    reason?: string | null;
}
export interface ApiHookCorroboration {
    replicationCount?: number | null;
    languageSpread?: number | string[] | null;
    marketsSeen?: string[] | null;
    checkedAt?: number | null;
}
export interface ApiHookGate {
    verdict?: string | null;
    reasoning?: string | null;
    decidedAt?: number | null;
}
export interface ApiHookCard {
    id?: string | null;
    shortcode?: string | null;
    sourceUrl?: string | null;
    creatorHandle?: string | null;
    caption?: string | null;
    thumbnailUrl?: string | null;
    publishedAt?: number | null;
    capturedAt?: number | null;
    viewCount?: number | null;
    likeCount?: number | null;
    commentCount?: number | null;
    creatorTypicalViews?: number | null;
    baselineSampleSize?: number | null;
    baselineInsufficient?: boolean | null;
    viralScore?: number | null;
    scoreEvidence?: string | null;
    lanes?: ApiHookLane[] | null;
    hookSpoken?: string | null;
    hookOnScreen?: string | null;
    hookCaption?: string | null;
    hookPattern?: string | null;
    formatSkeleton?: string | null;
    extractStatus?: string | null;
    extractEvidence?: string | null;
    validationStatus?: string | null;
    corroboration?: ApiHookCorroboration | null;
    language?: string | null;
    market?: string | null;
    relevanceTag?: string | number | null;
    lifecycle?: string | null;
    discoveredVia?: string | null;
    gate?: ApiHookGate | null;
    transcript?: string | null;
    metricSnapshots?: unknown[] | null;
    velocityPollCount?: number | null;
    citedStudy?: string | null;
    hookPatternKey?: string | null;
}
export interface HookListResponse {
    cards?: ApiHookCard[];
    cursor?: string | null;
    isDone?: boolean;
}
export interface HookShowResponse {
    card?: ApiHookCard;
}
export interface HookSimilarSubject {
    id?: string | null;
    shortcode?: string | null;
    creatorHandle?: string | null;
    hookPattern?: string | null;
    viralScore?: number | null;
    scoreEvidence?: string | null;
}
export interface HookSimilarResponse {
    card?: HookSimilarSubject;
    similar?: ApiHookCard[];
}
export declare const EXPORT_CAP = 5000;
export declare const EXPORT_PAGE_SIZE = 200;
export declare const LIST_SCAN_CAP = 2000;
export interface FlowResult {
    code: number;
    lines: string[];
    warnings?: string[];
}
export interface HooksDeps {
    get: (path: string) => Promise<ApiResponse<unknown>>;
    writeFile: (path: string, content: string) => void;
    channel: Channel;
    now: () => number;
    apiUrl: () => string;
}
export interface HookFilters {
    minScore?: number;
    lane?: string;
    status?: string;
    lifecycle?: string;
    creator?: string;
    language?: string;
    market?: string;
    via?: string;
    sinceDays?: number;
    extract?: string;
    has?: string;
    pattern?: string;
    limit?: number;
}
export type ParseResult = {
    ok: true;
    filters: HookFilters;
} | {
    ok: false;
    message: string;
};
export declare function parseHookFilters(flags: Record<string, string | boolean>, maxLimit: number): ParseResult;
export declare function filterQuery(filters: HookFilters, extra?: {
    limit?: number;
    cursor?: string;
}): string;
export declare function formatScore(score: unknown): string;
export declare function shortAge(value: unknown, now: number): string;
export declare function laneCodes(lanes: ApiHookLane[] | null | undefined): string;
export declare function truncate(text: unknown, max: number): string;
export declare function formatCardTable(cards: ApiHookCard[], now: number): string;
export interface ListWalk {
    cards: ApiHookCard[];
    more: boolean;
    scanCapped: boolean;
}
export declare function formatList(walk: ListWalk, now: number): string[];
export declare function formatShow(card: ApiHookCard, now: number): string;
export declare function formatExplainScore(card: ApiHookCard, now: number): string[];
export declare function explainScoreJson(card: ApiHookCard): Record<string, unknown>;
export declare const CSV_COLUMNS: readonly ["id", "shortcode", "sourceUrl", "creatorHandle", "viralScore", "scoreEvidence", "viewCount", "likeCount", "commentCount", "creatorTypicalViews", "baselineSampleSize", "baselineInsufficient", "validationStatus", "lanes", "hookSpoken", "hookOnScreen", "hookCaption", "hookPattern", "formatSkeleton", "extractStatus", "language", "market", "lifecycle", "discoveredVia", "capturedAt", "publishedAt", "replicationCount", "languageSpread"];
export declare function csvEscape(value: unknown): string;
export declare const CSV_RECORD_SEP = "\r\n";
export declare function toCsv(cards: ApiHookCard[]): string;
export declare function listFlow(filters: HookFilters, json: boolean, deps: HooksDeps): Promise<FlowResult>;
export declare function showFlow(ref: string, json: boolean, deps: HooksDeps): Promise<FlowResult>;
export declare function explainScoreFlow(ref: string, json: boolean, deps: HooksDeps): Promise<FlowResult>;
export declare function findSimilarFlow(ref: string, json: boolean, deps: HooksDeps): Promise<FlowResult>;
export interface ExportOptions {
    format: "csv" | "json";
    out?: string;
}
export declare function exportFlow(filters: HookFilters, options: ExportOptions, deps: HooksDeps): Promise<FlowResult>;
export declare function parsePositional(args?: string[]): string[];
export declare function resolveExportFormat(flags: Record<string, string | boolean>): {
    ok: true;
    format: "csv" | "json";
} | {
    ok: false;
    message: string;
};
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
