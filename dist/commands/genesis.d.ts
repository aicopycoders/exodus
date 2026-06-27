export declare const helpText: string;
export interface GenesisOpts {
    awarenessLevel: string;
    seeds?: string[];
    variantCount?: number;
    adAccountId?: string;
    stopAtHooks?: boolean;
}
export interface GenesisBody {
    brief: string;
    awarenessLevel: string;
    inputMethod: "brief" | "paste";
    sourcePayload?: {
        winningAd?: string;
    };
    seeds?: string[];
    variantCount?: number;
    adAccountId?: string;
    stopAtHooks?: boolean;
}
export declare function buildBriefBody(brief: string, opts: GenesisOpts): GenesisBody;
export declare function buildPasteBody(text: string, opts: GenesisOpts): GenesisBody;
export interface SwipeRow {
    _id?: string;
    brandName?: string;
    format?: string;
    transcript?: string;
    bodyText?: string;
    headline?: string;
    ctaText?: string;
}
export declare function resolveSwipeText(swipe: SwipeRow): string;
export type GenesisAction = {
    kind: "submit";
    body: GenesisBody;
} | {
    kind: "reel";
    urls: string[];
    opts: GenesisOpts;
} | {
    kind: "swipe-url";
    urls: string[];
    opts: GenesisOpts;
    steering?: string;
} | {
    kind: "list-bank";
    limit: number;
} | {
    kind: "from-bank";
    ideaId: string;
    opts: GenesisOpts;
} | {
    kind: "list-swipes";
    limit: number;
} | {
    kind: "from-swipe";
    swipeId: string;
    opts: GenesisOpts;
} | {
    kind: "error";
    message: string;
};
export declare function resolveGenesisAction(flags: Record<string, string | boolean>): GenesisAction;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
