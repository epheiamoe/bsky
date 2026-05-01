/** Built-in Bluesky feed URIs */
export const BUILTIN_FEEDS = {
  discover: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot',
  following: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/following',
} as const;

export type FeedInfo = {
  uri: string;
  label: string;
  description?: string;
  avatar?: string;
  creator?: string;
};

/** Recommended feeds shown to new users */
export const RECOMMENDED_FEEDS: FeedInfo[] = [
  { uri: BUILTIN_FEEDS.discover, label: 'Discover', description: 'Bluesky 官方推荐 — 热门内容' },
  { uri: BUILTIN_FEEDS.following, label: 'Following', description: '仅你关注的用户（使用主页时间线）' },
];

/**
 * Get a display label for a feed URI.
 * Returns custom label if known, otherwise try to extract from URI.
 */
export function getFeedLabel(uri: string): string {
  if (uri === BUILTIN_FEEDS.discover) return 'Discover';
  if (uri === BUILTIN_FEEDS.following) return 'Following';
  // Extract last segment as label for custom feeds
  const parts = uri.split('/');
  return parts[parts.length - 1] ?? uri;
}

/**
 * Resolve a feed label to a full URI. Returns uri as-is if not a known short name.
 */
export function resolveFeedId(id: string): string {
  if (id === 'following') return BUILTIN_FEEDS.following;
  if (id === 'discover' || id === 'whats-hot') return BUILTIN_FEEDS.discover;
  return id; // custom feed URI
}
