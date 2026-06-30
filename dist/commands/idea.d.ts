export declare const helpText: string;
declare const SOURCES: readonly ["gambit", "organic", "swipe"];
type Source = (typeof SOURCES)[number];
export declare function parseKeys(raw: string): string[] | null;
export type IdeaAction = {
    kind: "add";
    hook: string;
    description: string;
    source: Source;
    sourceRef?: string;
    notes?: string;
} | {
    kind: "list";
    source?: Source;
    since?: string;
    status?: string;
    limit?: number;
} | {
    kind: "note";
    key: string;
    notes: string;
} | {
    kind: "edit";
    key: string;
    description: string;
} | {
    kind: "write";
    keys: string[];
    awarenessLevel: string;
    variantCount?: number;
    stopAtHooks?: boolean;
} | {
    kind: "rm";
    key: string;
    hard: boolean;
} | {
    kind: "gambit";
    dump: string;
} | {
    kind: "organic";
    urls: string[];
    write: boolean;
    awarenessLevel: string;
    variantCount?: number;
    stopAtHooks?: boolean;
} | {
    kind: "swipe";
    limit?: number;
} | {
    kind: "error";
    message: string;
};
export declare function runsWillPauseAtHooks(stopAtHooks: boolean | undefined, savedPref: "manual" | "auto" | null): boolean;
export declare function resolveIdeaAction(positionals: string[], flags: Record<string, string | boolean>): IdeaAction;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
export {};
