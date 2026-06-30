export declare const PROVIDER_ENV_MAP: Record<string, string>;
export declare const SERVER_RESOLVED_PROVIDERS: Set<string>;
export interface RemoteKeys {
    keys: Record<string, string>;
    failed: string[];
}
export declare function fetchRemoteKeys(): Promise<RemoteKeys>;
export declare function resolveEnvFilePath(): string;
export interface UpsertResult {
    name: string;
    action: "added" | "updated" | "unchanged";
}
export declare function upsertEnvVars(filePath: string, vars: Record<string, string>): UpsertResult[];
export declare function mapKeysToEnvVars(keys: Record<string, string>): {
    vars: Record<string, string>;
    serverResolved: string[];
    skipped: string[];
};
