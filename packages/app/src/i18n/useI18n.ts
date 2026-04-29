import { useState, useEffect, useCallback } from 'react';
import { getI18nStore } from './store.js';
import type { Locale } from './types.js';
import { availableLocales, localeLabels } from './locales/index.js';

export function useI18n(initialLocale?: Locale) {
  const store = getI18nStore(initialLocale);
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);

  useEffect(() => store.subscribe(tick), [store, tick]);

  return {
    t: useCallback((key: string, params?: Record<string, string | number>) => store.t(key, params), [store]),
    locale: store.locale,
    setLocale: useCallback((l: Locale) => store.setLocale(l), [store]),
    availableLocales,
    localeLabels,
  };
}

export type UseI18nReturn = ReturnType<typeof useI18n>;
