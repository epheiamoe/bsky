import { useState, useCallback } from 'react';

export type TargetLang = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es';

const LANG_LABELS: Record<TargetLang, string> = {
  zh: '中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español',
};

const LANG_PROMPTS: Record<TargetLang, string> = {
  zh: '将以下文本翻译成中文。保持原意，仅输出翻译结果，不做任何解释。',
  en: 'Translate the following text to English. Keep the original meaning, output only the translation, no explanations.',
  ja: '以下のテキストを日本語に翻訳してください。原文の意味を保ち、翻訳結果のみを出力し、説明は不要です。',
  ko: '다음 텍스트를 한국어로 번역하세요. 원래 의미를 유지하고 번역 결과만 출력하며 설명은 하지 마세요.',
  fr: 'Traduisez le texte suivant en français. Gardez le sens original, ne produisez que la traduction, pas d\'explications.',
  de: 'Übersetzen Sie den folgenden Text ins Deutsche. Behalten Sie die ursprüngliche Bedeutung bei, geben Sie nur die Übersetzung aus, keine Erklärungen.',
  es: 'Traduce el siguiente texto al español. Mantén el significado original, solo genera la traducción, sin explicaciones.',
};

export function useTranslation(
  aiKey: string,
  aiBaseUrl: string,
  aiModel = 'deepseek-chat',
  targetLang: TargetLang = 'zh',
) {
  // Cache keyed by (text + targetLang)
  const [cache] = useState(() => new Map<string, string>());
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<TargetLang>(targetLang);

  const translate = useCallback(async (text: string, overrideLang?: TargetLang): Promise<string> => {
    const l = overrideLang ?? lang;
    const cacheKey = `${l}::${text}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    setLoading(true);
    try {
      const res = await fetch(`${aiBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: 'system', content: LANG_PROMPTS[l] },
            { role: 'user', content: text },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });
      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      const result = data.choices[0]?.message?.content ?? '';
      cache.set(cacheKey, result);
      return result;
    } finally {
      setLoading(false);
    }
  }, [cache, aiKey, aiBaseUrl, aiModel, lang]);

  return { translate, loading, cache, lang, setLang, LANG_LABELS };
}
