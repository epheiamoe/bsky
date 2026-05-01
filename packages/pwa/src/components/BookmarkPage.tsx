import React from 'react';
import type { BskyClient } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useBookmarks, useI18n } from '@bsky/app';
import { PostCard } from './PostCard.js';

interface BookmarkPageProps {
  client: BskyClient;
  goBack: () => void;
  goTo: (v: AppView) => void;
}

export function BookmarkPage({ client, goBack, goTo }: BookmarkPageProps) {
  const { t } = useI18n();
  const { bookmarks, loading, removeBookmark, refresh } = useBookmarks(client);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A]">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="text-text-secondary hover:text-text-primary transition-colors text-lg"
          >
            ←
          </button>
          <h1 className="text-text-primary font-semibold text-lg">🔖 {t('bookmarks.title')}</h1>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-primary hover:text-primary-hover disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {t('action.refresh')}
        </button>
      </div>

      {loading && bookmarks.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : bookmarks.length > 0 ? (
        <div>
          {bookmarks.map((post) => (
            <div key={post.uri} className="relative group">
              <PostCard
                post={post}
                onClick={() => goTo({ type: 'thread', uri: post.uri })}
                goTo={goTo}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeBookmark(post.uri);
                }}
                className="absolute top-2 right-3 w-7 h-7 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-red-500 hover:border-red-300 transition-colors text-xs"
                title={t('action.removeBookmark')}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <p className="text-text-secondary text-sm">{t('bookmarks.empty')}</p>
        </div>
      )}
    </div>
  );
}
