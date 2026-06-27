export declare const helpText: string;
export interface RunFormat {
    layer: 1 | 2 | 3;
    name: string;
    template_id?: string;
    template_name?: string;
    box_count?: number;
    format_id?: string;
}
export declare function normalizeFormat(entry: unknown, index: number): RunFormat;
export declare function normalizeFormats(raw: unknown): RunFormat[];
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
