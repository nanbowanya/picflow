import { requestUrl, Platform, Plugin, FileSystemAdapter, Notice } from 'obsidian';
import { SecurityManager } from '../utils/security';
import { t } from '../i18n';

export interface KeyBridgeLicenseInfo {
    valid: boolean;
    plan: 'free' | 'pro';
    licenseKey?: string;
    activationDate?: string;
    expiryDate?: string;
    aiTokenBalance?: number; // Total tokens available
    message?: string;
    downloadUrls?: {
        mainJs: string;
        stylesCss: string;
    };
}

export class KeyBridgeClient {
    // User provided KeyBridge server

    private static BASE_URL = SecurityManager.decodeBase64('aHR0cHM6Ly9rZXlicmlkZ2UuOTQxNjgxNjgueHl6');
    private static APP_ID = 'obsidian-picflow';
    private static MACHINE_ID_KEY = 'picflow_device_id';
    // Rate limiting for refresh
    private static lastCheckTime: number = 0;

    public static async getMachineId(): Promise<string> {
        // Ensure async context
        await Promise.resolve();
        
        // 1. Try Hardware ID (Desktop only)
        if (Platform.isDesktop) {
            try {
                // @ts-ignore
                const os = require('os');
                // @ts-ignore
                const crypto = require('crypto');

                // Use more stable hardware identifiers to avoid ID changes on network switch
                const data = [
                    os.platform(),
                    os.arch(),
                    os.cpus()[0]?.model,
                    os.totalmem(),
                    os.userInfo().username // Use username instead for user-specific binding
                ].join('|');

                const hash = crypto.createHash('md5').update(data).digest('hex');
                return `hw_${hash}`;
            } catch (e) {
                console.warn('Failed to get hardware ID, falling back to storage:', e);
            }
        }

        // 2. Fallback to Persistent Random ID (Mobile or Error)
        let machineId = window.localStorage.getItem(this.MACHINE_ID_KEY);
        if (!machineId) {
            // Generate a random device ID
            machineId = 'pf_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            window.localStorage.setItem(this.MACHINE_ID_KEY, machineId);
        }
        return machineId;
    }

    static async verifyLicense(licenseKey: string, checkOnly: boolean = false): Promise<KeyBridgeLicenseInfo> {
        if (!licenseKey) {
            return { valid: false, plan: 'free', message: 'Please enter a license key.' };
        }

        // Rate limit for checkOnly (refresh) requests
        if (checkOnly) {
            const now = Date.now();
            if (now - this.lastCheckTime < 60000) { // 60 seconds
                return { 
                    valid: true, // Optimistically valid to not break UI, but with message
                    plan: 'pro', // Assume pro
                    message: 'Too frequent requests. Please try again later.' 
                };
            }
            this.lastCheckTime = now;
        }


        try {
            const machineId = await this.getMachineId();
            const response = await requestUrl({
                url: `${this.BASE_URL}/api/license/verify`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appId: this.APP_ID,
                    licenseKey,
                    machineId
                })
            });

            if (response.status === 200) {
                const data = response.json;

                // Parse balance safely, allowing 0
                let balance = 0;
                if (typeof data.aiTokenBalance === 'number') {
                    balance = data.aiTokenBalance;
                } else if (typeof data.aiBalance === 'number') {
                    balance = data.aiBalance;
                }

                return {
                    valid: data.valid,
                    plan: data.plan,
                    licenseKey: data.licenseKey,
                    activationDate: data.activationDate,
                    expiryDate: data.expiryDate,
                    aiTokenBalance: balance,
                    message: data.message,
                    downloadUrls: data.downloadUrls
                };
            } else {
                let message = `Verification failed (${response.status})`;
                try {
                    const errorData = response.json;
                    if (errorData && errorData.message) {
                        message = errorData.message;
                    }
                } catch (e) {
                    message = `Verification failed (${response.status}): ${response.text}`;
                }

                return {
                    valid: false,
                    plan: 'free',
                    message: message
                };
            }
        } catch (error) {
            console.error('License verification error:', error);
            return { valid: false, plan: 'free', message: 'Network error connecting to verification server.' };
        }
    }

    static async getAiBalance(licenseKey: string): Promise<number> {
        // Re-use verify for now to get balance, or implement dedicated endpoint if available
        const info = await this.verifyLicense(licenseKey);
        return info.aiTokenBalance || 0;
    }

    static async downloadAndInstallPro(plugin: Plugin, downloadUrls: { mainJs: string, stylesCss: string }): Promise<void> {
        try {
            new Notice(t('settings.activation.injecting', (plugin as any).settings));

            // 1. Download files concurrently
            const [mainJs, stylesCss] = await Promise.all([
                requestUrl({ url: downloadUrls.mainJs }).then(res => res.text),
                requestUrl({ url: downloadUrls.stylesCss }).then(res => res.text)
            ]);

            //     mainJs: mainJs.length,
            //     stylesCss: stylesCss.length
            // });

            // 2. Write files (Overwrite)
            const adapter = plugin.app.vault.adapter;
            if (!(adapter instanceof FileSystemAdapter)) {
                throw new Error("FileSystemAdapter not available.");
            }

            const pluginDir = plugin.manifest.dir;
            if (!pluginDir) {
                throw new Error("Plugin directory not found.");
            }
            
            // Use full path for FileSystemAdapter
            const mainJsPath = `${pluginDir}/main.js`;
            const stylesCssPath = `${pluginDir}/styles.css`;
            
            // We DO NOT overwrite manifest.json to avoid "Manifest ID mismatch" if Lite and Pro use different IDs in future,
            // and to keep the original plugin identity intact.

            await adapter.write(mainJsPath, mainJs);
            await adapter.write(stylesCssPath, stylesCss);
            
            new Notice(t('settings.activation.success', (plugin as any).settings));

        } catch (error) {
            console.error("[PicFlow] Activation failed:", error);
            new Notice(t('settings.activation.failed', (plugin as any).settings) + error.message);
            throw error;
        }
    }
}
