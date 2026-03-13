
import { ButtonComponent, Notice, TextAreaComponent, MarkdownView, MarkdownRenderer, Setting, requestUrl } from "obsidian";
import PicFlowPlugin from "../../../main";
import { t } from "../../i18n";
import { AIModel, AI_MODELS } from "../../ai/models";
import { MessageBubble, ChatMessage } from "../../ai/chat/message-bubble";
import { InputArea, QuoteMetadata } from "../../ai/chat/input-area";
import { IAIService } from "../../interfaces";
import { StubAIService } from "../../ai/stub-service";

export class AIDrawer {
    plugin: PicFlowPlugin;
    container: HTMLElement;
    aiService: IAIService;

    // Chat State
    messages: ChatMessage[] = [];
    isLoading: boolean = false;
    abortController: AbortController | null = null;
    
    // Components
    inputArea: InputArea;
    messagesContainer: HTMLElement;

    constructor(plugin: PicFlowPlugin, container: HTMLElement) {
        this.plugin = plugin;
        this.container = container;
        
        // Dynamic load AI Service
        // @ts-ignore
        if (process.env.BUILD_TYPE === 'PRO') {
            try {
                const { AIService } = require('../../core/ai/service');
                // Wrap static methods to match interface
                this.aiService = {
                    generateImage: AIService.generateImage,
                    chatCompletionStream: AIService.chatCompletionStream
                };
            } catch (e) {
                console.error("Failed to load AIService:", e);
                this.aiService = new StubAIService();
            }
        } else {
            this.aiService = new StubAIService();
        }
        
        // Initial welcome message
        this.messages.push({
            id: 'welcome',
            role: 'assistant',
            content: t('ai.chat.welcome'),
            type: 'text'
        });
    }

    // Public method to send a message externally (e.g. from Quick Action)
    public async sendMessage(prompt: string, modelId?: string) {
        // Ensure input area is initialized or at least we have the model
        const model = AI_MODELS.find(m => m.id === modelId) || AI_MODELS.find(m => m.id === this.plugin.settings.aiDefaultModel) || AI_MODELS[0];
        await this.handleSend(prompt, model, []);
    }

    render() {
        this.container.empty();
        this.container.addClass("ai-drawer");
        this.container.addClass("picflow-chat-view");

        // 1. Messages Container
        this.messagesContainer = this.container.createDiv({ cls: "chat-messages-container" });
        this.renderMessages();

        // 2. Input Area
        const inputContainer = this.container.createDiv({ cls: "chat-input-container" });
        this.inputArea = new InputArea(
            this.plugin, 
            inputContainer, 
            (prompt, model, quotes) => this.handleSend(prompt, model, quotes),
            (model) => this.handleModelChange(model),
            () => this.handleStop() // Pass stop callback
        );
        this.inputArea.render();
    }

    private handleStop() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
            this.isLoading = false;
            
            // Update UI state immediately
            const lastMsg = this.messages[this.messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isLoading) {
                lastMsg.isLoading = false;
                lastMsg.content += `\n\n${t('ai.chat.aborted')}`;
                this.refreshMessage(lastMsg);
            }
            this.inputArea.setLoading(false);
        }
    }

    private renderMessages() {
        this.messagesContainer.empty();
        this.messages.forEach(msg => {
            new MessageBubble(
                this.plugin, 
                this.messagesContainer, 
                msg,
                () => this.handleRetry(msg)
            ).render();
        });
        this.scrollToBottom();
    }

    private async handleRetry(msg: ChatMessage) {
        if (msg.role !== 'assistant') return;

        const index = this.messages.findIndex(m => m.id === msg.id);
        if (index === -1) return;

        const prevMsg = this.messages[index - 1];
        if (!prevMsg || prevMsg.role !== 'user') {
            new Notice(t('ai.chat.error.noPrecedingUserMsg'));
            return;
        }

        this.messages.splice(index, 1);
        this.renderMessages();

        let promptToRetry = prevMsg.content;
        if (promptToRetry.includes("\n\n---\n> Reference:")) {
             promptToRetry = promptToRetry.split("\n\n---\n")[0];
        }

        const currentModelId = this.inputArea.selectedModelId;
        const model = AI_MODELS.find(m => m.id === currentModelId) || { id: currentModelId, name: currentModelId, type: 'chat', provider: 'other' } as AIModel;
        
        await this.processResponse(promptToRetry, model);
    }

    private async processResponse(prompt: string, model: AIModel) {
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const assistantMsgId = (Date.now() + 1).toString();
        const assistantMsg: ChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: "",
            type: model.type === 'image' ? 'image' : 'text',
            isLoading: true
        };
        this.messages.push(assistantMsg);
        
        new MessageBubble(
            this.plugin, 
            this.messagesContainer, 
            assistantMsg,
            () => this.handleRetry(assistantMsg)
        ).render();
        this.scrollToBottom();

        // Update Input Area State
        this.inputArea.setLoading(true);

        try {
            if (model.type === 'image') {
                const url = await this.aiService.generateImage(this.plugin.settings, model, prompt);
                
                if (signal.aborted) return; // Check if aborted during image generation

                const targetMsg = this.messages.find(m => m.id === assistantMsgId);
                if (targetMsg) {
                    targetMsg.isLoading = false;
                    if (url) {
                         try {
                            const resp = await requestUrl({ url });
                            const blob = new Blob([resp.arrayBuffer], { type: "image/png" });
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                targetMsg.content = reader.result as string;
                                this.refreshMessage(targetMsg);
                            };
                            reader.readAsDataURL(blob);
                         } catch (e) {
                             console.error("Failed to download image", e);
                             targetMsg.content = url; 
                             this.refreshMessage(targetMsg);
                         }
                    } else {
                        targetMsg.type = 'text';
                        targetMsg.content = t('ai.chat.error.generateImageFailed');
                        this.refreshMessage(targetMsg);
                    }
                }
            } else {
                const history = this.messages
                    .filter(m => !m.isLoading && m.id !== assistantMsgId && m.type === 'text')
                    .map(m => ({
                        role: m.role,
                        content: m.content
                    }));
                
                let fullText = "";
                // Pass signal to service
                await this.aiService.chatCompletionStream(this.plugin.settings, model, history, (chunk: string) => {
                    if (signal.aborted) return;
                    fullText += chunk;
                    const targetMsg = this.messages.find(m => m.id === assistantMsgId);
                    if (targetMsg) {
                        if (targetMsg.isLoading) targetMsg.isLoading = false;
                        targetMsg.content = fullText;
                        this.refreshMessage(targetMsg);
                    }
                }, signal);
                
                if (signal.aborted) return;

                const targetMsg = this.messages.find(m => m.id === assistantMsgId);
                if (targetMsg) {
                    targetMsg.isLoading = false;
                    this.refreshMessage(targetMsg);
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') return; // Handled in handleStop
            console.error(error);
            const targetMsg = this.messages.find(m => m.id === assistantMsgId);
            if (targetMsg) {
                targetMsg.isLoading = false;
                targetMsg.type = 'text';
                targetMsg.content = "Error: " + error.message;
                this.refreshMessage(targetMsg);
            }
        } finally {
            this.isLoading = false;
            this.abortController = null;
            this.inputArea.setLoading(false);
        }
    }

    private refreshMessage(msg: ChatMessage) {
        this.renderMessages();
    }

    private scrollToBottom() {
        setTimeout(() => {
             this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }, 0);
    }

    private handleModelChange(model: AIModel) {
        // Optional: Show toast or update state if needed
    }

    private async handleSend(prompt: string, model: AIModel, quotes: QuoteMetadata[]) {
        if (this.isLoading) return;
        this.isLoading = true;

        let displayContent = prompt;
        let aiPrompt = prompt;

        // Clean up the prompt sent to AI to remove line numbers from the token
        // Token format: 📎 [File.md:L10-L20] -> 📎 [File.md]
        // This regex finds the pattern and replaces it
        aiPrompt = aiPrompt.replace(/📎 \[([^:]+):L\d+(?:-L?\d+)?\]/g, "📎 [$1]");

        let referenceContent = "";
        if (quotes && quotes.length > 0) {
            referenceContent = quotes.map(q => {
                // We provide the content to the AI in a reference block
                return `> Reference: ${q.fileName}\n\n${q.text}`;
            }).join("\n\n---\n");
            
            // Append references at the bottom for AI context
            aiPrompt = `${aiPrompt}\n\n---\n${referenceContent}`;
            
            // For display, we also append it so the MessageBubble can render it (and hide it nicely)
            displayContent = `${prompt}\n\n---\n${referenceContent}`;
        }

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: displayContent,
            type: 'text'
        };
        this.messages.push(userMsg);
        
        new MessageBubble(
            this.plugin, 
            this.messagesContainer, 
            userMsg,
            () => {} // No retry on own message
        ).render();
        this.scrollToBottom();
        
        await this.processResponse(aiPrompt, model);
    }
}
