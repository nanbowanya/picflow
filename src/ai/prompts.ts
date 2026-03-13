
export interface AIPromptTemplate {
    id: string;
    name: string;
    description: string;
    template: string; // Supports {{selection}} variable
    model?: string; // Optional preferred model
}

export const DEFAULT_PROMPTS: AIPromptTemplate[] = [
    {
        id: 'polish',
        name: '润色 (Polish)',
        description: '优化选中文本的语言表达，使其更通顺专业。',
        template: '请润色以下内容，使其表达更清晰、专业，并纠正可能的语法错误：\n\n{{selection}}'
    },
    {
        id: 'summarize',
        name: '总结 (Summarize)',
        description: '为选中文本生成简短的摘要。',
        template: '请阅读以下内容，并生成一份简要的摘要（3-5个要点）：\n\n{{selection}}'
    },
    {
        id: 'translate_en',
        name: '翻译成英文 (Translate to English)',
        description: '将选中文本翻译成地道的英文。',
        template: '请将以下内容翻译成地道的英文：\n\n{{selection}}'
    },
    {
        id: 'translate_zh',
        name: '翻译成中文 (Translate to Chinese)',
        description: '将选中文本翻译成流畅的中文。',
        template: '请将以下内容翻译成流畅的中文：\n\n{{selection}}'
    },
    {
        id: 'explain',
        name: '解释 (Explain)',
        description: '解释选中文本中的概念或代码。',
        template: '请解释以下内容（如果是代码请解释逻辑，如果是概念请举例说明）：\n\n{{selection}}'
    },
    {
        id: 'expand',
        name: '扩写 (Expand)',
        description: '基于选中文本进行扩展写作。',
        template: '请基于以下内容进行扩写，补充更多细节和背景信息：\n\n{{selection}}'
    }
];
