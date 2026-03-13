
import { Notice, TFile } from "obsidian";
import PicFlowPlugin from "../../main";
import { IPlatformPublisher } from "../interfaces";

export class StubPublisher implements IPlatformPublisher {
    plugin: PicFlowPlugin;
    platformName: string;

    constructor(plugin: PicFlowPlugin, platformName: string) {
        this.plugin = plugin;
        this.platformName = platformName;
    }

    async publish(file: TFile, accountId: string, themeName: string = 'Default'): Promise<void> {
        new Notice(`${this.platformName} publishing is a Pro feature. Please upgrade to unlock.`);
        
        // Open Settings Tab to Status Tab
        // @ts-ignore
        if (this.plugin.app.setting) {
            // @ts-ignore
            this.plugin.app.setting.open();
            // @ts-ignore
            const settingTab = this.plugin.app.setting.pluginTabs.find(t => t.id === this.plugin.manifest.id);
            if (settingTab) {
                settingTab.currentTab = 'Status';
                settingTab.display();
            }
            // @ts-ignore
            this.plugin.app.setting.openTabById(this.plugin.manifest.id);
        }
    }
}

// [NEW] Stub classes for custom platforms to satisfy dynamic imports if needed in future
export class StubCustomPublisher extends StubPublisher {
    constructor(plugin: PicFlowPlugin, type: string) {
        super(plugin, `Custom Platform (${type})`);
    }
}
