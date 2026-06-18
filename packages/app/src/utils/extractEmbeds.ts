import type { PostView } from '@bsky/core';
import { getCdnImageUrl, getVideoThumbnailUrl, getVideoPlaylistUrl } from './imageUrl.js';

export interface ExtractImage {
  url: string;
  alt: string;
}

/** RGB color definition, per app.bsky.embed.external#colorRGB. All values 0-255. */
export interface ExternalSourceTheme {
  backgroundRGB?: { r: number; g: number; b: number };
  foregroundRGB?: { r: number; g: number; b: number };
  accentRGB?: { r: number; g: number; b: number };
  accentForegroundRGB?: { r: number; g: number; b: number };
}

/** Convert a {r,g,b} color object to CSS "rgb(r,g,b)" string */
export function colorRGBToString(c?: { r: number; g: number; b: number }): string | undefined {
  if (!c) return undefined;
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** Publication source metadata from viewExternal */
export interface ExternalSource {
  uri: string;
  icon?: string;
  title: string;
  description?: string;
  theme?: ExternalSourceTheme;
}

/**
 * External link embed — enhanced with viewExternal rich metadata.
 * Fields marked [view] are only available from API-resolved #view data.
 * Fields without [view] come from record-level embed.external.
 */
export interface ExtractExternalLink {
  /** The external URI */
  uri: string;
  /** Link title (from record) */
  title: string;
  /** Link description (from record) */
  description: string;

  // ── viewExternal rich metadata (all optional) ──
  /** Thumbnail image CDN URL [view] */
  thumb?: string;
  /** Content creation timestamp [view] */
  createdAt?: string;
  /** Content update timestamp [view] */
  updatedAt?: string;
  /** Estimated reading time in minutes [view] */
  readingTime?: number;
  /** Labels attached to the external content [view] */
  labels?: Array<{ val: string }>;
  /** Publication source with icon + theme [view] */
  source?: ExternalSource;
}

export interface ExtractVideo {
  thumbnailUrl: string;
  playlistUrl?: string;
  alt: string;
  aspectRatio?: { width: number; height: number };
  /** True when no API-resolved playlist is available (raw blob or still processing). */
  processing?: boolean;
}

export interface ExtractQuotedPost {
  uri: string;
  cid: string;
  text: string;
  handle: string;
  displayName: string;
  authorAvatar?: string;
  imageDetails: ExtractImage[];
  externalLink: ExtractExternalLink | null;
}

export interface ExtractListEmbed {
  uri: string;
  cid: string;
  name: string;
  description?: string;
  avatar?: string;
  creatorHandle: string;
  creatorDisplayName: string;
  creatorAvatar?: string;
  listItemCount: number;
  purpose: string;
}

/**
 * A single image item within a gallery embed.
 * View-side: contains thumbnail + fullsize CDN URLs.
 * Record-side: contains image blob ref + alt + aspectRatio.
 */
export interface ExtractGalleryItem {
  /** CDN thumbnail URL (from view) */
  thumbnail: string;
  /** CDN fullsize URL (from view) */
  fullsize: string;
  /** ALT text (from record or view) */
  alt: string;
  /** Aspect ratio { width, height } (from view or record) */
  aspectRatio?: { width: number; height: number };
}

/**
 * Gallery embed — app.bsky.embed.gallery type (2026 H1).
 * Schema maxLength: 20, client soft limit: 10.
 * Rendered as a swipeable carousel with count badge.
 */
export interface ExtractGallery {
  /** Gallery images (view-side resolved CDN URLs) */
  images: ExtractGalleryItem[];
}

export function extractImages(post: PostView): ExtractImage[] {
  const images: ExtractImage[] = [];
  const embed = post.record.embed as Record<string, unknown> | undefined;
  if (!embed) return images;

  const collect = (e: Record<string, unknown>) => {
    const type = e.$type as string | undefined;
    if (!type) return;
    if ((type === 'app.bsky.embed.images' || type === 'app.bsky.embed.images#view') && Array.isArray(e.images)) {
      for (const img of e.images as Array<Record<string, unknown>>) {
        images.push({
          url: (img as any).fullsize || getCdnImageUrl(post.author.did, ((img as any).image?.ref?.$link as string) ?? '', ((img as any).image?.mimeType as string) ?? 'image/jpeg'),
          alt: (img.alt as string) || '',
        });
      }
    } else if ((type === 'app.bsky.embed.recordWithMedia' || type === 'app.bsky.embed.recordWithMedia#view') && e.media) {
      collect(e.media as Record<string, unknown>);
    }
  };
  collect(embed);

  return images;
}

export function extractGallery(post: PostView): ExtractGallery | null {
  const embed = post.record.embed as Record<string, unknown> | undefined;
  if (!embed) return null;

  const resolve = (e: Record<string, unknown>): ExtractGallery | null => {
    const type = e.$type as string | undefined;
    if ((type === 'app.bsky.embed.gallery' || type === 'app.bsky.embed.gallery#view') && Array.isArray(e.items)) {
      // Try to get view-side resolved data from (post as any).embed
      const viewEmbed = (post as any).embed as Record<string, unknown> | undefined;
      const viewItems = (viewEmbed?.$type === 'app.bsky.embed.gallery#view')
        ? (viewEmbed.items as Array<Record<string, unknown>> | undefined)
        : undefined;

      const images: ExtractGalleryItem[] = [];
      const items = e.items as Array<Record<string, unknown>>;
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]!;
        // Prefer view-side resolved data (has CDN URLs)
        const viewItem = viewItems?.[idx];
        images.push({
          thumbnail: (viewItem?.thumbnail as string) || (item.thumbnail as string) || '',
          fullsize: (viewItem?.fullsize as string) || (item.fullsize as string) || '',
          alt: (item.alt as string) || (viewItem?.alt as string) || '',
          aspectRatio: (viewItem?.aspectRatio as { width: number; height: number })
            || (item.aspectRatio as { width: number; height: number })
            || undefined,
        });
      }
      return images.length > 0 ? { images } : null;
    }
    // Recurse into recordWithMedia (gallery + quote)
    if ((type === 'app.bsky.embed.recordWithMedia' || type === 'app.bsky.embed.recordWithMedia#view') && e.media) {
      return resolve(e.media as Record<string, unknown>);
    }
    return null;
  };

  return resolve(embed);
}

export function extractVideo(post: PostView): ExtractVideo | null {
  const recordEmbed = post.record.embed as Record<string, unknown> | undefined;
  const viewEmbed = (post as any).embed as Record<string, unknown> | undefined;
  if (!recordEmbed) return null;

  const resolve = (recordE: Record<string, unknown>, viewE?: Record<string, unknown>): ExtractVideo | null => {
    const type = recordE.$type as string | undefined;
    if (type === 'app.bsky.embed.video' || type === 'app.bsky.embed.video#view') {
      const viewVideo = viewE as { cid?: string; thumbnail?: string; playlist?: string } | undefined;
      const cid = viewVideo?.cid ?? ((recordE.video as any)?.ref?.$link as string | undefined) ?? '';
      const playlistUrl = viewVideo?.playlist;
      return {
        thumbnailUrl: viewVideo?.thumbnail || getVideoThumbnailUrl(post.author.did, cid),
        playlistUrl,
        alt: (recordE.alt as string) || '',
        aspectRatio: recordE.aspectRatio as { width: number; height: number } | undefined,
        processing: !playlistUrl,
      };
    }
    if ((type === 'app.bsky.embed.recordWithMedia' || type === 'app.bsky.embed.recordWithMedia#view') && recordE.media) {
      return resolve(recordE.media as Record<string, unknown>, viewE?.media as Record<string, unknown> | undefined);
    }
    return null;
  };

  return resolve(recordEmbed, viewEmbed);
}

export function extractExternalLink(post: PostView): ExtractExternalLink | null {
  const recordEmbed = post.record.embed as Record<string, unknown> | undefined;
  if (!recordEmbed) return null;
  if ((recordEmbed.$type as string) !== 'app.bsky.embed.external') return null;

  const ext = recordEmbed.external as Record<string, string> | undefined;
  if (!ext) return null;

  const result: ExtractExternalLink = {
    uri: ext.uri || '',
    title: ext.title || '',
    description: ext.description || '',
  };

  // ── Merge view-side rich metadata ──
  const viewEmbed = (post as any).embed as Record<string, unknown> | undefined;
  if (viewEmbed?.$type === 'app.bsky.embed.external#view') {
    const viewExt = viewEmbed.external as Record<string, unknown> | undefined;
    if (viewExt) {
      if (viewExt.thumb) result.thumb = viewExt.thumb as string;
      if (viewExt.createdAt) result.createdAt = viewExt.createdAt as string;
      if (viewExt.updatedAt) result.updatedAt = viewExt.updatedAt as string;
      if (typeof viewExt.readingTime === 'number') result.readingTime = viewExt.readingTime;
      if (Array.isArray(viewExt.labels)) result.labels = viewExt.labels as Array<{ val: string }>;

      // source: publication metadata (Standard.site, Ghost, Substack, etc.)
      const src = viewExt.source as Record<string, unknown> | undefined;
      if (src) {
        const theme = src.theme as Record<string, unknown> | undefined;
        result.source = {
          uri: (src.uri as string) || '',
          icon: src.icon as string | undefined,
          title: (src.title as string) || '',
          description: src.description as string | undefined,
          theme: theme ? {
            backgroundRGB: theme.backgroundRGB as ExternalSourceTheme['backgroundRGB'],
            foregroundRGB: theme.foregroundRGB as ExternalSourceTheme['foregroundRGB'],
            accentRGB: theme.accentRGB as ExternalSourceTheme['accentRGB'],
            accentForegroundRGB: theme.accentForegroundRGB as ExternalSourceTheme['accentForegroundRGB'],
          } : undefined,
        };
      }
    }
  }

  return result;
}

export function extractQuotedPost(post: PostView): ExtractQuotedPost | null {
  const embed = (post as any).embed as Record<string, unknown> | undefined;
  if (!embed) return null;

  const type = embed.$type as string | undefined;
  const isRecord = type === 'app.bsky.embed.record#view' || type === 'app.bsky.embed.record';
  const isRecordWithMedia = type === 'app.bsky.embed.recordWithMedia#view' || type === 'app.bsky.embed.recordWithMedia';
  if (!isRecord && !isRecordWithMedia) return null;

  const recordWrapper = embed.record as Record<string, unknown> | undefined;
  // For recordWithMedia#view, embed.record is itself an app.bsky.embed.record#view
  // wrapper; the actual quoted viewRecord lives one level deeper at embed.record.record.
  const quotedViewRecord = isRecordWithMedia && recordWrapper
    ? (recordWrapper.record as Record<string, unknown> | undefined)
    : recordWrapper;
  if (!quotedViewRecord?.uri) return null;

  // Skip non-post records (e.g., lists, feeds)
  const recordType = quotedViewRecord.$type as string | undefined;
  if (recordType === 'app.bsky.graph.defs#listView' || recordType === 'app.bsky.feed.defs#generatorView') return null;

  const imageDetails: ExtractImage[] = [];
  let externalLink: ExtractExternalLink | null = null;
  const recEmbeds = quotedViewRecord.embeds as Array<Record<string, unknown>> | undefined;
  if (recEmbeds?.[0]) {
    const e = recEmbeds[0]!;
    const eType = e.$type as string | undefined;
    if ((eType === 'app.bsky.embed.images#view' || eType === 'app.bsky.embed.images') && Array.isArray(e.images)) {
      const authorDid = (quotedViewRecord.author as Record<string, string> | undefined)?.did ?? '';
      for (const img of e.images as Array<Record<string, unknown>>) {
        const url = (img as any).fullsize || getCdnImageUrl(authorDid, (img as any).image?.ref?.$link || '', (img as any).image?.mimeType || 'image/jpeg');
        if (url) imageDetails.push({ url, alt: (img.alt as string) || '' });
      }
    } else if ((eType === 'app.bsky.embed.external#view' || eType === 'app.bsky.embed.external') && e.external) {
      const ext = e.external as Record<string, string>;
      externalLink = { uri: ext.uri || '', title: ext.title || '', description: ext.description || '' };
    }
  }

  const author = quotedViewRecord.author as Record<string, string> | undefined;
  const value = quotedViewRecord.value as Record<string, string> | undefined;

  return {
    uri: quotedViewRecord.uri as string,
    cid: (quotedViewRecord.cid as string) ?? '',
    text: value?.text ?? '',
    handle: author?.handle ?? '',
    displayName: author?.displayName ?? author?.handle ?? '',
    authorAvatar: author?.avatar,
    imageDetails,
    externalLink,
  };
}

export function extractListEmbed(post: PostView): ExtractListEmbed | null {
  const embed = (post as any).embed as Record<string, unknown> | undefined;
  if (!embed) return null;

  const type = embed.$type as string | undefined;
  if (type !== 'app.bsky.embed.record#view' && type !== 'app.bsky.embed.record') return null;

  const record = embed.record as Record<string, unknown> | undefined;
  if (!record) return null;

  const recordType = record.$type as string | undefined;
  if (recordType !== 'app.bsky.graph.defs#listView') return null;

  const creator = record.creator as Record<string, string> | undefined;

  return {
    uri: record.uri as string,
    cid: (record.cid as string) ?? '',
    name: (record.name as string) ?? '',
    description: record.description as string | undefined,
    avatar: record.avatar as string | undefined,
    creatorHandle: creator?.handle ?? '',
    creatorDisplayName: creator?.displayName ?? creator?.handle ?? '',
    creatorAvatar: creator?.avatar,
    listItemCount: (record.listItemCount as number) ?? 0,
    purpose: (record.purpose as string) ?? '',
  };
}

export function extractHasGif(post: PostView): boolean {
  const embed = post.record.embed as Record<string, unknown> | undefined;
  if (!embed) return false;

  const checkGif = (e: Record<string, unknown>): boolean => {
    const type = e.$type as string | undefined;
    if (!type) return false;
    if ((type === 'app.bsky.embed.images' || type === 'app.bsky.embed.images#view') && Array.isArray(e.images)) {
      return (e.images as Array<Record<string, unknown>>).some(img => {
        const mime = (img.image as Record<string, string> | undefined)?.mimeType || (img as any).mimeType || '';
        return mime.includes('gif');
      });
    }
    if ((type === 'app.bsky.embed.gallery' || type === 'app.bsky.embed.gallery#view') && Array.isArray(e.items)) {
      return (e.items as Array<Record<string, unknown>>).some(item => {
        // Record-side: check image blob mimeType
        const mime = ((item as any).image?.mimeType as string) || '';
        // View-side fallback: check URL extension
        if (!mime) {
          const url = ((item as any).fullsize as string) || ((item as any).thumbnail as string) || '';
          return url.toLowerCase().endsWith('.gif');
        }
        return mime.includes('gif');
      });
    }
    if ((type === 'app.bsky.embed.recordWithMedia' || type === 'app.bsky.embed.recordWithMedia#view') && e.media) {
      return checkGif(e.media as Record<string, unknown>);
    }
    return false;
  };
  return checkGif(embed);
}

export function extractEmbeds(post: PostView): { images: ExtractImage[]; video: ExtractVideo | null; external: ExtractExternalLink | null; list: ExtractListEmbed | null; gallery: ExtractGallery | null; hasGif: boolean } {
  return {
    images: extractImages(post),
    video: extractVideo(post),
    external: extractExternalLink(post),
    list: extractListEmbed(post),
    gallery: extractGallery(post),
    hasGif: extractHasGif(post),
  };
}
