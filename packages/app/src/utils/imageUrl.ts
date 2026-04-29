type ImageSize = 'full' | 'large' | 'small' | 'thumb';

export function getCdnImageUrl(did: string, cid: string, mimeType: string, size: ImageSize = 'full'): string {
  const fmt = mimeType.split('/')[1] ?? 'jpeg';
  return `https://cdn.bsky.social/imgz/${size}/${fmt}/${did}/${cid}@${fmt}`;
}
