import React, { useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PostView } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useI18n } from '@bsky/app';
import { PostCard } from './PostCard';
import { FeedHeader } from './FeedHeader';
import type { BskyClient } from '@bsky/core';

interface FeedTimelineProps {
  goTo: (v: AppView) => void;
  posts: PostView[];
  loading: boolean;
  cursor?: string;
  error: string | null;
  loadMore?: () => Promise<void>;
  refresh?: () => Promise<void>;
  initialScrollIndex?: number;
  onFirstVisibleIndexChange?: (index: number) => void;
  feedUri?: string;
  client?: BskyClient | null;
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

const ESTIMATED_POST_HEIGHT = 120; // px — rough estimate per post card

export function FeedTimeline({ goTo, posts, loading, cursor, error, loadMore, refresh, initialScrollIndex, onFirstVisibleIndexChange, feedUri, client }: FeedTimelineProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastReportedRef = useRef(-1);

  // ── Virtual scroll ──
  const virtualizer = useVirtualizer({
    count: loading && posts.length === 0 ? 5 : posts.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_POST_HEIGHT,
    overscan: 5,
  });

  // ── Scroll position restoration (on mount, after navigating back) ──
  useEffect(() => {
    if (initialScrollIndex !== undefined && initialScrollIndex > 0 && posts.length > 0) {
      const target = Math.min(initialScrollIndex, posts.length - 1);
      const raf = requestAnimationFrame(() => {
        virtualizer.scrollToIndex(target, { align: 'start' });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, []); // Only on mount

  // ── Report first visible index to parent ──
  const reportVisibleIndex = useCallback(() => {
    if (!onFirstVisibleIndexChange) return;
    const items = virtualizer.getVirtualItems();
    if (items.length === 0) return;
    const idx = items[0]!.index;
    if (idx !== lastReportedRef.current) {
      lastReportedRef.current = idx;
      onFirstVisibleIndexChange(idx);
    }
  }, [virtualizer, onFirstVisibleIndexChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', reportVisibleIndex, { passive: true });
    // Report initial position after virtualizer has items
    const raf = requestAnimationFrame(reportVisibleIndex);
    return () => {
      el.removeEventListener('scroll', reportVisibleIndex);
      cancelAnimationFrame(raf);
    };
  }, [reportVisibleIndex]);

  // ── Auto-load-more sentinel ──
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !loadMore || !cursor) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) loadMore(); },
      { root: scrollRef.current, rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, cursor, posts.length]);

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <FeedHeader
        goTo={goTo}
        currentFeedUri={feedUri}
        refresh={refresh}
        client={client}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
            <p className="text-sm">{t('status.noPosts')}</p>
          </div>
        )}

        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const post = posts[virtualItem.index];
            if (!post) return null;
            return (
              <div
                key={post.uri}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
              >
                <PostCard
                  post={post}
                  onClick={() => goTo({ type: 'thread', uri: post.uri })}
                  goTo={goTo}
                />
              </div>
            );
          })}
        </div>

        {/* Auto-load sentinel */}
        <div ref={sentinelRef} className="h-px" />

        {cursor && (
          <div className="flex justify-center py-4">
            <button
              onClick={loadMore}
              disabled={loading}
              className="rounded-full bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-6 py-2 disabled:opacity-50 transition-colors"
            >
              {loading ? t('action.loading') : t('action.loadMore')}
            </button>
          </div>
        )}

        {posts.length > 0 && (
          <p className="text-center text-text-secondary text-xs py-4">
            {t('post.postsCount', { n: posts.length })}
          </p>
        )}
      </div>
    </div>
  );
}
