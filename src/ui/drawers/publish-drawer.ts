import { ButtonComponent, DropdownComponent, Notice, Setting, TextAreaComponent, TextComponent, MarkdownView, MarkdownRenderer, Component, ToggleComponent } from "obsidian";
import PicFlowPlugin from "../../../main";
import { t } from "../../i18n";
import { ThemeManager } from "../../managers/theme-manager";
import { IHtmlRenderer } from "../../interfaces";
import { PlatformRegistry } from "../../platforms";
import { FrontmatterParser } from "../../utils/frontmatter-parser";

import { StyleInliner } from "../../utils/style-inliner";
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
            url: 'https://zhuanlan.zhihu.com/write',
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

    render() {
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
        this.renderPreview(this.previewWrapper);

        // 3. Bottom Fixed Area: Configuration + Actions
        const bottomContainer = this.container.createDiv({ cls: 'publish-bottom-container' });
        
        // Configuration Area inside Bottom Container
        const configWrapper = bottomContainer.createDiv({ cls: 'publish-config-wrapper' });
        
        this.renderConfigurationArea(configWrapper);

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

            btn.onclick = () => {
                this.selectedPlatformId = p.id;
                this.selectedAccountId = ''; // Reset account on platform switch
                this.render(); // Re-render everything
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
                            const { WordPressPublisher } = require('../../core/publishers/wordpress-publisher');
                            const publisher = new WordPressPublisher(this.plugin, config.wordpress);
                            if (publisher.getCategories) {
                                new Notice('Fetching WordPress categories...');
                                const categories = await publisher.getCategories();
                                if (categories && categories.length > 0) {
                                    this.categoryCache[account.id] = categories;
                                    this.render(); // Re-render to show categories
                                }
                            }
                        } catch (e) {
                            console.error("Failed to load WP categories", e);
                        }
                    }
                } else if (config && config.type === 'mcp') {
                    // Try to fetch tools if not cached
                    if (!this.toolCache[account.id]) {
                        try {
                            // @ts-ignore
                            const { MCPPublisher } = require('../../core/publishers/mcp-publisher');
                            const publisher = new MCPPublisher(this.plugin, config.mcp);
                            if (publisher.getTools) {
                                new Notice('Fetching MCP tools...'); 
                                const tools = await publisher.getTools();
                                if (tools && tools.length > 0) {
                                    this.toolCache[account.id] = tools.map((t: any) => t.name);
                                    // this.render(); // Avoid infinite loop or redundant renders, call specific update or ensure this is called once
                                    // Actually, we need to re-render to populate the dropdown
                                    const wrapper = this.container.querySelector('.publish-config-wrapper') as HTMLElement;
                                    if (wrapper) {
                                        wrapper.empty();
                                        this.renderConfigurationArea(wrapper);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error("Failed to load MCP tools", e);
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

        // Only WeChat needs the custom HTML + Theme preview
        if (platform.id === 'wechat') {
            // HTML Renderer (WeChat style)
            const wrapper = container.createDiv({ cls: 'picflow-preview-html-wrapper' });
            
            const loading = wrapper.createEl('div', { text: 'Rendering preview...' });

            try {
                const html = await this.htmlRenderer.render(contentBody, this.currentTheme);
                loading.remove();

                // Use Shadow DOM to isolate styles
                const shadowHost = wrapper.createDiv();
                const shadow = shadowHost.attachShadow({ mode: 'open' });

                // For Preview: We need to inject styles because Shadow DOM stops global styles
                // AND we want to simulate the "Inlined" look only if the platform needs it.
                // We have two choices: 
                // 1. Inline the styles (like we do for copy/publish)
                // 2. Inject <style> tag (easier for preview performance)

                // Let's use Inlining to be 100% WYSIWYG
                const inlinedHtml = platform.inlineStyle
                    ? this.themeManager.inlineStyles(html, this.currentTheme)
                    : html;

                shadow.innerHTML = inlinedHtml;
            } catch (e) {
                loading.setText('Error rendering: ' + e.message);
                loading.style.color = 'red';
            }

        } else {
            // Markdown Preview (Zhihu style)
            const wrapper = container.createDiv({ cls: 'picflow-preview-md-wrapper' });

            // Render using Obsidian's MarkdownRenderer
            await MarkdownRenderer.render(this.plugin.app, contentBody, wrapper, file.path, new Component());
        }
    }

    // Helper: Render Cover Image Control
    private renderCoverImageControl(container: HTMLElement, file: any) {
        const coverArea = container.createDiv({ cls: 'picflow-field-wrapper' });
        coverArea.style.display = 'flex';
        coverArea.style.flexDirection = 'column';
        
        // Removed Label as requested
        // this.createLabel(coverArea, t('publish.drawer.cover', this.plugin.settings));
        
        // Fixed height for cover preview
        coverArea.style.height = '60px';
        
        // Get Metadata
        let coverUrl = '';
        if (file) {
            const metadata = FrontmatterParser.getMetadata(this.plugin.app, file) as any;
            coverUrl = metadata.cover || '';
        }

        // Cover Preview Box
        const coverBox = coverArea.createDiv({ cls: 'picflow-cover-box' });
        coverBox.style.width = '100%';
        coverBox.style.height = '100%';
        coverBox.style.borderRadius = '4px';
        coverBox.style.border = '1px dashed var(--background-modifier-border)';
        coverBox.style.display = 'flex';
        coverBox.style.alignItems = 'center';
        coverBox.style.justifyContent = 'center';
        coverBox.style.cursor = 'pointer';
        coverBox.style.overflow = 'hidden';

        if (coverUrl) {
            const img = coverBox.createEl('img');
            img.addClass('picflow-cover-image');
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            
            if (coverUrl.startsWith('data:')) {
                img.src = coverUrl;
            } else if (coverUrl.startsWith('/') || coverUrl.match(/^[a-zA-Z]:\\/)) {
                img.src = this.plugin.app.vault.adapter.getResourcePath(coverUrl);
            } else {
                img.src = coverUrl;
            }
        } else {
            const icon = coverBox.createDiv({ text: '+' });
            icon.style.fontSize = '20px';
            icon.style.color = 'var(--text-muted)';
        }

        coverBox.onclick = () => {
            new CoverInputModal(this.plugin.app, coverUrl, async (url) => {
                if (file) {
                    if (url === coverUrl) return;
                    await FrontmatterParser.updateMetadata(this.plugin.app, file, { cover: url } as any);
                    new Notice('Cover updated.');
                    this.render(); 
                }
            }).open();
        };
    }

    private async renderConfigurationArea(container: HTMLElement) {
        const platform = this.platforms.find(p => p.id === this.selectedPlatformId);
        if (!platform) return;

        const configArea = container.createDiv({ cls: 'publish-config-area' });
        // Remove grid layout from configArea to allow flexible rows
        configArea.style.display = 'flex';
        configArea.style.flexDirection = 'column';
        configArea.style.gap = '12px';

        // 1. Top Row: Cover (Optional) + Account Selector
        const topRow = configArea.createDiv({ cls: 'picflow-config-row' });
        topRow.style.display = 'flex';
        topRow.style.gap = '12px';
        topRow.style.alignItems = 'flex-start'; // Align top

        // Cover Image (If platform supports it)
        if (platform.showCover) {
            const coverWrapper = topRow.createDiv({ cls: 'picflow-cover-wrapper' });
            coverWrapper.style.width = '80px'; 
            
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
                    coverWrapper.style.width = '80px'; 
                    const file = this.plugin.app.workspace.getActiveFile();
                    this.renderCoverImageControl(coverWrapper, file);
                }
             }
        }

        // Account Selector (Takes remaining space in top row)
        const accountWrapper = topRow.createDiv({ cls: 'picflow-field-wrapper' });
        accountWrapper.style.flex = '1';
        accountWrapper.style.display = 'flex';
        accountWrapper.style.flexDirection = 'column';
        
        this.createLabel(accountWrapper, t('publish.drawer.account'));
        const accDropdown = new DropdownComponent(accountWrapper);
        accDropdown.selectEl.addClass('picflow-field-select');
        accDropdown.selectEl.style.width = '100%'; // Full width
        
        const accounts = this.plugin.accountManager.getAccounts(this.selectedPlatformId);
        if (accounts.length === 0) {
            accDropdown.addOption('', t('publish.drawer.noAccount'));
            accDropdown.setDisabled(true);
        } else {
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
                this.render(); 
            });
        }

        // Trigger initial update for custom platforms
        if (this.selectedPlatformId === 'custom' && this.selectedAccountId) {
            // Use setTimeout to avoid blocking render
            setTimeout(() => this.updateDynamicFields(), 0);
        }

        // 2. Middle Row: Theme (WeChat Only) + Dynamic Fields Grid
        if (this.selectedPlatformId === 'wechat') {
             // For WeChat, we want Theme and Category to be in the same grid
             // So we merge them into the dynamic fields area logic
        }

        // 3. Dynamic Fields & Theme
        const fieldsContainer = configArea.createDiv({ cls: 'picflow-fields-grid' });
        fieldsContainer.style.display = 'grid';
        fieldsContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(120px, 1fr))'; // Adjusted min-width
        fieldsContainer.style.gap = '12px';

        // A. Inject Theme Control for WeChat (as first item in grid)
        if (this.selectedPlatformId === 'wechat') {
            const themeWrapper = fieldsContainer.createDiv({ cls: 'picflow-field-wrapper' });
            themeWrapper.style.display = 'flex';
            themeWrapper.style.flexDirection = 'column';
            
            this.createLabel(themeWrapper, t('publish.drawer.theme'));
            
            const themeControls = themeWrapper.createDiv({ cls: 'picflow-theme-control-group' });
            themeControls.style.width = '100%';

            const themeDropdown = new DropdownComponent(themeControls);
            themeDropdown.selectEl.addClass('picflow-field-select'); // Use same class as other selects
            themeDropdown.selectEl.style.width = '100%';
            
            const populateThemes = () => {
                themeDropdown.selectEl.empty();
                const themes = this.themeManager.getAllThemes();
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
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            
            this.createLabel(wrapper, field.label);

            if (field.type === 'select') {
                const dropdown = new DropdownComponent(wrapper);
                dropdown.selectEl.addClass('picflow-field-select');
                dropdown.selectEl.style.width = '100%';
                
                field.options?.forEach(opt => dropdown.addOption(opt, opt));
                
                // Get value from frontmatter
                const file = this.plugin.app.workspace.getActiveFile();
                if (file) {
                    const meta = FrontmatterParser.getMetadata(this.plugin.app, file) as any;
                    if (meta[field.key]) dropdown.setValue(meta[field.key]);
                }

                dropdown.onChange(async val => {
                    if (file) {
                        await FrontmatterParser.updateMetadata(this.plugin.app, file, { [field.key]: val } as any);
                    }
                });
            } else if (field.type === 'text') {
                const text = new TextComponent(wrapper);
                text.inputEl.addClass('picflow-field-input');
                text.inputEl.style.width = '100%';
                if (field.placeholder) text.setPlaceholder(field.placeholder);

                const file = this.plugin.app.workspace.getActiveFile();
                if (file) {
                    const meta = FrontmatterParser.getMetadata(this.plugin.app, file) as any;
                    if (meta[field.key]) text.setValue(meta[field.key]);
                }

                text.onChange(async val => {
                    if (file) {
                        await FrontmatterParser.updateMetadata(this.plugin.app, file, { [field.key]: val } as any);
                    }
                });
            } else if (field.type === 'checkbox') {
                const toggle = new ToggleComponent(wrapper);
                const file = this.plugin.app.workspace.getActiveFile();
                if (file) {
                    const meta = FrontmatterParser.getMetadata(this.plugin.app, file) as any;
                    toggle.setValue(!!meta[field.key]);
                }
                toggle.onChange(async val => {
                    if (file) {
                        await FrontmatterParser.updateMetadata(this.plugin.app, file, { [field.key]: val } as any);
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
                tagsWrapper.style.display = 'flex';
                tagsWrapper.style.flexDirection = 'column';
                this.createLabel(tagsWrapper, 'Tags');
                const tagsText = new TextComponent(tagsWrapper);
                tagsText.inputEl.addClass('picflow-field-input');
                tagsText.inputEl.style.width = '100%';
                tagsText.setPlaceholder('Comma separated');
                
                if (file) {
                    const meta = FrontmatterParser.getMetadata(this.plugin.app, file) as any;
                    if (meta['tags']) {
                        const t = meta['tags'];
                        tagsText.setValue(Array.isArray(t) ? t.join(', ') : t);
                    }
                }
                tagsText.onChange(async val => {
                    if (file) {
                        // Split by comma and trim
                        const tagList = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        await FrontmatterParser.updateMetadata(this.plugin.app, file, { tags: tagList } as any);
                    }
                });

                // 3. Category Field (Dynamic or Text)
                const categories = this.categoryCache[this.selectedAccountId];
                const catWrapper = fieldsContainer.createDiv({ cls: 'picflow-field-wrapper' });
                catWrapper.style.display = 'flex';
                catWrapper.style.flexDirection = 'column';
                this.createLabel(catWrapper, 'Category');

                if (categories && categories.length > 0) {
                    // Dropdown
                    const dropdown = new DropdownComponent(catWrapper);
                    dropdown.selectEl.addClass('picflow-field-select');
                    dropdown.selectEl.style.width = '100%';
                    categories.forEach(c => dropdown.addOption(c, c));
                    
                    if (file) {
                        const meta = FrontmatterParser.getMetadata(this.plugin.app, file) as any;
                        const metaCats = meta['categories'];
                        if (Array.isArray(metaCats) && metaCats.length > 0) dropdown.setValue(metaCats[0]);
                        else if (typeof metaCats === 'string') dropdown.setValue(metaCats);
                    }
                    dropdown.onChange(async val => {
                        if (file) await FrontmatterParser.updateMetadata(this.plugin.app, file, { categories: [val] } as any);
                    });
                } else {
                    // Fallback Text Input
                    const catText = new TextComponent(catWrapper);
                    catText.inputEl.addClass('picflow-field-input');
                    catText.inputEl.style.width = '100%';
                    catText.setPlaceholder('Category name');
                    
                    if (file) {
                        const meta = FrontmatterParser.getMetadata(this.plugin.app, file) as any;
                        const metaCats = meta['categories'];
                        if (Array.isArray(metaCats) && metaCats.length > 0) catText.setValue(metaCats[0]);
                        else if (typeof metaCats === 'string') catText.setValue(metaCats);
                    }
                    catText.onChange(async val => {
                        if (file) await FrontmatterParser.updateMetadata(this.plugin.app, file, { categories: [val] } as any);
                    });
                }

                // 4. Publish Status (Draft vs Publish)
                const statusWrapper = fieldsContainer.createDiv({ cls: 'picflow-field-wrapper' });
                statusWrapper.style.display = 'flex';
                statusWrapper.style.flexDirection = 'column';
                this.createLabel(statusWrapper, 'Status');
                
                const statusDropdown = new DropdownComponent(statusWrapper);
                statusDropdown.selectEl.addClass('picflow-field-select');
                statusDropdown.selectEl.style.width = '100%';
                statusDropdown.addOption('draft', 'Draft (草稿)');
                statusDropdown.addOption('publish', 'Publish (直接发布)');
                
                // Initialize from state or frontmatter
                // If frontmatter has publish_mode: direct -> publish, else draft
                if (file) {
                    const meta = FrontmatterParser.getMetadata(this.plugin.app, file) as any;
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
                        } as any);
                    }
                });
            } else if (config && config.type === 'mcp') {
                // MCP Tools Selector
                const tools = this.toolCache[this.selectedAccountId];
                const toolWrapper = fieldsContainer.createDiv({ cls: 'picflow-field-wrapper' });
                toolWrapper.style.display = 'flex';
                toolWrapper.style.flexDirection = 'column';
                this.createLabel(toolWrapper, 'MCP Tool');

                const dropdown = new DropdownComponent(toolWrapper);
                dropdown.selectEl.addClass('picflow-field-select');
                dropdown.selectEl.style.width = '100%';
                
                // Add default "Auto" option
                dropdown.addOption('', 'Auto Detect');
                
                // Add fetched tools
                if (tools && tools.length > 0) {
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

                dropdown.onChange(async val => {
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
            .setButtonText(t('publish.drawer.publish'))
            .setCta()
            .onClick(async () => {
                if (!this.selectedAccountId) {
                    new Notice(t('publish.drawer.selectAccount'));
                    return;
                }
                if (this.selectedPlatformId) {
                    const file = this.plugin.app.workspace.getActiveFile();
                    if (!file) {
                        new Notice(t('publish.drawer.noFile'));
                        return;
                    }
                    publishBtn.setButtonText(t('publish.drawer.publishing'));
                    publishBtn.setDisabled(true);
                    try {
                        await this.plugin.publishManager.publish(
                            this.selectedPlatformId,
                            file,
                            this.selectedAccountId,
                            this.selectedPlatformId === 'wechat' ? this.currentTheme : 'Default'
                        );
                        // Notice is now handled inside PublishManager or Publisher to allow for error messages
                        // new Notice(t('publish.drawer.published'));
                    } catch (error: any) {
                        new Notice(`Publish Error: ${error.message}`);
                    } finally {
                        publishBtn.setButtonText(t('publish.drawer.publish'));
                        publishBtn.setDisabled(false);
                    }
                }
            });
        publishBtn.buttonEl.addClass('picflow-action-btn-publish');

        // Copy
        const copyBtn = new ButtonComponent(actionRow)
            .setButtonText(t('publish.drawer.copy'))
            .onClick(async () => {
                await this.handleCopy();
            });
        copyBtn.buttonEl.addClass('picflow-action-btn-copy');

        // Go to Platform
        const gotoBtn = new ButtonComponent(actionRow)
            .setButtonText(t('publish.drawer.goto'))
            .setTooltip(t('publish.drawer.goto'))
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
            .setTooltip(t('publish.drawer.refresh'))
            .onClick(async () => {
                // Refresh themes list if in WeChat mode
                if (this.selectedPlatformId === 'wechat') {
                    await this.themeManager.loadThemes();
                    this.render();
                    new Notice(t('publish.drawer.refresh'));
                } else {
                    this.refreshPreview();
                    new Notice(t('publish.drawer.refresh'));
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
        el.style.marginBottom = '4px'; 
    }

    private refreshPreview() {
        const mainArea = this.container.querySelector('.publish-main-area') as HTMLElement;
        if (mainArea) this.renderPreview(mainArea);
    }

    private async handleCopy() {
        const platform = this.platforms.find(p => p.id === this.selectedPlatformId);

        let file = this.plugin.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
            const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
            if (leaves.length > 0) {
                const view = leaves[0].view as MarkdownView;
                if (view.file) file = view.file;
            }
        }
        if (!file) {
            new Notice(t('publish.drawer.noFileCopy'));
            return;
        }
        const markdown = await this.plugin.app.vault.read(file);
        const contentBody = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');

        if (platform?.type === 'html') {
            const themeToUse = platform.id === 'wechat' ? this.currentTheme : 'Default';
            const fullHtml = await this.htmlRenderer.render(contentBody, themeToUse);

            let inlinedHtml = platform?.inlineStyle
                ? this.themeManager.inlineStyles(fullHtml, themeToUse)
                : fullHtml;

            const container = document.createElement('div');
            container.innerHTML = inlinedHtml;
            const styleTags = container.querySelectorAll('style');
            styleTags.forEach(tag => tag.remove());
            inlinedHtml = container.innerHTML;

            try {
                const blobHtml = new Blob([inlinedHtml], { type: 'text/html' });
                const blobText = new Blob([contentBody], { type: 'text/plain' });

                const data = [new ClipboardItem({
                    ['text/html']: blobHtml,
                    ['text/plain']: blobText
                })];
                await navigator.clipboard.write(data);
                new Notice(t('publish.drawer.richTextCopied'));
            } catch (err) {
                console.error('Clipboard API failed:', err);
                try {
                    const listener = (e: ClipboardEvent) => {
                        e.clipboardData?.setData('text/html', inlinedHtml);
                        e.clipboardData?.setData('text/plain', contentBody);
                        e.preventDefault();
                    };
                    document.addEventListener('copy', listener);
                    document.execCommand('copy');
                    document.removeEventListener('copy', listener);
                    new Notice(t('publish.drawer.richTextCopied'));
                } catch (e2) {
                    new Notice(t('publish.drawer.copied'));
                }
            }
        } else {
            navigator.clipboard.writeText(markdown);
            new Notice(t('publish.drawer.markdownCopied'));
        }
    }
}
