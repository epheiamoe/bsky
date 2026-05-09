import React, { useState, useEffect } from 'react';
import { useI18n, getFeedConfig, addFeed, removeFeed } from '@bsky/app';
import type { WidgetProps, WidgetContext } from '@bsky/app';
import type { FeedGeneratorView } from '@bsky/core';
import { Icon } from '../Icon.js';

export function SuggestedFeedsWidget({ onClose, context }: WidgetProps) {
  const { t } = useI18n();
  const client = (context as WidgetContext)?.client;
  const [feeds, setFeeds] = useState<FeedGeneratorView[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribedUris, setSubscribedUris] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const refreshSubscribed = () => {
    const cfg = getFeedConfig();
    setSubscribedUris(new Set(cfg.feeds.map(f => f.uri)));
  };

  useEffect(() => {
    if (!client) { setLoading(false); return; }
    (async () => {
      try {
        const resp = await client.getPopularFeedGenerators(8);
        setFeeds(resp.feeds);
      } catch { /* ignore */ }
      setLoading(false);
    })();
    refreshSubscribed();
  }, [client]);

  const handleToggle = async (f: FeedGeneratorView) => {
    if (!client) return;
    setToggling(prev => new Set(prev).add(f.uri));
    try {
      if (subscribedUris.has(f.uri)) {
        removeFeed(f.uri);
      } else {
        addFeed(f.uri, f.displayName);
      }
      refreshSubscribed();
    } catch { /* ignore */ }
    setToggling(prev => { const s = new Set(prev); s.delete(f.uri); return s; });
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      {loading && <p className="text-text-secondary text-xs">{t('status.loading')}</p>}
      {!loading && feeds.length === 0 && (
        <p className="text-text-secondary text-xs">{t('widget.noSuggestions')}</p>
      )}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {feeds.map(f => {
          const isSubscribed = subscribedUris.has(f.uri);
          const isToggling = toggling.has(f.uri);
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
              {isSubscribed ? (
                <button
                  onClick={() => handleToggle(f)}
                  disabled={isToggling}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-green-500 text-green-500 hover:bg-green-500/10 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {isToggling ? '...' : t('feed.unsubscribe')}
                </button>
              ) : (
                <button
                  onClick={() => handleToggle(f)}
                  disabled={isToggling}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {isToggling ? '...' : t('feed.subscribe')}
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
