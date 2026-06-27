export declare function promptYesNo(question: string, defaultValue?: boolean): Promise<boolean>;
export interface ChoiceOption {
    key: string;
    label: string;
}
export declare function promptChoice(question: string, options: ChoiceOption[], defaultKey?: string): Promise<string>;
export declare function promptMultiline(prompt: string): Promise<string>;
export declare function openInEditor(initial: string, fileSuffix?: string): string | null;
export declare function promptText(question: string): Promise<string>;
