import type { Locale, LocaleMessages } from './types.js';
import { messages as allMessages, availableLocales } from './locales/index.js';

export interface I18nStore {
  locale: Locale;
  messages: LocaleMessages;

  getLocale(): Locale;
  setLocale(locale: Locale): void;
  t(key: string, params?: Record<string, string | number>): string;

  _notify(): void;
  subscribe(fn: () => void): () => void;
  unsubscribe(fn: () => void): void;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`;
  });
}

export function createI18nStore(initialLocale: Locale = 'zh'): I18nStore {
  const listeners = new Set<() => void>();

  const store: I18nStore = {
    locale: 'zh',
    messages: allMessages.zh,

    getLocale() {
      return store.locale;
    },

    setLocale(locale: Locale) {
      if (!allMessages[locale]) return;
      store.locale = locale;
      store.messages = allMessages[locale];
      listeners.forEach(fn => fn());
    },

    t(key: string, params?: Record<string, string | number>): string {
      const raw = store.messages[key];
      if (raw) return interpolate(raw, params);
      const en = allMessages.en[key];
      if (en) return interpolate(en, params);
      const zh = allMessages.zh[key];
      if (zh) return interpolate(zh, params);
      return key;
    },

    _notify() { listeners.forEach(fn => fn()); },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    unsubscribe(fn) {
      listeners.delete(fn);
    },
  };

  if (initialLocale && allMessages[initialLocale]) {
    store.locale = initialLocale;
    store.messages = allMessages[initialLocale];
  }

  return store;
}

// Module-level singleton
let _instance: I18nStore | null = null;

export function getI18nStore(initialLocale?: Locale): I18nStore {
  if (!_instance) {
    _instance = createI18nStore(initialLocale);
  }
  return _instance;
}

export function resetI18nStore(): void {
  _instance = null;
}

export { availableLocales };
