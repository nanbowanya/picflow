
import { Component, MarkdownRenderer, setIcon, Notice, requestUrl } from "obsidian";
// import { MarkdownView, Editor } from "obsidian";
import PicFlowPlugin from "../../../main";
import { t } from "../../i18n";
import { getActiveMarkdownView } from "../../utils/editor";
import { ChatMessage } from "../models";

export class MessageBubble {
    plugin: PicFlowPlugin;
    container: HTMLElement;
    message: ChatMessage;
    onRetry?: () => void;
    component: Component;

    constructor(plugin: PicFlowPlugin, parentComponent: Component, container: HTMLElement, message: ChatMessage, onRetry?: () => void) {
        this.plugin = plugin;
        this.container = container;
        this.message = message;
        this.onRetry = onRetry;
        this.component = new Component();
        parentComponent.addChild(this.component);
    }

    render() {
        const bubbleWrapper = this.container.createDiv({ cls: `chat-message-wrapper ${this.message.role}` });
        const bubbleEl = bubbleWrapper.createDiv({ cls: `chat-bubble chat-bubble-${this.message.role}` });
        
        if (this.message.isLoading) {
            bubbleEl.addClass("loading");
            const dots = bubbleEl.createDiv({ cls: "chat-loading-dots" });
            dots.createSpan();
            dots.createSpan();
            dots.createSpan();
            return;
        }

        const contentEl = bubbleEl.createDiv({ cls: "chat-content markdown-preview-view" });

        if (this.message.type === 'text') {
            let displayContent = this.message.content;
            let referenceContent = "";

            // Split content if it has references (user messages usually)
            // The delimiter is "\n\n---\n" and then usually "> Reference:" or just "> "
            // We should split by the first "\n\n---\n" and treat the rest as reference content.
            if (this.message.role === 'user' && displayContent.includes("\n\n---\n")) {
                const parts = displayContent.split("\n\n---\n");
                displayContent = parts[0];
                referenceContent = parts.slice(1).join("\n\n---\n");
            }

            // Render main content
            if (displayContent.trim()) {
                // Pre-process displayContent to convert [File:Line] tokens into HTML spans for styling
                // Regex to match: 📎 [FileName:L123]
                // We use a specific class to style it like a chip
                
                // Note: MarkdownRenderer might escape HTML, so we render first, then manipulate DOM?
                // Or we replace with a unique placeholder that Markdown won't mess up, then replace after render?
                // Actually, Obsidian's MarkdownRenderer handles HTML if enabled, but let's try post-processing.
                
                // Let's use a custom markdown post-processor approach or simple string replacement if content is simple.
                // Since it's user input, it might contain markdown.
                
                MarkdownRenderer.render(
                    this.plugin.app,
                    displayContent,
                    contentEl,
                    "",
                    this.component
                ).then(() => {
                    // Post-process to style the reference tokens
                    // We look for text nodes containing the pattern
                    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
                    let node: Node | null;
                    const nodesToReplace: { node: Node, content: string }[] = [];
                    
                    while ((node = walker.nextNode())) {
                        if (node.nodeValue && node.nodeValue.includes("📎 [")) {
                            nodesToReplace.push({ node: node, content: node.nodeValue });
                        }
                    }

                    nodesToReplace.forEach(({ node, content }) => {
                        const fragment = document.createDocumentFragment();
                        // Match token pattern: 📎 [FileName:L10-L20] or 📎 [FileName:L10]
                        const parts = content.split(/(📎 \[[^\]]+\])/g);
                        
                        parts.forEach(part => {
                            const match = part.match(/^📎 \[([^:]+):L(\d+)(?:-L?(\d+))?\]$/);
                            if (match) {
                                const fileName = match[1];
                                const lineStart = match[2];
                                const lineEnd = match[3] || match[2]; // Default to start if no end

                                const span = document.createElement("span");
                                span.className = "chat-message-ref-chip";
                                
                                // Icon
                                const iconSpan = document.createElement("span");
                                iconSpan.className = "chat-chip-icon";
                                setIcon(iconSpan, "text-quote");
                                span.appendChild(iconSpan);

                                // Filename
                                const textSpan = document.createElement("span");
                                textSpan.className = "chat-chip-text";
                                textSpan.textContent = fileName;
                                span.appendChild(textSpan);

                                // Line Numbers
                                const linesSpan = document.createElement("span");
                                linesSpan.className = "chat-chip-lines";
                                linesSpan.textContent = `L${lineStart}-${lineEnd}`;
                                span.appendChild(linesSpan);
                                
                                fragment.appendChild(span);
                            } else if (part.match(/^📎 \[[^\]]+\]$/)) {
                                // Fallback for old tokens or unmatched format
                                const span = document.createElement("span");
                                span.className = "chat-message-ref-chip";
                                span.textContent = part.replace(/^📎 /, "");
                                const iconSpan = document.createElement("span");
                                iconSpan.className = "chat-chip-icon";
                                setIcon(iconSpan, "text-quote");
                                span.prepend(iconSpan);
                                fragment.appendChild(span);
                            } else {
                                fragment.appendChild(document.createTextNode(part));
                            }
                        });
                        
                        node.parentNode?.replaceChild(fragment, node);
                    });
                }).catch(console.error);
            }

            // Render collapsible reference if exists
            if (referenceContent) {
                const details = contentEl.createEl("details", { cls: "chat-reference-details" });
                details.createEl("summary", { text: t('ai.chat.ref.view'), cls: "chat-reference-summary" });
                const refContentEl = details.createDiv({ cls: "chat-reference-content" });
                
                // Markdown rendering handles the content
                MarkdownRenderer.render(
                    this.plugin.app,
                    referenceContent,
                    refContentEl,
                    "",
                    this.component
                ).then(() => {
                    // Post-process to style the "Reference: ..." line if it exists
                    // We look for the paragraph starting with "Reference:"
                    const paragraphs = refContentEl.querySelectorAll("p, blockquote p");
                    paragraphs.forEach(p => {
                        if (p.textContent && p.textContent.trim().startsWith("Reference:")) {
                            p.addClass("chat-reference-title");
                            // Wrap the text in strong or just style the p
                            // Let's make it bold via CSS class
                        }
                    });
                }).catch(console.error);
            }

            this.renderTextActions(bubbleWrapper); 
        } else if (this.message.type === 'image') {
            const imgContainer = contentEl.createDiv({ cls: "chat-image-container" });
            const img = imgContainer.createEl("img", {
                attr: { src: this.message.content }
            });
            img.addClass("chat-image-preview");
            this.renderImageActions(bubbleWrapper);
        }
    }

    private renderTextActions(parent: HTMLElement) {
        if (this.message.role !== 'assistant') return;

        const actionsEl = parent.createDiv({ cls: "chat-actions" });

        // Copy
        const copyBtn = actionsEl.createEl("button", { cls: "chat-action-btn clickable-icon", title: t('ai.chat.btn.copy') });
        setIcon(copyBtn, "copy");
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(this.message.content).catch(console.error);
            new Notice(t('ai.chat.notice.copied'));
        };

        // Insert at Cursor
        const insertBtn = actionsEl.createEl("button", { cls: "chat-action-btn clickable-icon", title: t('ai.chat.btn.insert') });
        setIcon(insertBtn, "corner-down-left");
        insertBtn.onclick = () => {
            this.insertAtCursor(this.message.content);
        };

        // Retry
        if (this.onRetry) {
            const retryBtn = actionsEl.createEl("button", { cls: "chat-action-btn clickable-icon", title: t('ai.chat.btn.retry') });
            setIcon(retryBtn, "rotate-cw");
            retryBtn.onclick = () => this.onRetry();
        }
    }

    private renderImageActions(parent: HTMLElement) {
        if (this.message.role !== 'assistant') return;

        const actionsEl = parent.createDiv({ cls: "chat-actions" });

        // Copy
        const copyBtn = actionsEl.createEl("button", { cls: "chat-action-btn clickable-icon", title: t('ai.chat.btn.copyImage') });
        setIcon(copyBtn, "copy");
        copyBtn.onclick = async () => {
            try {
                const response = await requestUrl({ url: this.message.content });
                const blob = new Blob([response.arrayBuffer], { type: response.headers['content-type'] });
                await navigator.clipboard.write([
                    new ClipboardItem({
                        [blob.type]: blob
                    })
                ]);
                new Notice(t('ai.chat.notice.imageCopied'));
            } catch (e) {
                console.error("Failed to copy image:", e);
                new Notice(t('ai.chat.notice.imageCopyFailed'));
            }
        };

        // Insert at Cursor
        const insertBtn = actionsEl.createEl("button", { cls: "chat-action-btn clickable-icon", title: t('ai.chat.btn.insertImage') });
        setIcon(insertBtn, "image-plus");
        insertBtn.onclick = async () => {
            await this.insertImageAtCursor();
        };

        // Retry
        if (this.onRetry) {
            const retryBtn = actionsEl.createEl("button", { cls: "chat-action-btn clickable-icon", title: t('ai.chat.btn.retry') });
            setIcon(retryBtn, "rotate-cw");
            retryBtn.onclick = () => this.onRetry();
        }
    }

    private insertAtCursor(text: string) {
        const view = getActiveMarkdownView(this.plugin.app);
        if (!view) {
            new Notice(t('ai.chat.notice.noActiveEditor'));
            return;
        }
        this.plugin.aiManager.insertTextAtCursor(view, text);
    }

    private async insertImageAtCursor() {
        const view = getActiveMarkdownView(this.plugin.app);
        if (!view) {
            new Notice(t('ai.chat.notice.noActiveView'));
            return;
        }
        await this.plugin.aiManager.insertImageAtCursor(view, this.message);
    }
}
