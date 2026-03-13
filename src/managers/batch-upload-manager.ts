import { App, MarkdownView, Notice, setIcon, TFile } from 'obsidian';
// @ts-ignore
import PicFlowPlugin from '../main';
import { t } from '../i18n';

export interface LocalImage {
    file: TFile | null; // TFile if found in vault
    path: string; // Original path in markdown link
    name: string;
    status: 'pending' | 'uploading' | 'success' | 'error';
    errorMsg?: string;
    blob?: Blob; // For preview and upload
    checked: boolean;
}

export class BatchUploadManager {
    plugin: PicFlowPlugin;
    app: App;
    
    // State
    images: LocalImage[] = [];
    isUploading: boolean = false;
    cancelFlag: boolean = false;
    currentView: MarkdownView | null = null;
    
    // UI Callbacks (to update Modal if open)
    onUpdate: (() => void) | null = null;
    onCloseRequest: (() => void) | null = null;

    // Status Bar
    statusBarItem: HTMLElement | null = null;

    constructor(plugin: PicFlowPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    // Expose uploadFiles for external use (PublishManager)
    async uploadFiles(files: TFile[]): Promise<{ url: string, success: boolean }[]> {
        const results: { url: string, success: boolean }[] = [];
        
        for (const file of files) {
            try {
                // Read file
                const arrayBuffer = await this.app.vault.readBinary(file);
                const blob = new Blob([arrayBuffer]);
                // @ts-ignore
                const fileObj = new File([blob], file.name, { type: 'image/' + file.extension });
                
                // Upload
                // @ts-ignore
                const url = await this.plugin.uploadFileOnly(fileObj);
                
                if (url) {
                    results.push({ url, success: true });
                } else {
                    results.push({ url: '', success: false });
                }
            } catch (e) {
                console.error("BatchUploadManager: Failed to upload file", file.path, e);
                results.push({ url: '', success: false });
            }
        }
        return results;
    }

    // 1. Scan (Re-used logic, but stored in Manager)
    async scanImages(view: MarkdownView) {
        this.currentView = view;
        const content = view.editor.getValue();
        const wikiLinkRegex = /!\[\[(.*?)\]\]/g;
        const mdLinkRegex = /!\[(.*?)\]\((.*?)\)/g;

        const found: LocalImage[] = [];
        const seenPaths = new Set<string>();

        // Helper to process path
        const processPath = async (linkPath: string) => {
            const cleanPath = linkPath.split('|')[0];
            if (seenPaths.has(cleanPath)) return;
            
            // Handle http/https (Online Images)
            if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
                // If it's already an uploaded URL (e.g. from our uploader), we might want to skip it?
                // For now, let's treat all http links as potential candidates if they look like images.
                if (this.isImageUrl(cleanPath)) {
                    seenPaths.add(cleanPath);
                    found.push({
                        file: null, // No local file
                        path: linkPath,
                        name: cleanPath.split('/').pop()?.split('?')[0] || 'remote-image',
                        status: 'pending',
                        checked: true,
                        blob: undefined // Will be fetched during upload
                    });
                }
                return;
            }
            
            seenPaths.add(cleanPath);
            
            // Resolve TFile
            const file = this.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(cleanPath), view.file.path);
            
            if (file && this.isImage(file)) {
                found.push({
                    file: file,
                    path: linkPath, // Keep original for replacement
                    name: file.name,
                    status: 'pending',
                    checked: true,
                    blob: await this.readFileToBlob(file)
                });
            }
        };

        let match;
        while ((match = wikiLinkRegex.exec(content)) !== null) {
            await processPath(match[1]);
        }
        while ((match = mdLinkRegex.exec(content)) !== null) {
            await processPath(match[2]);
        }

        this.images = found;
        return this.images;
    }

    isImage(file: TFile) {
        const ext = file.extension?.toLowerCase();
        return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext);
    }

    isImageUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            const path = parsed.pathname.toLowerCase();
            return /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/.test(path);
        } catch (e) {
            return false;
        }
    }

    async readFileToBlob(file: TFile): Promise<Blob | undefined> {
        try {
            const arrayBuffer = await this.app.vault.readBinary(file);
            return new Blob([arrayBuffer]);
        } catch (e) {
            console.error('Failed to read file', file, e);
            return undefined;
        }
    }

    // 2. Start Upload
    async startUpload() {
        if (this.isUploading) return;
        this.isUploading = true;
        this.cancelFlag = false;
        this.updateUI();
        this.updateStatusBar();

        const toUpload = this.images.filter(img => img.checked && img.status !== 'success');
        
        // Concurrency Limit: 3
        const limit = 3;
        let hasError = false;
        const activePromises: Promise<void>[] = [];

        for (const img of toUpload) {
            if (this.cancelFlag) break;

            // Wait if we reached the limit
            if (activePromises.length >= limit) {
                await Promise.race(activePromises);
            }

            if (this.cancelFlag) break;

            const promise = this.uploadOne(img).then((success) => {
                if (!success) hasError = true;
                // Remove self from active list
                const index = activePromises.indexOf(promise);
                if (index > -1) {
                    activePromises.splice(index, 1);
                }
                this.updateUI();
                this.updateStatusBar();
            });

            activePromises.push(promise);
            // Small delay to prevent UI freezing if many items finish instantly
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Wait for remaining
        await Promise.all(activePromises);

        this.isUploading = false;
        this.updateUI();
        this.clearStatusBar();

        if (this.cancelFlag) {
            new Notice('Batch upload canceled.');
        } else if (!hasError) {
            new Notice(t('batch.notice.finish', this.plugin.settings));
            // Auto close modal if requested
            if (this.onCloseRequest) {
                this.onCloseRequest();
            }
        } else {
            new Notice('Batch upload finished with errors.');
        }
    }

    cancelUpload() {
        if (this.isUploading) {
            this.cancelFlag = true;
        }
    }

    async uploadOne(img: LocalImage): Promise<boolean> {
        if (this.cancelFlag) return false;

        // Handle Remote Image
        if (!img.file && !img.blob && (img.path.startsWith('http://') || img.path.startsWith('https://'))) {
             img.status = 'uploading';
             this.updateUI();
             try {
                 // Use plugin's uploadHandler.uploadOnlineImage
                 const cleanPath = img.path.split('|')[0];
                 const url = await this.plugin.uploadHandler.uploadOnlineImage(cleanPath, this.currentView!, true);
                 
                 if (url) {
                     img.status = 'success';
                     if (this.currentView) {
                        this.replaceLink(img.path, url);
                     }
                     return true;
                 } else {
                     throw new Error("Failed to upload remote image");
                 }
             } catch (e) {
                 console.error(e);
                 img.status = 'error';
                 img.errorMsg = e.message;
                 return false;
             }
        }

        if (!img.blob) {
            img.status = 'error';
            img.errorMsg = 'File content missing';
            return false;
        }

        img.status = 'uploading';
        this.updateUI();

        try {
            const file = new File([img.blob], img.name, { type: img.blob.type });
            
            // Use Plugin's core upload method (returns URL)
            const url = await this.plugin.uploadFileOnly(file);
            
            img.status = 'success';
            
            // Replace link in document
            if (this.currentView) {
                this.replaceLink(img.path, url);
            }
            return true;

        } catch (e) {
            console.error(e);
            img.status = 'error';
            img.errorMsg = e.message;
            return false;
        }
    }

    replaceLink(originalPath: string, newUrl: string) {
        if (!this.currentView) return;
        
        const editor = this.currentView.editor;
        const content = editor.getValue();
        
        const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Wiki Link
        const wikiRegex = new RegExp(`!\\[\\[${escapedPath}(\\|.*?)?\\]\\]`, 'g');
        let newContent = content.replace(wikiRegex, `![](${newUrl})`);
        
        // MD Link
        const mdRegex = new RegExp(`!\\[(.*?)\\]\\(${escapedPath}\\)`, 'g');
        newContent = newContent.replace(mdRegex, `![$1](${newUrl})`);
        
        if (newContent !== content) {
            // We should use cursor-preserving replace if possible, but setValue is safer for global replace
            const cursor = editor.getCursor();
            editor.setValue(newContent);
            editor.setCursor(cursor);
        }
    }

    // Status Bar Logic
    updateStatusBar() {
        const total = this.images.filter(i => i.checked).length;
        const done = this.images.filter(i => i.checked && (i.status === 'success' || i.status === 'error')).length;
        
        if (!this.statusBarItem) {
            this.statusBarItem = this.plugin.addStatusBarItem();
            this.statusBarItem.addClass('mod-clickable');
            this.statusBarItem.onclick = () => {
                // Re-open modal
                this.plugin.openBatchUploadModal(this.currentView);
            };
        }

        const text = t('batch.bar.uploading', this.plugin.settings)
            .replace('{current}', done.toString())
            .replace('{total}', total.toString());
        
        this.statusBarItem.setText(text);
    }

    clearStatusBar() {
        if (this.statusBarItem) {
            this.statusBarItem.remove();
            this.statusBarItem = null;
        }
    }

    updateUI() {
        if (this.onUpdate) this.onUpdate();
    }
}
