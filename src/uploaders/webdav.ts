import { createClient, WebDAVClient } from "webdav";
import { WebDAVConfig, Uploader, UploadedImage } from "../settings";
import * as https from "https";

export class WebDAVUploader implements Uploader {
    private config: WebDAVConfig;

    constructor(config: WebDAVConfig) {
        this.config = config;
    }

    private getClient(): WebDAVClient {
        const { host, username, password, bypassCertificateValidation } = this.config;

        if (!host || !username || !password) {
            throw new Error("WebDAV Configuration is incomplete.");
        }

        // Configure Agent for self-signed certificates if needed
        let httpsAgent;
        if (bypassCertificateValidation) {
            try {
                httpsAgent = new https.Agent({ rejectUnauthorized: false });
            } catch (_e) {
                // ignore
            }
        }

        return createClient(host, {
            username: username,
            password: password,
            httpsAgent: httpsAgent
        });
    }

    async upload(file: File, fileName: string): Promise<string> {
        const { uploadPath, uploadStrategy } = this.config;
        const client = this.getClient();

        // Ensure upload path exists (WebDAV doesn't always auto-create folders, but creating them recursively is complex. 
        // For now assume path exists or let putFileContents handle if server supports auto-create)
        const remotePath = `${uploadPath.replace(/\/$/, "")}/${fileName}`;
        
        // Check existence for skip/rename
        if (uploadStrategy !== 'overwrite') {
            try {
                // stat returns info if exists, throws if not (usually)
                await client.stat(remotePath);
                
                // If here, file exists
                if (uploadStrategy === 'skip') {
                    return this.getPublicUrl(remotePath);
                }
                if (uploadStrategy === 'rename') {
                    // Simple rename: append timestamp
                    const ext = fileName.split('.').pop();
                    const name = fileName.substring(0, fileName.lastIndexOf('.'));
                    const newName = `${name}-${Date.now()}.${ext}`;
                    return this.upload(file, newName);
                }
            } catch (_e) {
                // If error is 404, file doesn't exist, proceed.
                // webdav client throws Error object.
            }
        }


        try {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            await client.putFileContents(remotePath, buffer, { overwrite: true }); // We handled strategy above
            
            return this.getPublicUrl(remotePath);

        } catch (error: unknown) {
            const msg = (error as Error).message || "Unknown WebDAV Upload Error";
            throw new Error(`WebDAV Upload failed: ${msg}`);
        }
    }

    async list(offset: number = 0, limit: number = 20): Promise<UploadedImage[]> {
        const { uploadPath } = this.config;
        const client = this.getClient();
        
        try {
            // Get directory contents
            const contents = await client.getDirectoryContents(uploadPath) as { type: string, basename: string, filename: string, size: number, lastmod: string }[];
            
            if (!Array.isArray(contents)) {
                return [];
            }

            const images = contents
                .filter(item => item.type === 'file' && this.isImage(item.basename))
                .map(item => {
                    // item.filename is full path (e.g. /dav/images/1.jpg)
                    return {
                        key: item.filename,
                        name: item.basename,
                        url: this.getPublicUrl(item.filename),
                        size: item.size,
                        lastModified: new Date(item.lastmod)
                    };
                })
                // Sort by last modified desc
                .sort((a, b) => (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0));

            return images.slice(offset, offset + limit);

        } catch (error: unknown) {
            const msg = (error as Error).message || "Unknown WebDAV List Error";
            throw new Error(`Failed to list WebDAV files: ${msg}`);
        }
    }

    async delete(key: string): Promise<boolean> {
        const client = this.getClient();
        
        try {
            await client.deleteFile(key);
            return true;
        } catch (error: unknown) {
            const msg = (error as Error).message || "Unknown WebDAV Delete Error";
            throw new Error(`Failed to delete file: ${msg}`);
        }
    }

    private getPublicUrl(remotePath: string): string {
        const { customDomain, host } = this.config;
        if (customDomain) {
            const domain = customDomain.replace(/\/$/, "");
            return `${domain}${remotePath}`;
        } else {
            const urlHost = host.replace(/\/$/, "");
            return `${urlHost}${remotePath}`;
        }
    }

    private isImage(filename: string): boolean {
        const ext = filename.split('.').pop()?.toLowerCase();
        return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext || '');
    }
}
