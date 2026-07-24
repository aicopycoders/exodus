import type { ApiResponse } from "./client.js";
import { type Channel } from "./channel.js";
export declare function isSemanticApiError(data: unknown): boolean;
export declare function missingRouteLine(res: ApiResponse<unknown>, verb: string, channel?: Channel): string | undefined;
