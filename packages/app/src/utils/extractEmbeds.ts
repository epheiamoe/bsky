import type { PostView } from '@bsky/core';
import { getCdnImageUrl, getVideoThumbnailUrl, getVideoPlaylistUrl } from './imageUrl.js';

export interface ExtractImage {
  url: string;
  alt: string;
}

export interface ExtractExternalLink {
  uri: string;
  title: string;
  description: string;
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

export function extractVideo(post: PostView): ExtractVideo | null {
  const embed = post.record.embed as Record<string, unknown> | undefined;
  if (!embed) return null;
  if ((embed.$type as string) !== 'app.bsky.embed.video') return null;

  const viewEmbed = (post as any).embed as {
    cid?: string;
    thumbnail?: string;
    playlist?: string;
  } | undefined;
  const cid = viewEmbed?.cid ?? ((embed.video as any)?.ref?.$link as string | undefined) ?? '';
  const playlistUrl = viewEmbed?.playlist;

  return {
    thumbnailUrl: viewEmbed?.thumbnail || getVideoThumbnailUrl(post.author.did, cid),
    playlistUrl,
    alt: (embed.alt as string) || '',
    aspectRatio: embed.aspectRatio as { width: number; height: number } | undefined,
    processing: !playlistUrl,
  };
}

export function extractExternalLink(post: PostView): ExtractExternalLink | null {
  const embed = post.record.embed as Record<string, unknown> | undefined;
  if (!embed) return null;
  if ((embed.$type as string) !== 'app.bsky.embed.external') return null;
  const ext = embed.external as Record<string, string> | undefined;
  if (!ext) return null;
  return {
    uri: ext.uri || '',
    title: ext.title || '',
    description: ext.description || '',
  };
}

export function extractQuotedPost(post: PostView): ExtractQuotedPost | null {
  const embed = (post as any).embed as Record<string, unknown> | undefined;
  if (!embed) return null;

  const type = embed.$type as string | undefined;
  const isRecord = type === 'app.bsky.embed.record#view' || type === 'app.bsky.embed.record';
  const isRecordWithMedia = type === 'app.bsky.embed.recordWithMedia#view' || type === 'app.bsky.embed.recordWithMedia';
  if (!isRecord && !isRecordWithMedia) return null;

  const rec = embed.record as Record<string, unknown> | undefined;
  if (!rec?.uri) return null;

  // Skip non-post records (e.g., lists, feeds)
  const recordType = rec.$type as string | undefined;
  if (recordType === 'app.bsky.graph.defs#listView' || recordType === 'app.bsky.feed.defs#generatorView') return null;

  const imageDetails: ExtractImage[] = [];
  let externalLink: ExtractExternalLink | null = null;
  const recEmbeds = rec.embeds as Array<Record<string, unknown>> | undefined;
  if (recEmbeds?.[0]) {
    const e = recEmbeds[0]!;
    const eType = e.$type as string | undefined;
    if ((eType === 'app.bsky.embed.images#view' || eType === 'app.bsky.embed.images') && Array.isArray(e.images)) {
      const authorDid = (rec.author as Record<string, string> | undefined)?.did ?? '';
      for (const img of e.images as Array<Record<string, unknown>>) {
        const url = (img as any).fullsize || getCdnImageUrl(authorDid, (img as any).image?.ref?.$link || '', (img as any).image?.mimeType || 'image/jpeg');
        if (url) imageDetails.push({ url, alt: (img.alt as string) || '' });
      }
    } else if ((eType === 'app.bsky.embed.external#view' || eType === 'app.bsky.embed.external') && e.external) {
      const ext = e.external as Record<string, string>;
      externalLink = { uri: ext.uri || '', title: ext.title || '', description: ext.description || '' };
    }
  }

  const author = rec.author as Record<string, string> | undefined;
  const value = rec.value as Record<string, string> | undefined;

  return {
    uri: rec.uri as string,
    cid: (rec.cid as string) ?? '',
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
    if ((type === 'app.bsky.embed.recordWithMedia' || type === 'app.bsky.embed.recordWithMedia#view') && e.media) {
      return checkGif(e.media as Record<string, unknown>);
    }
    return false;
  };
  return checkGif(embed);
}

export function extractEmbeds(post: PostView): { images: ExtractImage[]; video: ExtractVideo | null; external: ExtractExternalLink | null; list: ExtractListEmbed | null; hasGif: boolean } {
  return {
    images: extractImages(post),
    video: extractVideo(post),
    external: extractExternalLink(post),
    list: extractListEmbed(post),
    hasGif: extractHasGif(post),
  };
}
