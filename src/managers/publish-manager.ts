
import { App, Notice, TFile } from 'obsidian';
import PicFlowPlugin from '../../main';
import { ThemeManager } from './theme-manager';
import { IPlatformPublisher } from '../interfaces';
import { StubPublisher } from '../publishers/stub-publisher';
import { FrontmatterParser } from '../utils/frontmatter-parser';
import { BatchUploadManager } from './batch-upload-manager';

export class PublishManager {
    plugin: PicFlowPlugin;
    app: App;

    // Registry of publishers
    private publishers: Map<string, IPlatformPublisher> = new Map();
    public themeManager: ThemeManager; // Make public to be accessible by Publishers
    public htmlRenderer: unknown; // Add renderer property

    constructor(plugin: PicFlowPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;

        // Initialize ThemeManager needed for formatting publications
        this.themeManager = new ThemeManager(plugin);
        this.themeManager.loadThemes().catch(e => console.error("Failed to load themes:", e));
        
        // Expose htmlRenderer via a simple proxy or direct access if ThemeManager has it
    // Ideally we should use a proper HtmlRenderer class, but for now we reuse ThemeManager's capability
    this.htmlRenderer = {
        render: async (markdown: string, themeName: string) => {
            return await this.themeManager.render(markdown, themeName);
        }
    };

        // Initialize and register adapters
        // We cannot load Pro modules synchronously here because import() is async.
        // We will call init() from main.ts
    }

    async init() {
        await this.loadPublishers();
    }

    // ... (rest of the file)

    /**
     * Process content for publishing:
     * 1. Extract Frontmatter
     * 2. Process Local Images (Upload if needed)
     * 3. Return clean Markdown and Metadata
     */
    async processContent(file: TFile, options: { skipUpload?: boolean } = {}): Promise<{ title: string, markdown: string, frontmatter: unknown, images: string[] }> {
        // 1. Get Metadata
        const frontmatter = FrontmatterParser.getMetadata(this.app, file);
        const title = frontmatter.title || file.basename;

        // 2. Read File
        let markdown = await this.app.vault.read(file);
        
        // Strip Frontmatter
        markdown = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');

        // 3. Process Local Images (Upload to default uploader)
        // We can reuse BatchUploadManager logic or BasePublisher logic.
        // BasePublisher has `processLocalImages` but it's protected and coupled.
        // Let's use BatchUploadManager which is designed for this.
        
        const batchUploader = new BatchUploadManager(this.plugin);
        // We need a way to process images and REPLACE links in markdown.
        // BatchUploadManager.uploadImages just uploads.
        // We need the replacement logic.
        
        // Let's implement a simple replacement here reusing regex from BasePublisher
        // Or better, let's create a shared helper. 
        // For now, to fix the error quickly, I'll inline the logic similar to BasePublisher.
        
        const images: string[] = [];
        
        // Regex for Markdown images: ![alt](path)
        const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        // Regex for Wiki images: ![[path]]
        const wikiImageRegex = /!\[\[([^\]]+)\]\]/g;

        const replacements: { original: string, newLink: string }[] = [];

        // Helper to upload
        const uploadImage = async (imagePath: string): Promise<string | null> => {
            // If skipUpload is true, we just return the path (or normalized path)
            // But we need to make sure we return something useful for the caller.
            // If skipUpload, we don't change the markdown link here, 
            // but we might want to collect the image path.
            if (options.skipUpload) {
                // Return null to indicate "no replacement needed" or "no url generated"
                // But we should probably add to images list?
                // For now, just return null so no replacement happens in this loop.
                // The caller (MCPPublisher) will parse markdown again to find local paths.
                return null;
            }

            try {
                // Resolve file
                const imageFile = this.app.metadataCache.getFirstLinkpathDest(imagePath, file.path);
                if (!imageFile) return null; // Remote url or not found

                // Upload
                if (this.plugin.batchUploadManager) {
                     const result = await this.plugin.batchUploadManager.uploadFiles([imageFile]);
                     if (result && result.length > 0 && result[0].success) {
                        images.push(result[0].url);
                        return result[0].url;
                    }
                } else if (batchUploader) {
                     // Fallback to local instance
                     const result = await batchUploader.uploadFiles([imageFile]);
                     if (result && result.length > 0 && result[0].success) {
                        images.push(result[0].url);
                        return result[0].url;
                    }
                }
            } catch (e) {
                console.error("Failed to upload image:", imagePath, e);
            }
            return null;
        };

        // Find and replace MD images
        let match;
        while ((match = mdImageRegex.exec(markdown)) !== null) {
            const original = match[0];
            const alt = match[1];
            const path = match[2];
            
            if (path.startsWith('http')) continue; // Skip remote

            const url = await uploadImage(path);
            if (url) {
                replacements.push({
                    original: original,
                    newLink: `![${alt}](${url})`
                });
            }
        }

        // Find and replace Wiki images
        while ((match = wikiImageRegex.exec(markdown)) !== null) {
            const original = match[0];
            const path = match[1]; // might include |alt
            
            const parts = path.split('|');
            const cleanPath = parts[0];
            const alt = parts.length > 1 ? parts.slice(1).join('|') : '';

            const url = await uploadImage(cleanPath);
            if (url) {
                replacements.push({
                    original: original,
                    newLink: `![${alt}](${url})`
                });
            }
        }

        // Apply replacements
        for (const rep of replacements) {
            markdown = markdown.split(rep.original).join(rep.newLink);
        }

        return {
            title,
            markdown,
            frontmatter,
            images
        };
    }

    private async loadPublishers() {
        if (process.env.BUILD_TYPE === 'PRO') {
            try {
                // Use import() to load Pro modules dynamically
                // Note: These paths must exist in the PRO build
                const { WeChatPublisher } = await import('../core/publishers/wechat-publisher');
                this.registerPublisher('wechat', new WeChatPublisher(this.plugin, this.themeManager));

                const { ZhihuPublisher } = await import('../core/publishers/zhihu-publisher');
                this.registerPublisher('zhihu', new ZhihuPublisher(this.plugin, this.themeManager));

                const { CSDNPublisher } = await import('../core/publishers/csdn-publisher');
                this.registerPublisher('csdn', new CSDNPublisher(this.plugin, this.themeManager));

                const { JuejinPublisher } = await import('../core/publishers/juejin-publisher');
                this.registerPublisher('juejin', new JuejinPublisher(this.plugin, this.themeManager));

                const { WeiboPublisher } = await import('../core/publishers/weibo-publisher');
                this.registerPublisher('weibo', new WeiboPublisher(this.plugin, this.themeManager));

                const { BilibiliPublisher } = await import('../core/publishers/bilibili-publisher');
                this.registerPublisher('bilibili', new BilibiliPublisher(this.plugin, this.themeManager));
                
                // [NEW] Load Custom Platforms
                await this.loadCustomPublishers();

            } catch (e) {
                console.error("Failed to load Pro publishers:", e);
                // Fallback to stub if pro loading fails
                this.loadStubPublishers();
            }
        } else {
            this.loadStubPublishers();
        }
    }

    private async loadCustomPublishers() {
        const customPlatforms = this.plugin.settings.customPlatforms || [];
        if (customPlatforms.length === 0) return;

        try {
            // Dynamically require Custom Publishers
            // These files must exist in src/core/publishers/
            const { WordPressPublisher } = await import('../core/publishers/wordpress-publisher');
            const { DifyPublisher } = await import('../core/publishers/dify-publisher');
            const { WebhookPublisher } = await import('../core/publishers/webhook-publisher');
            const { MCPPublisher } = await import('../core/publishers/mcp-publisher');

            customPlatforms.forEach(platform => {
                let publisher: IPlatformPublisher | null = null;
                
                if (platform.type === 'wordpress' && platform.wordpress && WordPressPublisher) {
                    publisher = new WordPressPublisher(this.plugin, platform.wordpress);
                } else if (platform.type === 'dify' && platform.dify && DifyPublisher) {
                    publisher = new DifyPublisher(this.plugin, platform.dify);
                } else if (platform.type === 'webhook' && platform.webhook && WebhookPublisher) {
                    publisher = new WebhookPublisher(this.plugin, platform.webhook);
                } else if (platform.type === 'mcp' && platform.mcp && MCPPublisher) {
                    publisher = new MCPPublisher(this.plugin, platform.mcp, this.themeManager);
                }

                if (publisher) {
                    this.registerPublisher(platform.id, publisher);
                }
            });
        } catch (e) {
            console.error("Failed to load Custom Publishers:", e);
        }
    }

    private loadStubPublishers() {
        this.registerPublisher('wechat', new StubPublisher(this.plugin, 'WeChat'));
        this.registerPublisher('zhihu', new StubPublisher(this.plugin, 'Zhihu'));
        this.registerPublisher('csdn', new StubPublisher(this.plugin, 'CSDN'));
        this.registerPublisher('juejin', new StubPublisher(this.plugin, 'Juejin'));
        this.registerPublisher('weibo', new StubPublisher(this.plugin, 'Weibo'));
        this.registerPublisher('bilibili', new StubPublisher(this.plugin, 'Bilibili'));
    }

    private registerPublisher(id: string, publisher: IPlatformPublisher) {
        this.publishers.set(id, publisher);
    }

    /**
     * Unified interface to publish content to any registered platform.
     */
    async publish(platformId: string, file: TFile, accountId: string, themeName: string = 'Default'): Promise<void> {
        if (!accountId) {
            new Notice('Please select an account first');
            return;
        }

        // --- License Check ---
        const licenseKey = this.plugin.settings.licenseKey;
        
        // Handle Custom Platform Logic
        // If platformId is 'custom', we need to find the REAL publisher ID from the accountId.
        // In loadCustomPublishers(), we registered publishers using their UUID (which is the accountId).
        
        let targetPublisherId = platformId;
        if (platformId === 'custom') {
            targetPublisherId = accountId; // The accountId IS the publisher ID for custom platforms
        }

        const publisher = this.publishers.get(targetPublisherId);
        
        if (publisher instanceof StubPublisher) {
            await publisher.publish(file, accountId, themeName);
            return;
        }

        if (!licenseKey) {
            new Notice("Please activate license first to use cloud publishing.");
            // Open Settings Tab to Status Tab
            if (this.app.setting) {
                this.app.setting.open();
                const settingTab = this.plugin.app.setting.pluginTabs.find(t => t.id === this.plugin.manifest.id);
                if (settingTab) {
                    settingTab.currentTab = 'Status';
                    settingTab.display();
                }
                this.app.setting.openTabById(this.plugin.manifest.id);
            }
            return; 
        }
        // ---------------------

        if (publisher) {
            await publisher.publish(file, accountId, themeName);
        } else {
            // If we couldn't find the publisher, maybe it's because custom platforms weren't reloaded?
            // Try reloading custom publishers once just in case
            if (platformId === 'custom') {
                void this.loadCustomPublishers();
                const retryPublisher = this.publishers.get(targetPublisherId);
                if (retryPublisher) {
                    await retryPublisher.publish(file, accountId, themeName);
                    return;
                }
            }
            new Notice(`Publishing to ${platformId} is coming soon!`);
        }
    }
}
