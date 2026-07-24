import type { ApiResponse } from "./client.js";
import { getChannel, type Channel } from "./channel.js";

// ── #896: the missing-route helper ────────────────────────────────────────
// Sibling CLI specs (#891–#895) call new v2 API paths. When a workspace runs
// against an OUTDATED Convex backend that has never heard of the path, Convex
// answers a plain/non-JSON 404 for the unknown route — client.ts wraps that as
// `{ error: "Non-JSON 404 from <path>: …", httpStatus: 404 }`, a body with NO
// `code`. A route that IS deployed but genuinely can't find the resource
// answers the v2 semantic shape `{ code: "NOT_FOUND", error }` instead.
//
// This helper tells the two apart and, for a missing route only, returns one
// honest line telling the operator their backend is behind. Ruling: NO
// capability detection, NO handshake — copy only.

/**
 * True when a 404 body is the v2 API's SEMANTIC not-found shape. The apiError
 * helper (convex/http.ts) serializes as `{ error: { code, message } }` — the
 * code is NESTED under `error`, so that's the primary check; a top-level string
 * `code` is tolerated too in case a future route flattens it. A missing-route
 * 404 (wrapped non-JSON) carries neither, so this is false for it.
 */
export function isSemanticApiError(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  const topCode = record.code;
  if (typeof topCode === "string" && topCode.length > 0) return true;
  const err = record.error;
  if (typeof err !== "object" || err === null) return false;
  const nestedCode = (err as Record<string, unknown>).code;
  return typeof nestedCode === "string" && nestedCode.length > 0;
}

/**
 * Detect a MISSING-ROUTE 404 (an outdated backend that doesn't know the path)
 * and, when that's what happened, return the single honest error line for the
 * given verb label. Returns `undefined` for anything else — a non-404, or a
 * semantic `{code:"NOT_FOUND"}` — so callers fall through to normal error
 * rendering.
 *
 * @param verb    human label of the CLI verb, e.g. "session list" / "workflow
 *                triggers fire".
 * @param channel npm dist-tag channel; defaults to this build's own channel.
 */
export function missingRouteLine(
  res: ApiResponse<unknown>,
  verb: string,
  channel: Channel = getChannel(),
): string | undefined {
  if (res.status !== 404) return undefined;
  if (isSemanticApiError(res.data)) return undefined;
  return (
    `this server does not support ${verb} yet — ` +
    `your backend has not been updated (channel: ${channel})`
  );
}
