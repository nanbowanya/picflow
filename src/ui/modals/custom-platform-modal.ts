
import { App, Modal, Setting, Notice } from 'obsidian';
// @ts-ignore
import PicFlowPlugin from '../../main';
import { CustomPlatformConfig, CustomPlatformType } from '../../settings';
import * as crypto from 'crypto';
import { t } from '../../i18n';

export class CustomPlatformModal extends Modal {
    plugin: PicFlowPlugin;
    onSubmit: (config: CustomPlatformConfig) => void;
    
    // State
    config: Partial<CustomPlatformConfig> = {
        id: '',
        name: '',
        type: 'wordpress', // Default
    };

    constructor(app: App, plugin: PicFlowPlugin, onSubmit: (config: CustomPlatformConfig) => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('picflow-modal');

        // [NEW] Check Pro License
        if (!this.plugin.settings.licenseKey || this.plugin.settings.licenseStatus !== 'valid') {
            contentEl.createEl('h2', { text: t('settings.pro.label', this.plugin.settings) });
            
            const noticeEl = contentEl.createDiv({ cls: 'picflow-warning-notice' });
            noticeEl.style.padding = '20px';
            noticeEl.style.textAlign = 'center';
            noticeEl.style.display = 'flex';
            noticeEl.style.flexDirection = 'column';
            noticeEl.style.alignItems = 'center';
            noticeEl.style.gap = '15px';

            noticeEl.createEl('p', { text: t('settings.pro.desc', this.plugin.settings) });

            const btnContainer = noticeEl.createDiv();
            const activateBtn = btnContainer.createEl('button', { text: t('settings.pro.btn.activate', this.plugin.settings), cls: 'mod-cta' });
            activateBtn.onclick = () => {
                this.close();
                // Redirect to Status Tab
                // @ts-ignore
                const settingTab = this.plugin.app.setting.settingTabs.find(tab => tab.id === this.plugin.manifest.id);
                if (settingTab && typeof settingTab.switchToTab === 'function') {
                    // @ts-ignore
                    this.plugin.app.setting.openTabById(this.plugin.manifest.id);
                    settingTab.switchToTab('Status');
                }
            };
            
            return;
        }

        contentEl.createEl('h2', { text: t('settings.customPlatform.modal.title', this.plugin.settings) });

        // Name
        new Setting(contentEl)
            .setName(t('settings.customPlatform.modal.name', this.plugin.settings))
            .setDesc(t('settings.customPlatform.modal.name.desc', this.plugin.settings))
            .addText(text => text
                .setPlaceholder('My Blog')
                .setValue(this.config.name || '')
                .onChange(value => {
                    this.config.name = value;
                }));

        // Type Selector
        new Setting(contentEl)
            .setName(t('settings.customPlatform.modal.type', this.plugin.settings))
            .setDesc(t('settings.customPlatform.modal.type.desc', this.plugin.settings))
            .addDropdown(dropdown => dropdown
                .addOption('wordpress', 'WordPress / Typecho (MetaWeblog/XML-RPC)')
                .addOption('dify', 'Dify (AI Knowledge Base / Workflow)')
                .addOption('webhook', 'Custom Webhook (HTTP Request)')
                .addOption('mcp', 'MCP Server (Model Context Protocol)')
                .setValue(this.config.type || 'wordpress')
                .onChange((value: string) => {
                    this.config.type = value as CustomPlatformType;
                    this.renderDynamicFields(dynamicContainer);
                }));

        // Dynamic Fields Container
        const dynamicContainer = contentEl.createDiv({ cls: 'picflow-custom-platform-fields' });
        this.renderDynamicFields(dynamicContainer);

        // Actions
        const actions = contentEl.createDiv({ cls: 'modal-button-container' });
        
        const submitBtn = actions.createEl('button', { text: t('settings.customPlatform.add', this.plugin.settings), cls: 'mod-cta' });
        submitBtn.onclick = () => {
            if (!this.config.name) {
                new Notice('Please enter a name');
                return;
            }
            if (!this.validateConfig()) {
                return;
            }

            if (!this.config.id) {
                 this.config.id = crypto.randomUUID();
            }
            this.onSubmit(this.config as CustomPlatformConfig);
            this.close();
        };

        const cancelBtn = actions.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    validateConfig(): boolean {
        if (this.config.type === 'wordpress') {
            if (!this.config.wordpress?.endpoint || !this.config.wordpress?.username || !this.config.wordpress?.password) {
                new Notice('Please fill in all WordPress fields');
                return false;
            }
        } else if (this.config.type === 'dify') {
            if (!this.config.dify?.apiKey) {
                new Notice('Please enter Dify API Key');
                return false;
            }
        } else if (this.config.type === 'webhook') {
            if (!this.config.webhook?.url) {
                new Notice('Please enter Webhook URL');
                return false;
            }
        } else if (this.config.type === 'mcp') {
            if (!this.config.mcp?.endpoint) {
                new Notice('Please enter MCP Endpoint URL');
                return false;
            }
        }
        return true;
    }

    renderDynamicFields(container: HTMLElement) {
        container.empty();
        
        if (this.config.type === 'wordpress') {
            this.config.wordpress = this.config.wordpress || { endpoint: '', username: '', password: '' };
            
            container.createEl('h3', { text: 'WordPress Configuration' });
            
            new Setting(container)
                .setName(t('settings.customPlatform.wp.endpoint', this.plugin.settings))
                .setDesc(t('settings.customPlatform.wp.endpoint.desc', this.plugin.settings))
                .addText(text => text
                    .setPlaceholder('https://example.com/xmlrpc.php')
                    .setValue(this.config.wordpress!.endpoint)
                    .onChange(value => this.config.wordpress!.endpoint = value));

            new Setting(container)
                .setName(t('settings.customPlatform.wp.username', this.plugin.settings))
                .addText(text => text
                    .setPlaceholder('admin')
                    .setValue(this.config.wordpress!.username)
                    .onChange(value => this.config.wordpress!.username = value));

            new Setting(container)
                .setName(t('settings.customPlatform.wp.password', this.plugin.settings))
                .setDesc(t('settings.customPlatform.wp.password.desc', this.plugin.settings))
                .addText(text => text
                    .setPlaceholder('********')
                    .setValue(this.config.wordpress!.password)
                    .onChange(value => this.config.wordpress!.password = value));

        } else if (this.config.type === 'dify') {
            this.config.dify = this.config.dify || { apiKey: '', mode: 'knowledge' };
            
            container.createEl('h3', { text: 'Dify Configuration' });

            new Setting(container)
                .setName(t('settings.customPlatform.dify.apiKey', this.plugin.settings))
                .addText(text => text
                    .setPlaceholder('sk-...')
                    .setValue(this.config.dify!.apiKey)
                    .onChange(value => this.config.dify!.apiKey = value));

            new Setting(container)
                .setName(t('settings.customPlatform.dify.mode', this.plugin.settings))
                .addDropdown(dropdown => dropdown
                    .addOption('knowledge', t('settings.customPlatform.dify.mode.knowledge', this.plugin.settings))
                    .addOption('workflow', t('settings.customPlatform.dify.mode.workflow', this.plugin.settings))
                    .setValue(this.config.dify!.mode)
                    .onChange((value: string) => {
                        this.config.dify!.mode = value as 'knowledge' | 'workflow';
                        this.renderDynamicFields(container); // Re-render for mode specific fields
                    }));

            if (this.config.dify.mode === 'knowledge') {
                new Setting(container)
                    .setName(t('settings.customPlatform.dify.datasetId', this.plugin.settings))
                    .setDesc(t('settings.customPlatform.dify.datasetId.desc', this.plugin.settings))
                    .addText(text => text
                        .setPlaceholder('UUID')
                        .setValue(this.config.dify!.datasetId || '')
                        .onChange(value => this.config.dify!.datasetId = value));
            } else {
                new Setting(container)
                    .setName(t('settings.customPlatform.dify.workflowUrl', this.plugin.settings))
                    .setDesc(t('settings.customPlatform.dify.workflowUrl.desc', this.plugin.settings))
                    .addText(text => text
                        .setPlaceholder('https://api.dify.ai/v1/workflows/run')
                        .setValue(this.config.dify!.workflowUrl || '')
                        .onChange(value => this.config.dify!.workflowUrl = value));
            }

        } else if (this.config.type === 'webhook') {
            this.config.webhook = this.config.webhook || { url: '', method: 'POST' };
            
            container.createEl('h3', { text: 'Webhook Configuration' });

            new Setting(container)
                .setName(t('settings.customPlatform.webhook.url', this.plugin.settings))
                .addText(text => text
                    .setPlaceholder('https://api.example.com/hook')
                    .setValue(this.config.webhook!.url)
                    .onChange(value => this.config.webhook!.url = value));

            new Setting(container)
                .setName(t('settings.customPlatform.webhook.method', this.plugin.settings))
                .addDropdown(dropdown => dropdown
                    .addOption('POST', 'POST')
                    .addOption('PUT', 'PUT')
                    .setValue(this.config.webhook!.method)
                    .onChange((value: string) => this.config.webhook!.method = value as 'POST' | 'PUT'));

        } else if (this.config.type === 'mcp') {
            this.config.mcp = this.config.mcp || { endpoint: '', toolName: '', transportType: 'sse' };
            
            container.createEl('h3', { text: t('settings.customPlatform.mcp.title', this.plugin.settings) });

            new Setting(container)
                .setName(t('settings.customPlatform.mcp.transportType', this.plugin.settings))
                .setDesc(t('settings.customPlatform.mcp.transportType.desc', this.plugin.settings))
                .addDropdown(dropdown => dropdown
                    .addOption('sse', 'SSE (Server-Sent Events)')
                    .addOption('http', 'HTTP (Stateless POST)')
                    .setValue(this.config.mcp!.transportType || 'sse') // Default to SSE
                    .onChange((value: string) => this.config.mcp!.transportType = value as 'sse' | 'http'));

            new Setting(container)
                .setName(t('settings.customPlatform.mcp.endpoint', this.plugin.settings))
                .setDesc(t('settings.customPlatform.mcp.endpoint.desc', this.plugin.settings))
                .addText(text => text
                    .setPlaceholder('http://localhost:3000/sse or /mcp')
                    .setValue(this.config.mcp!.endpoint)
                    .onChange(value => this.config.mcp!.endpoint = value));

            new Setting(container)
                .setName(t('settings.customPlatform.mcp.toolName', this.plugin.settings))
                .setDesc(t('settings.customPlatform.mcp.toolName.desc', this.plugin.settings))
                .addText(text => text
                    .setPlaceholder('create_note')
                    .setValue(this.config.mcp!.toolName || '')
                    .onChange(value => this.config.mcp!.toolName = value));
        }

        // Add Test Connection Button
        const testContainer = container.createDiv({ cls: 'picflow-test-connection-container' });
        testContainer.style.marginTop = '15px';
        testContainer.style.marginBottom = '15px';
        
        const testBtn = testContainer.createEl('button', { text: t('settings.customPlatform.modal.test', this.plugin.settings) });
        testBtn.onclick = async () => {
            if (!this.validateConfig()) return;
            
            testBtn.disabled = true;
            testBtn.textContent = t('settings.customPlatform.modal.testing', this.plugin.settings);
            
            try {
                // Dynamically load publisher to test connection
                let publisher: any = null;
                try {
                    if (this.config.type === 'wordpress') {
                        const { WordPressPublisher } = require('../../core/publishers/wordpress-publisher');
                        if (WordPressPublisher) publisher = new WordPressPublisher(this.plugin, this.config.wordpress);
                    } else if (this.config.type === 'dify') {
                        const { DifyPublisher } = require('../../core/publishers/dify-publisher');
                        if (DifyPublisher) publisher = new DifyPublisher(this.plugin, this.config.dify);
                    } else if (this.config.type === 'webhook') {
                        const { WebhookPublisher } = require('../../core/publishers/webhook-publisher');
                        if (WebhookPublisher) publisher = new WebhookPublisher(this.plugin, this.config.webhook);
                    } else if (this.config.type === 'mcp') {
                        const { MCPPublisher } = require('../../core/publishers/mcp-publisher');
                        if (MCPPublisher) publisher = new MCPPublisher(this.plugin, this.config.mcp);
                    }
                } catch (err) {
                    console.error("Failed to load publisher for testing:", err);
                    throw new Error("Pro module not found or failed to load");
                }

                if (publisher && publisher.testConnection) {
                    await publisher.testConnection();
                    new Notice(t('settings.customPlatform.modal.testSuccess', this.plugin.settings));
                } else {
                    // Fallback or not implemented
                    new Notice("Test connection not implemented for this type yet.");
                }

            } catch (e: any) {
                new Notice(t('settings.customPlatform.modal.testFailed', this.plugin.settings).replace('{error}', e.message));
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = t('settings.customPlatform.modal.test', this.plugin.settings);
            }
        };
    }
}
