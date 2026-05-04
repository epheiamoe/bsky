import React, { useState, useEffect } from 'react';
import { useI18n } from '@bsky/app';
import type { WidgetProps, WidgetContext } from '@bsky/app';
import type { FeedGeneratorView } from '@bsky/core';
import { Icon } from '../Icon.js';

export function SuggestedFeedsWidget({ onClose, context }: WidgetProps) {
  const { t } = useI18n();
  const client = (context as WidgetContext)?.client;
  const [feeds, setFeeds] = useState<FeedGeneratorView[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<Set<string>>(new Set());
  const [joined, setJoined] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!client) { setLoading(false); return; }
    (async () => {
      try {
        const resp = await client.getPopularFeedGenerators(8);
        setFeeds(resp.feeds);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [client]);

  const handleSubscribe = async (f: FeedGeneratorView) => {
    if (!client) return;
    setJoining(prev => new Set(prev).add(f.uri));
    try {
      const { addFeed } = await import('@bsky/app');
      addFeed(f.uri, f.displayName);
      setJoined(prev => new Set(prev).add(f.uri));
    } catch { /* ignore */ }
    setJoining(prev => { const s = new Set(prev); s.delete(f.uri); return s; });
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">{t('widget.suggestedFeeds')}</h3>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-0.5">
          <Icon name="x" size={14} />
        </button>
      </div>
      {loading && <p className="text-text-secondary text-xs">{t('status.loading')}</p>}
      {!loading && feeds.length === 0 && (
        <p className="text-text-secondary text-xs">{t('widget.noSuggestions')}</p>
      )}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {feeds.map(f => {
          const isJoined = joined.has(f.uri) || f.viewer?.like;
          const isJoining = joining.has(f.uri);
          return (
            <div key={f.uri} className="flex items-center gap-2 py-1">
              <div className="w-8 h-8 rounded-lg bg-surface flex-shrink-0 overflow-hidden">
                {f.avatar ? (
                  <img src={f.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-xs text-text-secondary">#</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-xs truncate">{f.displayName}</p>
                <p className="text-text-secondary text-[10px] truncate">{f.likeCount != null ? `${f.likeCount} likes` : ''}</p>
              </div>
              {isJoined ? (
                <span className="text-green-500 text-[10px] whitespace-nowrap">Subscribed</span>
              ) : (
                <button
                  onClick={() => handleSubscribe(f)}
                  disabled={isJoining}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {isJoining ? '...' : 'Subscribe'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SuggestedFeedsWidget;
