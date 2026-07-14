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
