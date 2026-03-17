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
        

        if (Platform.isDesktop) {
            try {
                const signals = [
                    process.platform,
                    process.arch,
                    process.env.USER || process.env.USERNAME || process.env.LOGNAME,
                    process.env.HOSTNAME || process.env.COMPUTERNAME,
                    window.navigator.hardwareConcurrency,
                ].filter(Boolean).join('|');

                const msgBuffer = new TextEncoder().encode(signals);
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                

                const hwId = `hw_${hashHex.substring(0, 32)}`;
                

                return hwId;
            } catch (_e) {
                // ignore
            }
        }

        let machineId = window.localStorage.getItem(this.MACHINE_ID_KEY);
        if (!machineId) {

            const array = new Uint32Array(4);
            window.crypto.getRandomValues(array);
            machineId = 'pf_' + Array.from(array, dec => ('0' + dec.toString(16)).slice(-2)).join('');
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
                } catch (_e) {
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
        const info = await this.verifyLicense(licenseKey);
        return info.aiTokenBalance || 0;
    }

    static async downloadAndInstallPro(plugin: Plugin, downloadUrls: { mainJs: string, stylesCss: string }): Promise<void> {
        try {
            new Notice(t('settings.activation.injecting', (plugin as any).settings));

            const [mainJs, stylesCss] = await Promise.all([
                requestUrl({ url: downloadUrls.mainJs }).then(res => res.text),
                requestUrl({ url: downloadUrls.stylesCss }).then(res => res.text)
            ]);

            const adapter = plugin.app.vault.adapter;
            if (!(adapter instanceof FileSystemAdapter)) {
                throw new Error("FileSystemAdapter not available.");
            }

            const pluginDir = plugin.manifest.dir;
            if (!pluginDir) {
                throw new Error("Plugin directory not found.");
            }
            

            const mainJsPath = `${pluginDir}/main.js`;
            const stylesCssPath = `${pluginDir}/styles.css`;
            

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
