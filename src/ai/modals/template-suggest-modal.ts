
import { App, SuggestModal, Editor, Notice } from 'obsidian';
import PicFlowPlugin from '../../../main';
import { AIPromptTemplate } from '../prompts';
import { VIEW_TYPE_PICFLOW_SIDEBAR, PicFlowSidebarView } from '../../ui/sidebar';
import { t } from '../../i18n';

export class TemplateSuggestModal extends SuggestModal<AIPromptTemplate> {
    plugin: PicFlowPlugin;
    editor: Editor;

    constructor(app: App, plugin: PicFlowPlugin, editor: Editor) {
        super(app);
        this.plugin = plugin;
        this.editor = editor;
        this.setPlaceholder(t('ai.chat.placeholder.text'));
    }

    getSuggestions(query: string): AIPromptTemplate[] {
        const templates = this.plugin.settings.promptTemplates;
        return templates.filter(tpl => 
            tpl.name.toLowerCase().includes(query.toLowerCase()) || 
            tpl.description.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(template: AIPromptTemplate, el: HTMLElement) {
        el.createEl("div", { text: template.name });
        el.createEl("small", { text: template.description });
    }

    onChooseSuggestion(template: AIPromptTemplate, _evt: MouseEvent | KeyboardEvent) {
        // Use editor passed in constructor
        const selection = this.editor.getSelection();
        if (!selection) {
            new Notice(t('ai.chat.notice.noSelection'));
            // Continue anyway? Or return?
            // If template doesn't need selection, maybe ok.
            // But logic below assumes selection.
        }

        let prompt = template.template;
        if (prompt.includes("{{selection}}")) {
            prompt = prompt.replace("{{selection}}", selection || "");
        } else {
            prompt = `${prompt}\n\n${selection || ""}`;
        }

        // Handle async operations
        void this.handleSelection(prompt, template.model).catch(err => {
            console.error("Failed to process suggestion:", err);
        });
    }

    private async handleSelection(prompt: string, model: string) {
        // Open Sidebar and Send Message
        await this.plugin.activateSidebarView();
        
        // Find the view
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PICFLOW_SIDEBAR);
        if (leaves.length > 0) {
            const view = leaves[0].view as PicFlowSidebarView;
            if (view) {
                // Switch to AI tab
                await view.switchToTab('ai');
                // Send message
                await view.aiDrawer.sendMessage(prompt, model);
            }
        }
    }
}
