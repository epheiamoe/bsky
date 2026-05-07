import React, { useState, useEffect } from 'react';
import { useI18n } from '@bsky/app';
import type { WidgetProps, WidgetContext, AppView } from '@bsky/app';
import type { TrendingTopic } from '@bsky/core';
import { Icon } from '../Icon.js';

export function TrendsWidget({ onClose, context }: WidgetProps) {
  const { t } = useI18n();
  const client = (context as WidgetContext)?.client;
  const goTo = (context as WidgetContext)?.goTo as ((v: AppView) => void) | undefined;
  const [trends, setTrends] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client) { setLoading(false); return; }
    (async () => {
      try {
        const resp = await client.getTrends(15);
        setTrends(resp.trends);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [client]);

  const handleClick = (tr: TrendingTopic) => {
    const query = tr.displayName || tr.topic;
    if (goTo && query) {
      goTo({ type: 'search', query, searchTab: 'top' });
    }
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      {loading && <p className="text-text-secondary text-xs">{t('status.loading')}</p>}
      {!loading && trends.length === 0 && (
        <p className="text-text-secondary text-xs">{t('widget.noTrends')}</p>
      )}
      <div className="space-y-0.5 max-h-64 overflow-y-auto">
        {trends.map((tr, i) => (
          <button
            key={tr.topic || i}
            onClick={() => handleClick(tr)}
            className="flex items-center gap-2 py-1 w-full text-left border-0 bg-transparent cursor-pointer hover:bg-surface rounded px-1 transition-colors"
          >
            <span className="text-text-secondary/50 text-xs w-5 text-right">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-xs truncate">{tr.displayName || tr.topic}</p>
              {tr.description && (
                <p className="text-text-secondary text-[10px] truncate">{tr.description}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default TrendsWidget;
