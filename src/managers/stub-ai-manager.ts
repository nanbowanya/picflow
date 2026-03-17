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

    async generateImage(_prompt: string, _options?: any): Promise<string> {
        this.showProNotice();
        return "";
    }

    async insertImageAtCursor(_view: MarkdownView, _message: ChatMessage): Promise<void> {
        this.showProNotice();
        return Promise.resolve();
    }

    async chatCompletionStream(_systemPrompt: string, _messages: ChatMessage[], _historyMessages: ChatMessage[], _callback: (chunk: string) => void): Promise<void> {
        this.showProNotice();
        return Promise.resolve();
    }
    
    async analyzeImage(_imageFile: File, _prompt?: string): Promise<string> {
        this.showProNotice();
        return "";
    }
    
    async generateImageVariant(_imageFile: File, _prompt?: string): Promise<string> {
         this.showProNotice();
         return "";
    }

    async quickAction(_view: MarkdownView, _text: string): Promise<void> {
        this.showProNotice();
        return Promise.resolve();
    }

    private showProNotice() {
        new Notice(t('notice.ai.pro', this.plugin.settings));
        
        // Open Settings -> Status Tab
        // @ts-ignore
        if (this.plugin.app.setting) {
            // @ts-ignore
            this.plugin.app.setting.open();
            // @ts-ignore
            const settingTab = this.plugin.app.setting.pluginTabs.find((t: any) => t.id === this.plugin.manifest.id);
            if (settingTab) {
                settingTab.currentTab = 'Status';
                settingTab.display();
            }
        }
    }
}
