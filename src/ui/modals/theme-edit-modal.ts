import { App, Modal, Setting, TextAreaComponent, Notice } from "obsidian";
import PicFlowPlugin from "../../../main";
import { t } from "../../i18n";

export class ThemeEditModal extends Modal {
    plugin: PicFlowPlugin;
    themeName: string;
    cssContent: string;
    onSave: (name: string, css: string) => void;

    constructor(app: App, plugin: PicFlowPlugin, themeName: string, cssContent: string, onSave: (name: string, css: string) => void) {
        super(app);
        this.plugin = plugin;
        this.themeName = themeName;
        this.cssContent = cssContent;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("picflow-modal");
        contentEl.addClass("picflow-theme-edit-modal");

        contentEl.createEl("h2", { text: `${t('settings.extractor.btn.save', this.plugin.settings)}: ${this.themeName}` });

        // CSS Editor Area
        const editorContainer = contentEl.createDiv({ cls: "picflow-theme-editor-container" });
        const textArea = new TextAreaComponent(editorContainer);
        textArea.inputEl.addClass("picflow-theme-editor-textarea");
        // Styles moved to CSS class .picflow-theme-editor-textarea
        textArea.setValue(this.cssContent);
        textArea.onChange((value) => {
            this.cssContent = value;
        });

        // Actions
        const actions = contentEl.createDiv({ cls: "modal-button-container" });
        
        const saveBtn = actions.createEl("button", { text: t('settings.extractor.btn.save', this.plugin.settings), cls: "mod-cta" });
        saveBtn.onclick = () => {
            this.onSave(this.themeName, this.cssContent);
            this.close();
        };

        const cancelBtn = actions.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
