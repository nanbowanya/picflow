import { App, PluginSettingTab, Setting, Notice, ButtonComponent, TextComponent, TextAreaComponent, MarkdownRenderer, MarkdownView, FileSystemAdapter, DropdownComponent, setIcon } from 'obsidian';
import PicFlowPlugin from '../main';
import { t } from './i18n';
import { S3Uploader } from './uploaders/s3';
import { OSSUploader } from './uploaders/oss';
import { GitHubUploader } from './uploaders/github';
import { WebDAVUploader } from './uploaders/webdav';
import { SFTPUploader } from './uploaders/sftp';
import { KeyBridgeClient, KeyBridgeLicenseInfo } from './api/keybridge-client';
import { ImageProcessor } from './utils/image-processor';
// Removed: import { MigrationManager } from './core/managers/migration-manager';
import { AccountManager, Account } from './managers/account-manager';
import { PLATFORM_ICONS } from './ui/platform-icons';
import { AIPromptTemplate, DEFAULT_PROMPTS } from './ai/prompts';
import { AI_MODELS, DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL } from './ai/models';
import { CustomPlatformModal } from './ui/modals/custom-platform-modal';
import { ConfirmModal } from './ui/modals/confirm-modal';
import { ThemeEditModal } from './ui/modals/theme-edit-modal';

import * as crypto from 'crypto';

export class PicFlowSettingTab extends PluginSettingTab {
    plugin: PicFlowPlugin;
    currentTab: 'General' | 'Uploader' | 'Album' | 'ImageMigration' | 'Publishing' | 'AI' | 'Status' = 'General';
    // Track which profile is currently expanded for editing
    expandedProfileId: string | null = null;
    // Track which platform is currently expanded for account management
    expandedPlatformId: string | null = null;
    // UI State for License Verification
    isVerifyingLicense: boolean = false;

    // UI State for Album Pagination
    currentAlbumOffset: number = 0;
    currentAlbumLimit: number = 20;

    // UI State for Theme Extractor
    extractorUrl: string = '';
    extractorMarkdown: string = '';
    extractorCss: string = '';
    extractorThemeName: string = '';

    constructor(app: App, plugin: PicFlowPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    switchToTab(tabId: 'General' | 'Uploader' | 'Album' | 'ImageMigration' | 'Publishing' | 'AI' | 'Status') {
        this.currentTab = tabId;
        this.display();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: t('settings.title', this.plugin.settings) });

        // License Card Removed from Top

        // --- Navigation Tabs ---
        const navContainer = containerEl.createEl('div', { cls: 'picflow-settings-nav' });
        // Styles moved to CSS class .picflow-settings-nav

        const tabs: ('General' | 'Uploader' | 'Album' | 'ImageMigration' | 'Publishing' | 'AI' | 'Status')[] =
            ['General', 'Uploader', 'Album', 'ImageMigration', 'Publishing', 'AI', 'Status'];

        tabs.forEach(tab => {
            let label: string = tab;
            if (tab === 'General') label = t('settings.nav.general', this.plugin.settings);
            if (tab === 'Uploader') label = t('settings.nav.uploader', this.plugin.settings);
            if (tab === 'Album') label = t('settings.nav.album', this.plugin.settings);
            if (tab === 'ImageMigration') label = t('settings.nav.imageMigration', this.plugin.settings);
            if (tab === 'Publishing') label = t('settings.nav.publishing', this.plugin.settings);
            if (tab === 'AI') label = t('settings.ai.title', this.plugin.settings);
            if (tab === 'Status') label = t('settings.nav.status', this.plugin.settings);

            const btn = navContainer.createEl('button', { text: label });
            if (this.currentTab === tab) {
                btn.classList.add('mod-cta'); // Use Obsidian's active button style
            }
            btn.onclick = () => {
                this.currentTab = tab;
                this.display();
            };
        });

        // --- Content ---
        const contentContainer = containerEl.createEl('div', { cls: 'picflow-settings-content' });
        // Styles moved to CSS class .picflow-settings-content

        switch (this.currentTab) {
            case 'General':
                this.renderGeneralTab(contentContainer);
                break;
            case 'Uploader':
                this.renderUploaderTab(contentContainer);
                break;
            case 'Album':
                this.renderAlbumTab(contentContainer);
                break;
            case 'ImageMigration':
                this.renderImageMigrationTab(contentContainer);
                break;
            case 'Publishing':
                this.renderPublishingTab(contentContainer);
                break;
            case 'AI':
                this.renderAITab(contentContainer);
                break;
            case 'Status':
                this.renderStatusTab(contentContainer);
                break;
        }
    }

    renderAITab(containerEl: HTMLElement) {
        // 1. Prompt Templates Management
        containerEl.createEl('h3', { text: t('settings.ai.templates.title', this.plugin.settings) });
        containerEl.createEl('p', { text: t('settings.ai.templates.desc', this.plugin.settings), cls: 'setting-item-description' });

        const templatesContainer = containerEl.createDiv();

        // Add New Template Button
        new Setting(templatesContainer)
            .setName(t('settings.ai.templates.add', this.plugin.settings))
            .addButton(btn => btn
                .setButtonText('Add')
                .onClick(() => {
                    const newId = Date.now().toString();
                    this.plugin.settings.promptTemplates.push({
                        id: newId,
                        name: 'New Template',
                        description: '',
                        template: ''
                    });
                    this.plugin.saveSettings();
                    this.display(); // Refresh
                }));

        // Reset Defaults Button
        new Setting(templatesContainer)
            .setName(t('settings.ai.templates.reset', this.plugin.settings))
            .setDesc(t('settings.ai.templates.reset.desc', this.plugin.settings))
            .addButton(btn => btn
                .setButtonText('Reset')
                .setWarning()
                .onClick(async () => {
                    new ConfirmModal(
                        this.plugin.app,
                        t('settings.ai.templates.reset', this.plugin.settings),
                        t('settings.ai.templates.reset.confirm', this.plugin.settings),
                        async () => {
                            this.plugin.settings.promptTemplates = [...DEFAULT_PROMPTS];
                            await this.plugin.saveSettings();
                            this.display();
                        }
                    ).open();
                }));

        // List Templates
        this.plugin.settings.promptTemplates.forEach((tpl, index) => {
            const setting = new Setting(templatesContainer)
                .setClass('picflow-template-item');
            
            // Clear default info (we want custom layout)
            setting.infoEl.remove();

            // Name Input
            const nameInput = setting.controlEl.createEl('input', { type: 'text', cls: 'picflow-template-name' });
            nameInput.placeholder = t('settings.ai.templates.name.placeholder', this.plugin.settings);
            nameInput.value = tpl.name;
            nameInput.onchange = async () => {
                tpl.name = nameInput.value;
                await this.plugin.saveSettings();
            };

            // Template Text Area
            const templateArea = setting.controlEl.createEl('textarea', { 
                cls: 'picflow-template-textarea',
                attr: { rows: '3', placeholder: t('settings.ai.templates.content.placeholder', this.plugin.settings) }
            });
            templateArea.value = tpl.template;
            templateArea.onchange = async () => {
                tpl.template = templateArea.value;
                await this.plugin.saveSettings();
            };

            // Action Row
            const actionRow = setting.controlEl.createDiv({ cls: 'picflow-template-actions' });
            
            // Delete Button
            const delBtn = new ButtonComponent(actionRow)
                .setIcon('trash')
                .setTooltip(t('settings.uploader.delete', this.plugin.settings))
                .onClick(async () => {
                    new ConfirmModal(
                        this.plugin.app,
                        t('settings.uploader.delete', this.plugin.settings),
                        t('settings.uploader.deleteConfirm', this.plugin.settings),
                        async () => {
                            this.plugin.settings.promptTemplates.splice(index, 1);
                            await this.plugin.saveSettings();
                            this.display();
                        }
                    ).open();
                });
            delBtn.buttonEl.addClass('picflow-danger-btn');
        });
    }

    renderLicenseCard(containerEl: HTMLElement) {
        const status = this.plugin.settings.licenseStatus;
        const isPro = status === 'valid';
        const isExpired = status === 'expired';
        const showInfoView = isPro || isExpired;

        const licenseContainer = containerEl.createEl('div', { cls: 'picflow-license-container' });
        if (isPro) licenseContainer.addClass('picflow-license-container--pro');
        if (isExpired) licenseContainer.addClass('picflow-license-container--expired'); // You might want to add CSS for this later, or just rely on text

        // Status Header
        const statusHeader = licenseContainer.createEl('div', { cls: 'picflow-license-header' });

        const statusIcon = statusHeader.createEl('span', { cls: 'picflow-license-header__icon' });
        if (isPro) statusIcon.innerText = '✅';
        else if (isExpired) statusIcon.innerText = '🚫';
        else statusIcon.innerText = '🔒';

        const statusText = statusHeader.createEl('span', { cls: 'picflow-license-header__text' });
        if (isPro) {
            statusText.innerText = t('settings.advanced.license.active', this.plugin.settings);
            statusText.addClass('picflow-license-header__text--active');
        } else if (isExpired) {
            statusText.innerText = t('settings.advanced.license.expired', this.plugin.settings);
            statusText.addClass('picflow-error-text');
        } else {
            statusText.innerText = t('settings.advanced.license.inactive', this.plugin.settings);
        }

        if (showInfoView) {
            const actionsDiv = statusHeader.createEl('div', { cls: 'picflow-license-header__actions' });
            // Add style to push actions to the right
            actionsDiv.addClass('picflow-license-header__actions-container');
            
            // Refresh Button (Moved here as requested)
            new ButtonComponent(actionsDiv)
                .setButtonText(t('settings.advanced.license.refresh', this.plugin.settings))
                .onClick(async () => {
                     new Notice('Refreshing license status...');
                     try {
                        // Pass true for checkOnly to skip downloadUrls and enable rate limiting
                        const result = await KeyBridgeClient.verifyLicense(this.plugin.settings.licenseKey, true);
                        
                        if (result.message && result.message.includes("Too frequent")) {
                            new Notice(result.message);
                            return;
                        }

                        // Update Data
                        this.plugin.settings.aiTokenBalance = result.aiTokenBalance || 0;
                        if (result.activationDate) this.plugin.settings.activationDate = result.activationDate;
                        if (result.expiryDate) this.plugin.settings.expiryDate = result.expiryDate;

                        if (result.valid) {
                            this.plugin.settings.licenseStatus = 'valid';
                            
                            // [NEW] Check for downloadUrls and upgrade (Same as Activate logic)
                            if (result.downloadUrls) {
                                await KeyBridgeClient.downloadAndInstallPro(this.plugin, result.downloadUrls);
                            }

                            new Notice(t('settings.activation.verified', this.plugin.settings));
                        } else {
                            // Check if expired
                            const now = new Date();
                            const expiry = result.expiryDate ? new Date(result.expiryDate) : null;
                            if (expiry && now > expiry) {
                                this.plugin.settings.licenseStatus = 'expired';
                                new Notice(t('settings.advanced.license.expired', this.plugin.settings));
                            } else {
                                this.plugin.settings.licenseStatus = 'invalid';
                                new Notice(result.message || 'License invalid');
                            }
                        }
                        await this.plugin.saveSettings();
                        this.display();
                     } catch (e) {
                         new Notice(t('settings.advanced.ai.refreshFailed', this.plugin.settings));
                         console.error(e);
                     }
                });

            // Deactivate Button
            const deactivateBtn = new ButtonComponent(actionsDiv)
                .setButtonText(t('settings.advanced.license.deactivate', this.plugin.settings))
                .setWarning()
                .onClick(async () => {
                    new ConfirmModal(
                        this.plugin.app,
                        t('settings.advanced.license.deactivate', this.plugin.settings),
                        'Are you sure you want to deactivate?',
                        async () => {
                            // Clear Settings
                            this.plugin.settings.licenseKey = '';
                            this.plugin.settings.licenseStatus = 'unknown';
                            this.plugin.settings.aiTokenBalance = 0;
                            this.plugin.settings.activationDate = '';
                            this.plugin.settings.expiryDate = '';
                            await this.plugin.saveSettings();

                            this.display(); // Refresh UI
                        }
                    ).open();
                });
            // deactivateBtn.buttonEl.addClass('picflow-license-header__deactivate'); // CSS class might handle spacing
        }

        // Feature Status List
        const featuresDiv = licenseContainer.createEl('div', { cls: 'picflow-license-features' });

        const allFeatures = [
            { name: t('settings.advanced.features.autoUpload', this.plugin.settings), icon: '⚡', active: true },
            { name: t('settings.advanced.features.s3', this.plugin.settings), icon: '🪣', active: true },
            { name: t('settings.advanced.features.github', this.plugin.settings), icon: '🐙', active: true },
            { name: t('settings.advanced.features.webdav', this.plugin.settings), icon: '📂', active: true },
            { name: t('settings.advanced.features.sftp', this.plugin.settings), icon: '🖥️', active: true },
            { name: t('settings.advanced.features.frontmatter', this.plugin.settings), icon: '📝', active: true },
            { name: t('settings.advanced.features.publishPreview', this.plugin.settings), icon: '👁️', active: true },
            { name: t('settings.advanced.features.imagePreview', this.plugin.settings), icon: '🖼️', active: true },
            { name: t('settings.advanced.features.imageManage', this.plugin.settings), icon: '🗑️', pro: true },
            { name: t('settings.advanced.features.migration', this.plugin.settings), icon: '📦', pro: true },
            { name: t('settings.advanced.features.imageProcess', this.plugin.settings), icon: '⚙️', pro: true },
            { name: t('settings.advanced.features.clip', this.plugin.settings), icon: '✂️', pro: true },
            { name: t('settings.advanced.features.ai', this.plugin.settings), icon: '✨', pro: true },
            { name: t('settings.advanced.features.publish', this.plugin.settings), icon: '🚀', pro: true },
            { name: t('settings.advanced.features.styleExtractor', this.plugin.settings), icon: '🎨', pro: true },
        ];

        allFeatures.forEach(f => {
            const tag = featuresDiv.createEl('span', { cls: 'picflow-feature-tag' });
            
            let statusLabel = '';
            let statusClass = '';

            if (f.pro) {
                if (isPro) {
                    statusLabel = t('settings.advanced.status.active', this.plugin.settings);
                    statusClass = 'picflow-feature-tag__status--active';
                } else if (isExpired) {
                    statusLabel = t('settings.advanced.status.expired', this.plugin.settings);
                    statusClass = 'picflow-feature-tag__status--expired'; // Need CSS or inline style
                    tag.setCssProps({ opacity: '0.8' });
                } else {
                    statusLabel = t('settings.advanced.status.inactive', this.plugin.settings);
                    statusClass = 'picflow-feature-tag__status--inactive';
                }
            } else {
                // Free features always active
                statusLabel = t('settings.advanced.status.active', this.plugin.settings);
                statusClass = 'picflow-feature-tag__status--active';
            }
            
            tag.setText(`${f.icon} ${f.name}: `);
            const statusSpan = tag.createSpan({ 
                cls: `picflow-feature-tag__status ${statusClass}`, 
                text: statusLabel 
            });
            
            if (isExpired && f.pro) {
                statusSpan.addClass('picflow-error-text');
            }
        });

        if (showInfoView) {
            // --- PRO/EXPIRED STATE ---

            // Masked Key Display
            const keyRow = licenseContainer.createEl('div', { cls: 'picflow-license-key-row' });

            const keyText = this.plugin.settings.licenseKey;
            const maskedKey = keyText.length > 8
                ? `${keyText.substring(0, 4)}******${keyText.substring(keyText.length - 4)}`
                : '******';

            keyRow.createEl('span', { text: maskedKey });

            // Balance & Date Info
            const infoRow = licenseContainer.createEl('div', { cls: 'picflow-license-info' });

            // Balance
            const balanceDiv = infoRow.createEl('div', { cls: 'picflow-license-info-card' });

            const balanceHeader = balanceDiv.createEl('div', { cls: 'picflow-license-info-card__header' });
            balanceHeader.createEl('span', { text: t('settings.advanced.ai.balance', this.plugin.settings), cls: 'picflow-license-info-card__label' });

            // Topup Link
            const balanceActions = balanceHeader.createEl('div', { cls: 'picflow-license-info-card__actions' });
            const topupLink = balanceActions.createEl('a', { text: t('settings.advanced.license.topup', this.plugin.settings), cls: 'picflow-license-info-card__link' });
            topupLink.href = 'https://keypal.94168168.xyz/buy/15';
            topupLink.target = '_blank';

            const balanceVal = balanceDiv.createEl('div', { cls: 'picflow-license-info-card__value' });
            balanceVal.innerText = this.plugin.settings.aiTokenBalance !== undefined
                ? this.plugin.settings.aiTokenBalance.toLocaleString()
                : '0';

            // Validity Period (Changed from Activation Date)
            const dateDiv = infoRow.createEl('div', { cls: 'picflow-license-info-card' });
            dateDiv.createEl('div', { text: t('settings.advanced.ai.date', this.plugin.settings), cls: 'picflow-license-info-card__label' });

            const dateVal = dateDiv.createEl('div', { cls: 'picflow-license-info-card__value' });
            
            const formatDate = (d: string | undefined) => {
                if (!d) return '-';
                const date = new Date(d);
                return isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
            };

            const startStr = formatDate(this.plugin.settings.activationDate);
            // Check if expiry date is null or very far in future (e.g. > 100 years from now)
            // Assuming empty or specific value means permanent
            let isPermanent = false;
            if (!this.plugin.settings.expiryDate) {
                 isPermanent = true;
            } else {
                 const expiryDate = new Date(this.plugin.settings.expiryDate);
                 // Check if valid date
                 if (!isNaN(expiryDate.getTime())) {
                     // If expiry date is more than 50 years from now, consider it permanent
                     const farFuture = new Date();
                     farFuture.setFullYear(farFuture.getFullYear() + 50);
                     if (expiryDate > farFuture) {
                         isPermanent = true;
                     }
                 }
            }

            if (isPermanent) {
                dateVal.innerText = t('settings.advanced.license.permanent', this.plugin.settings);
            } else {
                const endStr = formatDate(this.plugin.settings.expiryDate);
                dateVal.innerText = `${startStr} - ${endStr}`;
            }
            
            if (isExpired) {
                dateVal.addClass('picflow-error-text');
            }

        } else {
            // --- NON-PRO STATE (Input & Activate) ---

            // License Input & Action
            const actionRow = licenseContainer.createEl('div', { cls: 'picflow-license-action' });

            const input = actionRow.createEl('input', { type: 'text', cls: 'picflow-license-input' });
            input.type = 'text';
            input.placeholder = t('settings.advanced.license.placeholder', this.plugin.settings);
            input.value = this.plugin.settings.licenseKey;
            input.onchange = async () => {
                this.plugin.settings.licenseKey = input.value.trim();
            };

            const verifyBtn = new ButtonComponent(actionRow)
                .setButtonText(t('settings.advanced.license.activate', this.plugin.settings))
                .setCta()
                .setDisabled(this.isVerifyingLicense)
                .onClick(async () => {
                    const keyToVerify = input.value.trim();
                    if (!keyToVerify) {
                        new Notice('Please enter a license key');
                        return;
                    }

                    this.isVerifyingLicense = true;
                    verifyBtn.setButtonText(t('settings.advanced.license.verifying', this.plugin.settings));
                    verifyBtn.setDisabled(true);

                    try {
                        const result = await KeyBridgeClient.verifyLicense(keyToVerify);

                        if (result.valid) {
                            this.plugin.settings.licenseStatus = 'valid';
                            this.plugin.settings.licenseKey = keyToVerify; // Ensure saved
                            this.plugin.settings.activationDate = result.activationDate;
                            this.plugin.settings.expiryDate = result.expiryDate;
                            this.plugin.settings.aiTokenBalance = result.aiTokenBalance || 0;

                            // [NEW] Check for downloadUrls and upgrade
                            if (result.downloadUrls) {
                                await KeyBridgeClient.downloadAndInstallPro(this.plugin, result.downloadUrls);
                            }

                            await this.plugin.saveSettings();
                            new Notice(t('settings.activation.verified', this.plugin.settings));
                            this.display();
                        } else {
                             // Check if expired
                            const now = new Date();
                            const expiry = result.expiryDate ? new Date(result.expiryDate) : null;
                            
                            if (expiry && now > expiry) {
                                this.plugin.settings.licenseStatus = 'expired';
                                this.plugin.settings.licenseKey = keyToVerify;
                                this.plugin.settings.activationDate = result.activationDate;
                                this.plugin.settings.expiryDate = result.expiryDate;
                                this.plugin.settings.aiTokenBalance = result.aiTokenBalance || 0;
                                await this.plugin.saveSettings();
                                new Notice(t('settings.advanced.license.expired', this.plugin.settings));
                                this.display();
                            } else {
                                new Notice(result.message || 'Activation failed');
                                this.plugin.settings.licenseStatus = 'invalid';
                                await this.plugin.saveSettings();
                            }
                        }
                    } catch (error) {
                        new Notice('Network error during verification');
                        console.error(error);
                    } finally {
                        this.isVerifyingLicense = false;
                        verifyBtn.setButtonText(t('settings.advanced.license.activate', this.plugin.settings));
                        verifyBtn.setDisabled(false);
                    }
                });

            // Buy Button
            const buyBtn = new ButtonComponent(actionRow)
                .setButtonText(t('settings.advanced.license.buy', this.plugin.settings))
                .onClick(() => {
                    window.open('https://keypal.94168168.xyz/buy/14', '_blank');
                });
        }
    }

    renderGeneralTab(containerEl: HTMLElement) {
        // --- General Configuration Group ---
        new Setting(containerEl)
            .setName(t('settings.general.configuration', this.plugin.settings))
            .setHeading();

        const generalWrapper = containerEl.createDiv({ cls: 'picflow-settings-group' });
        // Styles moved to CSS class .picflow-settings-group

        new Setting(generalWrapper)
            .setName(t('settings.general.language', this.plugin.settings))
            .setDesc(t('settings.general.language.desc', this.plugin.settings))
            .addDropdown(dropdown => dropdown
                .addOption('auto', 'Auto (System)')
                .addOption('en', 'English')
                .addOption('zh', '中文')
                .setValue(this.plugin.settings.language)
                .onChange(async (value) => {
                    this.plugin.settings.language = value as 'auto' | 'en' | 'zh';
                    await this.plugin.saveSettings();
                    this.plugin.refreshAllViews();
                    this.display();
                }));

        new Setting(generalWrapper)
            .setName(t('settings.general.autoUpload', this.plugin.settings))
            .setDesc(t('settings.general.autoUpload.desc', this.plugin.settings))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoUpload)
                .onChange(async (value) => {
                    this.plugin.settings.autoUpload = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(generalWrapper)
            .setName(t('settings.general.imageNameFormat', this.plugin.settings))
            .setDesc(t('settings.general.imageNameFormat.desc', this.plugin.settings) + '\n' + t('settings.general.imageNameFormat.tip', this.plugin.settings))
                .addText(text => text
                    .setPlaceholder('{Y}{M}{D}{h}{m}{s}-{filename}')
                    .setValue(this.plugin.settings.imageNameFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.imageNameFormat = value;
                        await this.plugin.saveSettings();
                    })
                );
        
        // Removed separate tip element
        
        // --- Article Style / Theme Settings ---
        new Setting(containerEl)
            .setName(t('settings.general.articleStyle.title', this.plugin.settings))
            .setHeading();
        
        const themeWrapper = containerEl.createDiv({ cls: 'picflow-settings-group' });

        // AI Theme Extractor Tool (Beta) - Moved inside themeWrapper
        const extractorDetails = themeWrapper.createEl('details');
        extractorDetails.addClass('picflow-settings-details');
        extractorDetails.addClass('picflow-extractor-details');

        const summary = extractorDetails.createEl('summary');
        summary.addClass('picflow-settings-summary');
        summary.setText(t('settings.extractor.title', this.plugin.settings));

        const extractorContent = extractorDetails.createDiv();
        extractorContent.addClass('picflow-settings-details-content');
        extractorContent.addClass('picflow-extractor-content');

        // Description & Warning merged
        const desc = extractorContent.createEl('p');
        desc.addClass('picflow-extractor-desc');
        desc.innerHTML = `${t('settings.extractor.desc', this.plugin.settings)}<br>${t('settings.extractor.warning.length', this.plugin.settings)}`;
        
        // 1. Input Row
        const inputRow = extractorContent.createDiv();
        inputRow.addClass('picflow-extractor-input-row');
        
        const urlInput = new TextComponent(inputRow);
        urlInput.setPlaceholder(t('settings.extractor.placeholder', this.plugin.settings));
        urlInput.setValue(this.extractorUrl);
        urlInput.onChange(val => this.extractorUrl = val);
        urlInput.inputEl.addClass('picflow-extractor-url-input');
        
        const extractBtn = new ButtonComponent(inputRow);
        extractBtn.setButtonText(t('settings.extractor.btn.extract', this.plugin.settings));
        extractBtn.setCta();

        // 2. Workspace (Split View) - Hidden initially
        const workspace = extractorContent.createDiv();
        workspace.addClass('picflow-extractor-workspace');
        // Hidden state handled by CSS or class toggling
        if (!this.extractorThemeName) workspace.addClass('hidden');

        // Left: Markdown Editor
        const editorContainer = workspace.createDiv();
        editorContainer.addClass('picflow-extractor-editor-container');

        const editorHeader = editorContainer.createDiv();
        editorHeader.addClass('picflow-extractor-header');
        editorHeader.setText(t('settings.extractor.editor.title', this.plugin.settings));

        const editorArea = new TextAreaComponent(editorContainer);
        editorArea.inputEl.addClass('picflow-extractor-textarea');
        
        // Right: Preview (Shadow DOM)
        const previewContainer = workspace.createDiv();
        previewContainer.addClass('picflow-extractor-preview-container');

        const previewHeader = previewContainer.createDiv();
        previewHeader.addClass('picflow-extractor-header');
        previewHeader.createSpan({ text: t('settings.extractor.preview.title', this.plugin.settings) });

        const previewHost = previewContainer.createDiv();
        previewHost.addClass('picflow-extractor-preview-host');

        // Phone frame simulation
        const phoneFrame = previewHost.createDiv();
        phoneFrame.addClass('picflow-extractor-phone-frame');
        
        // Attach Shadow DOM for style isolation
        const shadowRoot = phoneFrame.attachShadow({ mode: 'open' });

        // Update Preview Function
        const updatePreview = async () => {
            const md = editorArea.getValue();
            this.extractorMarkdown = md; // Sync state

            // Render MD to temp div using Obsidian renderer
            const tempDiv = document.createElement('div');
            await MarkdownRenderer.render(this.plugin.app, md, tempDiv, '/', this.plugin);

            // Inject into Shadow DOM
             shadowRoot.innerHTML = `
                <style>
                    :host { 
                        display: block; 
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                        line-height: 1.6; 
                        color: #333; 
                        padding: 20px;
                        box-sizing: border-box;
                        word-wrap: break-word;
                    }
                    * { box-sizing: border-box; }
                    
                    /* Force images/media to fit container */
                    img, video, iframe { max-width: 100% !important; height: auto !important; display: block; margin: 10px auto; }
                    
                    /* Fix code/pre overflow - Essential for mobile view simulation */
                    pre { 
                        white-space: pre-wrap; 
                        word-wrap: break-word; 
                        max-width: 100%; 
                        overflow-x: auto; 
                        background: #f6f8fa; 
                        padding: 10px; 
                        border-radius: 5px; 
                        margin: 1em 0;
                    }
                    code { 
                        word-break: break-word; 
                        font-family: monospace; 
                        font-size: 0.9em; 
                        background: rgba(27,31,35,0.05); 
                        padding: 2px 4px; 
                        border-radius: 3px; 
                    }
                    
                    p { margin: 1em 0; }
                    h1, h2, h3, h4, h5, h6 { margin: 1.5em 0 0.5em; font-weight: bold; line-height: 1.4; }
                    blockquote { margin: 1em 0; padding: 10px 15px; border-left: 4px solid #ddd; background: #f9f9f9; color: #666; }
                    ul, ol { padding-left: 20px; margin: 1em 0; }
                    hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
                    
                    /* Extracted CSS (Higher Specificity due to .picflow-container) */
                    ${this.extractorCss}
                </style>
                <div class="wechat-article picflow-container">
                    ${tempDiv.innerHTML}
                </div>
             `;
        };

        // Bind editor change
        editorArea.onChange(() => updatePreview());

        // [NEW] Model Selection Dropdown
        const modelSelect = new DropdownComponent(inputRow);
        modelSelect.selectEl.addClass('picflow-model-select');
        
        // Filter for Chat models only
        const chatModels = AI_MODELS.filter(m => m.type === 'chat');
        chatModels.forEach(model => {
            modelSelect.addOption(model.id, model.name);
        });
        
        // Default to settings or first available
        // Set Default to first model if settings is empty or not in list
        let defaultModel = DEFAULT_CHAT_MODEL;
        if (chatModels.length > 0) {
            defaultModel = chatModels[0].id;
        }

        const currentModel = this.plugin.settings.aiDefaultModel || defaultModel;
        // Ensure current model is valid, else fallback to first available
        if (!chatModels.find(m => m.id === currentModel)) {
             this.plugin.settings.aiDefaultModel = defaultModel;
             modelSelect.setValue(defaultModel);
        } else {
             modelSelect.setValue(currentModel);
        }
        
        modelSelect.onChange(async (value: string) => {
            this.plugin.settings.aiDefaultModel = value;
            await this.plugin.saveSettings();
        });

        // Insert modelSelect before extractBtn
        inputRow.insertBefore(modelSelect.selectEl, extractBtn.buttonEl);

        // 3. Action Row (Save)
        const actionRow = extractorContent.createDiv();
        actionRow.addClass('picflow-extractor-action-row');
        if (!this.extractorThemeName) actionRow.addClass('hidden');

        const saveBtn = new ButtonComponent(actionRow)
            .setButtonText(t('settings.extractor.btn.save', this.plugin.settings))
            .setCta()
            .onClick(async () => {
                if (!this.extractorThemeName || !this.extractorCss) return;
                await this.plugin.themeExtractorManager.saveTheme(this.extractorThemeName, this.extractorCss);
                new Notice(t('settings.extractor.saved', this.plugin.settings).replace('{name}', this.extractorThemeName));
                // Refresh themes list
                await this.plugin.themeManager.loadThemes();
                this.display();
            });

        // Extract Button Logic
        extractBtn.onClick(async () => {
            // [NEW] Check License Status on Click
            if (!this.plugin.settings.licenseKey || this.plugin.settings.licenseStatus !== 'valid') {
                new Notice(t('settings.uploader.proFeature.desc', this.plugin.settings));
                // Switch to Status tab
                this.currentTab = 'Status';
                this.display();
                return;
            }

            if (!this.extractorUrl) {
                new Notice(t('settings.extractor.error.noUrl', this.plugin.settings));
                return;
            }
            
            extractBtn.setButtonText(t('settings.extractor.btn.analyzing', this.plugin.settings));
            extractBtn.setDisabled(true);
            workspace.addClass('hidden');
            actionRow.addClass('hidden');
            
            try {
               // Use selected model from settings
               const selectedModel = this.plugin.settings.aiDefaultModel || DEFAULT_CHAT_MODEL;
               // @ts-ignore
               const result = await this.plugin.themeExtractorManager.extractTheme(this.extractorUrl, selectedModel);

                    if (result) {
                        // Combine Demo (Style Guide) with Full Content
                        let finalMarkdown = "";
                        
                        // 1. Add Style Guide (if available)
                        if (result.demo && result.demo.trim().length > 0) {
                            finalMarkdown += `> **🎨 Theme Style Guide**\n> This guide shows how standard Markdown elements render with this theme.\n\n${result.demo}\n\n---\n\n`;
                        }

                        // 2. Add Full Article Content
                        if (!result.markdown || result.markdown.trim().length === 0) {
                            finalMarkdown += `# Sample Title (Content Not Found)\n\n(The article content could not be extracted automatically. Please copy content manually.)`;
                            new Notice("Content extraction empty, showing sample.");
                        } else {
                            // Add a header for the article content
                            finalMarkdown += `\n\n${result.markdown}`;
                        }

                        this.extractorMarkdown = finalMarkdown;
                        this.extractorCss = result.css;
                        this.extractorThemeName = result.themeName;

                        // Show Workspace
                        workspace.removeClass('hidden');
                        actionRow.removeClass('hidden');
                        
                        // Set Editor Content
                        editorArea.setValue(this.extractorMarkdown);
                        
                        // Update Preview
                        await updatePreview();
                        
                        saveBtn.setButtonText(`${t('settings.extractor.btn.save', this.plugin.settings)} "${result.themeName}"`);
                    }
                 } catch (e) {
                     console.error(e);
                     new Notice(t('settings.extractor.error.failed', this.plugin.settings));
                 } finally {
                    extractBtn.setButtonText(t('settings.extractor.btn.extract', this.plugin.settings));
                    extractBtn.setDisabled(false);
                 }
             });

        // Add "Open Theme Folder" button
        new Setting(themeWrapper)
            .setName(t('settings.general.themeFolder.title', this.plugin.settings))
            .setDesc(t('settings.general.themeFolder.desc', this.plugin.settings))
            .addButton(btn => btn
                .setButtonText(t('settings.general.themeFolder.button', this.plugin.settings))
                .onClick(async () => {
                    const adapter = this.plugin.app.vault.adapter;
                    if (adapter instanceof FileSystemAdapter) {
                        const themeDir = `${this.plugin.manifest.dir}/assets/themes`;
                        // Ensure it exists
                        if (!(await adapter.exists(themeDir))) {
                            await adapter.mkdir(themeDir);
                        }
                        
                        // Open in system explorer
                        // Use Obsidian's open API if available, or Electron's shell
                        // @ts-ignore
                        const shell = window.electron?.remote?.shell || window.require('electron').shell;
                        const fullPath = adapter.getFullPath(themeDir);
                        shell.openPath(fullPath);
                    } else {
                        new Notice('FileSystemAdapter not available.');
                    }
                }))
            .addButton(btn => btn
                .setTooltip('Reset & Download Themes from GitHub')
                .setIcon('refresh-cw')
                .onClick(async () => {
                    new Notice('Resetting themes from GitHub...');
                    // Pass true to force checking/downloading
                    await this.plugin.themeManager.fetchDefaultThemes(true);
                    await this.plugin.themeManager.loadThemes();
                    new Notice('Themes reset and reloaded');
                    this.display();
                }));

        const themes = this.plugin.themeManager.getAllThemes();
        
        // Use a grid layout for themes
        const themeGrid = themeWrapper.createDiv({ cls: 'picflow-theme-grid' });
        // Styles moved to CSS class .picflow-theme-grid

        themes.forEach(theme => {
            const card = themeGrid.createDiv({ cls: 'picflow-theme-card' });
            
            // Theme Name
            const nameEl = card.createDiv({ cls: 'picflow-theme-card__name' });
            nameEl.innerText = theme.name;

            // Actions Container
            const actions = card.createDiv({ cls: 'picflow-theme-card__actions' });

            // Edit Button
            const editBtn = actions.createEl('div', { cls: 'picflow-theme-action-btn' });
            setIcon(editBtn, 'pencil');
            editBtn.title = t('settings.customPlatform.edit', this.plugin.settings);
            editBtn.onclick = (e) => {
                e.stopPropagation();
                new ThemeEditModal(this.app, this.plugin, theme.name, theme.css, async (name: string, css: string) => {
                    await this.plugin.themeManager.saveTheme(name, css);
                    new Notice(`${name} updated.`);
                    this.display(); // Refresh
                }).open();
            };

            // Delete Button (Disable for Default)
            const delBtn = actions.createEl('div', { cls: 'picflow-theme-action-btn' });
            setIcon(delBtn, 'trash-2');
            delBtn.title = t('settings.customPlatform.delete', this.plugin.settings);
            
            if (theme.name === 'Default') {
                delBtn.addClass('disabled');
            } else {
                delBtn.addClass('danger');
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    new ConfirmModal(
                        this.app,
                        t('settings.customPlatform.delete', this.plugin.settings),
                        t('settings.customPlatform.deleteConfirm', this.plugin.settings).replace('{name}', theme.name),
                        async () => {
                            await this.plugin.themeManager.deleteTheme(theme.name);
                            new Notice(`${theme.name} deleted.`);
                            this.display();
                        }
                    ).open();
                };
            }
        });

        // --- Front-matter Settings ---
        new Setting(containerEl)
            .setName(t('settings.general.frontmatter.title', this.plugin.settings))
            .setHeading();
        
        const frontmatterWrapper = containerEl.createDiv({ cls: 'picflow-settings-group' });
        // Styles moved to CSS class .picflow-settings-group

        new Setting(frontmatterWrapper)
            .setName(t('settings.general.frontmatter.enable', this.plugin.settings))
            .setDesc(t('settings.general.frontmatter.enable.desc', this.plugin.settings))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDefaultFrontmatter)
                .onChange(async (value) => {
                    this.plugin.settings.enableDefaultFrontmatter = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(frontmatterWrapper)
            .setName(t('settings.general.frontmatter.template', this.plugin.settings))
            .setDesc(t('settings.general.frontmatter.template.desc', this.plugin.settings))
            .addTextArea(text => text
                .setPlaceholder('title: {{title}}\ndate: {{date}}')
                .setValue(this.plugin.settings.defaultFrontmatterTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.defaultFrontmatterTemplate = value;
                    await this.plugin.saveSettings();
                })
            );
        // Adjust textarea height using CSS class
        const textAreas = frontmatterWrapper.querySelectorAll('textarea');
        if (textAreas.length > 0) {
            const lastTextArea = textAreas[textAreas.length - 1];
            lastTextArea.addClass('picflow-settings-textarea');
        }
    }

    renderUploaderTab(containerEl: HTMLElement) {
        // 1. Status Bar
        const currentProfile = this.plugin.settings.profiles.find(p => p.id === this.plugin.settings.selectedProfileId);
        const statusContainer = containerEl.createEl('div', { cls: 'picflow-uploader-status' });
        // Styles moved to CSS class .picflow-uploader-status

        const statusText = statusContainer.createEl('span', { cls: 'picflow-uploader-status__text' });
        if (currentProfile) {
            let typeLabel = currentProfile.type.toUpperCase();
            if (currentProfile.type === 's3' && currentProfile.name.includes('OSS')) {
                 // Try to be smart about label if user named it OSS? 
                 // Or just leave as S3 since underlying protocol is S3. 
                 // User request is to change UI label for "Mainland OSS".
                 // But here we are displaying the *current* profile.
            }
            statusText.setText(`✅ ${t('settings.uploader.status.current', this.plugin.settings)}: ${currentProfile.name} (${typeLabel})`);
            statusText.addClass('picflow-uploader-status__text--success');
        } else {
            statusText.setText(`⚠️ ${t('settings.uploader.status.none', this.plugin.settings)}`);
            statusText.addClass('picflow-uploader-status__text--warning');
        }

        // 2. Profile List (Accordion)
        const listContainer = containerEl.createEl('div', { cls: 'picflow-profile-list' });
        // Styles moved to CSS class .picflow-profile-list

        this.plugin.settings.profiles.forEach(profile => {
            this.renderProfileAccordionItem(listContainer, profile);
        });

        // 3. Add Custom Profile Button
        const addContainer = containerEl.createEl('div', { cls: 'picflow-add-profile' });
        // Styles moved to CSS class .picflow-add-profile

        const addBtn = addContainer.createEl('button', { text: t('settings.uploader.addProfile', this.plugin.settings), cls: 'picflow-add-profile__btn' });
        addBtn.classList.add('mod-cta'); // Primary action style
        // Styles moved to CSS class .picflow-add-profile__btn

        addBtn.onclick = () => {
            // Create a basic S3 profile by default, user can change type later? 
            // Or just add a new S3 instance for now as requested.
            const newProfile: UploaderProfile = {
                id: crypto.randomUUID(),
                name: 'New Custom S3',
                type: 's3',
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
                    uploadStrategy: 'rename'
                }
            };
            this.plugin.settings.profiles.push(newProfile);
            this.expandedProfileId = newProfile.id; // Auto expand
            this.plugin.saveSettings();
            this.display();
        };
    }

    renderProfileAccordionItem(container: HTMLElement, profile: UploaderProfile) {
        const isExpanded = this.expandedProfileId === profile.id;
        const isSelected = this.plugin.settings.selectedProfileId === profile.id;

        // Wrapper
        const wrapper = container.createEl('div', { cls: 'picflow-profile-wrapper' });
        // Styles moved to CSS class .picflow-profile-wrapper

        // Header
        const header = wrapper.createEl('div', { cls: 'picflow-profile-header' });
        if (isSelected) {
            header.addClass('picflow-profile-header--selected');
        }
        // Styles moved to CSS class .picflow-profile-header

        header.onclick = () => {
            if (isExpanded) {
                this.expandedProfileId = null; // Collapse
            } else {
                this.expandedProfileId = profile.id; // Expand (auto collapses others)
            }
            this.display();
        };

        // Left: Icon + Name
        const leftDiv = header.createEl('div', { cls: 'picflow-profile-header__left' });
        // Styles moved to CSS class .picflow-profile-header__left

        // Icon placeholder (simple text for now)
        const iconSpan = leftDiv.createEl('span', { text: this.getIconForType(profile.type), cls: 'picflow-profile-header__icon' });
        // Styles moved to CSS class .picflow-profile-header__icon

        const nameSpan = leftDiv.createEl('span', { text: profile.name, cls: 'picflow-profile-header__name' });
        // Styles moved to CSS class .picflow-profile-header__name

        // Right: Status / Arrow
        const rightDiv = header.createEl('div', { cls: 'picflow-profile-header__right' });
        if (isSelected) {
            const badge = rightDiv.createEl('span', { text: t('settings.uploader.active', this.plugin.settings), cls: 'picflow-profile-header__badge' });
            // Styles moved to CSS class .picflow-profile-header__badge
        }

        const arrow = rightDiv.createEl('span', { text: isExpanded ? '▼' : '▶', cls: 'picflow-profile-header__arrow' });
        // Styles moved to CSS class .picflow-profile-header__arrow

        // Body (Details) - Only if expanded
        if (isExpanded) {
            const body = wrapper.createEl('div', { cls: 'picflow-profile-body' });
            // Styles moved to CSS class .picflow-profile-body

            // Profile Name Edit
            new Setting(body)
                .setName(t('settings.uploader.profileName', this.plugin.settings))
                .addText(text => text
                    .setValue(profile.name)
                    .onChange(async (value) => {
                        profile.name = value;
                        // No auto-save here to prevent lag? Or save on blur? 
                        // Let's save on action buttons for better UX as requested.
                    }));

            // Type Switcher (Only for custom profiles? Or allow switching any?)
            // For simplicity, allow switching.
            new Setting(body)
                .setName(t('settings.uploader.type', this.plugin.settings))
                .addDropdown(dropdown => dropdown
                    .addOption('s3', t('settings.uploader.s3', this.plugin.settings))
                    .addOption('oss', 'Aliyun/Tencent OSS')
                    .addOption('github', t('settings.uploader.github', this.plugin.settings))
                    .addOption('webdav', t('settings.uploader.webdav', this.plugin.settings))
                    .addOption('sftp', t('settings.uploader.sftp', this.plugin.settings))
                    .setValue(profile.type)
                    .onChange((value) => {
                        profile.type = value as UploaderType;
                        // Initialize config object if missing
                        if (profile.type === 's3' && !profile.s3) profile.s3 = this.createEmptyS3Config();
                        if (profile.type === 'oss' && !profile.oss) profile.oss = this.createEmptyOSSConfig();
                        if (profile.type === 'github' && !profile.github) profile.github = this.createEmptyGitHubConfig();
                        if (profile.type === 'webdav' && !profile.webdav) profile.webdav = this.createEmptyWebDAVConfig();
                        if (profile.type === 'sftp' && !profile.sftp) profile.sftp = this.createEmptySFTPConfig();
                        this.display();
                    }));

            // Render specific fields
            this.renderProfileFields(body, profile);

            // Action Buttons
            const actionContainer = body.createEl('div', { cls: 'picflow-profile-actions' });
            // Styles moved to CSS class .picflow-profile-actions

            // Delete Button (Don't allow deleting the last one? Or just allow)
            const deleteBtn = actionContainer.createEl('button', { text: t('settings.uploader.delete', this.plugin.settings), cls: 'picflow-profile-actions__delete' });
            // Styles moved to CSS class .picflow-profile-actions__delete
            
            deleteBtn.onclick = async () => {
                // Confirm?
                new ConfirmModal(
                    this.plugin.app,
                    t('settings.uploader.delete', this.plugin.settings),
                    t('settings.uploader.deleteConfirm', this.plugin.settings),
                    async () => {
                        this.plugin.settings.profiles = this.plugin.settings.profiles.filter(p => p.id !== profile.id);
                        if (isSelected) {
                            this.plugin.settings.selectedProfileId = ''; // Clear selection if deleted
                        }
                        await this.plugin.saveSettings();
                        this.expandedProfileId = null;
                        this.display();
                    }
                ).open();
            };

            // Save Button
            const saveBtn = actionContainer.createEl('button', { text: t('settings.uploader.save', this.plugin.settings) });
            saveBtn.onclick = async () => {
                await this.plugin.saveSettings();
                new Notice(t('notice.settingsSaved', this.plugin.settings));
            };

            // Use Button
            const useBtn = actionContainer.createEl('button', { text: isSelected ? `✅ ${t('settings.uploader.active', this.plugin.settings)}` : t('settings.uploader.use', this.plugin.settings) });
            useBtn.classList.add('mod-cta');
            if (isSelected) {
                useBtn.disabled = true;
            } else {
                useBtn.onclick = async () => {
                    this.plugin.settings.selectedProfileId = profile.id;
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice(t('settings.uploader.switched', this.plugin.settings).replace('{name}', profile.name));
                };
            }
        }
    }

    renderProfileFields(container: HTMLElement, profile: UploaderProfile) {
        if (profile.type === 's3' && profile.s3) {
            this.renderS3Fields(container, profile.s3);
        } else if (profile.type === 'oss' && profile.oss) {
            this.renderOSSFields(container, profile.oss);
        } else if (profile.type === 'github' && profile.github) {
            this.renderGitHubFields(container, profile.github);
        } else if (profile.type === 'webdav' && profile.webdav) {
            this.renderWebDAVFields(container, profile.webdav);
        } else if (profile.type === 'sftp' && profile.sftp) {
            this.renderSFTPFields(container, profile.sftp);
        }
    }

    renderOSSFields(container: HTMLElement, config: OSSConfig) {
        const wrapper = container.createEl('div', { cls: 'picflow-uploader-wrapper' });

        // Provider Switcher
        new Setting(wrapper)
            .setName(t('settings.uploader.oss.provider', this.plugin.settings))
            .setDesc(t('settings.uploader.oss.provider.desc', this.plugin.settings))
            .addDropdown(dropdown => dropdown
                .addOption('aliyun', 'Aliyun OSS')
                .addOption('tencent', 'Tencent COS')
                .setValue(config.provider)
                .onChange(async (value) => {
                    config.provider = value as 'aliyun' | 'tencent';
                    await this.plugin.saveSettings();
                    this.display(); // Refresh fields
                }));

        new Setting(wrapper)
            .setName(config.provider === 'tencent' ? t('settings.uploader.oss.secretId', this.plugin.settings) : t('settings.uploader.oss.accessKeyId', this.plugin.settings))
            .addText(t => t
                .setValue(config.accessKeyId)
                .onChange(async v => {
                    config.accessKeyId = v.trim();
                    await this.plugin.saveSettings();
                }));
        
        new Setting(wrapper)
            .setName(config.provider === 'tencent' ? t('settings.uploader.oss.secretKey', this.plugin.settings) : t('settings.uploader.oss.accessKeySecret', this.plugin.settings))
            .addText(t => t
                .setPlaceholder('********')
                .setValue(config.accessKeySecret)
                .onChange(async v => {
                    config.accessKeySecret = v.trim();
                    await this.plugin.saveSettings();
                }));

        if (config.provider === 'tencent') {
            new Setting(wrapper)
                .setName(t('settings.uploader.oss.appId', this.plugin.settings))
                .setDesc(t('settings.uploader.oss.appId.desc', this.plugin.settings))
                .addText(t => t
                    .setValue(config.appId || '')
                    .onChange(async v => {
                        config.appId = v.trim();
                        await this.plugin.saveSettings();
                    }));
        }
        
        new Setting(wrapper)
            .setName(t('settings.uploader.oss.bucket', this.plugin.settings))
            .addText(t => t
                .setValue(config.bucket)
                .onChange(async v => {
                    config.bucket = v.trim();
                    await this.plugin.saveSettings();
                }));
        
        // Region field removed as requested. SDK will handle endpoint detection via other means or default.
        // If users need specific region endpoints, they can use Custom Domain or we can rely on SDK defaults.
        // For Aliyun/Tencent, Region is usually needed to construct the default endpoint string if Custom Domain is missing.
        // But user explicitly said "Aliyun and Tencent Cloud do not need Region".
        // We will respect that and remove the UI.
        // Note: Without Region, we cannot construct standard endpoints like oss-cn-hangzhou.aliyuncs.com automatically
        // unless we use a global endpoint or rely solely on Custom Domain.
        // Assuming user will provide Custom Domain OR the SDK can handle it (which usually needs region).
        // If user insists, we remove it.

        new Setting(wrapper)
            .setName(t('settings.uploader.oss.pathPrefix', this.plugin.settings))
            .setDesc(t('settings.uploader.oss.pathPrefix.desc', this.plugin.settings))
            .addText(t => t
                .setValue(config.pathPrefix)
                .onChange(async v => {
                    config.pathPrefix = v.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(wrapper)
            .setName(t('settings.uploader.oss.customDomain', this.plugin.settings))
            .setDesc(t('settings.uploader.oss.customDomain.desc', this.plugin.settings))
            .addText(t => t
                .setValue(config.customDomain)
                .onChange(async v => {
                    config.customDomain = v.trim();
                    await this.plugin.saveSettings();
                }))
            .addButton(btn => btn
                .setButtonText('Auto Fetch')
                .setTooltip('Try to fetch bucket domain')
                .onClick(async () => {
                    if (!config.accessKeyId || !config.accessKeySecret || !config.bucket) {
                         new Notice('Please fill in Access Key, Secret and Bucket first.');
                         return;
                    }

                    btn.setDisabled(true);
                    btn.setButtonText('Fetching...');

                    try {
                        const { OSSUploader } = require('./uploaders/oss');
                        const uploader = new OSSUploader(config);
                        const domain = await uploader.autoFetchDomain();
                        
                        if (domain) {
                            config.customDomain = domain;
                            await this.plugin.saveSettings();
                            this.display();
                            new Notice('Domain fetched successfully!');
                        } else {
                            new Notice('Could not detect a custom domain. Please enter manually.');
                        }
                    } catch (e) {
                        console.error(e);
                        new Notice('Failed to fetch domain: ' + e.message);
                    } finally {
                        btn.setDisabled(false);
                        btn.setButtonText('Auto Fetch');
                    }
                }));

        new Setting(wrapper)
            .setName(t('settings.uploader.uploadStrategy', this.plugin.settings))
            .setDesc(t('settings.uploader.uploadStrategy.tip', this.plugin.settings))
            .addDropdown(d => d
                .addOption('rename', t('settings.uploader.uploadStrategy.rename', this.plugin.settings))
                .addOption('overwrite', t('settings.uploader.uploadStrategy.overwrite', this.plugin.settings))
                .addOption('skip', t('settings.uploader.uploadStrategy.skip', this.plugin.settings))
                .setValue(config.uploadStrategy)
                .onChange(async v => {
                    config.uploadStrategy = v as any;
                    await this.plugin.saveSettings();
                }));
    }

    renderS3Fields(container: HTMLElement, config: S3Config) {
        new Setting(container)
            .setName(t('settings.uploader.s3.endpoint', this.plugin.settings))
            .addText(t => t
                .setValue(config.endpoint)
                .onChange(async v => {
                    config.endpoint = v.trim();
                    await this.plugin.saveSettings();
                }));
        
        new Setting(container)
            .setName(t('settings.uploader.s3.region', this.plugin.settings))
            .addText(t => t
                .setValue(config.region)
                .onChange(async v => {
                    config.region = v.trim();
                    await this.plugin.saveSettings();
                }));
        
        new Setting(container)
            .setName(t('settings.uploader.s3.bucket', this.plugin.settings))
            .addText(t => t
                .setValue(config.bucket)
                .onChange(async v => {
                    config.bucket = v.trim();
                    await this.plugin.saveSettings();
                }));
        
        new Setting(container)
            .setName(t('settings.uploader.s3.accessKeyId', this.plugin.settings))
            .addText(t => t
                .setValue(config.accessKeyId)
                .onChange(async v => {
                    config.accessKeyId = v.trim();
                    await this.plugin.saveSettings();
                }));
        
        new Setting(container)
            .setName(t('settings.uploader.s3.secretAccessKey', this.plugin.settings))
            .addText(t => t
                .setPlaceholder('********')
                .setValue(config.secretAccessKey)
                .onChange(async v => {
                    config.secretAccessKey = v.trim();
                    await this.plugin.saveSettings();
                }));
        
        new Setting(container)
            .setName(t('settings.uploader.s3.pathPrefix', this.plugin.settings))
            .addText(t => t
                .setValue(config.pathPrefix)
                .onChange(async v => {
                    config.pathPrefix = v.trim();
                    await this.plugin.saveSettings();
                }));
        
        new Setting(container)
            .setName(t('settings.uploader.s3.customDomain', this.plugin.settings))
            .addText(t => t
                .setValue(config.customDomain)
                .onChange(async v => {
                    config.customDomain = v.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName(t('settings.uploader.s3.forcePathStyle', this.plugin.settings))
            .addToggle(t => t
                .setValue(config.forcePathStyle)
                .onChange(async v => {
                    config.forcePathStyle = v;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(container)
            .setName(t('settings.uploader.s3.useSSL', this.plugin.settings))
            .addToggle(t => t
                .setValue(config.useSSL)
                .onChange(async v => {
                    config.useSSL = v;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(container)
            .setName(t('settings.uploader.s3.bypassCertificateValidation', this.plugin.settings))
            .addToggle(t => t
                .setValue(config.bypassCertificateValidation)
                .onChange(async v => {
                    config.bypassCertificateValidation = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(container)
            .setName(t('settings.uploader.uploadStrategy', this.plugin.settings))
            .setDesc(t('settings.uploader.uploadStrategy.tip', this.plugin.settings))
            .addDropdown(d => d
                .addOption('rename', t('settings.uploader.uploadStrategy.rename', this.plugin.settings))
                .addOption('overwrite', t('settings.uploader.uploadStrategy.overwrite', this.plugin.settings))
                .addOption('skip', t('settings.uploader.uploadStrategy.skip', this.plugin.settings))
                .setValue(config.uploadStrategy)
                .onChange(async v => {
                    config.uploadStrategy = v as any;
                    await this.plugin.saveSettings();
                }));
    }

    renderGitHubFields(container: HTMLElement, config: GitHubConfig) {
        new Setting(container).setName(t('settings.uploader.github.owner', this.plugin.settings)).addText(t => t.setValue(config.owner).onChange(v => config.owner = v));
        new Setting(container).setName(t('settings.uploader.github.repo', this.plugin.settings)).addText(t => t.setValue(config.repo).onChange(v => config.repo = v));
        new Setting(container).setName(t('settings.uploader.github.branch', this.plugin.settings)).addText(t => t.setValue(config.branch).onChange(v => config.branch = v));
        new Setting(container).setName(t('settings.uploader.github.token', this.plugin.settings)).addText(t => t.setPlaceholder('ghp_...').setValue(config.token).onChange(v => config.token = v));

        new Setting(container)
            .setName(t('settings.uploader.github.customDomain', this.plugin.settings))
            .setDesc(t('settings.uploader.github.customDomain.desc', this.plugin.settings))
            .addText(t => t.setValue(config.customDomain || '').onChange(v => config.customDomain = v));

        new Setting(container).setName(t('settings.uploader.github.cdnProxy', this.plugin.settings))
            .addDropdown(d => d.addOption('jsdelivr', 'jsDelivr').addOption('custom', 'Custom').addOption('none', 'None')
                .setValue(config.cdnProxy).onChange(v => {
                    config.cdnProxy = v as any;
                    this.display();
                }));

        if (config.cdnProxy === 'custom') {
            new Setting(container).setName(t('settings.uploader.github.customCdnUrl', this.plugin.settings)).addText(t => t.setValue(config.customCdnUrl).onChange(v => config.customCdnUrl = v));
        }

        new Setting(container).setName(t('settings.uploader.github.proxyUrl', this.plugin.settings)).addText(t => t.setValue(config.proxyUrl).onChange(v => config.proxyUrl = v));
        new Setting(container).setName(t('settings.uploader.uploadStrategy', this.plugin.settings))
            .setDesc(t('settings.uploader.uploadStrategy.tip', this.plugin.settings))
            .addDropdown(d => d.addOption('rename', t('settings.uploader.uploadStrategy.rename', this.plugin.settings))
                .addOption('overwrite', t('settings.uploader.uploadStrategy.overwrite', this.plugin.settings))
                .addOption('skip', t('settings.uploader.uploadStrategy.skip', this.plugin.settings))
                .setValue(config.uploadStrategy).onChange(v => config.uploadStrategy = v as any));
    }

    renderWebDAVFields(container: HTMLElement, config: WebDAVConfig) {
        const wrapper = container.createEl('div', { cls: 'picflow-uploader-wrapper' });
        
        // Content inside wrapper
        new Setting(wrapper).setName(t('settings.uploader.webdav.host', this.plugin.settings)).addText(t => t.setValue(config.host).onChange(v => config.host = v));
        new Setting(wrapper).setName(t('settings.uploader.webdav.username', this.plugin.settings)).addText(t => t.setValue(config.username).onChange(v => config.username = v));
        new Setting(wrapper).setName(t('settings.uploader.webdav.password', this.plugin.settings)).addText(t => t.setPlaceholder('********').setValue(config.password).onChange(v => config.password = v));
        new Setting(wrapper).setName(t('settings.uploader.webdav.uploadPath', this.plugin.settings)).addText(t => t.setValue(config.uploadPath).onChange(v => config.uploadPath = v));

        new Setting(wrapper)
            .setName(t('settings.uploader.webdav.customDomain', this.plugin.settings))
            .setDesc(t('settings.uploader.webdav.customDomain.desc', this.plugin.settings))
            .addText(t => t.setValue(config.customDomain || '').onChange(v => config.customDomain = v));

        new Setting(wrapper)
            .setName(t('settings.uploader.s3.bypassCertificateValidation', this.plugin.settings))
            .setDesc(t('settings.uploader.s3.bypassCertificateValidation.desc', this.plugin.settings))
            .addToggle(t => t.setValue(config.bypassCertificateValidation ?? false).onChange(v => config.bypassCertificateValidation = v));

        new Setting(wrapper).setName(t('settings.uploader.uploadStrategy', this.plugin.settings))
            .setDesc(t('settings.uploader.uploadStrategy.tip', this.plugin.settings))
            .addDropdown(d => d.addOption('rename', t('settings.uploader.uploadStrategy.rename', this.plugin.settings))
                .addOption('overwrite', t('settings.uploader.uploadStrategy.overwrite', this.plugin.settings))
                .addOption('skip', t('settings.uploader.uploadStrategy.skip', this.plugin.settings))
                .setValue(config.uploadStrategy).onChange(v => config.uploadStrategy = v as any));
    }

    renderSFTPFields(container: HTMLElement, config: SFTPConfig) {
        const wrapper = container.createEl('div', { cls: 'picflow-uploader-wrapper' });

        new Setting(wrapper).setName(t('settings.uploader.sftp.host', this.plugin.settings)).addText(t => t.setValue(config.host).onChange(v => config.host = v));
        new Setting(wrapper).setName(t('settings.uploader.sftp.port', this.plugin.settings)).addText(t => t.setValue(config.port.toString()).onChange(v => config.port = parseInt(v)));
        new Setting(wrapper).setName(t('settings.uploader.sftp.username', this.plugin.settings)).addText(t => t.setValue(config.username).onChange(v => config.username = v));
        new Setting(wrapper).setName(t('settings.uploader.sftp.password', this.plugin.settings)).addText(t => t.setPlaceholder('********').setValue(config.password).onChange(v => config.password = v));
        new Setting(wrapper).setName(t('settings.uploader.sftp.privateKey', this.plugin.settings)).addTextArea(t => t.setPlaceholder('-----BEGIN RSA PRIVATE KEY-----').setValue(config.privateKey).onChange(v => config.privateKey = v));
        new Setting(wrapper).setName(t('settings.uploader.sftp.uploadPath', this.plugin.settings)).addText(t => t.setValue(config.uploadPath).onChange(v => config.uploadPath = v));

        new Setting(wrapper)
            .setName(t('settings.uploader.sftp.customDomain', this.plugin.settings))
            .setDesc(t('settings.uploader.sftp.customDomain.desc', this.plugin.settings))
            .addText(t => t.setValue(config.customDomain || '').onChange(v => config.customDomain = v));

        new Setting(wrapper).setName(t('settings.uploader.uploadStrategy', this.plugin.settings))
            .setDesc(t('settings.uploader.uploadStrategy.tip', this.plugin.settings))
            .addDropdown(d => d.addOption('rename', t('settings.uploader.uploadStrategy.rename', this.plugin.settings))
                .addOption('overwrite', t('settings.uploader.uploadStrategy.overwrite', this.plugin.settings))
                .addOption('skip', t('settings.uploader.uploadStrategy.skip', this.plugin.settings))
                .setValue(config.uploadStrategy).onChange(v => config.uploadStrategy = v as any));

        // Test Connection Button
        new Setting(wrapper)
            .setName(t('settings.uploader.testConnection', this.plugin.settings))
            .setDesc(t('settings.uploader.testConnection.desc', this.plugin.settings))
            .addButton(btn => btn
                .setButtonText(t('settings.uploader.testConnection.btn', this.plugin.settings))
                .onClick(async () => {
                    btn.setDisabled(true);
                    btn.setButtonText('Testing...');

                    try {
                        const uploader = new SFTPUploader(config);
                        const result = await uploader.testConnection();

                        if (result.success) {
                            new Notice(`✅ ${result.message}`);
                        } else {
                            new Notice(`❌ ${result.message}`);
                        }
                    } catch (e) {
                        new Notice(`❌ Error: ${e.message}`);
                    } finally {
                        btn.setDisabled(false);
                        btn.setButtonText(t('settings.uploader.testConnection.btn', this.plugin.settings));
                    }
                }));
    }

    renderImageMigrationTab(containerEl: HTMLElement) {
        const isPro = this.plugin.settings.licenseStatus === 'valid';

        // --- Image Processing (Moved from General) ---
        new Setting(containerEl)
            .setName(t('settings.general.imageProcessing.title', this.plugin.settings))
            .setHeading();

        const ipWrapper = containerEl.createEl('div', { cls: 'picflow-pro-wrapper' });
        ipWrapper.addClass('picflow-settings-group-wrapper');

        if (!isPro) {
            const header = ipWrapper.createEl('div', { cls: 'picflow-pro-header' });
            header.addClass('picflow-pro-header-style');

            const label = header.createEl('span', { text: t('settings.pro.label', this.plugin.settings) });
            label.addClass('picflow-pro-label');

            const activateBtn = new ButtonComponent(header)
                .setButtonText(t('settings.pro.btn.activate', this.plugin.settings))
                .setClass('mod-cta')
                .onClick(() => {
                    this.currentTab = 'Status';
                    this.display();
                    // Removed highlight animation
                    setTimeout(() => {
                        const licenseContainer = document.querySelector('.picflow-license-container');
                        if (licenseContainer) {
                            licenseContainer.scrollIntoView({ behavior: 'smooth' });
                        }
                    }, 100);
                });
            activateBtn.buttonEl.addClass('picflow-pro-activate-btn');
        }

        // Auto Compress
        new Setting(ipWrapper)
            .setName(t('settings.general.compress', this.plugin.settings))
            .setDesc(t('settings.general.compress.desc', this.plugin.settings))
            .addToggle(t => t
                .setValue(this.plugin.settings.compressImage)
                .setDisabled(!isPro)
                .onChange(async (value) => {
                    this.plugin.settings.compressImage = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to show/hide quality slider
                })
            );

        if (this.plugin.settings.compressImage && isPro) {
            const qualitySetting = new Setting(ipWrapper)
                .setName(t('settings.general.compress.quality', this.plugin.settings))
                .setDesc(t('settings.general.compress.quality.desc', this.plugin.settings))
                .addSlider(slider => slider
                    .setLimits(10, 100, 5)
                    .setValue(this.plugin.settings.compressQuality)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.compressQuality = value;
                        await this.plugin.saveSettings();
                    })
                );
        }

        // Watermark
        new Setting(ipWrapper)
            .setName(t('settings.general.watermark', this.plugin.settings))
            .setDesc(t('settings.general.watermark.desc', this.plugin.settings))
            .addToggle(t => t
                .setValue(this.plugin.settings.addWatermark)
                .setDisabled(!isPro)
                .onChange(async (value) => {
                    this.plugin.settings.addWatermark = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh
                })
            );

        if (this.plugin.settings.addWatermark && isPro) {
            const wmWrapper = ipWrapper.createEl('div', { cls: 'picflow-watermark-wrapper' });
            // Styles moved to CSS class .picflow-watermark-wrapper

            // Preview Container
            const previewContainer = wmWrapper.createEl('div', { cls: 'picflow-watermark-preview' });
            // Styles moved to CSS class .picflow-watermark-preview

            const previewImg = previewContainer.createEl('img', { cls: 'picflow-watermark-preview__img' });
            // Styles moved to CSS class .picflow-watermark-preview__img

            const updatePreview = () => {
                const dataUrl = ImageProcessor.generatePreview(this.plugin.settings);
                previewImg.src = dataUrl;
            };

            // Initial Preview
            updatePreview();

            new Setting(wmWrapper)
                .setName(t('settings.general.watermark.text', this.plugin.settings))
                .setDesc(t('settings.general.watermark.text.desc', this.plugin.settings))
                .addText(text => text
                    .setValue(this.plugin.settings.watermarkText)
                    .onChange(async (value) => {
                        this.plugin.settings.watermarkText = value;
                        await this.plugin.saveSettings();
                        updatePreview();
                    })
                );

            new Setting(wmWrapper)
                .setName(t('settings.general.watermark.position', this.plugin.settings))
                .setDesc(t('settings.general.watermark.position.desc', this.plugin.settings))
                .addDropdown(dropdown => dropdown
                    .addOption('top-left', t('settings.general.watermark.position.topLeft', this.plugin.settings))
                    .addOption('top-right', t('settings.general.watermark.position.topRight', this.plugin.settings))
                    .addOption('bottom-left', t('settings.general.watermark.position.bottomLeft', this.plugin.settings))
                    .addOption('bottom-right', t('settings.general.watermark.position.bottomRight', this.plugin.settings))
                    .addOption('center', t('settings.general.watermark.position.center', this.plugin.settings))
                    .setValue(this.plugin.settings.watermarkPosition)
                    .onChange(async (value) => {
                        this.plugin.settings.watermarkPosition = value as any;
                        await this.plugin.saveSettings();
                        updatePreview();
                    })
                );

            // Color
            new Setting(wmWrapper)
                .setName(t('settings.general.watermark.color', this.plugin.settings))
                .setDesc(t('settings.general.watermark.color.desc', this.plugin.settings))
                .addColorPicker(color => color
                    .setValue(this.plugin.settings.watermarkColor)
                    .onChange(async (value) => {
                        this.plugin.settings.watermarkColor = value;
                        await this.plugin.saveSettings();
                        updatePreview();
                    })
                );

            // Font Size
            new Setting(wmWrapper)
                .setName(t('settings.general.watermark.fontSize', this.plugin.settings))
                .setDesc(t('settings.general.watermark.fontSize.desc', this.plugin.settings))
                .addSlider(slider => slider
                    .setLimits(10, 100, 2)
                    .setValue(this.plugin.settings.watermarkFontSize)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.watermarkFontSize = value;
                        await this.plugin.saveSettings();
                        updatePreview();
                    })
                );

            // Opacity
            new Setting(wmWrapper)
                .setName(t('settings.general.watermark.opacity', this.plugin.settings))
                .setDesc(t('settings.general.watermark.opacity.desc', this.plugin.settings))
                .addSlider(slider => slider
                    .setLimits(0, 100, 5)
                    .setValue(this.plugin.settings.watermarkOpacity)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.watermarkOpacity = value;
                        await this.plugin.saveSettings();
                        updatePreview();
                    })
                );
        }

        // --- Vault Migration Tool (Pro) ---
        new Setting(containerEl)
            .setName(t('settings.advanced.migration.title', this.plugin.settings))
            .setHeading();

        const migrationWrapper = containerEl.createEl('div', { cls: 'picflow-pro-wrapper' });
        migrationWrapper.addClass('picflow-settings-group-wrapper');

        if (!isPro) {
            const header = migrationWrapper.createEl('div', { cls: 'picflow-pro-header' });
            header.addClass('picflow-pro-header-style');

            const label = header.createEl('span', { text: t('settings.advanced.migration.proFeature', this.plugin.settings) });
            label.addClass('picflow-pro-label');

            const activateBtn = new ButtonComponent(header)
                .setButtonText(t('settings.pro.btn.activate', this.plugin.settings))
                .setClass('mod-cta')
                .onClick(() => {
                    this.currentTab = 'Status';
                    this.display();
                    // Removed highlight animation
                    setTimeout(() => {
                        const licenseContainer = document.querySelector('.picflow-license-container');
                        if (licenseContainer) {
                            licenseContainer.scrollIntoView({ behavior: 'smooth' });
                        }
                    }, 100);
                });
            activateBtn.buttonEl.addClass('picflow-pro-activate-btn');
        }

        migrationWrapper.createEl('p', { text: t('settings.advanced.migration.desc', this.plugin.settings) });

        // --- Migration Configuration & Actions (Inline) ---
        
        const configGroup = migrationWrapper.createEl('div', { cls: 'picflow-migration-config-group' });

        // 1. Target Profile Selector
        const targetContainer = configGroup.createEl('div', { cls: 'picflow-migration-config-row' });
        
        const targetLabel = targetContainer.createEl('span', { text: t('migration.config.target', this.plugin.settings) });
        
        const targetSelect = targetContainer.createEl('select');
        
        this.plugin.settings.profiles.forEach(p => {
            const option = targetSelect.createEl('option', { text: `${p.name} (${p.type})`, value: p.id });
            if (p.id === this.plugin.settings.selectedProfileId) option.selected = true;
        });

        // 2. Include Remote Toggle
        const scopeContainer = configGroup.createEl('div', { cls: 'picflow-migration-config-row' });

        const scopeLabel = scopeContainer.createEl('span', { text: t('migration.config.remote', this.plugin.settings) });
        
        // Directly create a toggle component without the Setting wrapper overhead
        const toggleContainer = scopeContainer.createEl('div', { cls: 'checkbox-container' });
        if (this.plugin.migrationManager.includeRemote) toggleContainer.addClass('is-enabled');
        
        toggleContainer.onclick = () => {
            const newState = !this.plugin.migrationManager.includeRemote;
            this.plugin.migrationManager.includeRemote = newState;
            
            if (newState) {
                toggleContainer.addClass('is-enabled');
            } else {
                toggleContainer.removeClass('is-enabled');
            }
        };
        
        const migrationTip = configGroup.createEl('div', { cls: 'setting-item-description' });
        migrationTip.addClass('picflow-migration-tip');
        migrationTip.setText(t('migration.config.tip', this.plugin.settings));
        
        // 3. Action Buttons
        const actionRow = migrationWrapper.createEl('div', { cls: 'picflow-migration-actions' });

        // Scan Button
        const scanBtn = new ButtonComponent(actionRow)
            .setButtonText(t('migration.inline.scan', this.plugin.settings)) // "Scan Vault"
            .onClick(async () => {
                // [NEW] License Check
                if (!this.plugin.settings.licenseKey || this.plugin.settings.licenseStatus !== 'valid') {
                    new Notice(t('settings.uploader.proFeature.desc', this.plugin.settings));
                    this.currentTab = 'Status';
                    this.display();
                    return;
                }

                scanBtn.setDisabled(true);
                scanBtn.setButtonText(t('migration.inline.scanning', this.plugin.settings));
                
                // Clear previous results
                resultsContainer.empty();
                
                const files = await this.plugin.migrationManager.scanVault(this.plugin.migrationManager.includeRemote);
                
                scanBtn.setDisabled(false);
                scanBtn.setButtonText(t('migration.inline.scan', this.plugin.settings));
                
                // Render Results
                this.renderMigrationResults(resultsContainer, files, targetSelect.value);
            });

        // 4. Results Container (Hidden by default)
        const resultsContainer = migrationWrapper.createEl('div', { cls: 'picflow-migration-results' });
        
        // If manager has state (e.g. from previous scan), render it
        if (this.plugin.migrationManager.files.length > 0) {
             this.renderMigrationResults(resultsContainer, this.plugin.migrationManager.files, targetSelect.value);
        }
    }

    renderMigrationResults(container: HTMLElement, files: any[], targetProfileId: string) {
        container.empty();
        
        const totalImages = files.reduce((acc, f) => acc + f.images.length, 0);
        
        if (totalImages === 0) {
            container.createEl('div', { text: t('migration.list.empty', this.plugin.settings), cls: 'picflow-text-muted' });
            return;
        }

        // Stats Header
        const statsHeader = container.createEl('div', { cls: 'picflow-migration-stats-header' });
        statsHeader.setText(t('migration.inline.found', this.plugin.settings)
            .replace('{images}', totalImages.toString())
            .replace('{files}', files.length.toString()));

        // Start Migration Button (Contextual)
        const startBtn = new ButtonComponent(container)
            .setButtonText(t('migration.inline.start', this.plugin.settings))
            .setCta()
            .setDisabled(this.plugin.migrationManager.isMigrating)
            .onClick(async () => {
                // Pro Check
                if (this.plugin.settings.licenseStatus !== 'valid') {
                    new Notice(t('settings.pro.desc', this.plugin.settings));
                    const licenseContainer = document.querySelector('.picflow-license-container');
                    if (licenseContainer) {
                        licenseContainer.scrollIntoView({ behavior: 'smooth' });
                        licenseContainer.addClass('picflow-highlight-pulse');
                        setTimeout(() => {
                            licenseContainer.removeClass('picflow-highlight-pulse');
                        }, 1000);
                    }
                    return;
                }

                startBtn.setDisabled(true);
                startBtn.setButtonText('Migrating...');
                
                // Attach UI updater
                this.plugin.migrationManager.onUpdate = () => {
                    this.renderMigrationResults(container, this.plugin.migrationManager.files, targetProfileId);
                };
                
                await this.plugin.migrationManager.startMigration(targetProfileId);
                
                startBtn.setDisabled(false);
                startBtn.setButtonText(t('migration.inline.start', this.plugin.settings));
                this.plugin.migrationManager.onUpdate = null; // Detach
            });
        
        startBtn.buttonEl.addClass('picflow-migration-start-btn');

        // Scrollable List
        const list = container.createEl('div', { cls: 'picflow-migration-list' });

        files.forEach(file => {
            const fileRow = list.createEl('div', { cls: 'picflow-migration-file-row' });
            
            // File Header (Click to expand)
            const header = fileRow.createEl('div', { cls: 'picflow-migration-file-header' });
            
            const nameSpan = header.createEl('span', { text: file.file.path });
            nameSpan.addClass('picflow-migration-file-name');
            
            // Status Badge
            const statusSpan = header.createEl('span');
            statusSpan.addClass('picflow-migration-file-status');
            
            const pendingCount = file.images.filter((i: any) => i.status === 'pending').length;
            const successCount = file.images.filter((i: any) => i.status === 'success').length;
            const errorCount = file.images.filter((i: any) => i.status === 'error').length;
            
            if (file.status === 'success') {
                statusSpan.setText('✅ Done');
                statusSpan.addClass('picflow-text-success');
            } else if (file.status === 'processing') {
                statusSpan.setText('⏳ Processing...');
                statusSpan.addClass('picflow-text-accent');
            } else if (file.status === 'error') {
                 statusSpan.setText('❌ Error');
                 statusSpan.addClass('picflow-text-error');
            } else {
                statusSpan.setText(`${successCount}/${file.images.length}`);
                statusSpan.addClass('picflow-text-muted');
            }

            // Image List (Details)
            const details = fileRow.createEl('div', { cls: 'picflow-migration-file-details' });
            // details.style.display = 'none'; // Default hidden? Let's keep open for now or toggle
            
            // Toggle Logic
            let isOpen = false;
            header.onclick = () => {
                isOpen = !isOpen;
                details.toggleClass('picflow-block', isOpen);
                details.toggleClass('picflow-hidden', !isOpen);
            };
            details.addClass('picflow-hidden'); // Start closed

            file.images.forEach((img: any) => {
                const imgRow = details.createEl('div', { cls: 'picflow-migration-img-item' });
                
                const pathSpan = imgRow.createEl('span', { text: img.originalPath });
                pathSpan.addClass('picflow-migration-img-path');
                pathSpan.title = img.originalPath;
                
                const imgStatus = imgRow.createEl('span');
                imgStatus.addClass('picflow-migration-img-status');
                if (img.status === 'success') {
                    imgStatus.setText('Uploaded');
                    imgStatus.addClass('success');
                } else if (img.status === 'error') {
                    imgStatus.setText('Error');
                    imgStatus.addClass('error');
                    imgStatus.title = img.errorMsg;
                } else {
                    imgStatus.setText('Pending');
                    imgStatus.addClass('pending');
                }
            });
        });
    }

    renderAlbumTab(containerEl: HTMLElement) {
        // --- Album Management ---
        // Layout: Grid view (Grid View), top Tab to switch different image hosting configurations.

        // 1. Profile Switcher (Tabs)
        const profileTabsContainer = containerEl.createEl('div', { cls: 'picflow-album-tabs' });

        const profiles = this.plugin.settings.profiles;
        if (profiles.length === 0) {
            containerEl.createEl('div', { text: t('settings.uploader.status.none', this.plugin.settings), cls: 'picflow-empty-state' });
            return;
        }

        // Use internal state to track active profile for Album view, default to first or selected
        let activeProfileId = this.plugin.settings.selectedProfileId || profiles[0].id;

        // Render Tabs
        profiles.forEach(profile => {
            const tabBtn = profileTabsContainer.createEl('button', { text: profile.name });
            tabBtn.classList.add('picflow-album-tab-btn');
            if (profile.id === activeProfileId) {
                tabBtn.classList.add('active');
            }

            tabBtn.onclick = () => {
                // Switch tab logic (re-render just the grid part ideally, but full re-render is easier)
                // We need to store the active album profile somewhere if we want it to persist?
                // For now, just simple UI switch simulation
                activeProfileId = profile.id;

                // Update tab styles
                profileTabsContainer.querySelectorAll('.picflow-album-tab-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                tabBtn.classList.add('active');

                // Reload Grid
                this.loadAlbumGrid(albumWrapper, profile);
            };
        });

        // 2. Toolbar (Batch Actions)
        const toolbar = containerEl.createEl('div', { cls: 'picflow-album-toolbar' });

        const refreshBtn = new ButtonComponent(toolbar)
            .setIcon('refresh-cw')
            .setTooltip('Refresh')
            .onClick(() => {
                const profile = profiles.find(p => p.id === activeProfileId);
                if (profile) this.loadAlbumGrid(albumWrapper, profile);
            });

        // 3. Grid Container Wrapper
        const albumWrapper = containerEl.createEl('div', { cls: 'picflow-album-wrapper' });

        // Load initial data
        const initialProfile = profiles.find(p => p.id === activeProfileId);
        if (initialProfile) {
            this.loadAlbumGrid(albumWrapper, initialProfile);
        }
    }

    async loadAlbumGrid(container: HTMLElement, profile: UploaderProfile, append: boolean = false) {
        if (!append) {
            container.empty();
            this.currentAlbumOffset = 0;
        }

        // Get or Create Grid
        let gridContainer = container.querySelector('.picflow-album-grid') as HTMLElement;
        if (!gridContainer) {
            gridContainer = container.createEl('div', { cls: 'picflow-album-grid' });
        }

        // Remove existing Load More button if any (we will re-add it at bottom)
        const existingLoadMore = container.querySelector('.picflow-album-load-more');
        if (existingLoadMore) existingLoadMore.remove();

        const loadingEl = container.createEl('div', { cls: 'picflow-album-loading' });
        loadingEl.setText(append ? 'Loading more...' : `Loading images from ${profile.name}...`);

        try {
            let uploader: Uploader | null = null;
            let proxySettings: any = { ...this.plugin.settings };

            // Instantiate Uploader based on profile type
            if (profile.type === 's3' && profile.s3) {
                Object.assign(proxySettings, {
                    s3Endpoint: profile.s3.endpoint,
                    s3Region: profile.s3.region,
                    s3Bucket: profile.s3.bucket,
                    s3AccessKeyId: profile.s3.accessKeyId,
                    s3SecretAccessKey: profile.s3.secretAccessKey,
                    s3PathPrefix: profile.s3.pathPrefix,
                    s3CustomDomain: profile.s3.customDomain,
                    s3ForcePathStyle: profile.s3.forcePathStyle,
                    s3UseSSL: profile.s3.useSSL,
                    s3BypassCertificateValidation: profile.s3.bypassCertificateValidation,
                    uploadStrategy: profile.s3.uploadStrategy
                });
                uploader = new S3Uploader(proxySettings);
            } else if (profile.type === 'oss' && profile.oss) {
                uploader = new OSSUploader(profile.oss);
            } else if (profile.type === 'github' && profile.github) {
                Object.assign(proxySettings, {
                    githubOwner: profile.github.owner,
                    githubRepo: profile.github.repo,
                    githubBranch: profile.github.branch,
                    githubToken: profile.github.token,
                    githubCustomDomain: profile.github.customDomain,
                    githubCdnProxy: profile.github.cdnProxy,
                    githubCustomCdnUrl: profile.github.customCdnUrl,
                    proxyUrl: profile.github.proxyUrl,
                    uploadStrategy: profile.github.uploadStrategy
                });
                uploader = new GitHubUploader(proxySettings);
            } else if (profile.type === 'webdav' && profile.webdav) {
                uploader = new WebDAVUploader(profile.webdav);
            } else if (profile.type === 'sftp' && profile.sftp) {
                uploader = new SFTPUploader(profile.sftp);
            }

            if (uploader && uploader.list) {
                const images = await uploader.list(this.currentAlbumOffset, this.currentAlbumLimit);
                loadingEl.remove();

                if (images.length === 0 && !append) {
                    if (gridContainer) gridContainer.remove();
                    const emptyEl = container.createEl('div', { text: 'No images found.' });
                    emptyEl.addClass('picflow-album-loading');
                    return;
                }

                if (images.length === 0 && append) {
                    new Notice('No more images.');
                    return;
                }

                images.forEach(img => {
                    const card = gridContainer.createEl('div', { cls: 'picflow-album-card' });

                    // Image Container
                    const imgContainer = card.createEl('div', { cls: 'picflow-album-card-img-container' });

                    const imgEl = imgContainer.createEl('img');
                    imgEl.src = img.url;

                    // Handle Load Error
                    imgEl.onerror = () => {
                        imgEl.addClass('picflow-hidden');
                        const fallback = imgContainer.createEl('div');
                        fallback.addClass('picflow-flex-column');
                        fallback.addClass('picflow-align-center');
                        fallback.addClass('picflow-justify-center');
                        fallback.addClass('picflow-gap-10'); // gap-5 not defined, use gap-10 or create gap-5
                        fallback.addClass('picflow-muted-text');

                        const icon = fallback.createEl('span', { text: '🚫' });
                        icon.addClass('picflow-text-24');

                        const text = fallback.createEl('span', { text: 'Load Failed' });
                        text.addClass('picflow-text-10');
                    };

                    // Actions Overlay
                    const actions = card.createEl('div', { cls: 'picflow-card-actions' });

                    // Copy URL
                    const copyBtn = actions.createEl('button', { text: '🔗' });
                    copyBtn.title = 'Copy URL';
                    copyBtn.onclick = (e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(img.url);
                        new Notice('URL Copied');
                    };

                    // Insert to Note
                    const insertBtn = actions.createEl('button', { text: '📝' });
                    insertBtn.title = 'Insert to Note';
                    insertBtn.onclick = (e) => {
                        e.stopPropagation();
                        // Find active markdown view
                        // We need to access app from plugin
                        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (view) {
                            const editor = view.editor;
                            editor.replaceSelection(`![](${img.url})`);
                            new Notice('Inserted into note');
                        } else {
                            new Notice('No active Markdown file open');
                        }
                    };

                    // Rename (Coming Soon)
                    const editBtn = actions.createEl('button', { text: '✏️' });
                    editBtn.title = t('settings.album.renameComingSoon', this.plugin.settings);
                    editBtn.addClass('picflow-muted-text');
                    editBtn.setCssProps({ cursor: 'not-allowed' }); // cursor: not-allowed is specific
                    editBtn.onclick = (e) => {
                        e.stopPropagation();
                        new Notice(t('settings.album.renameComingSoon', this.plugin.settings));
                    };

                    // Delete
                    const delBtn = actions.createEl('button', { text: '🗑️' });
                    delBtn.title = t('settings.album.delete', this.plugin.settings) || 'Delete';
                    delBtn.addClass('picflow-error-text'); // color: #ff4d4f approx to error text
                    delBtn.onclick = async (e) => {
                        e.stopPropagation();
                        if (!confirm(t('settings.album.deleteConfirm', this.plugin.settings))) return;

                        try {
                            if (uploader && uploader.delete) {
                                delBtn.disabled = true;
                                delBtn.addClass('picflow-opacity-50');
                                new Notice(t('settings.album.deleting', this.plugin.settings));

                                const key = img.key || img.name;
                                const success = await uploader.delete(key);

                                if (success) {
                                    new Notice(t('settings.album.deleted', this.plugin.settings));
                                    card.remove();
                                } else {
                                    new Notice(t('settings.album.deleteFailed', this.plugin.settings));
                                }
                            } else {
                                new Notice(t('settings.album.deleteNotSupported', this.plugin.settings));
                            }
                        } catch (err: any) {
                            new Notice(t('settings.album.deleteError', this.plugin.settings).replace('{error}', err.message));
                            console.error(err);
                        } finally {
                            delBtn.disabled = false;
                            delBtn.removeClass('picflow-opacity-50');
                        }
                    };
                });

                // Update Offset
                this.currentAlbumOffset += images.length;

                // Show Load More Button if we got a full page (assuming there might be more)
                if (images.length === this.currentAlbumLimit) {
                    const loadMoreWrapper = container.createEl('div', { cls: 'picflow-album-load-more' });

                    new ButtonComponent(loadMoreWrapper)
                        .setButtonText('Load More')
                        .onClick(() => {
                            this.loadAlbumGrid(container, profile, true);
                        });
                }

            } else {
                container.empty();
                const msgEl = container.createEl('div', { text: `Album view is not supported for ${profile.type} yet.` });
                msgEl.addClass('picflow-album-loading');
            }

        } catch (e: any) {
            console.error(e);
            container.empty();
            const errorEl = container.createEl('div');
            errorEl.addClass('picflow-album-loading');
            errorEl.addClass('picflow-error-text');
            errorEl.createEl('p', { text: 'Error loading album:' });
            
            let msg = e.message;
            if (msg && msg.includes("S3 Configuration is incomplete")) {
                 msg = t('error.s3ConfigIncomplete', this.plugin.settings);
            }
            errorEl.createEl('code', { text: msg });
        }
    }

    renderPublishingTab(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName(t('settings.publishing.title', this.plugin.settings))
            .setHeading();

        // Accordion for Platforms
        const platformList = containerEl.createEl('div', { cls: 'picflow-platform-list' });
        // Padding bottom for floating button
        platformList.addClass('picflow-pb-60');

        const platforms = [
            { id: 'wechat', name: t('platform.wechat', this.plugin.settings), icon: PLATFORM_ICONS.wechat },
            { id: 'zhihu', name: t('platform.zhihu', this.plugin.settings), icon: PLATFORM_ICONS.zhihu },
            { id: 'juejin', name: t('platform.juejin', this.plugin.settings), icon: PLATFORM_ICONS.juejin },
            { id: 'csdn', name: t('platform.csdn', this.plugin.settings), icon: PLATFORM_ICONS.csdn },
            { id: 'weibo', name: t('platform.weibo', this.plugin.settings), icon: PLATFORM_ICONS.weibo },
            { id: 'bilibili', name: t('platform.bilibili', this.plugin.settings), icon: PLATFORM_ICONS.bilibili },
        ];

        // [NEW] "Custom Platforms" Accordion Item
        platforms.push({
            id: 'custom_platforms_group',
            name: t('settings.customPlatform.title', this.plugin.settings),
            icon: '🔌'
        });

        platforms.forEach(p => {
            const wrapper = platformList.createEl('div', { cls: 'picflow-platform-wrapper' });

            const header = wrapper.createEl('div', { cls: 'picflow-platform-header' });

            // Toggle Expand
            header.onclick = (e) => {
                if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
                if (this.expandedPlatformId === p.id) {
                    this.expandedPlatformId = null;
                } else {
                    this.expandedPlatformId = p.id;
                }
                this.display();
            };

            const left = header.createEl('div', { cls: 'picflow-platform-header__left' });
            
            const iconSpan = left.createEl('span', { cls: 'picflow-platform-icon' });
            iconSpan.innerHTML = p.icon || '📱';

            const nameSpan = left.createEl('span', { text: p.name });
            nameSpan.addClass('picflow-platform-name');

            const right = header.createEl('div', { cls: 'picflow-platform-header__right' });

            // Special Handling for "Custom Platforms" Group
            if (p.id === 'custom_platforms_group') {
                 // Add Custom Platform Button in Header
                 const addBtn = right.createEl('button', { text: t('settings.customPlatform.add', this.plugin.settings) }); // Reuse "Add Account" text or new one
                 addBtn.addClass('picflow-platform-add-btn');
                 addBtn.onclick = (e) => {
                     e.stopPropagation();
                     // License Check
                     if (!this.plugin.settings.licenseKey || this.plugin.settings.licenseStatus !== 'valid') {
                         new Notice(t('settings.uploader.proFeature.desc', this.plugin.settings));
                         this.currentTab = 'Status';
                         this.display();
                         return;
                     }
                     
                     // Open Modal
                     new CustomPlatformModal(this.app, this.plugin, (config: CustomPlatformConfig) => {
                         if (!this.plugin.settings.customPlatforms) this.plugin.settings.customPlatforms = [];
                         this.plugin.settings.customPlatforms.push(config);
                         this.plugin.saveSettings();
                         // Reload publishers
                         // @ts-ignore
                         this.plugin.publishManager.loadCustomPublishers();
                         
                         // Auto-expand custom platform group
                         this.expandedPlatformId = 'custom_platforms_group';
                         this.display();
                     }).open();
                 };
            } else {
                // Standard Platform: Add Account Button
                const addBtn = right.createEl('button', { text: t('settings.publishing.addAccount', this.plugin.settings) });
                addBtn.addClass('picflow-platform-add-btn');
                addBtn.onclick = (e) => {
                    e.stopPropagation();
                    // [NEW] License Check
                    if (!this.plugin.settings.licenseKey || this.plugin.settings.licenseStatus !== 'valid') {
                        new Notice(t('settings.uploader.proFeature.desc', this.plugin.settings));
                        this.currentTab = 'Status';
                        this.display();
                        return;
                    }

                    this.plugin.accountManager.addAccount(p.id, () => {
                        this.expandedPlatformId = p.id;
                        this.display(); 
                    });
                };
            }

            const arrow = right.createEl('span', { text: this.expandedPlatformId === p.id ? '▼' : '▶' });
            arrow.addClass('picflow-platform-arrow');

            // Body
            if (this.expandedPlatformId === p.id) {
                const body = wrapper.createEl('div', { cls: 'picflow-platform-body' });

                if (p.id === 'custom_platforms_group') {
                    // --- Custom Platforms Body ---
                    
                    // List of Custom Platforms
                    // Use grid layout similar to accounts
                    const customList = body.createEl('div', { cls: 'picflow-platform-grid' });
                    
                    if (!this.plugin.settings.customPlatforms || this.plugin.settings.customPlatforms.length === 0) {
                        const empty = body.createEl('div', { text: 'No custom platforms added.' });
                        empty.addClass('picflow-platform-empty');
                        // Remove grid if empty
                        customList.remove();
                    } else {
                        this.plugin.settings.customPlatforms.forEach(cp => {
                            const card = customList.createEl('div', { cls: 'picflow-account-card' }); 
                            
                            const topRow = card.createEl('div', { cls: 'picflow-account-card-top' });
                            
                            // Icon
                            const iconDiv = topRow.createEl('div', { cls: 'picflow-account-avatar' });
                            // Styles for SVG
                            iconDiv.addClass('picflow-flex-row');
                            iconDiv.addClass('picflow-align-center');
                            iconDiv.addClass('picflow-justify-center');
                            iconDiv.addClass('picflow-w-48');
                            iconDiv.addClass('picflow-h-48');
                            iconDiv.addClass('picflow-bg-secondary');
                            
                            // Use PLATFORM_ICONS if available
                            if (PLATFORM_ICONS[cp.type]) {
                                iconDiv.innerHTML = PLATFORM_ICONS[cp.type];
                                // Adjust SVG size
                                const svg = iconDiv.querySelector('svg');
                                if (svg) {
                                    svg.setAttribute('width', '24');
                                    svg.setAttribute('height', '24');
                                }
                            } else {
                                iconDiv.addClass('picflow-text-24');
                                iconDiv.innerText = cp.type === 'wordpress' ? '📝' : (cp.type === 'dify' ? '🤖' : '🔗');
                            }

                            // Info
                            const infoDiv = topRow.createEl('div', { cls: 'picflow-account-info' });
                            const nameEl = infoDiv.createEl('div', { text: cp.name });
                            nameEl.addClass('picflow-account-name');
                            const typeEl = infoDiv.createEl('div', { text: cp.type.toUpperCase() });
                            typeEl.addClass('picflow-account-status'); // Reuse status style for type
                            typeEl.addClass('picflow-uppercase');

                            // Actions (Edit/Delete) - Similar to "Check Status" link but with icons
                            const actionsDiv = topRow.createEl('div');
                            actionsDiv.addClass('picflow-flex-row');
                            actionsDiv.addClass('picflow-gap-10'); // 8px close enough to 10
                            actionsDiv.addClass('picflow-ml-auto'); // Push to right

                            // Edit
                            const editBtn = actionsDiv.createEl('div', { cls: 'clickable-icon' });
                            editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings-2"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>';
                            editBtn.title = t('settings.customPlatform.edit', this.plugin.settings);
                            editBtn.onclick = () => {
                                const modal = new CustomPlatformModal(this.app, this.plugin, (newConfig: CustomPlatformConfig) => {
                                    Object.assign(cp, newConfig);
                                    this.plugin.saveSettings();
                                    // @ts-ignore
                                    this.plugin.publishManager.loadCustomPublishers();
                                    this.display();
                                });
                                modal.config = { ...cp };
                                modal.open();
                            };

                            // Delete
                            const delBtn = actionsDiv.createEl('div', { cls: 'clickable-icon' });
                            delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
                            delBtn.title = t('settings.customPlatform.delete', this.plugin.settings);
                            delBtn.addClass('picflow-error-text');
                            delBtn.onclick = () => {
                                if (confirm(t('settings.customPlatform.deleteConfirm', this.plugin.settings).replace('{name}', cp.name))) {
                                    this.plugin.settings.customPlatforms = this.plugin.settings.customPlatforms.filter(c => c.id !== cp.id);
                                    this.plugin.saveSettings();
                                    this.display();
                                }
                            };
                        });
                    }

                } else {
                    // --- Standard Platforms Body ---
                    const accounts = this.plugin.accountManager.getAccounts(p.id);

                    if (accounts.length === 0) {
                        const empty = body.createEl('div', { text: 'No accounts added yet.' });
                        empty.addClass('picflow-platform-empty');
                    } else {
                        const grid = body.createEl('div', { cls: 'picflow-platform-grid' });
                        accounts.forEach(acc => {
                            this.renderAccountCard(grid, acc, p.id);
                        });
                    }
                }
            }
        });

        const addCustomContainer = platformList.createEl('div', { cls: 'picflow-add-custom-platform' });
        // addCustomContainer.style.marginTop = '20px';
        // addCustomContainer.style.textAlign = 'center';
        // Removed: Bottom Custom Platform Button
        // const addCustomContainer = platformList.createEl('div', { cls: 'picflow-add-custom-platform' });
        // ...

        // const checkBtnContainer = containerEl.createEl('div', { cls: 'picflow-check-status' });

        // const checkBtn = checkBtnContainer.createEl('button', { text: t('settings.publishing.checkStatus', this.plugin.settings) });
        // checkBtn.classList.add('mod-cta');

        // checkBtn.onclick = () => {
        //     new Notice(t('settings.publishing.checking', this.plugin.settings));
        // };
    }

    renderAccountCard(container: HTMLElement, account: Account, platformId: string) {
        const card = container.createEl('div', { cls: 'picflow-account-card' });

        // Top Row: Avatar + Info + Check Status
        const topRow = card.createEl('div', { cls: 'picflow-account-card-top' });

        // Avatar
        const avatar = topRow.createEl('img', { cls: 'picflow-account-avatar' });
        // Add no-referrer policy to allow loading images from platforms with hotlink protection (like Weibo)
        avatar.setAttribute('referrerpolicy', 'no-referrer');
        
        let avatarSrc = account.avatar;
        // Legacy check: If avatar is the old placeholder, ignore it
        if (avatarSrc && avatarSrc.includes('placeholder.com')) {
            avatarSrc = null;
        }

        // Use a safe default SVG
        const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCI+PC9jaXJjbGU+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMCIgcj0iMyI+PC9jaXJjbGU+PHBhdGggZD0iTTcgMjAuNjYyVjE5YTIgMiAwIDAgMSAyLTJoNmEyIDIgMCAwIDEgMiAydjEuNjYyIj48L3BhdGg+PC9zdmc+';

        // Proxy Weibo images to bypass 403 Forbidden
        if (avatarSrc && (avatarSrc.includes('sinaimg.cn') || avatarSrc.includes('weibo.com'))) {
            // Ensure HTTPS
            if (avatarSrc.startsWith('http://')) avatarSrc = avatarSrc.replace('http://', 'https://');
            // Use WordPress generic image proxy which is reliable for Sina images
            avatarSrc = `https://i0.wp.com/${avatarSrc.replace(/^https?:\/\//, '')}`;
        }

        avatar.src = avatarSrc || defaultAvatar;
        avatar.onerror = () => { 
            // If proxy fails, try original one last time or fallback
            if (avatarSrc && avatarSrc.includes('i0.wp.com')) {
                const original = avatarSrc.replace(/^https:\/\/i0\.wp\.com\//, 'https://');
                avatar.src = original;
                // Avoid infinite loop
                avatar.onerror = () => { avatar.src = defaultAvatar; };
            } else {
                avatar.src = defaultAvatar; 
            }
        };

        // Info
        const infoDiv = topRow.createEl('div', { cls: 'picflow-account-info' });

        const nameEl = infoDiv.createEl('div', { text: account.name });
        nameEl.addClass('picflow-account-name');

        const statusEl = infoDiv.createEl('div', { text: account.status === 'active' ? t('settings.publishing.status.active', this.plugin.settings) : t('settings.publishing.status.expired', this.plugin.settings) });
        statusEl.addClass('picflow-account-status');
        statusEl.toggleClass('active', account.status === 'active');
        statusEl.toggleClass('expired', account.status !== 'active');

        // Check Status Button (Text Link style)
        const checkAction = topRow.createEl('div');
        const checkLink = checkAction.createEl('a', { text: t('settings.publishing.check', this.plugin.settings) });
        checkLink.addClass('picflow-account-check-link');
        checkLink.onclick = async () => {
            new Notice(t('settings.publishing.checkingSingle', this.plugin.settings));
            // In real app, call checkAccountStatus
        };

        // WeChat Specific Fields
        if (platformId === 'wechat') {
            const wechatFields = card.createEl('div', { cls: 'picflow-wechat-fields' });

            // AppID
            const appIdInput = wechatFields.createEl('input', { type: 'text' });
            appIdInput.placeholder = t('settings.publishing.wechat.appId', this.plugin.settings);
            appIdInput.value = account.data?.appId || '';

            // AppSecret
            const appSecretInput = wechatFields.createEl('input', { type: 'password' }); // Use password type for secret
            appSecretInput.placeholder = t('settings.publishing.wechat.appSecret', this.plugin.settings);
            appSecretInput.value = account.data?.appSecret || '';

            // Bottom Actions for WeChat
            const bottomActions = card.createEl('div', { cls: 'picflow-wechat-actions' });

            const tutorialLink = bottomActions.createEl('a', { text: t('settings.publishing.wechat.howToGet', this.plugin.settings) });
            tutorialLink.href = 'https://nexus.nanbowan.top/en/picflow/docs/wechat-config/'; // Replace with actual link

            const saveBtn = bottomActions.createEl('a', { text: t('settings.publishing.wechat.save', this.plugin.settings) });
            saveBtn.addClass('picflow-wechat-save-btn');
            saveBtn.onclick = async () => {
                const appId = appIdInput.value.trim();
                const appSecret = appSecretInput.value.trim();

                // Update account data
                if (!account.data) account.data = {};
                account.data.appId = appId;
                account.data.appSecret = appSecret;

                await this.plugin.accountManager.updateAccount(account.id, { data: account.data });
                new Notice(t('settings.publishing.wechat.saved', this.plugin.settings));
            };
        } else {
            // Standard Delete for non-WeChat (WeChat also needs delete, maybe top right?)
        }

        // Add Delete Button (absolute top right for all cards?)
        const closeBtn = card.createEl('div', { text: '×' });
        closeBtn.addClass('picflow-account-close-btn');
        closeBtn.onclick = async () => {
            if (confirm(`Remove account ${account.name}?`)) {
                await this.plugin.accountManager.removeAccount(account.id);
                this.display(); // Refresh
            }
        };
    }

    renderStatusTab(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName(t('settings.status.title', this.plugin.settings))
            .setHeading();

        // @ts-ignore
        if (this.plugin.settings.licenseStatus === 'valid' && process.env.BUILD_TYPE !== 'PRO') {
             const noticeEl = containerEl.createEl('div', { cls: 'picflow-warning-notice' });
             noticeEl.addClass('picflow-bg-primary-alt');
             noticeEl.addClass('picflow-p-20'); // Using p-20 (padding 20px) or create p-12 if needed. p-20 is fine.
             noticeEl.addClass('picflow-mb-10'); // Or mb-20 from CSS
             noticeEl.addClass('picflow-radius-m');
             noticeEl.addClass('picflow-border-accent');
             noticeEl.addClass('picflow-accent-text');
             noticeEl.addClass('picflow-font-bold');
             noticeEl.addClass('picflow-text-center');
             noticeEl.addClass('picflow-flex-row'); // flex-row might imply items-center
             noticeEl.addClass('picflow-justify-center');
             noticeEl.addClass('picflow-align-center');
             noticeEl.addClass('picflow-gap-10');

             const textSpan = noticeEl.createEl('span');
             textSpan.setText(t('settings.status.restartNotice', this.plugin.settings));

             const restartBtn = new ButtonComponent(noticeEl)
                .setButtonText(t('settings.status.restartNow', this.plugin.settings))
                .setCta()
                .onClick(async () => {
                     // Trigger Obsidian reload
                     // @ts-ignore
                     if (this.plugin.app.commands && this.plugin.app.commands.executeCommandById) {
                         // @ts-ignore
                         this.plugin.app.commands.executeCommandById('app:reload');
                     } else {
                         // Fallback if command not found (rare)
                         new Notice('Please restart Obsidian manually.');
                     }
                });
        }

        // 1. License Card (Moved here)
        this.renderLicenseCard(containerEl);

        const infoContainer = containerEl.createEl('div', { cls: 'picflow-about-info' });

        // Logo or Icon
        const logoDiv = infoContainer.createEl('div');
        logoDiv.addClass('picflow-about-logo');
        
        const logoImg = logoDiv.createEl('img');
        logoImg.src = 'https://github.com/nanbowanya.png';
        logoImg.alt = 'PicFlow';
        logoImg.addClass('picflow-w-80');
        logoImg.addClass('picflow-h-80');
        logoImg.addClass('picflow-rounded-full');
        logoImg.addClass('picflow-mb-10');

        // Version
        const versionRow = infoContainer.createEl('div');
        versionRow.addClass('picflow-about-row');
        const verLabel = versionRow.createEl('span', { text: t('settings.about.version', this.plugin.settings) + ': ' });
        verLabel.addClass('picflow-about-row-bold');
        versionRow.createEl('span', { text: this.plugin.manifest.version });

        // Author
        const authorRow = infoContainer.createEl('div');
        authorRow.addClass('picflow-about-author-row');
        const authLabel = authorRow.createEl('span', { text: t('settings.about.author', this.plugin.settings) + ': ' });
        authLabel.addClass('picflow-about-row-bold');
        authorRow.createEl('a', { text: this.plugin.manifest.author, href: this.plugin.manifest.authorUrl });

        // Links
        const linksRow = infoContainer.createEl('div');
        linksRow.addClass('picflow-about-links');

        linksRow.createEl('a', { text: 'GitHub', href: 'https://github.com/nanbowanya/picflow' });
        linksRow.createEl('a', { text: t('settings.about.changelog', this.plugin.settings), href: 'https://github.com/nanbowanya/picflow/releases' });
        linksRow.createEl('a', { text: t('settings.about.contact', this.plugin.settings), href: 'https://nexus.nanbowan.top/en/picflow/' });
    }

    getIconForType(type: UploaderType): string {
        switch (type) {
            case 's3': return '🪣';
            case 'github': return '🐙';
            case 'webdav': return '📂';
            case 'sftp': return '🖥️';
            case 'oss': return '😯';
            default: return '❓';
        }
    }

    // Helpers to create empty configs
    createEmptyS3Config(): S3Config {
        return { endpoint: '', region: 'auto', bucket: '', accessKeyId: '', secretAccessKey: '', pathPrefix: '', customDomain: '', forcePathStyle: true, useSSL: true, bypassCertificateValidation: false, uploadStrategy: 'rename' };
    }
    createEmptyOSSConfig(): OSSConfig {
        return { provider: 'aliyun', accessKeyId: '', accessKeySecret: '', bucket: '', region: 'oss-cn-hangzhou', pathPrefix: '', customDomain: '', autoDomain: false, uploadStrategy: 'rename' };
    }
    createEmptyGitHubConfig(): GitHubConfig {
        return { owner: '', repo: '', branch: 'main', token: '', customDomain: '', cdnProxy: 'jsdelivr', customCdnUrl: '', proxyUrl: '', uploadStrategy: 'rename' };
    }
    createEmptyWebDAVConfig(): WebDAVConfig {
        return { host: '', username: '', password: '', uploadPath: '/', customDomain: '', bypassCertificateValidation: false, uploadStrategy: 'rename' };
    }
    createEmptySFTPConfig(): SFTPConfig {
        return { host: '', port: 22, username: '', password: '', privateKey: '', uploadPath: '/', customDomain: '', uploadStrategy: 'rename' };
    }
}

export interface PicFlowSettings {
    // 通用设置
    language: 'auto' | 'en' | 'zh';
    autoUpload: boolean;
    imageNameFormat: string;

    // Image Processing (Pro)
    compressImage: boolean;
    compressQuality: number;
    addWatermark: boolean;
    watermarkText: string;
    watermarkPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    watermarkColor: string;
    watermarkFontSize: number;
    watermarkOpacity: number;

    // Publishing
    selectedTheme: string;

    // Front-matter
    enableDefaultFrontmatter: boolean;
    defaultFrontmatterTemplate: string;

    // AI
    promptTemplates: AIPromptTemplate[];
    aiDefaultModel: string;
    aiAutoTranslate: boolean; // Keep if needed for future features

    // Pro
    licenseKey: string;
    licenseStatus: 'valid' | 'invalid' | 'unknown' | 'expired';
    aiTokenBalance: number; // Token count
    activationDate?: string;
    expiryDate?: string;

    // --- Phase 7: Multi-Profile Support ---
    profiles: UploaderProfile[];
    selectedProfileId: string; // The ID of the currently active profile

    // --- Phase 8: Custom Publishing Platforms ---
    customPlatforms: CustomPlatformConfig[];

    // --- Deprecated Fields (Keep for migration) ---
    defaultUploader?: 's3' | 'github';
    s3Endpoint?: string;
    s3Region?: string;
    s3Bucket?: string;
    s3AccessKeyId?: string;
    s3SecretAccessKey?: string;
    s3PathPrefix?: string;
    s3CustomDomain?: string;
    s3ForcePathStyle?: boolean;
    s3UseSSL?: boolean;
    s3BypassCertificateValidation?: boolean;
    uploadStrategy?: 'rename' | 'overwrite' | 'skip';
    githubOwner?: string;
    githubRepo?: string;
    githubBranch?: string;
    githubToken?: string;
    githubCustomDomain?: string;
    githubCdnProxy?: 'jsdelivr' | 'custom' | 'none';
    githubCustomCdnUrl?: string;
    proxyUrl?: string;
}

export type UploaderType = 's3' | 'github' | 'webdav' | 'sftp' | 'oss';

export interface UploaderProfile {
    id: string;
    name: string;
    type: UploaderType;

    // Config is a union, we can cast based on type
    s3?: S3Config;
    github?: GitHubConfig;
    webdav?: WebDAVConfig;
    sftp?: SFTPConfig;
    oss?: OSSConfig;
}

export interface OSSConfig {
    provider: 'aliyun' | 'tencent';
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    region?: string; // Optional
    appId?: string; // Tencent only
    pathPrefix: string;
    customDomain: string;
    autoDomain?: boolean;
    uploadStrategy: 'rename' | 'overwrite' | 'skip';
}

export interface S3Config {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    pathPrefix: string;
    customDomain: string;
    forcePathStyle: boolean;
    useSSL: boolean;
    bypassCertificateValidation: boolean;
    uploadStrategy: 'rename' | 'overwrite' | 'skip';
}

export interface GitHubConfig {
    owner: string;
    repo: string;
    branch: string;
    token: string;
    customDomain: string;
    cdnProxy: 'jsdelivr' | 'custom' | 'none';
    customCdnUrl: string;
    proxyUrl: string; // Keep proxy here
    uploadStrategy: 'rename' | 'overwrite' | 'skip';
}

export interface WebDAVConfig {
    host: string;
    username: string;
    password: string;
    uploadPath: string;
    customDomain: string;
    bypassCertificateValidation?: boolean;
    uploadStrategy: 'rename' | 'overwrite' | 'skip';
}

export type CustomPlatformType = 'wordpress' | 'dify' | 'webhook' | 'mcp';

export interface CustomPlatformConfig {
    id: string;
    name: string;
    type: CustomPlatformType;
    icon?: string;
    
    // WordPress / Typecho (MetaWeblog/XML-RPC)
    wordpress?: {
        endpoint: string;
        username: string;
        password: string; // or App Password
    };

    // Dify
    dify?: {
        apiKey: string;
        mode: 'knowledge' | 'workflow';
        datasetId?: string; // For Knowledge Base
        workflowUrl?: string; // For Workflow
    };

    // Webhook
    webhook?: {
        url: string;
        method: 'POST' | 'PUT';
        headers?: Record<string, string>;
    };

    // MCP
    mcp?: {
        endpoint: string;
        toolName?: string;
        transportType?: 'sse' | 'http';
    };
}

export interface SFTPConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    uploadPath: string;
    customDomain: string;
    uploadStrategy: 'rename' | 'overwrite' | 'skip';
}

export const DEFAULT_SETTINGS: PicFlowSettings = {
    language: 'auto',
    autoUpload: true,
    imageNameFormat: '{Y}{M}{D}{h}{m}{s}-{filename}',

    compressImage: false,
    compressQuality: 75,
    addWatermark: false,
    watermarkText: 'PicFlow',
    watermarkPosition: 'bottom-right',
    watermarkColor: '#ffffff',
    watermarkFontSize: 16,
    watermarkOpacity: 60,

    selectedTheme: 'Default',

    enableDefaultFrontmatter: false,
    defaultFrontmatterTemplate: `title: {{title}} # 优先级最高，为空则使用文件名
author: "Nanbowanya" # 微信/知乎显示的作者名
date: {{date}}
tags: [Obsidian, Nanbowanya] # 统一的标签池，知乎会读取为 Topics (以逗号分隔)
cover: "" # 题图/封面图，支持相对路径本地图片

# 摘要与描述 (Digest & Description)
abstract: "" # 用于微信分享描述/知乎摘要设置 (对应 digest)

# 发布控制 (Post Controls)
original: true # 是否声明为原创文章
url: "" # 原文链接 (用于转载声明 / 阅读原文)
publish_mode: "draft" # draft (草稿) | direct (直接发布)

# 微信公众号特有开关 (WeChat Specific)
wx_open_comment: true # 是否开启留言 (仅认证号可用)
wx_fans_only_comment: false # 是否仅粉丝可留言
# 下列属性计划支持中:
wx_cover_crop: "center" # 封面裁剪: center, top, bottom
wx_scheduled_time: "" # 定时群发

# 知乎特有控制 (Zhihu Specific)
zhihu_column: "" # 发布到指定专栏的 ID (可选)`,

    aiDefaultModel: 'gpt-4o-mini',
    aiAutoTranslate: false,
    promptTemplates: DEFAULT_PROMPTS,
    
    licenseKey: '',
    licenseStatus: 'unknown',
    aiTokenBalance: 0,

    profiles: [], // Will be populated by migration or default initialization
    selectedProfileId: '',
    customPlatforms: [],
};

export interface Uploader {
    upload(file: File, fileName: string): Promise<string>;
    list?(offset?: number, limit?: number): Promise<UploadedImage[]>;
    delete?(fileName: string): Promise<boolean>;
}

export interface UploadedImage {
    url: string;
    name: string;
    lastModified?: Date;
    size?: number;
    key?: string; // Original key/path in storage
}
