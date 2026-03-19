import { App, Modal, Notice } from 'obsidian';
import { Account } from '../managers/account-manager';
import PicFlowPlugin from '../../main';

export interface LoginResult {
    success: boolean;
    cookies?: unknown;
    userInfo?: {
        name: string;
        avatar?: string;
        id?: string;
    };
}

export abstract class Platform {
    id: string;
    name: string;
    loginUrl: string;

    constructor(id: string, name: string, loginUrl: string) {
        this.id = id;
        this.name = name;
        this.loginUrl = loginUrl;
    }

    /**
     * Determines if the current page (url, title, content) indicates a successful login.
     * @param url Current URL of the webview
     * @param title Title of the page
     * @param win The BrowserWindow or WebContents (typed as any to avoid Electron import issues in some contexts)
     */
    abstract checkLoginStatus(url: string, title: string, win?: unknown): Promise<LoginResult | null>;

    /**
     * Checks if the session (cookies) is still valid.
     * @param _account The account to check
     */
    checkSession(_account: Account): Promise<boolean> {
        return Promise.resolve(true); // Default to true if not implemented
    }

    /**
     * Helper to convert cookie array/object to header string
     */
    protected getCookieString(account: Account): string {
        if (!account.cookies) return '';
        if (typeof account.cookies === 'string') return account.cookies;
        if (Array.isArray(account.cookies)) {
            return account.cookies.map((c: unknown) => `${c.name}=${c.value}`).join('; ');
        }
        return '';
    }

    /**
     * Optional: Extract user info from the page after login.
     */
    getUserInfo(_win: unknown): Promise<unknown> {
        return Promise.resolve({ name: 'Unknown User' });
    }
}

export class LoginModal extends Modal {
    plugin: PicFlowPlugin;
    platform: Platform;
    webview: unknown; // Electron Webview
    onLogin: (result: LoginResult) => void;
    checkInterval: number | null = null;
    confirmBtn: HTMLButtonElement;
    currentLoginResult: LoginResult | null = null;

    constructor(app: App, plugin: PicFlowPlugin, platform: Platform, onLogin: (result: LoginResult) => void) {
        super(app);
        this.plugin = plugin;
        this.platform = platform;
        this.onLogin = onLogin;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        
        // Adjust modal size for better visibility
        modalEl.addClass('picflow-modal-large');
        // Styles moved to CSS class .picflow-modal-large

        contentEl.empty();
        contentEl.addClass('picflow-modal-content');

        // Header
        const header = contentEl.createDiv({ cls: 'picflow-login-header' });
        
        const titleGroup = header.createDiv({ cls: 'picflow-login-title-group' });
        titleGroup.createEl('h3', { text: `Login to ${this.platform.name}` });

        const actionGroup = header.createDiv({ cls: 'picflow-login-action-group' });

        // Logout Button Removed as per request

        // Confirm Button (Manual trigger)
        this.confirmBtn = actionGroup.createEl('button', { text: 'I have logged in' });
        this.confirmBtn.classList.add('mod-cta');
        // Always force check when clicked, do not rely on cached result
        this.confirmBtn.onclick = async () => {
            this.confirmBtn.disabled = true;
            this.confirmBtn.setText('Checking...');
            
            try {
                // Force a fresh check
                await this.checkLogin(true);
                
                if (this.currentLoginResult && this.currentLoginResult.success) {
                    this.onLogin(this.currentLoginResult);
                    this.close();
                } else {
                    new Notice('Login verification failed. Please try again.');
                    this.confirmBtn.disabled = false;
                    this.confirmBtn.setText('I have logged in');
                }
            } catch (_e) {
                // console.error('Login confirm error:', e);
                new Notice('Error verifying login.');
                this.confirmBtn.disabled = false;
                this.confirmBtn.setText('I have logged in');
            }
        };

        // Warning/Instructions
        const info = contentEl.createDiv({ cls: 'picflow-login-info' });
                         // eslint-disable-next-line obsidianmd/ui/sentence-case
        info.innerText = 'Please login below. Once logged in, click "Confirm" to add the account.';

        // Webview Container
        const webviewContainer = contentEl.createDiv({ cls: 'picflow-webview-container' });

        // Create Webview
        // Note: In Obsidian (Electron), we use <webview> tag.
        this.webview = document.createElement('webview');
        this.webview.setAttribute('src', this.platform.loginUrl);
        this.webview.classList.add('picflow-webview');
        this.webview.setAttribute('partition', `persist:picflow-${this.platform.id}`); // Isolate cookies per platform
        
        webviewContainer.appendChild(this.webview);

        this.webview.addEventListener('dom-ready', () => {
            // Check login status periodically or on navigation
            void this.checkLogin();
        });

        this.webview.addEventListener('did-navigate', () => {
            void this.checkLogin();
        });
        
        this.webview.addEventListener('did-navigate-in-page', () => {
            void this.checkLogin();
        });
    }

    async checkLogin(manual = false) {
        if (!this.webview) return;
        
        try {
            const url = this.webview.getURL();
            const title = this.webview.getTitle();
            

            const result = await this.platform.checkLoginStatus(url, title, this.webview);
            
            if (result && result.success) {
                // Capture cookies
                let cookies = [];
                // let methodUsed = '';
                
                // Method 1: standard webview API
                try {
                    if (this.webview.getWebContents) {
                         const session = this.webview.getWebContents().session;
                         
                         // Fix for CSDN: Explicitly get cookies for root domain if platform is CSDN
                         if (this.platform.id === 'csdn') {
                             const rootCookies = await session.cookies.get({ domain: '.csdn.net' });
                             const wwwCookies = await session.cookies.get({ domain: 'www.csdn.net' });
                             const passportCookies = await session.cookies.get({ domain: 'passport.csdn.net' });
                             // Merge unique cookies
                             const cookieMap = new Map();
                             [...rootCookies, ...wwwCookies, ...passportCookies].forEach(c => cookieMap.set(c.name, c));
                             cookies = Array.from(cookieMap.values());
                         } else if (this.platform.id === 'weibo') {
                             // Fix for Weibo: Get cookies for .weibo.com and .sina.com.cn and weibo.com
                             const weiboCookies = await session.cookies.get({ domain: '.weibo.com' });
                             const weiboRootCookies = await session.cookies.get({ domain: 'weibo.com' });
                             const sinaCookies = await session.cookies.get({ domain: '.sina.com.cn' });
                             const cardCookies = await session.cookies.get({ domain: 'card.weibo.com' });
                             
                             const cookieMap = new Map();
                             [...weiboCookies, ...weiboRootCookies, ...sinaCookies, ...cardCookies].forEach(c => cookieMap.set(c.name, c));
                             cookies = Array.from(cookieMap.values());
                         } else {
                             cookies = await session.cookies.get({});
                         }
                         
                         // methodUsed = 'Standard API';
                    } else {
                        throw new Error('getWebContents not available');
                    }
                } catch (_err) {
                        // // console.warn('[PicFlow] Method 1 failed (Standard API):', err.message);
                        
                        // Method 2: remote module
                    try {
                         // eslint-disable-next-line @typescript-eslint/no-require-imports
                         const remote = require('@electron/remote');
                         const webContents = remote.webContents.fromId(this.webview.getWebContentsId());
                         const session = webContents.session;

                         if (this.platform.id === 'csdn') {
                             const rootCookies = await session.cookies.get({ domain: '.csdn.net' });
                             const wwwCookies = await session.cookies.get({ domain: 'www.csdn.net' });
                             const passportCookies = await session.cookies.get({ domain: 'passport.csdn.net' });
                             const cookieMap = new Map();
                             [...rootCookies, ...wwwCookies, ...passportCookies].forEach((c: unknown) => cookieMap.set(c.name, c));
                             cookies = Array.from(cookieMap.values());
                         } else if (this.platform.id === 'weibo') {
                             // Strategy: Capture EVERYTHING related to weibo/sina to be safe
                             // Sometimes cookies are set on .weibo.cn or other variants
                             
                             const domains = [
                                 '.weibo.com', 'weibo.com', 
                                 '.sina.com.cn', 'sina.com.cn', 
                                 '.weibo.cn', 'weibo.cn',
                                 'card.weibo.com', 'passport.weibo.com', 'login.sina.com.cn'
                             ];
                             
                             const allCookies = [];
                             for (const d of domains) {
                                 const c = await session.cookies.get({ domain: d });
                                 allCookies.push(...c);
                             }
                             
                             // Also try getting all cookies and filtering manually if domain search is strict
                             // const everything = await session.cookies.get({});
                             // const filtered = everything.filter(c => c.domain.includes('weibo') || c.domain.includes('sina'));
                             
                             const cookieMap = new Map();
                             allCookies.forEach(c => cookieMap.set(c.name, c)); // Dedup by name
                             
                             cookies = Array.from(cookieMap.values());
                             
                         } else {
                             cookies = await session.cookies.get({});
                         }
                         // methodUsed = 'Remote API';
                    } catch {
                        // // console.warn('[PicFlow] Method 2 failed (Remote API):', err2.message);
                        
                        // Method 3: execute Javascript (Fallback)
                        try {
                            const cookieString = await this.webview.executeJavaScript('document.cookie');
                            if (cookieString) {
                                cookies = cookieString.split(';').map((c: string) => {
                                    const [name, value] = c.split('=').map((s: string) => s.trim());
                                    return { name, value };
                                });
                                // methodUsed = 'JS Injection'; // Unused
                            }
                        } catch {
                            // console.error('[PicFlow] All cookie capture methods failed', err3);
                        }
                    }
                }

                result.cookies = cookies;
                
                // Store result but DO NOT CLOSE automatically
                this.currentLoginResult = result;
                
                // Update UI
                const userName = result.userInfo?.name || 'Unknown User';
                this.confirmBtn.setText(`Add Account: ${userName}`);
                this.confirmBtn.classList.remove('mod-warning');
                this.confirmBtn.classList.add('mod-success');
                
                if (manual) {
                    new Notice(`Login detected for ${userName}. Click button again to confirm.`);
                }
            } else {
                if (manual) {
                    new Notice('Login not detected yet. Please login first.');
                }
            }
        } catch (_e) {
            // console.error("[PicFlow] Error checking login status:", e);
        }
    }

    async logout() {
        if (!this.webview) return;
        try {
             // Clear cookies via JS
             await this.webview.executeJavaScript(`
                (function(){
                    const cookies = document.cookie.split(";");
                    for (let i = 0; i < cookies.length; i++) {
                        const cookie = cookies[i];
                        const eqPos = cookie.indexOf("=");
                        const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
                        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
                    }
                    localStorage.clear();
                    sessionStorage.clear();
                })()
             `);
             
             // Clear session storage
             try {
                 const session = this.webview.getWebContents().session;
                 await session.clearStorageData();
             } catch(_e) { 
                 // console.warn('Failed to clear session storage', e); 
             }

             this.webview.reload();
             this.currentLoginResult = null;
             this.confirmBtn.setText('I have logged in');
             this.confirmBtn.classList.remove('mod-success');
             new Notice('Logged out. Please login again.');
        } catch(_e) {
            // console.error('Logout failed', e);
            new Notice('Logout failed. Please try again.');
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (this.checkInterval) clearInterval(this.checkInterval);

        try {
            // Try to clear data if possible
            if (this.webview) {
                // ...
            }
        } catch (_e) {
            // Ignore
        }
    }
}
