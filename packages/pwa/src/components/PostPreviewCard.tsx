import React, { useState } from 'react';
import type { PostView, AIConfig, BskyClient, ModerationDecision } from '@bsky/core';
import { parseAtUri, describeImage } from '@bsky/core';
import type { FlatLine, AppView } from '@bsky/app';
import { extractEmbeds, extractQuotedPost, getCdnImageUrl, getVideoThumbnailUrl, getVideoPlaylistUrl, useI18n } from '@bsky/app';
import type { ExtractExternalLink, ExtractQuotedPost, ExtractVideo, ExtractListEmbed, ExtractGallery, ExtractGalleryItem } from '@bsky/app';
import { isPostLiked, isPostReposted, likePost, repostPost } from '@bsky/app';
import { formatTime } from '../utils/format.js';
import { Icon } from './Icon.js';
import { VideoCard } from './VideoCard.js';
import { ImageGrid } from './ImageGrid.js';
import type { ImageData } from './ImageGrid.js';
import { HiddenBanner } from './HiddenBanner.js';
import { ModerationLabelBar } from './ModerationLabelBar.js';
import { LabelDetailModal } from './LabelDetailModal.js';
import { ListEmbedCard } from './ListEmbedCard.js';
import { GalleryCard } from './GalleryCard.js';
import { ExternalLinkCard } from './ExternalLinkCard.js';
import { ImageLightboxDialog } from './ImageLightboxDialog.js';

function getReplyDepth(post: PostView): number | '2+' | null {
  const reply = (post.record as any).reply as { root: { uri: string }; parent: { uri: string } } | undefined;
  if (!reply) return null;
  if (reply.root.uri === reply.parent.uri) return 1;
  return '2+';
}

function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function truncateName(name: string, max = 15): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

const LINK_REGEX = /(https?:\/\/[^\s<>"']+|@[a-zA-Z0-9._-]+(?:\.[a-zA-Z]{2,})+|#[\p{L}\p{N}_]+|at:\/\/did:[a-z]+:[^\/\s]+\/[a-zA-Z.0-9-]+\/[a-zA-Z0-9~_.-]+)/gu;

export function linkifyText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[1];
    if (token.startsWith('at://')) {
      try {
        const parsed = parseAtUri(token);
        let href: string;
        switch (parsed.collection) {
          case 'app.bsky.feed.post':
            href = `#/thread?uri=${encodeURIComponent(token)}`;
            break;
          case 'app.bsky.graph.list':
            href = `#/list?uri=${encodeURIComponent(token)}`;
            break;
          case 'app.bsky.feed.generator':
            href = `#/feed?feed=${encodeURIComponent(token)}`;
            break;
          default:
            href = `#/profile?actor=${encodeURIComponent(parsed.did)}`;
        }
        parts.push(<a key={match.index} className="text-blue-500 hover:underline" href={href} onClick={(e) => e.stopPropagation()}>{token}</a>);
      } catch {
        parts.push(<span key={match.index} className="text-text-secondary">{token}</span>);
      }
    } else if (token.startsWith('@')) {
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

interface PostPreviewCardProps {
  onClick?: () => void;
  isSelected?: boolean;
  children?: React.ReactNode;
  goTo?: (v: AppView) => void;
  repostBy?: string;
  imageDescConfig?: AIConfig;
  imageDescLang?: string;
  client?: BskyClient | null;
  singleImageFill?: boolean;
  previewLines?: number;
  quotedPreviewLines?: number;
  moderationDecision?: ModerationDecision | null;
}

interface PostPreviewCardWithPost extends PostPreviewCardProps {
  post: PostView;
  line?: never;
}

interface PostPreviewCardWithLine extends PostPreviewCardProps {
  post?: never;
  line: FlatLine;
}

type PostPreviewCardCombinedProps = PostPreviewCardWithPost | PostPreviewCardWithLine;

export function PostPreviewCard({
  onClick,
  isSelected,
  post,
  line,
  children,
  goTo,
  repostBy,
  imageDescConfig,
  imageDescLang,
  client,
  singleImageFill,
  previewLines = 10,
  quotedPreviewLines = 8,
  moderationDecision,
}: PostPreviewCardCombinedProps) {
  const { t } = useI18n();
  const [contentRevealed, setContentRevealed] = useState(false);
  const [mediaRevealed, setMediaRevealed] = useState(false);
  const [galleryLightbox, setGalleryLightbox] = useState<number | null>(null);
  const [gallerySourceRect, setGallerySourceRect] = useState<DOMRect | null>(null);

  let displayName: string;
  let handle: string;
  let text: string;
  let indexedAt: string;
  let likeCount: number | undefined;
  let repostCount: number | undefined;
  let replyCount: number | undefined;
  let hasImages = false;
  let images: ImageData[] = [];
  let externalLink: ExtractExternalLink | null = null;
  let avatarUrl: string | undefined;
  let quotedPost: ExtractQuotedPost | null;
  let listEmbed: ExtractListEmbed | null = null;
  let video: ExtractVideo | null = null;
  let hasVideo = false;
  let gallery: ExtractGallery | null = null;
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
    listEmbed = embeds.list;
    quotedPost = extractQuotedPost(post);
    video = embeds.video;
    hasVideo = video !== null;
    gallery = embeds.gallery;
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
    listEmbed = (line as any).listEmbed as ExtractListEmbed | undefined ?? null;
    quotedPost = (line.quotedPost as ExtractQuotedPost | undefined) ?? null;
    hasVideo = line.hasVideo;
    if (hasVideo && line.videoThumbnailUrl && line.videoPlaylistUrl) {
      video = {
        thumbnailUrl: line.videoThumbnailUrl!,
        playlistUrl: line.videoPlaylistUrl!,
        alt: line.videoAlt ?? '',
        aspectRatio: line.videoAspectRatio,
      };
    }
  } else {
    return null;
  }

  const showContentHidden = moderationDecision?.contentAction === 'hide' && !contentRevealed;
  const isContentBlurred = moderationDecision?.contentAction === 'warn' && !contentRevealed;
  const isMediaBlurred = moderationDecision?.mediaAction === 'blur' && !mediaRevealed;

  return (
    <>
      <div
        onClick={onClick}
        className={`mx-2 my-1.5 px-3 py-2.5 rounded-xl border border-border bg-surface/20 transition-colors transition-shadow duration-150 hover:shadow-sm overflow-hidden ${
          onClick ? 'cursor-pointer hover:bg-surface/40' : ''
        } ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
      >
      {repostBy && (
        <div className="flex items-center gap-1 mb-2 text-text-secondary text-xs">
          <span><Icon name="repeat" size={14} /></span>
          <span>Reposted by @{repostBy}</span>
        </div>
      )}

      {showContentHidden ? (
        <HiddenBanner
          decision={moderationDecision}
          onShow={() => setContentRevealed(true)}
        />
      ) : (
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

            {/* Content-level moderation banner — between header and content */}
            {moderationDecision?.contentAction === 'warn' && (
              <ModerationLabelBar
                decision={moderationDecision}
                isRevealed={contentRevealed}
                onToggle={() => setContentRevealed(!contentRevealed)}
              />
            )}

            <div className={isContentBlurred ? 'blur-2xl brightness-50 transition-all duration-300 pointer-events-none select-none overflow-hidden rounded-lg' : ''}>
              {/* Badge row — shown under handle for show/badge level posts only */}
              {moderationDecision && moderationDecision.contentAction === 'none' && moderationDecision.badges.length > 0 && (
                <BadgeRow decision={moderationDecision} />
              )}

              {/* Text content — always visible */}
              <p className="text-text-primary text-sm mt-1 whitespace-pre-wrap break-words" style={{ WebkitLineClamp: previewLines }}>
                {linkifyText(text)}
              </p>

              {/* Media-level moderation banner — between text and media */}
              {moderationDecision?.mediaAction === 'blur' && moderationDecision.contentAction === 'none' && (
                <ModerationLabelBar
                  decision={moderationDecision}
                  isRevealed={mediaRevealed}
                  onToggle={() => setMediaRevealed(!mediaRevealed)}
                />
              )}

              {/* Images */}
              {hasImages && (
                <div className={`overflow-hidden rounded-lg ${isMediaBlurred ? 'blur-2xl brightness-50 transition-all duration-300 pointer-events-none' : ''}`}>
                  <ImageGrid
                    images={images}
                    singleImageFill={singleImageFill}
                    imageDescCallback={imageDescConfig && client ? async (index, cdnUrl, alt) => {
                      const m = cdnUrl.match(/\/plain\/([^/]+)\/([^@]+)/);
                      if (!m) throw new Error('Could not parse image URL');
                      const did = decodeURIComponent(m[1]!);
                      const cid = decodeURIComponent(m[2]!);
                      return describeImage(imageDescConfig, () => client.downloadBlob(did, cid), alt, imageDescLang);
                    } : undefined}
                  />
                </div>
              )}

              {/* Video */}
              {video && (
                <div className={`overflow-hidden rounded-lg ${isMediaBlurred ? 'blur-2xl brightness-50 transition-all duration-300 pointer-events-none' : ''}`}>
                  <VideoCard
                    thumbnailUrl={video.thumbnailUrl}
                    playlistUrl={video.playlistUrl}
                    alt={video.alt}
                    aspectRatio={video.aspectRatio}
                  />
                </div>
              )}

              {/* Gallery */}
              {gallery && gallery.images.length > 0 && (
                <div className={isMediaBlurred ? 'blur-2xl brightness-50 transition-all duration-300 pointer-events-none' : ''}>
                  <GalleryCard
                    images={gallery.images}
                    onImageClick={(index, e) => {
                      setGalleryLightbox(index);
                      setGallerySourceRect(e.currentTarget.getBoundingClientRect());
                    }}
                  />
                </div>
              )}

              {externalLink && <ExternalLinkCard link={externalLink} onOpenInternal={(view) => goTo?.(view)} />}

              {listEmbed && (
                <ListEmbedCard
                  list={listEmbed}
                  onClick={() => {
                    if (goTo) goTo({ type: 'listDetail', uri: listEmbed.uri });
                  }}
                />
              )}
              {quotedPost && (
                <div
                  className="mt-2 border border-border rounded-xl p-3 bg-surface overflow-hidden hover:bg-surface/80 hover:border-primary/30 transition-colors cursor-pointer"
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
                  <p className="text-xs text-text-primary break-words" style={{ WebkitLineClamp: quotedPreviewLines }}>{linkifyText(quotedPost.text)}</p>
                  {quotedPost.imageDetails && quotedPost.imageDetails.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {quotedPost.imageDetails.slice(0, 2).map((d: { url: string; alt: string }, idx: number) => (
                        <img key={idx} src={d.url} className="w-16 h-16 object-cover rounded-md" alt={d.alt || ''} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {children}
          </div>
        </div>
      )}
      </div>
      {gallery && (
        <ImageLightboxDialog
          open={galleryLightbox !== null}
          images={gallery.images.map((img: ExtractGalleryItem) => ({ url: img.fullsize, alt: img.alt }))}
          initial={galleryLightbox ?? 0}
          sourceRects={gallerySourceRect ? [gallerySourceRect] : [new DOMRect(window.innerWidth / 2 - 60, window.innerHeight / 2 - 60, 120, 120)]}
          naturalAspectRatio={galleryLightbox !== null ? (() => {
            const img = gallery.images[galleryLightbox];
            if (img?.aspectRatio?.width && img.aspectRatio.height) {
              return img.aspectRatio.width / img.aspectRatio.height;
            }
            return 1;
          })() : 1}
          onClose={() => setGalleryLightbox(null)}
        />
      )}
    </>
  );
}

/** Badge row — shown at top under handle, blue style */
function BadgeRow({ decision }: { decision: ModerationDecision }) {
  const [showModal, setShowModal] = useState(false);

  if (decision.badges.length === 0) return null;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
        className="flex items-center gap-1 mt-1 max-w-full overflow-hidden"
        title="查看标签详情"
      >
        <div className="flex items-center gap-1 overflow-hidden">
          {decision.sources.map(source =>
            source.labels.map(label => (
              <span
                key={`${source.labelerDid}-${label.val}`}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shrink-0 whitespace-nowrap"
              >
                @{source.labelerName || source.labelerDid}/{label.name || label.val}
              </span>
            ))
          )}
          {decision.badges.length > 2 && (
            <span className="text-[10px] text-blue-500 shrink-0">+{decision.badges.length - 2}</span>
          )}
        </div>
      </button>
      {showModal && (
        <LabelDetailModal
          sources={decision.sources}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

/** Warning label row — shown at bottom, amber style */
function WarningLabelRow({ decision }: { decision: ModerationDecision }) {
  const [showModal, setShowModal] = useState(false);

  if (decision.sources.length === 0) return null;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
        className="flex items-center gap-1 mt-2 max-w-full overflow-hidden"
        title="查看标签详情"
      >
        <div className="flex items-center gap-1 overflow-hidden">
          {decision.sources.map(source =>
            source.labels.map(label => (
              <span
                key={`${source.labelerDid}-${label.val}`}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shrink-0 whitespace-nowrap"
              >
                @{source.labelerName || source.labelerDid}/{label.name || label.val}
              </span>
            ))
          )}
        </div>
      </button>
      {showModal && (
        <LabelDetailModal
          sources={decision.sources}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}


