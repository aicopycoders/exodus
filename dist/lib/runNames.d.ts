export declare const COPY_FACE_MODULE_KEY = "copy-face";
export interface RunNameFields {
    workflowName?: string;
    runTitle?: string;
    title?: string;
    moduleKey?: string;
}
export declare function runDisplayName(run: RunNameFields): string;
export declare function runTypeWord(run: RunNameFields): string;
export declare function runHeadingWord(run: RunNameFields): string;
