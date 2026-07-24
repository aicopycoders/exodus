import yaml from "js-yaml";
function canonicalizeValue(value) {
    if (Array.isArray(value))
        return value.map(canonicalizeValue);
    if (value !== null && typeof value === "object") {
        const src = value;
        const out = {};
        for (const key of Object.keys(src).sort()) {
            out[key] = canonicalizeValue(src[key]);
        }
        return out;
    }
    return value;
}
function orderKeys(record, fixedOrder) {
    const out = {};
    for (const key of fixedOrder) {
        if (record[key] !== undefined)
            out[key] = record[key];
    }
    const fixed = new Set(fixedOrder);
    for (const key of Object.keys(record).sort()) {
        if (!fixed.has(key) && record[key] !== undefined)
            out[key] = record[key];
    }
    return out;
}
function canonicalizeContract(contract) {
    const root = contract;
    const nodes = Array.isArray(root.nodes) ? root.nodes : [];
    const edges = Array.isArray(root.edges) ? root.edges : [];
    const canonicalNodes = nodes.map((n) => {
        const rec = { ...n };
        if (rec.position !== null && typeof rec.position === "object") {
            rec.position = orderKeys(rec.position, ["x", "y"]);
        }
        if (rec.config !== null && typeof rec.config === "object") {
            rec.config = canonicalizeValue(rec.config);
        }
        return orderKeys(rec, ["id", "kind", "position", "config"]);
    });
    const canonicalEdges = edges.map((e) => orderKeys({ ...e }, [
        "id",
        "source",
        "sourceHandle",
        "target",
        "targetHandle",
    ]));
    const rootRecord = {
        ...root,
        nodes: canonicalNodes,
        edges: canonicalEdges,
    };
    if (Array.isArray(root.slots)) {
        rootRecord.slots = root.slots.map((s) => orderKeys({ ...s }, [
            "id",
            "label",
            "state",
            "nodeId",
            "configKey",
            "value",
            "hint",
        ]));
    }
    if (Array.isArray(root.triggers)) {
        rootRecord.triggers = root.triggers.map((t) => orderKeys({ ...t }, [
            "type",
            "event",
            "cron",
            "enabled",
        ]));
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
export function workflowToYaml(contract) {
    return yaml.dump(canonicalizeContract(contract), {
        schema: yaml.CORE_SCHEMA,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
        indent: 2,
    });
}
export function parseWorkflowText(text) {
    try {
        return JSON.parse(text);
    }
    catch {
    }
    let loaded;
    try {
        loaded = yaml.load(text, { schema: yaml.CORE_SCHEMA });
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`workflow file is not valid YAML or JSON: ${detail}`);
    }
    if (typeof loaded !== "object" || loaded === null || Array.isArray(loaded)) {
        throw new Error("workflow file is not valid YAML or JSON");
    }
    return loaded;
}
