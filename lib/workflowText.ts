// Canonical YAML text form for workflow export/import (#863). MIRROR of
// convex/lib/workflow/textForm.ts — exodus builds standalone (plain tsc) and
// cannot import convex/lib at runtime, so the two implementations are kept
// byte-for-byte equivalent by hand. The lockstep tests in
// exodus/__tests__/workflow.test.ts import the convex originals and assert CLI
// dump === convex dump / CLI parse deep-equals convex parse; any drift here
// fails those tests (same pattern as the mirrored contract types in
// commands/workflow.ts). Change convex → change this in the same commit.
import yaml from "js-yaml";
import type { WorkflowContractJson } from "../commands/workflow.js";

/**
 * Recursively canonicalize a JSON value: plain-object keys sorted alphabetically
 * (so config never depends on authoring order), arrays keep element order but
 * their elements are recursed, primitives pass through untouched.
 */
function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      out[key] = canonicalizeValue(src[key]);
    }
    return out;
  }
  return value;
}

/**
 * Rebuild a record in a fixed leading-key order, then append every remaining
 * ("extra") key alphabetically. Undefined values are dropped; extras are
 * preserved rather than lost.
 */
function orderKeys(
  record: Record<string, unknown>,
  fixedOrder: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of fixedOrder) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  const fixed = new Set(fixedOrder);
  for (const key of Object.keys(record).sort()) {
    if (!fixed.has(key) && record[key] !== undefined) out[key] = record[key];
  }
  return out;
}

/**
 * The canonical object a contract dumps to: root/node/edge keys in fixed order,
 * position as {x,y}, config alphabetized recursively. Reads the contract as an
 * open record so unknown extra keys are preserved (sorted) after the modeled ones.
 */
function canonicalizeContract(
  contract: WorkflowContractJson,
): Record<string, unknown> {
  const root = contract as unknown as Record<string, unknown>;

  const nodes = Array.isArray(root.nodes) ? root.nodes : [];
  const edges = Array.isArray(root.edges) ? root.edges : [];

  const canonicalNodes = nodes.map((n) => {
    const rec = { ...(n as Record<string, unknown>) };
    if (rec.position !== null && typeof rec.position === "object") {
      rec.position = orderKeys(rec.position as Record<string, unknown>, ["x", "y"]);
    }
    if (rec.config !== null && typeof rec.config === "object") {
      rec.config = canonicalizeValue(rec.config);
    }
    return orderKeys(rec, ["id", "kind", "position", "config"]);
  });

  const canonicalEdges = edges.map((e) =>
    orderKeys({ ...(e as Record<string, unknown>) }, [
      "id",
      "source",
      "sourceHandle",
      "target",
      "targetHandle",
    ]),
  );

  const rootRecord: Record<string, unknown> = {
    ...root,
    nodes: canonicalNodes,
    edges: canonicalEdges,
  };

  // #861 (MS-7): exposed slots ride between `description` and `nodes` with each
  // slot's keys in a fixed order. Only transform when it's actually an array; a
  // slot-free contract has no `slots` key, so orderKeys omits it and the dump
  // stays byte-identical to a pre-#861 one. MIRROR of convex textForm.ts.
  if (Array.isArray(root.slots)) {
    rootRecord.slots = root.slots.map((s) =>
      orderKeys({ ...(s as Record<string, unknown>) }, [
        "id",
        "label",
        "state",
        "nodeId",
        "configKey",
        "value",
        "hint",
      ]),
    );
  }

  // #862 (MS-8): triggers ride between `slots` and `nodes`, each trigger's keys
  // in a fixed order (type first, then the type-specific field, then enabled).
  // Same treatment as slots — a trigger-free contract dumps byte-identically to
  // a pre-#862 one. MIRROR of convex textForm.ts.
  if (Array.isArray(root.triggers)) {
    rootRecord.triggers = root.triggers.map((t) =>
      orderKeys({ ...(t as Record<string, unknown>) }, [
        "type",
        "event",
        "cron",
        "enabled",
      ]),
    );
  }

  return orderKeys(rootRecord, [
    "contract",
    "version",
    "workflowId",
    "updatedAt",
    "name",
    "description",
    "slots",
    "triggers",
    "nodes",
    "edges",
  ]);
}

/**
 * The CANONICAL dump: byte-identical for equal contract CONTENT. Options are
 * load-bearing and must match convex textForm.ts exactly — CORE_SCHEMA (JSON
 * value semantics, no YAML-1.1 coercion), lineWidth -1 (never fold; multi-line
 * strings become literal block scalars that round-trip byte-exact), noRefs (no
 * anchors/aliases), sortKeys false (key order is ours, fixed above).
 */
export function workflowToYaml(contract: WorkflowContractJson): string {
  return yaml.dump(canonicalizeContract(contract), {
    schema: yaml.CORE_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    indent: 2,
  });
}

/**
 * Parse a workflow file that may be EITHER canonical YAML or legacy JSON into the
 * raw JSON value tree. JSON.parse first (byte-exact legacy path); yaml.load with
 * CORE_SCHEMA on failure (CORE_SCHEMA is load-bearing — DEFAULT_SCHEMA would
 * coerce dates/octal-looking strings and break the JSON-value contract). A bare
 * scalar/array/null is not a contract, so throw the "not valid YAML or JSON" error.
 */
export function parseWorkflowText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON — fall through to the YAML path.
  }
  let loaded: unknown;
  try {
    loaded = yaml.load(text, { schema: yaml.CORE_SCHEMA });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`workflow file is not valid YAML or JSON: ${detail}`);
  }
  if (typeof loaded !== "object" || loaded === null || Array.isArray(loaded)) {
    throw new Error("workflow file is not valid YAML or JSON");
  }
  return loaded;
}
