
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

    async publish(_file: TFile, _accountId: string, _themeName: string): Promise<void> {
                   // eslint-disable-next-line obsidianmd/ui/sentence-case
        new Notice('Publishing is available in Pro version.');
        return Promise.resolve();
    }
}

// [NEW] Stub classes for custom platforms to satisfy dynamic imports if needed in future
export class StubCustomPublisher extends StubPublisher {
    constructor(plugin: PicFlowPlugin, type: string) {
        super(plugin, `Custom Platform (${type})`);
    }
}
