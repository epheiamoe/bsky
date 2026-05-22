/**
 * BskyTools Definitions — metadata and Python wrapper generation for all 33 tools.
 *
 * This file serves as the single source of truth for:
 * - Tool metadata (name, description, parameters, write status)
 * - Python wrapper code generation (for both Pyodide and Node.js environments)
 * - AST analysis helpers (identifying write operations in Python code)
 *
 * All tool responses are identical to existing tool handlers in tools.ts.
 * The Python wrapper simply forwards calls to the underlying handler.
 */

export interface BskyToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface BskyToolDefinition {
  name: string;           // Python method name (snake_case)
  description: string;    // Method docstring
  parameters: BskyToolParameter[];
  requiresWrite: boolean; // Whether this tool modifies Bluesky state
  returns: string;        // Return type description for docstring
}

// ══════════════════════════════════════════════════════════════════
// Write operation tool names (used for AST analysis)
// ══════════════════════════════════════════════════════════════════

export const WRITE_TOOLS = new Set([
  'create_post',
  'like',
  'repost',
  'follow',
  'create_list',
  'edit_list_members',
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

// ══════════════════════════════════════════════════════════════════
// Tool definitions — all 33 tools (execute_python excluded)
// ══════════════════════════════════════════════════════════════════

export const BSKY_TOOLS: BskyToolDefinition[] = [
  // Read operations
  {
    name: 'resolve_handle',
    description: 'Resolve a Bluesky handle to a DID. Input a handle (alice.bsky.social) and get back the user\'s DID (did:plc:xxx). Use this when you have a handle and need a DID for other operations.',
    parameters: [
      { name: 'handle', type: 'string', description: 'The handle to resolve (e.g., alice.bsky.social)', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {did: string}',
  },
  {
    name: 'get_record',
    description: 'Get a raw AT Protocol record by its full AT URI. Use this to retrieve the underlying record of any type — posts, likes, follows, lists, etc.',
    parameters: [
      { name: 'uri', type: 'string', description: 'The full AT URI (at://did:plc:xxx/collection/rkey)', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — raw AT Protocol record',
  },
  {
    name: 'list_records',
    description: 'List records in a repository collection. Use this to enumerate all records of a given type for a user. Supports cursor-based pagination.',
    parameters: [
      { name: 'repo', type: 'string', description: 'Handle or DID of the repo owner', required: true },
      { name: 'collection', type: 'string', description: 'The NSID collection (e.g., app.bsky.feed.post)', required: true },
      { name: 'limit', type: 'number', description: 'Maximum records (default 50)', required: false, default: 50 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {records: list, cursor: string}',
  },
  {
    name: 'search_posts',
    description: 'Search for posts on Bluesky by keyword. Supports advanced Lucene syntax: from:handle, to:handle, mentions:handle, since:date, until:date, lang:code, has:image, "exact phrase".',
    parameters: [
      { name: 'q', type: 'string', description: 'Search query', required: true },
      { name: 'limit', type: 'number', description: 'Maximum results (default 25)', required: false, default: 25 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'sort', type: 'string', description: 'Sort order: "top" or "latest"', required: false, default: 'top' },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response (e.g., ["uri", "author", "likeCount"])', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {posts: list, cursor: string}',
  },
  {
    name: 'get_timeline',
    description: 'Get the authenticated user\'s home timeline — the main feed of posts from people they follow.',
    parameters: [
      { name: 'limit', type: 'number', description: 'Maximum posts (default 50)', required: false, default: 50 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {feed: list, cursor: string}',
  },
  {
    name: 'get_author_feed',
    description: 'Get a user\'s post feed — all posts from a specific user. Use actor="me" for the current logged-in user.',
    parameters: [
      { name: 'actor', type: 'string', description: 'Handle or DID of the user. Use "me" for the current authenticated user.', required: true },
      { name: 'limit', type: 'number', description: 'Maximum posts (default 50)', required: false, default: 50 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {feed: list, cursor: string}',
  },
  {
    name: 'get_popular_feed_generators',
    description: 'Get popular/trending feed generators on Bluesky. Returns a list of feeds with name, description, creator, and AT URI.',
    parameters: [
      { name: 'limit', type: 'number', description: 'Maximum results (default 50)', required: false, default: 50 },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — list of feed generators',
  },
  {
    name: 'get_feed_generator',
    description: 'Get detailed information about a specific feed generator by its AT URI.',
    parameters: [
      { name: 'feed', type: 'string', description: 'The AT URI of the feed generator', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — feed generator details',
  },
  {
    name: 'get_feed',
    description: 'Get posts from a specific feed generator (AT URI).',
    parameters: [
      { name: 'feed', type: 'string', description: 'The AT URI of the feed', required: true },
      { name: 'limit', type: 'number', description: 'Maximum posts (default 50)', required: false, default: 50 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {feed: list, cursor: string}',
  },
  {
    name: 'get_post_thread',
    description: 'Get a post thread with multi-format output. Use format="flat" for human-readable, "tree" for raw AT Protocol structure.',
    parameters: [
      { name: 'uri', type: 'string', description: 'The AT URI of the post', required: true },
      { name: 'format', type: 'string', description: 'Output format: "flat", "tree", or "subtree"', required: false, default: 'flat' },
      { name: 'depth', type: 'number', description: 'Maximum thread depth', required: false, default: 3 },
      { name: 'maxReplies', type: 'number', description: 'Maximum replies per depth level (default 5, max 20)', required: false, default: 5 },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — thread structure',
  },
  {
    name: 'get_post_context',
    description: 'Get comprehensive context for a post: parent chain, the post itself, its replies, embedded media summary.',
    parameters: [
      { name: 'uri', type: 'string', description: 'The AT URI of the post', required: true },
      { name: 'maxReplies', type: 'number', description: 'Maximum replies per level (default 5)', required: false, default: 5 },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — post context with thread and media',
  },
  {
    name: 'get_post_interactions',
    description: 'Get users who interacted with a post (likes or reposts).',
    parameters: [
      { name: 'uri', type: 'string', description: 'The AT URI of the post', required: true },
      { name: 'type', type: 'string', description: 'Interaction type: "likes" or "reposts"', required: false, default: 'likes' },
      { name: 'limit', type: 'number', description: 'Maximum results (default 50)', required: false, default: 50 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {type: string, items: list, cursor: string}',
  },
  {
    name: 'get_quotes',
    description: 'Find posts that quote a specific AT URI.',
    parameters: [
      { name: 'uri', type: 'string', description: 'The AT URI of the quoted post', required: true },
      { name: 'limit', type: 'number', description: 'Maximum results (default 25)', required: false, default: 25 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {quotes: list, cursor: string}',
  },
  {
    name: 'search_actors',
    description: 'Search for users on Bluesky by name, handle, or keyword.',
    parameters: [
      { name: 'q', type: 'string', description: 'Search query', required: true },
      { name: 'limit', type: 'number', description: 'Maximum results (default 25)', required: false, default: 25 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {actors: list, cursor: string}',
  },
  {
    name: 'get_profile',
    description: 'Get a user\'s profile by DID or handle. Use actor="me" for the current logged-in user.',
    parameters: [
      { name: 'actor', type: 'string', description: 'Handle or DID of the user. Use "me" for the current authenticated user.', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — profile with did, handle, displayName, followersCount, etc.',
  },
  {
    name: 'get_connections',
    description: 'Get a user\'s social connections (following or followers).',
    parameters: [
      { name: 'actor', type: 'string', description: 'Handle or DID of the user. Use "me" for the current authenticated user.', required: true },
      { name: 'direction', type: 'string', description: 'Direction: "following" or "followers"', required: false, default: 'following' },
      { name: 'limit', type: 'number', description: 'Maximum results (default 50)', required: false, default: 50 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {direction: string, items: list, cursor: string}',
  },
  {
    name: 'get_suggested_follows',
    description: 'Get suggested follows (recommended users to follow) for a given user.',
    parameters: [
      { name: 'actor', type: 'string', description: 'Handle or DID of the user. Use "me" for the current authenticated user.', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {suggestions: list}',
  },
  {
    name: 'list_notifications',
    description: 'Get notifications for the authenticated user.',
    parameters: [
      { name: 'limit', type: 'number', description: 'Maximum results (default 50)', required: false, default: 50 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {notifications: list, cursor: string}',
  },
  {
    name: 'extract_images_from_post',
    description: 'Extract image blob references (DID + CID) from a Bluesky post.',
    parameters: [
      { name: 'uri', type: 'string', description: 'The AT URI of the post containing images', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {images: list, count: number}',
  },
  {
    name: 'download_image',
    description: 'Download a Bluesky post image to the user\'s local Downloads folder.',
    parameters: [
      { name: 'did', type: 'string', description: 'The DID of the post author', required: true },
      { name: 'cid', type: 'string', description: 'The CID of the image blob', required: true },
      { name: 'filename', type: 'string', description: 'Optional filename (default: auto-generated)', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {saved: string, size: number, mimeType: string}',
  },
  {
    name: 'view_image',
    description: 'View and analyze a Bluesky post image (for vision models).',
    parameters: [
      { name: 'did', type: 'string', description: 'The DID of the post author', required: false },
      { name: 'cid', type: 'string', description: 'The CID of the image blob', required: false },
      { name: 'alt', type: 'string', description: 'Optional ALT text', required: false },
      { name: 'uploadIndex', type: 'number', description: 'Index of a user-uploaded image', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — image analysis result',
  },
  {
    name: 'extract_external_link',
    description: 'Extract the external link embed from a post.',
    parameters: [
      { name: 'uri', type: 'string', description: 'The AT URI of the post with an external link embed', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {uri: string, title: string, description: string}',
  },
  {
    name: 'fetch_web_markdown',
    description: 'Fetch an external web page as clean markdown.',
    parameters: [
      { name: 'url', type: 'string', description: 'The full URL of the web page', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — {url: string, title: string, content: string}',
  },
  {
    name: 'search_web_ddg',
    description: 'Web search via DuckDuckGo. Returns up to 10 results with titles, URLs, and snippets.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — search results',
  },
  {
    name: 'search_wikipedia',
    description: 'Search Wikipedia and return a concise summary.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'lang', type: 'string', description: 'Wikipedia language code (default "en")', required: false, default: 'en' },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — Wikipedia summary',
  },
  {
    name: 'get_lists',
    description: 'Get all lists created by a user.',
    parameters: [
      { name: 'actor', type: 'string', description: 'Handle or DID of the user. Use "me" or omit for the current authenticated user.', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — list of lists with uri, name, purpose, memberCount',
  },
  {
    name: 'get_list_feed',
    description: 'Get recent posts from members of a specific list.',
    parameters: [
      { name: 'list', type: 'string', description: 'AT-URI of the list', required: true },
      { name: 'limit', type: 'number', description: 'Number of posts to fetch (default: 30)', required: false, default: 30 },
      { name: 'cursor', type: 'string', description: 'Pagination cursor', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: false,
    returns: 'dict — list of posts',
  },

  // Write operations (require confirmation)
  {
    name: 'create_post',
    description: 'Create a new post, reply, or quote post with optional images. Requires user confirmation.',
    parameters: [
      { name: 'text', type: 'string', description: 'The post text content', required: true },
      { name: 'replyTo', type: 'string', description: 'AT URI of the post to reply to', required: false },
      { name: 'quoteUri', type: 'string', description: 'AT URI of the post to quote', required: false },
      { name: 'images', type: 'array', description: 'Images to attach (array of {did, cid, alt, pendingImageIndex})', required: false },
      { name: 'threadgate', type: 'object', description: 'Reply restrictions: {type, listUri}', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: true,
    returns: 'dict — {uri: string, cid: string}',
  },
  {
    name: 'like',
    description: 'Like (heart) a post. Requires user confirmation.',
    parameters: [
      { name: 'uri', type: 'string', description: 'The AT URI of the post to like', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: true,
    returns: 'dict — {uri: string, cid: string, liked: string}',
  },
  {
    name: 'repost',
    description: 'Repost (share/boost) a post. Requires user confirmation.',
    parameters: [
      { name: 'uri', type: 'string', description: 'The AT URI of the post to repost', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: true,
    returns: 'dict — {uri: string, cid: string, reposted: string}',
  },
  {
    name: 'follow',
    description: 'Follow a user. Requires user confirmation.',
    parameters: [
      { name: 'subject', type: 'string', description: 'Handle or DID of the user to follow', required: true },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: true,
    returns: 'dict — {uri: string, cid: string, followed: string}',
  },
  {
    name: 'create_list',
    description: 'Create a new user list. Requires user confirmation.',
    parameters: [
      { name: 'name', type: 'string', description: 'List name (1-64 characters)', required: true },
      { name: 'purpose', type: 'string', description: 'List purpose: "curated" or "moderation"', required: true },
      { name: 'description', type: 'string', description: 'Optional list description (up to 300 characters)', required: false },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: true,
    returns: 'dict — {uri: string, cid: string, name: string, purpose: string}',
  },
  {
    name: 'edit_list_members',
    description: 'Add or remove a user from a list. Requires user confirmation.',
    parameters: [
      { name: 'list', type: 'string', description: 'AT-URI of the list', required: true },
      { name: 'subject', type: 'string', description: 'Handle or DID of the user', required: true },
      { name: 'action', type: 'string', description: 'Action: "add" (default) or "remove"', required: false, default: 'add' },
      { name: 'fields', type: 'array', description: 'Filter specific fields from the response', required: false },
    ],
    requiresWrite: true,
    returns: 'dict or string — result of add/remove operation',
  },
];

// ══════════════════════════════════════════════════════════════════
// Python wrapper generation
// ══════════════════════════════════════════════════════════════════

/**
 * Convert camelCase to snake_case for Python parameter names.
 * Examples: maxReplies → max_replies, replyTo → reply_to, quoteUri → quote_uri
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert snake_case back to camelCase for JSON-RPC/tool handler parameter names.
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Generate Python wrapper code for Pyodide (PWA).
 * Uses Pyodide's built-in `js` module for JS interop.
 * Parameter names are converted to snake_case for Python conventions.
 */
export function generatePyodideWrapper(): string {
  const methods = BSKY_TOOLS.map(tool => {
    const params = tool.parameters
      .filter(p => p.name !== 'fields')
      .map(p => {
        const pyName = camelToSnake(p.name);
        if (p.default !== undefined) {
          const def = typeof p.default === 'string' ? `"${p.default}"` : String(p.default);
          return `${pyName}=${def}`;
        }
        return pyName;
      })
      .join(', ');

    const args = tool.parameters
      .filter(p => p.name !== 'fields')
      .map(p => camelToSnake(p.name))
      .concat(['fields=None'])
      .join(', ');

    // Kwargs use original camelCase keys for JS bridge compatibility
    const kwargsEntries = tool.parameters
      .filter(p => p.name !== 'fields')
      .map(p => `"${p.name}": ${camelToSnake(p.name)}`)
      .concat(['"fields": fields'])
      .join(', ');

    return `
    def ${tool.name}(self, ${args}):
        """${tool.description}
        
        Returns: ${tool.returns}
        """
        kwargs = {${kwargsEntries}}
        # Remove None values to let JS use defaults
        kwargs = {k: v for k, v in kwargs.items() if v is not None}
        result = self._bridge.${tool.name}(kwargs)
        return result.to_py() if hasattr(result, 'to_py') else result`;
  }).join('\n');

  return `import js
from typing import List, Dict, Any, Optional

class BskyToolsError(Exception):
    pass

class BskyTools:
    def __init__(self, bridge):
        self._bridge = bridge
${methods}

bsky_tools = BskyTools(js.bskyToolsBridge)
`;
}

/**
 * Generate Python wrapper code for Node.js (TUI/MCP).
 * Uses JSON-RPC over stdin/stdout for communication.
 * Parameter names are converted to snake_case for Python conventions.
 */
export function generateNodeWrapper(): string {
  const methods = BSKY_TOOLS.map(tool => {
    const params = tool.parameters
      .filter(p => p.name !== 'fields')
      .map(p => {
        const pyName = camelToSnake(p.name);
        if (p.default !== undefined) {
          const def = typeof p.default === 'string' ? `"${p.default}"` : String(p.default);
          return `${pyName}=${def}`;
        }
        return pyName;
      })
      .join(', ');

    const args = tool.parameters
      .filter(p => p.name !== 'fields')
      .map(p => camelToSnake(p.name))
      .concat(['fields=None'])
      .join(', ');

    // Kwargs use original camelCase keys for JSON-RPC handler compatibility
    const kwargsEntries = tool.parameters
      .filter(p => p.name !== 'fields')
      .map(p => `"${p.name}": ${camelToSnake(p.name)}`)
      .join(', ');

    return `
    def ${tool.name}(self, ${args}):
        """${tool.description}
        
        Returns: ${tool.returns}
        """
        # Convert string fields to list
        if isinstance(fields, str):
            fields = [f.strip() for f in fields.split(',') if f.strip()]
        kwargs = {${kwargsEntries}}
        if fields is not None:
            kwargs["fields"] = fields
        return self._call("${tool.name}", kwargs)`;
  }).join('\n');

  return `import json
import sys
from typing import List, Dict, Any, Optional

class BskyToolsError(Exception):
    pass

class BskyTools:
    def __init__(self):
        pass
    
    def _call(self, method: str, params: dict):
        request = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
        print("__JSONRPC__" + json.dumps(request))
        sys.stdout.flush()
        
        # Read response from stdin
        response = json.loads(sys.stdin.readline())
        if "error" in response:
            raise BskyToolsError(response["error"]["message"])
        return response["result"]
${methods}

bsky_tools = BskyTools()
`;
}

// ══════════════════════════════════════════════════════════════════
// AST Analysis helpers
// ══════════════════════════════════════════════════════════════════

/**
 * Analyze Python AST to detect write operations.
 * Returns a summary of detected write calls for confirmation UI.
 */
export interface WriteOperationSummary {
  tool: string;
  count: number;
  lineNumbers: number[];
}

/**
 * Python AST analysis is performed on the Python side using the `ast` module.
 * This TypeScript interface defines the expected result structure.
 */
export interface ASTAnalysisResult {
  hasWriteOperations: boolean;
  writeOperations: WriteOperationSummary[];
  hasDynamicCalls: boolean;
  dynamicCallLines: number[];
  error?: string;
}

/**
 * Python code snippet for AST analysis.
 * Injected before execution to analyze the code.
 */
export function generateASTAnalysisCode(pythonCode: string): string {
  const writeToolsList = Array.from(WRITE_TOOLS).map(t => `"${t}"`).join(', ');
  
  return `
import ast
import json
import sys

code = """${pythonCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\`/g, '\\`')}"""

try:
    tree = ast.parse(code)
except SyntaxError as e:
    print(json.dumps({"error": f"Syntax error: {e}"}))
    sys.exit(0)

write_tools = {${writeToolsList}}
write_ops = []
dynamic_calls = []

for node in ast.walk(tree):
    if isinstance(node, ast.Call):
        # Check for direct bsky_tools.xxx() calls
        if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == 'bsky_tools':
            tool_name = node.func.attr
            if tool_name in write_tools:
                write_ops.append({"tool": tool_name, "line": node.lineno})
        # Check for getattr(bsky_tools, ...) — dynamic calls
        elif isinstance(node.func, ast.Name) and node.func.id == 'getattr':
            dynamic_calls.append(node.lineno)
        # Check for hasattr + getattr patterns
        elif isinstance(node.func, ast.Attribute):
            # Could be bsky_tools.__getattribute__ or similar
            if hasattr(node.func, 'value') and isinstance(node.func.value, ast.Name) and node.func.value.id == 'bsky_tools':
                dynamic_calls.append(node.lineno)

# Group by tool
from collections import defaultdict
grouped = defaultdict(list)
for op in write_ops:
    grouped[op["tool"]].append(op["line"])

result = {
    "hasWriteOperations": len(write_ops) > 0,
    "writeOperations": [
        {"tool": tool, "count": len(lines), "lineNumbers": lines}
        for tool, lines in grouped.items()
    ],
    "hasDynamicCalls": len(dynamic_calls) > 0,
    "dynamicCallLines": dynamic_calls,
}

print(json.dumps(result))
`;
}
