/**
 * BskyTools API — Python-facing API definitions for batch AT Protocol tool calls.
 *
 * Architecture:
 * - This file defines TypeScript interfaces for all 33 tools exposed to Python
 * - Each tool maps 1:1 to an existing tool handler in tools.ts
 * - Python wrapper is auto-generated from these definitions
 * - Response format is identical to existing tool handlers (JSON string → Python dict)
 *
 * Key features:
 * - fields parameter: filter returned JSON fields to reduce token usage
 * - write markers: tools that modify Bluesky state require pre-execution confirmation
 * - snake_case naming: consistent with existing tool names
 */

// ══════════════════════════════════════════════════════════════════
// Base types
// ══════════════════════════════════════════════════════════════════

export interface BskyToolsBaseOptions {
  /** Filter specific fields from the JSON response (e.g., ['uri', 'author', 'likeCount']) */
  fields?: string[];
}

// ══════════════════════════════════════════════════════════════════
// Read tools (33 total, execute_python excluded — it's the sandbox itself)
// ══════════════════════════════════════════════════════════════════

export interface ResolveHandleOptions extends BskyToolsBaseOptions {
  handle: string;
}

export interface GetRecordOptions extends BskyToolsBaseOptions {
  uri: string;
}

export interface ListRecordsOptions extends BskyToolsBaseOptions {
  repo: string;
  collection: string;
  limit?: number;
  cursor?: string;
}

export interface SearchPostsOptions extends BskyToolsBaseOptions {
  q: string;
  limit?: number;
  cursor?: string;
  sort?: 'top' | 'latest';
}

export interface GetTimelineOptions extends BskyToolsBaseOptions {
  limit?: number;
  cursor?: string;
}

export interface GetAuthorFeedOptions extends BskyToolsBaseOptions {
  actor: string;
  limit?: number;
  cursor?: string;
}

export interface GetPopularFeedGeneratorsOptions extends BskyToolsBaseOptions {
  limit?: number;
}

export interface GetFeedGeneratorOptions extends BskyToolsBaseOptions {
  feed: string;
}

export interface GetFeedOptions extends BskyToolsBaseOptions {
  feed: string;
  limit?: number;
  cursor?: string;
}

export interface GetPostThreadOptions extends BskyToolsBaseOptions {
  uri: string;
  format?: 'flat' | 'tree' | 'subtree';
  depth?: number;
  maxReplies?: number;
}

export interface GetPostContextOptions extends BskyToolsBaseOptions {
  uri: string;
  maxReplies?: number;
}

export interface GetPostInteractionsOptions extends BskyToolsBaseOptions {
  uri: string;
  type?: 'likes' | 'reposts';
  limit?: number;
  cursor?: string;
}

export interface GetQuotesOptions extends BskyToolsBaseOptions {
  uri: string;
  limit?: number;
  cursor?: string;
}

export interface SearchActorsOptions extends BskyToolsBaseOptions {
  q: string;
  limit?: number;
  cursor?: string;
}

export interface GetProfileOptions extends BskyToolsBaseOptions {
  actor: string;
}

export interface GetConnectionsOptions extends BskyToolsBaseOptions {
  actor: string;
  direction?: 'following' | 'followers';
  limit?: number;
  cursor?: string;
}

export interface GetSuggestedFollowsOptions extends BskyToolsBaseOptions {
  actor: string;
}

export interface ListNotificationsOptions extends BskyToolsBaseOptions {
  limit?: number;
  cursor?: string;
}

export interface ExtractImagesFromPostOptions extends BskyToolsBaseOptions {
  uri: string;
}

export interface DownloadImageOptions extends BskyToolsBaseOptions {
  did: string;
  cid: string;
  filename?: string;
}

export interface ViewImageOptions extends BskyToolsBaseOptions {
  did?: string;
  cid?: string;
  alt?: string;
  uploadIndex?: number;
}

export interface ExtractExternalLinkOptions extends BskyToolsBaseOptions {
  uri: string;
}

export interface FetchWebMarkdownOptions extends BskyToolsBaseOptions {
  url: string;
}

export interface SearchWebDdgOptions extends BskyToolsBaseOptions {
  query: string;
}

export interface SearchWikipediaOptions extends BskyToolsBaseOptions {
  query: string;
  lang?: string;
}

export interface GetListsOptions extends BskyToolsBaseOptions {
  actor?: string;
}

export interface GetListFeedOptions extends BskyToolsBaseOptions {
  list: string;
  limit?: number;
  cursor?: string;
}

// ══════════════════════════════════════════════════════════════════
// Write tools (require user confirmation)
// ══════════════════════════════════════════════════════════════════

export interface CreatePostOptions extends BskyToolsBaseOptions {
  text: string;
  replyTo?: string;
  quoteUri?: string;
  images?: Array<{
    did?: string;
    cid?: string;
    alt?: string;
    pendingImageIndex?: number;
  }>;
  threadgate?: {
    type: 'everyone' | 'nobody' | 'mentioned' | 'followers' | 'following' | 'list';
    listUri?: string;
  };
}

export interface LikeOptions extends BskyToolsBaseOptions {
  uri: string;
}

export interface RepostOptions extends BskyToolsBaseOptions {
  uri: string;
}

export interface FollowOptions extends BskyToolsBaseOptions {
  subject: string;
}

export interface CreateListOptions extends BskyToolsBaseOptions {
  name: string;
  purpose: 'curated' | 'moderation';
  description?: string;
}

export interface EditListMembersOptions extends BskyToolsBaseOptions {
  list: string;
  subject: string;
  action?: 'add' | 'remove';
}

// ══════════════════════════════════════════════════════════════════
// Unified API interface (for type checking)
// ══════════════════════════════════════════════════════════════════

export interface BskyToolsAPI {
  // Read operations
  resolveHandle(opts: ResolveHandleOptions): Promise<unknown>;
  getRecord(opts: GetRecordOptions): Promise<unknown>;
  listRecords(opts: ListRecordsOptions): Promise<unknown>;
  searchPosts(opts: SearchPostsOptions): Promise<unknown>;
  getTimeline(opts?: GetTimelineOptions): Promise<unknown>;
  getAuthorFeed(opts: GetAuthorFeedOptions): Promise<unknown>;
  getPopularFeedGenerators(opts?: GetPopularFeedGeneratorsOptions): Promise<unknown>;
  getFeedGenerator(opts: GetFeedGeneratorOptions): Promise<unknown>;
  getFeed(opts: GetFeedOptions): Promise<unknown>;
  getPostThread(opts: GetPostThreadOptions): Promise<unknown>;
  getPostContext(opts: GetPostContextOptions): Promise<unknown>;
  getPostInteractions(opts: GetPostInteractionsOptions): Promise<unknown>;
  getQuotes(opts: GetQuotesOptions): Promise<unknown>;
  searchActors(opts: SearchActorsOptions): Promise<unknown>;
  getProfile(opts: GetProfileOptions): Promise<unknown>;
  getConnections(opts: GetConnectionsOptions): Promise<unknown>;
  getSuggestedFollows(opts: GetSuggestedFollowsOptions): Promise<unknown>;
  listNotifications(opts?: ListNotificationsOptions): Promise<unknown>;
  extractImagesFromPost(opts: ExtractImagesFromPostOptions): Promise<unknown>;
  downloadImage(opts: DownloadImageOptions): Promise<unknown>;
  viewImage(opts?: ViewImageOptions): Promise<unknown>;
  extractExternalLink(opts: ExtractExternalLinkOptions): Promise<unknown>;
  fetchWebMarkdown(opts: FetchWebMarkdownOptions): Promise<unknown>;
  searchWebDdg(opts: SearchWebDdgOptions): Promise<unknown>;
  searchWikipedia(opts: SearchWikipediaOptions): Promise<unknown>;
  getLists(opts?: GetListsOptions): Promise<unknown>;
  getListFeed(opts: GetListFeedOptions): Promise<unknown>;

  // Write operations
  createPost(opts: CreatePostOptions): Promise<unknown>;
  like(opts: LikeOptions): Promise<unknown>;
  repost(opts: RepostOptions): Promise<unknown>;
  follow(opts: FollowOptions): Promise<unknown>;
  createList(opts: CreateListOptions): Promise<unknown>;
  editListMembers(opts: EditListMembersOptions): Promise<unknown>;
}

// ══════════════════════════════════════════════════════════════════
// Field filtering utility
// ══════════════════════════════════════════════════════════════════

/**
 * Filter an object to only include specified fields.
 * Supports nested paths with dot notation (e.g., 'author.handle').
 * 
 * Smart array handling: if fields are not found at the top level but the object
 * contains arrays, fields are applied to array items while metadata keys
 * (cursor, total, etc.) are preserved.
 */
export function filterFields(obj: unknown, fields: string[]): unknown {
  if (obj === null || obj === undefined) return obj;
  if (!Array.isArray(fields) || fields.length === 0) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => filterFields(item, fields));
  }

  if (typeof obj !== 'object') return obj;

  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const fieldGroups = new Map<string, string[]>();
  let hasTopLevelMatches = false;

  // Group nested fields
  for (const field of fields) {
    const parts = field.split('.');
    if (parts.length === 1) {
      if (field in record) {
        result[field] = record[field];
        hasTopLevelMatches = true;
      }
    } else {
      const root = parts[0]!;
      const rest = parts.slice(1).join('.');
      if (!fieldGroups.has(root)) fieldGroups.set(root, []);
      fieldGroups.get(root)!.push(rest);
      hasTopLevelMatches = true; // We have nested fields to process
    }
  }

  // Process nested fields
  for (const [root, restFields] of fieldGroups) {
    if (root in record) {
      result[root] = filterFields(record[root], restFields);
    }
  }

  // Smart array handling: if no top-level matches but object has arrays,
  // apply fields to array items and preserve metadata
  if (!hasTopLevelMatches && Object.keys(result).length === 0) {
    const arrayKeys = Object.keys(record).filter(k => Array.isArray(record[k]));
    if (arrayKeys.length > 0) {
      // Preserve non-array metadata
      for (const [key, value] of Object.entries(record)) {
        if (!Array.isArray(value)) {
          result[key] = value;
        }
      }
      // Apply field filtering to array items
      for (const key of arrayKeys) {
        result[key] = (record[key] as unknown[]).map(item => filterFields(item, fields));
      }
    }
  }

  return result;
}
