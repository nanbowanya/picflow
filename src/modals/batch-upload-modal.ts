import { App, Modal, MarkdownView } from 'obsidian';
import PicFlowPlugin from '../../main';
import { t } from '../i18n';
import { BatchUploadManager } from '../managers/batch-upload-manager';

export class BatchUploadModal extends Modal {
    plugin: PicFlowPlugin;
    manager: BatchUploadManager;
    view: MarkdownView;

    constructor(app: App, plugin: PicFlowPlugin, manager: BatchUploadManager, view: MarkdownView) {
        super(app);
        this.plugin = plugin;
        this.manager = manager;
        this.view = view;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Register callback to update UI from Manager
        this.manager.onUpdate = () => this.display();
        this.manager.onCloseRequest = () => this.close();

        // If manager is idle or working on another file, start scan
        // If manager is already working on THIS file (re-open), just display
        if (this.manager.currentView !== this.view || this.manager.images.length === 0) {
            contentEl.createEl('h2', { text: t('batch.title', this.plugin.settings) });
            contentEl.createEl('p', { text: t('batch.scanning', this.plugin.settings) });
            await this.manager.scanImages(this.view);
        }
        
        this.display();
    }

    display() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: t('batch.title', this.plugin.settings) });

        if (this.manager.images.length === 0) {
            contentEl.createEl('p', { text: t('batch.noImages', this.plugin.settings) });
            return;
        }

        const listContainer = contentEl.createEl('div', { cls: 'picflow-batch-list' });

        // Header Row
        const headerRow = listContainer.createEl('div', { cls: 'picflow-batch-header' });

        const checkHeader = headerRow.createEl('input', { type: 'checkbox', cls: 'picflow-batch-header-check' });
        checkHeader.checked = this.manager.images.every(img => img.checked);
        checkHeader.onchange = (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            this.manager.images.forEach(img => img.checked = checked);
            this.display();
        };

        headerRow.createEl('span', { text: t('batch.header.image', this.plugin.settings), cls: 'picflow-batch-header-image' });
        headerRow.createEl('span', { text: t('batch.header.status', this.plugin.settings), cls: 'picflow-batch-header-status' });

        // Image Rows
        this.manager.images.forEach((img, index) => {
            const row = listContainer.createEl('div', { cls: 'picflow-batch-row' });
            // row:nth-child(odd) handled in CSS

            // Checkbox
            const checkbox = row.createEl('input', { type: 'checkbox', cls: 'picflow-batch-row-check' });
            checkbox.checked = img.checked;
            checkbox.disabled = this.manager.isUploading || img.status === 'success';
            checkbox.onchange = (e) => {
                img.checked = (e.target as HTMLInputElement).checked;
            };

            // Preview & Name
            const infoDiv = row.createEl('div', { cls: 'picflow-batch-row-info' });

            // Thumbnail
            if (img.blob) {
                 const url = URL.createObjectURL(img.blob);
                 const thumb = infoDiv.createEl('img', { cls: 'picflow-batch-thumb' });
                 thumb.src = url;
            } else {
                const placeholder = infoDiv.createEl('div', { cls: 'picflow-batch-placeholder' });
                placeholder.setText('?');
            }

            const nameSpan = infoDiv.createEl('span', { text: img.name, cls: 'picflow-batch-name' });
            nameSpan.title = img.path;

            // Status
            const statusDiv = row.createEl('div');
            statusDiv.addClass('picflow-batch-status-div');
            // Styles moved to CSS class .picflow-batch-status-div
            
            if (img.status === 'pending') {
                statusDiv.setText(t('batch.status.pending', this.plugin.settings));
                statusDiv.addClass('picflow-muted-text');
            } else if (img.status === 'uploading') {
                statusDiv.setText(t('batch.status.uploading', this.plugin.settings));
                statusDiv.addClass('picflow-accent-text');
            } else if (img.status === 'success') {
                statusDiv.setText(t('batch.status.success', this.plugin.settings));
                statusDiv.addClass('picflow-success-text');
            } else if (img.status === 'error') {
                statusDiv.setText(t('batch.status.error', this.plugin.settings));
                statusDiv.addClass('picflow-error-text');
                statusDiv.title = img.errorMsg || 'Unknown error';
            }
        });

        // Footer Actions
        const footer = contentEl.createEl('div');
        footer.addClass('picflow-batch-footer');
        // Styles moved to CSS class .picflow-batch-footer

        const profileName = this.plugin.settings.profiles.find(p => p.id === this.plugin.settings.selectedProfileId)?.name || 'Unknown';
        footer.createEl('span', { text: t('batch.footer.target', this.plugin.settings).replace('{name}', profileName) }).addClass('picflow-muted-text');

        const btnGroup = footer.createEl('div');
        btnGroup.addClass('picflow-batch-btn-group');
        // Styles moved to CSS class .picflow-batch-btn-group

        // Minimize / Background Button
        const minimizeBtn = btnGroup.createEl('button', { text: t('batch.btn.background', this.plugin.settings) });
        minimizeBtn.onclick = () => {
            this.close(); // Just close modal, manager keeps running
        };

        const cancelBtn = btnGroup.createEl('button', { text: t('batch.btn.cancel', this.plugin.settings) });
        cancelBtn.onclick = () => {
            if (this.manager.isUploading) {
                this.manager.cancelUpload();
            }
            this.close();
        };

        const uploadBtn = btnGroup.createEl('button', { text: t('batch.btn.upload', this.plugin.settings) });
        uploadBtn.classList.add('mod-cta');
        uploadBtn.disabled = this.manager.isUploading || this.manager.images.filter(i => i.checked && i.status !== 'success').length === 0;
        uploadBtn.onclick = () => this.manager.startUpload();
    }

    onClose() {
        this.manager.onUpdate = null; // Detach listener
        this.manager.onCloseRequest = null;
        const { contentEl } = this;
        contentEl.empty();
    }
}
