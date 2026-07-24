import { type ApiResponse } from "../lib/client.js";
import { type Channel } from "../lib/channel.js";
export declare const helpText: string;
export declare const AWARENESS_PAIRS: readonly ["unawareProblemAware", "solutionProductAware", "mostAware"];
export type AwarenessPair = (typeof AWARENESS_PAIRS)[number];
export interface BankSummary {
    key: string;
    name: string;
    type: string;
    awarenessPair?: AwarenessPair;
    entryCount: number;
}
export interface BankWinMetrics {
    spend?: number;
    roas?: number;
    ctr?: number;
    note?: string;
}
export interface BankProvenance {
    workflowRunId?: string;
    genesisRunId?: string;
    nodeId?: string;
    variantIndex?: number;
    artifactKind?: string;
}
export interface BankEntry {
    _id: string;
    text: string;
    source: string;
    awarenessPair?: AwarenessPair;
    winMetrics?: BankWinMetrics;
    humanEdited?: boolean;
    provenance?: BankProvenance;
    createdAt: number | string;
}
export interface BankShowResponse {
    bank: {
        key: string;
        name: string;
        type: string;
        awarenessPair?: AwarenessPair;
    };
    entries: BankEntry[];
}
export interface BankPromoteBody {
    bankKey: string;
    text: string;
    awarenessPair?: AwarenessPair;
    winMetrics?: BankWinMetrics;
    provenance?: BankProvenance;
}
export interface BankPromoteResponse {
    entryId: string;
    bankName: string;
}
export interface FlowResult {
    code: number;
    lines: string[];
}
export interface BankDeps {
    get: (path: string) => Promise<ApiResponse<unknown>>;
    post: (path: string, body: unknown) => Promise<ApiResponse<unknown>>;
    readFile: (path: string) => string;
    readStdin: () => string;
    stdinIsTTY: () => boolean;
    channel: Channel;
}
export declare function relativeAge(value: number | string, now?: number): string;
export declare function formatBankList(banks: BankSummary[]): string;
export declare function formatBankShow(res: BankShowResponse): string;
interface PromoteTextSources {
    arg?: string;
    file?: string;
    readFile: (path: string) => string;
    readStdin: () => string;
    stdinIsTTY: () => boolean;
}
export declare function resolvePromoteText(opts: PromoteTextSources): string;
export declare function parseWinMetrics(flags: Record<string, string | boolean>): BankWinMetrics | undefined;
export declare function parseProvenance(flags: Record<string, string | boolean>): BankProvenance | undefined;
export declare function parseAwareness(flags: Record<string, string | boolean>): AwarenessPair | undefined;
export declare function buildPromoteBody(bankKey: string, text: string, flags: Record<string, string | boolean>): BankPromoteBody;
export declare function listFlow(json: boolean, deps: BankDeps): Promise<FlowResult>;
export declare function showFlow(key: string, json: boolean, deps: BankDeps): Promise<FlowResult>;
export declare function promoteFlow(key: string, arg: string | undefined, flags: Record<string, string | boolean>, json: boolean, deps: BankDeps): Promise<FlowResult>;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
export {};
