import React from 'react';
import type { BskyClient } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useBookmarks, useI18n, useVirtualizedList, useModerationBatch } from '@bsky/app';
import { Icon } from './Icon.js';
import { PostPreviewCard } from './PostPreviewCard.js';
import { PostActionsRow } from './PostActionsRow.js';
import { PullToRefresh } from './PullToRefresh.js';
import { LabelerFailureBanner } from './LabelerFailureBanner.js';
import { LabelerFailureToast } from './LabelerFailureToast.js';
import { useModerationConfig } from '../hooks/useModerationConfig.js';

interface BookmarkPageProps {
  client: BskyClient;
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

export function BookmarkPage({ client, goBack, goTo, initialScrollTop, onScrollTopChange, imageDescConfig, imageDescLang, singleImageFill, previewLines = 10, quotedPreviewLines = 8 }: BookmarkPageProps) {
  const { t } = useI18n();
  const { bookmarks, loading, error, removeBookmark, refresh } = useBookmarks(client);
  const { config } = useModerationConfig();
  const { decisions, failedLabelers } = useModerationBatch(bookmarks, config, client);
  const { scrollRef, virtualizer, measureAndCache } = useVirtualizedList(
    bookmarks, 'bookmarks', 120, p => p.uri, { initialScrollTop, onScrollTopChange },
  );

  const bannerFailures = failedLabelers.filter(f => f.behavior === 'banner' || f.behavior === 'block');

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)] animate-fadeIn">
      <LabelerFailureBanner failedLabelers={bannerFailures} />
      <LabelerFailureToast failedLabelers={failedLabelers} />
      
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label={t('a11y.back')}
          >
            <Icon name="arrow-big-left" size={20} />
          </button>
          <h1 className="text-text-primary font-semibold text-lg">{t('bookmarks.title')}</h1>
        </div>
        <button
          onClick={() => refresh()}
          disabled={loading}
          className="text-primary hover:text-primary-hover disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {t('action.refresh')}
        </button>
      </div>

      {error && (
        <div role="alert" className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && bookmarks.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : bookmarks.length > 0 ? (
        <>
          <PullToRefresh onRefresh={refresh} scrollRef={scrollRef} />
          <div ref={scrollRef} role="list" className="flex-1 overflow-y-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const post = bookmarks[vi.index]!;
              return (
                <div
                  key={post.uri}
                  data-index={vi.index}
                  ref={(el) => measureAndCache(el, post)}
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    transform: `translateY(${vi.start}px)`, width: '100%',
                  }}
            className="relative group"
            role="listitem"
          >
                  <PostPreviewCard
                    post={post}
                    onClick={() => goTo({ type: 'thread', uri: post.uri })}
                    goTo={goTo}
                    imageDescConfig={imageDescConfig}
                    imageDescLang={imageDescLang}
                    singleImageFill={singleImageFill}
                    client={client}
                    previewLines={previewLines}
                    quotedPreviewLines={quotedPreviewLines}
                    moderationDecision={decisions.get(post.uri) ?? null}
                  >
                    <PostActionsRow client={client} goTo={goTo} post={post} />
                  </PostPreviewCard>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBookmark(post.uri);
                    }}
                    className="absolute top-2 right-3 w-7 h-7 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-red-500 hover:border-red-300 transition-colors"
                    title={t('action.removeBookmark')}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <p className="text-text-secondary text-sm">{t('bookmarks.empty')}</p>
        </div>
      )}
    </div>
  );
}
