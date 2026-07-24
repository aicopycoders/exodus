import { type ApiResponse } from "../lib/client.js";
import { type Channel } from "../lib/channel.js";
export declare const helpText: string;
export interface SessionSummary {
    _id: string;
    title: string;
    botSlug: string;
    runId?: string;
    nodeId?: string;
    archived: boolean;
    lastTouchedAt: number | string;
    createdAt: number | string;
}
export interface SessionListResponse {
    sessions: SessionSummary[];
}
export type SessionMessageRole = "system" | "user" | "assistant";
export interface SessionMessage {
    role: SessionMessageRole;
    body: string;
    createdAt: number | string;
}
export interface SessionShowResponse {
    session: SessionSummary & {
        promptText?: string;
        model?: string;
    };
    messages: SessionMessage[];
}
export interface SessionChatResponse {
    reply: string;
}
export interface SessionDeps {
    get: (path: string) => Promise<ApiResponse<unknown>>;
    postDashboard: (path: string, body: unknown, opts?: {
        timeoutMs?: number;
    }) => Promise<ApiResponse<unknown>>;
    channel: Channel;
}
export interface FlowResult {
    code: number;
    lines: string[];
}
export declare function shortId(id: string): string;
export declare function formatAge(value: number | string | undefined, now?: number): string;
export declare function formatSessionList(sessions: SessionSummary[], now?: number): string;
export declare function formatSessionShow(data: SessionShowResponse): string;
export declare function listFlow(json: boolean, deps: SessionDeps): Promise<FlowResult>;
export declare function showFlow(sessionId: string, opts: {
    json: boolean;
}, deps: SessionDeps): Promise<FlowResult>;
export declare function chatFlow(sessionId: string, message: string, opts: {
    json: boolean;
}, deps: SessionDeps): Promise<FlowResult>;
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
