/**
 * Construct a Bluesky blob download URL.
 * Uses the PDS endpoint which auto-redirects to the hosting server.
 * Works in browser <img> tags (browsers follow 302 redirects).
 */
export function getCdnImageUrl(did: string, cid: string, _mimeType?: string): string {
  return `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
}
