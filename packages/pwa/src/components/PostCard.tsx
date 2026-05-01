import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { PostView } from '@bsky/core';
import type { FlatLine, AppView } from '@bsky/app';
import { getCdnImageUrl, useI18n } from '@bsky/app';
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

interface QuotedPostData {
  uri: string;
  cid: string;
  text: string;
  handle: string;
  displayName: string;
  authorAvatar?: string;
  mediaTags: string[];
  imageUrls: string[];
  externalLink: ExternalLink | null;
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

function extractQuotedPost(post: PostView): QuotedPostData | undefined {
  // Read from the API-resolved top-level embed (has full author/value/embeds),
  // NOT from post.record.embed (stored format with only uri+cid)
  const embed = (post as any).embed as {
    $type?: string;
    record?: {
      uri?: string;
      cid?: string;
      author?: { did?: string; handle?: string; displayName?: string; avatar?: string };
      value?: { text?: string; createdAt?: string };
      embeds?: Array<{
        $type?: string;
        images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }>;
        external?: { uri: string; title: string; description: string };
      }>;
    };
  } | undefined;
  if (!embed) return undefined;

  const isRecord = embed.$type === 'app.bsky.embed.record#view' || embed.$type === 'app.bsky.embed.record';
  const isRecordWithMedia = embed.$type === 'app.bsky.embed.recordWithMedia#view' || embed.$type === 'app.bsky.embed.recordWithMedia';
  if (!isRecord && !isRecordWithMedia) return undefined;

  // For resolved #view format, record is always single-nested
  const rec = embed.record;
  if (!rec?.uri) return undefined;

  const imageUrls: string[] = [];
  let externalLink: ExternalLink | null = null;
  const mediaTags: string[] = [];

  if (rec.embeds?.[0]) {
    const e = rec.embeds[0]!;
    if ((e.$type === 'app.bsky.embed.images#view' || e.$type === 'app.bsky.embed.images') && e.images) {
      const count = e.images.length;
      mediaTags.push(count === 1 ? '🖼 图片' : `🖼 ${count}张图片`);
      const did = rec.author?.did ?? '';
      for (const img of e.images) {
        imageUrls.push(getCdnImageUrl(did, img.image.ref.$link, img.image.mimeType));
      }
    } else if ((e.$type === 'app.bsky.embed.external#view' || e.$type === 'app.bsky.embed.external') && e.external) {
      mediaTags.push('🔗 链接');
      externalLink = { uri: e.external.uri, title: e.external.title, description: e.external.description };
    }
  }

  return {
    uri: rec.uri,
    cid: rec.cid ?? '',
    text: rec.value?.text ?? '',
    handle: rec.author?.handle ?? '',
    displayName: rec.author?.displayName ?? rec.author?.handle ?? '',
    authorAvatar: rec.author?.avatar,
    mediaTags,
    imageUrls,
    externalLink,
  };
}

function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function truncateName(name: string, max = 15): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

const LINK_REGEX = /(https?:\/\/[^\s<>"']+|@[a-zA-Z0-9._-]+(?:\.[a-zA-Z]{2,})+)/g;

export function linkifyText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[1];
    if (token.startsWith('@')) {
      const handle = token.slice(1);
      parts.push(<a key={match.index} className="text-blue-500 hover:underline" href={`#/profile?actor=${encodeURIComponent(handle)}`} onClick={(e) => e.stopPropagation()}>{token}</a>);
    } else {
      parts.push(<a key={match.index} className="text-blue-500 hover:underline" href={token} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{token}</a>);
    }
    lastIndex = LINK_REGEX.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

function ImageLightbox({ images, initial, onClose }: { images: ImageData[]; initial: number; onClose: () => void }) {
  return (
      <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-4 right-4 text-white text-3xl leading-none hover:opacity-70 z-10">✕</button>
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
  const { t } = useI18n();
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
                alt={img.alt || t('post.imageAlt', { n: i + 1 })}
                width="800" height="600"
                className={`w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity ${spanFull ? 'col-span-2 h-40' : ''}`}
                onClick={(e) => { e.stopPropagation(); setLightbox(i); }}
              />
            );
          })}
        </div>
        {images.length > 4 && (
          <div className="text-center text-xs text-text-secondary py-1.5 bg-surface">
            +{images.length - 4} {t('post.imageCount', { n: images.length - 4 })}
          </div>
        )}
      </div>
      {lightbox !== null && createPortal(
        <ImageLightbox images={images} initial={lightbox} onClose={() => setLightbox(null)} />,
        document.body
      )}
    </>
  );
}

interface PostCardBaseProps {
  onClick?: () => void;
  isSelected?: boolean;
  children?: React.ReactNode;
  goTo?: (v: AppView) => void;
  repostBy?: string;
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

export function PostCard({ onClick, isSelected, post, line, children, goTo, repostBy }: PostCardProps) {
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
  let avatarUrl: string | undefined;
  let quotedPost: FlatLine['quotedPost'];
  let mediaTags: string[] = [];

  if (post) {
    displayName = post.author.displayName ?? post.author.handle;
    handle = post.author.handle;
    text = post.record.text;
    indexedAt = post.indexedAt ?? '';
    likeCount = post.likeCount;
    repostCount = post.repostCount;
    replyCount = post.replyCount;
    avatarUrl = post.author.avatar;
    const embeds = extractEmbeds(post);
    images = embeds.images;
    hasImages = images.length > 0;
    externalLink = embeds.external;
    quotedPost = extractQuotedPost(post);
    mediaTags = [];
  } else if (line) {
    displayName = line.displayName || line.handle;
    handle = line.handle;
    text = line.text;
    indexedAt = line.indexedAt;
    likeCount = line.likeCount;
    repostCount = line.repostCount;
    replyCount = line.replyCount;
    avatarUrl = line.authorAvatar;
    if (line.imageUrls?.length) {
      images = line.imageUrls.map(url => ({ url, alt: '' }));
      hasImages = true;
    }
    if (line.externalLink) {
      externalLink = line.externalLink;
    }
    quotedPost = line.quotedPost;
    mediaTags = line.mediaTags ?? [];
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
      {repostBy && (
        <div className="flex items-center gap-1 mb-2 text-text-secondary text-xs">
          <span>↻</span>
          <span>Reposted by @{repostBy}</span>
        </div>
      )}
      <div className="flex gap-3">
        <div
          className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            goTo?.({ type: 'profile', actor: handle });
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            avatarLetter(displayName)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-text-primary font-semibold text-sm truncate max-w-[200px]">
              {truncateName(displayName)}
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
          <p className="text-text-primary text-sm mt-1 whitespace-pre-wrap break-all line-clamp-6">
            {linkifyText(text)}
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
          {mediaTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {mediaTags.map((tag, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {quotedPost && (
            <div
              className="mt-2 border border-border rounded-xl p-3 bg-surface overflow-hidden cursor-pointer hover:bg-surface/80 hover:border-primary/30 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                if (goTo && quotedPost) goTo({ type: 'thread', uri: quotedPost.uri });
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                {quotedPost.authorAvatar && (
                  <img src={quotedPost.authorAvatar} className="w-4 h-4 rounded-full" alt="" />
                )}
                <span className="text-xs font-semibold text-text-primary">{quotedPost.displayName}</span>
                <span className="text-xs text-text-secondary">@{quotedPost.handle}</span>
              </div>
              <p className="text-xs text-text-primary line-clamp-3 break-all">{linkifyText(quotedPost.text)}</p>
              {quotedPost.imageUrls && quotedPost.imageUrls.length > 0 && (
                <div className="mt-1 flex gap-1">
                  {quotedPost.imageUrls.slice(0, 2).map((url, idx) => (
                    <img key={idx} src={url} className="w-16 h-16 object-cover rounded-md" alt="" />
                  ))}
                </div>
              )}
            </div>
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
