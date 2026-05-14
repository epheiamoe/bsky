import React, { useRef, useState, useCallback } from 'react';
import type { PostView, AIConfig, BskyClient } from '@bsky/core';
import type { FlatLine, AppView } from '@bsky/app';
import { getCdnImageUrl, getVideoThumbnailUrl, getVideoPlaylistUrl, useI18n } from '@bsky/app';
import { isPostLiked, isPostReposted, likePost, repostPost } from '@bsky/app';
import { describeImage } from '@bsky/core';
import { formatTime } from '../utils/format.js';
import { Icon } from './Icon.js';
import { Modal } from './Modal.js';
import { VideoCard } from './VideoCard.js';
import type { VideoData } from './VideoCard.js';
import { ImageLightboxDialog } from './ImageLightboxDialog.js';

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
  imageDetails: Array<{ url: string; alt: string }>;
  externalLink: ExternalLink | null;
}

function getReplyDepth(post: PostView): number | '2+' | null {
  const reply = (post.record as any).reply as { root: { uri: string }; parent: { uri: string } } | undefined;
  if (!reply) return null;
  if (reply.root.uri === reply.parent.uri) return 1;
  return '2+';
}

function extractEmbeds(post: PostView): { images: ImageData[]; external: ExternalLink | null; video: VideoData | null; hasGif: boolean } {
  const images: ImageData[] = [];
  let external: ExternalLink | null = null;
  let video: VideoData | null = null;
  let hasGif = false;
  const embed = post.record.embed as {
    $type?: string;
    images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }>;
    media?: { $type?: string; images?: Array<{ image: { ref: { $link: string }; mimeType: string }; alt: string }> };
    external?: { uri: string; title: string; description: string };
    video?: { ref: { $link: string }; mimeType: string };
    aspectRatio?: { width: number; height: number };
    alt?: string;
  } | undefined;
  if (!embed) return { images, external, video, hasGif };

  if (embed.$type === 'app.bsky.embed.video') {
    const viewEmbed = (post as any).embed as { thumbnail?: string; playlist?: string; cid?: string } | undefined;
    const cid = viewEmbed?.cid ?? embed.video?.ref?.$link ?? '';
    video = {
      thumbnailUrl: viewEmbed?.thumbnail || getVideoThumbnailUrl(post.author.did, cid),
      playlistUrl: viewEmbed?.playlist || getVideoPlaylistUrl(post.author.did, cid),
      alt: embed.alt,
      aspectRatio: embed.aspectRatio,
    };
    return { images, external, video, hasGif };
  }

  const collectImages = (e: typeof embed) => {
    if (!e) return;
    if ((e.$type === 'app.bsky.embed.images' || e.$type === 'app.bsky.embed.images#view') && e.images) {
      for (const img of e.images) {
        const mime = img.image?.mimeType || (img as any).mimeType || '';
        if (mime.includes('gif')) hasGif = true;
        images.push({
          url: (img as any).fullsize || getCdnImageUrl(post.author.did, img.image.ref.$link, img.image.mimeType),
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

  return { images, external, video, hasGif };
}

function extractQuotedPost(post: PostView): QuotedPostData | undefined {
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

  const rec = embed.record;
  if (!rec?.uri) return undefined;

  const imageDetails: Array<{ url: string; alt: string }> = [];
  let externalLink: ExternalLink | null = null;

  if (rec.embeds?.[0]) {
    const e = rec.embeds[0]!;
    if ((e.$type === 'app.bsky.embed.images#view' || e.$type === 'app.bsky.embed.images') && e.images) {
      for (const img of e.images) {
        const url = (img as any).fullsize || getCdnImageUrl(rec.author?.did ?? '', (img as any).image?.ref?.$link || '', (img as any).image?.mimeType || 'image/jpeg');
        if (url) imageDetails.push({ url, alt: (img as any).alt || '' });
      }
    } else if ((e.$type === 'app.bsky.embed.external#view' || e.$type === 'app.bsky.embed.external') && e.external) {
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
    imageDetails,
    externalLink,
  };
}

function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function truncateName(name: string, max = 15): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

const LINK_REGEX = /(https?:\/\/[^\s<>"']+|@[a-zA-Z0-9._-]+(?:\.[a-zA-Z]{2,})+|#[\p{L}\p{N}_]+)/gu;

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
    } else if (token.startsWith('#')) {
      const tag = token.slice(1);
      parts.push(<a key={match.index} className="text-blue-500 hover:underline" href={`#/search?q=${encodeURIComponent(tag)}&tab=top`} onClick={(e) => e.stopPropagation()}>{token}</a>);
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

// Module-level cache for AI-generated ALT text (key = cdnUrl)
const _altCache = new Map<string, string>();

function ImageGrid({ images, imageDescCallback, singleImageFill }: {
  images: ImageData[];
  imageDescCallback?: (index: number, cdnUrl: string, existingAlt?: string) => Promise<string>;
  singleImageFill?: boolean;
}) {
  const { t } = useI18n();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [lightboxRects, setLightboxRects] = useState<DOMRect[] | null>(null);
  const [naturalAspectRatio, setNaturalAspectRatio] = useState(1);
  const [altPopup, setAltPopup] = useState<{ index: number; text: string; aiText?: string; aiLoading: boolean; aiError?: string } | null>(null);
  const [imgAspectRatio, setImgAspectRatio] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fillMode = singleImageFill ?? true;

  const handleImgClick = useCallback((e: React.MouseEvent<HTMLImageElement>, i: number) => {
    e.stopPropagation();
    const allImgs = gridRef.current?.querySelectorAll<HTMLImageElement>('img');
    if (!allImgs) {
      // Single image mode: use the clicked element's rect
      const rect = e.currentTarget.getBoundingClientRect();
      setLightboxRects([rect]);
      const el = e.currentTarget;
      if (el.naturalWidth && el.naturalHeight) {
        setNaturalAspectRatio(el.naturalWidth / el.naturalHeight);
      } else {
        setNaturalAspectRatio(rect.width / rect.height || 1);
      }
      setLightbox(i);
      return;
    }
    const rects = Array.from(allImgs).map(img => img.getBoundingClientRect());
    setLightboxRects(rects);
    const el = e.currentTarget;
    if (el.naturalWidth && el.naturalHeight) {
      setNaturalAspectRatio(el.naturalWidth / el.naturalHeight);
    } else {
      setNaturalAspectRatio(rects[i]?.width / rects[i]?.height || 1);
    }
    setLightbox(i);
  }, []);

  const grid = (() => {
    const n = images.length;
    if (n === 1) return 'grid-cols-1';
    if (n === 2) return 'grid-cols-2 gap-[2px]';
    if (n === 3) return 'grid-cols-2 gap-[2px]';
    return 'grid-cols-2 gap-[2px]';
  })();

  const handleGenerateAlt = async (i: number, img: ImageData) => {
    if (!imageDescCallback || altPopup?.aiLoading) return;
    const cached = _altCache.get(img.url);
    if (cached) {
      setAltPopup(prev => prev ? { ...prev, aiText: cached, aiLoading: false } : null);
      return;
    }
    setAltPopup(prev => prev ? { ...prev, aiLoading: true, aiError: undefined } : null);
    const MAX_RETRIES = 4;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await imageDescCallback(i, img.url, img.alt);
        if (!result || !result.trim()) {
          setAltPopup(prev => prev ? { ...prev, aiLoading: false, aiError: t('a11y.altErrorEmptyResponse') } : null);
          return;
        }
        _altCache.set(img.url, result);
        setAltPopup(prev => prev ? { ...prev, aiText: result, aiLoading: false, aiError: undefined } : null);
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const is429 = msg.includes('429');
        if (is429 && attempt < MAX_RETRIES) {
          setAltPopup(prev => prev ? { ...prev, aiLoading: true, aiError: t('a11y.altRateLimited', { attempt, max: MAX_RETRIES }) } : null);
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
          continue;
        }
        const friendly = msg.length > 120 ? msg.slice(0, 120) + '…' : msg;
        setAltPopup(prev => prev ? { ...prev, aiLoading: false, aiError: friendly } : null);
        return;
      }
    }
  };

  const handleOpenPopup = (i: number, img: ImageData) => {
    if (altPopup?.index === i) {
      setAltPopup(null);
    } else {
      setAltPopup({ index: i, text: img.alt || '', aiLoading: false });
    }
  };

  return (
    <>
      {images.length === 1 && !fillMode ? (
        <div className="mt-2 rounded-xl overflow-hidden border border-border bg-black/5">
          <div ref={gridRef as React.RefObject<HTMLDivElement>} style={imgAspectRatio ? { aspectRatio: String(imgAspectRatio), maxHeight: 'min(70vh, 600px)' } : {}}>
            {images.map((img, i) => {
              const hasAlt = !!img.alt?.trim();
              return (
                <div key={i} className="relative w-full h-full">
                  <img
                    src={img.url}
                    alt={img.alt || t('post.imageAlt', { n: i + 1 })}
                    onLoad={(e) => setImgAspectRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
                    className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={(e) => handleImgClick(e, i)}
                  />
                  {(imageDescCallback || hasAlt) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenPopup(i, img); }}
                      className="absolute bottom-1 left-1 bg-black/70 rounded-md px-1.5 py-0.5 hover:bg-black/85 transition-colors z-10"
                      title={img.alt || t('a11y.altNoOriginal')}
                    >
                      <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
                        <rect width="24" height="14" rx="3" fill="white" fillOpacity="0.9" />
                        <text x="12" y="10" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#374151">{hasAlt ? 'ALT' : 'ALT?'}</text>
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-2 rounded-xl overflow-hidden border border-border">
          <div ref={gridRef} className={`grid ${grid}`}>
            {images.map((img, i) => {
              const spanFull = images.length === 3 && i === 2;
              const hasAlt = !!img.alt?.trim();
              return (
                <div key={i} className="relative">
                  <img
                    src={img.url}
                    alt={img.alt || t('post.imageAlt', { n: i + 1 })}
                    width="800" height="600"
                    className={`w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity ${spanFull ? 'col-span-2 h-40' : ''}`}
                    onClick={(e) => handleImgClick(e, i)}
                  />
                  {(imageDescCallback || hasAlt) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenPopup(i, img); }}
                      className="absolute bottom-1 left-1 bg-black/70 rounded-md px-1.5 py-0.5 hover:bg-black/85 transition-colors z-10"
                      title={img.alt || t('a11y.altNoOriginal')}
                    >
                      <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
                        <rect width="24" height="14" rx="3" fill="white" fillOpacity="0.9" />
                        <text x="12" y="10" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#374151">{hasAlt ? 'ALT' : 'ALT?'}</text>
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {images.length > 4 && (
            <div className="text-center text-xs text-text-secondary py-1.5 bg-surface">
              +{images.length - 4} {t('post.imageCount', { n: images.length - 4 })}
            </div>
          )}
        </div>
      )}
      <Modal open={!!altPopup} onClose={() => setAltPopup(null)} titleId="alt-popup-title">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h2 id="alt-popup-title" className="text-sm font-semibold text-text-primary">{t('compose.altLabel')}</h2>
          </div>
          {/* Original ALT */}
          {altPopup?.text?.trim() ? (
            <div className="mb-3">
              <p className="text-[10px] text-text-secondary font-medium mb-0.5">{t('a11y.altOriginal')}</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">{altPopup.text}</p>
            </div>
          ) : (
            <p className="text-sm text-text-secondary italic mb-3">{t('a11y.altNoOriginal')}</p>
          )}
          {/* AI-generated description */}
          {altPopup?.aiText && (
            <div className="mb-3 p-2 rounded bg-surface/50 border border-border">
              <p className="text-[10px] text-text-secondary font-medium mb-0.5">{t('a11y.altAIResult')}</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">{altPopup.aiText}</p>
            </div>
          )}
          {altPopup?.aiError && (
            <p className="text-xs text-red-500 mb-3">{altPopup.aiError}</p>
          )}
          {/* Generate button */}
          {imageDescCallback && (
            <button
              onClick={() => handleGenerateAlt(altPopup!.index, images[altPopup!.index]!)}
              disabled={altPopup?.aiLoading}
              className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {altPopup?.aiLoading ? t('a11y.altGenerating') : altPopup?.aiText ? t('a11y.altRegenerate') : t('a11y.altGenerate')}
            </button>
          )}
        </div>
      </Modal>
      <ImageLightboxDialog
        open={lightbox !== null && lightboxRects !== null}
        images={images}
        initial={lightbox ?? 0}
        sourceRects={lightboxRects ?? [new DOMRect(window.innerWidth / 2 - 60, window.innerHeight / 2 - 60, 120, 120)]}
        naturalAspectRatio={naturalAspectRatio}
        onClose={() => { setLightbox(null); setLightboxRects(null); }}
      />
    </>
  );
}

interface PostCardBaseProps {
  onClick?: () => void;
  isSelected?: boolean;
  children?: React.ReactNode;
  goTo?: (v: AppView) => void;
  repostBy?: string;
  /** If set, enables AI-generated ALT text via callback in ImageGrid */
  imageDescConfig?: AIConfig;
  /** Target language for AI ALT description (same as translate target lang) */
  imageDescLang?: string;
  /** Client for downloading image blobs (same path as view_image) */
  client?: BskyClient | null;
  /** Fill single images to fixed height (true) or show at original aspect ratio (false) */
  singleImageFill?: boolean;
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

export function PostCard({ onClick, isSelected, post, line, children, goTo, repostBy, imageDescConfig, imageDescLang, client, singleImageFill }: PostCardProps) {
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
  let video: VideoData | null = null;
  let hasVideo = false;
  const replyDepth = post ? getReplyDepth(post) : null;

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
    video = embeds.video;
    hasVideo = video !== null;
  } else if (line) {
    displayName = line.displayName || line.handle;
    handle = line.handle;
    text = line.text;
    indexedAt = line.indexedAt;
    likeCount = line.likeCount;
    repostCount = line.repostCount;
    replyCount = line.replyCount;
    avatarUrl = line.authorAvatar;
    if (line.imageDetails?.length) {
      images = line.imageDetails.map((d: { url: string; alt: string }) => ({ url: d.url, alt: d.alt }));
      hasImages = true;
    }
    if (line.externalLink) {
      externalLink = line.externalLink;
    }
    quotedPost = line.quotedPost;
    hasVideo = line.hasVideo;
    if (hasVideo && line.videoThumbnailUrl && line.videoPlaylistUrl) {
      video = {
        thumbnailUrl: line.videoThumbnailUrl,
        playlistUrl: line.videoPlaylistUrl,
        alt: line.videoAlt,
        aspectRatio: line.videoAspectRatio,
      };
    }
  } else {
    return null;
  }

  return (
    <div
      onClick={onClick}
      className={`mx-2 my-1.5 px-3 py-2.5 rounded-xl border border-border bg-surface/20 transition-colors transition-shadow duration-150 hover:shadow-sm ${
        onClick ? 'cursor-pointer hover:bg-surface/40' : ''
      } ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
    >
      {repostBy && (
        <div className="flex items-center gap-1 mb-2 text-text-secondary text-xs">
          <span><Icon name="repeat" size={14} /></span>
          <span>Reposted by @{repostBy}</span>
        </div>
      )}
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm overflow-hidden cursor-pointer"
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
          {replyDepth !== null && (
            <span className="inline-flex items-center text-[10px] px-1 py-0.5 rounded-md bg-primary/10 text-primary font-medium leading-none">
              ↩{replyDepth === '2+' ? ' 2+' : ''}
            </span>
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
          <p className="text-text-primary text-sm mt-1 whitespace-pre-wrap break-words line-clamp-6">
            {linkifyText(text)}
          </p>
          {hasImages && <ImageGrid images={images} singleImageFill={singleImageFill} imageDescCallback={imageDescConfig && client ? async (index, cdnUrl, alt) => {
            const m = cdnUrl.match(/\/plain\/([^/]+)\/([^@]+)/);
            if (!m) throw new Error('Could not parse image URL');
            const did = decodeURIComponent(m[1]!);
            const cid = decodeURIComponent(m[2]!);
            return describeImage(imageDescConfig, () => client.downloadBlob(did, cid), alt, imageDescLang);
          } : undefined} />}
          {video && <VideoCard thumbnailUrl={video.thumbnailUrl} playlistUrl={video.playlistUrl} alt={video.alt} aspectRatio={video.aspectRatio} />}
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
              <p className="text-primary text-xs mt-1 truncate">{externalLink.uri}</p>
            </a>
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
              <p className="text-xs text-text-primary line-clamp-3 break-words">{linkifyText(quotedPost.text)}</p>
              {quotedPost.imageDetails && quotedPost.imageDetails.length > 0 && (
                <div className="mt-1 flex gap-1">
                  {quotedPost.imageDetails.slice(0, 2).map((d: { url: string; alt: string }, idx: number) => (
                    <img key={idx} src={d.url} className="w-16 h-16 object-cover rounded-md" alt={d.alt || ''} />
                  ))}
                </div>
              )}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export { ImageGrid };
