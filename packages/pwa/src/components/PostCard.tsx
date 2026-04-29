import React, { useState } from 'react';
import type { PostView } from '@bsky/core';
import type { FlatLine } from '@bsky/app';
import { getCdnImageUrl } from '@bsky/app';
import { formatTime } from '../utils/format.js';

interface ImageData {
  url: string;
  alt: string;
}

interface ExternalLink {
  uri: string;
  title: string;
  description: string;
}

function extractEmbeds(post: PostView): { images: ImageData[]; external: ExternalLink | null } {
  const images: ImageData[] = [];
  let external: ExternalLink | null = null;
  const embed = post.record.embed as {
    $type?: string;
    images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }>;
    media?: { $type?: string; images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }> };
    external?: { uri: string; title: string; description: string };
  } | undefined;
  if (!embed) return { images, external };

  const collectImages = (e: typeof embed) => {
    if (!e) return;
    if (e.$type === 'app.bsky.embed.images' && e.images) {
      for (const img of e.images) {
        images.push({
          url: getCdnImageUrl(post.author.did, img.image.ref.$link, img.image.mimeType),
          alt: img.alt || '',
        });
      }
    } else if (e.$type === 'app.bsky.embed.recordWithMedia' && e.media) {
      collectImages(e.media);
    }
  };
  collectImages(embed);

  if (embed.$type === 'app.bsky.embed.external' && embed.external) {
    external = {
      uri: embed.external.uri,
      title: embed.external.title,
      description: embed.external.description,
    };
  }

  return { images, external };
}

function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

function ImageLightbox({ images, initial, onClose }: { images: ImageData[]; initial: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white text-3xl leading-none hover:opacity-70 z-10">✕</button>
      <img
        src={images[initial]!.url}
        alt={images[initial]!.alt}
        className="max-w-full max-h-[90vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function ImageGrid({ images }: { images: ImageData[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  const grid = (() => {
    const n = images.length;
    if (n === 1) return 'grid-cols-1';
    if (n === 2) return 'grid-cols-2 gap-[2px]';
    if (n === 3) return 'grid-cols-2 gap-[2px]'; // 2-col grid, first 2 in row 1, 3rd spans
    return 'grid-cols-2 gap-[2px]';
  })();

  return (
    <>
      <div className="mt-2 rounded-xl overflow-hidden border border-border">
        <div className={`grid ${grid}`}>
          {images.map((img, i) => {
            const spanFull = images.length === 3 && i === 2;
            return (
              <img
                key={i}
                src={img.url}
                alt={img.alt || `图片 ${i + 1}`}
                width="800" height="600"
                className={`w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity ${spanFull ? 'col-span-2 h-40' : ''}`}
                onClick={(e) => { e.stopPropagation(); setLightbox(i); }}
              />
            );
          })}
        </div>
        {images.length > 4 && (
          <div className="text-center text-xs text-text-secondary py-1.5 bg-surface">
            +{images.length - 4} 张
          </div>
        )}
      </div>
      {lightbox !== null && (
        <ImageLightbox images={images} initial={lightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  );
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
  let images: ImageData[] = [];
  let externalLink: ExternalLink | null = null;

  if (post) {
    displayName = post.author.displayName ?? post.author.handle;
    handle = post.author.handle;
    text = post.record.text;
    indexedAt = post.indexedAt;
    likeCount = post.likeCount;
    repostCount = post.repostCount;
    replyCount = post.replyCount;
    const embeds = extractEmbeds(post);
    images = embeds.images;
    hasImages = images.length > 0;
    externalLink = embeds.external;
  } else if (line) {
    displayName = line.displayName || line.handle;
    handle = line.handle;
    text = line.text;
    indexedAt = line.indexedAt;
    likeCount = line.likeCount;
    repostCount = line.repostCount;
    replyCount = line.replyCount;
    if (line.imageUrls?.length) {
      images = line.imageUrls.map(url => ({ url, alt: '' }));
      hasImages = true;
    }
    if (line.externalLink) {
      externalLink = line.externalLink;
    }
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
          {hasImages && <ImageGrid images={images} />}
          {externalLink && (
            <a
              href={externalLink.uri}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="mt-2 block border border-border rounded-lg p-3 hover:bg-surface transition-colors no-underline"
            >
              <p className="text-text-primary text-sm font-medium line-clamp-1">{externalLink.title || externalLink.uri}</p>
              {externalLink.description && <p className="text-text-secondary text-xs mt-0.5 line-clamp-2">{externalLink.description}</p>}
              <p className="text-primary text-xs mt-1 truncate">🔗 {externalLink.uri}</p>
            </a>
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

export { ImageGrid, ImageLightbox };
