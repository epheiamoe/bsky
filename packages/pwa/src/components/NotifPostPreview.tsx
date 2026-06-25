import React, { useMemo } from 'react';
import type { PostView } from '@bsky/core';
import { extractEmbeds, extractImages } from '@bsky/app';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface NotifPostPreviewProps {
  post?: PostView;
  fallbackText?: string;
  /** Whether the parent knows this notification references a post but the post data has not arrived yet. */
  loading?: boolean;
}

const GALLERY_PREVIEW_COUNT = 4;

interface PreviewImage {
  url: string;
  alt: string;
}

interface PreviewMedia {
  type: 'image' | 'gallery' | 'video' | 'external';
  images?: PreviewImage[];
  thumbnailUrl?: string;
  alt?: string;
}

function extractNotificationMedia(post: PostView, t: (key: string, vars?: Record<string, string | number>) => string): PreviewMedia | null {
  const embeds = extractEmbeds(post);

  // 1. Gallery (new app.bsky.embed.gallery) — up to 10 images, preview first 4.
  if (embeds.gallery && embeds.gallery.images.length > 0) {
    return {
      type: embeds.gallery.images.length === 1 ? 'image' : 'gallery',
      images: embeds.gallery.images.map((img, idx) => ({
        url: img.thumbnail || img.fullsize,
        alt: img.alt || t('post.imageAlt', { n: idx + 1 }),
      })),
    };
  }

  // 2. Legacy images (app.bsky.embed.images, max 4).
  const images = embeds.images.length > 0 ? embeds.images : extractImages(post);
  if (images.length > 0) {
    return {
      type: images.length === 1 ? 'image' : 'gallery',
      images: images.map((img, idx) => ({
        url: img.url,
        alt: img.alt || t('post.imageAlt', { n: idx + 1 }),
      })),
    };
  }

  // 3. Video thumbnail.
  if (embeds.video) {
    return {
      type: 'video',
      thumbnailUrl: embeds.video.thumbnailUrl,
      alt: embeds.video.alt || t('mediaType.video'),
    };
  }

  // 4. External link thumbnail (prefer view-side thumb if present).
  if (embeds.external) {
    return {
      type: 'external',
      thumbnailUrl: embeds.external.thumb,
      alt: embeds.external.title || t('mediaType.external'),
    };
  }

  return null;
}

function SingleImage({ image, className }: { image: PreviewImage; className?: string }) {
  return (
    <span
      className={`inline-flex w-12 h-12 rounded-md overflow-hidden bg-black/5 shrink-0 ${className ?? ''}`}
      aria-hidden="true"
    >
      <img
        src={image.url}
        alt={image.alt}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </span>
  );
}

function GalleryStrip({ images, className }: { images: PreviewImage[]; className?: string }) {
  const visible = images.slice(0, GALLERY_PREVIEW_COUNT);
  return (
    <span
      className={`inline-flex gap-1 h-12 items-center shrink-0 ${className ?? ''}`}
      aria-hidden="true"
    >
      {visible.map((img, idx) => (
        <span
          key={idx}
          className="inline-flex w-10 h-10 rounded-md overflow-hidden bg-black/5 shrink-0"
        >
          <img
            src={img.url}
            alt={img.alt}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </span>
      ))}
    </span>
  );
}

function VideoThumbnail({ thumbnailUrl, alt }: { thumbnailUrl: string; alt: string }) {
  return (
    <span
      className="inline-flex relative w-12 h-12 rounded-md overflow-hidden bg-black/5 shrink-0"
      aria-hidden="true"
    >
      <img src={thumbnailUrl} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      <span className="absolute inset-0 inline-flex items-center justify-center">
        <Icon name="play" size={16} className="text-white drop-shadow" />
      </span>
    </span>
  );
}

function ExternalThumbnail({ thumbnailUrl, alt }: { thumbnailUrl?: string; alt: string }) {
  if (thumbnailUrl) {
    return (
      <span
        className="inline-flex w-12 h-12 rounded-md overflow-hidden bg-black/5 shrink-0"
        aria-hidden="true"
      >
        <img src={thumbnailUrl} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      </span>
    );
  }

  return (
    <span
      className="inline-flex w-12 h-12 rounded-md overflow-hidden bg-surface items-center justify-center shrink-0"
      aria-hidden="true"
    >
      <Icon name="link" size={16} className="text-text-secondary" />
    </span>
  );
}

function NotificationMedia({ post, className }: { post: PostView; className?: string }) {
  const { t } = useI18n();
  const media = useMemo(() => extractNotificationMedia(post, t), [post, t]);
  if (!media) return null;

  if (media.type === 'image' && media.images && media.images.length > 0) {
    return <SingleImage image={media.images[0]!} className={className} />;
  }

  if (media.type === 'gallery' && media.images && media.images.length > 0) {
    return <GalleryStrip images={media.images} className={className} />;
  }

  if (media.type === 'video' && media.thumbnailUrl) {
    return <VideoThumbnail thumbnailUrl={media.thumbnailUrl} alt={media.alt ?? t('mediaType.video')} />;
  }

  if (media.type === 'external') {
    return <ExternalThumbnail thumbnailUrl={media.thumbnailUrl} alt={media.alt ?? t('mediaType.external')} />;
  }

  return null;
}

export function NotifPostPreview({ post, fallbackText, loading }: NotifPostPreviewProps) {
  const text = (post?.record.text as string | undefined) ?? fallbackText ?? '';

  if (!post && !loading) return null;

  if (loading && !post) {
    return (
      <span className="mt-1 inline-flex items-center gap-2 min-w-0 animate-pulse">
        <span className="inline-block h-3 w-full bg-surface rounded" />
        <span className="inline-block w-12 h-12 bg-surface rounded-md shrink-0" />
      </span>
    );
  }

  return (
    <span className="mt-1 inline-flex items-center gap-2 min-w-0">
      <span className="inline-block text-text-secondary text-xs line-clamp-3 break-words whitespace-pre-wrap flex-1 min-w-0">
        {text}
      </span>
      {post && <NotificationMedia post={post} className="shrink-0" />}
    </span>
  );
}
