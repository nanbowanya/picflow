
/**
 * Simple obfuscation utility for sensitive data.
 * Note: This is NOT strong encryption. It is designed to prevent sensitive data 
 * (like API keys) from being stored in plain text in data.json.
 * 
 * Since Obsidian plugins run in a client-side environment (including mobile),
 * we cannot rely on Node.js 'crypto' module or OS-level secure storage.
 * This provides a basic layer of protection against casual inspection.
 */

const SECRET_KEY = "picflow-plugin-secret-salt-v1";

export class SecurityManager {
    
    /**
     * Obfuscates a string using a simple XOR cipher + Hex encoding.
     * Compatible with all Obsidian platforms (Desktop & Mobile).
     */
    static encrypt(text: string): string {
        if (!text) return "";
        try {
            // Check if already encrypted (starts with specific prefix)
            if (text.startsWith("enc:")) return text;

            let result = "";
            for (let i = 0; i < text.length; i++) {
                const charCode = text.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
                result += charCode.toString(16).padStart(2, '0');
            }
            return `enc:${result}`;
        } catch (e) {
            console.error("Encryption failed", e);
            return text;
        }
    }

    /**
     * De-obfuscates a string.
     */
    static decrypt(text: string): string {
        if (!text) return "";
        try {
            // If not encrypted, return as is (backward compatibility)
            if (!text.startsWith("enc:")) return text;

            const hex = text.substring(4); // Remove "enc:" prefix
            let result = "";
            for (let i = 0; i < hex.length; i += 2) {
                const charCode = parseInt(hex.substr(i, 2), 16) ^ SECRET_KEY.charCodeAt((i / 2) % SECRET_KEY.length);
                result += String.fromCharCode(charCode);
            }
            return result;
        } catch (e) {
            console.error("Decryption failed", e);
            return text;
        }
    }

    /**
     * Decodes a Base64 string.
     * Used for hiding static endpoints in source code.
     */
    static decodeBase64(str: string): string {
        try {
            return atob(str);
        } catch (e) {
            console.error("Base64 decode failed", e);
            return "";
        }
    }
}
