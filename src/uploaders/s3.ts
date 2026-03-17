import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { PicFlowSettings, Uploader, UploadedImage } from "../settings";
import { Notice } from "obsidian";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import * as https from "https";
import * as http from "http";

export class S3Uploader implements Uploader {
	private settings: PicFlowSettings;

	constructor(settings: PicFlowSettings) {
		this.settings = settings;
	}

	async upload(file: File, fileName: string): Promise<string> {
		// Destructure settings from the current settings object (passed in constructor)
		const { 
			s3Endpoint, 
			s3Region, 
			s3Bucket, 
			s3AccessKeyId, 
			s3SecretAccessKey, 
			s3PathPrefix, 
			s3CustomDomain,
			s3ForcePathStyle,
			s3BypassCertificateValidation,
            uploadStrategy // Get strategy
		} = this.settings;

		if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
			throw new Error("S3 Configuration is incomplete. Please check your settings.");
		}

		// Configure HTTP Handler
		// Always use NodeHttpHandler to ensure consistent behavior in Electron environment
		// and avoid browser-specific stream issues (like readableStream.tee)
		const requestHandler = new NodeHttpHandler({
			httpsAgent: new https.Agent({
				rejectUnauthorized: !s3BypassCertificateValidation
			}),
			httpAgent: new http.Agent() // Support http as well
		});

		const client = new S3Client({
			endpoint: s3Endpoint,
			// For S3 compatible services (like MinIO, RustFS), region is often not strictly validated but required by SDK.
			// Default to 'us-east-1' if user sets 'auto' or leaves it empty.
			region: (s3Region === 'auto' || !s3Region) ? 'us-east-1' : s3Region,
			credentials: {
				accessKeyId: s3AccessKeyId,
				secretAccessKey: s3SecretAccessKey,
			},
			forcePathStyle: s3ForcePathStyle,
			requestHandler: requestHandler,
		});

		// Normalize Path Prefix: Remove leading slashes, ensure trailing slash if not empty
		let sanitizedPrefix = s3PathPrefix.replace(/^\/+/, "");
		if (sanitizedPrefix && !sanitizedPrefix.endsWith("/")) {
			sanitizedPrefix += "/";
		}
		
		const key = `${sanitizedPrefix}${fileName}`;

        // CHECK EXISTENCE AND HANDLE STRATEGY
        if (uploadStrategy !== 'overwrite') { // 'rename' or 'skip'
            try {
                const headCommand = new HeadObjectCommand({
                    Bucket: s3Bucket,
                    Key: key,
                });
                await client.send(headCommand);
                
                // If we are here, file exists
                
                if (uploadStrategy === 'skip') {
                    // Calculate and return existing URL
                    
                    if (s3CustomDomain) {
                        let domain = s3CustomDomain.replace(/\/$/, "");
                        if (domain.includes("{bucket}")) {
                            domain = domain.replace("{bucket}", s3Bucket);
                        } else if (s3ForcePathStyle && !domain.endsWith(`/${s3Bucket}`)) {
                            domain = `${domain}/${s3Bucket}`;
                        }
                        const path = key.replace(/^\//, "");
                        return `${domain}/${path}`;
                    } else {
                        const endpoint = s3Endpoint.replace(/\/$/, "");
                        const path = key.replace(/^\//, "");
                        return `${endpoint}/${s3Bucket}/${path}`;
                    }
                } 
            } catch (_e) {
                // If 404, file doesn't exist, proceed to upload.
            }
        }


		// Convert File to ArrayBuffer then to Buffer (Node.js) for upload
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const command = new PutObjectCommand({
			Bucket: s3Bucket,
			Key: key,
			Body: buffer,
			ContentType: file.type,
			ACL: 'public-read', // Make uploaded file publicly readable
		});

		try {
			const response = await client.send(command);
			
			// Verify if upload was successful (though AWS SDK usually throws on failure)
			if (response.$metadata.httpStatusCode && response.$metadata.httpStatusCode >= 300) {
				throw new Error(`Upload failed with HTTP status: ${response.$metadata.httpStatusCode}`);
			}

			// Post-Upload Verification: Check if object exists
			try {
				const headCommand = new HeadObjectCommand({
					Bucket: s3Bucket,
					Key: key,
				});
				await client.send(headCommand);
			} catch (headError: any) {
				// If HeadObject fails with 404, it implies the file wasn't saved where we expected.
				// If it fails with 403, it exists but we might not have permission (which is fine, we assume success).
				// We won't throw here to avoid blocking "blind write" scenarios, but we log it.
				if (headError.name === 'NotFound' || headError.$metadata?.httpStatusCode === 404) {
					throw new Error("Upload reported success, but file was not found on server immediately. Please check your Bucket/Path settings.");
				}
			}
			
			// Construct URL
			if (s3CustomDomain) {
				let domain = s3CustomDomain.replace(/\/$/, "");
				
				// Intelligent logic: If domain doesn't contain the bucket name and it's not a subdomain style (heuristic), 
				// and forcePathStyle is on, we should probably append the bucket.
				// However, "Custom Domain" usually implies the user wants full control.
				// Scenario A: User inputs "https://pic.nanbowan.top" (mapped to root) -> we append key (path/filename).
				// Scenario B: User inputs "https://s3.nanbowan.top" (service root) -> we MIGHT need bucket.
				
				// Let's refine the logic based on user feedback: "Automatic concatenation".
				// If the user provided a Custom Domain, we usually trust it maps to the BUCKET root.
				// BUT, if forcePathStyle is true (MinIO/RustFS), the "Endpoint" maps to Service Root.
				// If "Custom Domain" is just an alias for "Endpoint", then we need {bucket}.
				
				// Implementation:
				// 1. Support {bucket} placeholder (keep existing feature).
				// 2. If no placeholder, and forcePathStyle is TRUE, check if we should append bucket.
				//    Risk: What if custom domain ALREADY maps to bucket?
				//    Safest approach: Only replace {bucket} if present. 
				//    If user says "Automatic", maybe they mean "If I didn't put {bucket}, please guess".
				
				// Re-reading user request: "I shouldn't fill it, code should handle it".
				// This implies if they set Custom Domain to "https://pic.nanbowan.top" (which is their service domain),
				// and they are using MinIO/RustFS (forcePathStyle=true), they expect https://pic.nanbowan.top/bucket/file.
				
				if (domain.includes("{bucket}")) {
					domain = domain.replace("{bucket}", s3Bucket);
				} else if (s3ForcePathStyle) {
					// Check if custom domain already ends with bucket name to avoid duplication
					// This is a weak check, but better than nothing.
					if (!domain.endsWith(`/${s3Bucket}`)) {
						domain = `${domain}/${s3Bucket}`;
					}
				}
				
				const path = key.replace(/^\//, "");
				return `${domain}/${path}`;
			} else {
				// Default S3 URL style might vary, but for many S3 compatible:
				// endpoint/bucket/key or bucket.endpoint/key
				// For simplicity, let's assume path style if no custom domain
				const endpoint = s3Endpoint.replace(/\/$/, "");
				// Ensure key doesn't start with slash
				const path = key.replace(/^\//, "");
				return `${endpoint}/${s3Bucket}/${path}`;
			}

		} catch (error: any) {
			// Check if error.message is undefined and try to extract useful info
			let errorMessage = error.message;
			if (!errorMessage) {
				if (error.code) {
					errorMessage = `Error Code: ${error.code}`;
				} else if (typeof error === 'string') {
					errorMessage = error;
				} else {
					try {
						errorMessage = JSON.stringify(error);
					} catch (_e) {
						errorMessage = "Unknown error (cannot stringify)";
					}
				}
			}
			new Notice(`S3 Upload Failed: ${errorMessage}`);
			// Re-throw the error object, or a new Error with the clear message
			throw new Error(errorMessage);
		}
	}

	async list(offset: number = 0, limit: number = 20): Promise<UploadedImage[]> {
		const { 
			s3Endpoint, s3Region, s3Bucket, s3AccessKeyId, s3SecretAccessKey, 
			s3PathPrefix, s3CustomDomain, s3ForcePathStyle, s3BypassCertificateValidation
		} = this.settings;

		if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
			throw new Error("S3 Configuration is incomplete. Please check your settings.");
		}

		const requestHandler = new NodeHttpHandler({
			httpsAgent: new https.Agent({
				rejectUnauthorized: !s3BypassCertificateValidation
			}),
			httpAgent: new http.Agent()
		});

		const client = new S3Client({
			endpoint: s3Endpoint,
			region: (s3Region === 'auto' || !s3Region) ? 'us-east-1' : s3Region,
			credentials: {
				accessKeyId: s3AccessKeyId,
				secretAccessKey: s3SecretAccessKey,
			},
			forcePathStyle: s3ForcePathStyle,
			requestHandler: requestHandler,
		});

		const prefix = s3PathPrefix ? s3PathPrefix.replace(/^\/+/, "") : "";
		
		// S3 Pagination Logic for 'offset'
		let continuationToken: string | undefined = undefined;
		let skipped = 0;
		
		// 1. Skip 'offset' items if offset > 0
		if (offset > 0) {
			while (skipped < offset) {
				// We just want to skip, so MaxKeys can be up to 1000 (S3 limit) to skip faster
				// But we need to be careful not to overshoot if we want exact paging? 
				// Actually S3 listing is stable-ish. We just need to consume tokens.
				// We can just ask for 'offset' number of keys and discard them? 
				// No, we can't ask for > 1000.
				
				const step = Math.min(1000, offset - skipped);
				const command = new ListObjectsV2Command({
					Bucket: s3Bucket,
					Prefix: prefix,
					MaxKeys: step,
					ContinuationToken: continuationToken
				});
				
				const response = await client.send(command);
				const count = response.KeyCount || 0;
				skipped += count;
				continuationToken = response.NextContinuationToken;
				
				if (!response.IsTruncated) {
					// End of bucket reached before offset
					return [];
				}
			}
		}

		// 2. Fetch 'limit' items
		const command = new ListObjectsV2Command({
			Bucket: s3Bucket,
			Prefix: prefix,
			MaxKeys: limit,
			ContinuationToken: continuationToken
		});

		try {
			const response = await client.send(command);
			if (!response.Contents) return [];

			return response.Contents.map((item: any) => {
				const key = item.Key || "";
				let url = "";

				if (s3CustomDomain) {
					let domain = s3CustomDomain.replace(/\/$/, "");
					if (domain.includes("{bucket}")) {
						domain = domain.replace("{bucket}", s3Bucket);
					} else if (s3ForcePathStyle && !domain.endsWith(`/${s3Bucket}`)) {
						domain = `${domain}/${s3Bucket}`;
					}
					const path = key.startsWith('/') ? key.substring(1) : key;
					url = `${domain}/${path}`;
				} else {
					const endpoint = s3Endpoint.replace(/\/$/, "");
					const path = key.startsWith('/') ? key.substring(1) : key;
					url = `${endpoint}/${s3Bucket}/${path}`;
				}

				return {
					key: key,
					name: key.split('/').pop() || key,
					url: url,
					size: item.Size,
					lastModified: item.LastModified
				};
			});
		} catch (error: any) {
			throw new Error(`Failed to list images: ${error.message || error}`);
		}
	}

	async delete(key: string): Promise<boolean> {
		const { 
			s3Endpoint, s3Region, s3Bucket, s3AccessKeyId, s3SecretAccessKey, 
			s3ForcePathStyle, s3BypassCertificateValidation
		} = this.settings;

		if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
			throw new Error("S3 Configuration is incomplete.");
		}

		const requestHandler = new NodeHttpHandler({
			httpsAgent: new https.Agent({
				rejectUnauthorized: !s3BypassCertificateValidation
			}),
			httpAgent: new http.Agent()
		});

		const client = new S3Client({
			endpoint: s3Endpoint,
			region: (s3Region === 'auto' || !s3Region) ? 'us-east-1' : s3Region,
			credentials: {
				accessKeyId: s3AccessKeyId,
				secretAccessKey: s3SecretAccessKey,
			},
			forcePathStyle: s3ForcePathStyle,
			requestHandler: requestHandler,
		});

		const command = new DeleteObjectCommand({
			Bucket: s3Bucket,
			Key: key,
		});

		try {
			const _response = await client.send(command);
			// S3 DeleteObject is idempotent and returns 204 No Content typically, 
			// or 200 even if object didn't exist.
			// It throws mainly on permissions or network errors.
			return true;
		} catch (error: any) {
			throw new Error(`Failed to delete file: ${error.message || error}`);
		}
	}
}