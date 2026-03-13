import { App, Notice, Plugin, PluginSettingTab, Setting, MarkdownView, Editor, EditorPosition, TFile, moment } from 'obsidian';
import { PicFlowSettings, DEFAULT_SETTINGS, PicFlowSettingTab } from './src/settings';
import { S3Uploader } from './src/uploaders/s3';
import { GitHubUploader } from './src/uploaders/github';
import { WebDAVUploader } from './src/uploaders/webdav';
import { SFTPUploader } from './src/uploaders/sftp';
import { SecurityManager } from './src/utils/security';
import { ImageProcessor } from './src/utils/image-processor';
// import { AIService } from './src/core/ai/service'; // Removed for conditional loading
// import { PromptModal, ImageGenerationOptions } from './src/ai/ui'; // Removed missing file import
import { PicFlowSidebarView, VIEW_TYPE_PICFLOW_SIDEBAR } from './src/ui/sidebar';
import { t } from './src/i18n';
import * as crypto from 'crypto';

import { BatchUploadModal } from './src/modals/batch-upload-modal';
import { BatchUploadManager } from './src/managers/batch-upload-manager';
// import { MigrationManager } from './src/core/managers/migration-manager'; // Removed for conditional loading
import { AccountManager } from './src/managers/account-manager';
import { UploadHandler } from './src/managers/upload-handler';
import { EventHandler } from './src/managers/event-handler';
import { PublishManager } from './src/managers/publish-manager';
import { ThemeManager } from './src/managers/theme-manager';
// import { ThemeExtractorManager } from './src/core/managers/theme-extractor-manager'; // Removed for conditional loading
import { TemplateSuggestModal } from './src/ai/modals/template-suggest-modal';

import { IMigrationManager, IThemeExtractorManager, IAIManager } from './src/interfaces';
import { StubAIManager } from './src/managers/stub-ai-manager';
import { StubMigrationManager } from './src/managers/stub-migration-manager';
import { PlatformRegistry } from './src/platforms';

// 3. 主插件类
export default class PicFlowPlugin extends Plugin {
    settings: PicFlowSettings;
    batchUploadManager: BatchUploadManager;
    migrationManager: IMigrationManager;
    accountManager: AccountManager;
    publishManager: PublishManager;
    themeManager: ThemeManager;
    themeExtractorManager: IThemeExtractorManager | null;
    aiManager: IAIManager;

    uploadHandler: UploadHandler;
    eventHandler: EventHandler;

    async onload() {
        await this.loadSettings();

        this.batchUploadManager = new BatchUploadManager(this);
        // this.migrationManager = new MigrationManager(this); // Conditional load below
        this.accountManager = new AccountManager(this);
        await this.accountManager.load();

        this.publishManager = new PublishManager(this);
        
        this.themeManager = new ThemeManager(this);
        await this.themeManager.loadThemes();

        // this.themeExtractorManager = new ThemeExtractorManager(this); // Conditional load below

        this.uploadHandler = new UploadHandler(this);
        this.eventHandler = new EventHandler(this, this.uploadHandler);

        // Default to Stub
        this.aiManager = new StubAIManager(this);

        // Conditional Load Pro Modules
        // @ts-ignore
        if (process.env.BUILD_TYPE === 'PRO') {
            try {
                // Use require to load Pro modules
                const { MigrationManager } = require('./src/core/managers/migration-manager');
                this.migrationManager = new MigrationManager(this);

                const { ThemeExtractorManager } = require('./src/core/managers/theme-extractor-manager');
                this.themeExtractorManager = new ThemeExtractorManager(this);
                
                const { AIManager } = require('./src/core/managers/ai-manager');
                this.aiManager = new AIManager(this);

                // Load Core Platforms
                const { registerCorePlatforms } = require('./src/core/platforms/definitions');
                registerCorePlatforms(PlatformRegistry);

                // console.log("PicFlow Pro modules loaded.");
            } catch (e) {
                console.error("Failed to load Pro modules:", e);
                this.migrationManager = new StubMigrationManager(this);
                // Don't set themeExtractorManager to null immediately, check if it was partially loaded or use Stub
                // this.themeExtractorManager = null; 
                // aiManager remains Stub
            }
        } else {
            this.migrationManager = new StubMigrationManager(this);
            // Initialize Stub for ThemeExtractor if not in PRO or load failed
            if (!this.themeExtractorManager) {
                // TODO: Implement StubThemeExtractorManager if needed, or handle null in UI
                 this.themeExtractorManager = null;
            }
        }

        // Register File Creation Event for Default Front-matter
        this.registerEvent(
            this.app.vault.on('create', async (file) => {
                // 1. Check if enabled
                if (!this.settings.enableDefaultFrontmatter) return;
                
                // 2. Check if Markdown file
                if (!(file instanceof TFile) || file.extension !== 'md') return;

                // 3. Check if file is empty (prevent overwriting templates from other plugins)
                const content = await this.app.vault.read(file);
                if (content.trim().length > 0) return;

                // 4. Generate Front-matter
                let template = this.settings.defaultFrontmatterTemplate;
                
                // Variable replacement
                template = template.replace(/{{title}}/g, file.basename);
                template = template.replace(/{{date}}/g, (window as any).moment().format('YYYY-MM-DD HH:mm'));
                template = template.replace(/{{time}}/g, (window as any).moment().format('HH:mm:ss'));

                // 5. Write to file
                const newContent = `---\n${template}\n---\n`;
                await this.app.vault.modify(file, newContent);
            })
        );

        // console.log('PicFlow: Loading plugin...');

        // Register View
        this.registerView(
            VIEW_TYPE_PICFLOW_SIDEBAR,
            (leaf) => new PicFlowSidebarView(leaf, this)
        );

        // Add Ribbon Icon
        this.addRibbonIcon('zap', 'PicFlow Unified Sidebar', () => {
            this.activateSidebarView();
        });

        // Add Command to Open Sidebar
        this.addCommand({
            id: 'open-picflow-sidebar',
            name: 'Open PicFlow Sidebar',
            callback: () => {
                this.activateSidebarView();
            }
        });

        // 注册命令：批量上传当前文档图片 (MVP)
        this.addCommand({
            id: 'picflow-upload-current',
            name: t('command.uploadAll', this.settings),
            callback: () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) {
                    new Notice('No active Markdown file. Please open a file first.');
                    return;
                }
                this.openBatchUploadModal(view);
            }
        });

        // Register Command: AI Quick Action
        this.addCommand({
            id: 'picflow-ai-quick-action',
            name: t('command.aiQuickAction'),
            editorCallback: (editor: Editor, view: MarkdownView) => {
                new TemplateSuggestModal(this.app, this, editor).open();
            }
        });

        // 注册设置面板
        this.addSettingTab(new PicFlowSettingTab(this.app, this));

        // Register Paste Event
        this.registerEvent(
            this.app.workspace.on('editor-paste', this.eventHandler.handlePaste.bind(this.eventHandler))
        );

        // Register Drop Event
        this.registerEvent(
            this.app.workspace.on('editor-drop', this.eventHandler.handleDrop.bind(this.eventHandler))
        );
    }

    async onunload() {

    }

    async activateSidebarView() {
        const { workspace } = this.app;

        let leaf: any = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_PICFLOW_SIDEBAR);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: VIEW_TYPE_PICFLOW_SIDEBAR, active: true });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    openBatchUploadModal(view: MarkdownView | null) {
        if (!view) return;
        new BatchUploadModal(this.app, this, this.batchUploadManager, view).open();
    }

    refreshAllViews() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PICFLOW_SIDEBAR).forEach(leaf => {
            if (leaf.view instanceof PicFlowSidebarView) {
                leaf.view.render();
            }
        });
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

        // Decrypt sensitive fields
        if (this.settings.s3SecretAccessKey) {
            this.settings.s3SecretAccessKey = SecurityManager.decrypt(this.settings.s3SecretAccessKey);
        }
        if (this.settings.s3AccessKeyId) {
            this.settings.s3AccessKeyId = SecurityManager.decrypt(this.settings.s3AccessKeyId);
        }
        if (this.settings.aiApiKey) {
            this.settings.aiApiKey = SecurityManager.decrypt(this.settings.aiApiKey);
        }
        if (this.settings.githubToken) {
            this.settings.githubToken = SecurityManager.decrypt(this.settings.githubToken);
        }
        if (this.settings.licenseKey) {
            this.settings.licenseKey = SecurityManager.decrypt(this.settings.licenseKey);
        }

        // --- Phase 7 Migration: Convert flat settings to profiles ---
        // Check if profiles array is empty (meaning either fresh install or pre-migration data.json loaded)
        // We should only migrate if we have legacy data (e.g. s3Endpoint or githubToken) AND profiles are empty.
        // If both are empty, it's a fresh install, we should still initialize default profiles.
        if (!this.settings.profiles || this.settings.profiles.length === 0) {
            // console.log("Initializing profiles (Fresh Install)...");
            this.settings.profiles = [];

            // 1. Create Default S3 Profile (Empty)
            const s3Profile = {
                id: crypto.randomUUID(),
                name: 'S3 (Default)',
                type: 's3' as const,
                s3: {
                    endpoint: '',
                    region: 'auto',
                    bucket: '',
                    accessKeyId: '',
                    secretAccessKey: '',
                    pathPrefix: '',
                    customDomain: '',
                    forcePathStyle: true,
                    useSSL: true,
                    bypassCertificateValidation: false,
                    uploadStrategy: 'rename' as 'rename'
                }
            };
            this.settings.profiles.push(s3Profile);
            
            this.settings.selectedProfileId = s3Profile.id;

            // Save immediately to persist initialization
            await this.saveSettings();
        }

        // Decrypt Profiles Sensitive Data
        for (const profile of this.settings.profiles) {
            if (profile.type === 's3' && profile.s3) {
                if (profile.s3.secretAccessKey) profile.s3.secretAccessKey = SecurityManager.decrypt(profile.s3.secretAccessKey);
                if (profile.s3.accessKeyId) profile.s3.accessKeyId = SecurityManager.decrypt(profile.s3.accessKeyId);
            }
            if (profile.type === 'github' && profile.github) {
                if (profile.github.token) profile.github.token = SecurityManager.decrypt(profile.github.token);
            }
            if (profile.type === 'webdav' && profile.webdav) {
                if (profile.webdav.password) profile.webdav.password = SecurityManager.decrypt(profile.webdav.password);
            }
            if (profile.type === 'sftp' && profile.sftp) {
                if (profile.sftp.password) profile.sftp.password = SecurityManager.decrypt(profile.sftp.password);
                if (profile.sftp.privateKey) profile.sftp.privateKey = SecurityManager.decrypt(profile.sftp.privateKey);
            }
        }
    }

    async saveSettings() {
        // Create a copy to encrypt
        const dataToSave = JSON.parse(JSON.stringify(this.settings)); // Deep copy

        // Encrypt sensitive fields (Legacy) - Can be removed later if we fully drop legacy support
        if (dataToSave.s3SecretAccessKey) dataToSave.s3SecretAccessKey = SecurityManager.encrypt(dataToSave.s3SecretAccessKey);
        if (dataToSave.s3AccessKeyId) dataToSave.s3AccessKeyId = SecurityManager.encrypt(dataToSave.s3AccessKeyId);
        if (dataToSave.aiApiKey) dataToSave.aiApiKey = SecurityManager.encrypt(dataToSave.aiApiKey);
        if (dataToSave.githubToken) dataToSave.githubToken = SecurityManager.encrypt(dataToSave.githubToken);
        if (dataToSave.licenseKey) dataToSave.licenseKey = SecurityManager.encrypt(dataToSave.licenseKey);

        // Encrypt Profiles Sensitive Data
        if (dataToSave.profiles) {
            for (const profile of dataToSave.profiles) {
                if (profile.type === 's3' && profile.s3) {
                    if (profile.s3.secretAccessKey) profile.s3.secretAccessKey = SecurityManager.encrypt(profile.s3.secretAccessKey);
                    if (profile.s3.accessKeyId) profile.s3.accessKeyId = SecurityManager.encrypt(profile.s3.accessKeyId);
                }
                if (profile.type === 'github' && profile.github) {
                    if (profile.github.token) profile.github.token = SecurityManager.encrypt(profile.github.token);
                }
                if (profile.type === 'webdav' && profile.webdav) {
                    if (profile.webdav.password) profile.webdav.password = SecurityManager.encrypt(profile.webdav.password);
                }
                if (profile.type === 'sftp' && profile.sftp) {
                    if (profile.sftp.password) profile.sftp.password = SecurityManager.encrypt(profile.sftp.password);
                    if (profile.sftp.privateKey) profile.sftp.privateKey = SecurityManager.encrypt(profile.sftp.privateKey);
                }
            }
        }

        await this.saveData(dataToSave);
    }


    // Public exposure for other decoupled modules to reuse. 
    // Example: ai-drawer and clip-drawer uses plugin.uploadImage() directly.
    public async uploadImage(file: File, view: MarkdownView) {
        return this.uploadHandler.uploadImage(file, view);
    }

    public async uploadFileOnly(file: File, sourceFile: TFile | null = null): Promise<string> {
        return this.uploadHandler.uploadFileOnly(file, sourceFile);
    }
}


