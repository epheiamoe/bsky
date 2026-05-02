import React, { useState, useEffect } from 'react';
import { useSearch, useI18n, addFeed, useScrollRestore } from '@bsky/app';
import { getFeedLabel, type FeedGeneratorView } from '@bsky/core';
import type { SearchTab } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { Icon } from './Icon.js';
import type { AppView } from '@bsky/app';
import { PostCard } from './PostCard.js';
import { PostActionsRow } from './PostActionsRow.js';
import { truncateName } from './PostCard.js';

interface SearchPageProps {
  client: BskyClient;
  initialQuery?: string;
  initialTab?: SearchTab;
  goBack: () => void;
  goTo: (v: AppView) => void;
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

export function SearchPage({ client, initialQuery, initialTab, goBack, goTo }: SearchPageProps) {
  const { t } = useI18n();
  const { tab, posts, users, feeds, loading, search, setTab } = useSearch(client, initialTab);
  const [input, setInput] = useState(initialQuery ?? '');
  const [searched, setSearched] = useState(false);

  // Restore scroll position on back navigation (window-level scroll)
  useScrollRestore(searched ? `search-${input}` : undefined, null, searched && !loading);

  useEffect(() => {
    if (initialQuery && !searched) {
      setSearched(true);
      search(initialQuery, 'top');
    }
  }, [initialQuery]);

  const handleSearch = () => {
    if (!input.trim()) return;
    setSearched(true);
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
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A]">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={goBack} className="text-text-secondary hover:text-text-primary transition-colors text-lg shrink-0"><Icon name="arrow-big-left" size={20} /></button>
        <h1 className="text-text-primary font-semibold text-lg"><Icon name="compass" size={18} /> {t('search.title')}</h1>
      </div>

      <div className="px-4 py-3 flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown} placeholder={t('search.placeholder')} autoFocus
            className="w-full px-4 py-2 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <button onClick={handleSearch} disabled={!input.trim() || loading}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-semibold text-sm disabled:opacity-50 transition-colors shrink-0"
        >
          {t('nav.search')}
        </button>
      </div>

      <div className="flex border-b border-border">
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => handleTabSwitch(tb.key)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === tb.key ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Posts tab */}
          {(tab === 'top' || tab === 'latest') && (
            posts.length > 0 ? (
              <div>
                  {posts.map(post => (
                    <PostCard key={post.uri} post={post}
                      onClick={() => goTo({ type: 'thread', uri: post.uri })} goTo={goTo}
                    >
                      <PostActionsRow client={client} goTo={goTo} post={post} />
                    </PostCard>
                  ))}
              </div>
            ) : searched ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <p className="text-text-secondary text-sm">{t('search.noResults')}</p>
              </div>
            ) : null
          )}

          {/* Users tab */}
          {tab === 'users' && (
            users.length > 0 ? (
              <div>
                {users.map(user => (
                  <div key={user.did} className="px-4 py-3 border-b border-border cursor-pointer hover:bg-surface transition-colors"
                    onClick={() => goTo({ type: 'profile', actor: user.handle })}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                        {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : avatarLetter(user.displayName ?? user.handle)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{truncateName(user.displayName ?? user.handle)}</p>
                        <p className="text-xs text-text-secondary">@{user.handle}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : searched ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <p className="text-text-secondary text-sm">{t('search.noResults')}</p>
              </div>
            ) : null
          )}

          {/* Feeds tab */}
          {tab === 'feeds' && (
            feeds.length > 0 ? (
              <div>
                {feeds.map(feed => (
                  <div key={feed.uri} className="px-4 py-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1 cursor-pointer hover:bg-surface transition-colors rounded-lg -ml-2 pl-2"
                        onClick={() => goTo({ type: 'feed', feedUri: feed.uri })}>
                        <p className="text-sm font-semibold text-text-primary">{feed.displayName}</p>
                        {feed.creator && <p className="text-xs text-text-secondary">@{feed.creator.handle}</p>}
                        {feed.description && <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{feed.description}</p>}
                      </div>
                      <button onClick={() => handleFeedSubscribe(feed)}
                        className="text-xs px-3 py-1 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors shrink-0 ml-3">
                        {t('feed.subscribe')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : searched ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <p className="text-text-secondary text-sm">{t('search.noResults')}</p>
              </div>
            ) : null
          )}

          {!searched && (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <p className="text-text-secondary text-sm">{t('search.startTyping')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
