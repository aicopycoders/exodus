import { getVersion } from "./version.js";
export function channelOf(version) {
    return version.includes("-beta") ? "beta" : "latest";
}
export function getChannel() {
    return channelOf(getVersion());
}
export function pkgRef(channel = getChannel()) {
    return `@aicopycoders/exodus@${channel}`;
}
export function stampChannel(content, channel = getChannel()) {
    if (channel !== "beta")
        return content;
    return content.replace(/npx @aicopycoders\/exodus(@[A-Za-z0-9.-]+)?/g, `npx ${pkgRef(channel)}`);
}
