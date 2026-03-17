import { Notice } from 'obsidian';
import PicFlowPlugin from '../../main';
import { PlatformRegistry } from '../platforms';
import { LoginModal } from '../ui/login-modal';
import * as crypto from 'crypto';
import { t } from '../i18n';

export interface Account {
  id: string;
  platform: string; // 'wechat', 'zhihu', 'juejin', etc.
  name: string;
  avatar?: string;
  cookies: any; // Can be string or object depending on platform
  status: 'active' | 'expired';
  lastChecked: number;
  data?: {
      appId?: string;
      appSecret?: string;
      [key: string]: any;
  }; 
}

export class AccountManager {
  plugin: PicFlowPlugin;
  accounts: Account[] = [];

  constructor(plugin: PicFlowPlugin) {
    this.plugin = plugin;
  }

  async load() {
    try {
      const data = await this.plugin.loadData();
      if (data && data.accounts) {
        this.accounts = data.accounts;
      } else {
        this.accounts = [];
      }
    } catch (_e) {
      new Notice("Failed to load accounts.");
    }
  }

  async save() {
    const data = await this.plugin.loadData() || {};
    data.accounts = this.accounts;
    await this.plugin.saveData(data);
  }

  addAccount(platformId: string, onSuccess?: () => void) {
      const platform = PlatformRegistry.get(platformId);
      if (!platform) {
          // If platform is not found, it likely means we are in Lite version and the core platform is not loaded.
          // Instead of showing a simple notice, redirect to Status tab and show Pro activation hint.
          
          new Notice(t('settings.pro.desc', this.plugin.settings)); // "This feature requires a Pro license key to use."
          
          // Redirect to Status Tab
          // @ts-ignore
          const settingTab = this.plugin.app.setting.settingTabs.find(tab => tab.id === this.plugin.manifest.id);
          if (settingTab && typeof settingTab.switchToTab === 'function') {
              // @ts-ignore
              this.plugin.app.setting.openTabById(this.plugin.manifest.id);
              settingTab.switchToTab('Status');
          }
          return;
      }

      new LoginModal(this.plugin.app, this.plugin, platform, async (result) => {
          if (result.success && result.cookies) {
              const newAccount: Account = {
                  id: crypto.randomUUID(),
                  platform: platformId,
                  name: result.userInfo?.name || 'New User',
                  avatar: result.userInfo?.avatar,
                  cookies: result.cookies,
                  status: 'active',
                  lastChecked: Date.now()
              };
              
              // Check for duplicate account (same platform and name)
              // If we have a more unique ID from platform, use that instead.
              const existingIndex = this.accounts.findIndex(acc => 
                  acc.platform === platformId && acc.name === newAccount.name
              );

              if (existingIndex >= 0) {
                  // Update existing
                  const existing = this.accounts[existingIndex];
                  existing.cookies = newAccount.cookies;
                  existing.avatar = newAccount.avatar || existing.avatar;
                  existing.lastChecked = Date.now();
                  existing.status = 'active';
                  // Keep existing ID and Data
                  this.accounts[existingIndex] = existing;
                  new Notice(`Account ${existing.name} updated!`);
              } else {
                  // Add new
                  this.accounts.push(newAccount);
                  new Notice(`Account ${newAccount.name} added!`);
              }

              await this.save();
              // Trigger UI refresh if needed
              this.plugin.refreshAllViews();
              
              if (onSuccess) onSuccess();
          } else {
              new Notice('Login failed or cancelled.');
          }
      }).open();
  }

  async removeAccount(id: string) {
    this.accounts = this.accounts.filter(acc => acc.id !== id);
    await this.save();
    new Notice('Account removed.');
  }

  // Simple obfuscation/encryption helper
  private encrypt(text: string): string {
    if (!text) return '';
    // A simple base64 obfuscation for now. 
    // For real security, we should use a user-provided password or key, but that complicates UX.
    // This at least prevents plain text reading in data.json.
    return Buffer.from(text).toString('base64');
  }

  private decrypt(text: string): string {
    if (!text) return '';
    try {
        return Buffer.from(text, 'base64').toString('utf-8');
    } catch (_e) {
        return text; // Fallback if not encoded
    }
  }

  async updateAccount(id: string, updates: Partial<Account>) {
      const index = this.accounts.findIndex(acc => acc.id === id);
      if (index >= 0) {
          // If AppSecret is being updated, encrypt it
          if (updates.data && updates.data.appSecret) {
             // Check if it's already encrypted? 
             // We assume the input 'updates' comes from UI (plain text).
             // But wait, if we merge 'updates' directly, we might double encrypt or overwrite.
             
             // Let's handle encryption specifically for appSecret
             const plainSecret = updates.data.appSecret;
             updates.data.appSecret = this.encrypt(plainSecret);
          }

          // Merge updates deeply if needed, but for now shallow merge of top properties is fine
          // except data which might need merging.
          const existing = this.accounts[index];
          
          // Merge data object
          const newData = { ...existing.data, ...updates.data };
          
          this.accounts[index] = { ...existing, ...updates, data: newData };
          await this.save();
      }
  }

  getAccounts(platform?: string): Account[] {
    // [NEW] Custom Platform Logic
    if (platform === 'custom') {
        // Map custom settings to Account interface
        const customPlatforms = this.plugin.settings.customPlatforms || [];
        return customPlatforms.map(cp => ({
            id: cp.id, // This ID is used to find the Publisher later
            platform: 'custom',
            name: cp.name,
            avatar: cp.type === 'wordpress' ? '📝' : (cp.type === 'dify' ? '🤖' : '🔗'), // Use icon as avatar
            cookies: {}, // Not used for custom
            status: 'active',
            lastChecked: Date.now()
        }));
    }

    // Decrypt secrets when retrieving accounts for UI or internal use
    // Note: This means 'this.accounts' in memory holds encrypted data, 
    // and we decrypt on demand.
    // OR we keep decrypted in memory and encrypt only on save.
    // The latter is easier for runtime usage but requires careful save logic.
    
    // Let's go with: Store Encrypted in Memory & Disk. Decrypt only when needed (e.g. for display in Settings or sending to API).
    // BUT 'getAccounts' is used by Settings UI to display values.
    // So we should return a COPY with decrypted values.
    
    let result = this.accounts;
    if (platform) {
      result = result.filter(acc => acc.platform === platform);
    }
    
    // Return copies with decrypted secrets
    return result.map(acc => {
        const copy = { ...acc };
        if (copy.data && copy.data.appSecret) {
            copy.data = { ...copy.data, appSecret: this.decrypt(copy.data.appSecret) };
        }
        return copy;
    });
  }

  getAccount(id: string): Account | undefined {
    // Check normal accounts
    const acc = this.accounts.find(a => a.id === id);
    if (acc) {
        const copy = { ...acc };
        if (copy.data && copy.data.appSecret) {
            copy.data = { ...copy.data, appSecret: this.decrypt(copy.data.appSecret) };
        }
        return copy;
    }

    // Check custom platforms (treat as account)
    const customPlatforms = this.plugin.settings.customPlatforms || [];
    const cp = customPlatforms.find(c => c.id === id);
    if (cp) {
        return {
            id: cp.id,
            platform: 'custom',
            name: cp.name,
            avatar: cp.type === 'wordpress' ? '📝' : (cp.type === 'dify' ? '🤖' : '🔗'),
            cookies: {},
            status: 'active',
            lastChecked: Date.now()
        };
    }

    return undefined;
  }
  
  // Mock function to check status - in real app this would call platform APIs
  async checkAccountStatus(id: string): Promise<'active' | 'expired'> {
     const account = this.accounts.find(acc => acc.id === id);
     if (!account) return 'expired';

     const platform = PlatformRegistry.get(account.platform);
     let isValid = false;
     
     if (platform) {
         try {
             isValid = await platform.checkSession(account);
         } catch (e) {
             console.error(`Error checking status for ${account.name}`, e);
             // Keep previous status if check fails due to network error? 
             // Or assume expired? Let's assume expired to prompt re-login if needed.
             isValid = false;
         }
     } else {
         // Fallback for platforms without checkSession implemented or legacy
         // Assuming active if we can't check
         isValid = true; 
     }
     
     const status = isValid ? 'active' : 'expired';
     
     // Only update if status changed or just to refresh lastChecked
     await this.updateAccount(id, { 
         status, 
         lastChecked: Date.now() 
     });
     
     return status;
  }

  async checkAllAccounts() {
      for (const acc of this.accounts) {
          await this.checkAccountStatus(acc.id);
      }
      new Notice('All accounts checked.');
  }
}
