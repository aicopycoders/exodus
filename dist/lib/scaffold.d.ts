export declare const ENV_SCAFFOLD = "# Exodus config \u2014 paste your dashboard .env block below this line.\n# Get it from your Exodus dashboard -> Settings -> Claude Code -> \"Copy .env block\".\n# ONE key covers every brand you own; switch brands with brand subfolders or\n# `npx @aicopycoders/exodus brand use <slug>`, never by editing this file.\n";
export declare function writeEnvScaffold(root: string): {
    created: boolean;
};
export declare function ensureGitignore(root: string): void;
export declare function writeSkills(root: string, srcOverride?: string): string[];
export declare function writeReferences(root: string, srcOverride?: string): void;
export declare function writeDocs(root: string, srcOverride?: string): string[];
export declare function ensureBaseDirs(root: string): void;
