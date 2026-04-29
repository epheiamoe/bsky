import React from 'react';
import type { PostView } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { PostCard } from './PostCard';

interface FeedTimelineProps {
  goTo: (v: AppView) => void;
  posts: PostView[];
  loading: boolean;
  cursor?: string;
  error: string | null;
  loadMore?: () => Promise<void>;
  refresh?: () => Promise<void>;
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-lg border border-border p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-border" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-border rounded w-1/3" />
          <div className="h-3 bg-border rounded w-full" />
          <div className="h-3 bg-border rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function FeedTimeline({ goTo, posts, loading, cursor, error, loadMore, refresh }: FeedTimelineProps) {

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 bg-white dark:bg-[#0A0A0A] px-4 py-3 flex items-center justify-between border-b border-border">
        <h1 className="text-lg font-bold text-text-primary">📋 时间线</h1>
        <button
          onClick={refresh}
          className="rounded-full bg-surface hover:bg-primary/10 text-text-primary text-sm px-4 py-1.5 transition-colors"
        >
          刷新
        </button>
      </div>

      <div className="flex-1">
        {error && (
          <div className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading && posts.length === 0 && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
            <span className="text-4xl mb-3">🕊️</span>
            <p className="text-sm">没有帖子</p>
          </div>
        )}

        {posts.map((post) => (
          <PostCard
            key={post.uri}
            post={post}
            onClick={() => goTo({ type: 'thread', uri: post.uri })}
          />
        ))}

        {cursor && (
          <div className="flex justify-center py-4">
            <button
              onClick={loadMore}
              disabled={loading}
              className="rounded-full bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-6 py-2 disabled:opacity-50 transition-colors"
            >
              {loading ? '加载中…' : '加载更多'}
            </button>
          </div>
        )}

        {posts.length > 0 && (
          <p className="text-center text-text-secondary text-xs py-4">
            已加载 {posts.length} 条帖子
          </p>
        )}
      </div>
    </div>
  );
}
