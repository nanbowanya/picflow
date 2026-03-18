
import { DropdownComponent, ButtonComponent, setIcon, Notice, MarkdownView, Menu } from "obsidian";
import { t } from "../../i18n";
import { AI_MODELS, AIModel, DEFAULT_CHAT_MODEL, QuoteMetadata } from "../models";
import { DEFAULT_PROMPTS } from "../prompts";
import { getActiveMarkdownView } from "../../utils/editor";
import PicFlowPlugin from "../../../main";

export class InputArea {
    plugin: PicFlowPlugin;
    container: HTMLElement;
    
    // State
    selectedModelId: string;
    promptText: string = "";
    quotes: QuoteMetadata[] = [];
    isLoading: boolean = false;
    
    // Callbacks
    onSend: (prompt: string, model: AIModel, quotes: QuoteMetadata[]) => void;
    onModelChange: (model: AIModel) => void;
    onStop: () => void;

    // UI Elements
    modelDropdown: DropdownComponent;
    editorEl: HTMLElement; // Replaces inputEl
    sendBtn: ButtonComponent; // Add reference to send button
    
    // Track cursor position
    private lastRange: Range | null = null;

                           // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    private debounceTimer: unknown | null = null;

    constructor(plugin: PicFlowPlugin, container: HTMLElement, onSend: (prompt: string, model: AIModel, quotes: QuoteMetadata[]) => void, onModelChange: (model: AIModel) => void, onStop: () => void) {
        this.plugin = plugin;
        this.container = container;
        this.onSend = onSend;
        this.onModelChange = onModelChange;
        this.onStop = onStop;
        
        // Load last used model or default
        this.selectedModelId = this.plugin.settings.aiDefaultModel || DEFAULT_CHAT_MODEL;
    }

    setLoading(loading: boolean) {
        this.isLoading = loading;
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (this.sendBtn) {
            if (loading) {
                this.sendBtn.setIcon("square"); // Stop icon
                this.sendBtn.setTooltip("Stop generation");
                this.sendBtn.buttonEl.addClass("is-loading");
            } else {
                this.sendBtn.setIcon("send"); // Send icon
                this.sendBtn.setTooltip("Send");
                this.sendBtn.buttonEl.removeClass("is-loading");
            }
        }
    }

    render() {
        const wrapper = this.container.createDiv({ cls: "chat-input-area" });

        // 1. Toolbar (Model Select + Quote Btn)
        const toolbar = wrapper.createDiv({ cls: "chat-input-toolbar" });
        
        // Model Dropdown
        this.modelDropdown = new DropdownComponent(toolbar);
        this.modelDropdown.selectEl.addClass("chat-model-select");
        AI_MODELS.forEach(model => {
            this.modelDropdown.addOption(model.id, model.name);
        });
        
        // Validate selected model
        if (!AI_MODELS.find(m => m.id === this.selectedModelId)) {
            this.selectedModelId = DEFAULT_CHAT_MODEL;
        }
        
        this.modelDropdown.setValue(this.selectedModelId);
        this.modelDropdown.onChange(async (value) => {
            this.selectedModelId = value;
            this.plugin.settings.aiDefaultModel = value;
            await this.plugin.saveSettings();
            
            const model = AI_MODELS.find(m => m.id === value);
            if (model) {
                this.updatePlaceholder(model);
                this.onModelChange(model);
            }
        });

        // Quote Button
        const quoteBtn = new ButtonComponent(toolbar)
            .setIcon("quote")
            .setTooltip(t('ai.chat.tooltip.quote'))
            .onClick(() => this.handleQuoteSelection());
        quoteBtn.buttonEl.addClass("chat-toolbar-btn");

        // 2. Input Text Area (ContentEditable)
        const inputWrapper = wrapper.createDiv({ cls: "chat-input-wrapper" });
        
        this.editorEl = inputWrapper.createDiv({ cls: "chat-input-editor" });
        this.editorEl.contentEditable = "true";
        this.editorEl.setAttribute("placeholder", t('ai.chat.placeholder.text'));
        
        // Track cursor on blur/mouseup/keyup/input
        const saveSelection = () => {
            // Debounce selection saving to avoid excessive processing
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    // Ensure the selection is within our editor
                    let node = sel.anchorNode;
                    // If anchorNode is text, get its parent
                    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
                    
                    if (node && this.editorEl.contains(node)) {
                        this.lastRange = sel.getRangeAt(0).cloneRange();
                    }
                }
            }, 50); // 50ms debounce
        };
        
        // Use 'input' event as well for typing
        this.editorEl.addEventListener("input", saveSelection);
        this.editorEl.addEventListener("keyup", saveSelection);
        this.editorEl.addEventListener("mouseup", saveSelection);
        this.editorEl.addEventListener("blur", saveSelection);
        
        const initialModel = AI_MODELS.find(m => m.id === this.selectedModelId);
        if (initialModel) this.updatePlaceholder(initialModel);

        // Handle Enter key
        this.editorEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        // 3. Footer (Template Btn + Send Btn)
        const footer = inputWrapper.createDiv({ cls: "chat-input-footer" });
        
        // Template Button (Left)
        const templateBtn = footer.createEl("button", { cls: "chat-template-btn clickable-icon" });
        templateBtn.setText(t('ai.chat.btn.templates'));
        setIcon(templateBtn, "zap"); // Add icon inside
        // Re-arrange icon and text
        const iconEl = templateBtn.querySelector("svg");
        if (iconEl) { 
            templateBtn.prepend(iconEl);
            iconEl.addClass("chat-template-icon");
        }
        templateBtn.onclick = (evt) => this.showTemplatesMenu(evt);


        // Send Button (Right)
        this.sendBtn = new ButtonComponent(footer)
            .setIcon("send")
            .setClass("chat-send-btn")
            .onClick(() => {
                if (this.isLoading) {
                    this.onStop();
                } else {
                    this.handleSend();
                }
            });
    }

    private updatePlaceholder(model: AIModel) {
        if (model.type === 'image') {
            this.editorEl.setAttribute("placeholder", t('ai.chat.placeholder.image'));
        } else {
            this.editorEl.setAttribute("placeholder", t('ai.chat.placeholder.text'));
        }
    }

    private getQuoteFromSelection(view: MarkdownView): QuoteMetadata | null {
        return this.plugin.aiManager.getQuoteFromSelection(view);
    }

    private handleQuoteSelection() {
        const view = getActiveMarkdownView(this.plugin.app);

        if (!view) {
            new Notice(t('ai.chat.notice.noFile'));
            return;
        }
        
        const newQuote = this.getQuoteFromSelection(view);
        if (!newQuote) {
            return;
        }

        // Avoid duplicates (simple check)
        const isDuplicate = this.quotes.some(q => 
            q.fileName === newQuote.fileName && 
            q.lineStart === newQuote.lineStart && 
            q.lineEnd === newQuote.lineEnd &&
            q.text === newQuote.text
        );

        if (!isDuplicate) {
            this.quotes.push(newQuote);
            this.insertChip(newQuote);
        } else {
            new Notice(t('ai.chat.notice.duplicate'));
        }
    }

    private createChipElement(quote: QuoteMetadata): HTMLElement {
        // 1. Create Chip Element
        const chip = document.createElement("span");
        chip.className = "chat-input-chip";
        chip.contentEditable = "false"; // Treat as single unit
        chip.setAttribute("data-quote-id", quote.id);
        
        // Icon
        const iconSpan = document.createElement("span");
        iconSpan.className = "chat-chip-icon";
        setIcon(iconSpan, "text-quote");
        chip.appendChild(iconSpan);

        // Filename (Truncated)
        const textSpan = document.createElement("span");
        textSpan.className = "chat-chip-text";
        textSpan.textContent = quote.fileName;
        chip.appendChild(textSpan);

        // Line Numbers (Right aligned)
        const linesSpan = document.createElement("span");
        linesSpan.className = "chat-chip-lines";
        linesSpan.textContent = `L${quote.lineStart}-${quote.lineEnd}`;
        chip.appendChild(linesSpan);

        // Close Button
        const closeSpan = document.createElement("span");
        closeSpan.className = "chat-chip-close";
        setIcon(closeSpan, "x");
        // Prevent focus loss when clicking close
        closeSpan.onmousedown = (e) => e.preventDefault(); 
        closeSpan.onclick = (e) => {
            e.stopPropagation(); 
            // We need to restore focus properly? 
            // Or just remove element.
            chip.remove();
        };
        chip.appendChild(closeSpan);
        return chip;
    }

    private insertNodesAtCursor(nodes: Node[]) {
        this.editorEl.focus();
        const sel = window.getSelection();
        
        // Check if lastRange is valid and still inside editorEl
        const isRangeValid = this.lastRange && 
            this.editorEl.contains(this.lastRange.commonAncestorContainer);

        if (isRangeValid && this.lastRange) {
            // Restore selection
            sel?.removeAllRanges();
            sel?.addRange(this.lastRange);
            
            const range = this.lastRange;
            range.deleteContents();
            
            // Insert nodes in order
            for (const node of nodes) {
                range.insertNode(node);
                range.setStartAfter(node);
                range.setEndAfter(node);
            }
            range.collapse(true);
            
            sel?.removeAllRanges();
            sel?.addRange(range);
            
            // Update lastRange
            this.lastRange = range.cloneRange();
        } else {
             // Append to end if no cursor tracked or invalid
             for (const node of nodes) {
                 this.editorEl.appendChild(node);
             }
             
             // Move cursor to end
             if (sel) {
                 const range = document.createRange();
                 range.selectNodeContents(this.editorEl);
                 range.collapse(false);
                 sel.removeAllRanges();
                 sel.addRange(range);
                 this.lastRange = range.cloneRange();
             }
        }
        
        // Scroll to cursor
        if (nodes.length > 0 && nodes[nodes.length - 1] instanceof HTMLElement) {
             (nodes[nodes.length - 1] as HTMLElement).scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }

    private insertChip(quote: QuoteMetadata) {
        const chip = this.createChipElement(quote);
        const space = document.createTextNode("\u00A0");
        this.insertNodesAtCursor([chip, space]);
    }

    private getPromptText(): { text: string, activeQuoteIds: string[] } {
        let text = "";
        const activeQuoteIds: string[] = [];
        
        // Traverse child nodes to build text
        this.editorEl.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.classList.contains("chat-input-chip")) {
                    const id = el.getAttribute("data-quote-id");
                    if (id) {
                        activeQuoteIds.push(id);
                        // Find the quote to get its token
                        const quote = this.quotes.find(q => q.id === id);
                        if (quote) {
                            text += quote.token;
                        }
                    }
                } else if (el.tagName === "BR" || el.tagName === "DIV") {
                    text += "\n";
                    if (el.tagName === "DIV") {
                         // Recursively handle div content if needed? 
                         // Contenteditable usually wraps lines in divs. 
                         // For simplicity, just append newline and content.
                         text += el.textContent; 
                    }
                }
            }
        });
        
        return { text, activeQuoteIds };
    }

    private showTemplatesMenu(evt: MouseEvent) {
        const menu = new Menu();
        
        // Default Templates
        DEFAULT_PROMPTS.forEach(template => {
            menu.addItem(item => {
                item.setTitle(template.name)
                    .setIcon("file-text")
                    .onClick(() => {
                        this.applyTemplate(template.template);
                    });
            });
        });

        menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
    }

    private applyTemplate(templateContent: string) {
        const view = getActiveMarkdownView(this.plugin.app);
        
        const nodesToInsert: Node[] = [];
        
        if (templateContent.includes("{{selection}}")) {
             // Try to get quote from selection
             let quote: QuoteMetadata | null = null;
             if (view) {
                 quote = this.getQuoteFromSelection(view);
             }

             if (quote) {
                 // Check if this selection is already quoted (to avoid duplication)
                 // We look for an existing quote with same text/file/lines
                 const existingQuote = this.quotes.find(q => 
                    q.fileName === quote.fileName && 
                    q.lineStart === quote.lineStart && 
                    q.lineEnd === quote.lineEnd &&
                    q.text === quote.text
                 );

                 if (existingQuote) {
                     // If it's already in the quotes list, we check if it's in the DOM
                     const existingChip = this.editorEl.querySelector(`.chat-input-chip[data-quote-id="${existingQuote.id}"]`);
                     if (existingChip) {
                         // Remove the existing chip from DOM because we will insert a new one in the template structure
                         existingChip.remove();
                         // Also remove any following space if it looks like we added it
                         // But that's hard to track. 
                     }
                     // Use the existing quote ID to reuse it
                     quote = existingQuote;
                 } else {
                     // Add new quote
                     this.quotes.push(quote);
                 }

                 // Split template
                 const parts = templateContent.split("{{selection}}");
                 
                 // Construct nodes
                 if (parts[0]) nodesToInsert.push(document.createTextNode(parts[0]));
                 
                 // Insert Chip
                 nodesToInsert.push(this.createChipElement(quote));
                 // Optional: Space after chip if not present in template? 
                 // Usually templates might be "Explain this code:\n\n{{selection}}"
                 // So we don't need extra space if the template handles it. 
                 
                 if (parts[1]) nodesToInsert.push(document.createTextNode(parts[1]));

             } else {
                 new Notice("Tip: Select text in editor to auto-fill {{selection}}");
                 // Fallback: Just insert text without replacement or remove {{selection}}?
                 // Let's keep it as is or replace with empty string
                 const text = templateContent.replace("{{selection}}", "");
                 nodesToInsert.push(document.createTextNode(text));
             }
        } else {
            nodesToInsert.push(document.createTextNode(templateContent));
        }

        this.insertNodesAtCursor(nodesToInsert);
    }

    private handleSend() {
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

        const { text, activeQuoteIds } = this.getPromptText();
        
        if (!text.trim() && activeQuoteIds.length === 0) return;
        
        const model = AI_MODELS.find(m => m.id === this.selectedModelId);
        if (!model) return;

        // Filter quotes: only include quotes present in the editor
        const activeQuotes = this.quotes.filter(q => activeQuoteIds.includes(q.id));

        this.onSend(text, model, activeQuotes);
        
        // Clear input
        this.editorEl.innerHTML = "";
        this.quotes = [];
    }
}
