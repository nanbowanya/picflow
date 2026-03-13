import { Platform } from '../ui/login-modal';

export class PlatformRegistry {
    static platforms: Record<string, Platform> = {};

    static get(id: string): Platform | undefined {
        return this.platforms[id];
    }

    static register(id: string, platform: Platform) {
        this.platforms[id] = platform;
    }
}
