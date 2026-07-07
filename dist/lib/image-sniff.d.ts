export declare const BRAND_IMAGE_MAX_BYTES: number;
export interface SniffedImageType {
    ext: "png" | "jpg" | "webp";
    mime: "image/png" | "image/jpeg" | "image/webp";
}
export declare function sniffImageType(buf: Uint8Array): SniffedImageType | null;
