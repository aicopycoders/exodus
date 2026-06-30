export declare const helpText: string;
interface TemplateRender {
    url: string;
    adType?: string;
    status?: string;
    model?: string;
}
export declare function formatRenderLines(renders: TemplateRender[] | undefined): string[];
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
export {};
