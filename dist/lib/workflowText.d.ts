import type { WorkflowContractJson } from "../commands/workflow.js";
export declare function workflowToYaml(contract: WorkflowContractJson): string;
export declare function parseWorkflowText(text: string): unknown;
