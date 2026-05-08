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
  embed?: ImageEmbed | ExternalEmbed | RecordEmbed | RecordWithMediaEmbed | VideoEmbed;
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

export interface VideoEmbed {
  $type: 'app.bsky.embed.video';
  video: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number };
  aspectRatio?: { width: number; height: number };
  alt?: string;
  captions?: Array<{ lang: string; file: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number } }>;
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
  embed?: Record<string, unknown>;
  embedCount?: number;
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  indexedAt?: string;
  viewer?: ViewerState;
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
  suggestions: ProfileView[];
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

export interface TrendingTopic {
  topic: string;
  displayName: string;
  description: string;
  link: string;
}

export interface GetTrendsResponse {
  trends: TrendingTopic[];
  /** Optional: the DID of the account used for personalization */
  personalizedFor?: string;
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

export interface DraftPostInput {
  text: string;
}

export interface DraftInput {
  posts: DraftPostInput[];
  deviceId?: string;
  deviceName?: string;
  langs?: string[];
}

export interface DraftView {
  id: string;
  draft: DraftInput;
  createdAt: string;
  updatedAt: string;
}

export interface DraftsResponse {
  cursor?: string;
  drafts: DraftView[];
}

export interface CreateDraftResponse {
  id: string;
}

// ── List (app.bsky.graph.*) types ──

export type ListPurpose = 'app.bsky.graph.defs#modlist' | 'app.bsky.graph.defs#curatelist' | 'app.bsky.graph.defs#referencelist';

export interface ListViewerState {
  muted?: boolean;
  blocked?: string;
}

export interface ListViewBasic {
  uri: string;
  cid: string;
  name: string;
  purpose: ListPurpose;
  avatar?: string;
  listItemCount?: number;
  labels?: Array<{ src: string; uri: string; cid?: string; val: string; cts: string }>;
  viewer?: ListViewerState;
  indexedAt?: string;
}

export interface ListView extends ListViewBasic {
  creator: ProfileViewBasic;
  description?: string;
  descriptionFacets?: Facet[];
}

export interface ListItemView {
  uri: string;
  subject: ProfileViewBasic;
}

export interface GetListResponse {
  cursor?: string;
  list: ListView;
  items: ListItemView[];
}

export interface GetListsResponse {
  cursor?: string;
  lists: ListView[];
}

export interface GetListBlocksResponse {
  cursor?: string;
  lists: ListView[];
}

export interface GetListMutesResponse {
  cursor?: string;
  lists: ListView[];
}

export interface ListWithMembership {
  list: ListView;
  listItem?: ListItemView;
}

export interface GetListsWithMembershipResponse {
  cursor?: string;
  listsWithMembership: ListWithMembership[];
}

export interface GetListFeedResponse {
  cursor?: string;
  feed: Array<{ post: PostView; reply?: { parent: PostView; root: PostView }; reason?: unknown }>;
}

// ── Chat (DM) types ──

export interface ConvoView {
  id: string;
  rev: string;
  members: ProfileViewBasic[];
  lastMessage?: MessageView | DeletedMessageView | SystemMessageView;
  lastReaction?: { message: MessageView; reaction: ReactionView };
  muted: boolean;
  status: 'request' | 'accepted';
  unreadCount: number;
  kind: 'direct' | 'group';
}

export interface MessageInput {
  text: string;
  facets?: Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; [k: string]: unknown }>;
  }>;
  embed?: { $type: 'app.bsky.embed.record'; record: { uri: string; cid: string } };
}

export interface MessageView {
  id: string;
  rev: string;
  text: string;
  facets?: Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; [k: string]: unknown }>;
  }>;
  embed?: { $type: string; record: { uri: string; cid: string; author?: ProfileViewBasic; value?: { text: string } } };
  reactions: ReactionView[];
  sender: { did: string };
  sentAt: string;
}

export interface DeletedMessageView {
  id: string;
  rev: string;
  sender: { did: string };
  sentAt: string;
}

export interface SystemMessageView {
  id: string;
  rev: string;
  sentAt: string;
  data: { $type: string; [k: string]: unknown };
}

export interface ReactionView {
  value: string;
  sender: { did: string };
  createdAt: string;
}

export interface ConvoListResponse {
  cursor?: string;
  convos: ConvoView[];
}

export interface GetMessagesResponse {
  cursor?: string;
  messages: Array<MessageView | DeletedMessageView | SystemMessageView>;
}

export interface SendMessageResponse {
  id: string;
  rev: string;
  text: string;
  sender: { did: string };
  sentAt: string;
}

export interface GetConvoResponse {
  convo: ConvoView;
}

// ── Actor Likes (app.bsky.feed.getActorLikes) ──

export interface GetActorLikesResponse {
  cursor?: string;
  feed: Array<{ post: PostView }>;
}

// ── Relationships (app.bsky.graph.getRelationships) ──

export interface RelationshipInfo {
  did: string;
  following?: string;
  followedBy?: string;
}

export interface GetRelationshipsResponse {
  actor?: string;
  relationships: RelationshipInfo[];
}
