export declare function compareVersions(a: string, b: string): number;
export declare function readPackageVersion(exodusDir: string): string;
export declare function readOwnedCommands(exodusDir: string): string[];
export declare function missingInstalledCommands(exodusDir: string, ownedCommands: string[]): string[];
