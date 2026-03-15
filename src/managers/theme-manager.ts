import { App, Notice, TFile, FileSystemAdapter, requestUrl } from "obsidian";
import PicFlowPlugin from "../../main";
import * as path from "path";

export interface ThemeConfig {
    name: string;
    css: string;
    isDark: boolean;
    author?: string;
    description?: string;
}

export class ThemeManager {
    plugin: PicFlowPlugin;
    themes: Map<string, ThemeConfig> = new Map();
    
    private readonly REMOTE_BASE_URL = "https://cdn.jsdelivr.net/gh/nanbowanya/picflow@main/assets/themes";
    // GitHub API URL to fetch file list
    private readonly GITHUB_API_URL = "https://api.github.com/repos/nanbowanya/picflow/contents/assets/themes";

    // Fallback CSS (if file load fails)
    private readonly FALLBACK_CSS = `
/* Default Theme Fallback */
.picflow-container {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
    color: #333;
}
    `;

    constructor(plugin: PicFlowPlugin) {
        this.plugin = plugin;
    }

    async loadThemes() {
        this.themes.clear();
        
        const adapter = this.plugin.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) {
            console.warn("PicFlow: Non-filesystem adapter not fully supported for theme loading.");
            this.themes.set("Default", { name: "Default", css: this.FALLBACK_CSS, isDark: false });
            return;
        }

        // Get plugin base path. Usually .obsidian/plugins/PicFlow
        const manifestDir = this.plugin.manifest.dir;
        if (!manifestDir) return;

        // Path to assets/themes relative to vault root
        const themeDir = `${manifestDir}/assets/themes`;

        try {
            if (await adapter.exists(themeDir)) {
                const result = await adapter.list(themeDir);
                
                for (const filePath of result.files) {
                    if (filePath.endsWith(".css")) {
                        const cssContent = await adapter.read(filePath);
                        const fileName = filePath.split("/").pop() || "unknown";
                        
                        // Parse Metadata
                        const name = this.extractMetadata(cssContent, "Name") || fileName.replace(".css", "");
                        const author = this.extractMetadata(cssContent, "Author");
                        const description = this.extractMetadata(cssContent, "Description");
                        
                        // Simple heuristic for dark mode
                        const isDark = cssContent.toLowerCase().includes("background-color: #000") || 
                                     cssContent.toLowerCase().includes("background-color: #111") ||
                                     name.toLowerCase().includes("dark");

                        this.themes.set(name, { 
                            name, 
                            css: cssContent, 
                            isDark,
                            author,
                            description
                        });
                    }
                }
            } else {
                await adapter.mkdir(themeDir);
                // Attempt to fetch default themes immediately if directory was just created
                await this.fetchDefaultThemes(); 
            }
        } catch (e) {
            console.error("[PicFlow] Failed to load themes:", e);
        }

        // Ensure Default exists
        if (!this.themes.has("Default")) {
             this.themes.set("Default", { name: "Default", css: this.FALLBACK_CSS, isDark: false });
        }
    }

    /**
     * Fetch default themes from GitHub/CDN if they don't exist locally
     * Now supports dynamic discovery via GitHub API
     */
    async fetchDefaultThemes(force: boolean = false) {
        const adapter = this.plugin.app.vault.adapter;
        const manifestDir = this.plugin.manifest.dir;
        if (!manifestDir) return;
        const themeDir = `${manifestDir}/assets/themes`;

        if (!(await adapter.exists(themeDir))) {
            await adapter.mkdir(themeDir);
        }

        let themesToDownload: string[] = [];

        try {
            // 1. Try to fetch list from GitHub API
            const response = await requestUrl({ url: this.GITHUB_API_URL });
            
            if (response.status === 200) {
                const data = JSON.parse(response.text);
                if (Array.isArray(data)) {
                    // Filter for .css files only
                    themesToDownload = data
                        .filter((file: any) => file.name.endsWith('.css') && file.type === 'file')
                        .map((file: any) => file.name);
                }
            }
        } catch (e) {
            console.warn("[PicFlow] Failed to fetch theme list from GitHub API, falling back to defaults:", e);
            // Fallback to hardcoded list if API fails (e.g. rate limit)
            themesToDownload = [
                "default.css",
                "hacker.css",
                "lg.css",
                "minority.css",
                "WeChat-AI-Broadcast-Theme.css"
            ];
        }

        if (themesToDownload.length === 0) {
            new Notice("[PicFlow] No themes found to download.");
            return;
        }

        let downloadedCount = 0;

        for (const fileName of themesToDownload) {
            const filePath = `${themeDir}/${fileName}`;
            
            // Skip if exists and not forced
            if (!force && await adapter.exists(filePath)) {
                continue;
            }

            try {
                // Use jsDelivr for faster download than raw GitHub
                const url = `${this.REMOTE_BASE_URL}/${fileName}`;
                
                const response = await requestUrl({ url });
                if (response.status === 200) {
                    await adapter.write(filePath, response.text);
                    downloadedCount++;
                } else {
                    // console.warn(`[PicFlow] Failed to download ${fileName}: ${response.status}`);
                }
            } catch (e) {
                console.error(`[PicFlow] Error downloading ${fileName}:`, e);
            }
        }

        if (downloadedCount > 0) {
            new Notice(`[PicFlow] Downloaded ${downloadedCount} new themes.`);
            // Reload to apply
            await this.loadThemes();
        } else if (force) {
            new Notice("[PicFlow] Themes are up to date.");
        }
    }

    private extractMetadata(css: string, key: string): string | undefined {
        // Look for /* ... Name: Value ... */
        const regex = new RegExp(`${key}:\\s*(.+?)(?:\\n|\\r|$)`, 'i');
        const match = css.match(regex);
        return match ? match[1].trim() : undefined;
    }

    getTheme(name: string): ThemeConfig | undefined {
        return this.themes.get(name) || this.themes.get("Default");
    }

    async saveTheme(name: string, css: string) {
        const adapter = this.plugin.app.vault.adapter;
        const manifestDir = this.plugin.manifest.dir;
        if (!manifestDir) return;
        const themeDir = `${manifestDir}/assets/themes`;
        const filePath = `${themeDir}/${name}.css`;

        if (!(await adapter.exists(themeDir))) {
            await adapter.mkdir(themeDir);
        }

        await adapter.write(filePath, css);
        await this.loadThemes(); // Reload to update cache
    }

    async deleteTheme(name: string) {
        const adapter = this.plugin.app.vault.adapter;
        const manifestDir = this.plugin.manifest.dir;
        if (!manifestDir) return;
        const themeDir = `${manifestDir}/assets/themes`;
        const filePath = `${themeDir}/${name}.css`;

        if (await adapter.exists(filePath)) {
            await adapter.remove(filePath);
            this.themes.delete(name);
            await this.loadThemes();
        }
    }

    // [NEW] Added render method
    async render(markdown: string, themeName: string = 'Default'): Promise<string> {
        // 1. Render Markdown to HTML
        // Use Obsidian's MarkdownRenderer
        // But MarkdownRenderer requires a container element.
        // We can create a temporary div.
        
        const container = document.createElement('div');
        // @ts-ignore
        await this.plugin.app.vault.adapter.read(this.plugin.app.workspace.getActiveFile()?.path || '');
        
        // Actually, we can use a simpler approach if we just want HTML string:
        // Obsidian API: MarkdownRenderer.render(app, markdown, container, sourcePath, component)
        
        const activeFile = this.plugin.app.workspace.getActiveFile();
        const sourcePath = activeFile ? activeFile.path : '/';
        
        // Use a Component to manage lifecycle if needed, but for string generation it's transient
        const component = new (require('obsidian').Component)();
        
        await require('obsidian').MarkdownRenderer.render(
            this.plugin.app,
            markdown,
            container,
            sourcePath,
            component
        );
        
        let html = container.innerHTML;
        
        // 2. Apply Theme CSS (Inline Styles)
        // This is tricky. We need to parse CSS and apply it to elements.
        // A full CSS parser and inliner is heavy (like juice).
        // For now, let's wrap the content in a div with a class and append the style tag?
        // But many platforms strip <style> tags (like WeChat).
        // So inline styles are best.
        
        // Simplified approach: Just return the HTML structure.
        // Custom Publishers (WordPress) usually handle their own styling or accept clean HTML.
        // If we need WeChat styling, we need the "WeChat Renderer" logic which might be in WeChatPublisher.
        
        // For general "render" used by WordPress/Custom:
        // We should just return the clean HTML from Obsidian's renderer.
        
        return html;
    }

    getAllThemes(): ThemeConfig[] {
        return Array.from(this.themes.values());
    }

    applyTheme(html: string, themeName: string): string {
        const theme = this.getTheme(themeName) || this.getTheme("Default");
        if (!theme) return html;

        // For preview, we just wrap in a style tag
        return `
            <style>
                ${theme.css}
            </style>
            <div class="picflow-container" id="picflow-article">
                ${html}
            </div>
        `;
    }

    /**
     * Inlines CSS styles into HTML elements.
     * Required for platforms like WeChat that strip <style> tags.
     */
    inlineStyles(html: string, themeName: string): string {
        const theme = this.getTheme(themeName) || this.getTheme("Default");
        if (!theme) return html;

        // Wrap content first to match selectors like .picflow-container h1
        const wrappedHtml = `
            <div class="picflow-container" id="picflow-article">
                ${html}
            </div>
        `;

        // Use juice to inline styles
        // options: { inlinePseudoElements: true } allows inlining ::before/::after content (limited support in email clients but useful)
        try {
            // Lazy Load juice to avoid startup OOM (depends on cheerio/parse5)
            const juice = require("juice");
            const inlinedHtml = juice(wrappedHtml, { 
                extraCss: theme.css,
                applyStyleTags: true,
                removeStyleTags: true,
                preserveMediaQueries: true
            });
            return inlinedHtml;
        } catch (e) {
            console.error("[PicFlow] Failed to inline styles:", e);
            return wrappedHtml; // Fallback to non-inlined
        }
    }
}
