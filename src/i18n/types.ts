// src/i18n/types.ts

export type TranslationKey = 
	// Settings
	| 'settings.title'
	| 'settings.general'
    | 'settings.general.configuration'
	| 'settings.general.language'
	| 'settings.general.language.desc'
	| 'settings.general.autoUpload'
	| 'settings.general.autoUpload.desc'
	| 'settings.general.defaultUploader'
	| 'settings.general.defaultUploader.desc'
	| 'settings.general.imageNameFormat'
	| 'settings.general.imageNameFormat.desc'
	
	// Uploader Settings
	| 'settings.uploader.configuration'
	| 'settings.uploader.s3.endpoint'
	| 'settings.uploader.s3.endpoint.desc'
	| 'settings.uploader.s3.region'
	| 'settings.uploader.s3.region.desc'
	| 'settings.uploader.s3.bucket'
	| 'settings.uploader.s3.accessKeyId'
	| 'settings.uploader.s3.secretAccessKey'
	| 'settings.uploader.s3.pathPrefix'
	| 'settings.uploader.s3.pathPrefix.desc'
	| 'settings.uploader.s3.customDomain'
	| 'settings.uploader.s3.customDomain.desc'
	| 'settings.uploader.s3.advancedConfiguration'
	| 'settings.uploader.s3.forcePathStyle'
	| 'settings.uploader.s3.forcePathStyle.desc'
	| 'settings.uploader.s3.useSSL'
	| 'settings.uploader.s3.useSSL.desc'
	| 'settings.uploader.s3.bypassCertificateValidation'
	| 'settings.uploader.s3.bypassCertificateValidation.desc'
	
	| 'settings.uploader.uploadStrategy'
	| 'settings.uploader.uploadStrategy.desc'
	| 'settings.uploader.uploadStrategy.rename'
	| 'settings.uploader.uploadStrategy.overwrite'
	| 'settings.uploader.uploadStrategy.skip'

	| 'settings.uploader.github.token'
	| 'settings.uploader.github.token.desc'
	| 'settings.uploader.github.owner'
	| 'settings.uploader.github.repo'
	| 'settings.uploader.github.branch'
	| 'settings.uploader.github.branch.desc'
	| 'settings.uploader.github.cdnProxy'
	| 'settings.uploader.github.cdnProxy.desc'

	// AI Settings
	| 'settings.ai.provider'
	| 'settings.ai.apiKey'
	| 'settings.ai.apiKey.desc'
	| 'settings.ai.defaultStyle'
	| 'settings.ai.defaultStyle.desc'

	// Pro & License
	| 'settings.pro.title'
	| 'settings.pro.description'
	| 'settings.pro.licenseKey'
	| 'settings.pro.licenseKey.desc'
    | 'settings.pro.label'
    | 'settings.pro.btn.activate'
    | 'settings.pro.webdav.label'
    | 'settings.pro.sftp.label'

	// Notices & Errors
	| 'notice.uploading'
	| 'notice.uploaded'
	| 'notice.uploadFailed'
	| 'notice.s3ConfigIncomplete'
	| 'notice.githubNotImplemented'
	| 'notice.settingsSaved'
	| 'notice.saveButton'

	// Publish Drawer
	| 'publish.drawer.tags'
	| 'publish.drawer.tagsPlaceholder'
	| 'publish.drawer.category'
	| 'publish.drawer.status'
	| 'publish.drawer.statusDraft'
	| 'publish.drawer.statusPublish'
	| 'publish.drawer.mcpTool'
	| 'publish.drawer.mcpToolAuto';

export interface Translations {
	[key: string]: string;
}
