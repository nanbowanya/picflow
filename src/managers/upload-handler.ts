import { App, MarkdownView, Notice, TFile, requestUrl } from 'obsidian';
import * as crypto from 'crypto';
import PicFlowPlugin from '../../main';
import { ImageProcessor } from '../utils/image-processor';
import { t } from '../i18n';
import { S3Uploader } from '../uploaders/s3';
import { OSSUploader } from '../uploaders/oss';
import { GitHubUploader } from '../uploaders/github';
import { WebDAVUploader } from '../uploaders/webdav';
import { SFTPUploader } from '../uploaders/sftp';
// import { ImageGenerationOptions } from '../ai/models';

export class UploadHandler {
    plugin: PicFlowPlugin;
    app: App;

    constructor(plugin: PicFlowPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    // --- Core Upload Logic ---

    async uploadFileOnly(file: File, sourceFile: TFile | null = null): Promise<string> {
        // Process image (compress/watermark) before uploading
        const processedFile = await ImageProcessor.process(file, this.plugin.settings);

        let url = '';
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const contextFile = sourceFile || view?.file || null;

        // Select Uploader Profile
        const profileId = this.plugin.settings.selectedProfileId;
        const profile = this.plugin.settings.profiles.find(p => p.id === profileId);

        if (!profile) {
            throw new Error('No uploader profile selected.');
        }

        // Determine if we should use stable time (Skip strategy)
        let useStableTime = false;
        if (profile.type === 's3' && profile.s3?.uploadStrategy === 'skip') useStableTime = true;
        else if (profile.type === 'oss' && profile.oss?.uploadStrategy === 'skip') useStableTime = true;
        else if (profile.type === 'github' && profile.github?.uploadStrategy === 'skip') useStableTime = true;
        else if (profile.type === 'webdav' && profile.webdav?.uploadStrategy === 'skip') useStableTime = true;
        else if (profile.type === 'sftp' && profile.sftp?.uploadStrategy === 'skip') useStableTime = true;

        const fileName = await this.generateFileName(processedFile, contextFile, useStableTime);

        // Select Uploader implementation based on profile type
        if (profile.type === 's3' && profile.s3) {
            const proxySettings: any = { ...this.plugin.settings };
            Object.assign(proxySettings, {
                s3Endpoint: profile.s3.endpoint,
                s3Region: profile.s3.region,
                s3Bucket: profile.s3.bucket,
                s3AccessKeyId: profile.s3.accessKeyId,
                s3SecretAccessKey: profile.s3.secretAccessKey,
                s3PathPrefix: profile.s3.pathPrefix,
                s3CustomDomain: profile.s3.customDomain,
                s3ForcePathStyle: profile.s3.forcePathStyle,
                s3UseSSL: profile.s3.useSSL,
                s3BypassCertificateValidation: profile.s3.bypassCertificateValidation,
                uploadStrategy: profile.s3.uploadStrategy
            });

            const uploader = new S3Uploader(proxySettings);
            url = await uploader.upload(processedFile, fileName);

        } else if (profile.type === 'oss' && profile.oss) {
            const uploader = new OSSUploader(profile.oss);
            url = await uploader.upload(processedFile, fileName);

        } else if (profile.type === 'github' && profile.github) {
            const proxySettings: any = { ...this.plugin.settings };
            Object.assign(proxySettings, {
                githubOwner: profile.github.owner,
                githubRepo: profile.github.repo,
                githubBranch: profile.github.branch,
                githubToken: profile.github.token,
                githubCustomDomain: profile.github.customDomain,
                githubCdnProxy: profile.github.cdnProxy,
                githubCustomCdnUrl: profile.github.customCdnUrl,
                proxyUrl: profile.github.proxyUrl,
                uploadStrategy: profile.github.uploadStrategy
            });

            const uploader = new GitHubUploader(proxySettings);
            url = await uploader.upload(processedFile, fileName);

        } else if (profile.type === 'webdav' && profile.webdav) {
            // WebDAV is now free
            const uploader = new WebDAVUploader(profile.webdav);
            url = await uploader.upload(processedFile, fileName);

        } else if (profile.type === 'sftp' && profile.sftp) {
            const uploader = new SFTPUploader(profile.sftp);
            url = await uploader.upload(processedFile, fileName);
        } else {
            throw new Error(`Unknown or invalid uploader profile: ${profile.name}`);
        }

        return url;
    }

    async uploadImage(file: File, view: MarkdownView) {
        const editor = view.editor;
        new Notice(t('notice.uploading', this.plugin.settings).replace('{file}', file.name));

        // Insert placeholder
        const placeholder = `![Uploading ${file.name}...](${file.name})`;
        const cursor = editor.getCursor();
        editor.replaceRange(placeholder, cursor);

        const startPos = { ...cursor };
        const endPos = { line: cursor.line, ch: cursor.ch + placeholder.length };

        try {
            const url = await this.uploadFileOnly(file);

            // Replace placeholder with actual link
            const imgMarkdown = `![](${url})`;
            editor.replaceRange(imgMarkdown, startPos, endPos);
            new Notice(t('notice.uploaded', this.plugin.settings).replace('{file}', file.name));

        } catch (error) {
            console.error(error);
            let errorMessage = 'Unknown Error';
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (typeof error === 'object' && error !== null) {
                try {
                    errorMessage = JSON.stringify(error);
                } catch (_e) {
                    errorMessage = String(error);
                }
            }

            new Notice(t('notice.uploadFailed', this.plugin.settings).replace('{file}', file.name).replace('{error}', errorMessage));

            const safeErrorMessage = errorMessage.replace(/\[/g, '(').replace(/\]/g, ')');
            editor.replaceRange(`![Upload Failed: ${file.name} (Error: ${safeErrorMessage})](${file.name})`, startPos, endPos);
        }
    }

    async uploadOnlineImage(url: string, view: MarkdownView, returnUrlOnly: boolean = false): Promise<string | null> {
        const editor = view.editor;
        if (!returnUrlOnly) {
            new Notice(`Downloading: ${url}`);
            const placeholder = `![Uploading remote image...](${url})`;
            editor.replaceSelection(placeholder);
        } else {
            new Notice(`Processing remote image: ${url}`);
        }

        try {
            // 1. Download
            const response = await requestUrl({ url });
            if (response.status >= 400) throw new Error(`Failed to fetch image: ${response.status}`);
            
            const buffer = response.arrayBuffer;
            const contentType = response.headers['content-type'] || 'application/octet-stream';

            let filename = url.split('/').pop()?.split('?')[0];
            if (!filename || filename.length < 3) {
                let hash = 0;
                for (let i = 0; i < url.length; i++) {
                    hash = ((hash << 5) - hash) + url.charCodeAt(i);
                    hash |= 0;
                }
                filename = `image-${Math.abs(hash)}.png`;
            } else {
                try { filename = decodeURIComponent(filename); } catch (_e) { /* ignore */ }
            }

            if (!filename.includes('.')) {
                const type = contentType.split('/')[1] || 'png';
                filename += `.${type}`;
            }

            let urlHash = 0;
            for (let i = 0; i < url.length; i++) {
                urlHash = ((urlHash << 5) - urlHash) + url.charCodeAt(i);
                urlHash |= 0;
            }
            const stableLastModified = Math.abs(urlHash) * 1000;

            const file = new File([buffer], filename, { type: contentType, lastModified: stableLastModified });

            // 3. Upload
            if (returnUrlOnly) {
                return await this.uploadFileOnly(file);
            } else {
                return await this.uploadFileOnly(file);
            }

        } catch (error) {
            console.error("Online Image Upload Failed:", error);
            new Notice(`Failed to upload remote image: ${error.message}`);
            if (!returnUrlOnly) {
                const placeholder = `![Uploading remote image...](${url})`;
                const doc = editor.getValue();
                if (doc.includes(placeholder)) {
                    const newValue = doc.replace(placeholder, `![](${url})`);
                    editor.setValue(newValue);
                }
            }
            return null;
        }
    }

    async generateFileName(file: File, sourceFile: TFile | null, useStableTime: boolean = false): Promise<string> {
        const now = useStableTime && file.lastModified ? new Date(file.lastModified) : new Date();
        const Y = now.getFullYear().toString();
        const y = Y.slice(-2);
        const M = (now.getMonth() + 1).toString().padStart(2, '0');
        const D = now.getDate().toString().padStart(2, '0');
        const h = now.getHours().toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        const s = now.getSeconds().toString().padStart(2, '0');
        const ms = now.getMilliseconds().toString().padStart(3, '0');
        const timestamp = now.getTime().toString();

        const originalName = file.name;
        // Fix: extension extraction might be wrong if multiple dots
        const extension = originalName.slice((originalName.lastIndexOf(".") - 1 >>> 0) + 2);
        const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;

        const format = this.plugin.settings.imageNameFormat || '{Y}{M}{D}{h}{m}{s}-{filename}';

        // 1. Time Replacement
        let newName = format
            .replace(/{Y}/g, Y)
            .replace(/{y}/g, y)
            .replace(/{M}/g, M)
            .replace(/{D}/g, D)
            .replace(/{d}/g, D)
            .replace(/{h}/g, h)
            .replace(/{H}/g, h)
            .replace(/{m}/g, m)
            .replace(/{i}/g, m)
            .replace(/{s}/g, s)
            .replace(/{ms}/g, ms)
            .replace(/{timestamp}/g, timestamp);

        // 2. File Info Replacement
            newName = newName.replace(/{filename}/g, nameWithoutExt);
            newName = newName.replace(/{timestamp}/g, timestamp);
            
            if (sourceFile && sourceFile.parent) {
                const parentPath = sourceFile.parent.path;
            const folders = parentPath === '/' ? [] : parentPath.split('/');

            newName = newName.replace(/{localFolder:(\d+)}/g, (match, n) => {
                const level = parseInt(n, 10);
                if (level <= 0) return folders.join('-');
                if (level > folders.length) return '';
                return folders[folders.length - level] || '';
            });
        } else {
            newName = newName.replace(/{localFolder:(\d+)}/g, '');
        }

        // 3. Random String Replacement {str-n}
        newName = newName.replace(/{str-(\d+)}/g, (match, n) => {
            const length = Math.min(Math.max(parseInt(n, 10), 1), 32);
            return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
        });

        // 4. Hash Replacement (Async)
        if (newName.includes('{md5}') || newName.includes('{md5-16}') || newName.includes('{sha256}') || newName.match(/{sha256-(\d+)}/)) {
            const buffer = Buffer.from(await file.arrayBuffer());

            if (newName.includes('{md5}') || newName.includes('{md5-16}')) {
                const md5 = crypto.createHash('md5').update(buffer).digest('hex');
                newName = newName.replace(/{md5}/g, md5);
                newName = newName.replace(/{md5-16}/g, md5.substring(8, 24));
            }

            if (newName.includes('{sha256}') || newName.match(/{sha256-(\d+)}/)) {
                const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
                newName = newName.replace(/{sha256}/g, sha256);
                newName = newName.replace(/{sha256-(\d+)}/g, (match, n) => {
                    const length = parseInt(n, 10);
                    return sha256.substring(0, length);
                });
            }
        }

        // 5. UUID
        if (newName.includes('{uuid}')) {
            newName = newName.replace(/{uuid}/g, crypto.randomUUID());
        }

        return `${newName}.${extension}`;
    }
}
