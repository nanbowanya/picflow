import { ButtonComponent, Notice, TextAreaComponent, MarkdownView, MarkdownRenderer } from "obsidian";
import PicFlowPlugin from "../../../main";
import { t } from "../../i18n";
import { ClipResult, IClipManager } from "../../interfaces";
import { StubClipManager } from "../../managers/stub-clip-manager";

export class ClipDrawer {
    plugin: PicFlowPlugin;
    container: HTMLElement;

    // Clip State
    clipUrl: string = "";
    clipIsFetching: boolean = false;
    clipResult: ClipResult | null = null;
    // aiSummary removed

    // To be used by the markdown renderer
    parentComponent: unknown;
    clipManager: IClipManager;

    constructor(plugin: PicFlowPlugin, container: HTMLElement, parentComponent: unknown) {
        this.plugin = plugin;
        this.container = container;
        this.parentComponent = parentComponent;
        
        // Initialize with Stub
        this.clipManager = new StubClipManager();

        // Dynamic load Clip Manager
        void this.loadClipManager();
    }

    async loadClipManager() {
        if (process.env.BUILD_TYPE === 'PRO') {
            try {
                const { ClipManager } = await import('../../core/managers/clip-manager');
                this.clipManager = new ClipManager(this.plugin);
            } catch (e) {
                console.error("Failed to load ClipManager:", e);
                this.clipManager = new StubClipManager();
            }
        }
    }

    render() {
        this.container.empty();
        this.container.addClass("clip-drawer");

        // Main scrollable content
        const scrollContainer = this.container.createDiv({ cls: 'picflow-scroll-container' });

        // Source Input
        const sourceGroup = scrollContainer.createDiv({ cls: "picflow-group" });
        sourceGroup.createEl("div", { text: t('sidebar.clip.urlSource', this.plugin.settings), cls: "setting-item-name" });

        const urlInput = new TextAreaComponent(sourceGroup);
        urlInput.setPlaceholder(t('sidebar.clip.urlPlaceholder', this.plugin.settings))
            .setValue(this.clipUrl)
            .onChange((value) => {
                this.clipUrl = value;
            });
        urlInput.inputEl.rows = 3;
        urlInput.inputEl.addClass('picflow-w-100');
        urlInput.inputEl.addClass('picflow-resize-vertical');

        // Preview Area
        if (this.clipResult && !this.clipIsFetching) {
            const previewArea = scrollContainer.createDiv({ cls: "picflow-preview-area" });

            previewArea.createEl("h4", { text: this.clipResult.title });

            const metaInfo = previewArea.createDiv({ cls: "picflow-meta-info" });

            if (this.clipResult.siteName) metaInfo.createSpan({ text: this.clipResult.siteName + " • " });
            if (this.clipResult.byline) metaInfo.createSpan({ text: this.clipResult.byline });

            if (this.clipResult.excerpt) {
                const excerptEl = previewArea.createDiv({ cls: "picflow-excerpt" });
                excerptEl.innerText = this.clipResult.excerpt;
            }

            previewArea.createEl("div", {
                text: t('sidebar.clip.detectedImages', this.plugin.settings).replace('{count}', this.clipResult.images.length.toString()),
                cls: "picflow-info-text"
            });

            const markdownPreview = previewArea.createDiv({ cls: "picflow-markdown-preview markdown-preview-view" });

            void MarkdownRenderer.render(
                this.plugin.app,
                this.clipResult.markdown,
                markdownPreview,
                this.clipResult.url || "",
                this.parentComponent
            );
        }

        // Sticky Footer Actions
        const footer = this.container.createDiv({ cls: "picflow-sticky-footer" });

        const previewBtn = new ButtonComponent(footer)
            .setButtonText(t('sidebar.clip.previewBtn', this.plugin.settings))
            .setDisabled(this.clipIsFetching)
            .onClick(async () => {
                await this.handlePreview(previewBtn);
            });
        previewBtn.buttonEl.addClass('picflow-flex-1');

        const clipBtn = new ButtonComponent(footer)
            .setButtonText(this.clipIsFetching ? t('sidebar.clip.processing', this.plugin.settings) : t('sidebar.clip.clipBtn', this.plugin.settings))
            .setCta()
            .setDisabled(this.clipIsFetching)
            .onClick(async () => {
                await this.handleClipToNote(clipBtn);
            });
        clipBtn.buttonEl.addClass('picflow-flex-1');
    }

    showProNotice() {
        new Notice(t('notice.clip.pro', this.plugin.settings));
        
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

    async handlePreview(btn: ButtonComponent) {
        // License Check
        if (this.plugin.settings.licenseStatus !== 'valid') {
                       // eslint-disable-next-line obsidianmd/ui/sentence-case
            new Notice("Pro feature: Please activate license in Settings.");
            // Redirect to Status Tab
            this.plugin.app.setting.open();
            const settingTab = this.plugin.app.setting.pluginTabs.find(t => t.id === this.plugin.manifest.id);
            if (settingTab) {
                settingTab.currentTab = 'Status';
                settingTab.display();
            }
            this.plugin.app.setting.openTabById(this.plugin.manifest.id);
            return;
        }

        if (!this.clipUrl) {
            new Notice(t('sidebar.clip.pleaseEnterUrl', this.plugin.settings));
            return;
        }

        btn.setButtonText(t('sidebar.clip.fetching', this.plugin.settings));
        btn.setDisabled(true);
        this.clipIsFetching = true;
        this.clipResult = null;
        this.render();

        try {
            // Use this.clipManager instead of new ClipManager
            this.clipResult = await this.clipManager.fetchAndParse(this.clipUrl);

            new Notice(t('sidebar.clip.previewReady', this.plugin.settings));
        } catch (e) {
            new Notice(t('sidebar.clip.previewFailed', this.plugin.settings).replace('{error}', e.message));
        } finally {
            this.clipIsFetching = false;
            btn.setButtonText(t('sidebar.clip.previewBtn', this.plugin.settings));
            btn.setDisabled(false);
            this.render();
        }
    }

    async handleClipToNote(btn: ButtonComponent) {
        // License Check
        if (this.plugin.settings.licenseStatus !== 'valid') {
                       // eslint-disable-next-line obsidianmd/ui/sentence-case
            new Notice("Pro feature: Please activate license in Settings.");
            // Redirect to Status Tab
            this.plugin.app.setting.open();
            const settingTab = this.plugin.app.setting.pluginTabs.find(t => t.id === this.plugin.manifest.id);
            if (settingTab) {
                settingTab.currentTab = 'Status';
                settingTab.display();
            }
            this.plugin.app.setting.openTabById(this.plugin.manifest.id);
            return;
        }

        if (!this.clipUrl) {
            new Notice(t('sidebar.clip.pleaseEnterUrl', this.plugin.settings));
            return;
        }

        if (!this.clipResult || this.clipResult.url !== this.clipUrl) {
            btn.setButtonText(t('sidebar.clip.fetching', this.plugin.settings));
            btn.setDisabled(true);
            this.clipIsFetching = true;

            try {
                // Use this.clipManager instead of new ClipManager
                this.clipResult = await this.clipManager.fetchAndParse(this.clipUrl);
            } catch (e) {
                new Notice(t('sidebar.clip.previewFailed', this.plugin.settings).replace('{error}', e.message));
                this.clipIsFetching = false;
                btn.setButtonText(t('sidebar.clip.clipBtn', this.plugin.settings));
                btn.setDisabled(false);
                return;
            }
            this.clipIsFetching = false;
        }

        btn.setButtonText(t('sidebar.clip.processing', this.plugin.settings));
        btn.setDisabled(true);

        try {
            // 1. Insert Content First (Optimistic UI)
            let view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

            if (!view) {
                const lastActiveFile = this.plugin.app.workspace.getActiveFile();
                if (lastActiveFile && lastActiveFile.extension === 'md') {
                    const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
                    const foundLeaf = leaves.find(l => (l.view as MarkdownView).file === lastActiveFile);
                    if (foundLeaf) {
                        view = foundLeaf.view as MarkdownView;
                    }
                }
            }

            if (!view) {
                const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
                if (leaves.length > 0) {
                    view = leaves[0].view as MarkdownView;
                }
            }

            if (view && view.editor) {
                const editor = view.editor;
                const contentToInsert = `# [${this.clipResult.title}](${this.clipResult.url})\n\n${this.clipResult.markdown}`;

                if (editor.somethingSelected()) {
                    editor.replaceSelection(contentToInsert);
                } else {
                    const lastLine = editor.lineCount();
                    editor.replaceRange(`\n\n${contentToInsert}`, { line: lastLine, ch: 0 });
                }
                new Notice(t('sidebar.clip.clipped', this.plugin.settings));

                void this.plugin.app.workspace.revealLeaf(view.leaf);

                // 2. Auto Upload (if enabled)
                if (this.plugin.settings.autoUpload && this.clipResult.images.length > 0) {
                    // Trigger Batch Upload for the newly inserted images
                    // We need to wait a bit for the editor to update
                               // eslint-disable-next-line @typescript-eslint/no-misused-promises
                    setTimeout(async () => {
                        if (!view) return;
                        
                        // Scan images in the view
                        await this.plugin.batchUploadManager.scanImages(view);
                        
                        // Filter to only upload images that were just clipped (by URL matching)
                        // This prevents uploading other random images in the document
                        const clippedImages = new Set(this.clipResult.images);
                        
                        this.plugin.batchUploadManager.images.forEach(img => {
                            // Only check if it's in our clipped list AND it's a remote image
                            const isRemote = img.path.startsWith('http://') || img.path.startsWith('https://');
                            // We match loosely because some URL params might change, but usually they are exact
                            // cleanPath in manager strips | params
                            const cleanPath = img.path.split('|')[0]; 
                            
                            if (isRemote && clippedImages.has(cleanPath)) {
                                img.checked = true;
                            } else {
                                img.checked = false;
                            }
                        });

                        const countToUpload = this.plugin.batchUploadManager.images.filter(i => i.checked).length;
                        
                        if (countToUpload > 0) {
                            new Notice(`Auto-uploading ${countToUpload} clipped images...`);
                            void this.plugin.batchUploadManager.startUpload();
                        }
                    }, 500);
                }

            } else {
                let filename = (this.clipResult.title || "Untitled Clip").replace(/[\\/:*?"<>|]/g, "").trim() || "Untitled Clip";
                const contentToInsert = `# [${this.clipResult.title}](${this.clipResult.url})\n\n${this.clipResult.markdown}`;

                const fileExists = this.plugin.app.vault.getAbstractFileByPath(`${filename}.md`);
                if (fileExists) {
                    filename = `${filename} ${Date.now()}`;
                }

                try {
                    const newFile = await this.plugin.app.vault.create(`${filename}.md`, contentToInsert);
                    const leaf = this.plugin.app.workspace.getLeaf(false);
                    await leaf.openFile(newFile);
                    new Notice(t('sidebar.clip.created', this.plugin.settings).replace('{file}', `${filename}.md`));
                    
                    // Also trigger auto upload for new file
                    if (this.plugin.settings.autoUpload && this.clipResult.images.length > 0) {
                                    // eslint-disable-next-line @typescript-eslint/no-misused-promises
                         setTimeout(async () => {
                            const newView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                            if (newView) {
                                await this.plugin.batchUploadManager.scanImages(newView);
                                const clippedImages = new Set(this.clipResult.images);
                                this.plugin.batchUploadManager.images.forEach(img => {
                                    const cleanPath = img.path.split('|')[0];
                                    if ((img.path.startsWith('http') || img.path.startsWith('https')) && clippedImages.has(cleanPath)) {
                                        img.checked = true;
                                    } else {
                                        img.checked = false;
                                    }
                                });
                                if (this.plugin.batchUploadManager.images.some(i => i.checked)) {
                                     new Notice(`Auto-uploading images...`);
                                     void this.plugin.batchUploadManager.startUpload();
                                }
                            }
                         }, 500);
                    }

                } catch (err: unknown) {
                    new Notice(t('sidebar.clip.createFailed', this.plugin.settings).replace('{error}', err.message));
                }
            }

        } catch (error) {
            console.error("Clip handling error:", error);
            new Notice(t('sidebar.clip.clipFailed', this.plugin.settings).replace('{error}', error.message));
        } finally {
            btn.setButtonText(t('sidebar.clip.clipBtn', this.plugin.settings));
            btn.setDisabled(false);
            this.render();
        }
    }
}
