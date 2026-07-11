export type Channel = "beta" | "latest";
export declare function channelOf(version: string): Channel;
export declare function getChannel(): Channel;
export declare function pkgRef(channel?: Channel): string;
export declare function stampChannel(content: string, channel?: Channel): string;
