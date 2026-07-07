export declare const helpText: string;
interface NValue {
    slug: string;
    name: string;
}
interface MapOutcome {
    slug: string;
    name: string;
    lens?: "Type" | "Location" | "Function" | "Moment" | "Severity";
    subs: NValue[];
}
interface MapGroup {
    name: string;
    values: NValue[];
}
export interface SegmentMap {
    productWord: string;
    brandLabel: string;
    outcomes: MapOutcome[];
    demoGroups: MapGroup[];
    facetFamilies: MapGroup[];
}
export interface ImportSummary {
    added: string[];
    keptRenamed: string[];
    deleted: string[];
    subsDeleted: string[];
    demoValuesDeleted: string[];
    facetValuesDeleted: string[];
    personasArchived: string[];
    personasDeleted: string[];
}
export declare function asSummary(data: unknown): ImportSummary;
export declare function isDestructive(summary: ImportSummary): boolean;
export declare function formatImportSummary(summary: ImportSummary): string;
export declare function formatMapSummary(map: SegmentMap): string;
export interface ImportDeps {
    post: (path: string, body: unknown) => Promise<{
        ok: boolean;
        status: number;
        data: unknown;
    }>;
    readFile: (path: string) => string;
}
export interface ImportFlowResult {
    code: number;
    lines: string[];
    calls: Array<{
        dryRun: boolean;
    }>;
}
export declare function importFlow(file: string, opts: {
    yes: boolean;
    json: boolean;
}, deps: ImportDeps): Promise<ImportFlowResult>;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
export {};
