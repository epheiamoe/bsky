import type { BskyClient } from './client.js';
import type {
  PostView,
  ThreadViewPost,
  NotFoundPost,
  ImageEmbed,
  ExternalEmbed,
  RecordEmbed,
  RecordWithMediaEmbed,
  PostRecord,
} from './types.js';
import { parseAtUri } from './types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
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

export function createTools(client: BskyClient): ToolDescriptor[] {
  const tools: ToolDescriptor[] = [
    // ======================== READ TOOLS ========================
    {
      definition: {
        name: 'resolve_handle',
        description: 'Resolve a Bluesky handle to a DID',
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
        description: 'Get a raw record by AT URI',
        inputSchema: {
          type: 'object',
          properties: { uri: { type: 'string', description: 'The AT URI (at://did:plc:xxx/collection/rkey)' } },
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
        description: 'List records in a repository collection',
        inputSchema: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'The DID or handle of the repo' },
            collection: { type: 'string', description: 'The NSID collection (e.g., app.bsky.feed.post)' },
            limit: { type: 'number', description: 'Maximum records (default 50)' },
          },
          required: ['repo', 'collection'],
        },
      },
      handler: async (p) => {
        const res = await client.listRecords(p.repo as string, p.collection as string, (p.limit as number) ?? 50);
        return JSON.stringify(res);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'search_posts',
        description: 'Search for posts on Bluesky',
        inputSchema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Maximum results (default 25)' },
            sort: { type: 'string', description: 'Sort order: top or latest' },
          },
          required: ['q'],
        },
      },
      handler: async (p) => {
        const res = await client.searchPosts({
          q: p.q as string,
          limit: (p.limit as number) ?? 25,
          sort: p.sort as string | undefined,
        });
        const posts = res.posts.map((post: PostView) => ({
          uri: post.uri,
          author: post.author.handle,
          text: (post.record as unknown as PostRecord)?.text ?? '',
          likeCount: post.likeCount,
          repostCount: post.repostCount,
          indexedAt: post.indexedAt,
        }));
        return JSON.stringify({ posts, total: posts.length, hitsTotal: res.hitsTotal });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_timeline',
        description: 'Get the authenticated user\'s home timeline',
        inputSchema: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'Maximum posts (default 50)' } },
          required: [],
        },
      },
      handler: async (p) => {
        const res = await client.getTimeline((p.limit as number) ?? 50);
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
        description: 'Get a user\'s post feed',
        inputSchema: {
          type: 'object',
          properties: {
            actor: { type: 'string', description: 'The DID or handle of the user' },
            limit: { type: 'number', description: 'Maximum posts (default 50)' },
          },
          required: ['actor'],
        },
      },
      handler: async (p) => {
        const res = await client.getAuthorFeed(p.actor as string, (p.limit as number) ?? 50);
        const posts = res.feed.map((f) => ({
          uri: f.post.uri,
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
        description: 'Get popular feed generators',
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
        description: 'Get details about a feed generator',
        inputSchema: {
          type: 'object',
          properties: { feed: { type: 'string', description: 'The AT URI of the feed generator' } },
          required: ['feed'],
        },
      },
      handler: async (p) => {
        const res = await client.getFeedGenerator(p.feed as string);
        return JSON.stringify(res);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_feed',
        description: 'Get posts from a specific feed',
        inputSchema: {
          type: 'object',
          properties: {
            feed: { type: 'string', description: 'The AT URI of the feed' },
            limit: { type: 'number', description: 'Maximum posts (default 50)' },
          },
          required: ['feed'],
        },
      },
      handler: async (p) => {
        const res = await client.getFeed(p.feed as string, (p.limit as number) ?? 50);
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
        description: 'Get the raw post thread (tree structure)',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The AT URI of the post' },
            depth: { type: 'number', description: 'Thread depth (default 6)' },
          },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const res = await client.getPostThread(p.uri as string, (p.depth as number) ?? 6);
        return JSON.stringify(res);
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_post_thread_flat',
        description: 'Get a flattened, human-readable version of a post thread with depth markers and reply arrows. Prefer this over get_post_thread for understanding conversations.',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The AT URI of the post to start from' },
            depth: { type: 'number', description: 'Maximum depth (default 3)' },
            maxReplies: { type: 'number', description: 'Maximum replies per depth level (default 5, max 20)' },
          },
          required: ['uri'],
        },
      },
      handler: async (p) => flattenThread(client, p.uri as string, (p.depth as number) ?? 3, (p.maxReplies as number) ?? 5),
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_post_subtree',
        description: 'Flatten a subtree starting from a specific post URI. Use to expand folded replies.',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The AT URI of the post to expand' },
            depth: { type: 'number', description: 'Maximum depth (default 3)' },
            maxReplies: { type: 'number', description: 'Maximum replies per depth level (default 5, max 20)' },
          },
          required: ['uri'],
        },
      },
      handler: async (p) => flattenThread(client, p.uri as string, (p.depth as number) ?? 3, (p.maxReplies as number) ?? 5),
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_post_context',
        description: 'Get full context for a post: parent chain, quoted post content, and media summary',
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
        name: 'get_likes',
        description: 'Get users who liked a post',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The AT URI of the post' },
            limit: { type: 'number', description: 'Maximum results (default 50)' },
          },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const res = await client.getLikes(p.uri as string, (p.limit as number) ?? 50);
        const likes = res.likes.map((l) => ({ handle: l.actor.handle, did: l.actor.did }));
        return JSON.stringify({ likes, total: likes.length, cursor: res.cursor });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_reposted_by',
        description: 'Get users who reposted a post',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The AT URI of the post' },
            limit: { type: 'number', description: 'Maximum results (default 50)' },
          },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const res = await client.getRepostedBy(p.uri as string, (p.limit as number) ?? 50);
        return JSON.stringify({ repostedBy: res.repostedBy.map((a) => a.handle) });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_quotes',
        description: 'Search for posts that quote a specific post',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The AT URI of the quoted post' },
            limit: { type: 'number', description: 'Maximum results (default 25)' },
          },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const res = await client.searchPosts({ q: p.uri as string, limit: (p.limit as number) ?? 25 });
        const posts = res.posts.map((post: PostView) => ({
          uri: post.uri,
          author: post.author.handle,
          text: (post.record as unknown as PostRecord)?.text ?? '',
        }));
        return JSON.stringify({ quotes: posts, total: posts.length });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'search_actors',
        description: 'Search for users on Bluesky',
        inputSchema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Maximum results (default 25)' },
          },
          required: ['q'],
        },
      },
      handler: async (p) => {
        const res = await client.searchActors({ q: p.q as string, limit: (p.limit as number) ?? 25 });
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
        description: 'Get a user\'s profile',
        inputSchema: {
          type: 'object',
          properties: { actor: { type: 'string', description: 'The DID or handle of the user' } },
          required: ['actor'],
        },
      },
      handler: async (p) => {
        const res = await client.getProfile(p.actor as string);
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
        name: 'get_follows',
        description: 'Get who a user follows',
        inputSchema: {
          type: 'object',
          properties: {
            actor: { type: 'string', description: 'The DID or handle of the user' },
            limit: { type: 'number', description: 'Maximum results (default 50)' },
          },
          required: ['actor'],
        },
      },
      handler: async (p) => {
        const res = await client.getFollows(p.actor as string, (p.limit as number) ?? 50);
        return JSON.stringify({
          follows: res.follows.map((f) => ({ handle: f.handle, displayName: f.displayName })),
          total: res.follows.length,
          cursor: res.cursor,
        });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_followers',
        description: 'Get a user\'s followers',
        inputSchema: {
          type: 'object',
          properties: {
            actor: { type: 'string', description: 'The DID or handle of the user' },
            limit: { type: 'number', description: 'Maximum results (default 50)' },
          },
          required: ['actor'],
        },
      },
      handler: async (p) => {
        const res = await client.getFollowers(p.actor as string, (p.limit as number) ?? 50);
        return JSON.stringify({
          followers: res.followers.map((f) => ({ handle: f.handle, displayName: f.displayName })),
          total: res.followers.length,
          cursor: res.cursor,
        });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'get_suggested_follows',
        description: 'Get suggested follows for a user',
        inputSchema: {
          type: 'object',
          properties: { actor: { type: 'string', description: 'The DID or handle of the user' } },
          required: ['actor'],
        },
      },
      handler: async (p) => {
        const res = await client.getSuggestedFollows(p.actor as string);
        return JSON.stringify({
          suggestions: res.suggestions.map((s) => ({ handle: s.actor.handle, displayName: s.actor.displayName })),
        });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'list_notifications',
        description: 'Get notifications for the authenticated user',
        inputSchema: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'Maximum results (default 50)' } },
          required: [],
        },
      },
      handler: async (p) => {
        const res = await client.listNotifications((p.limit as number) ?? 50);
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
        description: 'Extract image blob references (did + cid) from a post',
        inputSchema: {
          type: 'object',
          properties: { uri: { type: 'string', description: 'The AT URI of the post' } },
          required: ['uri'],
        },
      },
      handler: async (p) => {
        const parsed = parseAtUri(p.uri as string);
        const record = await client.getRecord(parsed.did, parsed.collection, parsed.rkey);
        const postRecord = record.value as unknown as PostRecord;
        const images: Array<{ did: string; cid: string; mimeType: string; alt: string }> = [];
        if (postRecord.embed && (postRecord.embed as { $type?: string }).$type === 'app.bsky.embed.images') {
          for (const img of (postRecord.embed as ImageEmbed).images) {
            images.push({
              did: parsed.did,
              cid: img.image.ref.$link,
              mimeType: img.image.mimeType,
              alt: img.alt,
            });
          }
        }
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
        // Write to user's Downloads folder
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
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'view_image',
        description: 'View and analyze a Bluesky post image. This tool is for VISION MODELS ONLY (GPT-4V, Claude Vision, DeepSeek VL, etc). Plain text models cannot understand image data — they will see base64 gibberish. If your model is text-only, skip this tool.',
        inputSchema: {
          type: 'object',
          properties: {
            did: { type: 'string', description: 'The DID of the post author' },
            cid: { type: 'string', description: 'The CID of the image blob' },
          },
          required: ['did', 'cid'],
        },
      },
      handler: async (p, assistant) => {
        const data = await client.downloadBlob(p.did as string, p.cid as string);
        const mimeType = detectMimeType(data);
        const base64 = Buffer.from(data).toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64}`;
        // Store for multi-modal promotion in next user message
        const ai = assistant as unknown as { addPendingImage?: (url: string) => void };
        ai.addPendingImage?.(dataUrl);
        return JSON.stringify({
          mimeType,
          size: data.length,
          note: 'Image data stored for visual analysis. If your model supports vision (GPT-4V/Claude Vision/DeepSeek VL), you will be able to see this image in the next message. Text-only models: skip image analysis and describe using metadata only.',
        });
      },
      requiresWrite: false,
    },
    {
      definition: {
        name: 'extract_external_link',
        description: 'Extract external link embed from a post',
        inputSchema: {
          type: 'object',
          properties: { uri: { type: 'string', description: 'The AT URI of the post' } },
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
        const proxyUrl = `https://r.jina.ai/${url}`;
        const res = await fetch(proxyUrl, {
          headers: { 'Accept': 'text/markdown' },
        });
        if (!res.ok) {
          return JSON.stringify({ error: `HTTP ${res.status}: ${res.statusText}`, url });
        }
        const md = await res.text();
        const trimmed = md.length > 10000 ? md.slice(0, 10000) + '\n\n... (truncated)' : md;
        return JSON.stringify({ url, title: extractTitle(md), content: trimmed });
      },
      requiresWrite: false,
    },

    // ======================== WRITE TOOLS ========================
    {
      definition: {
        name: 'create_post',
        description: 'Create a new post, or reply to an existing post. Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The post text content' },
            replyTo: { type: 'string', description: 'Optional: AT URI of the post to reply to' },
            quoteUri: { type: 'string', description: 'Optional: AT URI of the post to quote' },
          },
          required: ['text'],
        },
      },
      handler: async (p) => {
        const text = p.text as string;
        const record: Record<string, unknown> = {
          text,
          createdAt: new Date().toISOString(),
        };
        if (p.replyTo) {
          const replyParsed = parseAtUri(p.replyTo as string);
          const replyRec = await client.getRecord(replyParsed.did, replyParsed.collection, replyParsed.rkey);
          const parentCid = replyRec.cid ?? '';
          let rootUri = p.replyTo as string;
          let rootCid = parentCid;
          try {
            const threadRes = await client.getPostThread(p.replyTo as string, 0, 10);
            if (threadRes.thread.$type === 'app.bsky.feed.defs#threadViewPost') {
              // Walk up to find root
              let current: ThreadViewPost | undefined = threadRes.thread as ThreadViewPost;
              while (current?.parent && (current.parent as ThreadViewPost).$type === 'app.bsky.feed.defs#threadViewPost') {
                current = current.parent as ThreadViewPost;
              }
              // If we found parent chain, current is either the top or the original
              // For root: if there's no parent, the post itself is root
              if (!current?.parent) {
                rootUri = current?.post.uri ?? rootUri;
                rootCid = current?.post.cid ?? rootCid;
              } else {
                // There's a parent but it might be notFound - use the highest post we have
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
        if (p.quoteUri) {
          const quoteParsed = parseAtUri(p.quoteUri as string);
          const quoteRec = await client.getRecord(quoteParsed.did, quoteParsed.collection, quoteParsed.rkey);
          quoteRec;
          record.embed = {
            $type: 'app.bsky.embed.record',
            record: { uri: p.quoteUri as string, cid: quoteRec.cid ?? '' },
          };
        }
        const res = await client.createRecord(client.getDID(), 'app.bsky.feed.post', record);
        return JSON.stringify({ uri: res.uri, cid: res.cid, text });
      },
      requiresWrite: true,
    },
    {
      definition: {
        name: 'like',
        description: 'Like a post. Requires user confirmation.',
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
        description: 'Repost a post. Requires user confirmation.',
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
        description: 'Follow a user. Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: { subject: { type: 'string', description: 'The DID of the user to follow' } },
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
        name: 'upload_blob',
        description: 'Upload a binary blob (image). Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: {
            base64: { type: 'string', description: 'Base64-encoded binary data' },
            mimeType: { type: 'string', description: 'MIME type (e.g., image/png)' },
          },
          required: ['base64', 'mimeType'],
        },
      },
      handler: async (p) => {
        const data = Uint8Array.from(Buffer.from(p.base64 as string, 'base64'));
        const res = await client.uploadBlob(data, p.mimeType as string);
        return JSON.stringify({ blob: res.blob });
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

  // Root post
  lines.push(formatPostLine(thread.post, 0, ''));

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
    lines.push(`${indent}（还有 ${hidden} 条回复被折叠，可调用 get_post_subtree 展开）`);
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
