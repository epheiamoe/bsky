import React, { useState, useEffect } from 'react';
import { useI18n } from '@bsky/app';
import type { WidgetProps, WidgetContext, AppView } from '@bsky/app';
import type { ProfileView } from '@bsky/core';
import { Icon } from '../Icon.js';

export function SuggestedFollowsWidget({ onClose, context }: WidgetProps) {
  const { t } = useI18n();
  const client = (context as WidgetContext)?.client;
  const goTo = (context as WidgetContext)?.goTo as ((v: AppView) => void) | undefined;
  const [suggestions, setSuggestions] = useState<ProfileView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!client?.isAuthenticated()) { setLoading(false); return; }
    const did = client.getDID();
    if (!did) { setLoading(false); return; }
    (async () => {
      try {
        const resp = await client.getSuggestedFollows(did);
        setSuggestions(resp.suggestions);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [client]);

  const handleFollow = async (did: string) => {
    if (!client) return;
    try {
      await client.follow(did);
      setFollowing(prev => new Set(prev).add(did));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">{t('widget.suggestedFollows')}</h3>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-0.5">
          <Icon name="x" size={14} />
        </button>
      </div>
      {loading && <p className="text-text-secondary text-xs">{t('status.loading')}</p>}
      {error && <p className="text-red-500 text-xs">{error}</p>}
      {!loading && suggestions.length === 0 && (
        <p className="text-text-secondary text-xs">{t('widget.noSuggestions')}</p>
      )}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {suggestions.slice(0, 8).map(s => (
          <div key={s.did} className="flex items-center gap-2 py-1">
            <button
              onClick={() => goTo?.({ type: 'profile', actor: s.handle })}
              className="w-8 h-8 rounded-full bg-surface flex-shrink-0 overflow-hidden border-0 p-0 cursor-pointer"
            >
              {s.avatar ? (
                <img src={s.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-xs text-text-secondary uppercase">{s.handle[0]}</span>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-xs truncate">{s.displayName || s.handle}</p>
              <p className="text-text-secondary text-[10px] truncate">@{s.handle}</p>
            </div>
            {following.has(s.did) ? (
              <span className="text-green-500 text-[10px] whitespace-nowrap">{t('action.following')}</span>
            ) : (
              <button
                onClick={() => handleFollow(s.did)}
                className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors whitespace-nowrap"
              >
                {t('action.follow')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SuggestedFollowsWidget;
