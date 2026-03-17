import { ItemView, WorkspaceLeaf } from "obsidian";
import PicFlowPlugin from "../../main";
import { t } from "../i18n";
import { ThemeManager } from "../managers/theme-manager";
import { IHtmlRenderer } from "../interfaces";
import { StubHtmlRenderer } from "../publishers/stub-renderer";
import { PublishDrawer } from "./drawers/publish-drawer";
import { ClipDrawer } from "./drawers/clip-drawer";
import { AIDrawer } from "./drawers/ai-drawer";

export const VIEW_TYPE_PICFLOW_SIDEBAR = "picflow-unified-sidebar";

export class PicFlowSidebarView extends ItemView {
    plugin: PicFlowPlugin;
    activeTab: 'clip' | 'ai' | 'publish' = 'clip';

    // Services
    themeManager: ThemeManager;
    htmlRenderer: IHtmlRenderer;

    // Drawers
    publishDrawer: PublishDrawer;
    clipDrawer: ClipDrawer;
    aiDrawer: AIDrawer;

    constructor(leaf: WorkspaceLeaf, plugin: PicFlowPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.themeManager = new ThemeManager(plugin);
        
        // Initialize with Stub first
        this.htmlRenderer = new StubHtmlRenderer(plugin.app);
        
        // Dynamic loading of HtmlRenderer
        this.loadHtmlRenderer();

        // Drawer initialization requires their parent containers
        // Create an empty container div as placeholder until render() is called
        const dummyContainer = document.createElement("div");
        this.publishDrawer = new PublishDrawer(plugin, dummyContainer, this.themeManager, this.htmlRenderer);
        this.clipDrawer = new ClipDrawer(plugin, dummyContainer, this);
        this.aiDrawer = new AIDrawer(plugin, this, dummyContainer);
    }

    async loadHtmlRenderer() {
        // @ts-ignore
        if (process.env.BUILD_TYPE === 'PRO') {
            try {
                const { HtmlRenderer } = await import('../core/publishers/renderer');
                this.htmlRenderer = new HtmlRenderer(this.plugin.app, this.themeManager);
                // Update reference in publishDrawer
                if (this.publishDrawer) {
                    this.publishDrawer.htmlRenderer = this.htmlRenderer;
                }
            } catch (e) {
                console.error("Failed to load HtmlRenderer:", e);
                // Keep Stub
            }
        }
    }

    getViewType() {
        return VIEW_TYPE_PICFLOW_SIDEBAR;
    }

    getDisplayText() {
        return "PicFlow";
    }

    getIcon() {
        return "zap";
    }

    async onOpen() {
        await this.themeManager.loadThemes();
        this.render();
    }

    // Public method to switch tab
    async switchToTab(tabId: 'clip' | 'ai' | 'publish') {
        this.activeTab = tabId;
        this.render();
    }

    render() {
        const container = this.contentEl;
        container.empty();
        container.addClass("picflow-sidebar-view");

        // --- Tab Bar ---
        const tabBar = container.createDiv({ cls: "picflow-tab-bar" });

        const tabs = [
            { id: 'clip', label: t('sidebar.tab.clip', this.plugin.settings) },
            { id: 'ai', label: t('sidebar.tab.ai', this.plugin.settings) },
            { id: 'publish', label: t('sidebar.tab.publish', this.plugin.settings) }
        ];

        tabs.forEach(tab => {
            const btn = tabBar.createEl("div", {
                text: tab.label,
                cls: `picflow-tab-btn ${this.activeTab === tab.id ? 'active' : ''}`
            });

            btn.onclick = () => {
                this.activeTab = tab.id as any;
                this.render();
            };
        });

        // --- Content Area ---
        const content = container.createDiv({ cls: "picflow-tab-content" });

        const tabContainer = content.createDiv({ cls: "picflow-tab-container" });

        if (this.activeTab === 'clip') {
            this.clipDrawer.container = tabContainer;
            this.clipDrawer.render();
        } else if (this.activeTab === 'ai') {
            this.aiDrawer.container = tabContainer;
            this.aiDrawer.render();
        } else if (this.activeTab === 'publish') {
            this.publishDrawer.container = tabContainer;
            this.publishDrawer.render();
        }
    }
}
