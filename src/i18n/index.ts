// src/i18n/index.ts
import { en } from './en';
import { zh } from './zh';
import { PicFlowSettings } from '../settings';

const translations = {
	en,
	zh,
};

export type Language = 'en' | 'zh';

export function getLanguage(settings?: PicFlowSettings): Language {
	// 1. Check user setting
	if (settings?.language && settings.language !== 'auto') {
		return settings.language;
	}

	// 2. Check Obsidian/System language
	// Obsidian exposes 'moment.locale()' which is usually accurate.
	const locale = window.moment?.locale() || 'en';
	
	if (locale.startsWith('zh')) {
		return 'zh';
	}

	// Default to English
	return 'en';
}

export function t(key: string, settings?: PicFlowSettings): string {
	const lang = getLanguage(settings);
	const dict = translations[lang] || translations['en'];
	return dict[key] || key;
}
