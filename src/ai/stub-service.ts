
import { Notice } from "obsidian";
import { IAIService } from "../interfaces";
import { AIModel } from "./models";

export class StubAIService implements IAIService {
    generateImage(settings: any, modelOrOptions: any, prompt?: string): Promise<string | null> {
        new Notice("AI Image Generation is a Pro feature. Please upgrade to unlock.");
        this.openSettings();
        return Promise.resolve(null);
    }

    chatCompletionStream(settings: any, model: AIModel, history: any[], onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<void> {
        new Notice("AI Chat is a Pro feature. Please upgrade to unlock.");
        this.openSettings();
        onChunk("AI features are available in PicFlow Pro. Please upgrade to unlock.");
        return Promise.resolve();
    }

    private openSettings() {
        // We can't easily access app here without passing it in constructor, 
        // but for a stub service usually static methods are tricky.
        // If we change AIService to be instance-based, it's easier.
        // For now, just console log or try to find app global (not recommended but works for quick stub).
        // Or just let the Notice be enough.
    }
}

// Export as singleton to match static usage pattern if needed, 
// OR we change the usage pattern to instance.
// The original AIService had static methods. 
// To keep compatibility with dynamic loading, we can export an instance or class.
// If the original was static class, we can't easily swap it with an instance unless we change call sites.
// Let's assume we will change call sites to use `this.aiService.generateImage`.
