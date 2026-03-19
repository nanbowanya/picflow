import { Notice, DropdownComponent, MarkdownRenderer, ButtonComponent, TextComponent, ToggleComponent, MarkdownView, Component } from "obsidian";
import PicFlowPlugin from "../../../main";
import { ThemeManager } from "../../managers/theme-manager";
import { IHtmlRenderer } from "../../interfaces";
// import { PlatformRegistry } from "../../platforms"; // Unused
import { t } from "../../i18n";
import { FrontmatterParser } from "../../utils/frontmatter-parser";

// import { StyleInliner } from "../../utils/style-inliner";
import { CoverInputModal } from "../modals/cover-input-modal";

export interface PlatformConfig {
    id: string;
    name: string;
    icon: string;
    type: 'markdown' | 'html'; // Does it support HTML or MD?
    inlineStyle?: boolean; // Does it need custom embedded CSS themes? (e.g. WeChat)
    url?: string; // Platform URL to open
    fields: PlatformField[];
    showCover?: boolean; // Does this platform need a cover image?
}

export interface PlatformField {
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'image' | 'checkbox';
    options?: string[]; // For select
    placeholder?: string;
    required?: boolean;
    // Dynamic visibility logic
    dependsOn?: {
        key: string;
        value: string | boolean; // Show if another field's value matches this
    };
}

export class PublishDrawer {
    plugin: PicFlowPlugin;
    container: HTMLElement;
    themeManager: ThemeManager;
    htmlRenderer: IHtmlRenderer;

    // State
    selectedPlatformId: string = 'wechat';
    selectedAccountId: string = '';
    mainWrapper: HTMLElement;
    previewWrapper: HTMLElement;
    currentTheme: string = 'Default';
    publishStatus: string = 'draft'; // 'draft' or 'publish'
    
    // Dynamic Fields Cache
    categoryCache: Record<string, string[]> = {};
    toolCache: Record<string, string[]> = {}; // Cache for MCP tools

    // Platform Definitions (Static for now, later dynamic)
    get platforms(): PlatformConfig[] {
        const standardPlatforms: PlatformConfig[] = [
        {
            id: 'wechat',
            name: t('platform.wechat', this.plugin.settings),
            icon: 'message-square',
            type: 'html',
            inlineStyle: true,
            showCover: true, // Needed for article type
            url: 'https://mp.weixin.qq.com/',
            fields: [
                // Title and Author hidden, fetched from frontmatter
                { 
                    key: 'category_id', 
                    label: t('publish.field.category', this.plugin.settings), 
                    type: 'select', 
                    options: ['article', 'image'] 
                }
            ]
        },
        {
            id: 'zhihu',
            name: t('platform.zhihu', this.plugin.settings),
            icon: 'book-open',
            type: 'html',
            showCover: true, 
            url: 'https://zhuanlan.zhihu.com/write', // Zhihu URL
            fields: [
                { key: 'tags', label: t('publish.field.tags', this.plugin.settings), type: 'text', placeholder: 'Comma separated' },
                { key: 'zhihu_column', label: t('publish.field.column', this.plugin.settings), type: 'text', placeholder: 'Optional' }
            ]
        },
        {
            id: 'csdn',
            name: t('platform.csdn', this.plugin.settings),
            icon: 'code',
            type: 'markdown',
            showCover: true,
            url: 'https://mp.csdn.net/',
            fields: [
                { key: 'publish_mode', label: t('publish.field.mode', this.plugin.settings), type: 'select', options: ['draft', 'direct'] },
                { key: 'original', label: t('publish.field.original', this.plugin.settings), type: 'checkbox' },
                { key: 'url', label: t('publish.field.originalLink', this.plugin.settings), type: 'text', placeholder: 'If not original' }
            ]
        },
        {
            id: 'juejin',
            name: t('platform.juejin', this.plugin.settings),
            icon: 'box',
            type: 'markdown',
            showCover: true,
            url: 'https://juejin.cn/editor/drafts/new',
            fields: [
                { 
                    key: 'category_id', 
                    label: t('publish.field.category', this.plugin.settings), 
                    type: 'select', 
                    options: ['后端', '前端', 'Android', 'iOS', '人工智能', '开发工具', '代码人生', '阅读'] 
                },
                { key: 'tag_ids', label: t('publish.field.tags', this.plugin.settings), type: 'text', placeholder: 'Comma separated IDs' }
            ]
        },
        {
            id: 'weibo',
            name: t('platform.weibo', this.plugin.settings),
            icon: 'message-circle',
            type: 'html',
            showCover: false,
            url: 'https://card.weibo.com/article/v5/editor#/draft',
            fields: []
        },
        {
            id: 'bilibili',
            name: t('platform.bilibili', this.plugin.settings),
            icon: 'tv',
            type: 'html',
            showCover: true,
            url: 'https://member.bilibili.com/platform/upload/text/new-article',
            fields: [
                { 
                    key: 'category_id', 
                    label: t('publish.field.zone', this.plugin.settings), 
                    type: 'select', 
                    options: ['游戏', '动画', '影视', '知识', '科技', '数码', '生活', '美食', '动物圈', '时尚', '运动', '汽车', '娱乐']
                }
            ]
        },
        /* Temporarily commented out until implemented
        {
            id: 'jianshu',
            name: t('platform.jianshu', this.plugin.settings),
            icon: 'pen-tool',
            type: 'markdown' as const,
            showCover: false,
            url: 'https://www.jianshu.com/writer',
            fields: []
        },
        {
            id: 'toutiao',
            name: t('platform.toutiao', this.plugin.settings),
            icon: 'newspaper',
            type: 'html' as const,
            showCover: true,
            url: 'https://mp.toutiao.com/',
            fields: []
        },
        {
            id: 'xiaohongshu',
            name: t('platform.xiaohongshu', this.plugin.settings),
            icon: 'instagram',
            type: 'html' as const,
            showCover: true,
            url: 'https://creator.xiaohongshu.com/publish/publish',
            fields: []
        },
        {
            id: 'baijiahao',
            name: t('platform.baijiahao', this.plugin.settings),
            icon: 'search',
            type: 'html' as const,
            showCover: true,
            url: 'https://baijiahao.baidu.com/builder/rc/edit',
            fields: []
        },
        {
            id: 'yuque',
            name: t('platform.yuque', this.plugin.settings),
            icon: 'feather',
            type: 'markdown' as const,
            showCover: false,
            url: 'https://www.yuque.com/dashboard',
            fields: []
        },
        {
            id: 'douban',
            name: t('platform.douban', this.plugin.settings),
            icon: 'book',
            type: 'markdown' as const,
            showCover: false,
            url: 'https://www.douban.com/note/create',
            fields: []
        },
        {
            id: 'sohu',
            name: t('platform.sohu', this.plugin.settings),
            icon: 'globe',
            type: 'html' as const,
            showCover: true,
            url: 'https://mp.sohu.com/mp/index.html',
            fields: []
        },
        {
            id: 'twitter',
            name: t('platform.twitter', this.plugin.settings),
            icon: 'twitter',
            type: 'markdown' as const,
            showCover: false,
            url: 'https://twitter.com/compose/tweet',
            fields: []
        },
        {
            id: 'woshipm',
            name: t('platform.woshipm', this.plugin.settings),
            icon: 'briefcase',
            type: 'html' as const,
            showCover: true,
            url: 'https://www.woshipm.com/user/center/publish',
            fields: []
        },
        {
            id: 'dayu',
            name: t('platform.dayu', this.plugin.settings),
            icon: 'fish',
            type: 'html' as const,
            showCover: true,
            url: 'https://mp.dayu.com/dashboard/article/write',
            fields: []
        },
        {
            id: 'yidian',
            name: t('platform.yidian', this.plugin.settings),
            icon: 'zap',
            type: 'html' as const,
            showCover: true,
            url: 'https://mp.yidianzixun.com/',
            fields: []
        },
        {
            id: 'sohufocus',
            name: t('platform.sohufocus', this.plugin.settings),
            icon: 'home',
            type: 'html' as const,
            showCover: true,
            url: 'https://mp.focus.cn/',
            fields: []
        }
        */
        ];

        // Add Custom Platform Tab if any custom platforms exist
        if (this.plugin.settings.customPlatforms && this.plugin.settings.customPlatforms.length > 0) {
            standardPlatforms.push({
                id: 'custom',
                name: t('settings.customPlatform.title', this.plugin.settings),
                icon: 'plug', // Using 'plug' for custom/plugin
                type: 'markdown', // Default to markdown, but depends on specific platform
                showCover: false, // Default false
                url: '', 
                fields: [] // Custom platforms might not need generic fields here
            });
        }
        
        return standardPlatforms;
    }

    constructor(plugin: PicFlowPlugin, container: HTMLElement, themeManager: ThemeManager, htmlRenderer: IHtmlRenderer) {
        this.plugin = plugin;
        this.container = container;
        this.themeManager = themeManager;
        this.htmlRenderer = htmlRenderer;
    }

    async render() {
        this.container.empty();
        this.container.addClass("publish-drawer");

        // 1. Top Fixed Area: Platform Tabs
        const topTabs = this.container.createDiv({ cls: 'publish-top-tabs' });
        this.renderPlatformTabs(topTabs);

        // 2. Middle Scrollable Area: Preview
        const mainArea = this.container.createDiv({ cls: 'publish-main-area' });
        this.mainWrapper = mainArea;

        // Preview Wrapper
        this.previewWrapper = mainArea.createDiv({ cls: 'picflow-markdown-preview' });
        await this.renderPreview(this.previewWrapper);

        // 3. Bottom Fixed Area: Configuration + Actions
        const bottomContainer = this.container.createDiv({ cls: 'publish-bottom-container' });
        
        // Configuration Area inside Bottom Container
        const configWrapper = bottomContainer.createDiv({ cls: 'publish-config-wrapper' });
        
        await this.renderConfigurationArea(configWrapper);

        // Action Buttons at the very bottom
        const actionsWrapper = bottomContainer.createDiv({ cls: 'publish-actions-wrapper' });
        
        this.renderActionButtons(actionsWrapper);
    }

    private renderPlatformTabs(container: HTMLElement) {
        const tabsContainer = container.createDiv({ cls: "picflow-platform-tabs" });

        this.platforms.forEach(p => {
            const btn = tabsContainer.createDiv({ cls: "picflow-platform-tab-btn" });
            
            // Highlight active
            if (this.selectedPlatformId === p.id) {
                btn.addClass("active");
            }

            btn.createSpan({ text: p.name });

            btn.onclick = async () => {
                this.selectedPlatformId = p.id;
                this.selectedAccountId = ''; // Reset account on platform switch
                await this.render(); // Re-render everything
            };
        });
    }

    private async updateDynamicFields() {
        if (this.selectedPlatformId === 'custom') {
            // Find if selected account is WordPress
            const account = this.plugin.accountManager.getAccount(this.selectedAccountId);
            if (account) {
                // Find config type
                const config = this.plugin.settings.customPlatforms?.find(c => c.id === account.id);
                
                if (config && config.type === 'wordpress') {
                    // Try to fetch categories if not cached
                    if (!this.categoryCache[account.id]) {
                        try {
                            const { WordPressPublisher } = await import('../../core/publishers/wordpress-publisher');
                            const publisher = new WordPressPublisher(this.plugin, config.wordpress);
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            if ((publisher as any).getCategories) {
                                // eslint-disable-next-line obsidianmd/ui/sentence-case
                                new Notice("Fetching WordPress categories...");
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const categories = await (publisher as any).getCategories();
                                if (categories && categories.length > 0) {
                                    this.categoryCache[account.id] = categories;
                                    await this.render(); // Re-render to show categories
                                }
                            }
                        } catch (e: unknown) {
                            console.error("Failed to load WP categories", e);
                            new Notice(`Failed to fetch WordPress categories: ${(e as Error).message}`);
                        }
                    }
                } else if (config && config.type === 'mcp') {
                    // Try to fetch tools if not cached
                    if (!this.toolCache[account.id]) {
                        try {
                            const { MCPPublisher } = await import('../../core/publishers/mcp-publisher');
                            const publisher = new MCPPublisher(this.plugin, config.mcp);
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            if ((publisher as any).getTools) {
                                // eslint-disable-next-line obsidianmd/ui/sentence-case
                                new Notice('Fetching MCP tools...'); 
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const tools = await (publisher as any).getTools();
                                if (tools && tools.length > 0) {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    this.toolCache[account.id] = tools.map((t: any) => t.name);
                                    // this.render(); // Avoid infinite loop or redundant renders, call specific update or ensure this is called once
                                    // Actually, we need to re-render to populate the dropdown
                                    const wrapper = this.container.querySelector('.publish-config-wrapper');
                                    if (wrapper) {
                                        wrapper.empty();
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        await this.renderConfigurationArea(wrapper as any);
                                    }
                                }
                            }
                        } catch (e: unknown) {
                            console.error("Failed to load MCP tools", e);
                            new Notice(`Failed to fetch MCP tools: ${(e as Error).message}`);
                        }
                    }
                }
            }
        }
    }

    private async renderPreview(container: HTMLElement) {
        const platform = this.platforms.find(p => p.id === this.selectedPlatformId);
        if (!platform) return;

        container.empty();

        // Find active markdown file
        let file = this.plugin.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
            // Try to find a recent one
            const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
            if (leaves.length > 0) {
                const view = leaves[0].view as MarkdownView;
                if (view.file) file = view.file;
            }
        }

        if (!file) {
            container.createEl('div', { text: t('publish.drawer.noFile'), cls: 'picflow-empty-state' });
            return;
        }

        const markdown = await this.plugin.app.vault.read(file);
        // Remove frontmatter for preview if needed, or keep it. HtmlRenderer usually handles it or we strip it.
        // For WeChat, we usually strip frontmatter.
        const contentBody = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');

        // Use HTML Preview for all HTML-type platforms (WeChat, Bilibili, etc.)
        if (platform.type === 'html') {
            // HTML Renderer (WeChat style)
            const wrapper = container.createDiv({ cls: 'picflow-preview-html-wrapper' });
            
            const loading = wrapper.createEl('div', { text: 'Rendering preview...' });

            try {
                // Determine theme to use.
                // For non-inline platforms (like Bilibili/Zhihu), we still render HTML but use 'Default' theme or current if needed.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const html = String(await (this.htmlRenderer as any).render(contentBody, this.currentTheme));
                loading.remove();

                // Use Shadow DOM to isolate styles
                const shadowHost = wrapper.createDiv();
                const shadow = shadowHost.attachShadow({ mode: 'open' });

                // Inject Theme CSS ONLY if the platform supports/needs it (inlineStyle is true)
                // OR if it's an HTML platform that we want to look styled.
                // But user requested "no theme selection for others", so we should only apply theme if it's WeChat.
                // Actually, if we render HTML, we need SOME base styles or it looks broken.
                // But for Zhihu/Bilibili, maybe we should just render clean HTML?
                // Let's stick to the plan: Render HTML, but only apply the Theme CSS if inlineStyle is true (WeChat).
                
                if (platform.inlineStyle) {
                    const themeConfig = this.themeManager.getTheme(this.currentTheme);
                    if (themeConfig) {
                        try {
                            const sheet = new CSSStyleSheet();
                            sheet.replaceSync(themeConfig.css);
                            shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
                        } catch(e) {
                            console.error("Constructable stylesheets not supported", e);
                        }
                    }
                } else {
                    // For other HTML platforms, maybe inject a minimal reset or default obsidian-like style?
                    // Or just let it be raw HTML with default browser styles?
                    // The user wants "Preview = Publish".
                    // If Zhihu publishes HTML, it will be rendered by Zhihu's CSS on their site.
                    // We can't replicate Zhihu's CSS easily.
                    // But displaying raw unstyled HTML is better than Markdown if we are sending HTML.
                    // However, raw HTML might look ugly (Times New Roman, no margins).
                    // Let's add a basic readable style for non-WeChat HTML previews.
                    try {
                        const sheet = new CSSStyleSheet();
                        sheet.replaceSync(`
                            :host { font-family: sans-serif; line-height: 1.6; color: #333; }
                            img { max-width: 100% !important; height: auto !important; }
                            pre { background: #f6f8fa; padding: 10px; overflow-x: auto; }
                            blockquote { border-left: 4px solid #dfe2e5; padding-left: 10px; color: #6a737d; }
                        `);
                        shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
                    } catch(e) {
                        console.error("Constructable stylesheets not supported", e);
                    }
                }

                // Inject default styles to fix image overflow in shadow DOM (Global fix)
                try {
                    const defaultStyleSheet = new CSSStyleSheet();
                    defaultStyleSheet.replaceSync(`
                        img { max-width: 100% !important; height: auto !important; }
                        pre { white-space: pre-wrap !important; word-wrap: break-word !important; max-width: 100%; overflow-x: auto; }
                        table { display: block; overflow-x: auto; max-width: 100%; }
                    `);
                    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, defaultStyleSheet];
                } catch(e) {
                    console.error("Constructable stylesheets not supported", e);
                }

                // For Preview: Instead of running the slow `juice` inliner,
                // we rely on the <style> tag injected above. This is much faster
                // and looks 99% identical in the Shadow DOM.
                const shadowWrapper = document.createElement('div');
                shadowWrapper.className = 'picflow-container'; // Essential for CSS selectors to match
                shadowWrapper.id = 'picflow-article';
                
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                Array.from(doc.body.childNodes).forEach(node => {
                    shadowWrapper.appendChild(node);
                });

                shadow.appendChild(shadowWrapper);
            } catch (e) {
                loading.setText('Error rendering: ' + e.message);
                loading.addClass('picflow-error-text');
            }

        } else {
            // Markdown Preview (Zhihu style)
            const wrapper = container.createDiv({ cls: 'picflow-preview-md-wrapper' });

            // Render using Obsidian's MarkdownRenderer
            const tempComponent = new Component();
            tempComponent.load();
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await MarkdownRenderer.render(this.plugin.app, contentBody, wrapper as any, file.path, tempComponent as any);
        }
    }

    // Helper: Render Cover Image Control
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private renderCoverImageControl(container: HTMLElement, file: any) {
        const coverArea = container.createDiv({ cls: 'picflow-field-wrapper' });
        // Style handled by class
        
        // Removed Label as requested
        // this.createLabel(coverArea, t('publish.drawer.cover', this.plugin.settings));
        
        // Fixed height for cover preview
        coverArea.addClass('picflow-h-60');
        
        // Get Metadata
        let coverUrl = '';
        if (file) {
            const metadata = FrontmatterParser.getMetadata(this.plugin.app, file) as Record<string, unknown>;
            coverUrl = String(metadata.cover || '');
        }

        // Cover Preview Box
        const coverBox = coverArea.createDiv({ cls: 'picflow-cover-preview-box' });
        // Styles moved to CSS class .picflow-cover-preview-box

        if (coverUrl) {
            const img = coverBox.createEl('img');
            img.addClass('picflow-cover-image');
            // Styles moved to CSS class .picflow-cover-image
            
            if (coverUrl.startsWith('data:')) {
                img.src = coverUrl;
            } else if (coverUrl.startsWith('/') || coverUrl.match(/^[a-zA-Z]:\\/)) {
                img.src = this.plugin.app.vault.adapter.getResourcePath(coverUrl);
            } else {
                img.src = coverUrl;
            }
        } else {
            const icon = coverBox.createDiv({ text: '+' });
            icon.addClass('picflow-cover-upload-icon');
            // Styles moved to CSS class .picflow-cover-upload-icon
        }

        coverBox.onclick = () => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            new CoverInputModal(this.plugin.app, coverUrl, async (url) => {
                if (file) {
                    if (url === coverUrl) return;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await FrontmatterParser.updateMetadata(this.plugin.app, file, { cover: url } as any);
                    new Notice('Cover updated.');
                    void this.render(); 
                }
            }).open();
        };
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    private async renderConfigurationArea(container: HTMLElement) {
        const platform = this.platforms.find(p => p.id === this.selectedPlatformId);
        if (!platform) return;

        const configArea = container.createDiv({ cls: 'picflow-publish-config-area' });
        // Styles moved to CSS class .picflow-publish-config-area

        // 1. Top Row: Cover (Optional) + Account Selector
        const topRow = configArea.createDiv({ cls: 'picflow-config-row' });
        // Styles moved to CSS class .picflow-config-row

        // Cover Image (If platform supports it)
        if (platform.showCover) {
            const coverWrapper = topRow.createDiv({ cls: 'picflow-cover-wrapper' });
            // Styles moved to CSS class .picflow-cover-wrapper
            
            const file = this.plugin.app.workspace.getActiveFile();
            this.renderCoverImageControl(coverWrapper, file);
        } else if (this.selectedPlatformId === 'custom') {
             // [NEW] Check if custom platform needs cover (e.g. WordPress)
             // Use this.selectedAccountId directly. If it's empty, it will be set later in dropdown logic.
             // But render happens sequentially. We need to know account ID here.
             
             // If selectedAccountId is empty, we might default to first account below.
             // But cover renders BEFORE account selector logic.
             // So we need to peek at what account will be selected.
             
             let currentAccId = this.selectedAccountId;
             if (!currentAccId) {
                 const accounts = this.plugin.accountManager.getAccounts(this.selectedPlatformId);
                 if (accounts.length > 0) currentAccId = accounts[0].id;
             }

             if (currentAccId) {
                const config = this.plugin.settings.customPlatforms?.find(c => c.id === currentAccId);
                if (config && config.type === 'wordpress') {
                    const coverWrapper = topRow.createDiv({ cls: 'picflow-cover-wrapper' });
                    // Styles moved to CSS class .picflow-cover-wrapper
                    const file = this.plugin.app.workspace.getActiveFile();
                    this.renderCoverImageControl(coverWrapper, file);
                }
             }
        }

        // Account Selector (Takes remaining space in top row)
        const accountWrapper = topRow.createDiv({ cls: 'picflow-field-wrapper' });
        accountWrapper.addClass('picflow-flex-1');
        // Styles moved to CSS class .picflow-field-wrapper and utility class .picflow-flex-1
        
        this.createLabel(accountWrapper, t('publish.drawer.account'));
        const accDropdown = new DropdownComponent(accountWrapper);
        accDropdown.selectEl.addClass('picflow-field-select');
        // Styles moved to CSS class .picflow-field-select
        
        const accounts = this.plugin.accountManager.getAccounts(this.selectedPlatformId);
        if (accounts.length === 0) {
            accDropdown.addOption('', t('publish.drawer.noAccount'));
            accDropdown.setDisabled(true);
        } else {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            accounts.forEach(acc => accDropdown.addOption(acc.id, acc.name));
            if (this.selectedAccountId) accDropdown.setValue(this.selectedAccountId);
            else if (accounts.length > 0) {
                this.selectedAccountId = accounts[0].id;
                accDropdown.setValue(accounts[0].id);
            }
            accDropdown.onChange(val => {
                this.selectedAccountId = val;
                // Trigger dynamic update if custom platform changes
                // Re-render whole drawer to update cover image visibility if switching between types
                void this.render(); 
            });
        }

        // Trigger initial update for custom platforms
        if (this.selectedPlatformId === 'custom' && this.selectedAccountId) {
            // Use setTimeout to avoid blocking render
            setTimeout(() => { void this.updateDynamicFields(); }, 0);
        }

        // 2. Middle Row: Theme (WeChat Only) + Dynamic Fields Grid
        if (this.selectedPlatformId === 'wechat') {
             // For WeChat, we want Theme and Category to be in the same grid
             // So we merge them into the dynamic fields area logic
        }

        // 3. Dynamic Fields & Theme
        const fieldsContainer = configArea.createDiv({ cls: 'picflow-fields-grid' });
        // Styles moved to CSS class .picflow-fields-grid

        // A. Inject Theme Control only for platforms with inline styles (e.g. WeChat)
        if (platform.inlineStyle) {
            const themeWrapper = fieldsContainer.createDiv({ cls: 'picflow-field-wrapper' });
            // Styles moved to CSS class .picflow-field-wrapper
            
            this.createLabel(themeWrapper, t('publish.drawer.theme'));
            
            const themeControls = themeWrapper.createDiv({ cls: 'picflow-theme-control-group' });
            // Styles moved to CSS class .picflow-theme-control-group

            const themeDropdown = new DropdownComponent(themeControls);
            themeDropdown.selectEl.addClass('picflow-field-select'); // Use same class as other selects
            // Styles moved to CSS class .picflow-field-select
            
            const populateThemes = () => {
                themeDropdown.selectEl.empty();
                const themes = this.themeManager.getAllThemes();
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                themes.forEach(t => themeDropdown.addOption(t.name, t.name));
                // Select current theme if valid, otherwise first one
                const themeNames = themes.map(t => t.name);
                if (themeNames.includes(this.currentTheme)) {
                    themeDropdown.setValue(this.currentTheme);
                } else if (themeNames.length > 0) { 
                    this.currentTheme = themeNames[0]; 
                    themeDropdown.setValue(themeNames[0]); 
                }
            };
            
            // Initial population
            populateThemes();

            themeDropdown.onChange(val => { 
                this.currentTheme = val; 
                // Important: Trigger preview refresh when theme changes
                this.refreshPreview(); 
            });
        }

        // B. Platform Specific Fields
        platform.fields.forEach(field => {
            const wrapper = fieldsContainer.createDiv({ cls: 'picflow-field-wrapper' });
            // Styles moved to CSS class .picflow-field-wrapper
            
            this.createLabel(wrapper, field.label);

            if (field.type === 'select') {
                const dropdown = new DropdownComponent(wrapper);
                dropdown.selectEl.addClass('picflow-field-select');
                // Styles moved to CSS class .picflow-field-select
                
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                field.options?.forEach(opt => dropdown.addOption(opt, opt));
                
                // Get value from frontmatter
                const file = this.plugin.app.workspace.getActiveFile();
                if (file) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const meta = FrontmatterParser.getMetadata(this.plugin.app, file as any) as Record<string, unknown>;
                        if (meta[field.key]) dropdown.setValue(String(meta[field.key]));
                    }

                dropdown.onChange(async val => {
                    if (file) {
                        await FrontmatterParser.updateMetadata(this.plugin.app, file, { [field.key]: val } as unknown);
                    }
                });
            } else if (field.type === 'text') {
                const text = new TextComponent(wrapper);
                text.inputEl.addClass('picflow-field-input');
                // Styles moved to CSS class .picflow-field-input
                if (field.placeholder) text.setPlaceholder(field.placeholder);

                const file = this.plugin.app.workspace.getActiveFile();
                if (file) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const meta = FrontmatterParser.getMetadata(this.plugin.app, file as any) as Record<string, unknown>;
                if (meta[field.key]) text.setValue(String(meta[field.key]));
                }

                text.onChange(async val => {
                    if (file) {
                        await FrontmatterParser.updateMetadata(this.plugin.app, file, { [field.key]: val } as unknown);
                    }
                });
            } else if (field.type === 'checkbox') {
                const toggle = new ToggleComponent(wrapper);
                const file = this.plugin.app.workspace.getActiveFile();
                if (file) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const meta = FrontmatterParser.getMetadata(this.plugin.app, file as any) as Record<string, unknown>;
                toggle.setValue(!!meta[field.key]);
                }
                toggle.onChange(async val => {
                    if (file) {
                        await FrontmatterParser.updateMetadata(this.plugin.app, file, { [field.key]: val } as unknown);
                    }
                });
            }
        });

        // [NEW] Custom Platform Fields (e.g. WordPress Categories)
        if (this.selectedPlatformId === 'custom' && this.selectedAccountId) {
            const config = this.plugin.settings.customPlatforms?.find(c => c.id === this.selectedAccountId);
            
            // Check if it's WordPress to inject standard fields
            if (config && config.type === 'wordpress') {
                const file = this.plugin.app.workspace.getActiveFile();
                
                // 1. Cover Field (Removed duplicate text input)
                // The visual cover control is now in the top row.
                // We don't need another text input for cover here.

                // 2. Tags Field
                const tagsWrapper = fieldsContainer.createDiv({ cls: 'picflow-field-wrapper' });
                // Styles moved to CSS class .picflow-field-wrapper
                this.createLabel(tagsWrapper, t('publish.drawer.tags', this.plugin.settings) || 'Tags');
                const tagsText = new TextComponent(tagsWrapper);
                tagsText.inputEl.addClass('picflow-field-input');
                // Styles moved to CSS class .picflow-field-input
                tagsText.setPlaceholder(t('publish.drawer.tagsPlaceholder', this.plugin.settings) || 'Comma separated');
                
                if (file) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const meta = FrontmatterParser.getMetadata(this.plugin.app, file as any) as Record<string, unknown>;
                    if (meta['tags']) {
                        const t = meta['tags'];
                        tagsText.setValue(Array.isArray(t) ? t.join(', ') : String(t));
                    }
                }
                tagsText.onChange(async val => {
                    if (file) {
                        // Split by comma and trim
                        const tagList = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        await FrontmatterParser.updateMetadata(this.plugin.app, file, { tags: tagList } as unknown);
                    }
                });

                // 3. Category Field (Dynamic or Text)
                const categories = this.categoryCache[this.selectedAccountId];
                const catWrapper = fieldsContainer.createDiv({ cls: 'picflow-field-wrapper' });
                // Styles moved to CSS class .picflow-field-wrapper
                this.createLabel(catWrapper, t('publish.drawer.category', this.plugin.settings) || 'Category');

                if (categories && categories.length > 0) {
                    // Dropdown
                    const dropdown = new DropdownComponent(catWrapper);
                    dropdown.selectEl.addClass('picflow-field-select');
                    // Styles moved to CSS class .picflow-field-select
                    // eslint-disable-next-line @typescript-eslint/no-misused-promises
                    categories.forEach(c => dropdown.addOption(c, c));
                    
                    if (file) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const meta = FrontmatterParser.getMetadata(this.plugin.app, file as any) as Record<string, unknown>;
                        const metaCats = meta['categories'];
                        if (Array.isArray(metaCats) && metaCats.length > 0) dropdown.setValue(String(metaCats[0]));
                        else if (typeof metaCats === 'string') dropdown.setValue(metaCats);
                    }
                    dropdown.onChange(async val => {
                        if (file) await FrontmatterParser.updateMetadata(this.plugin.app, file, { categories: [val] } as unknown);
                    });
                } else {
                    // Fallback Text Input
                    const catText = new TextComponent(catWrapper);
                    catText.inputEl.addClass('picflow-field-input');
                    // Styles moved to CSS class .picflow-field-input
                    catText.setPlaceholder('Category name');
                    
                    if (file) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const meta = FrontmatterParser.getMetadata(this.plugin.app, file as any) as Record<string, unknown>;
                        const metaCats = meta['categories'];
                        if (Array.isArray(metaCats) && metaCats.length > 0) catText.setValue(String(metaCats[0]));
                        else if (typeof metaCats === 'string') catText.setValue(metaCats);
                    }
                    catText.onChange(async val => {
                        if (file) await FrontmatterParser.updateMetadata(this.plugin.app, file, { categories: [val] } as unknown);
                    });
                }

                // 4. Publish Status (Draft vs Publish)
                const statusWrapper = fieldsContainer.createDiv({ cls: 'picflow-field-wrapper' });
                // Styles moved to CSS class .picflow-field-wrapper
                this.createLabel(statusWrapper, t('publish.drawer.status', this.plugin.settings) || 'Status');
                
                const statusDropdown = new DropdownComponent(statusWrapper);
                statusDropdown.selectEl.addClass('picflow-field-select');
                // Styles moved to CSS class .picflow-field-select
                statusDropdown.addOption('draft', t('publish.drawer.statusDraft', this.plugin.settings) || 'Draft (草稿)');
                statusDropdown.addOption('publish', t('publish.drawer.statusPublish', this.plugin.settings) || 'Publish (直接发布)');
                
                // Initialize from state or frontmatter
                // If frontmatter has publish_mode: direct -> publish, else draft
                if (file) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const meta = FrontmatterParser.getMetadata(this.plugin.app, file as any) as Record<string, unknown>;
                    if (meta['publish_mode'] === 'direct' || meta['status'] === 'publish') {
                        this.publishStatus = 'publish';
                    } else {
                        this.publishStatus = 'draft';
                    }
                }
                statusDropdown.setValue(this.publishStatus);
                
                statusDropdown.onChange(async val => {
                    this.publishStatus = val;
                    // Optionally update frontmatter too? 
                    // Let's keep it transient in UI for now, or sync to publish_mode
                    if (file) {
                        await FrontmatterParser.updateMetadata(this.plugin.app, file, { 
                            publish_mode: val === 'publish' ? 'direct' : 'draft' 
                        } as unknown);
                    }
                });
            } else if (config && config.type === 'mcp') {
                // MCP Tools Selector
                const tools = this.toolCache[this.selectedAccountId];
                const toolWrapper = fieldsContainer.createDiv({ cls: 'picflow-field-wrapper' });
                // Styles moved to CSS class .picflow-field-wrapper
                this.createLabel(toolWrapper, t('publish.drawer.mcpTool', this.plugin.settings) || 'MCP Tool');

                const dropdown = new DropdownComponent(toolWrapper);
                dropdown.selectEl.addClass('picflow-field-select');
                // Styles moved to CSS class .picflow-field-select
                
                // Add default "Auto" option
                dropdown.addOption('', t('publish.drawer.mcpToolAuto', this.plugin.settings) || 'Auto Detect');
                
                // Add fetched tools
                if (tools && tools.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-misused-promises
                    tools.forEach(t => dropdown.addOption(t, t));
                }
                
                // Set initial value from config or previous selection
                let selectedTool = config.mcp?.toolName || '';

                // If no tool selected, try to find a default "publish" tool
                if (!selectedTool && tools && tools.length > 0) {
                    const defaultTool = tools.find(t => t.includes('publish') || t.includes('post'));
                    if (defaultTool) {
                        selectedTool = defaultTool;
                        // Auto-select in config too
                        if (config.mcp) config.mcp.toolName = selectedTool;
                    }
                }

                dropdown.setValue(selectedTool);

                dropdown.onChange(val => {
                    // We need to pass this tool name to the publisher
                    // We can temporarily store it in the config object in memory
                    // OR pass it via publish options. 
                    // Since PublishManager.publish signature is fixed, we updated MCPPublisher to accept options in last arg?
                    // Wait, PublishManager.publish takes (platformId, file, accountId, themeName)
                    // We might need to update PublishManager to support options or use a hack.
                    // Actually, I updated MCPPublisher.publish signature, but PublishManager calls it.
                    
                    // Let's store it in a transient state map in the plugin or drawer?
                    // Or update the config in memory (not saving to disk) so it persists for this session?
                    if (config.mcp) {
                        config.mcp.toolName = val;
                    }
                });
            }
        }
    }

    private renderActionButtons(container: HTMLElement) {
        const actionRow = container.createDiv({ cls: 'picflow-actions-row' });

        // Publish (Big)
            const publishBtn = new ButtonComponent(actionRow)
            .setButtonText(t('publish.drawer.publish', this.plugin.settings))
            .setCta()
            .onClick(async () => {
                if (!this.selectedAccountId) {
                    new Notice(t('publish.drawer.selectAccount', this.plugin.settings));
                    return;
                }
                if (this.selectedPlatformId) {
                    const file = this.plugin.app.workspace.getActiveFile();
                    if (!file) {
                        new Notice(t('publish.drawer.noFile', this.plugin.settings));
                        return;
                    }
                    publishBtn.setButtonText(t('publish.drawer.publishing', this.plugin.settings));
                    publishBtn.setDisabled(true);
                    try {
                        await this.plugin.publishManager.publish(
                            this.selectedPlatformId,
                            file,
                            this.selectedAccountId,
                            this.selectedPlatformId === 'wechat' ? this.currentTheme : 'Default'
                        );
                        // Notice is now handled inside PublishManager or Publisher to allow for error messages
                        new Notice(t('publish.drawer.published', this.plugin.settings));
                    } catch (err: unknown) {
                        new Notice(`Publish error: ${(err as Error).message}`);
                    } finally {
                        publishBtn.setButtonText(t('publish.drawer.publish', this.plugin.settings));
                        publishBtn.setDisabled(false);
                    }
                }
            });
        publishBtn.buttonEl.addClass('picflow-action-btn-publish');

        // Copy
        const copyBtn = new ButtonComponent(actionRow)
            .setButtonText(t('publish.drawer.copy', this.plugin.settings))
            .onClick(() => {
                void this.handleCopy();
            });
        copyBtn.buttonEl.addClass('picflow-action-btn-copy');

        // Go to Platform
        const gotoBtn = new ButtonComponent(actionRow)
            .setButtonText(t('publish.drawer.goto', this.plugin.settings))
            .setTooltip(t('publish.drawer.goto', this.plugin.settings))
            .onClick(() => {
                const platform = this.platforms.find(p => p.id === this.selectedPlatformId);
                if (platform && platform.url) {
                    window.open(platform.url, '_blank');
                }
            });
        gotoBtn.buttonEl.addClass('picflow-action-btn-goto');

        // Refresh (Icon)
        const refreshBtn = new ButtonComponent(actionRow)
            .setIcon('refresh-cw')
            .setTooltip(t('publish.drawer.refresh', this.plugin.settings))
            .onClick(() => {
                // Refresh themes list if in WeChat mode
                if (this.selectedPlatformId === 'wechat') {
                    void this.themeManager.loadThemes().then(() => {
                        void this.render();
                        new Notice(t('publish.drawer.refresh', this.plugin.settings));
                    });
                } else {
                    this.refreshPreview();
                    new Notice(t('publish.drawer.refresh', this.plugin.settings));
                }
            });
        refreshBtn.buttonEl.addClass('picflow-action-btn-refresh');
    }

    private createLabel(container: HTMLElement, text: string) {
        const el = container.createDiv({
            text: text,
            cls: 'setting-item-name'
        });
        el.addClass('picflow-field-label');
        el.addClass('picflow-mb-4');
        return el;
    }

    private refreshPreview() {
        const mainArea = this.container.querySelector('.publish-main-area');
        if (mainArea) void this.renderPreview(mainArea as HTMLElement);
    }

    private async handleCopy() {
        const platform = this.platforms.find(p => p.id === this.selectedPlatformId);
        if (!platform) return;

        let content = '';
        let file = this.plugin.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
            const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
            if (leaves.length > 0) {
                const view = leaves[0].view as MarkdownView;
                if (view.file) file = view.file;
            }
        }
        if (!file) {
            new Notice(t('publish.drawer.noFileCopy', this.plugin.settings));
            return;
        }
        const markdown = await this.plugin.app.vault.read(file);

        if (platform?.type === 'html') {
            const wrapper = this.container.querySelector('.picflow-preview-html-wrapper');
            if (wrapper && wrapper.firstElementChild && wrapper.firstElementChild.shadowRoot) {
                const article = wrapper.firstElementChild.shadowRoot.getElementById('picflow-article');
                if (article) {
                    content = article.innerHTML;
                }
            }
            if (!content) {
                 new Notice(t('publish.drawer.copyFailed', this.plugin.settings));
                 return;
            }

            try {
                const blobHtml = new Blob([content], { type: 'text/html' });
                const blobText = new Blob([content], { type: 'text/plain' });

                const data = [new ClipboardItem({
                    ['text/html']: blobHtml,
                    ['text/plain']: blobText
                })];
                await navigator.clipboard.write(data);
                new Notice(t('publish.drawer.richTextCopied', this.plugin.settings));
            } catch (err: unknown) {
                console.error('Clipboard API failed:', err);
                new Notice('Copy failed. Please select and copy manually.');
            }
        } else {
            void navigator.clipboard.writeText(markdown);
            new Notice(t('publish.drawer.markdownCopied', this.plugin.settings));
        }
    }
}
