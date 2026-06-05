import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n, getFeedConfig, addFeed, setDefaultFeed, removeFeed, useSubscribedLists } from '@bsky/app';
import { getFeedLabel, RECOMMENDED_FEEDS, BUILTIN_FEEDS } from '@bsky/core';
import type { AppView } from '@bsky/app';
import type { BskyClient, FeedGeneratorView } from '@bsky/core';
import { Icon } from './Icon.js';

interface FeedHeaderProps {
  goTo: (v: AppView) => void;
  currentFeedUri?: string;
  refresh?: () => Promise<void>;
  client?: BskyClient | null;
  mobileMenuButton?: React.ReactNode;
  mobileCollapsed?: boolean;
}

type TabItem =
  | { type: 'feed'; uri: string; label: string }
  | { type: 'list'; uri: string; label: string };

const LIST_ITEM_HEIGHT = 44; // px — approximate row height for max-height math
const LIST_MAX_VH = 0.45;    // cap vertical list at 45% viewport height

export function FeedHeader({ goTo, currentFeedUri, refresh, client, mobileMenuButton, mobileCollapsed }: FeedHeaderProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [feeds, setFeeds] = useState(() => getFeedConfig().feeds);
  const [config, setConfig] = useState(() => getFeedConfig());
  const { lists: subscribedLists, loading: listsLoading, unsubscribe } = useSubscribedLists(client ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Treat default timeline as Following so the active tab is always highlighted.
  const effectiveFeedUri = currentFeedUri ?? BUILTIN_FEEDS.following;

  const feedTabs: TabItem[] = feeds.map(f => ({ type: 'feed', uri: f.uri, label: f.label }));
  const listTabs: TabItem[] = subscribedLists.map(l => ({ type: 'list', uri: l.uri, label: l.name }));
  const allTabs: TabItem[] = [...feedTabs, ...listTabs];

  const isCurrent = (tab: TabItem) => tab.type === 'feed' && tab.uri === effectiveFeedUri;
  const currentTab = allTabs.find(isCurrent);

  // Collapse expanded list on outside click.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const root = document.getElementById('feed-header-root');
      if (root && !root.contains(target)) setExpanded(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [expanded]);

  // Scroll active tab into view when feed changes or on mount.
  useEffect(() => {
    if (expanded || !currentTab) return;
    const btn = tabRefs.current.get(currentTab.uri);
    if (btn) {
      btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [currentTab, expanded]);

  // Collapse on Escape.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const handleTabClick = (tab: TabItem) => {
    if (isCurrent(tab)) {
      setExpanded(true);
    } else if (tab.type === 'feed') {
      goTo({ type: 'feed', feedUri: tab.uri });
    } else {
      goTo({ type: 'listDetail', uri: tab.uri });
    }
  };

  const handleItemClick = (tab: TabItem) => {
    if (tab.type === 'feed') {
      goTo({ type: 'feed', feedUri: tab.uri });
    } else {
      goTo({ type: 'listDetail', uri: tab.uri });
    }
    setExpanded(false);
  };

  const refreshFeeds = () => {
    const cfg = getFeedConfig();
    setFeeds(cfg.feeds);
    setConfig(cfg);
  };

  // Dynamic max-height: grows with item count, caps at 45vh so it never dominates screen.
  const itemCount = allTabs.length || 1;
  const listMaxHeight = Math.min(
    itemCount * LIST_ITEM_HEIGHT + 16,
    typeof window !== 'undefined' ? window.innerHeight * LIST_MAX_VH : 420,
  );

  // Auto-collapse header on scroll-down is disabled while the selector is open.
  const headerHidden = (mobileCollapsed ?? false) && !expanded;

  return (
    <>
      <div
        id="feed-header-root"
        className={`transition-all duration-300 ease-out overflow-hidden md:!overflow-visible md:!max-h-none md:!transform-none ${
          headerHidden ? 'max-h-0 -translate-y-full' : 'max-h-[unset]'
        }`}
      >
        <div className="sticky top-0 z-10 bg-background border-b border-border flex-shrink-0">
          {/* Top bar */}
          <div className="flex items-center h-12 px-2 gap-1">
            {/* Left: mobile menu button */}
            {mobileMenuButton && <div className="flex-shrink-0">{mobileMenuButton}</div>}

            {/* Middle: horizontal tabs or back+title */}
            <div className="flex-1 min-w-0 overflow-hidden relative h-12">
              <AnimatePresence mode="wait" initial={false}>
                {!expanded ? (
                  <motion.div
                    key="tabs"
                    ref={scrollRef}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute inset-0 flex items-center gap-1 overflow-x-auto scrollbar-none"
                    role="tablist"
                    aria-label={t('feed.switchFeed')}
                  >
                    {allTabs.map(tab => {
                      const active = isCurrent(tab);
                      return (
                        <button
                          key={`${tab.type}-${tab.uri}`}
                          ref={el => {
                            if (el) tabRefs.current.set(tab.uri, el);
                            else tabRefs.current.delete(tab.uri);
                          }}
                          onClick={() => handleTabClick(tab)}
                          role="tab"
                          aria-selected={active}
                          className={`flex-shrink-0 px-3 py-1.5 text-sm font-medium transition-colors relative rounded-md flex items-center gap-1 ${
                            active
                              ? 'text-primary'
                              : 'text-text-secondary hover:text-text-primary hover:bg-surface'
                          }`}
                        >
                          {tab.type === 'list' && (
                            <Icon name="list" size={12} className="text-text-secondary/60" />
                          )}
                          <span className="truncate max-w-[120px]">{tab.label}</span>
                          {active && (
                            <span
                              className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.div
                    key="back"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute inset-0 flex items-center px-1"
                  >
                    <button
                      onClick={() => setExpanded(false)}
                      className="flex items-center gap-1 text-text-primary font-medium text-sm hover:bg-surface rounded-md px-2 py-1.5 transition-colors"
                    >
                      <Icon name="arrow-big-left" size={18} />
                      <span>{t('feed.selectFeed')}</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right: refresh + settings icons */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={refresh}
                className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface rounded-full transition-colors"
                aria-label={t('action.refresh')}
                title={t('action.refresh')}
              >
                <Icon name="refresh-cw" size={18} />
              </button>
              <button
                onClick={() => {
                  refreshFeeds();
                  setShowConfig(true);
                }}
                className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface rounded-full transition-colors"
                aria-label={t('feed.configureFeeds')}
                title={t('feed.configureFeeds')}
              >
                <Icon name="settings" size={18} />
              </button>
            </div>
          </div>

          {/* Expanded vertical list */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                className="overflow-hidden border-t border-border bg-background"
              >
                <div
                  className="overflow-y-auto scrollbar-none py-2 space-y-0.5"
                  style={{ maxHeight: listMaxHeight }}
                >
                  {feedTabs.length > 0 && (
                    <div role="group" aria-label={t('feed.yourFeeds')}>
                      {feedTabs.map(tab => {
                        const active = isCurrent(tab);
                        return (
                          <button
                            key={`expand-${tab.type}-${tab.uri}`}
                            onClick={() => handleItemClick(tab)}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors rounded-md mx-1 ${
                              active
                                ? 'text-primary bg-primary/[0.06]'
                                : 'text-text-primary hover:bg-surface'
                            }`}
                            aria-current={active ? 'true' : undefined}
                            style={{ width: 'calc(100% - 0.5rem)' }}
                          >
                            <span
                              className={`w-1 h-5 rounded-full ${active ? 'bg-primary' : 'bg-transparent'}`}
                              aria-hidden="true"
                            />
                            <span className="flex-1 truncate">{tab.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {listTabs.length > 0 && (
                    <>
                      {feedTabs.length > 0 && <div className="border-t border-border my-1 mx-4" role="separator" />}
                      <div role="group" aria-label={t('feed.subscribedLists')}>
                        {listTabs.map(tab => {
                          const active = isCurrent(tab);
                          return (
                            <button
                              key={`expand-${tab.type}-${tab.uri}`}
                              onClick={() => handleItemClick(tab)}
                              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors rounded-md mx-1 ${
                                active
                                  ? 'text-primary bg-primary/[0.06]'
                                  : 'text-text-primary hover:bg-surface'
                              }`}
                              aria-current={active ? 'true' : undefined}
                              style={{ width: 'calc(100% - 0.5rem)' }}
                            >
                              <span
                                className={`w-1 h-5 rounded-full ${active ? 'bg-primary' : 'bg-transparent'}`}
                                aria-hidden="true"
                              />
                              <Icon name="list" size={14} className="text-text-secondary/60 flex-shrink-0" />
                              <span className="flex-1 truncate">{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {showConfig && (
        <FeedConfigModal
          onClose={() => {
            refreshFeeds();
            setShowConfig(false);
          }}
          goTo={goTo}
          client={client}
          subscribedLists={subscribedLists}
          listsLoading={listsLoading}
          onUnsubscribe={unsubscribe}
        />
      )}
    </>
  );
}

function FeedConfigModal({
  onClose,
  goTo,
  client,
  subscribedLists,
  listsLoading,
  onUnsubscribe,
}: {
  onClose: () => void;
  goTo: (v: AppView) => void;
  client?: BskyClient | null;
  subscribedLists: Array<{ uri: string; name: string }>;
  listsLoading: boolean;
  onUnsubscribe: (uri: string) => boolean;
}) {
  const { t } = useI18n();
  const [config, setConfig] = useState(() => getFeedConfig());
  const [customUri, setCustomUri] = useState('');
  const [adding, setAdding] = useState(false);
  const [suggestedFeeds, setSuggestedFeeds] = useState<FeedGeneratorView[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);

  useEffect(() => {
    if (client) {
      setLoadingSuggested(true);
      client
        .getSuggestedFeeds(20)
        .then(res => {
          setSuggestedFeeds(res.feeds);
        })
        .catch(() => {})
        .finally(() => setLoadingSuggested(false));
    }
  }, [client]);

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

  const handleUnsubscribeList = async (uri: string) => {
    await onUnsubscribe(uri);
  };

  const handleOpenList = (uri: string) => {
    goTo({ type: 'listDetail', uri });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#121212] rounded-xl shadow-xl border border-border w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">{t('feed.configureFeeds')}</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-xl leading-none p-1"
            aria-label={t('a11y.close')}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <p className="text-xs text-text-secondary mb-2">{t('feed.defaultFeed')}</p>
            <div className="flex flex-wrap gap-1">
              {config.feeds.map(f => (
                <button
                  key={f.uri}
                  onClick={() => handleSetDefault(f.uri)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${
                    config.defaultFeedUri === f.uri ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-border'
                  }`}
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
                <button onClick={() => handleUse(f.uri)} className="text-xs text-primary hover:underline">
                  {t('action.open')}
                </button>
                <button onClick={() => handleRemove(f.uri)} className="text-xs text-red-400 hover:text-red-500">
                  <Icon name="x" size={16} />
                </button>
              </div>
            ))}
          </div>

          {listsLoading && <div className="text-text-secondary text-sm py-2">{t('status.loading')}</div>}
          {!listsLoading && subscribedLists.length > 0 && (
            <div>
              <p className="text-xs text-text-secondary mb-2">{t('feed.subscribedLists')}</p>
              {subscribedLists.map(l => (
                <div key={l.uri} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <span className="flex-1 text-sm text-text-primary truncate">{l.name}</span>
                  <button onClick={() => handleOpenList(l.uri)} className="text-xs text-primary hover:underline">
                    {t('action.open')}
                  </button>
                  <button
                    onClick={() => handleUnsubscribeList(l.uri)}
                    className="text-xs text-red-400 hover:text-red-500"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

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

          {suggestedFeeds.length > 0 && (
            <div>
              <p className="text-xs text-text-secondary mb-2">{t('feed.recommended')}</p>
              {suggestedFeeds.map(f => (
                <div key={f.uri} className="flex items-center gap-2 py-1 text-sm">
                  <span className="flex-1 truncate">{f.displayName}</span>
                  {f.creator && <span className="text-text-secondary text-xs">@{f.creator.handle}</span>}
                  <button
                    onClick={() => {
                      const u = addFeed(f.uri, f.displayName);
                      setConfig(u);
                    }}
                    className="text-xs text-primary hover:underline flex-shrink-0"
                  >
                    + {t('action.add')}
                  </button>
                </div>
              ))}
            </div>
          )}
          {!loadingSuggested && suggestedFeeds.length === 0 && (
            <div>
              <p className="text-xs text-text-secondary mb-2">{t('feed.recommended')}</p>
              <p className="text-text-secondary text-sm py-1">{t('feed.noSuggestedFeeds')}</p>
            </div>
          )}
          {loadingSuggested && <div className="text-text-secondary text-sm py-2">{t('status.loading')}</div>}
        </div>
      </div>
    </div>
  );
}

export { FeedConfigModal };
