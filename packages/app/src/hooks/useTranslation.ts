import { useState, useCallback } from 'react';
import { LANG_LABELS as CORE_LANG_LABELS } from '@bsky/core';
import type { AIConfig } from '@bsky/core';

export type TargetLang = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es';

export const LANG_LABELS: Record<TargetLang, string> = {
  zh: CORE_LANG_LABELS.zh ?? '中文',
  en: CORE_LANG_LABELS.en ?? 'English',
  ja: CORE_LANG_LABELS.ja ?? '日本語',
  ko: CORE_LANG_LABELS.ko ?? '한국어',
  fr: CORE_LANG_LABELS.fr ?? 'Français',
  de: CORE_LANG_LABELS.de ?? 'Deutsch',
  es: CORE_LANG_LABELS.es ?? 'Español',
};

export interface TranslationResult {
  translated: string;
  sourceLang?: string;
}

export function useTranslation(
  aiKey: string,
  aiBaseUrl: string,
  aiModel = 'deepseek-v4-flash',
  targetLang: TargetLang = 'zh',
  initialMode: 'simple' | 'json' = 'simple',
) {
  const [cache] = useState(() => new Map<string, TranslationResult>());
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<TargetLang>(targetLang);
  const [mode, setMode] = useState<'simple' | 'json'>(initialMode);

  const config: AIConfig = { apiKey: aiKey, baseUrl: aiBaseUrl, model: aiModel };

  const translate = useCallback(async (text: string, overrideLang?: TargetLang): Promise<TranslationResult> => {
    const l = overrideLang ?? lang;
    const cacheKey = `${mode}::${l}::${text}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    setLoading(true);
    try {
      const { translateText } = await import('@bsky/core');
      const result = await translateText(config, text, l, mode);
      cache.set(cacheKey, result);
      return result;
    } finally {
      setLoading(false);
    }
  }, [cache, config, lang, mode]);

  return { translate, loading, cache, lang, setLang, mode, setMode, LANG_LABELS };
}
