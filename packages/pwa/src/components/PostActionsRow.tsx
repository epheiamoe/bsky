import React, { useState } from 'react';
import type { PostView } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { isPostLiked, isPostReposted, getLikeCount, getRepostCount, likePost, repostPost } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { Icon } from './Icon.js';

interface PostActionsRowProps {
  client?: BskyClient | null;
  goTo: (v: AppView) => void;
  post: PostView;
  /** Whether to include bookmark button */
  showBookmark?: boolean;
  isBookmarked?: (uri: string) => boolean;
  onBookmark?: (uri: string, cid: string) => void;
  /** For thread view — explicit like/repost state from props (overrides module-level) */
  liked?: boolean;
  reposted?: boolean;
}

/**
 * Unified action row for any post card in any view.
 * Includes: reply count, repost+quote popup, like count, bookmark.
 * Reads like/repost state from module-level usePostActions.
 */
export function PostActionsRow({ client, goTo, post, showBookmark, isBookmarked, onBookmark, liked, reposted }: PostActionsRowProps) {
  const [repopup, setRepopup] = useState(false);
  const isL = liked ?? isPostLiked(post.uri);
  const isR = reposted ?? isPostReposted(post.uri);
  const lc = getLikeCount(post.uri, post.likeCount ?? 0);
  const rc = getRepostCount(post.uri, post.repostCount ?? 0);

  return (
    <div className="flex items-center gap-3 text-text-secondary text-xs mt-1">
      {/* Reply */}
      <button onClick={(e) => { e.stopPropagation(); goTo({ type: 'compose', replyTo: post.uri }); }} className="hover:text-primary transition-colors flex items-center gap-0.5" title="Reply">
        <Icon name="corner-down-right" size={14} />{post.replyCount ?? 0}
      </button>
      {/* Repost + Quote popup */}
      <div className="relative inline-flex items-center">
        <button onClick={(e) => { e.stopPropagation(); setRepopup(!repopup); }} className={`hover:text-green-500 transition-colors flex items-center gap-0.5 ${isR ? 'text-green-500' : ''}`} title="Repost / Quote">
          <Icon name="repeat" size={14} />{rc}
        </button>
        {repopup && (
          <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-[#1a1a2e] border border-border rounded-lg shadow-lg z-50 py-1 min-w-[130px]" onClick={e => e.stopPropagation()}>
            <button onClick={(e) => { e.stopPropagation(); repostPost(client!, post.uri, post.cid).catch(() => {}); setRepopup(false); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors flex items-center gap-2">
              <Icon name="repeat" size={14} /> {isR ? 'Unrepost' : 'Repost'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); goTo({ type: 'compose', quoteUri: post.uri }); setRepopup(false); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors flex items-center gap-2">
              <Icon name="pen-line" size={14} /> Quote
            </button>
          </div>
        )}
      </div>
      {/* Like */}
      <button onClick={(e) => { e.stopPropagation(); likePost(client!, post.uri, post.cid).catch(() => {}); }} className={`hover:text-red-500 transition-colors flex items-center gap-0.5 ${isL ? 'text-red-500' : ''}`} title={isL ? 'Unlike' : 'Like'}>
        <Icon name="heart" size={14} filled={isL} />{lc}
      </button>
      {/* Bookmark */}
      {showBookmark && isBookmarked && onBookmark && (
        <button onClick={(e) => { e.stopPropagation(); onBookmark(post.uri, post.cid); }} className={`hover:text-yellow-500 transition-colors ${isBookmarked(post.uri) ? 'text-yellow-500' : ''}`} title="Bookmark">
          <Icon name="bookmark" size={14} filled={isBookmarked(post.uri)} />
        </button>
      )}
    </div>
  );
}
