
export interface AIModel {
    id: string;
    name: string;
    type: 'chat' | 'image';
}

export interface ImageGenerationOptions {
    prompt: string;
    model?: AIModel | string;
    size?: string;
    n?: number;
    // [key: string]: any; // Removed to avoid 'any'
}

export const AI_MODELS: AIModel[] = [
    // Text Models
    { id: 'moonshotai/Kimi-K2-Instruct-0905', name: 'Kimi-K2', type: 'chat' },
    { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', type: 'chat' },
    
    // Image Models
    { id: 'doubao-seedream-4-0-250828', name: 'Doubao Dream (绘图)', type: 'image' }
];

export const DEFAULT_CHAT_MODEL = 'moonshotai/Kimi-K2-Instruct-0905';
export const DEFAULT_IMAGE_MODEL = 'doubao-seedream-4-0-250828';

export interface QuoteMetadata {
    id: string; // Unique ID for reference
    fileName: string;
    lineStart: number;
    lineEnd: number;
    text: string;
    token: string; // The string inserted into the text area
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string; // Markdown text or Image URL/Base64
    type: 'text' | 'image';
    isLoading?: boolean;
}
