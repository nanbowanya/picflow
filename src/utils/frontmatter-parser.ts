import { App, TFile } from 'obsidian';

export interface PublishMetadata {
    // 基础元数据
    title?: string;
    author?: string;
    date?: string;
    tags?: string[];
    cover?: string; // URL 或 相对路径
    
    // 摘要与描述
    abstract?: string;
    
    // 发布控制
    original?: boolean;
    url?: string; // 原文链接
    publish_mode?: 'draft' | 'direct';
    
    // 平台特有字段 (WeChat)
    wx_cover_crop?: 'center' | 'top' | 'bottom';
    wx_open_comment?: boolean;
    wx_fans_only_comment?: boolean;
    wx_scheduled_time?: string;
    thumb_media_id?: string; // Add thumb_media_id support
    
    // 平台特有字段 (Zhihu)
    zhihu_bio?: string;
    zhihu_column?: string;

    // 平台特有字段 (CSDN)
    categories?: string[];

    // 平台特有字段 (Juejin)
    category_id?: string;
    tag_ids?: string[];
    
    // 状态回写 (Read-only usually, managed by plugin)
    publish_status?: Record<string, { status: string; id: string; link: string }>;
}

export class FrontmatterParser {
    static getMetadata(app: App, file: TFile): PublishMetadata {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache || !cache.frontmatter) {
            return {
                title: file.basename, // Fallback to filename
            };
        }
        
        const fm = cache.frontmatter;
        
        return {
            title: String(fm.title || file.basename),
            author: fm.author ? String(fm.author) : undefined,
            date: fm.date ? String(fm.date) : undefined,
            tags: Array.isArray(fm.tags) ? fm.tags.map(String) : (typeof fm.tags === 'string' ? [fm.tags] : undefined),
            cover: fm.cover ? String(fm.cover) : undefined,
            abstract: fm.abstract ? String(fm.abstract) : undefined,
            original: fm.original !== undefined ? Boolean(fm.original) : undefined,
            url: fm.url ? String(fm.url) : undefined,
            publish_mode: (fm.publish_mode === 'draft' || fm.publish_mode === 'direct') ? fm.publish_mode as 'draft' | 'direct' : undefined,
            
            wx_cover_crop: (['center', 'top', 'bottom'].includes(String(fm.wx_cover_crop))) ? fm.wx_cover_crop as 'center' | 'top' | 'bottom' : undefined,
            wx_open_comment: fm.wx_open_comment !== undefined ? Boolean(fm.wx_open_comment) : undefined,
            wx_fans_only_comment: fm.wx_fans_only_comment !== undefined ? Boolean(fm.wx_fans_only_comment) : undefined,
            wx_scheduled_time: fm.wx_scheduled_time ? String(fm.wx_scheduled_time) : undefined,
            thumb_media_id: fm.thumb_media_id ? String(fm.thumb_media_id) : undefined, // Add this
            
            zhihu_bio: fm.zhihu_bio ? String(fm.zhihu_bio) : undefined,
            zhihu_column: fm.zhihu_column ? String(fm.zhihu_column) : undefined,

            category_id: fm.category_id ? String(fm.category_id) : undefined,
            tag_ids: Array.isArray(fm.tag_ids) ? fm.tag_ids.map(String) : undefined,

            // CSDN
            categories: Array.isArray(fm.categories) ? fm.categories.map(String) : undefined,
            
            publish_status: fm.publish_status as Record<string, { status: string; id: string; link: string }> | undefined
        };
    }

    static async updateMetadata(app: App, file: TFile, updates: Partial<PublishMetadata>) {
        await app.fileManager.processFrontMatter(file, (fm) => {
            Object.assign(fm, updates);
        });
    }
}
