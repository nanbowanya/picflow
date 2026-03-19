import { App, PluginSettingTab, Setting, Notice, ButtonComponent, TextComponent, TextAreaComponent, MarkdownRenderer, FileSystemAdapter, DropdownComponent, setIcon, MarkdownView, Component } from 'obsidian';
import PicFlowPlugin from '../main';
import { t } from './i18n';
import { KeyBridgeClient } from './api/keybridge-client';
// import { AccountManager } from './managers/account-manager';
import { DEFAULT_PROMPTS, AIPromptTemplate } from './ai/prompts';
import { AI_MODELS, DEFAULT_CHAT_MODEL } from './ai/models';
import { ConfirmModal } from './ui/modals/confirm-modal';
import { ThemeEditModal } from './ui/modals/theme-edit-modal';
import { Account } from './managers/account-manager';
import { PLATFORM_ICONS } from './ui/platform-icons';
import { CustomPlatformModal } from './ui/modals/custom-platform-modal';

import { S3Uploader } from './uploaders/s3';
import { OSSUploader } from './uploaders/oss';
import { GitHubUploader } from './uploaders/github';
import { WebDAVUploader } from './uploaders/webdav';
import { SFTPUploader } from './uploaders/sftp';
import { ImageProcessor } from './utils/image-processor';

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

        new Setting(containerEl).setName(t('settings.title', this.plugin.settings)).setHeading();

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
        new Setting(containerEl).setName(t('settings.ai.templates.title', this.plugin.settings)).setHeading();
        containerEl.createEl('p', { text: t('settings.ai.templates.desc', this.plugin.settings), cls: 'setting-item-description' });

        const templatesContainer = containerEl.createDiv();

        // Add New Template Button
        new Setting(templatesContainer)
            .setName(t('settings.ai.templates.add', this.plugin.settings))
            .addButton(btn => btn
                .setButtonText('Add template')
                .onClick(() => {
                    const newId = Date.now().toString();
                    this.plugin.settings.promptTemplates.push({
                        id: newId,
                        name: 'New template',
                        description: '',
                        template: ''
                    });
                    void this.plugin.saveSettings();
                    this.display(); // Refresh
                }));

        // Reset Defaults Button
        new Setting(templatesContainer)
            .setName(t('settings.ai.templates.reset', this.plugin.settings))
            .setDesc(t('settings.ai.templates.reset.desc', this.plugin.settings))
            .addButton(btn => btn
                .setButtonText('Reset to defaults')
                .setWarning()
                .onClick(() => {
                    new ConfirmModal(
                        this.plugin.app,
                        t('settings.ai.templates.reset', this.plugin.settings),
                        t('settings.ai.templates.reset.confirm', this.plugin.settings),
                        () => {
                            this.plugin.settings.promptTemplates = [...DEFAULT_PROMPTS];
                            void this.plugin.saveSettings().then(() => {
                                this.display();
                            });
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
                .onClick(() => {
                    new ConfirmModal(
                        this.plugin.app,
                        t('settings.uploader.delete', this.plugin.settings),
                        t('settings.uploader.deleteConfirm', this.plugin.settings),
                        () => {
                            this.plugin.settings.promptTemplates.splice(index, 1);
                            void this.plugin.saveSettings().then(() => {
                                this.display();
                            });
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
                     new Notice('Refreshing license status');
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
            // const _deactivateBtn = new ButtonComponent(actionsDiv)
            new ButtonComponent(actionsDiv)
                .setButtonText(t('settings.advanced.license.deactivate', this.plugin.settings))
                .setWarning()
                .onClick(() => {
                    new ConfirmModal(
                        this.plugin.app,
                        t('settings.advanced.license.deactivate', this.plugin.settings),
                        'Are you sure you want to deactivate?',
                        () => {
                            // Clear Settings
                            this.plugin.settings.licenseKey = '';
                            this.plugin.settings.licenseStatus = 'unknown';
                            this.plugin.settings.aiTokenBalance = 0;
                            this.plugin.settings.activationDate = '';
                            this.plugin.settings.expiryDate = '';
                            void this.plugin.saveSettings().then(() => {
                                this.display(); // Refresh UI
                            });
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
            input.onchange = () => {
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
            // const _buyBtn = new ButtonComponent(actionRow)
            new ButtonComponent(actionRow)
                .setButtonText('Buy license')
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
                .addOption('auto', 'Auto (system)')
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
        desc.createSpan({ text: t('settings.extractor.desc', this.plugin.settings) });
        desc.createEl('br');
        desc.createSpan({ text: t('settings.extractor.warning.length', this.plugin.settings) });
        
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
            // We need a proper component for rendering, but plugin instance is too long-lived.
            // In settings tab we can use `this` (the setting tab) or create a dummy component.
            const tempComponent = new Component();
            tempComponent.load();
            await MarkdownRenderer.render(this.plugin.app, md, tempDiv, '/', tempComponent);

            // Inject into Shadow DOM
             shadowRoot.innerHTML = ''; // Clear
             
             // Instead of creating <style> element directly, we apply classes
             // For shadow DOM, we might need a different approach to apply styles safely
             // For now, we will add a CSS file link if possible, or use constructable stylesheets
             try {
                const sheet = new CSSStyleSheet();
                sheet.replaceSync(`
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
                `);
                shadowRoot.adoptedStyleSheets = [sheet];
             } catch(e) {
                 console.error("Constructable stylesheets not supported", e);
             }

             const container = document.createElement('div');
             container.className = 'wechat-article picflow-container';
             
             while (tempDiv.firstChild) {
                 container.appendChild(tempDiv.firstChild);
             }
             shadowRoot.appendChild(container);
             tempComponent.unload();
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
        // Set default to first model if settings is empty or not in list
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
                            new Notice('Content extraction empty, showing sample');
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
                        const electron = (window as unknown as { electron?: { remote?: { shell: { openPath: (path: string) => void } } } }).electron;
                        const requireFn = (window as unknown as { require?: (module: string) => { shell: { openPath: (path: string) => void } } }).require;
                        const shell = electron?.remote?.shell || requireFn?.('electron').shell;
                        const fullPath = adapter.getFullPath(themeDir);
                        if (shell) {
                            shell.openPath(fullPath);
                        }
                    } else {
                        new Notice('File system adapter not available');
                    }
                }))

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
                new ThemeEditModal(this.app, this.plugin, theme.name, theme.css, (name: string, css: string) => {
                    void this.plugin.themeManager.saveTheme(name, css).then(() => {
                        new Notice(`${name} updated`);
                        this.display(); // Refresh
                    });
                }).open();
            };

            // Delete button (disable for default)
            const delBtn = actions.createEl('div', { cls: 'picflow-theme-action-btn' });
            setIcon(delBtn, 'trash-2');
            delBtn.title = t('settings.customPlatform.delete', this.plugin.settings);
            
            if (theme.name === 'Default') {
                delBtn.addClass('disabled');
            } else {
                delBtn.addClass('danger');
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    new ConfirmModal(
                        this.app,
                        t('settings.customPlatform.delete', this.plugin.settings),
                        t('settings.customPlatform.deleteConfirm', this.plugin.settings).replace('{name}', theme.name),
                        () => {
                            void this.plugin.themeManager.deleteTheme(theme.name).then(() => {
                                new Notice(`${theme.name} deleted`);
                                this.display();
                            });
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
            const typeLabel = currentProfile.type.toUpperCase();
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
            void this.plugin.saveSettings();
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
        leftDiv.createEl('span', { text: this.getIconForType(profile.type), cls: 'picflow-profile-header__icon' });
        // Styles moved to CSS class .picflow-profile-header__icon

        leftDiv.createEl('span', { text: profile.name, cls: 'picflow-profile-header__name' });
        // Styles moved to CSS class .picflow-profile-header__name

        // Right: Status / Arrow
        const rightDiv = header.createEl('div', { cls: 'picflow-profile-header__right' });
        if (isSelected) {
            rightDiv.createEl('span', { text: t('settings.uploader.active', this.plugin.settings), cls: 'picflow-profile-header__badge' });
            // Styles moved to CSS class .picflow-profile-header__badge
        }

        rightDiv.createEl('span', { text: isExpanded ? '▼' : '▶', cls: 'picflow-profile-header__arrow' });
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
                    .onChange((value) => {
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
                    .addOption('oss', 'Aliyun or tencent')
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
            
            deleteBtn.onclick = () => {
                // Confirm?
                new ConfirmModal(
                    this.plugin.app,
                    t('settings.uploader.delete', this.plugin.settings),
                    t('settings.uploader.deleteConfirm', this.plugin.settings),
                    () => {
                        this.plugin.settings.profiles = this.plugin.settings.profiles.filter(p => p.id !== profile.id);
                        if (isSelected) {
                            this.plugin.settings.selectedProfileId = ''; // Clear selection if deleted
                        }
                        void this.plugin.saveSettings().then(() => {
                            this.expandedProfileId = null;
                            this.display();
                        });
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
                .addOption('aliyun', 'Aliyun object storage')
                .addOption('tencent', 'Tencent object storage')
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
                .setButtonText('Auto fetch')
                .setTooltip('Try to fetch bucket domain')
                .onClick(async () => {
                    if (!config.accessKeyId || !config.accessKeySecret || !config.bucket) {
                         new Notice('Please fill in access key, secret and bucket first.');
                         return;
                    }

                    btn.setDisabled(true);
                    btn.setButtonText('Fetching...');

                    try {
                        const { OSSUploader } = await import('./uploaders/oss');
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
                        btn.setButtonText('Auto fetch');
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
                    config.uploadStrategy = v as unknown;
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
                    config.uploadStrategy = v as unknown;
                    await this.plugin.saveSettings();
                }));
    }

    renderGitHubFields(container: HTMLElement, config: GitHubConfig) {
        new Setting(container).setName(t('settings.uploader.github.owner', this.plugin.settings)).addText(t => t.setValue(config.owner).onChange(v => config.owner = v));
        new Setting(container).setName(t('settings.uploader.github.repo', this.plugin.settings)).addText(t => t.setValue(config.repo).onChange(v => config.repo = v));
        new Setting(container).setName(t('settings.uploader.github.branch', this.plugin.settings)).addText(t => t.setValue(config.branch).onChange(v => config.branch = v));
        new Setting(container).setName(t('settings.uploader.github.token', this.plugin.settings)).addText(t => t.setPlaceholder('Access token').setValue(config.token).onChange(v => config.token = v));

        new Setting(container)
            .setName(t('settings.uploader.github.customDomain', this.plugin.settings))
            .setDesc(t('settings.uploader.github.customDomain.desc', this.plugin.settings))
            .addText(t => t.setValue(config.customDomain || '').onChange(v => config.customDomain = v));

        new Setting(container).setName(t('settings.uploader.github.cdnProxy', this.plugin.settings))
            .addDropdown(d => d.addOption('jsdelivr', 'Public CDN').addOption('custom', 'Custom').addOption('none', 'None')
                .setValue(config.cdnProxy as string).onChange(v => {
                    config.cdnProxy = v as 'jsdelivr' | 'custom' | 'none';
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
                .setValue(config.uploadStrategy).onChange(v => config.uploadStrategy = v as unknown));
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
                .setValue(config.uploadStrategy).onChange(v => config.uploadStrategy = v as unknown));
    }

    renderSFTPFields(container: HTMLElement, config: SFTPConfig) {
        const wrapper = container.createEl('div', { cls: 'picflow-uploader-wrapper' });

        new Setting(wrapper).setName(t('settings.uploader.sftp.host', this.plugin.settings)).addText(t => t.setValue(config.host).onChange(v => config.host = v));
        new Setting(wrapper).setName(t('settings.uploader.sftp.port', this.plugin.settings)).addText(t => t.setValue(config.port.toString()).onChange(v => config.port = parseInt(v)));
        new Setting(wrapper).setName(t('settings.uploader.sftp.username', this.plugin.settings)).addText(t => t.setValue(config.username).onChange(v => config.username = v));
        new Setting(wrapper).setName(t('settings.uploader.sftp.password', this.plugin.settings)).addText(t => t.setPlaceholder('********').setValue(config.password).onChange(v => config.password = v));
        new Setting(wrapper).setName(t('settings.uploader.sftp.privateKey', this.plugin.settings)).addTextArea(t => t.setPlaceholder('Private key content').setValue(config.privateKey).onChange(v => config.privateKey = v));
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
                .setValue(config.uploadStrategy).onChange(v => config.uploadStrategy = v as unknown));

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
            new Setting(ipWrapper)
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
                        this.plugin.settings.watermarkPosition = value as unknown;
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
        
        targetContainer.createEl('span', { text: t('migration.config.target', this.plugin.settings) });
        
        const targetSelect = targetContainer.createEl('select');
        
        this.plugin.settings.profiles.forEach(p => {
            const option = targetSelect.createEl('option', { text: `${p.name} (${p.type})`, value: p.id });
            if (p.id === this.plugin.settings.selectedProfileId) option.selected = true;
        });

        // 2. Include Remote Toggle
        const scopeContainer = configGroup.createEl('div', { cls: 'picflow-migration-config-row' });

        scopeContainer.createEl('span', { text: t('migration.config.remote', this.plugin.settings) });
        
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

    renderMigrationResults(container: HTMLElement, files: unknown[], targetProfileId: string) {
        container.empty();
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const totalImages = (files as any[]).reduce((acc: number, f: any) => acc + (f.images?.length || 0), 0);
        
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
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const successCount = (file as any).images.filter((i: any) => i.status === 'success').length;
            
            if (file.status === 'success') {
                statusSpan.setText('✅ done');
                statusSpan.addClass('picflow-text-success');
            } else if (file.status === 'processing') {
                statusSpan.setText('⏳ processing');
                statusSpan.addClass('picflow-text-accent');
            } else if (file.status === 'error') {
                 statusSpan.setText('❌ error');
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

            file.images.forEach((img: unknown) => {
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
                void this.loadAlbumGrid(albumWrapper, profile);
            };
        });

        // 2. Toolbar (Batch Actions)
        const toolbar = containerEl.createEl('div', { cls: 'picflow-album-toolbar' });

        new ButtonComponent(toolbar)
            .setIcon('refresh-cw')
            .setTooltip('Refresh')
            .onClick(() => {
                const profile = profiles.find(p => p.id === activeProfileId);
                if (profile) void this.loadAlbumGrid(albumWrapper, profile);
            });

        // 3. Grid Container Wrapper
        const albumWrapper = containerEl.createEl('div', { cls: 'picflow-album-wrapper' });

        // Load initial data
        const initialProfile = profiles.find(p => p.id === activeProfileId);
        if (initialProfile) {
            void this.loadAlbumGrid(albumWrapper, initialProfile);
        }
    }

    async loadAlbumGrid(container: HTMLElement, profile: UploaderProfile, append: boolean = false) {
        if (!append) {
            container.empty();
            this.currentAlbumOffset = 0;
        }

        // Get or Create Grid
        let gridContainer = container.querySelector('.picflow-album-grid');
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
            const proxySettings: unknown = { ...this.plugin.settings };

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

                        const text = fallback.createEl('span', { text: 'Load failed' });
                        text.addClass('picflow-text-10');
                    };

                    // Actions Overlay
                    const actions = card.createEl('div', { cls: 'picflow-card-actions' });

                    // Copy URL
                    const copyBtn = actions.createEl('button', { text: '🔗' });
                    copyBtn.title = 'Copy URL';
                    copyBtn.onclick = (e) => {
                        e.stopPropagation();
                        void navigator.clipboard.writeText(img.url);
                        new Notice('URL copied');
                    };

                    // Insert to Note
                    const insertBtn = actions.createEl('button', { text: '📝' });
                    insertBtn.title = 'Insert to note';
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
                    delBtn.onclick = (e) => {
                        e.stopPropagation();
                        new ConfirmModal(this.plugin.app, 'Delete image', t('settings.album.deleteConfirm', this.plugin.settings), () => {
                            if (uploader && uploader.delete) {
                                new Notice(t('settings.album.deleting', this.plugin.settings));
                                const key = img.key || img.name;
                                void uploader.delete(key).then(success => {
                                    if (success) {
                                        new Notice(t('settings.album.deleted', this.plugin.settings));
                                        card.remove();
                                    } else {
                                        new Notice(t('settings.album.deleteFailed', this.plugin.settings));
                                    }
                                }).catch(err => {
                                    new Notice(t('settings.album.deleteError', this.plugin.settings).replace('{error}', (err as Error).message || String(err)));
                                    console.error(err);
                                });
                            } else {
                                new Notice(t('settings.album.deleteNotSupported', this.plugin.settings));
                            }
                        }).open();
                    };
                });

                // Update Offset
                this.currentAlbumOffset += images.length;

                // Show Load More Button if we got a full page (assuming there might be more)
                if (images.length === this.currentAlbumLimit) {
                    const loadMoreWrapper = container.createEl('div', { cls: 'picflow-album-load-more' });

                    new ButtonComponent(loadMoreWrapper)
                        .setButtonText('Load more')
                        .onClick(() => {
                            void this.loadAlbumGrid(container, profile, true);
                        });
                }

            } else {
                container.empty();
                const msgEl = container.createEl('div', { text: `Album view is not supported for ${profile.type} yet.` });
                msgEl.addClass('picflow-album-loading');
            }

        } catch (e: unknown) {
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
            iconSpan.empty(); 
            const _iconStr = p.icon || '📱';
            if (_iconStr.includes('<svg')) {
                const iconDoc = new DOMParser().parseFromString(_iconStr, 'image/svg+xml');
                if (iconDoc.documentElement) iconSpan.appendChild(iconDoc.documentElement);
            } else {
                iconSpan.setText(_iconStr);
            }

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
                         void this.plugin.saveSettings();
                         // Reload publishers
                         void this.plugin.publishManager.loadCustomPublishers();
                         
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
                                iconDiv.empty(); 
                                const svgDoc = new DOMParser().parseFromString(PLATFORM_ICONS[cp.type], 'image/svg+xml');
                                if (svgDoc.documentElement) {
                                    iconDiv.appendChild(svgDoc.documentElement);
                                    // Adjust SVG size
                                    const svg = iconDiv.querySelector('svg');
                                    if (svg) {
                                        svg.setAttribute('width', '24');
                                        svg.setAttribute('height', '24');
                                    }
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
                            editBtn.empty();
                            const _svgDoc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings-2"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>', 'image/svg+xml');
                            if (_svgDoc.documentElement) editBtn.appendChild(_svgDoc.documentElement);
                            editBtn.title = t('settings.customPlatform.edit', this.plugin.settings);
                            editBtn.onclick = () => {
                                const modal = new CustomPlatformModal(this.app, this.plugin, (newConfig: CustomPlatformConfig) => {
                                    Object.assign(cp, newConfig);
                                    void this.plugin.saveSettings();
                                    void this.plugin.publishManager.loadCustomPublishers();
                                    this.display();
                                });
                                modal.config = { ...cp };
                                modal.open();
                            };

                            // Delete
                            const delBtn = actionsDiv.createEl('div', { cls: 'clickable-icon' });
                            setIcon(delBtn, 'trash-2');
                            delBtn.title = t('settings.customPlatform.delete', this.plugin.settings);
                            delBtn.addClass('picflow-error-text');
                            delBtn.onclick = () => {
                                new ConfirmModal(this.plugin.app, 'Delete custom platform', t('settings.customPlatform.deleteConfirm', this.plugin.settings).replace('{name}', cp.name), () => {
                                    this.plugin.settings.customPlatforms = this.plugin.settings.customPlatforms.filter(c => c.id !== cp.id);
                                    void this.plugin.saveSettings();
                                    this.display();
                                }).open();
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

        platformList.createEl('div', { cls: 'picflow-add-custom-platform' });
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
        const checkLink = checkAction.createEl('a', { text: t('settings.publishing.check', this.plugin.settings).toLowerCase().replace(/^./, str => str.toUpperCase()) });
        checkLink.addClass('picflow-account-check-link');
        checkLink.onclick = () => {
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
        closeBtn.onclick = () => {
            new ConfirmModal(this.plugin.app, 'Remove account', `Remove account ${account.name}?`, () => {
                void this.plugin.accountManager.removeAccount(account.id).then(() => {
                    this.display(); // Refresh
                });
            }).open();
        };
    }

    renderStatusTab(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName(t('settings.status.title', this.plugin.settings))
            .setHeading();

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

             new ButtonComponent(noticeEl)
                .setButtonText(t('settings.status.restartNow', this.plugin.settings))
                .setCta()
                .onClick(() => {
                     // Trigger Obsidian reload
                     if (this.plugin.app.commands && this.plugin.app.commands.executeCommandById) {
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
        logoImg.src = 'data:image/png;base64,' + 
        '/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAcwBzAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APVbBQ2l2oYAgwpwf90VFcaVBOjrjCsMFTyDU2n/APINtP8Arin/AKCKs1xtXPRUmtjmdBnm0S6Hh/UZS5IL2M5/5axjqn+8v6iunqnqGmWeqQrFeQiQI25Dkhkb1UjkH6Un9nRlArTXHH8SyspP1wRWqqdzOdPmd0XaKzhpkiE+VqV9GD/CXV/1dSaBZXysSurTsD2kijOPyUVXPEz9kzRpayZItcjjbybyxmbPAmt2Xj6q39KjW+1uJmE+kRSgY2m2uQc+vDhad13E6cjaorI/4SG2STy7iC8gbOPmgZh/30mRj8as2usadeHbbX1vK3Xasg3fl1pkuLReooooJCiiikAUUlApiFooooGFFFFIQUUUUDCiiigBKWiigAooooFYKKKKACiiigdwooooEFFFFAWCiiigYUUUUAJRRRSGFFFFIAooooAKKKKACiiikwCiiigBaKSihjFo7UUUgGO2yNnP8IzXzJ4jiuvEfiK/1CGMNGZSiknsvA/SvofxPff2d4a1C63BTHAxUn1xxXlun6YNO0ewjkGJZIBK+RzliTzn2xWkHyq5adlc9e0//kG2n/XFP/QRVmq2n/8AINtP+uKf+girNc5tcKKKMGiwBRRzRQO4UUUUgK13p9pfRlLm3jkBGPmHI+h6isefwhaOpENzcIOPkmInTjpxICR+BFdDRTUmth3ORh0fxDo4P2C6iuIh0iMjDH4OW/Rloj8bSWl2LPVbFrefPG/92G+hJKH/AL7rrqZLFHNG0cqK6NwVYZBrRVH1IcIvdFTTtastUX/R5GDjrFKhRx/wE849+laFcxfeCtMnUmxL6fL1Bt8bM+6HK/jgGswTeLfDqg3EI1G1RvmeEl8r6lT84P0LD2rRSizOVHsd1iisXRfE+m65Gfs8oEq8PG3BH+H0OD7VtUzJqzswo70UUCCiiikAlLSUUCFopKM0DuLRSZooC4tFIKWgAooooAKKKKBBRRRQAUUUUAFFFFABRRRQNhRRSUhBRRRSKCiiigAooooAKKKKTAKKU0lACikpaKQwooooA4X4lXXm2FjoyEeZqFykZHcLuBJ/Ss7xAoW+iVRhRCAB7ZNJrJOp/Fq3j+9Fp1oXxngM3H9RTvEX/IQj/wCuQ/mat6WRUtkj0DT/APkG2n/XFP5CrGaraf8A8g20/wCuKfyFWaxNbhmjNFFAXCiiikFwooooBMKKKKCgooooGFHeiigDB1bwnp+p3f25DLZ6iB8t3bNtbPbcOjfiKoDX9X8OTLD4jgWew6Lqdsh2r/10Tnb9RxXW0hAIwQCD1Bq4zaBpS3GWt3b31slzazRzQyDKvGwYEfUUlxeW1rj7RPHFnpvYCufuPDU9hftqPh24W0duZbJgfs859SB91vcflVvSPEEWoXT2FzbPY6nGu57WXBJX+8pHDL7j9Kvm6oy9j5kj+J9IRypuWyDgkQuR+YXFWYta0yaQRpf2289FMgBP4dau1Dc2yXULRvkBhjIA/rxS9ouweyRYzRiuZTS9b0o5sJrW8iH/ACxkUwNj/eXKn/vmpB4ttbSZLfWrabS5nO1WnGYmPtIMj88VSaexDpNHRYpMUAggEHIIyD60tUZW6BiiiikAUUmKXpQAlGKXNFABRRSZoAWijNGaACiiigAooooAKKKKAYUUUUMEFJS0UhiUUtJQMKKKKQgoFFFIYUUCg0ALRSUuaQwpGO1ST25paxfFmpf2R4X1C9H3o4jt5x8x4H6mgaOO8N7dQ17xBrDDLS3Zt427bEGOD+X5UviL/kIR/wDXIfzNWPBlmbPwrYhuXmTz3PqX+bP61X8Rf8hCP/rkP5mqk/eY5bnoGnj/AIltp/1xT+VWar6f/wAgy0/64p/IVYqDRBRRRSAKQ0tFACUUtJSGhaSlFJ3pDCiiigoKKKKACiiigArN1fQrLWUT7SrpNEcxXETFJIz/ALLD+XStKimBkaVJqlqz2eqgTBDiG9QACVf9sfwt+hrQlvIIhy4J9BzTrmMy27oOuOK5+QlEY7csoPy+tRKTuaRipGi2qPn5Ylx7mo57uK7geC7tIponGGRxkEe4NcRcfEDR4IlcyNuPDIVO5T3Bp1j4/wBGvHCeeI2JwA/H86OSotbGnJE2pbK50iIzeGrhoiME2F0xeBvXaeqH6ce1bOh+J7LWSbZs22oxrmazl4dD3I/vD3FUYLmG5QPE6sD6Gs/WdHGorFcW8ht9Qtm329wvVW9D6qe4q4VXtIzqUFJeZ3VFYnhnWZ9X09xewrDf2zmK4jU5Xd1DD2I5rbrc4JRadmFJS0lBIUUUUAFFFFABRRRQAUtJRQAtFJS0AFFFFABRRRQCCiiikMKMUUUAJRRRSAKKKKBgKKBRSYBRRRSGLXC/E93uNL07SImw9/eJGw/2Ryf6V3Veda3cLqfxQsbVeV022eVv95sD+oqob3Kjub0MSQQRwxjCIoVR7AYrnPEX/IQj/wCuQ/ma6auZ8Rf8hCP/AK5D+ZqEJnoOn/8AIMtP+uKfyFWKZpVvJLptpxgeSnJ+lagsUCjLHPenytlOSRnUVovYoV+QkH3qi8bRthhik00EZJjKKKKRYUUUUDE70GlpKQBRRRSKCiiihjCiiigAooooAKy9StsN5yDg/e/xrUproJEZG6EYpSVyouzueSeLfDDxStrOkwB5M7rm2AyJR/eA9a5qKLT9UgD+RGw6EFcMp9K9hljMcjIeoOK4fWPAEV1fy3mnXb2ckp3Oq/dz3NVCr0kzspztpujlI7S+0yTzNHvXhPeJ2yprfsvHl9bRhNU02fI4MkS7lNPX4d3Tj95r1xu/2U/+vU8XgO8WeK2GtXTrKdpXYF47nOelW3Tl8TuEpQ7WOg8DatLres6heRWzRWgjSPLcFnBPb6Gu9rN0TRbPw/pcdhZKRGnJY9XY9Sa0a0SXQ8itPnldBRRRTMgooxRQAUUUUAFFFFAwooopAFFLSUAFFFFABS0lLQAUUUUmMKKKKACkpaSgYUUUUgAUGgUtJgJRS4pO9IYMwRCzHAAya8o8FBtR1jXddcErdXBSFj3QE/8A1vyruvGeo/2V4R1K5DbXELKh/wBo8D+dYHhWwGneGbC324byg7/7zcn+dUtIspaRNmuZ8Rf8hCP/AK5D+Zrpq5jxF/yEI/8ArkP5mpRJ65pn/IKs/wDrgn/oIq1VXTP+QVZ/9cE/9BFWq1MgqjeqXJP92r1IQDzjNJq44uzuYlFWbwKsuFAB74qtWT0OhMKKKKRVwpKWkNDGL2pKO1FSUFFFFMYUUUVPUAooopgFFFFAGdqcHyrMB04asyuidBIhRhkHrWDPGYZmjPY1nJG9N9A0OeG9nuopAPPtmCvGfQ8hvxH9afYSNe+Kb6VP+PayjFuPQyHDN+Q2iuZ167m8P3MfiG0UsUHk3SdnjPQn3U/zNdf4cshY6DaoXEksq+dNIDnfI/zMc/U/lit6UVa5jiG4r1NWiiitjzwooooAKKKKACiiigAooopgFApaSkMWkpaSgAooopDCiiigBaKKKACiiihjuFIetLRSGJRRRSAKWkopWAWkoopDPOvinM11NoWhoT/pl0C/+6CB/WuhACgAdBXM6gBrPxWdid0OlWwxjs7f/WP6V09VLRJFS0sgrmPEQ/4mEf8A1yH8zXT1zPiL/kIR/wDXIfzNSiT1vTP+QVZ/9cE/9BFWqq6Z/wAgqz/64J/6CKt1qZCUUtJQBl3oAuGqvUk7bp3PvTACTgDJrF7nSth0UTSvtWiWJom2sK07aMRxAAcnrTpYllQqw+hq+TQz9pqY9Iac6GNyrdRTTWbNkFFFFSWFFFFAwoooo6gFFFFABRRRQAVn6lBuUTDtwa0KjnTzIHT1FJq6HF2Zzk0KTwPDKoaN1KsD3Bo8F3pFnPo0rZn05/LBP8UZ5Q/lxUmO1ZkgXTPEllqy/Kkp+y3B7EH7pP0P86KMrOxrWhzwZ25oo60V1nlBS0lLQAUUUUhhRRRTASiiigQtGKKKBhSUppKQBRRRSGFFFFABS0lKKACiiigAooopDQlFLSUhhRRRQAVFd3CWlnNcSfciRnP0AzUtcr8R7/7D4Iv8NiSdRAg7kscfyzSSu7FJXZzPgV31CLVNbkGH1C7Zhnn5V4H8yK62srw1p50rw7Y2bAB0jBcf7R5P6mtWibuxy1YVzHiL/kIR/wDXIfzNdPXP69avJext0BiGPzNSSeq6Z/yCrP8A64J/6CKtViaXeyJptpuAYeSn8hWil9E33sqfeteZEODRaqOaQRRMx/Cmm6hAzvFULm4M78cIOgok7IcYtsgJyST3oHBoorE6LGvbtvhUg9qlrMtLjym2N90n8qo+JPGOleGYo/tcjPcTcRQRjLv9B6VtD3tDmlGzNa9gDIZB94dfes2uB1zxX4y1CyebTtFkit+uWYZx9OtcAnxA8V6PMyX+5snIVxjHsKp4eT1NaT0PfaK8u8P/ABes7iZYNWiMAPHnDkA+9enQzR3EKTQuHjdQyspyCD3rCcHB6nQh9FFFQAUUUUAFFFFABRRRQAUUUE4GaAOefiRvqap6hai9sZrcnBdcA+h7H86uOdzsfUk02sb2Z1IueGNRk1HRYzcYF1CTDMPRl4/UYP41sZrzrUL2/wDCuoy63aQfarCVR9ugDYKkdJF98cGt7RfiB4e1xljt7wRTkf6qYbW/wP4V3wfNG6POr0nGVzp6KRWDDKkEGlpnOFGaKKAFzSUUCgApcUZpKAFopKBQAUUtJSGFGaKWkMSiiigApRSUtABRRRQAUUUUmNBSUtJSGFFFFABXnvj+cal4h0DQUOc3H2qYDqFUf/rr0KvLLJzq/wAU9avxzFZILZCex4Bx+TUR6suHc7CiiioEKql2CjqTiqfiNAl9Co6CAD9TWpYIXulPZeTWd4n/AOQlH/1xH8zS6gdHp/8AyDLT/rin8hViq+n/APIMtP8Arin8hVimzVBRRRSCwUZpKWi47GT4j16Dw7olxqEpBZF/dp/ebsK8h8J+I01DWrvVdZdbi/Y4jaXkRp6KOgrY+M15Ii2VqPuPz+VeRKxU7lYg+oNdlCKUbvqEqfPFpM+j7Xxhay4j3xEdMA/4Ul6vh/XIHhvLWF9wIz0I+lfOZlkLbi7bvXPNaNh4g1KwYeXdOU/uudw/Wt+WPQ53hprVMt+LPDv/AAj2qmOJzJaS5MLnrj0PvXZ/CvxnNBcpoN7Lut3P7hm6of7v0rgNY1q41eSMzkYjBCgdKr6Xcmz1S2uFOCkgP61NSCkrHVHm5Pe3Pq6iq1hP9psYZv7yA1ZrzLWBO4UUUUDCiiigAooooAKhupPKtnbvjAqas7VJPuR/jSk7IqKuzNooorE6CK4hS5tpYJF3JIhRge4NeEyabDBf3NjdGSC5gkKq6j7w7Ej+te9Vg3/hTSvGhlYs0F7auY2kj4P4jvXVhqvI2nsRV+G55xp/iHxVoGPsOoSXFuvRGPmDH0PIrs9E+Mkbt5Wt2fkn/npCCR+I61m6h8P9f0cM9rJHfQryAeHrl53tp2MGpWj28o/56Lj9a7vcnscbSe6Pe9L8TaNrKA2GoQSkjOwNhh+B5rWzXzK2glSJrK6Kkcqc4I/EVsad4/8AFHhvbbzOt1CvTzwW49m61Lp9jN0k/hZ9BUV5ppHxj0u6KpqVrLaMerr86f413+n6rY6pbrPZXUc0bDgo2ahxa3M3CS3RcoooqSQoFFLQAUlLSUhhSikopDCiiigBTRQaKACiiigAooooAKSlpKkoKKKKAIL25Szsp7mQ4SJC5P0Ga878BW5Hh838g/fX0zzufqeP5frWr8U9Sew8HSQRf628kWBfoev6VZ0y0FjpdraL0hiVPyGKNo+pa+EtUUUVAjV0yLETSEcscCsPxN/yEo/+uI/ma6e3Ty7dF9AK5fxPn+0o/wDriP5mpQzo9P8A+QZaf9cU/kKsUy2tzDplmRyphTn8BT6p7lp3EopaOgqWWJRRRSGedfFnSWvNCF2ibjByeOgzXhdfV+oWMWpWE9pOMxyoVNfM3iTQrjw7rM1jOhG05jYjAZexFdmHkmuUcXZmWqM3QZpCCpwQQferkCglPlyWOcnoKfqUcaGJkPJz+X+c11uOlw59bFDPFIASQB1PSjvV3SLV7zWLS3RSzSSqAB9agpuyufUOhQgeGbB1XbiJQR74FW6sxWws9Ggt+6qoqtXnTWphTlfUKKKKk1CiiikAUUUUAFY2oE/bGB7AYrZrF1D/AI/X+g/kKmexpT3K1FFJWRsFYugS/YviPf2pJVL61WZR2LKcGtquP1y+Gm/ETw5PnBYNG30Y4/ma2oq7aJqaxseq9RVG90bTtRXbdWcMo/2lBq6rB0DA5BGaA6k4DAn61dzztjgdT+F9hKWk0yV7OQ8gKx2/lXJah4G8UWLnZHDew9x3r2ykJHcitI1pofMz5xvrCKH5dS0uezf+9swPwI4qjDazWkguNI1Iq45UJIVavpO706zv4TFcwJIh6hhXG6p8KtCvWaS2ElrIef3Z4z9K3jiIv4kUpo4HSvij4j0iQR6kv2uL0lXa34EV6BpPxW8O6iUjnlkspW7TL8uf94cVx2q/C7WbWM/ZLlbyP/nnKvNcLe6NeWEhS+sbi2AOC2wkD/P1rS0J7MpwhI+nrW9tb2IS2txFNGejRuGH6VPXzHp1xq2kH7Ro2otjqyxNj81Nddpfxj1a0cR6rZRXKjgsmUf/AAqHTa2MnRfQ9vork9E+Inh/WkQC7S2nbjypyFOf611SOkihkYMD0IOazaa3MmmtxaKMUUhhRRS0gEopaKACiiigAooooAKTvS0lIYUUUdqQzznxqo1nx3oekE5itka8mXseeM/lj8a6OuS0G5Gt+N9f1fqkRW1hPsM5/lXW0T6I0lpZBUttH5lyi++TUVX9LjzI7+gx+dQSalcV4suwmrIo7Qj+ZrtScAnsK8H+I3iq5tfFb28GCscSg/Ukn+RFEIuT0HZs+h7KMSaNaIe8Cf8AoIqiwKsQexxWjpv/ACCbP/rgn/oIqreKFuCfXmrmupNN9CvSUtJWTN0FFFFIoKwvFHhTT/FNiILtNsqcxzKPmT/61btFNNp3QM8G1T4Wa5prO9q6XEYPGOMj6VyGoaRqlrIxvLWVSOpIzivqggelQSWVrNnzLeNvqorpWJlazEro+Ura1nu5fLt4mkf0UZr2f4YfD19NuIte1kBJRzBb4yR/tH/Cu+t9E0u0kMlvp9vExOSUjA5q/SliLqyCV5KxYurjz2AAwo6VXoornbuKKSQUUYoxSKCiiihjCiiigArFv/8Aj8f8P5Vqz3EcCEswz2HesOSQySM7dWOaieprTT3G00kDHucUtYXifVV0yyTdKYVkkVHlUZKKTyR74qYxcnZGt7Itar4i0vRnRL67WN3+6vU/X2FcV8R0Mx0zU7c7kiyNw9Mgjn86277TfCev6SY4vL84KdlysmZM+rE8n8a5TQFluIr3Qb+RnSI4X1HPau6ND2SU+xz068aknE9VtLlp7GCQM22SNWxnjkU2e4kg5S3ll/3Co/mRXneseNn0PGmWoaWSJAvJwF44Fc5L4v8AEVz8yuqg9tn+NVCi5anLKnK7PWpPEIh+WeK4X2T58f8AfOalsta0/UiVtrtHdfvIThh9Qea8Ql8Ra0rHffMG7gBeP0qtJrWozOHe4LOOj7QCPxAq3QQKjLqfRS3EsZ+WRh+NWV1OZRgqrH1rwvSPiDqtiwju3+0w9PmHzCvQNE8YWGp7VWdAx/hJww/A1lKg1sRKMobne22oiVtkgCk9COlWJ7SC5jKTQo6nghlBrABBAIP4ita11BGUJKcMP4j3rFqzBM5nWPhpo2osZbdDaTdmh4ritU+F+uWys0EkF9GOiSDB/A17OJoiOJE/Ok86InHmJn61ca04lqbR8x3+jfYpjFdRTWU4/gkXK/gan03VvEGiHfpuoSNGOqRuWX8VNfRl7pOn6nGUu7WKZT/eUGuN1T4VaRckyae8tnL/ANM24/Kt1Xi9JItTT3MDRvjMVCRaxYMccNLCf/ZT/jXfaN420DXABaXyeYf+Wcnyt+Rrx/W/hz4isy5S3W7jU8SIBuNcfcWV5p822eGa3kB/iUir5Yy1QezjLZn1gDkZFFfOOj+NvFOjgNBePcwDjZL+8GP5iu/0T4w2Nwqx6xbtay9C6Asv+IqJU2jOVKSPUKKzdN13S9Xj32F9BOO4RxkfhWiDxWdjMWjvRSd6QC0UUUAFIaWkNIYVna/fDTPD+oXpOPJgdx9cHH61o1xHxPvCvh2HS4mxPqNxHCoHUjPP9PzoSuy4q7MzwFp7WHhaBpBiW5Yzvnrz0/QCunqOCFLe3jhjACRqEUD0AxUlTJ3bYN3dwrZsI9lqp7tzWN1bAroY12RqvoAKhgiK8kEVpKxOMCvlXxHenU/EF5dkkiSRiuf7ueP0r6M8c6n/AGZ4YvZlbDiIhfqeB+pr5neJ5DuUEjFdOHjuzSG12faGmf8AIJs/+uCf+gioNQH7xD7VPpn/ACCbP/rgn/oIqvqDAyqvoKiWxhT+IqUUUVizpQlFFFSUgooooGFFFFAgooooAKXNJRTFcKKWkosLUKKKO1IsKzry/KMYosZ7t/hTr+8CKYoz854JHasmlbsbU6d9WBYsck5PrS0hpatUzcKp6jpttqds0FygZG6irlFUo2dyThp/h1DE/m6bfTW7g5AJyDVHRfD1/p/iWdrn5/OiJDDoSCK9GowM1rKrJxcWQqUVLmR4t4rQWviiR343xgnjPTj+lZmy4vGKwLtJ67egHpXafEfSJkuYdXii3xINsvt9a4STWbpl2xFYU9EH9a66MvcRz1Yy5tCY6DcZGSB6moJreKzJV23N12jqTVUXFzJIB58mWOMljWkk9lYQgpH59yf+WjjgH2zWl1uiHzrfUrrps7xefNshjPeQ4z9BVZttvKrwXG51OQyqRg1LIt5ezZffI/XGeg/pUZhRAxkkUleNqnOTUlq/Vnd6F8SzaQCHUrZpAOjxf4GupsviFoF4yobh4GP/AD1TA/OvI9Mt5J7gMBtjU5JPSn6gtgZCtmhLk8kE4rOVGL1MnThzWR79BcQ3MQkglSRD0ZTkVLivANI1rUfD14k1vI6xkgtET8rivXtG8ZaZrCKEdopSBlXHGfrXNOi47Gc4OJ00c8sX3HI9qtQ6k4OJQGHqODVBWVgCpBB7ilrFok3op45lyrA+xqve6TY6jGUubeOQEY5UVkglTkEj6VZgvZIG5JZe4NK1tR3OV1P4T6dNIZ9NuZLSX0HKn8K5DV/htrsG8gQXagdQNrV7Quo27dSV+ooOoW5bGT9SOK0jXnEpTaPl6e21HRrr50ntpR0PIP512Phv4q6tpUscWo4vbQcNniQD1B7/AI17ZdaZp+qxbbm2imU/3lFeaeJvhbaO7SaY4t3PIQnKn/CtlWjLSSNOaMviPS9H1ez1zTItQsZN8Eo4z1B7gjsav14n4MvdR8Ca+umaujR2N6wVZAcoH7EH9K9sHIzSkrPQwnHlYtFFFQSFFFFIaErzDxVJ/avxV0mw6x2MPnsP9rkj+S/nXp/SvL/DqjVPFviDXSMqbg20Ley8HH5CnHS7NIdWdbRRRWZJNZp5l2g9Dk1u1maXHy8hHsK0XcIhZugqSkeU/GLVRHaQacud0z7j/ur/APXI/KuGtNNVNPtWcYaSPefxJqb4k6gdQ8YzRqcrAqxAe/U/zrXvIRAtrDjGyBVx9M13U1ywRNd8sEj6CspVh0a0Zj/ywTj1+UVTkcySFz1NV7KRn020LHOIU/kKmrjk7lwjYKQ0tJUM1QUUUUigooooAKKKKACiiigQd6WkHWnpgEk9MVSIY2kpelJSY0gqre3X2eMbcb26e3vViWRYoy7dAK5+aVp5S7Hk/pQzenC7uMJLMSeSaeUK4zxnmrFjAJJd7j5E5PvUVxIJZ2cdD0+laRibOWtiPFFY/iPX4PD2ltdyrvcnbHHnG5q8+8K61q2ueLVnluH2AlmQMdoHQACtowbVyXLoes0hpaSs7XLQlApaSk0MhvLWK9tJbadd8UqlWB9DXg2v6O2i6vLaMSU6ox7ivf684+KOn5itb1R0OwmtaMrOxFRaXPNo2CyA+nT61eto1mmV34UDCE9M9eazRUsavNKsMOS0hAwO9dd7GDWhfE0twxsrJeGOZJO7+5PpVseHVSItJccqMnC8V12i+G4LC1HmgNKy/Mcd65jWpxZRTWwYmSZyQP7q96zjVUm0jDW9omYjXF6rQW/7u3TqfX6/X0rYj8CXklt5n2lEkIyEYH8s1v8AhnQPMe2tAq/uFE9wxH8TfdX8smu7TSIlcFnLKO2K562J5XZGqT6Hhc8E1hN9i1GFlAOQc8r7g9xT9NvDpWqFlHnRHhlB++Pb3r17WvDmn+ILee3VQssJ2iQDlXxn/CvGtT0+50jUJLO6Uq8Z/MdiK0o11UVuo3HTU9g0a8uL2zD2TwXEJAKpIxU+/Iz/ACrZ0+6uHYx3NhPbMO7OJFP0IP8AhXkvhTW5NJ1GFZHKxTkYPYn1/oa9ktLpLuLcnBHDD0NZ1o8rORrlfKT0UUViKwlFLSYpWCxPDdywAqpyPQ1HJK8zlnOSaZRSApatpVtrGny2l0gZWHynup7Ee9bPhTUG1Lw1ZTSOGuETyp/USLwwPociqgrP8PD+zPGWoWgP7nUYRdovZXU7X/PKmtYO6sN6o7SiiimQFFFFJjRleI9SGj+Hb+/yMwwsVz69B+uK47wNbG28JWZb78+6ZvcsSf5Yqx8Vrh28PWmlxH97qF2kQHsOf54rUtIFtbOG3QYWKNUH0AxTekTRaRJqKKdGhkkVR3OKzJNiwTZaL6tyai1e5W10+SVzhQMsfYcmrqqFUKOg4riPijqIs/CVyoOGlAi/76PP6ZpRV3YpK+h41Yk654x8+QZEs7TN9Ac/0xXYax/x9r/1zH8zWD4EtC1xc3ZHyoojH1PNb2sf8fi/7g/ma9C3QxxDTnbseyaf/wAgy0/64p/IVZqrp5/4ltp/1xT+VWa85s60gooopFhRRRSAKKKKACiiigAooooAKWkopohrUKUUlQXlx9nhyPvHgUeZaV9ChqNyXk8lT8q9fc1QoJycnqaWiOp1xjZWLCz+XamNeCx5+lQUmajmYrC5HUKcVstgUTyHx3qz6trr2yNm3tMjA7t3qz8L7WSTWLifB8qNME+/auTnvCRcsR+/mlbdntXrHg3T08NeEJL65+8Y2uZPYY4H8q6p2jGyMI3bOpimWVpVUg+W2049cCpKyfDtpLZ6PH9oObidmnl9mc7iPwzj8K1c1zNo3sLRwBk8CkzWN4svzp3hu7nU4bbtH1PFC1dhvRGdF40guvFH9lWyCSIEq0ue4649qXx/B5/hqQYztIb8q868CZl8WwZPLBia9W8VKD4dvCw6Rsf0NXJKM1YiL5kzwaKJ5pFjjUs7HAAruvC3h9IXNzOu516Z6A1meH7BI1gkb/W3BCr7A138caW8IQYCqOtOvUsuVdTld5O3QravfR6bp0tw7AYGB7mvMrRLjXNehQIZHlkHyjsP8K0PFGuNq94trbqTDExC46u3rXongTwxHo+nC7nAN5MMk4+4PQVnzewp3e7KUep0OlaZHplsUX5pZDvlc9Wb/CjVLx7eAQ22GvZzshT0Pdj7DqaZq2rf2cYYIYGuby4JWKFTjOOpJ7AetT6JoUwllvLl1kvZ8ebIPuqOyKPQfr1rh395lbC6fZJp9msCu0hyWeRzlpGPJY+5Ncr8QvDq6npJvbeLN3b8/KOWXuK7+5sWgTeG3Dv7VTKhlKkZBHIqYzcJ8wbngVnCb3SZIAP30TbkP9K7nQ9V1C40qO/05PNu7f5Lq2P/AC0Udce/cVlajpw0nX9UtkGAV+0R/wC6ev8AWtLwZMLfVraUH93qELKfZ0/xGfyr2ZSUocxyz+JnoFneRX9pFdQNmORcjsR7H3qxmoooEgaTyxgO24gdM+tSVxMgWiiigApKWihgFZlw4g8WeH5gSGeSaDA6ENGT/NRWnWPqn/Ix+Gsf8/x/9FtVQ3GtzuxS0lLVmYUhpaQ8VLGjzjxHMNX+JumWCndFpsLTyAdmPT/2WukrjPCTHVPFHiLXD92S48iI/wCyD/8AWWuzonvY0lpoFW9Oj33QPZRmqla2mx7YC/djWbJLteMfGDU98lpYq3V2lYegHC/1r2OZ/Lhd/QGvm7xXcya341uY1P8Ay18hPQAHH881rQjeVzSG9zpPB1t5GgRuRhpmZz9Og/lUms/8fif9cx/M1rWkC2tpDbr92NAo/AYrJ1n/AI/E/wCuY/ma7UcE5c0mz2PTv+Qba/8AXFP/AEEVZqtp/wDyDbT/AK4p/wCgirNeUeqgooooAKKZJKkS7nYAe9Z0upu3EShR6mk5JFKLexpPIkYy7BR7mqsmowpwuXPt0rKeRpDl2JNMqHNmip9y4+ozsTtwo+lNS+uFbJfcPQ1WoAycDrU3ZfKjoIpBLGrjoRT6it4/KgRD1A5qWtTne4UUUE4GTwKYgrDvbjz7g4PyrwKtXt/wYoiOnLVmVLlc2px6sKKQ1RudRWFtkYDt3OeBVxZ0pXLpo61gyXtxIeZCPpxRHe3EfSQkeh5q7mipsz5vAGmzeIBqJyIdxdoOzN/hXQ31l9uWC2bAs0YPIn/PTHKj6ZxUMerD/lpH+Kmpf7Ugx0b8qtzb3J9lboXqKzjq0eeI2P405NVhb7ystRcOR9jQzXF/E2Yx+GkTtJMFP5E/0rrEvLeQ4Eq59DxWV4o0JfEWjtaCQJIG3xt1GauDSkmyJxdrHn3wzsWn8Qtc7cxwIct7n/JrsvF2rK3hW7lhYFSzRKfXB2n+tXPC3h4eHdHaHeHuZCWkk7Z/+tXP+LzaR6OloZAluhCg92xyfxNaSkpTREYuMWzM0W3VbyG4mYCK3hATJ43Edfyqj4o8TG5Y2GnSMUPEjr/F7Csa51m4vP8ARrNGVG445Y/4VoafodxaxrKtq890/wB1QPlT3Jq+SPNzSOTVF7wrpVvYn7bfNGJv4Ax+5/8AXrvLDxHYL/owuopJBnaqyDNcXJ4ZvHgMt9qkcS45VI/lX8TWdL4RvtNZ7yGdJPJBkVlyCcc9Kwqxp1H8RrTi92et2VqsZNzIwkuZB80noOyj2rfsLtFQROQuOhrhvBfiFNc0sKxC3EPyuuf1rp884zXnyvGTjLoXOKexuy3EAQ7nUgjpnNYjEAnHTtmkFcj4zuNWukj0rRI5Hmk+ad04CL2BbtmqhH2krGSVjN8VXljL4s0wRSxyTfNDMqnPysD1/GsDTVlsdKuG3FZNL1KOQE/3CcVYi+HmvQxi6We1FwhDrHySSOetamgWJ1uLWobiJ4GnSJZUI+66lgf5V6cXCMLRd7GNRa3PQgQQCOhpaRQFUAdhilrnMAooooAKKKKACsjUgW8TeGgByLxmx7CNq16yhun+IOixAgC3tric++QEA/Wqh8Q0dxS0gpaszCszxDfrpnh+/vGOPKgdh9ccfrWnXBfFK8f+ybHSIj+81K6WIjvtB5/XFCV2VBXZF4NsfsHhWxRlxJJH5rnuS3P9a3qbGixxoi8KoCj6UprNu7uNu7FHJwK34U8uFE9BisezjEl0it061uVLGZHiG+Wx0uaZzhY0Z2+gGa+ffCkbXniUTyDcVDSsT6/5NerfFTVfsXh+eEH57jEI/Hk/pXnPgODM15P6KqA/XJ/pXVQWlxt8tNs7isPWf+PxP+uY/ma3KxNY/wCPtf8ArmP5munocCPYtP8A+Qbaf9cU/wDQRVmq2n/8g20/64p/6CKsEgcnivJPXFqpdXqQ5VeZP5VDd3+DsgYe7VmkkkknJNQ5djWMOrHSSPI252JPvUbOEUsxwB1NKa88+IHimW0jXT7KbZK5+dl6gUoQc5WRrokbmr+OdK0qRomcyyr1RBzUvhvxBceJI3uVszb2qnCsTnea47wh4DbUVTU9ZEgiY7khbrJ7t3xXqdraoipb28SogGAqDAArSoqcfdjqwUnuKqliFAJJ6AVq2ViYj5koG/sPSpre0jgAIGX7sasVCiYynfRBRRRVmZDcXKW6gtkk9AO9ZE91LOfmbC/3RUuosWuypPCgYqoazk3c3hFbjTSMwQEsQAOpNR3E628RdvwHqaxZ7qWf77ceg6VKN4q5Yvb/AM3McRITufWs+lpKtM6IqwlFLSGr5i7BRRRTuh6hRRRTuAU5JXQ5RyD7Gm0UXAfJPIykySsQOuTXIS2J8V6mZ2LLp0A2x5/5aN3P0q/qF8dQmext2ItEGby5B4VRyVB9T/WtXTlC2MRWMRqRlUAxtHYflTc3BX6nLWkmuVEFlollY48uFcjvitEADgCo7tbyK3863tnlxyVCnkd8Vk3viD7NYtNHY3LydAhQ4z7msffqdTnUUtTTu7YXcaRN9zeGYeoHOPzxUU63P9o2+3b9l2sJAR1OOK87u/Fes3DEG4MAz92Ndv8A9etnTl1yezS+tNQeVwAWgmOQa2eHlFXbGqiRWnjn8K6089q5BiYSqB0eJjgqfocfnXrjmW+05LmwIMm1ZowTgMMZwfqOP/1V534ghk1LQo9Rjt3WeEESRledh4Yf1ra+HviB3sYdOujiSIYgc9JFHb6gVFWLlBT6rcb8jrbC+jv7UTIrIQSrxv8AeRh1BqZnigRndlRepY8Ur2kcd293bqFW4AMqjpvHGfy4/AVz2v6ZqWoarYeQ/wDoaPumX/Ed654JSla+hm9jWt9Y067uDBb3kMko6qrZNRaZp7Wmo6pcsf8Aj5mDAegCgf40w+HtP+1R3CwIkiHO5Rg/pWqSF6mt4OK0iYVL2FooorU5gooooJCiiigpBWX4fk+3ePtUkA+WwtI4OR/E53HH4AVqVQ+H8DPHrOqOGBvL9whPdE+UY9uo/Crgt2PZM7OiiimZhXm/iBTqvxSsIchotNtDM4PTcxwP/ZT+FejsQqkntXmfh6Yan4p8Sasp3I9wtvE3qEGP8KFpdlw0uzqaKSlrMC5pozck+imtYnAJPQVn6Wn+sf6CrV5J5Vq7Z5IwKl7jPEfi3qPn6raWgJ+RGlYe7HA/l+tT+EbUW2gQtgBpsuff0/SuT8Z3o1Lxfeujb0VxEhHoOP55r0O1hW2tYoUGFjQKPwFehTVopE4h2gok1YesH/S1/wCuY/ma265DxPqsVpqixM+CIgSPxNavY40m9j2y01CGPTLUDLN5KcD6Cobi8kn4+6voKzrH/kH23/XJf5VYrw3Js96MEgoopKksiuZ0traWaQ4SNCx/CvN/CHh99d1mfxBqUeYRITDG3Rjn+Qr0e5t1uYWiflG4IqSGGOCJIokCxoNqqOgFaQnyppbsbQ/gdO1Ps9StLa+8iaVVkZeATWlaWKKgeVQzHnB7VwXxC8ISX80NzZXCQOx24dsAn/GnThd6sylNapnpQIYZByPWlrx3SJ/HPhx0WQfbrReDGX3HHsetdtZePNPkULqEVxYy9CJozj8xxW0qUo+ZjdPZnWUVUtNTsb9Q1rdwzD/YYGrdZjsZmo27b/OXkHg+1Z9dGQDVG405JDuj+RvTtUSjfY0jO2jMC+gM9sQOo5FYLZwQOtddNaTQ8uvHqOlZl1p6T/NGAr+vY1B0QmYKHcvHUcEVi3M9yJyHdlI7A4FS+I4NS0w/bbVWBT764yjiq1l4j0nV49szLBMOCkpx+RrWMGlzbo6oVYp2Y5L24TpJkf7XNSf2nc/7P5U99MZvmgkR0PTmoW0+6U/6on6GneJ0JwY8arOOqofwqUau3eEfgarfYLgn/VEfUipBpVww6qv1NPmiF4Ex1c9oR+LU3+13/wCeI/Os+bQtTllCRalGh9AmTWvYeBJcBtQ1KeX/AGFO0fpTvT6sylVhF7FK418W8ZdxGg/2jyfwqkjar4iG1d9pZH70rDDMP9kf1ruLTwtpFmwdbRHkH8cnzH9apazeQWQlmb7kfAVRyT2AHrS9otoownV5tEc1NDGLm28O2iYt1US3D9yuc4PuTXTxbQ6AjgEflWH4fRyLqaYZuJJN0p9D2X/gIwPrmtWS4jhljR2CmTIXJ6ms6rbfKYbs6wdOBxUE9lBOSWTn1HFFpIZLWNmPOOanFci0JcbHFeI7Sz0sJcXtmJbZmwZlXJQ/7QqpPZIbRLzS3CuAHTDfK69x+Vd5PBFcwPBPGskTjDIw4IrgbOM6BrU+hS58mQmazY9Ch5K/UV1QqNx0eqEkmzqPD01vqmhJOoDLKCHHv6VxVhbjT9dvvD0v3Ym8+1kBwwHUY+mf51bguLrwheyywRPPpU53NEgyYm9R7UzW9WsNRmttWtJ4xcwOpC9GZOjL+VXFau2zLSakd7pV3JdabFJLjzSNsmP7wODVplDKVYZBrj21ObSZUvY0Mtk/Nwq9VHZwPbv7V1sE8VzBHNC4eKRQyspyCDXNJNamc42ZXttMtLSVpYYyHY5JZi35Z6VakTehXpUazq9y8CkFkUM3tnOP5Gps01J31InFtEEErs7xyrh17jow9RU9JweabJIkUbSSMFRRksTgCumNRPQ5JU2Poqrb6lY3b7Le8glb0SQE/pVqtDJhRRmkpNjRV1O7+w6Vd3fXyIXkx9ATWr4Tsv7P8KaZbfxC3Vm4x8zfMf1JrlPF8hfTbfTV+/qN1Faj6Mwz+gNehqoRQoGABgVpH4QlsLS0lLTIMnxPf/2Z4Z1G8zgx27lfrjA/WuK8AWRs/CFpuHzTbpT+J4/QCtD4p3JPh620yM/vb+6jhC+ozk/yFaVtbpa2sVvGMRxIEUegAxQ/hNF8JLRRSjgisxG5axeTbqvfqawfGOqf2dol3OOsMRYf7x4H64rog67A2RtxnNeVfFbUSuhrApObmcceqgZ/niiEeaSRUVd2PLtDtze69bI3OZA7H6c16sK4XwNZb7u4u2HEa7F+p6/pXdV6KMcVK87dhTXj/iC8N/rVxP8Awltq/QcCvUtYufsmj3c2cFYzg+/QfrXj0oJfPtTdx4WG7Z9K2P8AyD7b/rkv8qnqCx/5B9t/1yX+VT14bPXCiiikAVLbIHuY1PTNRVJbuI7hHPQHmmhPY36y/EGjprujT2LMUZhmNx1Vx0P51qAggEdKK3TtqjmOC8NanNqGl+XeDbfWzGC5Q9QynGfx6101ppsVzHvmAKnjGOtYnibRruwvpPEWjwiaYpi7tc485R/EP9ofrWPpfxY0pYhFdQyxEHBBHK10x95Xic06bTujq5/BejSyedBC9pP/AM9bZyjfpwahbS/EdgP9A1dLqNekd5ECT7blx/KmW3xC8OXGMXyqf9oYrVt/EekXJHlX8LZ/2qHF9UONScTDPivWNPfZqvh+4C/89bU+Yv5YzV+08a6FdME+3RxSH+CY7GB+hrbF1buMiVGH1rE1i00y/wApLawzc8lkBqPZJl/WI/aRrpfWk0e5LiJ0PcNkGseXZ5reX9zPFc5N4O0hyTbxSWjn+K2kKfyqo3hbV4Tmx8UXsfoswEg/Wplh2+ppDEUl1OrZQ4IYAg9Qa5/UPBWhaixeWyVHP8UZ2ms6WPxpp8fF/p92q8kyIVJ/Ks+48a+INOG680i2aP8AvRy4/XmksPUWsTaNenJ2TLg+HkFuSbHVb63PYB+AKrS+GL+2cLJrl+VPT5hz+NVD8UblVBbRSAeh84//ABNQS/EKa95/sqU46BX4/lT9nWNVOJuWulpbMGe5ubhh3mlLVT1PW2glNlp1tJeXuMbI1JCH3xWbp2o6x4x1EaTpkS2eRmafduMa9/Su1gey0O8i8L6NAZbmNQ97dn+HPPJ7sfT3qHT5XeerLdXoir4W0K7tInvNWk33s3OztGPSuno7UyWVYY2kc4ArCUuZ3FqRXdwtvCWJG4/dFed65qrBVnRQ7CTbaqefMfu/0Har+q6w2rSziJ9ljDxPKD97/YX+prib+8llea/lYIwGyCIHPlrnt+FdFCi27sU5KKOr0O4NnElvK27eSzOepY8k/nV7W7MahprqrASJ86H0YViRtviVvUA1s6WHmilVmyvQUVI2lzmUJdzO8N+O5reddP1VQjA48xuAT7+n1r0W2vobpQUYZPbNed6l4cN4GR4lb+644IrECa74VdWhdprUcmNuQPw7fhWc6MKmsHZm3Ppqe0Vy/jHTpJYrTVLWJpLixlDbVGSyH7wqp4c8d2erMttKrRXGPunnP0PeuxR1lTcpBU965rSpS1J8zkbXUbS9QGCdG9Vzgj6inPZWsgYNBHyMH5ava14Ts9VxLGfstyDkSxDB/Guavv8AhJdHj8hrWO7xwkyHr9RWkYqXwM0U0zWtVRY3tfvCL5MHnIx/9eqVu+q+Gtw02MXtgxz9ldsNFn+4fT2o0OC/WGWfUSBPMQdg/hA6CtalJ8ra3RTipEXhLWZNZ1LVZ5rU2sgMamJjkjAPsPWtnVp7lBb21mB51xIFLHnYg5Y/59a5bSbg2nijVcYyRG+PUbcVcm8Vy/ad9rZwXYXjakwDj1605RvP3V0/QhQOtJCLkkBQOp7VXiurPUI5I4pop15VwrBh9DXDajqGueJ8WYtJNMsc/vXZ8u/tW54c0210opBAuAB949WPvUygoLV6h7O61OC8W+Hrnwnqaahp0siW0jExuucxH+6TXQeFPiGLp47HWCqSnhLjorfX0+tdprWmxatpFxZSgESLwfQ9jXgN9ZyWN7NbSfficqa9DD1FWhaW6OSpTV7H0aCCAQQQe4pa8c8KePZ9EiNpfrJc2v8AAd2Wj9ueortrf4j+H52CvNLDnvJGcfmKUqMk9DlcWnY0bmI6j490G05Mdssl4+OeQMLn8a9ANcfocumT682sw3qyF7YWyhSCuAxbP15rrUuIZPuyKfoaryIk7klB6UgIPQ0E4BJ7UmSrHmfiG5Oq/FTT9PzmHToTOwH98jj/ANlrqa5DwvA974n8Qa9KuFlnMMRPdVP/ANYV0z39rGSGlGR6c0p72NZtKxZorkNY+IWk6YTHHuuZQcFU7fU1yOqfEHWNSiaOyg+yof4wctiqjRlIFFs9auNSjt4Ns90kcY/vMBXk/jTXLPWdSjjSVfIt8gP1Bz6Vxl1LeTPvu5ZXPq7E1Wrop0lB3NY0ra3O+8P6pplnC0C3CDc27Lcc108c0cy7o5FceqnNeOqU7scfSplleEh7e4ZPXaxB/KtrGM8LzO6Z3PjS72aWtsp+aVxkew5rgJrO4ZgVTjHFakV/uZJLyA3O3o5ckj8DT73VbOWZWG5flxgjHrTaQ4qVOPKlc90sT/xL7b/rkv8AKrFVrH/jwtv+uS/yqxXgs9JIWiiikAUUUUAaVlfKIxHKcY4DH0rQDBhkEEe1c7Tld0+6zD6GrUjOVO+x0Nef+MvhpZa7K99YEWt6RlgOEkPuPWuia4mYYMrfnUe5ic5OauNVxd0JU7HjE3w28RQOwFqsmOySAH9ajXwfqMC/v7bUIHHpHuH6V7XMftMJimLMvYqxVl+hHIrId9ds5dunazbXCg/La6nFz9BIvJ/KumGJctGDTWyueRy6Zqtqf3OoTr7OXjP61Eb7xLYnc13fKn95ZCwr1q68Z3unKV13wnOFx/rrRhMh/lj86pw+MvC18SheO3J/hmiK1vGTZjKaW8Dzy38S66ceXrzK392YY/mK0V8Q+K2I2atbv9FU/wBK7ae38JXSHzZdNbPfzUz/ADqj/wAI/wCCAf8AWWQPqLvH/s1Xcxc4P7P4HLza/rbOkNzqjPK/IjjhU1RlP9ryBbu+lmKc+SyhB+WK66Sw8JaSz3FtdW5dhjAuN/8AU4rmbmV9a1iH+yLMvHAD+8VMbif6VV1YmHvTtGJORGiZYKFUd+gFZ8a6h4gvhpuiQNLnAeVRwB6k9hXYWXw7v9TVH1e6W2tB8zRr95vqa0p/EWneF4ToXhKzW6uz96bOUQ+rN3+lYSrLaOrOyNNkdwbP4d6Kmk6KEufEN4AGbqR6s3oBzgVP4eWPTLVluWMl1O3mXE55Lueuax9J0Y2M817dTtc6hcHMszepOSBVy/v7bTrVri5kCIv5n2FcU5cz5Y6nTGnyq8jpZtStYYy7SggDNcPrHiE6ikkjytDpKcNKDgzn+6nfHqapadb6r8Qb0xWsAg0yEgu0hIDH3I6/QV02qfCabUIlZ9aZpEGEjEQWNR6AZNXCiov33qZzrQgeer4lhuJhb+SttaLxGijgfWqmqaa7SmeH50lPQepq54h8Aaz4fUyvF58A5MkQJx9RVfQLszRPaSnO3lPpXckkvdOZzv7yZt2vFtGD1CgGtTTLpYJmRzhH7+9ZqYxxT656kb3CEtTrajmhSeMo6ggjvVDTr9XQQykBgMAnvWnXC4uLOi55/q2hqJHlsgYrlG42HGf8DVvw/wCOLvTbhbTVS20ceYRyPqO/1rRvcC8lwcjdWPeWUV7csJ0/dqgwwPOc12pRqR5Zi5rM9StNbs7uBZUlUg91ORVO8uzcvhRhAePevL7T7do8rSaa0jp/FHJgg11GkeKLfUP3UyGGdfvKfWuSrhZQ1jqjaEo3N+ikDAjIIIPelP5VzHQjmtRtZX8SiBH2/wBoxpB8p+YAN8x/LNa2u+DNItfD11LZWpiuYYi6So53EgfWrthYWNzrEGoNOXuIQRGu4YAI64rR8Rm4OjTLbxPITjeEAJ2Z+bA9cVuqzTikYyWpkWBkOn2/nf63y139+cc1YhjAuY3Z3wGB4bFVzNDHYQ39vL5ljKQM9DHk9/oetWawd73N07o6QYxgdK8i+I2kmz1wXqofIuANxHrXqlhN5tsueq8GqfiXSE1rQ7i1YfPtyh9GHStsLV9nO7OKrE8EkiVfmjfevr3FNSPzOFZc+hOKe8UlrKwZeUYqwI70xwh5Qn6HtXueZhcsRrc24JSaSIDk7WI/lTotX1G3bMF/dJ9JT/jVQFtuA3FNxih26BbudLp3j3xFpsqsuoSTKDkpMdwNd7pvxfgubV49Rt3hlxjdENwNeQLE5/hNI+FOBzUummtSXTiz0LUfH8EdubfTbZgoyQCNoye57muSvde1LUWxPdmND/BGdorL3uUx1HvQkTyfd5NEYRWyEqUY6kwJi5QRn3zk01p5X6v+A4o+xzYzhT9DUTIyHDKRVtspWBmZuGYkD1p22Irw5De44qMnPWipuUFFFFIYodlBAYgHrg1Xm5f8KnqGX7/4UMTPpKwdWsLbDA/ul6H2qzXJ2ZYWcBBI/dr0+lXEu7iP7srY9+a8ax1qJ0FFY6arMv31Vv0qymqxNwysv60rByl/NLUCXcEn3ZV+hOKmBz0pEtC0UlFArC0UlFAWFqOWGKeMxyxrIh6qwyKfUbzxR/ekUfjQOxmPoQiJbTdQvbFvSOUsn/fLZFZV1p3iUsfNGjapFnJFzbBXb6kDFb0mqQJwuX+lVZNUmb7ihPfqa0VSSDkuc7NaGJSb7wNp8h/vW0yKPyNUDNpAPPgCXPtJ/wDWrpZJHlbc7Fj70xmVAWYgAdSa0VZ9h+yRk2l7o8XKeAG3/wC2VI/8erRbxRrax+Xpfh21sR6ySL/JagN600gSzi80d5jxGPx7/hVmJHVcySb3PU4wPwFKVV9V+ZUaMepmtba3qshbXNVeWE8/ZoMoh+uOtaFva29pEI7eFIkHZRipiQBkkAVi6r4msNMUqziSXHCIaj36jsjW0YI2HbahNZ+i+BJvEesnUdakb7Grfu7ctywHrjoK4seOtQ+2+Y0cZgz/AKrH9fWvSPDnikahZrJaFTKOiM2CD/dNdEaU6SucOJxF1aJ6Ja2ltY2629rDHDEvREXAFTVlaHrkOt2ryIjRTROY5oX+8jCtWs2rHA731GuiyKVdQykYII61438RfBUehONf0dPLg3/v4l6Jk9R7V7NmqOsWEWqaTc2c67o5UIIq6c3FjT5dT51XWDE0cjLmJvvY7VswzRzKHidXQ9wa5l4BBeXdg3Pkysgz7Eiq9teT6dMTGPlP3kPQ12yjzI6eS6ujtakWeVRhZHA9AxqjZ3kV5CJImBPdc8irVc0ogpdGFNZQ4IYZBp1FLYpu5mSaUysWtLh4Ce3UVUuItWgIlIiuAv8AEi4YVu96rX3nC0drcnzV5GBya1Um9xpsk0PxA80TRk4kXh427+4qa51rUYbe5t1tmnEgIgkXqmezf41xck88d/8Aa40aKTdkqRXVafqcV4qkELJj5kPY1nUoqL5kjohUvozXtdF83SbT9+8d1FEB5kbEENXUeFdRub2xlgviDeWsnlSMP4uMg1RtijW6GPG0jtVXwZO0viPxCAT5YePAI74IP8q4JXnGV+hrN6GjrGl/Ynl1CziZ4JQRfWq8iRT/ABqP7w/UZqjpbRmyUQTedAD+6fOcr2B9x0rswCTgDJ9K47XbCTw9O+p2UJaxkbN3Ao/1Z7yL/UVEXzrle5EJ2epsabLsuNmeHH61s9RXMwTKfLmiYMpwykdxXRQyiWJXHcVlsyqsb6nnPjrwtcx3f9raZDvRxieJRnn1xXnc3yMVeExnPTGK+juowR1rnfEXhnTb+wmka3VZEUvlRgnFelQxvKlCZxuDT0PEI3CE4JGe4qUSxE/vEVvUrwasaxpZ0y4XY/mW8g3Rv61m16UZ31QmrluRImGYZT/uk8io/s8gXO3PsKj8zKbSBj1FOR1U/Pux6qeau6ZNmg2heQWH9KC7AYDdfbFSSrvj3JJvHcHqKhSMuDt6j+Gk/Iad9xoJ7E07zHAxuJHoeadGiE4csvvjpSOmxuCHX1HelqGgwFe4z9KdvxwpP0IzUka2xGXd1PpjNWBbwYyrxsD33EGmkxOSRTBUOMrx3ANLJCUIKkMh6EVPJA57K3vnkVDzHlGBx1weKLdx37DNjAZx+VV5vv8A4VaAOCwB46n0qrNnzO/SoaG9j261B+xQYIH7te3tTJVvAcxNCR6Pkf415vaeL9WgjRfNV1CgYZa1IPHd1/y2twfUrXnPCzT0OyNaNjsRNqC8NZJJjvHL1/AgUpvnQgS2VynuFDD9Ca5lPHUDH5k2/VT/AI1bj8YWrkYlh/HIqXRqLeJSlB9TdGo2nG6YRk9BIChP51bSV15SQgexrATxFZzD5vJYezj+tWI5tInG5VjQ+q/L+oqHCS3RVkzdF7cr/wAtW/GpV1O5A52n6isQWttMB5NzMAP7k5/xpjaXIT8uqXy+wdT/ADWpshcpv/2pceiflUZv7k5/eY/AVhf2fqAfI1ibb6NEh/pTzp10339VufoqoB/6DmhqPcSiar3E0n3pWI+tR81SSxkXg3903sSv+FDWMPPmzzuD/fnYfoCKLIfKWJbiC3XdNKkY9WYCoF1KCUA24lnz0MSEg/Run61A40e1clxbK3XLYJ/WoZ/E2k26nFyh9lpqDeyY24rdl7zLyT7kMcI9ZG3H8hx+tCaeh+a4drl85zJ90fRelc1deO4EJFvFv9zWHd+M9TuMiMrEv+yK2jhqj8iHWgj0We7trRMzSpGo9awL/wAaafbcQZmf24FefXF9dXTFp53cn1NV63hhIL4tTKWIk9jc1LxVqF/lRIYoz/CprELFjliSfU0lFdKioqyMW29wq5pmpXGlXqXNuxBU/MueGHoap0dKbVyWk1Zns+ka8J2XxJpis+xPLv7YHBZR/GPUj9RXp8E8dzbxzxMGjkUOpHcEZr5s8G6+2iauBIw+yz/JKD09jXvGjO8FilrblWiUYiJP3V7D8OlcVWHKzlmuV2Ld1rlvbOynHHdmwKytT8XWdtpktw88Soo5KtnPtXnvxJ025t9ehlup5GtblNispwEf6V5tcRTW0jQy7hg9D0PvWsaEWk7hGKl1LV9ei+1m4vEG0yyl1H1NPkRbtAy8djxzmsyrVvdbHy3fr710HUtNhIppbG6DxsQynkHuPQ11Gn6tFejBUxyenUH6GsZoYrhQSAc9xSNpF7bkS2xLd+DzUSs9xNJ7nV5pa5mPXLuD93dREH+9jBqSLxDskAkw8Z7gYYVk6bEkzoqSqsGpWlwuUnT6E4P61OZowu4yKF9c1PK0FxJGC4JXOSB06VR1TTzdRBocLOnIYcZ/Gkm1m2RikW6dx2jGaw7jW7uWYMjlFB4ArSMWCudBoPiOWzk+x3obcnBz3/8Ar16H4bit/MurqBgwudsm4d+1eVRfZtXVZNwjvBwccZre8J6vPot62n3blI2O6F26ZPUZrnxNBOLlHc6IVLqzPWo3Mbh1Az70l0VvA6yxqVddrL2Iqlb6hFMAGIR/Q9KtBlxncMeua8zVCZwdrDN4e1I6Pctut5Cz2Mp7r3Q+4zXQWl41s2OqE8im+KrSDU9KMSSBbuNhJBIvVGH+cVy9rda1JaRyxLDK2NrxycEMODzn1FbcvtFzfebRl7tmehQ3MU4/dsCfTvTb5lSwuGY4Xy2z+VcjYzaqzk3cNvEMceXISf5Ua7qssWnm2EpaecbI1z69W+gFZqi+dJEysch9nF34RgDr8yiQIT14YkGuNrub6SOz0fyYziOGIopPcnqfxJrhweOma9uls7nN1HxyBPvRq496HMTHKqyn0zkU1NpOGGB6ihkUH5XB/CtgBVcfMoPHcUhbLE9KehUdHKt69qRySfmA3eo70ugCiU4w2Sexzg00ux6nNCsAMMgb8cUpUEZAYH8xT1YDKKKKkB4LMgUHkH1p5mmI2M+cdmHNRAd6lLo64bIYd+tUmDQxJGjfcPxB71XnOZMqMDHTNSkc9c1DL9/8KliZoKIbeFC3zuQOAaiknaTgAKvoKgT7i/SnU+YEgooopFBS7iOhNJRQA9ZpU+7Iw+hp63dwhys8oPrvNQ0UBdluPU76E5ju5VPsxp7a1qbjDXsx/wCBmqNFLlXYfM+5O17dMSTcSnP+2aY1xMww0rke7VHRRZCuxSzHqSaSiimAUUUdelAgop4hlbpGx/Cn/ZJ/+eZp2YuZdyGipxZXB6RGl+w3APKY+posxc8e5Xoq2Yiifv1Uj+8p5FV5Y/LkK5yOoPtQ1YakmMr2f4e67/aOipbs3+kWw2n3HavGK1vDetyaFrUN2pPlZ2yqO696iceZE1Yc0T2nxZpz65ok9v1kA3Jn1HNeUmxk1LTBudX2Hakg4ZCP4WFey2V5BqNpHc2sgkikGVYd64LXbIaH4xhnjG2z1LKyqfuiT/P9amhO3us4nzJabnmMsbQytG4wynBpldH4us47TWFYJhJVzxXPkKDwQw9K2cdTtpz54KQ6C4eBsjle4NdNpmqxTRiNzgjgZrmw0RK5QY781I0AQCSJ2X36j8xUyp3HJJ6M7OSKOZNrorKexFYl/oEZVpLY7T121Vt9ZubVQJU8xOxBq6niS3YfPE4P6VnyyTISlFnP/Z2DlGO1h2PerukaRLquopbI2E6u/oKWe8tJmJKnGcgY6Vb0/wAQrpbFreDJI5JpycmtNzd2sdv9lsfDujytEiqqISWPVj715UzbnLepzWjquuXurv8Av5CIx92NegrNqaVNxXvbkihipBUkEdxWta646L5d1GJo/wBRWRRWjSe4NHoWmeKbfYkTSAqBgBjgiugt9WtbnhJME9ia8dqSKeWBt0blT7Vzzw0JbDuz2usu9iW1drmKdopCchRyGz1yK4Wy8XX9su12Lr7GrR8Uw3Dbpll3ep5rFYaSZXO0jo31q7A5aBfQ7T/jWa+0TyXczlpXHzO56D0HoKypdetB8yIWftkVhXeoXF458yQ7M8KOgrohRS6GblKRc1rUxeSCKI/uk6n1NZNFFbJW0GlYKKKKYwooooAcj7CcqGz60Eg9OB6U2igQUUUUDCiiigAqGX7/AOFTdahl+/8AhSYmSJ9xfpTqtLY5iQhiPlH3qPsEuMhlNVyshVI9yrRUzWs6n/Vk/TmmNDIgyyMB9KLMrmXcZRRRSHcKKOvaigYUUUoXJwTj3NACUVObSYdEyPY0C0mxyoH1NOzJ5kEdszjcWVV9TUptYEXLzZHtVd4wn8ak+1Ivlfxs34CqXoS7vW5MXtE6I7n3NH2zbxHEi1Zs7WC6cLGCW77u1WZLextSN6FyRnkYxTszNzjezWpmi+mPU/pSi7lHL59s1ca+iSDbBEiOeAAKy3kaRssxY+5pN2LilLdGlHrlyihE2r26VfsrhNVTybjmQgkOOCK5yrdlcGF2K5EjjapHbPehSJqUY293cinilhuXhfO5Wx9ac8ZmuymenBPpgVs61bbp7a4jwcjDMe+PWs9IEZHJuApY8tjIp2FGpeKkReXH5iwwQmaRjgDkkn6Co5Ihtf8AdmOWM4dD2qyLS+0+WO7tzkoQUkiOcGluZrm6vLi8vBiaZSx4xml1KT7M7z4Xa4u2TSJXAYN5kOT19RXVfE7STN4We6iVi8LLKuB909/5mvENPvJNP1CC7iJDwuHGPY19NaXfwa5okblQySxAlWGQQRXJU9ySkZ1I8srng3iqVb3TtOvAclowD9SOf1FcwyjGR2Ndf4v05dNN5ZKf3cNzui/3WGcfhmuWhCSERnCkjr6116SKoaQsivTklePO1sA8EdjRLE8TFWGCKZU7G+48OcEZ4NBjYpvA4plO8x/7xo9RjaKXr7UEFTgikAlFFFABRRSlcYIOQaAEooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAqGX7/wCFTVDL9/8ACkxMnWZyi5Y9BTg7ngFj7CuntNHsIoI5WQyfKD8x4/KtNI4ogAkSL6BVArTU43iorRI4xI7wDKQzY9QpqaCC/u5giK49SwwBXY1DdecsDPAAXUZ2n+L2ouzP6029jBuNBuki3xypKwGSoXH5VkeaVJBRcj1UcVv2ut+ZOVmURD0xSappaXcZvLUfPjLL/e/+vTZpCrKLtVOdaRm4J49AMU2nFTjpjHBzTe1QzsCnA54bp/Km0UbDHhmB4LMBQ8rsME8elSW8/k9qn+2I3Dxgj6VW63M22nsUcUuMVtwabYXUfmeY0ftxSf2PZPKYo7/5x2YUuVk+3jezMq3uZLaZZYjhlP51tXaQ6jAl3EwU4AkX0qCTw5cgZiljkH1xVaL7ZpUxMkLBTwQRwaautyJShN80HqVimx2Y8bQfzqCtO4mtLuIBW8p85IYZBP1qnPGsYVUcPnkkUmjWMr77kFPiUtIoHBJ60yp7WBppCB91RuY+1JItuyuzYuZUlsorff8AMAcse5rKj8y0ch1JjPU44qOWUtKWPbgD0FTW88juFJyOmCKu6ZioOKJDdtbZNtLtDDoDxVczy3D/ALxyS3DMfSpZLeESkZAOM7ScCnLakuvIPsKeo1ypXKk8fkyle3UV7Z8IdYF5pEljI2ZbbgD/AGa8nv8ATn+wJcDqn3h6CtP4e61/Y/iaIMcR3H7sn0Pb/PvWFaF42JcvaQujs/ivojLA99CPk3Kz4/L/AD9K8hzX0P4tj/tjw7dwgYcxHH86+eSCpIPUVNGTcPQKD0aLUUwkGyUBu3NRTw+W2Vzt9+1QjrVuJUkTaspH+ywz+tbr3tDV6alSinyxNE+1hTKlqxSYVciEN0vlswjk/hJ6H2qnRQnYTVySaGSB9si4NR1ICWfa7deMnmmuhjbawwaGuw15jaKKXOetIYA+opD14oooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAqGX7/wCFTVFMBv8AvdvSkxM6zSpBP5beeZAoHyls4OMVuwRo06KRgMRmuXhQaPqcDdLeZAMnt/k100cnIdSDjkGrjJSV0ebjKMqU+Vo6FYkXKiMBeg4602WzglQgxgE9GAwaji1G3ZF8yREc8YJxk+1WwcjOc0HnO6OA8TWMlhcRz+WGQ8FsdfrSaPdXEsjeYm2IDg4xk+1dxf2UOoWkltMMq4xnuD6159DaXela0tlNkKWIViOGHqKaZ30pqrScXuhNf08xv9shUBG/1gHr61jQ7DJiQfKRjiu2dYrmF7ds4YYIIrirmCS0uXhcYZD+foaR04ao5R5XuhkgUN8vTFMqfYHQyKec5Ios4GubxIgOp59hQ0dV0kQkEdaSrF1GBKyqOhPA5qvSeg07q44OwGAxH0pOc5zzTj5Yxjcx/SmZzRcC3FeywxbFkbjpgmpU1q+T/lruHo43Vn0U+ZkunF7o2or3T75hHeWqxyMceZHwKh1LRpbH97GTJD69x9ay+ldlpFyb7TR5uCRlG9DRuYVW6NpR2OS8pm2kHKnvVjz1toWhjBDMPnar11ps1vePHbLuRgWQH9R9ayipWdhOpVs8g9aZopKY2UZIfGA361LauBMq44P86lazu7naYrWTaBgcU5tMv4E85ocBefcUbMfPFqzY2aMXEhAbEijoe9QQSvBMASRg8j0q1DNC0nmMGDkY9qr3yhbjI/iGaH3Jjvys6m1nFzaASDcjjax9D6GuVu7aSyu3iOQVOVPqOxrS0S/ETtbzH5ZOhPZqva5bC5tYnRC0u4IuPfsab1MY/uqnK9meqeF9RXV/DVnOW3sY9kmf7w4NeX+N/Dh0nVnmt4828vzYH8Jrovh3qSWWo3OgmTepAkVs8bwPmH+fQ1L8QLprfXdMRseTLGwbPQ8//XrkgnGo4ju4yujyygda1db04Wc4liGIpD09D6VTt7VbmKXa+JUG4L/eHfHvXRbWx0xmpR5ug1mkktxuUttPDe1QU+ORojwSAeoph60MpKwUUUUhh2xSliQATkDpSVJEY92JQSPY00IYT7CgIxGQpI9aVtocgZK54NPDtA2VOQR+dFgIqKc5DNlRjPUelNpDCign86WgBKKKKACiiggigAooooAKKKKACiiigAooooAKKKKACoZfv/hU1RzJ8457elFhM7PUrM3mjIEGXRVZfy5FM0O4EmnhS3zodpGefatS3/49ov8AcH8q5uQ/2TrkgXiKRSQPqP8AGuPB1N4M9LO8JzQVWJt3ioLd5iBuVc5qzpOtvC8EF2P3MqjZJ6HHQ1lGWO7g2NJtiwoY+vt+NQ3/AJkgQxAKowUGetehY+ZUE1yyPQwO/rVLU9Ni1CJBIAHjbcjdxXMWerX1hGpn8wQZ/ibOPzrpLbW7C5UbbmMN6E4qbHLKlODuiL+yty5SQLxwOv61yfizTJbdorkqOm1iP0rrm1SztsJ58YRR95m4+lQ3lxp+qWLRGVJkPdecGgulOdOak9jzFHKMGHatzRlMcFxdbNzyHZGo7nv/AErJvLVrO7eA/wAJ+U+o7VuiePTtPgH3mCZGPU9acT060uaKUeplahcSmbaSVcfeHvVE8kn1p88zTzNI3VjUdKTuzeKsrBRRRUlBRRRQA5VHBY8eg61v+GZwPPg78MP5Gueq1p1w1rfRSKe+D7immZVo80GjX3y3K3Use5popxKi5/hHHFQXt3FPJ9qkhMb42orDknvUl20lnfDynCAtjcB2PODVQlr3UYHbJSSXagP90Ec1b0MIxXxdDoRN5csUOcKkRkc+3QUkU/23S5pidquG2+wrJnud39qzZ/uxL+ZFWoH+z6GYiOluXP8AwImi5zunZX66GOFilk3QPtY/eU9Ce+KjvgcoSMEDBqErJAyOQVJ+Zc966OS1t9UsUlDKjkZJzS30OyclTab2OYBI+lb9hrasqQ3QAIxiTsT71Tk0OcoWgIlA9CKzpInicpIrIw7MKSuimoVVY1YbhtH8Rx3cb4Ak3gg9jXY+J9Ws9csEguwYJ4jvSULuXke3IzXn1ujXVzFCxJBIUc9BWjGsq32yyDzTINpLHIA96TUb8zJlScpJLc0r6N7jQMvhnVQ2fp3rlUdkYMpIYdDXa2lncRxH7VMHZhyoHFc/qukPbytJAhaE8kDnbSU1L4S4UZ0PdqLczwFlBOSp70giJDDglRkYpqMAcMMe47U8SCJtynJPtVqzRevQhopzYJyOPam1BQUcd6KKAJkEBQhgwP8Aez0/Co2XbTakTy2BD5B7MKd7isMDEDt+VIeaUjacdfekoGFFFFIByIXOARn09ab0NAGTx1p52FOhVx+tMQyjJxiiikMKcpUdVz9DTaKAFbb/AA5+hpKKKACpYokk6ybT7ioqASOhxQhFiW0aNN6sHTuR2qvU0UzA7S20E8kDtSyW7AnAyRz8vQj1FU0nsC00ZBRRRUjCmzS5YZRTgdacOKhm+/8AhRcT2O50S/F9p6EjEkYCv+XWq3iK0821W5UfPEefpWZ4fka01FYZMqJUwM8ZPUV1UsYlieNhwykGvOmvY1bo+ioS+uYRxlujk7SJZIUYyYBPyg9jW5bW6Rq7qzNMeGc/0zXNYmtZ2gbKvG33T0Na9vcBYo2B2gsdwPp/9bpXqJ3Wh8liKckwnCoJN7FQPvszEk57Y71kA2oblZFHYhqu6pdxXCBFwduSSo6np/Kore0t52VI97StjjHA9aZVP3Y3kVAHnYAEsBwNx5re0vS5INs4mIkzyvYj6VetNPis1BVRvx970qyTsyzH5QOSaRz1cRzLljsZ2o20cmp2Uj8csD+AyKp3ulRXAJtJ13dfLY1cgWTUrFpi21vMLQn+7ioba6jJljuVCOn+sBH8qaCEpR2exzUkbxOUkUqw4IIxTas3j+ZM7/w7jsHoKrVDVj0U7rUKKKKQwooooAKfF/rU+oplTWygyh2+4vJprcmTsmbOpzJNKLWJA0pYJuPbtTo7dYNSCg5Wyg3E+p5P9akfb/attEQBsVp5fqRnmqUl0zaddXHRrqbaP90DpVM5I7JL+rlaNGlgji/iups/THH9a0ppU+wXUnSMstun+6vWqEU8cV1G/wDDbR8e7f8A6zU6oZobC1I4JM0n0z/gKRc1sS3Fo9zbRIVAuZSZAP7qgcD+VVNJkMc8kMqsUYFSoGSD64roLK2k+0yXdxgO42ov91aLqVLa6hjjjVTMSWfGM0+piq17w3MC3uZtJupFyGQj863biG3vLeIXa5Zk3gjgr0/xFU9dt1urNbqHDGL7xHcVdtlW7sI5AfvwiP6etO/QVSScVNaMzXtRo8y3AjEsJ6Sc5XPrVOG9udIuJHVUcTc5PIPvWxDcxQ28lvK24Q8OGGc57AVnyy6WE2JHK6A5wucL+dJxTVmbUas4yv17jW1XUrnY28RRyOEUKMZNdBa42MhcuyttLHuawYplmla82bLa2Q+Wp/vdvxqxYySs9pCM4A82U+5zSjFJaCxM51fiZYvNDt7kllBikPO5eh+orm7u1lspzFKMEdCOhrqJrq4hSZQpLxHcP9pP/rVLLDBqlihkA/eKCp7g1TRlTrTh8WqOLU888n0NSgopDbOD/Cf8afeWU1hP5coPqrDoRTUldRhjvjPGDUo77pq6EcwschSPUZpvlqxAUkE9N3+NSPHGP4XXPTPSoScZU/8A1qbBCMpVsMMGkzjpUgmdRjOR6EZpXMUiZUbHHUdjU+g7sjJpKKKQwooooAAD2pSxPXmgEg8Uh60AFFFFACgE0542QAnBB6EUsRYZ2gMDwR60rHAIQkA/wkdKaQiMY7ikoopDCiiigAqaGVkzt6moaBTTESzEudxADe3eoquW4jYFZoP3Z6Mo5WoJoGhbnlT91h0NNoV9bEVQy/f/AAqaoZfv/hUMb2N6+heG0tbkT+Y64w3p3rprScXVpFOp4dQfoe9coiecYLXecSHk9gO1aWgXPkzS6e5yVYlD/OscXT5oX7HdlFf2dTkk9yPxFa+VLFfJ1yFb6jkVj7jK2XOFJz14/Ku0vbVby0eB/wCIcH0PauJhiDO8TA+YMgD39KMJU5oW7FZpQVOtzLZlu2Fk0nltnngHOM1ctY2t71oY2w5GVYDr3rPewls2gkkGc8ken1rW04u1z58g3kA4A6AcZrrPFqPS6d0a0Upa3Uz4VzwR61na9cyQ2ixI3MjbTj0pLxrZLwPHL++A4Vslc/0qlNHcXWpQRvmRkUSMv4//AKqTOenTXNzm/aQrZ2UcOeEXk+9ZOvWZKfbYsggYkHt2NbYKyIGIHHNRCaC8jkjUh4z8rHsaDKE3GfOcMzFjzzSVLPAbe5khbqjEVFUs9dO6CiiikMKKKKAFHPA71rabZrLexW5OVX97J+HQVlEMmD0Jqa3vZ7YOIn27xgnvVJ23M6kXKNkas021tRvSeWPkR/1/Ss+5YJa2kAPCoXP1J/wqrvJXaSSOuM96azbiTRcUKfKyS3ia4nSFersBXS2ccQu7mVj8kRS3Q/TANZOihYpJ7t1ysEZI+prWgQxaKNwJeT9634nNCMK8ru3yLRvB9olPHy/Ko7k9zUV+oubJWziRFMnuOK5xrtt7FmLE8j3Na+mXNra2xe7uFMrjlSc4HpVGcqPs0pLcl0+dJY/snBh27Cf7xOc0/QQ6W88LdI5SorKjnxfSfYY2ePOY+Dhc96vXsraXpKxqx8+Ync/fPc0roqdJ2supT1FUOqSpAxZ5CA3oDV3IsLFre1tZZZH4ZinGaj0yAWemvfum+ZuVz+QqhJqUxcs9xKzZ+6jbQKGl1NYN/DHoW7q2+xafbLKG8rO6RR1LY4BqrDrDR3AcxKqdML6VqQXltqtm1mzMJWXjfzz9a52W3khmeJ1+dTgihtrYVJc14z3Na11GSXUvkcvkHaG7+341Yv7pra0CxKyoxDxsP4eeV/PNc8jtFIrrwynIraubhJ4J41+ZZsSRY7N/EKE7hOmlJNbHVyaJFrWiwGVtspUOrY6cVwF5ZzWN09vOpV1OOeh969Y09DHp1shGCIlB/KqutaNBq9o0bKqyjlJMcg0mcNDE+zk4vY8yjkJTy2Ybe2eR/wDWpHkQ/JKmGHG5ev8A9elv7G4067e3uFw4/Ij1qBVDnGcN2z3ouesrNXQMqj7pyPpTamSSRCV447MM0rTRuOYVz6jilYZBxjrRg4ziipI5NhIPKNwRQMjopWGDwcjsaSkAEYNFGeMUUAFFFFAB705JHVtwPJ9eadGqspJVgB/EvOKAoLkeZxjg0xDXZW6LtPcZ4ptKylWIPWkpDCiiigAooooAUEjufzqdJCYiGUtH/I0weU8YDHY4744NEcjQN8rBgeq9jVIl6jHUDBU5U/pVeX7/AOFWyUOcKwU849KqXAXzBhu3ekxvY3TbtamJjkq6BkJ6g+lVfPe11BLkH5shjjv61Z08m5j8mViyMoPJ6H29KqXC4mkTJIUZGapq61MqMnGV+qO4Vgygg5BGQa5nVITYawtxGAqSjIJGQG71q6HK8ukxFzkrlR9Kh8RqDpaseqyDH615lF+zrcqPpsZBV8Ipvtcwp5gzMXnaRz154pts8kgkCfIqoWIUnnAqma0dIAM0uRkeUeK9NSufNTXLFlqK0RbQXV2+2BOid3I9fxrS0eFisl3L/rZuQPRe1ZuuMRFZQDhCu78a3UQJcIF4AiC/gDQcVRtwv3/QHQHIwW7BB0qjPeWulxlSVaXtEh6fWqOtandR3D2sbhI8YyOp/GsME7s9T6mlexdHDuSvLYlu7qS8uGmkABbsOgqGiipO5JJWQUUUUDCpIIvOlC/w9SajrQgAitQygZbrmmldkTlZFSYh5G5wBwB7VFWjeW0YQSDIYjJrOpyWo4u6DHGafHG0pIUZIp1vhplQjIbg0hzFMdpIweKVht9DSQMmmrap9+4lCn1xVu71KOG3lt4GJlOEUAdAOP8AH86xRdSiUSbvmUce1dPolhbpAtxt3StzubnFKpUUI8wqGF9tUUWzM0/w/NO3mXW6KPqB/Ea3YtJsIcFbZCR3bn+dXegrAMr6nqzWtwx8iMEhEOAT71xRlUrS3sj3K0KGBp8zjdm0Zba3GC0aewxXP+Jm8wWzqPkO7n8q25PD9g9i06q8UidCj/41jXpNxoLmQ5aJwFP6V1U6Kg97ni1sx+sWSjZXLNx5yaPEIU3YQEisbRptNgvj/a1q09s4wdrEFD6jFdLpzmTToGbGSgrNv9Nt/tKyAEbyAQDxW7VzgozSbgY8aBJp7m2LLDC26Nm6nngH3xUl/dC9C3KrskxtfHeptbkMUi2caqsKcgAdT71nRn5cdiOaS7HTH3rTIgeeamt2PzANtwN2fQjpUK/epyDLAdicGpNGro7TQPFobFrqLKhHCS9j9a7EEMoIOQehFeOyHdnIH1rvvBl7Nc6Y0UrbhC21T3xVHmYvDqK54k3ijRo9RsGmVf8ASIQSpHceledGMDDkEofTtXsTgMjA9CDXj93+7vLhFOFDsP1pXNMDNuLj2GEhZMhtwx19qIzHnEoO09x1Fbnh7Q7XVf8AXvKOcfIQP6Vc8S+GrHSEia2ec7hzvYH+lLqdvOublOYlgMYDD5oz0YVFS7iMqDweopUO47SBiixaDY20ttOB3ptSwyspIH8PIzUZOST60NAJRRRSGFFFFAE0TAADzCjdvT8aJy2QHiVT6qMZotwJJPKYAqfzFRuMErk4BOKroT1G0UUVJQUUUUAFKDhgcA+xpKKAHuyEZVNp788UyiigBysAOnOajuDC0gO1hx6inUy4dvMH0poTP//Z';
        logoImg.alt = 'PicFlow';
        logoImg.addClass('picflow-w-80');
        logoImg.addClass('picflow-h-80');
        logoImg.addClass('picflow-rounded-full');
        logoImg.addClass('picflow-mb-10');



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
