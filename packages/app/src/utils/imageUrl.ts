/**
 * Construct a Bluesky CDN image URL.
 * Uses cdn.bsky.app which serves images with proper Content-Type headers
 * for inline browser viewing (unlike the PDS blob endpoint which forces download).
 * 
 * Format: https://cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}@{ext}
 */
export function getCdnImageUrl(did: string, cid: string, mimeType?: string): string {
  const ext = mimeType?.split('/')[1] || 'jpeg';
  return `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(did)}/${encodeURIComponent(cid)}@${ext}`;
}
