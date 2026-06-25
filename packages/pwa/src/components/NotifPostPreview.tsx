import React, { useMemo } from 'react';
import type { PostView, ProfileViewBasic } from '@bsky/core';
import { extractEmbeds, extractImages } from '@bsky/app';
import { useI18n } from '@bsky/app';

interface NotifPostPreviewProps {
  post?: PostView;
  fallbackText?: string;
  fallbackAuthor?: ProfileViewBasic;
  /** Whether the parent knows this notification references a post but the post data has not arrived yet. */
  loading?: boolean;
}

const MAX_IMAGES = 4;

export function NotifPostPreview({ post, fallbackText, fallbackAuthor, loading }: NotifPostPreviewProps) {
  const { t } = useI18n();
  const author = post?.author ?? fallbackAuthor;
  const text = (post?.record.text as string | undefined) ?? fallbackText ?? '';

  const images = useMemo(() => {
    if (!post) return [];
    const embeds = extractEmbeds(post);
    const items: { url: string; alt: string }[] = [];
    const seen = new Set<string>();
    const push = (url: string, alt: string) => {
      if (!url || seen.has(url) || items.length >= MAX_IMAGES) return;
      seen.add(url);
      items.push({ url, alt });
    };
    for (const img of embeds.images ?? []) push(img.url, img.alt);
    if (embeds.gallery) {
      for (const img of embeds.gallery.images) push(img.thumbnail || img.fullsize, img.alt);
    }
    // Fallback for direct images
    if (items.length === 0) {
      for (const img of extractImages(post)) push(img.url, img.alt);
    }
    return items;
  }, [post]);

  const hasContent = author || text || images.length > 0;
  if (!hasContent && !loading) return null;

  return (
    <div className="mt-2 rounded-xl border border-border bg-surface/40 overflow-hidden">
      <div className="p-2.5">
        {author ? (
          <div className="flex items-center gap-1.5 text-xs mb-1">
            <div className="w-4 h-4 rounded-full overflow-hidden shrink-0">
              {author.avatar ? (
                <img src={author.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary flex items-center justify-center text-white text-[8px] font-bold">
                  {(author.displayName || author.handle).charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <span className="font-semibold text-text-primary truncate max-w-[140px]">
              {author.displayName || author.handle}
            </span>
            <span className="text-text-secondary truncate max-w-[120px]">@{author.handle}</span>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-1.5 text-xs mb-1 animate-pulse">
            <div className="w-4 h-4 rounded-full bg-surface" />
            <div className="h-3 w-20 bg-surface rounded" />
            <div className="h-3 w-16 bg-surface rounded" />
          </div>
        ) : null}
        {text ? (
          <p className="text-text-secondary text-sm line-clamp-3 break-words whitespace-pre-wrap">{text}</p>
        ) : loading ? (
          <div className="space-y-1 animate-pulse">
            <div className="h-3 w-full bg-surface rounded" />
            <div className="h-3 w-2/3 bg-surface rounded" />
          </div>
        ) : null}
      </div>
      {images.length > 0 ? (
        <div className={`grid gap-[2px] ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((img, idx) => {
            const isLast = idx === images.length - 1;
            const totalImages = (post?.record.embed as any)?.images?.length ?? images.length;
            const showMore = images.length === MAX_IMAGES && isLast && totalImages > MAX_IMAGES;
            return (
              <div
                key={idx}
                className={`relative overflow-hidden bg-black/5 ${
                  images.length === 3 && idx === 0 ? 'row-span-2' : ''
                } ${images.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}
              >
                <img
                  src={img.url}
                  alt={img.alt || t('post.imageAlt', { n: idx + 1 })}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {showMore && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-lg font-semibold">
                    +{totalImages - MAX_IMAGES}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-[2px]">
          <div className="aspect-square bg-surface animate-pulse" />
          <div className="aspect-square bg-surface animate-pulse" />
        </div>
      ) : null}
    </div>
  );
}
