import { App, Notice } from 'obsidian';
import { IMigrationManager } from '../interfaces';

export class StubMigrationManager implements IMigrationManager {
    plugin: any;
    app: App;

    files: any[] = [];
    isMigrating: boolean = false;
    includeRemote: boolean = false;
    onUpdate: (() => void) | null = null;

    constructor(plugin: any) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    async scanVault(_includeRemote: boolean = false): Promise<any[]> {
        new Notice('🔒 This feature is available in Pro version.');
        return Promise.resolve([]);
    }

    async startMigration(_targetProfileId: string): Promise<void> {
        new Notice('🔒 This feature is available in Pro version.');
        return Promise.resolve();
    }
}
