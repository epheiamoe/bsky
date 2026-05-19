import type { BskyClient } from '../at/client.js';
import type {
  PostView,
  ThreadViewPost,
  NotFoundPost,
  ImageEmbed,
  ExternalEmbed,
  RecordEmbed,
  RecordWithMediaEmbed,
  PostRecord,
  ListPurpose,
} from '../at/types.js';
import { parseAtUri } from '../at/types.js';
import { fetchViaJina } from './fetchViaJina.js';
import { parseDDGLite, formatResultsAsMarkdown, extractRealUrl, type SearchResult } from '@bsky/ddg-search';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
}

interface WikipediaSummary {
  title: string;
  displaytitle: string;
  description: string;
  extract: string;
  extract_html: string;
  thumbnail?: { source: string; width: number; height: number };
  content_urls: { desktop: { page: string }; mobile: { page: string } };
  pageid: number;
  revision: string;
  tid: string;
  timestamp: string;
  type: string;
  lang: string;
}

export type ToolHandler = (params: Record<string, unknown>, assistant?: unknown) => Promise<string>;

export interface ToolDescriptor {
  definition: ToolDefinition;
  handler: ToolHandler;
  requiresWrite: boolean;
}

function extractRkey(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1] ?? uri;
}

function detectMimeType(data: Uint8Array): string {
  if (data.length < 4) return 'application/octet-stream';
  const pngMagic = [0x89, 0x50, 0x4e, 0x47];
  const jpgMagic = [0xff, 0xd8, 0xff];
  const gifMagic = [0x47, 0x49, 0x46];
  if (pngMagic.every((b, i) => data[i] === b)) return 'image/png';
  if (jpgMagic.every((b, i) => data[i] === b)) return 'image/jpeg';
  if (gifMagic.every((b, i) => data[i] === b)) return 'image/gif';
  return 'application/octet-stream';
}

/** Cross-platform base64 encoding (works in Node.js and browser) */
function toBase64(data: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(data).toString('base64');
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]!);
  return btoa(binary);
}

export function createTools(client: BskyClient, getChatId?: () => string | undefined): ToolDescriptor[] {
  const tools: ToolDescriptor[] = [
    // ======================== PYTHON SANDBOX ========================
    {
      definition: {
        name: 'execute_python',
        description: `Execute Python code in an isolated sandbox environment. Use this for data analysis, batch processing, statistics, plotting, and any complex computation that would be tedious with individual tool calls.

The sandbox has a virtual filesystem. Access the workspace path via the BSKY_WORKSPACE environment variable:
- os.path.join(os.environ['BSKY_WORKSPACE'], 'data') — user-uploaded files (read-only)
- os.path.join(os.environ['BSKY_WORKSPACE'], 'output') — your output files (shown to user)
- os.path.join(os.environ['BSKY_WORKSPACE'], 'temp') — temporary files (auto-cleaned)

Note: On PWA (browser), paths are /workspace/data/, /workspace/output/, /workspace/temp/. On MCP/TUI (Node.js), BSKY_WORKSPACE points to the output directory (e.g., C:\...\output\{chatId}). Use os.path.join(BSKY_WORKSPACE, 'filename') for output files. Always use os.path.join() for portability.

Available standard libraries: json, math, statistics, csv, io, pathlib, datetime, re, collections, itertools, random.
External libraries (PWA only, auto-installed): pandas, numpy, matplotlib.
MCP/TUI: Only system Python packages are available. To use pandas/numpy/matplotlib in MCP/TUI, install them in your system Python first: pip install pandas numpy matplotlib

Bsky Tools Library:
The sandbox includes a bsky_tools library for batch-calling Bluesky API methods:
- bsky_tools.search_posts(q, limit=25, cursor=None, sort='top', fields=None)
- bsky_tools.get_profile(actor, fields=None)
- bsky_tools.get_timeline(limit=50, cursor=None, fields=None)
- bsky_tools.get_author_feed(actor, limit=50, cursor=None, fields=None)
- bsky_tools.search_actors(q, limit=25, cursor=None, fields=None)
- bsky_tools.get_connections(actor, direction='following', limit=50, cursor=None, fields=None)
- bsky_tools.list_notifications(limit=50, cursor=None, fields=None)
- ... and 24 more methods (see system prompt for full list)
- Write operations (create_post, like, repost, follow, create_list, edit_list_members) require user confirmation
- fields parameter filters response JSON to only include specified fields

Best practices:
1. Use print() for brief status messages
2. Save data results to os.path.join(os.environ['BSKY_WORKSPACE'], 'output') as .csv, .json, or .png
3. Handle errors gracefully with try/except
4. Do not use input() — the sandbox has no interactive input
5. Execution limit: 30 seconds, 256MB memory

Example:
import os
import pandas as pd
workspace = os.environ['BSKY_WORKSPACE']
df = pd.read_csv(os.path.join(workspace, 'data', 'sales.csv'))
summary = df.groupby('category')['revenue'].sum()
summary.to_csv(os.path.join(workspace, 'output', 'revenue_by_category.csv'))
print(f"Processed {len(df)} rows")`,
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Python code to execute' },
          },
          required: ['code'],
        },
      },
      handler: async (p) => {
        const { getGlobalPythonSandbox } = await import('./python-sandbox.js');
        const sandbox = getGlobalPythonSandbox();
        if (!sandbox) {
          return JSON.stringify({ error: 'Python 沙箱未初始化。请稍等片刻后重试，或刷新页面。' });
        }
        const startTime = Date.now();
        try {
          const result = await sandbox.execute(p.code as string, getChatId?.());
          const executionTime = Date.now() - startTime;
          const response: Record<string, unknown> = {
            stdout: result.stdout,
            stderr: result.stderr,
            executionTime: executionTime,
            executionTimestamp: result.executionTimestamp,
            success: result.success,
          };
          if (result.files.length > 0) {
            response.files = result.files.map(f => ({
              name: f.name,
              type: f.type,
              size: f.size,
              path: f.path,
            }));
          }
          if (result.returnValue !== null && result.returnValue !== undefined) {
            response.returnValue = result.returnValue;
          }
          return JSON.stringify(response);
        } catch (err) {
          return JSON.stringify({
            error: `Execution failed: ${err instanceof Error ? err.message : String(err)}`,
            executionTime: Date.now() - startTime,
            executionTimestamp: startTime,
            success: false,
          });
        }
      },
      requiresWrite: false,
    },
    // ======================== READ TOOLS ========================
    {
      definition: {
        name: 'resolve_handle',
        description: "Resolve a Bluesky handle to a DID. Input a handle (alice.bsky.social) and get back the user's DID (did:plc:xxx). Use this when you have a handle and need a DID for other operations. For the reverse (DID → handle), use get_profile.",
        inputSchema: {
          type: 'object',
          properties: { handle: { type: 'string', description: 'The handle to resolve (e.g., alice.bsky.social)' } },
          required: ['handle'],
        },
      },
      handler: async (p) => {
        const res = await client.resolveHandle(p.handle as string);
        return JSON.stringify(res);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_record',
        description: 'Get a raw AT Protocol record by its full AT URI. Use this to retrieve the underlying record of any type — posts (app.bsky.feed.post), likes, follows, lists, etc. The URI format is at://did:plc:xxx/app.bsky.feed.post/rkey. For browsing all records of a type, use list_records instead.',
        inputSchema: {
          type: 'object',
          properties: { uri: { type: 'string', description: 'The full AT URI (at://did:plc:xxx/collection/rkey)' } },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const parsed = parseAtUri(p.uri as string);
        const res = await client.getRecord(parsed.did, parsed.collection, parsed.rkey);
        return JSON.stringify(res);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'list_records',
        description: 'List records in a repository collection. Use this to enumerate all records of a given type for a user. The repo parameter accepts a handle or DID. The collection is the NSID (e.g., app.bsky.feed.post for posts, app.bsky.graph.follow for follows). Supports cursor-based pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Handle or DID of the repo owner' },
            collection: { type: 'string', description: 'The NSID collection (e.g., app.bsky.feed.post, app.bsky.graph.follow, app.bsky.feed.like)' },
            limit: { type: 'number', description: 'Maximum records (default 50)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: ['repo', 'collection'],
        },
      },
      handler: async (p) => {
        const res = await client.listRecords(p.repo as string, p.collection as string, (p.limit as number) ?? 50, p.cursor as string | undefined);
        return JSON.stringify(res);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'search_posts',
        description: 'Search for posts on Bluesky by keyword. Use sort="top" (default) for relevance or sort="latest" for recent. Supports advanced Lucene syntax: from:handle, to:handle, mentions:handle, since:date, until:date, lang:code, has:image, "exact phrase". Returns posts with author, text, like/repost counts, and indexedAt. Use cursor to paginate.',
        inputSchema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query. Supports Lucene syntax: from:handle to:handle mentions:handle since:2024-01-01 until:2024-12-31 lang:zh has:image "exact phrase"' },
            limit: { type: 'number', description: 'Maximum results (default 25)' },
            sort: { type: 'string', description: 'Sort order: "top" (relevance) or "latest" (most recent)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: ['q'],
        },
      },
      handler: async (p) => {
        const query = (p.q as string) || '';
        if (!query.trim()) {
          return JSON.stringify({ posts: [], total: 0, error: 'Search query is empty.' });
        }
        const res = await client.searchPosts({
          q: query,
          limit: (p.limit as number) ?? 25,
          sort: p.sort as string | undefined,
          cursor: p.cursor as string | undefined,
        });
        const posts = res.posts.map((post: PostView) => ({
          uri: post.uri,
          author: post.author.handle,
          text: (post.record as unknown as PostRecord)?.text ?? '',
          likeCount: post.likeCount,
          repostCount: post.repostCount,
          indexedAt: post.indexedAt,
        }));
        return JSON.stringify({ posts, total: posts.length, hitsTotal: res.hitsTotal, cursor: res.cursor });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_timeline',
        description: "Get the authenticated user's home timeline — the main feed of posts from people they follow. Returns recent posts with author, text, like/repost counts, and a cursor for pagination. Use cursor to load more (second page, third page, etc.).",
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum posts (default 50)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: [],
        },
      },
      handler: async (p) => {
        const res = await client.getTimeline((p.limit as number) ?? 50, p.cursor as string | undefined);
        const posts = res.feed.map((f) => ({
          uri: f.post.uri,
          author: f.post.author.handle,
          text: (f.post.record as unknown as PostRecord)?.text?.slice(0, 200) ?? '',
          likeCount: f.post.likeCount,
          repostCount: f.post.repostCount,
        }));
        return JSON.stringify({ feed: posts, cursor: res.cursor });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_author_feed',
        description: "Get a user's post feed — all posts from a specific user. The actor parameter accepts a handle (alice.bsky.social) or DID (did:plc:xxx). Use actor='me' for the current logged-in user. Returns posts with text, like/repost counts, and a cursor for pagination.",
        inputSchema: {
          type: 'object',
          properties: {
            actor: { type: 'string', description: 'Handle or DID of the user. Use "me" for the current authenticated user.' },
            limit: { type: 'number', description: 'Maximum posts (default 50)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: ['actor'],
        },
      },
      handler: async (p) => {
        const actor = p.actor === 'me' ? client.getHandle() : (p.actor as string);
        const res = await client.getAuthorFeed(actor, (p.limit as number) ?? 50, p.cursor as string | undefined);
        const posts = res.feed.map((f) => ({
          uri: f.post.uri,
          author: f.post.author.handle,
          text: (f.post.record as unknown as PostRecord)?.text?.slice(0, 200) ?? '',
          likeCount: f.post.likeCount,
          repostCount: f.post.repostCount,
        }));
        return JSON.stringify({ feed: posts, cursor: res.cursor });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_popular_feed_generators',
        description: 'Get popular/trending feed generators on Bluesky. Returns a list of feeds with name, description, creator, and AT URI. Use the AT URI with get_feed to view posts from a feed, or get_feed_generator for more details about a specific one.',
        inputSchema: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'Maximum results (default 50)' } },
          required: [],
        },
      },
      handler: async (p) => {
        const res = await client.getPopularFeedGenerators((p.limit as number) ?? 50);
        return JSON.stringify(res);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_feed_generator',
        description: 'Get detailed information about a specific feed generator by its AT URI. Returns name, description, creator, like count, and the AT URI you can use with get_feed to view the actual posts.',
        inputSchema: {
          type: 'object',
          properties: { feed: { type: 'string', description: 'The AT URI of the feed generator' } },
          required: ['feed'],
        },
      },
      handler: async (p) => {
        const res = await client.getFeedGenerator(p.feed as string);
        // Unwrap the view — the actual feed data is inside res.view
        return JSON.stringify(res.view || res);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_feed',
        description: 'Get posts from a specific feed generator (AT URI). Use this when you know the feed URI (e.g., from get_feed_generator or get_popular_feed_generators). Returns posts with author, text, and cursor for pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            feed: { type: 'string', description: 'The AT URI of the feed (e.g., at://did:plc:xxx/app.bsky.feed.generator/...) ' },
            limit: { type: 'number', description: 'Maximum posts (default 50)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: ['feed'],
        },
      },
      handler: async (p) => {
        const res = await client.getFeed(p.feed as string, (p.limit as number) ?? 50, p.cursor as string | undefined);
        const posts = res.feed.map((f) => ({
          uri: f.post.uri,
          author: f.post.author.handle,
          text: (f.post.record as unknown as PostRecord)?.text?.slice(0, 200) ?? '',
        }));
        return JSON.stringify({ feed: posts, cursor: res.cursor });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_post_thread',
        description: 'Get a post thread with multi-format output. Use format="flat" (default, recommended) for a human-readable view with depth markers, reply arrows, and author info — ideal for understanding conversations. Use format="tree" for the raw AT Protocol tree structure. Use format="subtree" to expand folded replies from a specific post (pass the post URI that showed "N replies folded"). The depth parameter controls how many levels of replies to show.',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The AT URI of the post' },
            format: { type: 'string', description: 'Output format: "flat" (default, human-readable with depth markers), "tree" (raw AT Protocol tree), or "subtree" (expand folded replies from this post)' },
            depth: { type: 'number', description: 'Maximum thread depth (default 3 for flat/subtree, 6 for tree)' },
            maxReplies: { type: 'number', description: 'Maximum replies per depth level (default 5, max 20). Only used for flat/subtree format.' },
          },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const uri = p.uri as string;
        const format = (p.format as string) || 'flat';
        if (format === 'tree') {
          const res = await client.getPostThread(uri, (p.depth as number) ?? 6);
          return JSON.stringify(res);
        }
        const depth = (p.depth as number) ?? 3;
        const maxReplies = (p.maxReplies as number) ?? 5;
        const flat = await flattenThread(client, uri, depth, maxReplies);
        return JSON.stringify(flat);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_post_context',
        description: 'Get comprehensive context for a post: parent chain (ancestors), the post itself, its replies (via get_post_thread flat format), embedded media summary (images/links/quotes/video), and whether it is a reply. Best for understanding the full conversation around a post. Use get_post_thread for more control over thread depth and format.',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The AT URI of the post' },
            maxReplies: { type: 'number', description: 'Maximum replies per level (default 5, max 20)' },
          },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const uri = p.uri as string;
        const parsed = parseAtUri(uri);
        const thread = await flattenThread(client, uri, 3, (p.maxReplies as number) ?? 5);
        const record = await client.getRecord(parsed.did, parsed.collection, parsed.rkey);
        const postRecord = record.value as unknown as PostRecord;
        const media: string[] = [];
        if (postRecord.embed) {
          const embedType = (postRecord.embed as { $type?: string }).$type;
          if (embedType === 'app.bsky.embed.images') {
            media.push(`图片: ${(postRecord.embed as ImageEmbed).images.length} 张`);
          } else if (embedType === 'app.bsky.embed.external') {
            media.push(`外部链接: ${(postRecord.embed as ExternalEmbed).external.uri}`);
          } else if (embedType === 'app.bsky.embed.record') {
            media.push(`引用帖子: ${(postRecord.embed as RecordEmbed).record.uri}`);
          } else if (embedType === 'app.bsky.embed.video') {
            media.push('视频: 1 个');
          }
        }
        return JSON.stringify({
          thread,
          media,
          text: postRecord.text,
          createdAt: postRecord.createdAt,
          hasReply: !!postRecord.reply,
        });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_post_interactions',
        description: 'Get users who interacted with a post. Use type="likes" (default) to see who liked it with handle+DID, or type="reposts" to see who reposted it with handle. Supports cursor-based pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The AT URI of the post' },
            type: { type: 'string', description: 'Interaction type: "likes" (default) for who liked the post, "reposts" for who reposted it' },
            limit: { type: 'number', description: 'Maximum results (default 50)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const itype = (p.type as string) || 'likes';
        if (itype === 'likes') {
          const res = await client.getLikes(p.uri as string, (p.limit as number) ?? 50, p.cursor as string | undefined);
          const likes = res.likes.map((l) => ({ handle: l.actor.handle, did: l.actor.did }));
          return JSON.stringify({ type: 'likes', items: likes, total: likes.length, cursor: res.cursor });
        }
        const res = await client.getRepostedBy(p.uri as string, (p.limit as number) ?? 50, p.cursor as string | undefined);
        return JSON.stringify({ type: 'reposts', items: res.repostedBy.map((a) => a.handle), total: res.repostedBy.length, cursor: res.cursor });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_quotes',
        description: 'Find posts that quote a specific AT URI. Use this when you want to see who has shared a link to a particular post. Returns matching posts with author and text. Supports cursor-based pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The AT URI of the quoted post (the post being referenced)' },
            limit: { type: 'number', description: 'Maximum results (default 25)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const res = await client.searchPosts({ q: p.uri as string, limit: (p.limit as number) ?? 25, cursor: p.cursor as string | undefined });
        const posts = res.posts.map((post: PostView) => ({
          uri: post.uri,
          author: post.author.handle,
          text: (post.record as unknown as PostRecord)?.text ?? '',
        }));
        return JSON.stringify({ quotes: posts, total: posts.length, cursor: res.cursor });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'search_actors',
        description: 'Search for users on Bluesky by name, handle, or keyword. Returns matching profiles with DID, handle, displayName, and description. Use this to find Bluesky users when you know their name but not their exact handle. Supports cursor-based pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query — name, handle fragment, or keyword' },
            limit: { type: 'number', description: 'Maximum results (default 25)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: ['q'],
        },
      },
      handler: async (p) => {
        const res = await client.searchActors({ q: p.q as string, limit: (p.limit as number) ?? 25, cursor: p.cursor as string | undefined });
        const actors = res.actors.map((a) => ({
          did: a.did, handle: a.handle, displayName: a.displayName,
          description: a.description,
        }));
        return JSON.stringify({ actors, total: actors.length, cursor: res.cursor });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_profile',
        description: "Get a user's profile by DID or handle. The actor parameter accepts a handle (alice.bsky.social) or DID (did:plc:xxx). Use actor='me' for the current logged-in user. Returns full profile: did, handle, displayName, description, followersCount, followsCount, postsCount. Use this to resolve a DID to a handle and vice versa.",
        inputSchema: {
          type: 'object',
          properties: { actor: { type: 'string', description: 'Handle or DID of the user. Use "me" for the current authenticated user.' } },
          required: ['actor'],
        },
      },
      handler: async (p) => {
        const actor = p.actor === 'me' ? client.getHandle() : (p.actor as string);
        const res = await client.getProfile(actor);
        return JSON.stringify({
          did: res.did, handle: res.handle, displayName: res.displayName,
          description: res.description, followersCount: res.followersCount,
          followsCount: res.followsCount, postsCount: res.postsCount,
        });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_connections',
        description: "Get a user's social connections. Use direction='following' (default) to see who they follow, or direction='followers' to see their followers. The actor parameter accepts a handle (alice.bsky.social) or DID (did:plc:xxx). Use actor='me' for the current logged-in user. Returns handles and displayNames with cursor for pagination.",
        inputSchema: {
          type: 'object',
          properties: {
            actor: { type: 'string', description: 'Handle or DID of the user. Use "me" for the current authenticated user.' },
            direction: { type: 'string', description: 'Direction: "following" (default) for who they follow, "followers" for who follows them' },
            limit: { type: 'number', description: 'Maximum results (default 50)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: ['actor'],
        },
      },
      handler: async (p) => {
        const actor = p.actor === 'me' ? client.getHandle() : (p.actor as string);
        const direction = (p.direction as string) || 'following';
        if (direction === 'followers') {
          const res = await client.getFollowers(actor, (p.limit as number) ?? 50, p.cursor as string | undefined);
          return JSON.stringify({ direction: 'followers', items: res.followers.map((f) => ({ handle: f.handle, displayName: f.displayName })), total: res.followers.length, cursor: res.cursor });
        }
        const res = await client.getFollows(actor, (p.limit as number) ?? 50, p.cursor as string | undefined);
        return JSON.stringify({ direction: 'following', items: res.follows.map((f) => ({ handle: f.handle, displayName: f.displayName })), total: res.follows.length, cursor: res.cursor });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_suggested_follows',
        description: "Get suggested follows (recommended users to follow) for a given user. The actor parameter accepts a handle (alice.bsky.social) or DID (did:plc:xxx). Use actor='me' for the current logged-in user. Returns suggested user profiles with handle and displayName.",
        inputSchema: {
          type: 'object',
          properties: { actor: { type: 'string', description: 'Handle or DID of the user. Use "me" for the current authenticated user.' } },
          required: ['actor'],
        },
      },
      handler: async (p) => {
        const actor = p.actor === 'me' ? client.getHandle() : (p.actor as string);
        const res = await client.getSuggestedFollows(actor);
        return JSON.stringify({
          suggestions: res.suggestions.map((s) => ({ handle: s.handle, displayName: s.displayName })),
        });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'list_notifications',
        description: "Get notifications for the authenticated user. Returns notification items with reason (like, repost, follow, reply, etc.), author handle, timestamp, read status, and a cursor for pagination. Use cursor to load more notifications.",
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum results (default 50)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: [],
        },
      },
      handler: async (p) => {
        const res = await client.listNotifications((p.limit as number) ?? 50, p.cursor as string | undefined);
        const notifications = res.notifications.map((n) => ({
          reason: n.reason, author: n.author.handle, indexedAt: n.indexedAt, isRead: n.isRead,
        }));
        return JSON.stringify({ notifications, cursor: res.cursor });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'extract_images_from_post',
        description: 'Extract image blob references (DID + CID) from a Bluesky post. Use this to get the image identifiers needed for download_image or view_image. Handles both direct images and recordWithMedia embeds. Returns image count and per-image metadata.',
        inputSchema: {
          type: 'object',
          properties: { uri: { type: 'string', description: 'The AT URI of the post containing images' } },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const parsed = parseAtUri(p.uri as string);
        const record = await client.getRecord(parsed.did, parsed.collection, parsed.rkey);
        const postRecord = record.value as unknown as PostRecord;
        const images: Array<{ did: string; cid: string; mimeType: string; alt: string }> = [];
        const collect = (embed: unknown) => {
          const e = embed as { $type?: string };
          if (e.$type === 'app.bsky.embed.images' && (embed as ImageEmbed).images) {
            for (const img of (embed as ImageEmbed).images) {
              images.push({
                did: parsed.did,
                cid: img.image.ref.$link,
                mimeType: img.image.mimeType,
                alt: img.alt,
              });
            }
          } else if (e.$type === 'app.bsky.embed.recordWithMedia') {
            collect((embed as RecordWithMediaEmbed).media);
          }
        };
        if (postRecord.embed) collect(postRecord.embed);
        return JSON.stringify({ images, count: images.length });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'download_image',
        description: 'Download a Bluesky post image to the user\'s local Downloads folder',
        inputSchema: {
          type: 'object',
          properties: {
            did: { type: 'string', description: 'The DID of the post author' },
            cid: { type: 'string', description: 'The CID of the image blob' },
            filename: { type: 'string', description: 'Optional filename (default: auto-generated)' },
          },
          required: ['did', 'cid'],
        },
      },
      handler: async (p) => {
        const data = await client.downloadBlob(p.did as string, p.cid as string);
        const ext = detectMimeType(data).split('/')[1] || 'jpg';
        const filename = (p.filename as string) || `bsky_image_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
        // Try Node.js filesystem save; fall back to data URL for browser/PWA
        try {
          const { writeFileSync, mkdirSync } = await import('fs');
          const { homedir } = await import('os');
          const { join } = await import('path');
          const downloadsDir = join(homedir(), 'Downloads');
          try { mkdirSync(downloadsDir, { recursive: true }); } catch {}
          const filepath = join(downloadsDir, filename);
          writeFileSync(filepath, data);
          return JSON.stringify({
            saved: filepath,
            size: data.length,
            mimeType: detectMimeType(data),
          });
        } catch {
          // Browser/PWA fallback: return base64 data URL
          const base64 = toBase64(data);
          const dataUrl = `data:${detectMimeType(data)};base64,${base64}`;
          return JSON.stringify({
            saved: false,
            dataUrl,
            filename,
            size: data.length,
            mimeType: detectMimeType(data),
            note: 'Image data returned as data URL. In PWA/browser, the frontend can render this as a download link.',
          });
        }
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'view_image',
        description: 'View and analyze a Bluesky post image. This tool is for VISION MODELS ONLY. Use uploadIndex to view images uploaded by the user in the chat. Use did+cid to view images from Bluesky posts.',
        inputSchema: {
          type: 'object',
          properties: {
            did: { type: 'string', description: 'The DID of the post author' },
            cid: { type: 'string', description: 'The CID of the image blob (from extract_images_from_post)' },
            alt: { type: 'string', description: 'Optional ALT text of the image' },
            uploadIndex: { type: 'number', description: 'Index of a user-uploaded image (from chat messages). Use this instead of did/cid for images the user uploaded in the chat.' },
          },
          required: [],
        },
      },
      handler: async (p, assistant) => {
        let data: Uint8Array;
        let mimeType: string;
        let alt = (p.alt as string) || undefined;

        if (p.uploadIndex !== undefined && p.uploadIndex !== null) {
          const ai = assistant as unknown as { getUserUpload?: (i: number) => { data: Uint8Array; mimeType: string; alt: string } | undefined };
          const upload = ai.getUserUpload?.(p.uploadIndex as number);
          if (!upload) return JSON.stringify({ error: `Upload index ${p.uploadIndex} not found. Images may have been cleared.` });
          data = upload.data;
          mimeType = upload.mimeType;
          alt = alt || upload.alt;
        } else if (p.did && p.cid) {
          try {
            data = await client.downloadBlob(p.did as string, p.cid as string);
          } catch {
            // PDS blob fetch failed (cross-PDS, rate limit, etc.) — fall back to CDN
            const cdnUrl = `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(p.did as string)}/${encodeURIComponent(p.cid as string)}@jpeg`;
            const res = await fetch(cdnUrl);
            if (!res.ok) throw new Error(`Image not available via PDS or CDN — HTTP ${res.status}`);
            data = new Uint8Array(await res.arrayBuffer());
          }
          mimeType = detectMimeType(data);
        } else {
          return JSON.stringify({ error: 'Provide either did+cid (for post images) or uploadIndex (for chat-uploaded images)' });
        }

        const base64 = toBase64(data);
        const dataUrl = `data:${mimeType};base64,${base64}`;
        const ai = assistant as unknown as { addPendingImage?: (url: string, alt?: string) => void };
        ai.addPendingImage?.(dataUrl, alt);
        return JSON.stringify({
          mimeType,
          size: data.length,
          alt,
          note: ((assistant as unknown as { config?: { visionEnabled?: boolean } })?.config?.visionEnabled)
            ? 'Image stored — you will see this image in your next response. Please describe or analyze it now.'
            : 'Image stored as metadata only. Vision mode is OFF — you cannot see image pixels. Enable it in Settings.',
        });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'extract_external_link',
        description: 'Extract the external link embed from a post. If the post contains a link card (website preview), this returns the URL, title, and description. Use fetch_web_markdown to read the actual page content after getting the URL.',
        inputSchema: {
          type: 'object',
          properties: { uri: { type: 'string', description: 'The AT URI of the post with an external link embed' } },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const parsed = parseAtUri(p.uri as string);
        const record = await client.getRecord(parsed.did, parsed.collection, parsed.rkey);
        const postRecord = record.value as unknown as PostRecord;
        if (postRecord.embed && (postRecord.embed as { $type?: string }).$type === 'app.bsky.embed.external') {
          const ext = (postRecord.embed as ExternalEmbed).external;
          return JSON.stringify({ uri: ext.uri, title: ext.title, description: ext.description });
        }
        return JSON.stringify({ link: null, message: 'No external link embed found' });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'fetch_web_markdown',
        description: 'Fetch an external web page as clean markdown via r.jina.ai proxy. Use this to read articles, links shared in posts, or any external URL.',
        inputSchema: {
          type: 'object',
          properties: { url: { type: 'string', description: 'The full URL of the web page to fetch' } },
          required: ['url'],
        },
      },
      handler: async (p) => {
        const url = p.url as string;
        const md = await fetchViaJina(url);
        if (!md) {
          return JSON.stringify({ error: 'Failed to fetch page content', url });
        }
        const trimmed = md.length > 10000 ? md.slice(0, 10000) + '\n\n... (truncated)' : md;
        return JSON.stringify({ url, title: extractTitle(md), content: trimmed });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'search_web_ddg',
        description: 'Web search via DuckDuckGo (no API key needed, no configuration required). Returns up to 10 web search results with titles, URLs, and snippets. Use this for general web search — news, articles, websites, documentation, and current information. Falls back gracefully if DuckDuckGo is unreachable.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
      handler: async (p) => {
        const query = ((p.query as string) || '').trim()
        if (!query) {
          return JSON.stringify({ heading: '', content: 'Search query is empty.' })
        }

        // Tier 1: jina.ai Reader fetches DDG search page as Markdown
        const ddgSearchUrl = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`
        const jinaMd = await fetchViaJina(ddgSearchUrl)
        if (jinaMd) {
          const cleaned = cleanJinaSearchOutput(jinaMd)
          if (cleaned) return cleaned
        }

        // Tier 2: direct DDG Lite fetch (TUI) or via Pages Function (PWA)
        try {
          const g = globalThis as Record<string, unknown>
          const isBrowser = typeof g.document !== 'undefined'
          const fetchUrl = isBrowser
            ? `/api/search?q=${encodeURIComponent(query)}`
            : `https://lite.duckduckgo.com/lite?q=${encodeURIComponent(query)}`
          const res = await fetch(fetchUrl, {
            headers: isBrowser ? {} : { 'User-Agent': 'bsky-client/1.0' },
          })
          if (res.ok) {
            const html = await res.text()
            const results = parseDDGLite(html)
            return formatResultsAsMarkdown(query, results)
          }
        } catch {}

        // All tiers failed
        return JSON.stringify({ heading: '', content: `No search results found for "${query}".` })
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'search_wikipedia',
        description: 'Search Wikipedia and return a concise summary of the top matching article. No API key needed — Wikipedia API supports CORS. Use this for factual knowledge lookup (people, places, concepts, events). Works with English and many other languages.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (e.g., "Albert Einstein", "Python programming language")' },
            lang: { type: 'string', description: 'Wikipedia language code (default "en"). Use "zh" for Chinese, "ja" for Japanese, etc.' },
          },
          required: ['query'],
        },
      },
      handler: async (p) => {
        const query = String(p.query ?? '').trim();
        if (!query) return JSON.stringify({ error: 'Empty query.' });
        const lang = String(p.lang ?? 'en').replace(/[^a-z]/g, '');
        try {
          // Wikipedia page/summary handles redirects and fuzzy matching.
          // e.g. /page/summary/Bluesky%20social%20network redirects to "Bluesky".
          const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
          if (res.status === 404) {
            return JSON.stringify({ error: 'No Wikipedia article found matching that query.' });
          }
          if (!res.ok) {
            return JSON.stringify({ error: `Wikipedia API error: HTTP ${res.status}` });
          }
          const summary = (await res.json()) as WikipediaSummary;
          return formatWikipediaSummary(summary);
        } catch (err) {
          return JSON.stringify({
            error: `search_wikipedia failed: ${err instanceof Error ? err.message : String(err)}`,
            hint: 'Wikipedia API might be unreachable from your network.',
          });
        }
      },
      requiresWrite: false,
    },

    // ======================== WRITE TOOLS ========================
    {
      definition: {
        name: 'create_post',
        description: 'Create a new post, reply to an existing post, or quote a post with optional image attachments. Use replyTo to reply to a specific post (pass its AT URI). Use quoteUri to quote a post. For images, first use extract_images_from_post to get did/cid, then pass them in the images array. Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The post text content' },
            replyTo: { type: 'string', description: 'Optional: AT URI of the post to reply to' },
            quoteUri: { type: 'string', description: 'Optional: AT URI of the post to quote' },
            images: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  did: { type: 'string', description: 'DID of the image author (get from extract_images_from_post)' },
                  cid: { type: 'string', description: 'CID of the image blob' },
                  alt: { type: 'string', description: 'Alt text for the image' },
                  pendingImageIndex: { type: 'number', description: 'Index of a user-uploaded image in this conversation (0-based). Use this instead of did/cid for images uploaded by the user in the chat.' },
                },
              },
              description: 'Optional: Images to attach. Use extract_images_from_post first to get did/cid',
            },
            threadgate: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['everyone', 'nobody', 'mentioned', 'followers', 'following', 'list'], description: 'Who can reply. Use "everyone" for no restriction. Only applicable for original posts and quotes, NOT replies.' },
                listUri: { type: 'string', description: 'AT-URI of the list (required when type is "list"). Use the get_lists tool first to find list URIs.' },
              },
              description: 'Optional: Who can reply to this post. Only for original posts (no replyTo) and quotes (quoteUri without replyTo). For replies, this is ignored.',
            },
          },
          required: ['text'],
        },
      },
      handler: async (p, assistant) => {
        const text = p.text as string;
        const record: Record<string, unknown> = {
          text,
          createdAt: new Date().toISOString(),
        };
        // Check reply restrictions before replying
        let isReply = false;
        if (p.replyTo) {
          isReply = true;
          const replyParsed = parseAtUri(p.replyTo as string);
          const replyRec = await client.getRecord(replyParsed.did, replyParsed.collection, replyParsed.rkey);
          const parentCid = replyRec.cid ?? '';
          let rootUri = p.replyTo as string;
          let rootCid = parentCid;
          try {
            const threadRes = await client.getPostThread(p.replyTo as string, 0, 10);
            // Check threadgate on target post
            if (threadRes.threadgate?.record?.allow) {
              const allow = threadRes.threadgate.record.allow;
              const tgLabels: string[] = [];
              for (const rule of allow) {
                if (rule.$type === 'app.bsky.feed.threadgate#mentionRule') tgLabels.push('only mentioned users can reply');
                else if (rule.$type === 'app.bsky.feed.threadgate#followerRule') tgLabels.push('only followers can reply');
                else if (rule.$type === 'app.bsky.feed.threadgate#followingRule') tgLabels.push('only people they follow can reply');
                else if (rule.$type === 'app.bsky.feed.threadgate#listRule') tgLabels.push('only specific list members can reply');
              }
              if (allow.length === 0) {
                return JSON.stringify({ error: 'This post has replies disabled — nobody can reply. Consider quoting it instead, or create a new post.', postUri: p.replyTo });
              }
              return JSON.stringify({ error: `This post has reply restrictions: ${tgLabels.join(', ')}. You cannot reply to this post. Try quoting it instead (use quoteUri), or create a new post.`, postUri: p.replyTo });
            }
            if (threadRes.thread.$type === 'app.bsky.feed.defs#threadViewPost') {
              let current: ThreadViewPost | undefined = threadRes.thread as ThreadViewPost;
              while (current?.parent && (current.parent as ThreadViewPost).$type === 'app.bsky.feed.defs#threadViewPost') {
                current = current.parent as ThreadViewPost;
              }
              if (!current?.parent) {
                rootUri = current?.post.uri ?? rootUri;
                rootCid = current?.post.cid ?? rootCid;
              } else {
                rootUri = current?.post.uri ?? rootUri;
                rootCid = current?.post.cid ?? rootCid;
              }
            }
          } catch {}
          record.reply = {
            root: { uri: rootUri, cid: rootCid },
            parent: { uri: p.replyTo as string, cid: parentCid },
          };
        }
        // Handle images: download from Bluesky CDN -> upload to user's PDS -> embed
        const imageList = p.images as Array<{ did?: string; cid?: string; alt?: string; pendingImageIndex?: number }> | undefined;
        if (imageList && imageList.length > 0) {
          const uploadedImages: Array<{ image: { ref: { $link: string }; mimeType: string; size: number }; alt: string }> = [];
          for (const img of imageList) {
            let data: Uint8Array;
            let mimeType: string;
            if (img.pendingImageIndex !== undefined && img.pendingImageIndex !== null) {
              const ai = assistant as unknown as { getUserUpload?: (i: number) => { data: Uint8Array; mimeType: string; alt: string } | undefined };
              const upload = ai.getUserUpload?.(img.pendingImageIndex);
              if (!upload) { uploadedImages.push({ image: { ref: { $link: '' }, mimeType: 'image/jpeg', size: 0 }, alt: img.alt ?? '' }); continue; }
              data = upload.data;
              mimeType = upload.mimeType;
            } else if (img.did && img.cid) {
              data = await client.downloadBlob(img.did, img.cid);
              mimeType = detectMimeType(data);
            } else {
              continue;
            }
            const blob = await client.uploadBlob(data, mimeType);
            uploadedImages.push({
              image: { ref: { $link: blob.blob.ref.$link }, mimeType, size: data.length },
              alt: img.alt ?? '',
            });
          }
          record.embed = {
            $type: 'app.bsky.embed.images',
            images: uploadedImages,
          };
        }
        if (p.quoteUri) {
          const quoteParsed = parseAtUri(p.quoteUri as string);
          const quoteRec = await client.getRecord(quoteParsed.did, quoteParsed.collection, quoteParsed.rkey);
          if (record.embed) {
            // Wrap existing images embed in recordWithMedia
            record.embed = {
              $type: 'app.bsky.embed.recordWithMedia',
              record: { uri: p.quoteUri as string, cid: quoteRec.cid ?? '' },
              media: record.embed,
            };
          } else {
            record.embed = {
              $type: 'app.bsky.embed.record',
              record: { uri: p.quoteUri as string, cid: quoteRec.cid ?? '' },
            };
          }
        }
        const res = await client.createRecord(client.getDID(), 'app.bsky.feed.post', record);

        // Apply threadgate if specified (only for original posts and quotes, not replies)
        const tgParam = p.threadgate as { type?: string; listUri?: string } | undefined;
        if (tgParam && tgParam.type && !isReply) {
          let tgRules: import('../at/types.js').ThreadgateRule[] | null = null;
          switch (tgParam.type) {
            case 'everyone': tgRules = null; break;
            case 'nobody': tgRules = []; break;
            case 'mentioned': tgRules = [{ $type: 'app.bsky.feed.threadgate#mentionRule' as const }]; break;
            case 'followers': tgRules = [{ $type: 'app.bsky.feed.threadgate#followerRule' as const }]; break;
            case 'following': tgRules = [{ $type: 'app.bsky.feed.threadgate#followingRule' as const }]; break;
            case 'list':
              if (tgParam.listUri) tgRules = [{ $type: 'app.bsky.feed.threadgate#listRule' as const, list: tgParam.listUri }];
              break;
          }
          if (tgRules !== null) {
            try {
              await client.putThreadgate(res.uri, tgRules);
            } catch {}
          } else if (tgRules === null && tgParam.type !== 'everyone') {
            // null means no rule, don't create threadgate — this is the default behavior
          } else if (tgRules === null && tgParam.type === 'everyone') {
            try { await client.deleteThreadgate(res.uri); } catch {}
          }
        }

        const result: Record<string, unknown> = { uri: res.uri, cid: res.cid, text };
        if (tgParam?.type && !isReply) {
          result.threadgate = tgParam.type;
        }
        return JSON.stringify(result);
      },
      requiresWrite: true,
    },
    {
      definition: {
        name: 'like',
        description: 'Like (heart) a post on Bluesky. Pass the AT URI of the post you want to like. Requires user confirmation. Returns the like record URI.',
        inputSchema: {
          type: 'object',
          properties: { uri: { type: 'string', description: 'The AT URI of the post to like' } },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const subject = parseAtUri(p.uri as string);
        const rec = await client.getRecord(subject.did, subject.collection, subject.rkey);
        const res = await client.createRecord(client.getDID(), 'app.bsky.feed.like', {
          subject: { uri: p.uri as string, cid: rec.cid ?? '' },
          createdAt: new Date().toISOString(),
        });
        return JSON.stringify({ uri: res.uri, cid: res.cid, liked: p.uri });
      },
      requiresWrite: true,
    },
    {
      definition: {
        name: 'repost',
        description: 'Repost (share/boost) a post on Bluesky. Pass the AT URI of the post you want to repost. Requires user confirmation. Returns the repost record URI.',
        inputSchema: {
          type: 'object',
          properties: { uri: { type: 'string', description: 'The AT URI of the post to repost' } },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const subject = parseAtUri(p.uri as string);
        const rec = await client.getRecord(subject.did, subject.collection, subject.rkey);
        const res = await client.createRecord(client.getDID(), 'app.bsky.feed.repost', {
          subject: { uri: p.uri as string, cid: rec.cid ?? '' },
          createdAt: new Date().toISOString(),
        });
        return JSON.stringify({ uri: res.uri, cid: res.cid, reposted: p.uri });
      },
      requiresWrite: true,
    },
    {
      definition: {
        name: 'follow',
        description: 'Follow a user on Bluesky. The subject parameter accepts a handle (alice.bsky.social) or DID (did:plc:xxx). Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: { subject: { type: 'string', description: 'Handle or DID of the user to follow' } },
          required: ['subject'],
        },
      },
      handler: async (p) => {
        const res = await client.createRecord(client.getDID(), 'app.bsky.graph.follow', {
          subject: p.subject as string,
          createdAt: new Date().toISOString(),
        });
        return JSON.stringify({ uri: res.uri, cid: res.cid, followed: p.subject });
      },
      requiresWrite: true,
    },
    {
      definition: {
        name: 'get_lists',
        description: "Get all lists created by a user. Lists can be curation lists (curated for feeds) or moderation lists (for mute/block). The actor parameter accepts a handle (alice.bsky.social) or DID (did:plc:xxx). Use actor='me' or omit for the current logged-in user. Returns list name, purpose, member count, and description.",
        inputSchema: {
          type: 'object',
          properties: { actor: { type: 'string', description: 'Handle or DID of the user. Use "me" or leave empty for the current authenticated user.' } },
          required: [],
        },
      },
      handler: async (p) => {
        const raw = p.actor as string | undefined;
        const handle = !raw || raw === 'me' ? client.getHandle() : raw;
        const res = await client.getLists(handle);
        const summary = res.lists.map(l => ({
          uri: l.uri,
          name: l.name,
          purpose: l.purpose === 'app.bsky.graph.defs#modlist' ? 'moderation' : 'curated',
          memberCount: l.listItemCount ?? 0,
          description: l.description,
        }));
        return JSON.stringify(summary);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_list_feed',
        description: 'Get recent posts from members of a specific list. The list parameter is the AT URI of the list (e.g., from get_lists). Returns posts with author, text, and indexedAt. Supports cursor-based pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            list: { type: 'string', description: 'AT-URI of the list (format: at://did:plc:.../app.bsky.graph.list/...)' },
            limit: { type: 'number', description: 'Number of posts to fetch (default: 30)' },
            cursor: { type: 'string', description: 'Pagination cursor from a previous response. Include to get the next page. Omit for the first page.' },
          },
          required: ['list'],
        },
      },
      handler: async (p) => {
        const limit = (p.limit as number) ?? 30;
        const res = await client.getListFeed(p.list as string, limit, p.cursor as string | undefined);
        const posts = res.feed.map(f => {
          const post = (f as any).post ?? f;
          return {
            uri: post?.uri,
            author: post?.author?.handle,
            text: (post?.record?.text || '').slice(0, 140),
            indexedAt: post?.indexedAt,
          };
        });
        return JSON.stringify(posts);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'create_list',
        description: 'Create a new user list on Bluesky. Use purpose="curated" for curation feeds (content discovery) or "moderation" for mute/block lists. After creating a list, use edit_list_members to add users to it. Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'List name (1-64 characters)' },
            purpose: { type: 'string', description: 'List purpose: "curated" (content curation) or "moderation" (mute/block management)', enum: ['curated', 'moderation'] },
            description: { type: 'string', description: 'Optional list description (up to 300 characters)' },
          },
          required: ['name', 'purpose'],
        },
      },
      handler: async (p) => {
        const purpose: ListPurpose = (p.purpose as string) === 'moderation'
          ? 'app.bsky.graph.defs#modlist'
          : 'app.bsky.graph.defs#curatelist';
        const res = await client.createList(p.name as string, purpose, p.description as string | undefined);
        return JSON.stringify({ uri: res.uri, cid: res.cid, name: p.name, purpose: p.purpose });
      },
      requiresWrite: true,
    },
    {
      definition: {
        name: 'edit_list_members',
        description: 'Add a user to or remove a user from a list. Use action="add" (default) to add a user to a list, or action="remove" to remove them (removes ALL matching entries if the user was added multiple times). The subject parameter accepts a handle or DID. Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: {
            list: { type: 'string', description: 'AT-URI of the list (e.g., from get_lists)' },
            subject: { type: 'string', description: 'Handle or DID of the user to add or remove' },
            action: { type: 'string', description: 'Action: "add" (default) to add, "remove" to remove' },
          },
          required: ['list', 'subject'],
        },
      },
      handler: async (p) => {
        const action = (p.action as string) || 'add';
        if (action === 'remove') {
          const listUri = p.list as string;
          const parsed = parseAtUri(listUri);
          const allItems = await client.listRecords(parsed.did, 'app.bsky.graph.listitem', 100);
          const matches = allItems.records.filter(r => {
            const v = r.value as Record<string, unknown>;
            return v.subject === p.subject && v.list === listUri;
          });
          if (matches.length === 0) return 'User is not in this list.';
          for (const m of matches) {
            await client.removeListItem(m.uri);
          }
          return `Removed user ${p.subject} from list (${matches.length} entries).`;
        }
        const res = await client.addListItem(p.list as string, p.subject as string);
        return JSON.stringify({ uri: res.uri, added: p.subject });
      },
      requiresWrite: true,
    },
  ];

  return tools;
}

// ======================== Thread Flattening ========================

async function flattenThread(client: BskyClient, uri: string, maxDepth: number, maxReplies = 5): Promise<string> {
  const capped = Math.min(maxReplies, 20);

  const res = await client.getPostThread(uri, Math.max(maxDepth + 1, 6), 80);
  if (res.thread.$type !== 'app.bsky.feed.defs#threadViewPost') {
    return '[帖子未找到或已删除]';
  }

  const thread = res.thread as ThreadViewPost;
  const lines: string[] = [];

  // Collect ancestor chain from parent
  const ancestors: PostView[] = [];
  let cursor: ThreadViewPost | undefined = thread.parent as ThreadViewPost | undefined;
  while (cursor) {
    if (cursor.$type === 'app.bsky.feed.defs#threadViewPost') {
      ancestors.unshift(cursor.post);
      cursor = cursor.parent as ThreadViewPost | undefined;
    } else {
      break;
    }
  }

  // Build ancestor lines with negative depth
  for (let i = 0; i < ancestors.length; i++) {
    const depth = -(ancestors.length - i);
    const post = ancestors[i]!;
    const prefix = ancestors[i - 1] ? ` ↳ > ` : '';
    lines.push(formatPostLine(post, depth, prefix));
  }

  // Root post with threadgate info
  lines.push(formatPostLine(thread.post, 0, ''));
  if (res.threadgate?.record?.allow) {
    const tgLabels: string[] = [];
    for (const rule of res.threadgate.record.allow) {
      if (rule.$type === 'app.bsky.feed.threadgate#mentionRule') tgLabels.push('mentioned');
      else if (rule.$type === 'app.bsky.feed.threadgate#followerRule') tgLabels.push('followers');
      else if (rule.$type === 'app.bsky.feed.threadgate#followingRule') tgLabels.push('following');
      else if (rule.$type === 'app.bsky.feed.threadgate#listRule') tgLabels.push('list');
    }
    lines.push(`  ↳ [reply restriction: ${tgLabels.join(' + ') || 'nobody'}]`);
  }

  // Replies
  buildReplyLines(thread.replies ?? [], 1, maxDepth, capped, lines);

  return lines.join('\n');
}

function buildReplyLines(
  replies: Array<ThreadViewPost | NotFoundPost>,
  currentDepth: number,
  maxDepth: number,
  maxSiblings: number,
  lines: string[],
): void {
  if (currentDepth > maxDepth) return;

  const valid = replies
    .filter((r) => r.$type === 'app.bsky.feed.defs#threadViewPost')
    .sort((a, b) => {
      const ai = new Date((a as ThreadViewPost).post.indexedAt ?? 0).getTime();
      const bi = new Date((b as ThreadViewPost).post.indexedAt ?? 0).getTime();
      return ai - bi;
    });

  const shown = valid.slice(0, maxSiblings);
  const hidden = valid.length - shown.length;

  for (let i = 0; i < shown.length; i++) {
    const reply = shown[i]! as ThreadViewPost;
    const indent = '  '.repeat(currentDepth);
    const branch = i < shown.length - 1 ? '  ↳' : '  ';
    const prefix = indent + branch;
    const parentHandle = reply.post.record.reply
      ? extractRkey(reply.post.record.reply.parent.uri)
      : '';
    const arrow = parentHandle ? ` → (post:${parentHandle})` : '';

    const line = formatPostLine(reply.post, currentDepth, prefix + arrow);
    lines.push(line);

    // Recurse into replies of this reply (skip the indent)
    buildReplyLines(reply.replies ?? [], currentDepth + 1, maxDepth, maxSiblings, lines);
  }

  if (hidden > 0) {
    const indent = '  '.repeat(currentDepth + 1);
    lines.push(`${indent}（还有 ${hidden} 条回复被折叠，可调用 get_post_thread(format='subtree') 展开）`);
  }
}

function formatPostLine(post: PostView, depth: number, prefix: string): string {
  const record = post.record;
  const text = record.text;
  const rkey = extractRkey(post.uri);
  const handle = post.author.handle;
  const displayName = post.author.displayName ?? '';

  let mediaInfo = '';
  if (record.embed) {
    const embedType = (record.embed as { $type?: string }).$type;
    if (embedType === 'app.bsky.embed.images') {
      const imgCount = (record.embed as ImageEmbed).images.length;
      mediaInfo = ` [图片: ${imgCount} 张]`;
    } else if (embedType === 'app.bsky.embed.external') {
      const ext = (record.embed as ExternalEmbed).external;
      try {
        const url = new URL(ext.uri);
        mediaInfo = ` [链接: ${url.hostname}]`;
      } catch {
        mediaInfo = ` [链接: ${ext.uri}]`;
      }
    } else if (embedType === 'app.bsky.embed.record') {
      const qUri = (record.embed as RecordEmbed).record.uri;
      mediaInfo = ` [引用: ${extractRkey(qUri)}]`;
    } else if (embedType === 'app.bsky.embed.recordWithMedia') {
      mediaInfo = ' [引用+媒体]';
    } else if (embedType === 'app.bsky.embed.video') {
      mediaInfo = ' [视频]';
    }
  }

  const authorStr = displayName ? `${handle} (${displayName})` : handle;
  return `${prefix}depth:${depth} | ${authorStr} (post:${rkey})\ntext: ${text}${mediaInfo}`;
}

function extractTitle(md: string): string {
  const h1 = md.match(/^#\s+(.+)/m);
  if (h1) return h1[1]!.trim();
  const h2 = md.match(/^##\s+(.+)/m);
  if (h2) return h2[1]!.trim();
  const title = md.match(/<title>([^<]+)<\/title>/i);
  if (title) return title[1]!.trim();
  const firstLine = md.split('\n')[0];
  return firstLine ? firstLine.trim().slice(0, 120) : '(no title)';
}

/**
 * Clean jina.ai's DDG search Markdown output: strip header, ads, favicons, footer.
 */
function cleanJinaSearchOutput(md: string): string | null {
  // Skip the jina.ai header block (Title / URL Source / Markdown Content)
  const contentStart = md.indexOf('Markdown Content:')
  const body = contentStart >= 0 ? md.slice(contentStart + 'Markdown Content:'.length) : md

  const lines = body.split('\n')
  const cleaned: string[] = []
  let inHeader = true
  let reachedResults = false

  for (const raw of lines) {
    const line = raw.trimEnd()

    // Skip the first # heading (DDG page title like "# query at DuckDuckGo")
    if (inHeader && line.startsWith('# ') && !line.startsWith('## ')) {
      inHeader = false
      continue
    }
    // Skip blank lines in header
    if (inHeader && line === '') continue
    inHeader = false

    // Skip empty markdown link (DDG logo link)
    if (/^\[\]\(https?:\/\/html\.duckduckgo\.com/.test(line)) continue

    // Skip favicon image lines
    if (/^\[!\[Image \d+\]/.test(line)) continue

    // Skip ad marker and disclaimer
    if (line === 'Ad' || line.includes('Viewing ads is privacy protected by DuckDuckGo')) continue

    // Skip footer
    if (line === '[Feedback]' || line.includes('[Feedback]') || line.includes('duckduckgo.com/feedback')) continue
    if (line.includes('duckduckgo.com/t/sl_h')) continue

    // Track if we have actual results (## headings with content)
    if (line.startsWith('## ')) reachedResults = true

    cleaned.push(line)
  }

  if (!reachedResults) return null

  // Resolve DDG redirect URLs to real URLs
  const resolved = cleaned.join('\n').replace(
    /https:\/\/duckduckgo\.com\/l\/\?uddg=[^\s)"']+/g,
    (m) => extractRealUrl(m),
  )

  const heading = `DuckDuckGo Search Results`
  const content = resolved.trim()
  return JSON.stringify({ heading, content })
}

/**
 * Format Wikipedia API summary into the same {heading, content} format.
 */
function formatWikipediaSummary(s: WikipediaSummary): string {
  const parts: string[] = [];
  parts.push(`# ${s.displaytitle || s.title}`);
  if (s.description) parts.push(`> ${s.description}`);
  if (s.extract) parts.push(s.extract);
  if (s.content_urls?.desktop?.page) parts.push(`Source: ${s.content_urls.desktop.page}`);
  return JSON.stringify({ heading: s.displaytitle || s.title, content: parts.join('\n\n') });
}
