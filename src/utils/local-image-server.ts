import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { requestUrl } from 'obsidian';
import * as os from 'os';

/**
 * A lightweight local HTTP server to bridge images from local disk or internet
 * to MCP server running in Docker (via host.docker.internal).
 */
export class LocalImageServer {
    private server: http.Server | null = null;
    private port: number = 19090; // Default port
    private imageMap: Map<string, string> = new Map(); // token -> filePath
    private isRunning: boolean = false;

    constructor(port: number = 19090) {
        this.port = port;
    }

    /**
     * Start the local server
     */
    async start(): Promise<void> {
        if (this.isRunning) return Promise.resolve();

        return new Promise((resolve, _reject) => {
            this.server = http.createServer((req, res) => {
                // 1. Parse URL
                const url = req.url || '';
                const token = url.replace(/^\//, ''); // simple path as token

                // 2. Lookup File Path
                const filePath = this.imageMap.get(token);
                
                if (!filePath) {
                    res.writeHead(404);
                    res.end('Not Found');
                    return;
                }

                // 3. Serve File
                try {
                    // Check if it's a local file or needs to be downloaded (if we support remote proxying later)
                    // Currently we assume filePath is a local absolute path
                    if (fs.existsSync(filePath)) {
                        const stat = fs.statSync(filePath);
                        res.writeHead(200, {
                            'Content-Type': 'image/png', // Simplified, or detect mime
                            'Content-Length': stat.size
                        });
                        const stream = fs.createReadStream(filePath);
                        stream.pipe(res);
                    } else {
                        res.writeHead(404);
                        res.end('File Not Found');
                    }
                } catch (_e) {
                    res.writeHead(500);
                    res.end('Internal Error');
                }
            });

            this.server.on('error', (_e) => {
                // console.error("Server error:", e);
            });

            // Listen on 0.0.0.0 to allow external access (including from Docker)
            this.server.listen(this.port, '0.0.0.0', () => {
                this.isRunning = true;
                resolve();
            });
        });
    }

    /**
     * Stop the server
     */
    stop() {
        if (this.server) {
            try {
                this.server.close();
            } catch (_e) {
                // ignore
            }
            this.server = null;
        }
        this.isRunning = false;
        this.imageMap.clear();
    }

    /**
     * Register a local file and get a bridge URL
     * @param absolutePath Absolute path to the local image file
     * @returns URL accessible via host.docker.internal
     */
    registerImage(absolutePath: string): string {
        const token = Math.random().toString(36).substring(2, 15);
        this.imageMap.set(token, absolutePath);
        
        // Use real LAN IP instead of host.docker.internal to avoid DNS issues in Docker
        // host.docker.internal relies on Docker's internal DNS which might be flaky or require config.
        // A real LAN IP is more reliable for local network access.
        const host = this.getLocalIP();
        
        return `http://${host}:${this.port}/${token}`;
    }

    /**
     * Helper to get local LAN IP address
     */
    private getLocalIP(): string {
        const interfaces = os.networkInterfaces();
        let bestIP = 'host.docker.internal';
        
        // Priority: 192.168.x.x > 10.x.x.x > 172.x.x.x > others
        // Exclude 127.0.0.1 and 169.254.x.x (link-local)
        
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    const ip = iface.address;
                    
                    // Skip link-local addresses (APIPA)
                    if (ip.startsWith('169.254.')) continue;
                    
                    // Prefer standard private ranges
                    if (ip.startsWith('192.168.')) return ip;
                    if (ip.startsWith('10.')) bestIP = ip;
                    if (ip.startsWith('172.') && bestIP === 'host.docker.internal') bestIP = ip;
                    
                    // Keep first valid non-link-local as fallback
                    if (bestIP === 'host.docker.internal') bestIP = ip;
                }
            }
        }
        return bestIP;
    }

    /**
     * Helper to download remote image to temp file if needed
     */
    async downloadRemoteImage(url: string, tempDir: string): Promise<string> {
        // Simple download implementation using Obsidian requestUrl or fetch
        // Returns absolute path to downloaded file
        const response = await requestUrl({ url });
        const buffer = response.arrayBuffer;
        const fileName = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
        const filePath = path.join(tempDir, fileName);
        
        // Ensure temp dir exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, Buffer.from(buffer));
        return filePath;
    }
}

