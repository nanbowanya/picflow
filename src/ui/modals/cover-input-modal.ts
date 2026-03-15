import { App, Modal, Setting, Notice } from "obsidian";

export class CoverInputModal extends Modal {
    result: string;
    onSubmit: (result: string) => void;

    constructor(app: App, current: string, onSubmit: (result: string) => void) {
        super(app);
        this.result = current;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl("h2", { text: "Set Cover Image" });
        
        // 1. Text Input Area
        new Setting(contentEl)
            .setName("Image URL")
            .setDesc("Enter URL or local path")
            .addText(text => text
                .setPlaceholder("https://... or Attachments/cover.png")
                .setValue(this.result)
                .onChange(value => this.result = value));
        
        // 2. Drag & Drop Area
        const dropZone = contentEl.createDiv({ cls: 'picflow-drop-zone' });
        
        const icon = dropZone.createDiv({ text: '📂', cls: 'picflow-drop-icon' });
        
        dropZone.createDiv({ text: 'Click or Drag image here to upload' });
        
        // Hidden file input
        const fileInput = contentEl.createEl('input', { type: 'file' });
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        
        fileInput.onchange = async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                await this.handleFiles(files);
            }
            // Reset input so same file can be selected again if needed
            (e.target as HTMLInputElement).value = '';
        };
        
        dropZone.onclick = () => fileInput.click();
        
        dropZone.ondragover = (e) => {
            e.preventDefault();
            dropZone.addClass('picflow-drop-zone-active');
        };
        
        dropZone.ondragleave = (e) => {
            e.preventDefault();
            dropZone.removeClass('picflow-drop-zone-active');
        };
        
        dropZone.ondrop = async (e) => {
            e.preventDefault();
            dropZone.removeClass('picflow-drop-zone-active');
            
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                await this.handleFiles(e.dataTransfer.files);
            }
        };

        // Footer Actions
        const footer = contentEl.createDiv({ cls: 'picflow-modal-footer' });
        
        const saveBtn = footer.createEl('button', { text: 'Save' });
        saveBtn.classList.add('mod-cta');
        saveBtn.onclick = () => {
            this.close();
            this.onSubmit(this.result);
        };
        
        const cancelBtn = footer.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => this.close();
    }
    
    async handleFiles(files: FileList) {
        const file = files[0];
        if (!file.type.startsWith('image/')) {
            new Notice('Please upload an image file.');
            return;
        }

        // Use absolute path directly (No saving to vault)
        let path = (file as any).path;
        
        if (path) {
            new Notice('Local image selected.');
            this.result = path;
            
            // Refresh UI input
            const input = this.contentEl.querySelector('input[type="text"]') as HTMLInputElement;
            if (input) input.value = path;
            
            // Auto-submit if needed, or just let user click Save.
            // User requested: "When I click OK it didn't fill back immediately".
            // The issue is likely that 'this.result' was updated but the parent callback wasn't called until 'Save' is clicked.
            // If the user wants "immediate" update upon file selection, we could auto-submit.
            // But standard modal behavior is "Select -> Preview -> Save".
            // The user says "When I click Save... I have to click Save AGAIN".
            // This implies the first click didn't work or state wasn't synced.
            
            // Wait, the user said: "当我点确定的时候并没有立刻回填到picflow-cover-box，我要再次点save，即使不填url或选文件都会回填到picflow-cover-box里"
            // Translation: "When I click OK (Save button in modal), it didn't fill back to the box immediately. I have to click save again..."
            // This sounds like the `onSubmit` callback in the parent `PublishDrawer` isn't triggering a re-render or the `file` variable scope issue.
            
            // Let's look at PublishDrawer's usage of this modal.
            // coverBox.onclick = () => {
            //    new CoverInputModal(..., async (url) => {
            //        if (file) { ... updateMetadata ... this.render() }
            //    }).open();
            // }
            
            // If `file` in PublishDrawer closure is stale or undefined, updateMetadata won't run.
            // But `file` is defined in `renderFloatingFooter`.
            // Ah, `renderFloatingFooter` is async. If `file` is re-fetched inside, it should be fine.
            // BUT, `file` variable in `PublishDrawer` is defined at the top of `renderFloatingFooter`:
            // `const file = this.plugin.app.workspace.getActiveFile();`
            // If the user clicks the cover box, this closure variable `file` is used.
            // It SHOULD be correct.
            
            // However, the modal code here looks correct: `this.onSubmit(this.result)` is called on Save click.
            
            // Maybe the issue is `this.result` isn't updated correctly when using the text input manually?
            // In `addText`, we have `.onChange(value => this.result = value)`. This is correct.
            
            // Let's look at the fallback (Base64) path.
        } else {
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                this.result = dataUrl;
                
                const input = this.contentEl.querySelector('input[type="text"]') as HTMLInputElement;
                if (input) {
                    input.value = "Image loaded from clipboard/drag (Base64)";
                    input.setAttribute('data-base64', dataUrl);
                }
                
                new Notice('Image loaded for preview.');
            };
            reader.readAsDataURL(file);
        }
    }

    async saveToVault(file: File) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const fileName = file.name;
            const timestamp = Date.now();
            const newName = `cover-${timestamp}-${fileName}`;
            
            await this.app.vault.createBinary(newName, arrayBuffer);
            
            new Notice('Image saved to vault (Fallback).');
            this.result = newName;
            
            const input = this.contentEl.querySelector('input[type="text"]') as HTMLInputElement;
            if (input) input.value = newName;
        } catch (e) {
            new Notice('Failed to save image: ' + e.message);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
