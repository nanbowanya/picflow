
import { App, MarkdownRenderer, Component } from "obsidian";
import { IHtmlRenderer } from "../interfaces";

export class StubHtmlRenderer implements IHtmlRenderer {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    async render(markdown: string, _themeName: string = "Default"): Promise<string> {
        // Simple fallback rendering using Obsidian's built-in renderer
        // No custom theme processing or specific WeChat wrappers
        const container = document.createElement("div");
        const tempComponent = new Component();
        tempComponent.load();
        await MarkdownRenderer.render(this.app, markdown, container, "/", tempComponent);
        tempComponent.unload();
        
        // Return basic HTML wrapped in a div
        return `<div class="picflow-lite-preview">${container.innerHTML}</div>`;
    }
}
