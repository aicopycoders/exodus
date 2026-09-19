export interface FlagOccurrence {
    flag: string;
    value: string | undefined;
}
export interface ParsedArgs {
    command: string;
    flags: Record<string, string | boolean>;
    occurrences: FlagOccurrence[];
}
export declare function parseArgs(argv: string[]): ParsedArgs;
