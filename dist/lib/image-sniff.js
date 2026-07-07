export const BRAND_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export function sniffImageType(buf) {
    if (buf.length >= 8) {
        const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        if (png.every((b, i) => buf[i] === b)) {
            return { ext: "png", mime: "image/png" };
        }
    }
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return { ext: "jpg", mime: "image/jpeg" };
    }
    if (buf.length >= 12 &&
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
        return { ext: "webp", mime: "image/webp" };
    }
    return null;
}
