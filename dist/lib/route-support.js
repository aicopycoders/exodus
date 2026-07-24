import { getChannel } from "./channel.js";
export function isSemanticApiError(data) {
    if (typeof data !== "object" || data === null)
        return false;
    const record = data;
    const topCode = record.code;
    if (typeof topCode === "string" && topCode.length > 0)
        return true;
    const err = record.error;
    if (typeof err !== "object" || err === null)
        return false;
    const nestedCode = err.code;
    return typeof nestedCode === "string" && nestedCode.length > 0;
}
export function missingRouteLine(res, verb, channel = getChannel()) {
    if (res.status !== 404)
        return undefined;
    if (isSemanticApiError(res.data))
        return undefined;
    return (`this server does not support ${verb} yet — ` +
        `your backend has not been updated (channel: ${channel})`);
}
