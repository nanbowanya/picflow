import { MarkdownView, Notice } from "obsidian";
import { IAIManager } from "../interfaces";
import { QuoteMetadata, ChatMessage } from "../ai/models";
import PicFlowPlugin from "../../main";
import { t } from "../i18n";

export class StubAIManager implements IAIManager {
    plugin: PicFlowPlugin;

    constructor(plugin: PicFlowPlugin) {
        this.plugin = plugin;
    }

    getQuoteFromSelection(_view: MarkdownView): QuoteMetadata | null {
        this.showProNotice();
        return null;
    }

    insertTextAtCursor(_view: MarkdownView, _text: string): void {
        this.showProNotice();
    }

    generateImage(_prompt: string, _options?: unknown): Promise<string> {
        this.showProNotice();
        return Promise.resolve("");
    }

    insertImageAtCursor(_view: MarkdownView, _message: ChatMessage): Promise<void> {
        this.showProNotice();
        return Promise.resolve();
    }

    chatCompletionStream(_systemPrompt: string, _messages: ChatMessage[], _historyMessages: ChatMessage[], _callback: (chunk: string) => void): Promise<void> {
        this.showProNotice();
        return Promise.resolve();
    }
    
    analyzeImage(_imageFile: File, _prompt?: string): Promise<string> {
        this.showProNotice();
        return Promise.resolve("");
    }
    
    generateImageVariant(_imageFile: File, _prompt?: string): Promise<string> {
         this.showProNotice();
         return Promise.resolve("");
    }

    quickAction(_view: MarkdownView, _text: string): Promise<void> {
        this.showProNotice();
        return Promise.resolve();
    }

    private showProNotice() {
        new Notice(t('notice.ai.pro', this.plugin.settings));
        
        // Open Settings -> Status Tab
        if (this.plugin.app.setting) {
            this.plugin.app.setting.open();
            const settingTab = this.plugin.app.setting.pluginTabs.find((t: unknown) => t.id === this.plugin.manifest.id);
            if (settingTab) {
                settingTab.currentTab = 'Status';
                settingTab.display();
            }
        }
    }
}
