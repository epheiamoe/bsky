import React, { useMemo } from 'react';
import type { PostView } from '@bsky/core';
import { extractEmbeds, extractGallery, extractImages } from '@bsky/app';
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
  const gallery = embeds.gallery ?? extractGallery(post);
  if (gallery && gallery.images.length > 0) {
    return {
      type: gallery.images.length === 1 ? 'image' : 'gallery',
      images: gallery.images.map((img, idx) => ({
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
    <div
      className={`w-12 h-12 rounded-md overflow-hidden bg-black/5 shrink-0 ${className ?? ''}`}
      aria-hidden="true"
    >
      <img
        src={image.url}
        alt={image.alt}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );
}

function GalleryStrip({ images, className }: { images: PreviewImage[]; className?: string }) {
  const visible = images.slice(0, GALLERY_PREVIEW_COUNT);
  return (
    <div
      className={`flex gap-1 h-12 items-center shrink-0 ${className ?? ''}`}
      aria-hidden="true"
    >
      {visible.map((img, idx) => (
        <div
          key={idx}
          className="w-10 h-10 rounded-md overflow-hidden bg-black/5 shrink-0"
        >
          <img
            src={img.url}
            alt={img.alt}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}

function VideoThumbnail({ thumbnailUrl, alt }: { thumbnailUrl: string; alt: string }) {
  return (
    <div
      className="relative w-12 h-12 rounded-md overflow-hidden bg-black/5 shrink-0"
      aria-hidden="true"
    >
      <img src={thumbnailUrl} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon name="play" size={16} className="text-white drop-shadow" />
      </div>
    </div>
  );
}

function ExternalThumbnail({ thumbnailUrl, alt }: { thumbnailUrl?: string; alt: string }) {
  if (thumbnailUrl) {
    return (
      <div
        className="w-12 h-12 rounded-md overflow-hidden bg-black/5 shrink-0"
        aria-hidden="true"
      >
        <img src={thumbnailUrl} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      </div>
    );
  }

  return (
    <div
      className="w-12 h-12 rounded-md overflow-hidden bg-surface flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      <Icon name="link" size={16} className="text-text-secondary" />
    </div>
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
      <div className="mt-1 flex items-center gap-2 min-w-0 animate-pulse">
        <div className="h-3 w-full bg-surface rounded" />
        <div className="w-12 h-12 bg-surface rounded-md shrink-0" />
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2 min-w-0">
      <p className="text-text-secondary text-xs line-clamp-3 break-words whitespace-pre-wrap flex-1 min-w-0">
        {text}
      </p>
      {post && <NotificationMedia post={post} className="shrink-0" />}
    </div>
  );
}
