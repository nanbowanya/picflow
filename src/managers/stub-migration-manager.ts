import { App, Notice } from 'obsidian';
import { IMigrationManager } from '../interfaces';
import PicFlowPlugin from '../../main';

export class StubMigrationManager implements IMigrationManager {
    plugin: PicFlowPlugin;
    app: App;

    files: unknown[] = [];
    isMigrating: boolean = false;
    includeRemote: boolean = false;
    onUpdate: (() => void) | null = null;

    constructor(plugin: PicFlowPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    scanVault(_includeRemote: boolean = false): Promise<unknown[]> {
                   // eslint-disable-next-line obsidianmd/ui/sentence-case
        new Notice('🔒 This feature is available in Pro version.');
        return Promise.resolve([]);
    }

    startMigration(_targetProfileId: string): Promise<void> {
                   // eslint-disable-next-line obsidianmd/ui/sentence-case
        new Notice('🔒 This feature is available in Pro version.');
        return Promise.resolve();
    }
}
