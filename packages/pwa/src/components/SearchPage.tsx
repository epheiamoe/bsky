import React, { useState, useEffect, useRef, useContext } from 'react';
import { useSearch, useI18n, addFeed, useSearchHistory, addToHistory, useVirtualizedList, useModerationBatch } from '@bsky/app';
import { getFeedLabel, type FeedGeneratorView } from '@bsky/core';
import type { SearchTab } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { Icon } from './Icon.js';
import type { AppView } from '@bsky/app';
import { PostPreviewCard } from './PostPreviewCard.js';
import { PostActionsRow } from './PostActionsRow.js';
import { truncateName } from './PostCard.js';
import { MobileHeaderCtx } from './Layout.js';
import { PullToRefresh } from './PullToRefresh.js';
import { useModerationConfig } from '../hooks/useModerationConfig.js';
import { LabelerFailureBanner } from './LabelerFailureBanner.js';
import { LabelerFailureToast } from './LabelerFailureToast.js';

interface SearchPageProps {
  client: BskyClient;
  initialQuery?: string;
  initialTab?: SearchTab;
  goBack: () => void;
  goTo: (v: AppView) => void;
  initialScrollTop?: number;
  onScrollTopChange?: (top: number) => void;
  imageDescConfig?: import('@bsky/core').AIConfig;
  imageDescLang?: string;
  singleImageFill?: boolean;
  previewLines?: number;
  quotedPreviewLines?: number;
}

const TABS: { key: SearchTab; labelKey: string }[] = [
  { key: 'top', labelKey: 'search.tabTop' },
  { key: 'latest', labelKey: 'search.tabLatest' },
  { key: 'users', labelKey: 'search.tabUsers' },
  { key: 'feeds', labelKey: 'search.tabFeeds' },
];

function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function SearchPage({ client, initialQuery, initialTab, goBack, goTo, initialScrollTop, onScrollTopChange, imageDescConfig, imageDescLang, singleImageFill, previewLines = 10, quotedPreviewLines = 8 }: SearchPageProps) {
  const { t } = useI18n();
  const { onSidebarOpen, dmCount } = useContext(MobileHeaderCtx);
  const { config } = useModerationConfig();
  const { tab, posts, users, feeds, loading, search, setTab } = useSearch(client, initialTab, initialQuery);
  const { decisions, failedLabelers } = useModerationBatch(posts, config, client);
  const [dismissedDids, setDismissedDids] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentDids = new Set(failedLabelers.map(f => f.did));
    setDismissedDids(prev => {
      const next = new Set(prev);
      for (const did of prev) {
        if (!currentDids.has(did)) next.delete(did);
      }
      return next;
    });
  }, [failedLabelers]);

  const [input, setInput] = useState(initialQuery ?? '');
  const [searched, setSearched] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const { history, add, remove, clear } = useSearchHistory(tab);
  const hasHistory = history.length > 0;

  const isPostsTab = tab === 'top' || tab === 'latest';
  const items: any[] = isPostsTab ? posts : tab === 'users' ? users : feeds;
  const itemHeight = isPostsTab ? 120 : 60;
  const getItemKey = (item: any) => item.uri ?? item.did;

  const { scrollRef, virtualizer, measureAndCache } = useVirtualizedList(
    items, `search-${input}`, itemHeight, getItemKey, { initialScrollTop, onScrollTopChange, decisions },
  );

  // Sync searched state with items availability (e.g. from cache-restored search)
  useEffect(() => {
    if (items.length > 0) setSearched(true);
  }, [items.length > 0]);

  const handleSearch = () => {
    if (!input.trim()) return;
    setSearched(true);
    add(input.trim());
    search(input.trim(), tab);
    goTo({ type: 'search', query: input.trim(), searchTab: tab });
  };

  const handleTabSwitch = (t: SearchTab) => {
    setTab(t);
    if (input.trim()) {
      search(input.trim(), t);
      goTo({ type: 'search', query: input.trim(), searchTab: t });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleFeedSubscribe = (feed: FeedGeneratorView) => {
    addFeed(feed.uri, feed.displayName);
  };

  return (
    <div className="flex flex-col h-dvh md:h-[calc(100dvh-3rem)] bg-background animate-fadeIn">
      <div className="flex-shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={onSidebarOpen} className="md:hidden text-text-secondary hover:text-text-primary transition-colors p-1 -ml-1 text-lg leading-none relative" aria-label={t('nav.menu')}><Icon name="menu" size={20} />{dmCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />}</button>
        <button onClick={goBack} className="text-text-secondary hover:text-text-primary transition-colors text-lg shrink-0" aria-label={t('a11y.back')}><Icon name="arrow-big-left" size={20} /></button>
        <h1 className="text-text-primary font-semibold text-lg"><Icon name="compass" size={18} /> {t('search.title')}</h1>
      </div>

      <div className="flex-shrink-0 px-4 py-3 flex gap-2">
        <div className="flex-1">
          <input
            type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown} placeholder={t('search.placeholder')} autoFocus
            onFocus={() => setInputFocused(true)}
            onBlur={() => setTimeout(() => setInputFocused(false), 200)}
            className="w-full px-4 py-2 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <button onClick={handleSearch} disabled={!input.trim() || loading}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-semibold text-sm disabled:opacity-50 transition-colors shrink-0"
        >
          {t('nav.search')}
        </button>
      </div>

      <div className="flex-shrink-0 flex border-b border-border">
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => handleTabSwitch(tb.key)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === tb.key ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {(() => {
        const visibleFailures = failedLabelers.filter(f => !dismissedDids.has(f.did));
        const bannerFailures = visibleFailures.filter(f => f.behavior === 'banner' || f.behavior === 'block');
        return (
          <>
            <LabelerFailureBanner
              failedLabelers={bannerFailures}
              onDismiss={(did) => setDismissedDids(prev => new Set(prev).add(did))}
            />
            <LabelerFailureToast failedLabelers={failedLabelers} />
          </>
        );
      })()}

      {inputFocused && !input && hasHistory && !searched && (
        <div className="flex-shrink-0 mx-4 my-2 rounded-lg border border-border bg-surface shadow-lg max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
            <span className="text-[10px] text-text-secondary font-medium uppercase tracking-wider">{t('search.history')}</span>
            <button onClick={() => clear()}
              className="text-[10px] text-red-500 hover:text-red-400 transition-colors"
            >
              {t('search.clearAll')}
            </button>
          </div>
          {history.map((q, i) => (
            <div key={`${q}-${i}`} className="flex items-center gap-2 px-3 py-2 hover:bg-surface/80 cursor-pointer group"
              onMouseDown={(e) => { e.preventDefault(); setInput(q); addToHistory(tab, q); search(q, tab); setSearched(true); goTo({ type: 'search', query: q, searchTab: tab }); }}
            >
              <Icon name="clock" size={14} className="text-text-secondary/50 shrink-0" />
              <span className="flex-1 text-sm text-text-primary truncate">{q}</span>
              <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(q); }}
                className="text-text-secondary/50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-12 flex-1">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length > 0 ? (
        <>
          <PullToRefresh onRefresh={() => search(input, tab)} scrollRef={scrollRef} />
          <div ref={scrollRef} role="list" className="flex-1 overflow-y-auto pb-14">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const item = items[vi.index]!;
              const key = item.uri ?? item.did;
              return (
                <div
                  key={key}
                  data-index={vi.index}
            role="listitem"
                  ref={(el) => measureAndCache(el, item)}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%',
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  {isPostsTab ? (
              <PostPreviewCard post={item}
                onClick={() => goTo({ type: 'thread', uri: item.uri })} goTo={goTo}
                  imageDescConfig={imageDescConfig}
                  imageDescLang={imageDescLang}
                  singleImageFill={singleImageFill}
                client={client}
                previewLines={previewLines}
                quotedPreviewLines={quotedPreviewLines}
                moderationDecision={decisions.get(item.uri) ?? null}
              >
                      <PostActionsRow client={client} goTo={goTo} post={item} />
                    </PostPreviewCard>
                  ) : tab === 'users' ? (
                    <div className="px-4 py-3 border-b border-border cursor-pointer hover:bg-surface transition-colors"
                      onClick={() => goTo({ type: 'profile', actor: item.handle })}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                          {item.avatar ? <img src={item.avatar} alt="" className="w-full h-full object-cover" /> : avatarLetter(item.displayName ?? item.handle)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">{truncateName(item.displayName ?? item.handle)}</p>
                          <p className="text-xs text-text-secondary">@{item.handle}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3 border-b border-border">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1 cursor-pointer hover:bg-surface transition-colors rounded-lg -ml-2 pl-2"
                          onClick={() => goTo({ type: 'feed', feedUri: item.uri })}>
                          <p className="text-sm font-semibold text-text-primary">{item.displayName}</p>
                          {item.creator && <p className="text-xs text-text-secondary">@{item.creator.handle}</p>}
                          {item.description && <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{item.description}</p>}
                        </div>
                        <button onClick={() => handleFeedSubscribe(item)}
                          className="text-xs px-3 py-1 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors shrink-0 ml-3">
                          {t('feed.subscribe')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </>
      ) : searched ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 flex-1">
          <p className="text-text-secondary text-sm">{t('search.noResults')}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4 flex-1">
          <p className="text-text-secondary text-sm">{t('search.startTyping')}</p>
        </div>
      )}
    </div>
  );
}
