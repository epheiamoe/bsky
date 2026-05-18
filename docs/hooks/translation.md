# Translation Hooks

Translation hooks provide internationalization and AI-powered text translation.

## useTranslation

**File**: `packages/app/src/hooks/useTranslation.ts`

```typescript
type TargetLang = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es';

export const LANG_LABELS: Record<TargetLang, string> = {
  zh: '中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español',
};

export interface TranslationResult {
  translated: string;
  sourceLang?: string;
}

function useTranslation(
  aiKey: string,
  aiBaseUrl: string,
  aiModel?: string,           // default 'deepseek-v4-flash'
  targetLang?: TargetLang,    // default 'zh'
  initialMode?: 'simple' | 'json'  // default 'simple'
): {
  translate: (text: string, overrideLang?: TargetLang) => Promise<TranslationResult>;
  loading: boolean;
  cache: Map<string, TranslationResult>;
  lang: TargetLang;
  setLang: (l: TargetLang) => void;
  mode: 'simple' | 'json';
  setMode: (m: 'simple' | 'json') => void;
  LANG_LABELS: Record<TargetLang, string>;
}
```

**Dual-mode behavior**: `simple` mode returns plain translated text. `json` mode uses `response_format: "json_object"` and returns `{translated, source_lang}` with automatic source language detection.

**Retry logic** (in `translateText()` at core level): Up to 3 retries with exponential backoff (800ms base) on empty content, missing `translated` field, or JSON parse failures.

## useI18n

**File**: `packages/app/src/i18n/useI18n.ts`

```typescript
function useI18n(initialLocale?: Locale): {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: Locale;
  setLocale: (l: Locale) => void;
  availableLocales: Locale[];
  localeLabels: Record<Locale, string>;
}
```
