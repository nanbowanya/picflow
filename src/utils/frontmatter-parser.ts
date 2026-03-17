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
            title: fm.title || file.basename,
            author: fm.author,
            date: fm.date,
            tags: fm.tags,
            cover: fm.cover,
            abstract: fm.abstract,
            original: fm.original,
            url: fm.url,
            publish_mode: fm.publish_mode,
            
            wx_cover_crop: fm.wx_cover_crop,
            wx_open_comment: fm.wx_open_comment,
            wx_fans_only_comment: fm.wx_fans_only_comment,
            wx_scheduled_time: fm.wx_scheduled_time,
            thumb_media_id: fm.thumb_media_id, // Add this
            
            zhihu_bio: fm.zhihu_bio,
            zhihu_column: fm.zhihu_column,

            category_id: fm.category_id,
            tag_ids: fm.tag_ids,

            // CSDN
            categories: fm.categories,
            
            publish_status: fm.publish_status
        };
    }

    static async updateMetadata(app: App, file: TFile, updates: Partial<PublishMetadata>) {
        await app.fileManager.processFrontMatter(file, (fm) => {
            Object.assign(fm, updates);
        });
    }
}
