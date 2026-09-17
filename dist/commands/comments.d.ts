import { type AdComment, type CommentsResponse, type FlowResult, type MetaAdsDeps } from "../lib/meta-ads.js";
export declare const helpText: string;
export declare const PLATFORMS: readonly ["facebook", "instagram"];
export type Platform = (typeof PLATFORMS)[number];
export declare const VALUE_FLAGS: Set<string>;
export declare const MAX_LIMIT = 500;
export interface CommentsListOptions {
    adId?: string;
    platform?: Platform;
    limit?: number;
}
export type ParseResult = {
    ok: true;
    options: CommentsListOptions;
} | {
    ok: false;
    message: string;
};
export declare function parseCommentsFlags(flags: Record<string, string | boolean>): ParseResult;
export declare function commentsPath(options: CommentsListOptions): string;
export declare function platformTag(platform: unknown): string;
export declare function commentLines(comment: AdComment, opts: {
    showAdId: boolean;
}): string[];
export declare function formatComments(data: CommentsResponse, options: CommentsListOptions): string[];
export declare function listFlow(options: CommentsListOptions, json: boolean, deps: MetaAdsDeps): Promise<FlowResult>;
export declare function parsePositional(args?: string[]): string[];
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
