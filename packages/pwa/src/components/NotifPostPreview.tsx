import React, { useMemo } from 'react';
import type { PostView, ProfileViewBasic } from '@bsky/core';
import { extractEmbeds } from '@bsky/app';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface NotifPostPreviewProps {
  post?: PostView;
  fallbackText?: string;
  fallbackAuthor?: ProfileViewBasic;
}

const MAX_THUMBNAILS = 4;

export function NotifPostPreview({ post, fallbackText, fallbackAuthor }: NotifPostPreviewProps) {
  const { t } = useI18n();
  const author = post?.author ?? fallbackAuthor;
  const text = (post?.record.text as string | undefined) ?? fallbackText ?? '';

  const thumbnails = useMemo(() => {
    if (!post) return [];
    const embeds = extractEmbeds(post);
    const items: { url: string; alt: string; kind: 'image' | 'video' | 'external' | 'gallery' }[] = [];

    for (const img of embeds.images ?? []) {
      if (items.length >= MAX_THUMBNAILS) break;
      items.push({ url: img.url, alt: img.alt, kind: 'image' });
    }

    if (embeds.gallery) {
      for (const img of embeds.gallery.images) {
        if (items.length >= MAX_THUMBNAILS) break;
        items.push({ url: img.thumbnail || img.fullsize, alt: img.alt, kind: 'gallery' });
      }
    }

    if (embeds.video && items.length < MAX_THUMBNAILS) {
      items.push({
        url: embeds.video.thumbnailUrl,
        alt: embeds.video.alt || t('video.unavailable'),
        kind: 'video',
      });
    }

    if (embeds.external?.thumb && items.length < MAX_THUMBNAILS) {
      items.push({
        url: embeds.external.thumb,
        alt: embeds.external.title,
        kind: 'external',
      });
    }

    return items.slice(0, MAX_THUMBNAILS);
  }, [post, t]);

  if (!author && !text && thumbnails.length === 0) return null;

  return (
    <div className="mt-1.5">
      {author && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-semibold text-text-primary truncate max-w-[140px]">
            {author.displayName || author.handle}
          </span>
          <span className="text-text-secondary truncate max-w-[120px]">@{author.handle}</span>
        </div>
      )}
      {text && (
        <p className="text-text-secondary text-sm mt-0.5 line-clamp-2 break-words">{text}</p>
      )}
      {thumbnails.length > 0 && (
        <div className="flex gap-1 mt-1.5">
          {thumbnails.map((thumb, idx) => (
            <div
              key={idx}
              className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-surface border border-border"
            >
              <img
                src={thumb.url}
                alt={thumb.alt}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {thumb.kind === 'video' && (
                <span className="absolute inset-0 flex items-center justify-center text-white/90 bg-black/20">
                  <Icon name="video" size={16} />
                </span>
              )}
              {thumb.kind === 'external' && (
                <span className="absolute inset-0 flex items-center justify-center text-white/90 bg-black/20">
                  <Icon name="link" size={16} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
