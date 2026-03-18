import { PicFlowSettings } from '../settings';

export class ImageProcessor {
    static async process(file: File, settings: PicFlowSettings): Promise<File> {
        // 1. Check if Pro is active
        if (settings.licenseStatus !== 'valid') {
            return file;
        }

        const needCompress = settings.compressImage;
        const needWatermark = settings.addWatermark;
        
        if (!needCompress && !needWatermark) return file;
        
        // Only process images
        if (!file.type.startsWith('image/')) return file;
        
        try {
            // 2. Load image
            const img = await this.loadImage(file);
            
            // 3. Create Canvas
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return file;
            
            // 4. Draw Image
            ctx.drawImage(img, 0, 0);
            
            // 5. Apply Watermark
            if (needWatermark && settings.watermarkText) {
                this.drawWatermark(
                    ctx, 
                    canvas.width, 
                    canvas.height, 
                    settings.watermarkText, 
                    settings.watermarkPosition,
                    settings.watermarkColor,
                    settings.watermarkFontSize,
                    settings.watermarkOpacity
                );
            }
            
            // 6. Export
            let quality = 0.9;
            if (needCompress) {
                quality = settings.compressQuality / 100;
            }
            
            // Note: 'image/png' ignores quality in toBlob/toDataURL in most browsers.
            // If user wants compression, they usually expect file size reduction.
            // But changing file type (png -> jpeg) might be unexpected if not explicit.
            // For now, we keep original type.
            
            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        resolve(file);
                    } else {
                        // Create new file with same name and type
                        resolve(new File([blob], file.name, { type: file.type, lastModified: file.lastModified }));
                    }
                }, file.type, quality);
            });
        } catch (error) {
            console.error('Image processing failed:', error);
            return file; // Fallback to original
        }
    }
    
    private static loadImage(file: File): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error(`Failed to load image`));
            };
            img.src = url;
        });
    }
    
    private static drawWatermark(
        ctx: CanvasRenderingContext2D, 
        width: number, 
        height: number, 
        text: string, 
        position: string,
        color: string = '#ffffff',
        fontSizePx: number = 0,
        opacity: number = 60
    ) {
        // Font settings
        // If fontSizePx is 0 or undefined, use responsive size: 3% of diagonal or min(w,h)
        const fontSize = fontSizePx > 0 
            ? fontSizePx 
            : Math.max(14, Math.floor(Math.min(width, height) * 0.04));
            
        ctx.font = `bold ${fontSize}px sans-serif`;
        
        // Handle Color & Opacity
        // Convert Hex to RGB if needed, or just use globalAlpha
        ctx.save(); // Save state for opacity
        ctx.globalAlpha = opacity / 100;
        ctx.fillStyle = color;
        
        // Optional: Add shadow or outline for better visibility
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let x = width / 2;
        let y = height / 2;
        const padding = fontSize * 1.5;
        
        // Measure text for accurate positioning
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize; // Approximate
        
        switch (position) {
            case 'top-left':
                x = padding + (textWidth / 2);
                y = padding + (textHeight / 2);
                break;
            case 'top-right':
                x = width - padding - (textWidth / 2);
                y = padding + (textHeight / 2);
                break;
            case 'bottom-left':
                x = padding + (textWidth / 2);
                y = height - padding - (textHeight / 2);
                break;
            case 'bottom-right':
                x = width - padding - (textWidth / 2);
                y = height - padding - (textHeight / 2);
                break;
            case 'center':
            default:
                x = width / 2;
                y = height / 2;
                break;
        }
        
        // Ensure within bounds
        x = Math.max(textWidth/2, Math.min(x, width - textWidth/2));
        y = Math.max(textHeight/2, Math.min(y, height - textHeight/2));
        
        ctx.fillText(text, x, y);
        ctx.restore(); // Restore state
    }

    /**
     * Generate a preview URL (Data URL) for the watermark settings
     */
    static generatePreview(settings: PicFlowSettings): string {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        // Draw Background (Placeholder Image Style)
        // Gradient background - "Endless River" (Cyan to Blue) - Good contrast for white text
        const grd = ctx.createLinearGradient(0, 0, 400, 300);
        grd.addColorStop(0, "#4facfe"); // Bright Blue
        grd.addColorStop(1, "#00f2fe"); // Cyan
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 400, 300);

        // No shapes, just clean background as requested

        // Draw Watermark
        if (settings.addWatermark && settings.watermarkText) {
             this.drawWatermark(
                 ctx, 
                 canvas.width, 
                 canvas.height, 
                 settings.watermarkText, 
                 settings.watermarkPosition,
                 settings.watermarkColor,
                 settings.watermarkFontSize,
                 settings.watermarkOpacity
             );
        }

        return canvas.toDataURL('image/png');
    }
}
