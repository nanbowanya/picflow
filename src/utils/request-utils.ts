
/**
 * Helper to build multipart/form-data body for Obsidian requestUrl
 */
export function buildFormData(fields: Record<string, string>, file?: { name: string, data: ArrayBuffer, type: string, fieldName?: string }): { body: ArrayBuffer, boundary: string } {
    const boundary = '----ObsidianBoundary' + Math.random().toString(36).substring(2);
    const chunks: Uint8Array[] = [];
    const encoder = new TextEncoder();

    // Add fields
    for (const [key, value] of Object.entries(fields)) {
        chunks.push(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
    }
    
    // Add file
    if (file) {
        const fieldName = file.fieldName || 'image';
        chunks.push(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
        chunks.push(new Uint8Array(file.data));
        chunks.push(encoder.encode('\r\n'));
    }
    
    chunks.push(encoder.encode(`--${boundary}--`));
    
    // Combine
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    
    return { body: result.buffer, boundary };
}

/**
 * Extract value of a specific cookie key from a cookie string
 */
export function getCookieValue(cookieString: string, key: string): string | null {
    if (!cookieString) return null;
    const match = cookieString.match(new RegExp(`(^|;\\s*)${key}=([^;]*)`));
    return match ? match[2] : null;
}
