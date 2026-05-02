/**
 * Construct a Bluesky CDN image URL.
 * Uses cdn.bsky.app which serves images with proper Content-Type headers
 * for inline browser viewing (unlike the PDS blob endpoint which forces download).
 * 
 * Format: https://cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}@{ext}
 * 
 * GIFs use @gif extension to preserve animation; other formats use @jpeg.
 */
export function getCdnImageUrl(did: string, cid: string, mimeType?: string): string {
  const ext = mimeType?.includes('gif') ? 'gif' : (mimeType?.split('/')[1] || 'jpeg');
  return `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(did)}/${encodeURIComponent(cid)}@${ext}`;
}

export function getVideoThumbnailUrl(did: string, cid: string): string {
  return `https://video.bsky.app/watch/${encodeURIComponent(did)}/${encodeURIComponent(cid)}/thumbnail.jpg`;
}

export function getVideoPlaylistUrl(did: string, cid: string): string {
  return `https://video.bsky.app/watch/${encodeURIComponent(did)}/${encodeURIComponent(cid)}/playlist.m3u8`;
}
