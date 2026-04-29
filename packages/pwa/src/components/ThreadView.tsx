import React, { useMemo } from 'react';
import { useThread } from '@bsky/app';
import { useBookmarks } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { PostCard } from './PostCard.js';
import { formatTime, uriToRkey, getPostUrl } from '../utils/format.js';

interface ThreadViewProps {
  client: BskyClient;
  uri: string;
  goBack: () => void;
  goTo: (v: AppView) => void;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ActionButtons({
  uri,
  cid,
  handle,
  rkey,
  depth,
  likePost,
  repostPost,
  isLiked,
  isReposted,
  isBookmarked,
  toggleBookmark,
  goTo,
}: {
  uri: string;
  cid: string;
  handle: string;
  rkey: string;
  depth: number;
  likePost: (uri: string) => void;
  repostPost: (uri: string) => void;
  isLiked: (uri: string) => boolean;
  isReposted: (uri: string) => boolean;
  isBookmarked: (uri: string) => boolean;
  toggleBookmark: (uri: string, cid: string) => void;
  goTo: (v: AppView) => void;
}) {
  const isSmall = depth > 0;
  const sizeClass = isSmall ? 'text-xs gap-2' : 'text-sm gap-3';

  return (
    <div className={`flex items-center ${sizeClass} text-text-secondary mt-2`}>
      <button
        onClick={() => likePost(uri)}
        className={`hover:text-red-500 transition-colors ${isLiked(uri) ? 'text-red-500' : ''}`}
      >
        ❤️ {isLiked(uri) ? '已赞' : 'Like'}
      </button>
      <button
        onClick={() => repostPost(uri)}
        className={`hover:text-green-500 transition-colors ${isReposted(uri) ? 'text-green-500' : ''}`}
      >
        ♻️ {isReposted(uri) ? '已转' : 'Repost'}
      </button>
      <button
        onClick={() => goTo({ type: 'compose', replyTo: uri })}
        className="hover:text-primary transition-colors"
      >
        💬 Reply
      </button>
      <button
        onClick={() => toggleBookmark(uri, cid)}
        className={`hover:text-yellow-500 transition-colors ${isBookmarked(uri) ? 'text-yellow-500' : ''}`}
      >
        {isBookmarked(uri) ? '🔖 已收藏' : '🔖 Bookmark'}
      </button>
      <button
        onClick={() => goTo({ type: 'aiChat', contextUri: uri })}
        className="hover:text-primary transition-colors"
      >
        🤖 AI 分析
      </button>
      <button
        onClick={() => {
          const url = getPostUrl(handle, rkey);
          navigator.clipboard.writeText(url).catch(() => {});
        }}
        className="hover:text-primary transition-colors"
      >
        📋 复制链接
      </button>
    </div>
  );
}

export function ThreadView({ client, uri, goBack, goTo }: ThreadViewProps) {
  const {
    flatLines,
    loading,
    focusedIndex,
    likePost,
    repostPost,
    isLiked,
    isReposted,
    focused,
  } = useThread(client, uri);

  const { isBookmarked, toggleBookmark } = useBookmarks(client);

  const { parentLines, replyLines } = useMemo(() => {
    const parents: typeof flatLines = [];
    const replies: typeof flatLines = [];

    for (const line of flatLines) {
      if (line.depth < 0) parents.push(line);
      else if (line.depth > 0) replies.push(line);
    }

    parents.sort((a, b) => a.depth - b.depth);
    replies.sort(
      (a, b) =>
        new Date(a.indexedAt).getTime() - new Date(b.indexedAt).getTime(),
    );

    return { parentLines: parents, replyLines: replies };
  }, [flatLines]);

  if (loading) return <Spinner />;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A]">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">返回</span>
          </button>
          <h1 className="text-lg font-semibold text-text-primary">帖子</h1>
        </div>
      </header>

      <main className="max-w-content mx-auto px-4 py-6 space-y-4">
        {parentLines.length > 0 && (
          <section className="space-y-2">
            {parentLines.map((line) => (
              <div
                key={line.uri || line.rkey}
                className="pl-4 border-l-2 border-border opacity-60 hover:opacity-100 transition-opacity rounded-r-lg py-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-text-primary">
                    {line.displayName}
                  </span>
                  <span className="text-xs text-text-secondary">
                    @{line.handle}
                  </span>
                  <span className="text-xs text-text-secondary">·</span>
                  <span className="text-xs text-text-secondary">
                    {formatTime(line.indexedAt)}
                  </span>
                </div>
                <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {line.text}
                </p>
              </div>
            ))}
          </section>
        )}

        {focused && (
          <article className="border-l-4 border-primary pl-4 py-3 rounded-r-lg bg-surface/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base font-semibold text-text-primary">
                {focused.displayName}
              </span>
              <span className="text-sm text-text-secondary">
                @{focused.handle}
              </span>
              <span className="text-sm text-text-secondary">·</span>
              <span className="text-sm text-text-secondary">
                {formatTime(focused.indexedAt)}
              </span>
            </div>
            <p className="text-lg text-text-primary leading-relaxed whitespace-pre-wrap">
              {focused.text}
            </p>
            {focused.imageUrls?.length > 0 && (
              <div className="mt-2 rounded-lg overflow-hidden border border-border">
                {focused.imageUrls.map((url, i) => (
                  <img key={i} src={url} alt={`图片 ${i + 1}`}
                    width="800" height="600"
                    className="w-full h-auto max-h-96 object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ))}
              </div>
            )}
            {focused.externalLink && (
              <a href={focused.externalLink.uri} target="_blank" rel="noopener noreferrer"
                className="mt-2 block border border-border rounded-lg p-3 hover:bg-surface transition-colors no-underline"
              >
                <p className="text-text-primary text-sm font-medium line-clamp-1">{focused.externalLink.title || focused.externalLink.uri}</p>
                {focused.externalLink.description && <p className="text-text-secondary text-xs mt-0.5 line-clamp-2">{focused.externalLink.description}</p>}
                <p className="text-primary text-xs mt-1 truncate">🔗 {focused.externalLink.uri}</p>
              </a>
            )}
            {focused.mediaTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {focused.mediaTags.map((tag, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center gap-4 text-sm text-text-secondary">
              <span>💬 {focused.replyCount}</span>
              <span>♻️ {focused.repostCount}</span>
              <span>❤️ {focused.likeCount}</span>
            </div>
            <ActionButtons
              uri={focused.uri}
              cid={focused.cid}
              handle={focused.handle}
              rkey={focused.rkey}
              depth={0}
              likePost={likePost}
              repostPost={repostPost}
              isLiked={isLiked}
              isReposted={isReposted}
              isBookmarked={isBookmarked}
              toggleBookmark={toggleBookmark}
              goTo={goTo}
            />
          </article>
        )}

        {replyLines.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary ml-4">
              回复 ({replyLines.length})
            </h2>
            {replyLines.map((line) => (
              <PostCard key={line.uri || line.rkey} line={line}>
                <ActionButtons
                  uri={line.uri}
                  cid={line.cid}
                  handle={line.handle}
                  rkey={line.rkey}
                  depth={line.depth}
                  likePost={likePost}
                  repostPost={repostPost}
                  isLiked={isLiked}
                  isReposted={isReposted}
                  isBookmarked={isBookmarked}
                  toggleBookmark={toggleBookmark}
                  goTo={goTo}
                />
              </PostCard>
            ))}
          </section>
        )}

        {!loading && flatLines.length === 0 && (
          <div className="text-center py-16 text-text-secondary">
            <p className="text-4xl mb-3">📭</p>
            <p>无法加载帖子</p>
          </div>
        )}
      </main>
    </div>
  );
}
