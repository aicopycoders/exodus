const PROD_BACKEND = "accomplished-tapir-106";
const DEV_BACKEND = "good-cod-360";
const PLACEHOLDER_MARK = "YOUR-EXODUS-BACKEND";
export function isPlaceholderApiUrl(apiUrl) {
    return !apiUrl || apiUrl.includes(PLACEHOLDER_MARK);
}
export function auth401Hint(apiUrl) {
    let host = apiUrl || "(no EXODUS_API_URL set)";
    try {
        host = new URL(apiUrl).host;
    }
    catch {
    }
    return [
        `This API key was rejected by ${host} (HTTP 401).`,
        `Keys are environment-bound — this key may belong to the other environment.`,
        `Set EXODUS_API_URL in your .env to match the dashboard you signed up on:`,
        `  • xo.copycoders.ai      → EXODUS_API_URL=https://${PROD_BACKEND}.convex.site`,
        `  • dev.xo.copycoders.ai  → EXODUS_API_URL=https://${DEV_BACKEND}.convex.site`,
        `Then re-run \`node exodus/dist/bin/exodus.js whoami\`.`,
    ].join("\n");
}
