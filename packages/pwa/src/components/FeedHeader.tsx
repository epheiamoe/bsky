import React, { useState } from 'react';
import { useI18n, getFeedConfig, addFeed, setDefaultFeed, removeFeed } from '@bsky/app';
import { getFeedLabel, RECOMMENDED_FEEDS } from '@bsky/core';
import type { AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

interface FeedHeaderProps {
  goTo: (v: AppView) => void;
  currentFeedUri?: string;
  refresh?: () => Promise<void>;
  client?: BskyClient | null;
}

export function FeedHeader({ goTo, currentFeedUri, refresh, client }: FeedHeaderProps) {
  const { t } = useI18n();
  const [showMenu, setShowMenu] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [feeds, setFeeds] = useState(() => getFeedConfig().feeds);
  const [config, setConfig] = useState(() => getFeedConfig());

  const switchFeed = (uri: string) => {
    goTo({ type: 'feed', feedUri: uri });
    setShowMenu(false);
  };

  const refreshFeeds = () => {
    const cfg = getFeedConfig();
    setFeeds(cfg.feeds);
    setConfig(cfg);
  };

  const currentLabel = currentFeedUri ? getFeedLabel(currentFeedUri) : '📋 ' + t('nav.feed');

  return (
    <>
      <div className="sticky top-0 z-10 bg-white dark:bg-[#0A0A0A] px-4 py-3 flex items-center justify-between border-b border-border flex-shrink-0 gap-2">
        <div className="relative inline-flex items-center gap-1">
          <span className="text-lg font-bold text-text-primary">{currentLabel}</span>
          <button
            onClick={() => { setShowMenu(!showMenu); refreshFeeds(); }}
            className="text-text-secondary hover:text-text-primary text-lg leading-none p-0.5"
            title={t('feed.switchFeed')}
          >
            ▾
          </button>
          {showMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1a1a2e] border border-border rounded-lg shadow-lg z-30 py-1 min-w-[200px] max-h-[60vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { goTo({ type: 'feed' }); setShowMenu(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors ${!currentFeedUri ? 'text-primary font-medium' : 'text-text-primary'}`}
              >
                📋 {t('nav.feed')}
              </button>
              {feeds.map(f => (
                <button
                  key={f.uri}
                  onClick={() => switchFeed(f.uri)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors ${currentFeedUri === f.uri ? 'text-primary font-medium' : 'text-text-primary'}`}
                >
                  {f.label}
                </button>
              ))}
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={() => { setShowMenu(false); setShowConfig(true); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-surface transition-colors"
                >
                  ⚙️ {t('feed.configureFeeds')}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="rounded-full bg-surface hover:bg-primary/10 text-text-primary text-sm px-4 py-1.5 transition-colors"
          >
            {t('action.refresh')}
          </button>
        </div>
      </div>
      {showConfig && (
        <FeedConfigModal
          onClose={() => { refreshFeeds(); setShowConfig(false); }}
          goTo={goTo}
          client={client}
        />
      )}
      {/* Close menu on outside click */}
      {showMenu && <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />}
    </>
  );
}

function FeedConfigModal({ onClose, goTo, client }: { onClose: () => void; goTo: (v: AppView) => void; client?: BskyClient | null }) {
  const { t } = useI18n();
  const [config, setConfig] = useState(() => getFeedConfig());
  const [customUri, setCustomUri] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const trimmed = customUri.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const updated = addFeed(trimmed, getFeedLabel(trimmed));
      setConfig(updated);
      setCustomUri('');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = (uri: string) => {
    const updated = removeFeed(uri);
    setConfig(updated);
  };

  const handleSetDefault = (uri: string | null) => {
    const updated = setDefaultFeed(uri);
    setConfig(updated);
  };

  const handleUse = (uri: string) => {
    goTo({ type: 'feed', feedUri: uri });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#121212] rounded-xl shadow-xl border border-border w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">{t('feed.configureFeeds')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-xl leading-none p-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <p className="text-xs text-text-secondary mb-2">{t('feed.defaultFeed')}</p>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => handleSetDefault(null)}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${config.defaultFeedUri === null ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}
              >
                📋 {t('nav.feed')}
              </button>
              {config.feeds.map(f => (
                <button
                  key={f.uri}
                  onClick={() => handleSetDefault(f.uri)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${config.defaultFeedUri === f.uri ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-text-secondary mb-2">{t('feed.yourFeeds')}</p>
            {config.feeds.length === 0 && (
              <p className="text-text-secondary text-sm py-2">{t('feed.noCustomFeeds')}</p>
            )}
            {config.feeds.map(f => (
              <div key={f.uri} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                <span className="flex-1 text-sm text-text-primary truncate">{f.label}</span>
                <button onClick={() => handleUse(f.uri)} className="text-xs text-primary hover:underline">{t('action.open')}</button>
                <button onClick={() => handleRemove(f.uri)} className="text-xs text-red-400 hover:text-red-500">✕</button>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs text-text-secondary mb-2">{t('feed.addCustomFeed')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customUri}
                onChange={e => setCustomUri(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !adding && handleAdd()}
                placeholder="at://did:plc:.../app.bsky.feed.generator/..."
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleAdd}
                disabled={adding || !customUri.trim()}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {adding ? '...' : t('action.add')}
              </button>
            </div>
          </div>

          {RECOMMENDED_FEEDS.length > 0 && !config.feeds.some(f => RECOMMENDED_FEEDS.some(r => r.uri === f.uri)) && (
            <div>
              <p className="text-xs text-text-secondary mb-2">{t('feed.recommended')}</p>
              {RECOMMENDED_FEEDS.map(f => (
                <div key={f.uri} className="flex items-center gap-2 py-1 text-sm">
                  <span className="flex-1">{f.label}</span>
                  <button onClick={() => { const u = addFeed(f.uri, f.label); setConfig(u); }} className="text-xs text-primary hover:underline">+ {t('action.add')}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { FeedConfigModal };
