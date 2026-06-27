export declare const helpText: string;
export interface CheckResult {
    ok: boolean;
    warn?: boolean;
    todo?: boolean;
    label: string;
    detail?: string;
    fix?: string;
}
export declare function checkNodeVersion(): CheckResult;
export declare function checkClaudeCli(): CheckResult;
export declare function checkEnvFile(): CheckResult;
export declare function checkWhoami(): Promise<CheckResult>;
export declare function checkActiveBrandMatch(): Promise<CheckResult>;
export declare function checkExodusDistFreshness(pkgRootOverride?: string): CheckResult;
export declare function checkVersionCurrency(pkgRootOverride?: string, fetchImpl?: typeof fetch): Promise<CheckResult>;
export declare function checkApiAndDrive(): Promise<CheckResult[]>;
export declare function checkDashboardAuth(): Promise<CheckResult>;
export declare function checkLayout(): CheckResult;
export declare function checkBrandProfileGenesisDepth(): CheckResult;
export declare function run(_flags: Record<string, string | boolean>): Promise<void>;
