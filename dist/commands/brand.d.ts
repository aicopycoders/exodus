export declare const helpText: string;
interface Brand {
    id: string;
    slug: string;
    name: string;
    owned?: boolean;
}
interface MineResp {
    role: "admin" | "member" | "unknown";
    activeBrandId: string | null;
    activeBrandSlug: string | null;
    brands: Brand[];
}
export declare function fetchMine(): Promise<MineResp>;
export declare function fetchMineOrThrow(): Promise<MineResp>;
export declare function refreshBrandProfileMd(opts?: {
    slug?: string;
}): Promise<{
    written: boolean;
    pathRel: string;
    reason?: string;
}>;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
export {};
