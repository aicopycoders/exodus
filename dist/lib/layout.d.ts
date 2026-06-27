export declare const BRAND_MARKER_FILE = ".exodus-brand.json";
export interface BrandDirInfo {
    slug: string;
    name: string;
    dir: string;
}
export type Layout = "v2" | "legacy";
export interface ActiveBrand {
    slug: string | null;
    source: "folder" | "pointer" | null;
}
export declare function findParentRoot(startDir?: string): string;
export declare function detectLayout(root?: string): Layout;
export declare function listBrandDirs(root?: string): BrandDirInfo[];
export declare function brandDirNameForSlug(slug: string): string;
export declare function brandDirFor(root: string, slug: string): string;
export declare function ensureBrandDir(root: string, brand: {
    slug: string;
    name?: string;
}): {
    dir: string;
    created: boolean;
};
export declare function findBrandDirFromCwd(cwd?: string, root?: string): BrandDirInfo | null;
export declare function resolveActiveBrand(opts?: {
    cwd?: string;
    root?: string;
}): ActiveBrand;
export declare function brandStateDir(opts?: {
    slug?: string;
    cwd?: string;
    root?: string;
}): string;
export declare function brandOutputDir(opts?: {
    slug?: string;
    cwd?: string;
    root?: string;
}): string;
