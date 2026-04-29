import type { Locale, LocaleMessages } from '../types.js';
import zh from './zh.js';
import en from './en.js';
import ja from './ja.js';

export const messages: Record<Locale, LocaleMessages> = { zh, en, ja };

export const availableLocales: Locale[] = ['zh', 'en', 'ja'];

export const localeLabels: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
};
