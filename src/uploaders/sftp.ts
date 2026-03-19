import { SFTPConfig, Uploader, UploadedImage } from "../settings";
import type SftpClient from 'ssh2-sftp-client';
// import { Notice } from "obsidian";

export class SFTPUploader implements Uploader {
    private config: SFTPConfig;

    constructor(config: SFTPConfig) {
        this.config = config;
    }

    private async connect(client: SftpClient) {
        const { host, port, username, password, privateKey } = this.config;
        
        if (!host || !username || (!password && !privateKey)) {
            throw new Error("SFTP Configuration is incomplete.");
        }

        await client.connect({
            host: host,
            port: port || 22,
            username: username,
            password: password,
            privateKey: privateKey,
            tryKeyboard: true,
            readyTimeout: 20000
        });
    }

    async upload(file: File, fileName: string): Promise<string> {
        const { uploadPath, uploadStrategy } = this.config;
        
        // Lazy Load SFTP Client to avoid startup OOM
        const { default: Client } = await import('ssh2-sftp-client');
        const client = new Client();
        
        try {
            await this.connect(client);

            const remotePath = `${uploadPath.replace(/\/$/, "")}/${fileName}`;
            
            // Check existence
            let exists = false;
            try {
                const type = await client.exists(remotePath);
                if (type) exists = true;
            } catch {
                // Ignore error, assume not exists or permission issue
            }

            if (exists) {
                if (uploadStrategy === 'skip') {
                    return this.getPublicUrl(remotePath);
                }
                if (uploadStrategy === 'rename') {
                     const ext = fileName.split('.').pop();
                     const name = fileName.substring(0, fileName.lastIndexOf('.'));
                     const newName = `${name}-${Date.now()}.${ext}`;
                     // Recurse? We are already connected. 
                     // Ideally we shouldn't reconnect. But recursing calls upload which creates NEW client.
                     // To reuse client, we'd need to refactor. 
                     // For now, let's just close and recurse (simple but slightly slower).
                     await client.end();
                     return this.upload(file, newName);
                }
                // Overwrite: ssh2-sftp-client put overwrites by default? Yes.
            }


            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Ensure directory exists? client.put usually doesn't create dirs.
            // Let's assume user configured path exists or use mkdir(path, true)
            // But mkdir recursively is safer.
            const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
            if (dir) {
                 await client.mkdir(dir, true);
            }

            await client.put(buffer, remotePath);
            
            return this.getPublicUrl(remotePath);

        } catch (error: unknown) {
            console.error("SFTP Upload Error:", error);
            const msg = (error as Error).message || "Unknown SFTP Upload Error";
            throw new Error(`SFTP Upload failed: ${msg}`);
        } finally {
            // Only end if we didn't recurse (which closes it).
            // Actually, if we recurse, we returned early.
            // But wait, we called client.end() BEFORE recurse in my comment logic? 
            // Yes.
            // But we need to check if client is connected. 
            // ssh2-sftp-client doesn't have isConnected? 
            // Safe to call end() multiple times? Usually yes.
            try { await client.end(); } catch { /* ignore */ }
        }
    }

    async list(offset: number = 0, limit: number = 20): Promise<UploadedImage[]> {
        const { uploadPath } = this.config;
        const { default: Client } = await import('ssh2-sftp-client');
        const client = new Client();

        try {
            await this.connect(client);
            
            const list = await client.list(uploadPath);
            
            const images = list
                .filter((item) => item.type !== 'd' && this.isImage(item.name))
                .map((item) => {
                    const remotePath = `${uploadPath.replace(/\/$/, "")}/${item.name}`;
                    return {
                        key: remotePath,
                        name: item.name,
                        url: this.getPublicUrl(remotePath),
                        size: item.size,
                        lastModified: new Date(item.modifyTime) // modifyTime is timestamp in ms or Date? Check lib.
                        // ssh2-sftp-client docs: modifyTime is number (milliseconds)
                    };
                })
                .sort((a: UploadedImage, b: UploadedImage) => (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0));

            return images.slice(offset, offset + limit);

        } catch (error: unknown) {
            console.error("SFTP List Error:", error);
            const msg = (error as Error).message || "Unknown SFTP List Error";
            throw new Error(`Failed to list SFTP files: ${msg}`);
        } finally {
            await client.end();
        }
    }

    async delete(key: string): Promise<boolean> {
        const { default: Client } = await import('ssh2-sftp-client');
        const client = new Client();
        
        try {
            await this.connect(client);
            await client.delete(key);
            return true;
        } catch (error: unknown) {
             console.error("SFTP Delete Error:", error);
             const msg = (error as Error).message || "Unknown SFTP Delete Error";
             throw new Error(`Failed to delete SFTP file: ${msg}`);
        } finally {
            await client.end();
        }
    }

    async testConnection(): Promise<{ success: boolean; message: string }> {
        const { default: Client } = await import('ssh2-sftp-client');
        const client = new Client();
        try {
            await this.connect(client);
            await client.list('/');
            return { success: true, message: "Connection Successful!" };
        } catch (error: unknown) {
            console.error("SFTP Test Error:", error);
            const msg = (error as Error).message || "Unknown SFTP Test Error";
            return { success: false, message: `Connection Failed: ${msg}` };
        } finally {
            await client.end();
        }
    }

    private getPublicUrl(remotePath: string): string {
        const { customDomain, host } = this.config;
        if (customDomain) {
            const domain = customDomain.replace(/\/$/, "");
            return `${domain}${remotePath}`;
        } else {
            return `http://${host}${remotePath}`; 
        }
    }

    private isImage(filename: string): boolean {
        const ext = filename.split('.').pop()?.toLowerCase();
        return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext || '');
    }
}
