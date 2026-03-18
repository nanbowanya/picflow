import { Editor, MarkdownView, Notice, requestUrl } from 'obsidian';
import PicFlowPlugin from '../../main';
import { UploadHandler } from './upload-handler';
import { ImageGenerationOptions } from '../ai/models';
import { IAIService } from '../interfaces';
import { StubAIService } from '../ai/stub-service';

export class EventHandler {
    plugin: PicFlowPlugin;
    uploadHandler: UploadHandler;
    aiService: IAIService;

    constructor(plugin: PicFlowPlugin, uploadHandler: UploadHandler) {
        this.plugin = plugin;
        this.uploadHandler = uploadHandler;
        // Default to Stub initially to ensure aiService is never undefined
        this.aiService = new StubAIService();
    }

    async load() {
        // Dynamic load AI Service
        if (process.env.BUILD_TYPE === 'PRO') {
            try {
                const { AIService } = await import('../core/ai/service');
                // Wrap static methods to match interface
                this.aiService = {
                    generateImage: AIService.generateImage,
                    chatCompletionStream: async (settings: unknown, model: unknown, history: unknown[], onChunk: (chunk: string) => void) => {
                        await AIService.chatCompletionStream(settings, model, history, onChunk);
                    }
                };
            } catch (e) {
                console.error("Failed to load AIService:", e);
                this.aiService = new StubAIService();
            }
        } else {
            this.aiService = new StubAIService();
        }
    }

    // Handle Paste Event
    async handlePaste(evt: ClipboardEvent, editor: Editor, view: MarkdownView) {
        if (evt.defaultPrevented) return;

        // 1. Check for files (Local Images)
        const files = evt.clipboardData?.files;
        if (files && files.length > 0) {
            const images = Array.from(files).filter(file => file.type.startsWith('image/'));
            if (images.length > 0) {
                if (!this.plugin.settings.autoUpload) return;
                evt.preventDefault();
                for (const image of images) {
                    await this.uploadHandler.uploadImage(image, view);
                }
                return;
            }
        }

        // 2. Check for text/html (Online Images)
        if (!this.plugin.settings.autoUpload) return;

        const text = evt.clipboardData?.getData('text/plain');
        if (!text) return;

        // Case A: Pure URL (e.g. https://example.com/image.png)
        if (this.isImageUrl(text)) {
            evt.preventDefault();
            await this.uploadHandler.uploadOnlineImage(text, view);
            return;
        }

        // Case B: Markdown Image Syntax (e.g. ![](https://...))
        const markdownImageRegex = /!\[(.*?)\]\((https?:\/\/.*?)\)/g;
        let match;
        const matches = [];
        while ((match = markdownImageRegex.exec(text)) !== null) {
            matches.push({ full: match[0], alt: match[1], url: match[2] });
        }

        if (matches.length > 0) {
            evt.preventDefault();
            let newText = text;

            for (const m of matches) {
                const newUrl = await this.uploadHandler.uploadOnlineImage(m.url, view, true);
                if (newUrl) {
                    newText = newText.replace(m.url, newUrl);
                }
            }

            editor.replaceSelection(newText);
        }
    }

    private isImageFile(file: File): boolean {
        return file.type.startsWith('image/');
    }

    private async handleFiles(files: File[], view: MarkdownView): Promise<void> {
        try {
            for (const file of files) {
                if (this.isImageFile(file)) {
                     await this.uploadHandler.uploadImage(file, view);
                }
            }
        } catch (_e) {
             // ignore
        }
    }

    isImageUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            const path = parsed.pathname.toLowerCase();
            return /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/.test(path);
        } catch (_e) {
            return false;
        }
    }

    // Handle Drop Event
    async handleDrop(evt: DragEvent, editor: Editor, view: MarkdownView) {
        if (evt.defaultPrevented) return;

        const files = evt.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const images = Array.from(files).filter(file => file.type.startsWith('image/'));
        if (images.length === 0) return;

        if (!this.plugin.settings.autoUpload) return;

        evt.preventDefault();

        for (const image of images) {
            await this.uploadHandler.uploadImage(image, view);
        }
    }

    // Handle AI Generation Drop In Editor
    async handleAIGeneration(options: ImageGenerationOptions, view: MarkdownView) {
        const editor = view.editor;
        const prompt = options.prompt;

        // 1. Insert loading placeholder
        const placeholder = `![AI Generating: ${prompt.substring(0, 20)}...]()`;
        const cursor = editor.getCursor();
        editor.replaceRange(placeholder, cursor);
        const startPos = { ...cursor };
        const endPos = { line: cursor.line, ch: cursor.ch + placeholder.length };

        try {
            // 2. Call AI Service
            const imageUrl = await this.aiService.generateImage(this.plugin.settings, options);

            if (!imageUrl) {
                editor.replaceRange(`![AI Generation Failed](${prompt})`, startPos, endPos);
                return;
            }

            // 3. Download Image to Blob/File
            new Notice('Downloading generated image...');
            const response = await requestUrl({ url: imageUrl });
            const blob = new Blob([response.arrayBuffer], { type: response.headers['content-type'] });

            // 4. Upload to current profile
            const file = new File([blob], `ai-gen-${Date.now()}.png`, { type: 'image/png' });

            // Remove the placeholder first
            editor.replaceRange('', startPos, endPos);

            // Move cursor back to start
            editor.setCursor(startPos);

            await this.uploadHandler.uploadImage(file, view);

        } catch (error) {
            console.error('AI Generation Error:', error);
            new Notice('Failed to generate or upload AI image.');
            editor.replaceRange(`![AI Error: ${(error as Error).message}](${prompt})`, startPos, endPos);
        }
    }
}
