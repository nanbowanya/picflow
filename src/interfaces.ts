
import { TFile, MarkdownView } from 'obsidian';

import { AIModel, QuoteMetadata, ChatMessage } from './ai/models';

export interface IAIManager {
    getQuoteFromSelection(view: MarkdownView): QuoteMetadata | null;
    insertTextAtCursor(view: MarkdownView, text: string): void;
    insertImageAtCursor(view: MarkdownView, message: ChatMessage): Promise<void>;
}

export interface IAIService {
    generateImage(settings: unknown, modelOrOptions: unknown, prompt?: string): Promise<string | null>;
    chatCompletionStream(settings: unknown, model: AIModel, history: unknown[], onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<void>;
}

export interface IPlatformPublisher {
    publish(file: TFile, accountId: string, themeName?: string, options?: unknown): Promise<void>;
    testConnection?(): Promise<boolean>;
    getCategories?(): Promise<string[]>;
}

export interface IHtmlRenderer {
    render(markdown: string, themeName?: string): Promise<string>;
}

export interface ClipResult {
    title: string;
    url: string;
    markdown: string;
    images: string[];
    byline?: string;
    excerpt?: string;
    siteName?: string;
}

export interface IClipManager {
    fetchAndParse(url: string): Promise<ClipResult>;
}

export interface IMigrationManager {
    scanVault(includeRemote?: boolean): Promise<unknown[]>;
    files: unknown[];
    isMigrating: boolean;
    includeRemote: boolean;
    onUpdate: (() => void) | null;
    startMigration(targetProfileId: string): Promise<void>;
}

export interface IThemeExtractorManager {
    extractTheme(url: string): Promise<{
        css: string;
        markdown: string;
        themeName: string;
        demo?: string;
    } | null>;
    saveTheme(name: string, css: string): Promise<void>;
}

