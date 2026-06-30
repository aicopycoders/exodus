export declare const helpText: string;
interface CreativeImage {
    url: string;
    source?: string;
    cNumber?: string;
    title?: string;
    model?: string;
}
export declare function formatImageLines(images: CreativeImage[] | undefined): string[];
export declare function run(flags: Record<string, string | boolean>): Promise<void>;
export {};
