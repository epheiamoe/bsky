export interface AtUri {
  uri: string;
  did: string;
  collection: string;
  rkey: string;
}

export function parseAtUri(uri: string): AtUri {
  // at://did:plc:abc123/app.bsky.feed.post/3lk123
  const match = uri.match(/^at:\/\/(did:plc:[^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) throw new Error(`Invalid AT URI: ${uri}`);
  return {
    uri,
    did: match[1]!,
    collection: match[2]!,
    rkey: match[3]!,
  };
}

export interface PostRecord {
  text: string;
  createdAt: string;
  embed?: ImageEmbed | ExternalEmbed | RecordEmbed | RecordWithMediaEmbed;
  facets?: Facet[];
  reply?: { root: { uri: string; cid: string }; parent: { uri: string; cid: string } };
}

export interface ImageEmbed {
  $type: 'app.bsky.embed.images';
  images: Array<{ image: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }; alt: string }>;
}

export interface ExternalEmbed {
  $type: 'app.bsky.embed.external';
  external: { uri: string; title: string; description: string; thumb?: { $type: 'blob'; ref: { $link: string } } };
}

export interface RecordEmbed {
  $type: 'app.bsky.embed.record';
  record: { uri: string; cid: string };
}

export interface RecordWithMediaEmbed {
  $type: 'app.bsky.embed.recordWithMedia';
  record: { record: { uri: string; cid: string } };
  media: ImageEmbed | ExternalEmbed;
}

export interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri?: string; did?: string; tag?: string }>;
}

export interface PostView {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  record: PostRecord;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  quoteCount?: number;
  indexedAt: string;
  viewer?: ViewerState;
  labels?: Array<{ val: string }>;
}

export interface ProfileViewBasic {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface ProfileView extends ProfileViewBasic {
  description?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  banner?: string;
  indexedAt?: string;
  viewer?: ViewerState;
}

export interface ViewerState {
  muted?: boolean;
  blockedBy?: boolean;
  following?: string;
  followedBy?: string;
  like?: string;
  repost?: string;
}

export interface ThreadViewPost {
  $type: 'app.bsky.feed.defs#threadViewPost';
  post: PostView;
  parent?: ThreadViewPost | NotFoundPost;
  replies?: Array<ThreadViewPost | NotFoundPost>;
}

export interface NotFoundPost {
  $type: 'app.bsky.feed.defs#notFoundPost';
  uri: string;
  notFound: boolean;
}

export interface Notification {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  reason: string;
  reasonSubject?: string;
  record: Record<string, unknown>;
  isRead: boolean;
  indexedAt: string;
}

export interface FeedGeneratorView {
  uri: string;
  cid: string;
  did: string;
  creator: ProfileViewBasic;
  displayName: string;
  description?: string;
  avatar?: string;
  likeCount?: number;
  viewer?: ViewerState;
  indexedAt: string;
}

export interface ListNotificationsResponse {
  cursor?: string;
  notifications: Notification[];
  priority?: boolean;
  seenAt?: string;
}

export interface TimelineResponse {
  cursor?: string;
  feed: Array<{ post: PostView; reply?: { parent: PostView; root: PostView }; reason?: unknown }>;
}

export interface AuthorFeedResponse {
  cursor?: string;
  feed: Array<{ post: PostView; reply?: { parent: PostView; root: PostView }; reason?: unknown }>;
}

export interface SearchPostsResponse {
  cursor?: string;
  posts: PostView[];
  hitsTotal?: number;
}

export interface PostThreadResponse {
  thread: ThreadViewPost | NotFoundPost;
  threadgate?: unknown;
}

export interface GetLikesResponse {
  uri: string;
  cid?: string;
  cursor?: string;
  likes: Array<{ indexedAt: string; createdAt: string; actor: ProfileViewBasic }>;
}

export interface GetRepostedByResponse {
  uri: string;
  cid?: string;
  cursor?: string;
  repostedBy: ProfileViewBasic[];
}

export interface SearchActorsResponse {
  cursor?: string;
  actors: ProfileView[];
}

export interface GetFollowsResponse {
  subject: ProfileViewBasic;
  cursor?: string;
  follows: ProfileViewBasic[];
}

export interface GetFollowersResponse {
  subject: ProfileViewBasic;
  cursor?: string;
  followers: ProfileViewBasic[];
}

export interface GetSuggestedFollowsResponse {
  suggestions: Array<{ actor: ProfileViewBasic }>;
}

export interface GetFeedResponse {
  cursor?: string;
  feed: Array<{ post: PostView; reply?: unknown; reason?: unknown }>;
}

export interface GetFeedGeneratorsResponse {
  feeds: FeedGeneratorView[];
}

export interface GetSuggestedFeedsResponse {
  feeds: FeedGeneratorView[];
  cursor?: string;
}

export interface GetFeedGeneratorResponse {
  view: FeedGeneratorView;
  isOnline: boolean;
  isValid: boolean;
}

export interface ListRecordsResponse {
  cursor?: string;
  records: Array<{ uri: string; cid: string; value: Record<string, unknown> }>;
}

export interface GetRecordResponse {
  uri: string;
  cid?: string;
  value: Record<string, unknown>;
}

export interface CreateSessionResponse {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
  email?: string;
  emailConfirmed?: boolean;
  emailAuthFactor?: boolean;
}

export interface ResolveHandleResponse {
  did: string;
}

export interface UploadBlobResponse {
  blob: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number };
}

export interface CreateRecordResponse {
  uri: string;
  cid: string;
}

export interface CreateBookmarkResponse {
  uri: string;
}

export interface DeleteBookmarkRequest {
  uri: string;
}

export interface BookmarkResult {
  subject: { uri: string; cid: string };
  createdAt: string;
  item: PostView;
}
export interface GetBookmarksResponse {
  cursor?: string;
  bookmarks: BookmarkResult[];
}
