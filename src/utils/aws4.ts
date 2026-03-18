
// AWS4-HMAC-SHA256 Implementation for Juejin ImageX

// Helper: Convert ArrayBuffer to Hex String
function arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Helper: HMAC-SHA256 using Web Crypto API
async function hmacSha256(key: ArrayBuffer | Uint8Array | string, message: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    let keyData: BufferSource;

    if (typeof key === 'string') {
        keyData = encoder.encode(key);
    } else {
        keyData = key as BufferSource;
    }

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

// Helper: SHA256 Hash
async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return arrayBufferToHex(hashBuffer);
}

// Helper: Format Date for AWS
function formatAmzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function formatDateStamp(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
}

export interface AWS4SignParams {
    method: string;
    url: string;
    accessKeyId: string;
    secretAccessKey: string;
    securityToken?: string;
    region?: string;
    service?: string;
    headers?: Record<string, string>;
    body?: string; // Payload body string
}

export interface AWS4SignResult {
    authorization: string;
    amzDate: string;
    headers: Record<string, string>;
}

export async function signAWS4(params: AWS4SignParams): Promise<AWS4SignResult> {
    const {
        method,
        url,
        accessKeyId,
        secretAccessKey,
        securityToken,
        region = 'cn-north-1',
        service = 'imagex',
        headers = {},
        body = '',
    } = params;

    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;
    const queryString = parsedUrl.search.substring(1); // Remove leading ?

    const now = new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = formatDateStamp(now);

    // 1. Canonical Query String
    const queryParams = new URLSearchParams(queryString);
    // Sort by key
    const sortedParams = Array.from(queryParams.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const canonicalQueryString = sortedParams
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

    // 2. Canonical Headers
    const signedHeadersObj: Record<string, string> = {
        'host': parsedUrl.host,
        'x-amz-date': amzDate,
    };

    if (securityToken) {
        signedHeadersObj['x-amz-security-token'] = securityToken;
    }

    // Merge provided headers (must be lowercased for signing)
    for (const key in headers) {
        signedHeadersObj[key.toLowerCase()] = headers[key];
    }

    // Sort headers
    const sortedHeaderKeys = Object.keys(signedHeadersObj).sort();
    
    const canonicalHeaders = sortedHeaderKeys
        .map(k => `${k}:${signedHeadersObj[k].trim()}\n`)
        .join('');

    const signedHeaderNames = sortedHeaderKeys.join(';');

    // 3. Payload Hash
    const payloadHash = await sha256(body);

    // 4. Canonical Request
    const canonicalRequest = [
        method.toUpperCase(),
        path || '/',
        canonicalQueryString,
        canonicalHeaders,
        signedHeaderNames,
        payloadHash,
    ].join('\n');

    // 5. String to Sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonicalRequestHash = await sha256(canonicalRequest);

    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        canonicalRequestHash,
    ].join('\n');

    // 6. Calculate Signature
    const kDate = await hmacSha256('AWS4' + secretAccessKey, dateStamp);
    const kRegion = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, service);
    const kSigning = await hmacSha256(kService, 'aws4_request');
    
    const signatureBuffer = await hmacSha256(kSigning, stringToSign);
    const signature = arrayBufferToHex(signatureBuffer);

    // 7. Authorization Header
    const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`;

    const resultHeaders: Record<string, string> = {
        'Authorization': authorization,
        'x-amz-date': amzDate,
        ...headers
    };

    if (securityToken) {
        resultHeaders['x-amz-security-token'] = securityToken;
    }

    return {
        authorization,
        amzDate,
        headers: resultHeaders
    };
}

// CRC32 Calculation
let crc32Table: Uint32Array | null = null;

function getCRC32Table(): Uint32Array {
    if (crc32Table) return crc32Table;
    crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crc32Table[i] = c;
    }
    return crc32Table;
}

export function crc32(data: Uint8Array): string {
    let crc = 0xFFFFFFFF;
    const table = getCRC32Table();
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    }
    return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16);
}
