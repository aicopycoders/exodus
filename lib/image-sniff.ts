// Magic-byte sniffing for brand-identity image uploads (DEV-2). The upload
// path trusts file CONTENT, never the extension — a text file renamed .png
// must be rejected before any bytes leave the machine.

/** Per-file size cap for brand images (route + CLI agree on this). */
export const BRAND_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

export interface SniffedImageType {
  ext: "png" | "jpg" | "webp";
  mime: "image/png" | "image/jpeg" | "image/webp";
}

/**
 * Identify png / jpeg / webp from leading magic bytes. Returns null for
 * anything else — the accepted set matches what the image pipelines consume.
 */
export function sniffImageType(buf: Uint8Array): SniffedImageType | null {
  if (buf.length >= 8) {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (png.every((b, i) => buf[i] === b)) {
      return { ext: "png", mime: "image/png" };
    }
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // "RIFF"
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 // "WEBP"
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}
