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

    getQuoteFromSelection(view: MarkdownView): QuoteMetadata | null {
        this.showProNotice();
        return null;
    }

    insertTextAtCursor(view: MarkdownView, text: string): void {
        this.showProNotice();
    }

    async insertImageAtCursor(view: MarkdownView, message: ChatMessage): Promise<void> {
        this.showProNotice();
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
