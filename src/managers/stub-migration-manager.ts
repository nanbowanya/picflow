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
        new Notice('This feature is available in pro version.');
        return Promise.resolve([]);
    }

    startMigration(_targetProfileId: string): Promise<void> {
        new Notice('This feature is available in pro version.');
        return Promise.resolve();
    }
}
