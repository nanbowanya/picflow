
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { OSSConfig, Uploader, UploadedImage } from "../settings";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import * as https from "https";

export class OSSUploader implements Uploader {
    private config: OSSConfig;

    constructor(config: OSSConfig) {
        this.config = config;
    }

    private getEndpoint(): string | undefined {
        const { provider, region, customDomain } = this.config;
        
        // Fallback: If no region, use Custom Domain as Endpoint (for CNAME or specialized setups)
        if (!region && customDomain && typeof customDomain === 'string' && customDomain.trim() !== '') {
            try {
                // Extract origin (protocol + host) from customDomain
                const cleanDomain = customDomain.trim();
                const urlStr = cleanDomain.startsWith('http') ? cleanDomain : `https://${cleanDomain}`;
                const url = new URL(urlStr);
                const result = `${url.protocol}//${url.host}`;
                return result;
            } catch (e) {
                console.error("[PicFlow] Invalid Custom Domain:", customDomain, e);
                // Return undefined to prevent S3Client from throwing "Invalid URL"
                return undefined;
            }
        }
        
        // If region is provided (legacy or manual), use standard provider endpoints
        // If region is missing (UI removed), we try to fallback to defaults to generate a valid OSS endpoint
        let targetRegion = region;
        if (!targetRegion) {
            if (provider === 'aliyun') targetRegion = 'oss-cn-hangzhou';
            else if (provider === 'tencent') targetRegion = 'ap-shanghai';
        }

        if (targetRegion) {
            if (provider === 'aliyun') {
                // Handle cases where region is already "oss-cn-hangzhou" to prevent "oss-oss-cn-hangzhou"
                const normalizedRegion = targetRegion.startsWith('oss-') ? targetRegion : `oss-${targetRegion}`;
                return `https://${normalizedRegion}.aliyuncs.com`;
            } else if (provider === 'tencent') {
                return `https://cos.${targetRegion}.myqcloud.com`;
            }
        }

        // Without Region or Custom Domain, we default to undefined and let SDK fail or try global
        return undefined;
    }

    private getBucketName(): string {
        const { provider, bucket, appId } = this.config;
        if (provider === 'tencent' && appId && !bucket.endsWith(`-${appId}`)) {
            return `${bucket}-${appId}`;
        }
        return bucket;
    }

    private getClient(): S3Client {
        const { accessKeyId, accessKeySecret, region, provider, customDomain } = this.config;
        
        const requestHandler = new NodeHttpHandler({
            httpsAgent: new https.Agent({
                rejectUnauthorized: true // OSS usually has valid certs
            }),
            httpAgent: new (require('http').Agent)()
        });

        // Determine Region
        let clientRegion = region || 'us-east-1';
        if (!region && provider === 'aliyun') clientRegion = 'oss-cn-hangzhou';
        if (!region && provider === 'tencent') clientRegion = 'ap-shanghai';

        const endpoint = this.getEndpoint();
        
        // Fix for "Hostname/IP does not match certificate's altnames":
        // This error happens when S3Client adds the bucket name to the endpoint (virtual-hosted style)
        // AND the endpoint itself already includes the bucket name (e.g. from Custom Domain logic)
        // OR the endpoint is a CNAME that doesn't support wildcard subdomains correctly in the cert.
        
        // For OSS/COS:
        // If we are using the default endpoint (e.g. https://oss-cn-hangzhou.aliyuncs.com),
        // forcePathStyle = false means it will become https://bucket.oss-cn-hangzhou.aliyuncs.com (Correct).
        
        // However, if getEndpoint() returns a Custom Domain that MIGHT be a CNAME to the bucket directly 
        // (e.g. https://my-image.com -> CNAME -> bucket.oss-cn-hangzhou.aliyuncs.com),
        // then appending the bucket again (https://bucket.my-image.com) is WRONG.
        
        // STRATEGY:
        // If we are using a Custom Domain (which is implied if getEndpoint() returns one and Region is empty),
        // we should assume the Endpoint IS the bucket access point, so we must use forcePathStyle = true
        // to prevent SDK from prepending the bucket name to the hostname.
        // Wait, forcePathStyle = true makes it https://endpoint/bucket/key.
        // This is also wrong for CNAMEs usually.
        
        // Correct approach for CNAMEs in AWS SDK v3:
        // If the endpoint is a CNAME to the bucket, we cannot use standard S3Client commands easily 
        // because they insist on bucket being in path or host.
        // BUT, if we provide the Custom Domain as the endpoint, and use forcePathStyle=true, 
        // it tries https://custom.com/bucket/key.
        
        // If getEndpoint() returns something that already looks like a bucket URL (e.g. auto fetched domain),
        // we need to be careful.
        
        // Let's look at getEndpoint() again.
        // It returns `https://${bucketName}.oss-${region}.aliyuncs.com` if region is present.
        // If we pass this as endpoint to S3Client, AND forcePathStyle=false (default),
        // SDK will turn it into `https://${bucketName}.${bucketName}.oss-${region}.aliyuncs.com` -> DOUBLE BUCKET!
        // THIS is the likely cause of "nanbowan.nanbowan.oss-cn-hangzhou..." error.
        
        // Solution:
        // If using Custom Domain (which might be the Auto Fetched standard domain),
        // we should use forcePathStyle = true? No, that appends /bucket.
        // We should probably strip the bucket from the Custom Domain if it matches the standard pattern,
        // OR tell SDK not to mess with the URL.
        
        // Actually, if Custom Domain is used, it's often a CNAME for the bucket.
        // If so, we should set `bucketEndpoint: true` in S3Client config (if available) or similar.
        // In AWS SDK v3, `bucketEndpoint: true` means "the endpoint I gave you IS the bucket".
        
        // Only treat as custom domain (bucket endpoint) if we actually HAVE an endpoint derived from custom domain
        // And if custom domain is configured.
        // If custom domain is set, getEndpoint() returns it.
        // If custom domain is NOT set, getEndpoint() returns standard endpoint (not bucket endpoint).
        
        // Fix: If we generated a standard endpoint (because region was provided), DO NOT use bucketEndpoint mode.
        // The bucketEndpoint mode expects the endpoint to be `https://bucket.domain.com`.
        // Our getEndpoint() for standard region returns `https://oss-cn-hangzhou.aliyuncs.com`.
        // If we set bucketEndpoint: true, SDK expects `https://oss-cn-hangzhou.aliyuncs.com/key`, missing bucket!
        
        // So:
        // 1. If we used Region -> Standard Endpoint -> bucketEndpoint = false.
        // 2. If we used Custom Domain (Fallback) -> bucketEndpoint = true.
        
        const isStandardEndpoint = !!region || (!region && !customDomain); 
        const isUsingCustomDomainEndpoint = !isStandardEndpoint && !!customDomain && endpoint !== undefined;

        return new S3Client({
            endpoint: endpoint,
            region: clientRegion,
            credentials: {
                accessKeyId: accessKeyId,
                secretAccessKey: accessKeySecret,
            },
            forcePathStyle: false, 
            bucketEndpoint: isUsingCustomDomainEndpoint, // KEY FIX: Tell SDK the endpoint already points to the bucket
            requestHandler: requestHandler,
        });
    }

    async upload(file: File, fileName: string): Promise<string> {
        const client = this.getClient();
        const bucketName = this.getBucketName();
        const { pathPrefix, customDomain, uploadStrategy } = this.config;

        // Normalize Path Prefix
        let sanitizedPrefix = pathPrefix.replace(/^\/+/, "");
        if (sanitizedPrefix && !sanitizedPrefix.endsWith("/")) {
            sanitizedPrefix += "/";
        }
        
        const key = `${sanitizedPrefix}${fileName}`;

        // Strategy Check
        if (uploadStrategy !== 'overwrite') {
            try {
                const headCommand = new HeadObjectCommand({
                    Bucket: bucketName,
                    Key: key,
                });
                await client.send(headCommand);
                
                // File exists
                if (uploadStrategy === 'skip') {
                    console.log(`[PicFlow] Strategy is SKIP. Returning existing URL.`);
                    return this.generateUrl(key);
                }
            } catch (error: any) {
                // Ignore 404
            }
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: buffer,
            ContentType: file.type,
            ACL: 'public-read', // Default to public-read for image hosting
        });

        await client.send(command);

        return this.generateUrl(key);
    }

    private generateUrl(key: string): string {
        const { customDomain, provider, region, bucket, autoDomain } = this.config;
        const bucketName = this.getBucketName();
        // Ensure path doesn't start with slash to avoid double slashes
        const path = key.replace(/^\//, "");

        if (customDomain) {
            let domain = customDomain.replace(/\/$/, "");
            // Ensure protocol
            if (!domain.startsWith('http')) domain = `https://${domain}`;
            return `${domain}/${path}`;
        }

        // Default Domain Construction
        if (provider === 'aliyun') {
            return `https://${bucketName}.oss-${region}.aliyuncs.com/${path}`;
        } else if (provider === 'tencent') {
            return `https://${bucketName}.cos.${region}.myqcloud.com/${path}`;
        }

        return '';
    }

    async autoFetchDomain(): Promise<string | null> {
         const { provider, bucket, accessKeyId, accessKeySecret } = this.config;
         const bucketName = this.getBucketName();

         // Temporary Client just for Location
         // We use a known public endpoint to bootstrap the request.
         // For Aliyun, oss-cn-hangzhou.aliyuncs.com is a good default to query location.
         // For Tencent, cos.ap-guangzhou.myqcloud.com
         
         let bootstrapEndpoint = '';
         let bootstrapRegion = 'us-east-1';

         if (provider === 'aliyun') {
             bootstrapEndpoint = 'https://oss-cn-hangzhou.aliyuncs.com';
             bootstrapRegion = 'oss-cn-hangzhou';
         } else if (provider === 'tencent') {
             bootstrapEndpoint = 'https://cos.ap-guangzhou.myqcloud.com';
             bootstrapRegion = 'ap-guangzhou';
         }

         const requestHandler = new NodeHttpHandler({
            httpsAgent: new https.Agent({ rejectUnauthorized: true }),
            httpAgent: new (require('http').Agent)()
        });

         const client = new S3Client({
             endpoint: bootstrapEndpoint,
             region: bootstrapRegion,
             credentials: {
                 accessKeyId: accessKeyId,
                 secretAccessKey: accessKeySecret,
             },
             forcePathStyle: false,
             requestHandler
         });

         try {
             // Attempt to get bucket location
             const locationCommand = new (require("@aws-sdk/client-s3").GetBucketLocationCommand)({
                 Bucket: bucketName
             });
             const response: any = await client.send(locationCommand);
             
             let detectedRegion = response.LocationConstraint;
             
             // Log for debugging
             // console.log('[PicFlow] Auto Fetch Region:', detectedRegion);

             if (detectedRegion) {
                 if (provider === 'aliyun') {
                     // Aliyun: oss-cn-hangzhou
                     if (detectedRegion.startsWith('oss-')) {
                         return `https://${bucketName}.${detectedRegion}.aliyuncs.com`;
                     }
                     return `https://${bucketName}.oss-${detectedRegion}.aliyuncs.com`;
                 } else if (provider === 'tencent') {
                     // Tencent: ap-shanghai
                     return `https://${bucketName}.cos.${detectedRegion}.myqcloud.com`;
                 }
             }
         } catch (e) {
             console.error("Auto Fetch Domain Failed:", e);
         }
         
         return null;
    }

    async list(offset: number = 0, limit: number = 20): Promise<UploadedImage[]> {
        // For list operations, we need to be careful with bucketEndpoint.
        
        // ISSUE:
        // When using Custom Domain (bucketEndpoint: true), SDK signs request as "GET https://bucket.domain/?list-type=2".
        // But the server might expect the canonical resource to be just "/" or "/?list-type=2" without bucket in path if it's CNAME.
        // OR if it's not CNAME but just alias.
        
        // The error "Authorization header is invalid" specifically points to Signature Mismatch.
        // This usually happens when:
        // 1. Host header mismatches signed headers.
        // 2. Resource path mismatches.
        
        // If upload works (PUT /key), it means the bucket logic is mostly correct for object operations.
        // For ListObjects (GET /), it's trickier with Custom Domains.
        
        // WORKAROUND:
        // If we are using Custom Domain, we might want to temporarily switch back to Standard Endpoint for LISTING only.
        // Listing doesn't need to go through Custom Domain (CDN), it's an API call to the origin.
        // Standard Endpoint is safer for API calls.
        
        // Check if we have a standard region to fallback to.
        const { region, provider, accessKeyId, accessKeySecret } = this.config;
        let listClient = this.getClient(); // Default client
        let listBucketName = this.getBucketName();
        
        // If we are using Custom Domain (which implies bucketEndpoint=true in current getClient),
        // try to construct a standard client for listing if possible.
        if (this.config.customDomain && region) {
            // console.log('[PicFlow] Switching to Standard Endpoint for List operation to avoid Auth issues with Custom Domain.');
            
            // Re-create client forcing standard endpoint
            let standardEndpoint = '';
             if (provider === 'aliyun') {
                 standardEndpoint = `https://${region}.aliyuncs.com`; // For Aliyun, endpoint is region domain, bucket goes in host or path
             } else if (provider === 'tencent') {
                 standardEndpoint = `https://cos.${region}.myqcloud.com`;
             }
             
             if (standardEndpoint) {
                 const requestHandler = new NodeHttpHandler({
                    httpsAgent: new https.Agent({ rejectUnauthorized: true }),
                    httpAgent: new (require('http').Agent)()
                });
                
                 listClient = new S3Client({
                     endpoint: standardEndpoint,
                     region: region,
                     credentials: { accessKeyId, secretAccessKey: accessKeySecret },
                     forcePathStyle: false, // Standard virtual hosted style: bucket.region.aliyuncs.com
                     bucketEndpoint: false, // Explicitly false
                     requestHandler
                 });
             }
        }

        const { pathPrefix } = this.config;
        
        try {
            const command = new ListObjectsV2Command({
                Bucket: listBucketName,
                Prefix: pathPrefix,
            });
            
            const response = await listClient.send(command);
            
            if (!response.Contents) return [];
            
            // Sort by date desc
            const sorted = response.Contents.sort((a, b) => {
                return (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0);
            });
            
            // Slice
            const sliced = sorted.slice(offset, offset + limit);
            
            return sliced.map(item => ({
                url: this.generateUrl(item.Key || ''),
                name: item.Key?.split('/').pop() || 'unknown',
                size: item.Size,
                type: 'image/unknown',
                createdAt: item.LastModified?.getTime() || Date.now()
            }));

        } catch (error: any) {
            console.error("OSS List Error:", error);
            throw error;
        }
    }

    async delete(key: string): Promise<boolean> {
        const client = this.getClient();
        const bucketName = this.getBucketName();

        try {
            await client.send(new DeleteObjectCommand({
                Bucket: bucketName,
                Key: key
            }));
            return true;
        } catch (e) {
            console.error("OSS Delete Error:", e);
            return false;
        }
    }
}
