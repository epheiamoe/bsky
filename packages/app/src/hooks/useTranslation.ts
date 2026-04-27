import { useState, useCallback } from 'react';

export function useTranslation(aiKey: string, aiBaseUrl: string, aiModel = 'deepseek-chat') {
  const [cache] = useState(() => new Map<string, string>());
  const [loading, setLoading] = useState(false);

  const translate = useCallback(async (text: string): Promise<string> => {
    const cached = cache.get(text);
    if (cached) return cached;

    setLoading(true);
    try {
      const res = await fetch(`${aiBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: 'system', content: '你是一个专业翻译，将以下文本翻译成中文，保持原意，仅输出翻译结果，不做解释。' },
            { role: 'user', content: text },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });
      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      const result = data.choices[0]?.message?.content ?? '';
      cache.set(text, result);
      return result;
    } finally {
      setLoading(false);
    }
  }, [cache, aiKey, aiBaseUrl, aiModel]);

  return { translate, loading, cache };
}
