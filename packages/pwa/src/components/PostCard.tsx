import React from 'react';
import type { PostView } from '@bsky/core';
import type { FlatLine } from '@bsky/app';
import { formatTime } from '../utils/format.js';

function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

interface PostCardBaseProps {
  onClick?: () => void;
  isSelected?: boolean;
  children?: React.ReactNode;
}

interface PostCardWithPost extends PostCardBaseProps {
  post: PostView;
  line?: never;
}

interface PostCardWithLine extends PostCardBaseProps {
  post?: never;
  line: FlatLine;
}

type PostCardProps = PostCardWithPost | PostCardWithLine;

export function PostCard({ onClick, isSelected, post, line, children }: PostCardProps) {
  let displayName: string;
  let handle: string;
  let text: string;
  let indexedAt: string;
  let likeCount: number | undefined;
  let repostCount: number | undefined;
  let replyCount: number | undefined;
  let hasImages = false;
  let imageCount = 0;

  if (post) {
    displayName = post.author.displayName ?? post.author.handle;
    handle = post.author.handle;
    text = post.record.text;
    indexedAt = post.indexedAt;
    likeCount = post.likeCount;
    repostCount = post.repostCount;
    replyCount = post.replyCount;
    const embed = post.record.embed as { $type?: string; images?: Array<unknown> } | undefined;
    if (embed?.$type === 'app.bsky.embed.images') {
      hasImages = true;
      imageCount = (embed.images ?? []).length;
    }
  } else if (line) {
    displayName = line.displayName || line.handle;
    handle = line.handle;
    text = line.text;
    indexedAt = line.indexedAt;
    likeCount = line.likeCount;
    repostCount = line.repostCount;
    replyCount = line.replyCount;
  } else {
    return null;
  }

  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 border-b border-border transition-colors ${
        onClick ? 'cursor-pointer hover:bg-surface' : ''
      } ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
          {avatarLetter(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-text-primary font-semibold text-sm truncate max-w-[200px]">
              {displayName}
            </span>
            <span className="text-text-secondary text-xs truncate max-w-[150px]">
              @{handle}
            </span>
            {indexedAt && (
              <>
                <span className="text-text-secondary text-xs">·</span>
                <span className="text-text-secondary text-xs">{formatTime(indexedAt)}</span>
              </>
            )}
          </div>
          <p className="text-text-primary text-sm mt-1 whitespace-pre-wrap line-clamp-6">
            {text}
          </p>
          {hasImages && (
            <p className="text-text-secondary text-xs mt-1">🖼 {imageCount} 张图片</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-text-secondary text-xs">
            <span>💬 {replyCount ?? 0}</span>
            <span>♻ {repostCount ?? 0}</span>
            <span>♥ {likeCount ?? 0}</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
