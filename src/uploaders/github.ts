import { PicFlowSettings, Uploader, UploadedImage } from "../settings";
import { requestUrl, arrayBufferToBase64 } from "obsidian";

export class GitHubUploader implements Uploader {
	private settings: PicFlowSettings;

	constructor(settings: PicFlowSettings) {
		this.settings = settings;
	}

	async upload(file: File, fileName: string): Promise<string> {
		const { githubOwner, githubRepo, githubBranch, githubToken, uploadStrategy, proxyUrl } = this.settings;

		if (!githubOwner || !githubRepo || !githubToken) {
			throw new Error("GitHub Configuration is incomplete. Please check your settings (Owner, Repo, Token).");
		}

		const branch = githubBranch || "main";
		// Normalize path: remove leading slashes
		const path = fileName.replace(/^\/+/, "");
		
		const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${path}`;
		const headers = {
			"Authorization": `token ${githubToken}`,
			"Content-Type": "application/json",
			"User-Agent": "Obsidian-PicFlow"
		};

		// 1. Check if file exists (to get SHA for overwrite, or to skip)
		let sha: string | undefined;
		let exists = false;

		try {
			// const _checkReq: RequestUrlParam = { ... } // Unused
			
			if (proxyUrl && proxyUrl.startsWith("http")) {
                // If using proxy, URL might need adjustment or we trust requestUrl handles it if we replace the domain?
                // For simple proxy like https://cors-anywhere.herokuapp.com/https://api.github.com...
                // But user config says "Proxy URL".
                // If it's a reverse proxy for github api:
                // checkReq.url = checkReq.url.replace("https://api.github.com", proxyUrl.replace(/\/$/, ""));
			}
			
			const checkResp = await requestUrl({
				url: apiUrl + `?ref=${branch}`,
				method: "GET",
				headers: headers,
				throw: false
			});

			if (checkResp.status === 200) {
				exists = true;
				sha = checkResp.json.sha;
			}
		} catch (_e) {
            // ignore
		}

		// Handle Upload Strategy
		if (exists) {
			if (uploadStrategy === 'skip') {
				return this.getCDNUrl(path);
			}
			if (uploadStrategy === 'rename') {
                // If rename, we recursively call upload with new name
                // This might loop if rename logic isn't robust, but handleRename adds timestamp.
				const newName = this.handleRename(fileName);
				return this.upload(file, newName);
			}
			// Strategy is 'overwrite', proceed with SHA (sha is already set)
		}

		// 2. Upload (PUT)
		const content = arrayBufferToBase64(await file.arrayBuffer());
		
		const body = {
			message: `Upload ${fileName} via PicFlow`,
			content: content,
			branch: branch,
			sha: sha 
		};

		try {
			const uploadResp = await requestUrl({
				url: apiUrl,
				method: "PUT",
				headers: headers,
				body: JSON.stringify(body)
			});

			if (uploadResp.status >= 300) {
				throw new Error(`GitHub Upload failed: ${uploadResp.status} - ${uploadResp.text}`);
			}
			
		} catch (error: unknown) {
			const msg = (error as Error).message || "Unknown GitHub Upload Error";
			throw new Error(msg);
		}

		return this.getCDNUrl(path);
	}

	async list(offset: number = 0, limit: number = 20): Promise<UploadedImage[]> {
		const { githubOwner, githubRepo, githubBranch, githubToken } = this.settings;
		const branch = githubBranch || "main";

		if (!githubOwner || !githubRepo || !githubToken) {
			throw new Error("GitHub Configuration is incomplete.");
		}

		// Use Recursive Tree API for efficient listing
		// https://docs.github.com/en/rest/git/trees#get-a-tree
		const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/trees/${branch}?recursive=1`;
		
		try {
			const response = await requestUrl({
				url: apiUrl,
				method: "GET",
				headers: {
					"Authorization": `token ${githubToken}`,
					"User-Agent": "Obsidian-PicFlow",
					"Accept": "application/vnd.github.v3+json"
				}
			});

			if (response.status !== 200) {
				throw new Error(`GitHub List failed: ${response.status}`);
			}

			const tree = response.json.tree as { path: string, type: string, size?: number }[];
			if (!Array.isArray(tree)) return [];

			// Filter for images and map to UploadedImage
			// Sort by path (or date if possible? Tree API doesn't give date)
			// For date sorting, we'd need commit history which is slow.
			// Let's stick to simple listing.
			const images = tree
				.filter((item) => {
					return item.type === 'blob' && this.isImage(item.path);
				})
				.map((item) => {
					return {
						key: item.path,
						name: item.path.split('/').pop() || item.path,
						url: this.getCDNUrl(item.path),
						size: item.size || 0,
						lastModified: undefined as Date | undefined // Not available in Tree API
					};
				});

			// Slice for pagination (simulated)
			return images.slice(offset, offset + limit);

		} catch (error: unknown) {
			const msg = (error as Error).message || "Unknown GitHub List Error";
			throw new Error(`Failed to list GitHub images: ${msg}`);
		}
	}

	async delete(key: string): Promise<boolean> {
		const { githubOwner, githubRepo, githubBranch, githubToken } = this.settings;
		const branch = githubBranch || "main";

		if (!githubOwner || !githubRepo || !githubToken) {
			throw new Error("GitHub Configuration is incomplete.");
		}

		// 1. Get SHA of the file (Required for deletion)
		const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${key}`;
		let sha: string | undefined;

		try {
			const checkResp = await requestUrl({
				url: apiUrl + `?ref=${branch}`,
				method: "GET",
				headers: {
					"Authorization": `token ${githubToken}`,
					"User-Agent": "Obsidian-PicFlow"
				},
				throw: false
			});

			if (checkResp.status === 200) {
				sha = checkResp.json.sha as string;
			} else if (checkResp.status === 404) {
				return true;
			} else {
				throw new Error(`Failed to get file info for deletion: ${checkResp.status}`);
			}
		} catch (e: unknown) {
			const msg = (e as Error).message || "Unknown Error";
			throw new Error(`Failed to get file SHA: ${msg}`);
		}

		if (!sha) return true; // Should not happen given logic above

		// 2. Delete File
		try {
			const deleteResp = await requestUrl({
				url: apiUrl,
				method: "DELETE",
				headers: {
					"Authorization": `token ${githubToken}`,
					"User-Agent": "Obsidian-PicFlow",
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					message: `Delete ${key} via PicFlow`,
					sha: sha,
					branch: branch
				})
			});

			if (deleteResp.status === 200 || deleteResp.status === 204) {
				return true;
			} else {
				throw new Error(`GitHub Delete failed: ${deleteResp.status} - ${deleteResp.text}`);
			}
		} catch (error: unknown) {
			throw new Error((error as Error).message || "Unknown GitHub Delete Error");
		}
	}

	private isImage(path: string): boolean {
		const ext = path.split('.').pop()?.toLowerCase();
		return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext || '');
	}

	private getCDNUrl(path: string): string {
		const { githubOwner, githubRepo, githubBranch, githubCdnProxy, githubCustomCdnUrl, githubCustomDomain } = this.settings;
		const branch = githubBranch || "main";
		const encodedPath = path.split('/').map(encodeURIComponent).join('/');

		// 1. Custom Domain Priority (Overrides everything)
		if (githubCustomDomain) {
			return `${githubCustomDomain.replace(/\/$/, "")}/${encodedPath}`;
		}

		// 2. CDN Proxy
		if (githubCdnProxy === 'jsdelivr') {
			return `https://cdn.jsdelivr.net/gh/${githubOwner}/${githubRepo}@${branch}/${encodedPath}`;
		} else if (githubCdnProxy === 'custom' && githubCustomCdnUrl) {
			return githubCustomCdnUrl
				.replace('{username}', githubOwner)
				.replace('{repo}', githubRepo)
				.replace('{branch}', branch)
				.replace('{path}', encodedPath);
		}

		// 3. Raw GitHub (Default)
		// raw.githubusercontent.com/user/repo/branch/path
		return `https://raw.githubusercontent.com/${githubOwner}/${githubRepo}/${branch}/${encodedPath}`;
	}

	private handleRename(fileName: string): string {
		// Simple rename strategy: append timestamp
		const ext = fileName.split('.').pop();
		const name = fileName.substring(0, fileName.lastIndexOf('.'));
		return `${name}-${Date.now()}.${ext}`;
	}
}