/**
 * BskyTools Pyodide Bridge — PWA implementation using synchronous XHR in Worker.
 *
 * Architecture:
 * 1. Main thread sends auth config (JWT, DID, PDS) to Worker during init
 * 2. Worker creates a synchronous HTTP client using XMLHttpRequest (sync mode)
 * 3. Client directly calls Bluesky XRPC endpoints
 * 4. Bridge object is exposed to Python via `js.bskyToolsBridge`
 *
 * Why synchronous XHR?
 * - Pyodide runs in a Web Worker where sync XHR is allowed
 * - Python code can make truly synchronous API calls
 * - No complex async/await or cross-thread communication needed
 *
 * Limitations:
 * - Sync XHR may block the Worker thread briefly
 * - Only available in Web Workers (not main thread)
 */

interface AuthConfig {
  jwt: string;
  did: string;
  handle: string;
  pds: string;
}

interface ApiResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
  status: number;
}

/**
 * Make a synchronous HTTP request inside a Web Worker.
 * Uses XMLHttpRequest with open(method, url, false) for synchronous mode.
 */
function syncRequest(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  body?: string
): ApiResponse {
  const xhr = new XMLHttpRequest();
  xhr.open(method, url, false); // false = synchronous

  for (const [key, value] of Object.entries(headers)) {
    xhr.setRequestHeader(key, value);
  }

  try {
    xhr.send(body || null);

    if (xhr.status >= 200 && xhr.status < 300) {
      return {
        ok: true,
        data: xhr.responseText ? JSON.parse(xhr.responseText) : null,
        status: xhr.status,
      };
    }

    return {
      ok: false,
      error: `HTTP ${xhr.status}: ${xhr.statusText}`,
      status: xhr.status,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      status: 0,
    };
  }
}

/**
 * Create the bsky_tools bridge for Pyodide.
 * This object is exposed to Python via `js.bskyToolsBridge`.
 */
export function createBskyToolsBridge(auth: AuthConfig) {
  const headers = {
    'Authorization': `Bearer ${auth.jwt}`,
    'Content-Type': 'application/json',
  };

  const pds = auth.pds || 'https://api.bsky.app';

  // Helper to make authenticated GET requests
  const get = (endpoint: string, params?: Record<string, unknown>) => {
    const url = new URL(`${pds}/xrpc/${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return syncRequest('GET', url.toString(), headers);
  };

  // Helper to make authenticated POST requests
  const post = (endpoint: string, body: Record<string, unknown>) => {
    return syncRequest('POST', `${pds}/xrpc/${endpoint}`, headers, JSON.stringify(body));
  };

  const bridge: Record<string, Function> = {};

  bridge.resolve_handle = (handle: string) => { const res = get('com.atproto.identity.resolveHandle', { handle }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_record = (uri: string) => { const match = uri.match(/at:\/\/([^/]+)\/([^/]+)\/(.+)/); if (!match) return { error: 'Invalid AT URI' }; const res = get('com.atproto.repo.getRecord', { repo: match[1], collection: match[2], rkey: match[3] }); return res.ok ? res.data : { error: res.error }; };
  bridge.list_records = (repo: string, collection: string, limit?: number, cursor?: string) => { const res = get('com.atproto.repo.listRecords', { repo, collection, limit, cursor }); return res.ok ? res.data : { error: res.error }; };
  bridge.search_posts = (q: string, limit?: number, cursor?: string, sort?: string) => { const res = get('app.bsky.feed.searchPosts', { q, limit, cursor, sort }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_timeline = (limit?: number, cursor?: string) => { const res = get('app.bsky.feed.getTimeline', { limit, cursor }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_author_feed = (actor: string, limit?: number, cursor?: string) => { const res = get('app.bsky.feed.getAuthorFeed', { actor, limit, cursor }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_popular_feed_generators = (limit?: number) => { const res = get('app.bsky.unspecced.getPopularFeedGenerators', { limit }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_feed_generator = (feed: string) => { const res = get('app.bsky.feed.getFeedGenerator', { feed }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_feed = (feed: string, limit?: number, cursor?: string) => { const res = get('app.bsky.feed.getFeed', { feed, limit, cursor }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_post_thread = (uri: string, depth?: number) => { const res = get('app.bsky.feed.getPostThread', { uri, depth }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_post_context = (uri: string, maxReplies?: number) => { const res = get('app.bsky.feed.getPostThread', { uri, depth: 3 }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_post_interactions = (uri: string, type?: string, limit?: number, cursor?: string) => { if (type === 'reposts') { const res = get('app.bsky.feed.getRepostedBy', { uri, limit, cursor }); return res.ok ? res.data : { error: res.error }; } const res = get('app.bsky.feed.getLikes', { uri, limit, cursor }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_quotes = (uri: string, limit?: number, cursor?: string) => { const res = get('app.bsky.feed.searchPosts', { q: uri, limit, cursor }); return res.ok ? res.data : { error: res.error }; };
  bridge.search_actors = (q: string, limit?: number, cursor?: string) => { const res = get('app.bsky.actor.searchActors', { q, limit, cursor }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_profile = (actor: string) => { const res = get('app.bsky.actor.getProfile', { actor }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_connections = (actor: string, direction?: string, limit?: number, cursor?: string) => { if (direction === 'followers') { const res = get('app.bsky.graph.getFollowers', { actor, limit, cursor }); return res.ok ? res.data : { error: res.error }; } const res = get('app.bsky.graph.getFollows', { actor, limit, cursor }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_suggested_follows = (actor: string) => { const res = get('app.bsky.graph.getSuggestedFollows', { actor }); return res.ok ? res.data : { error: res.error }; };
  bridge.list_notifications = (limit?: number, cursor?: string) => { const res = get('app.bsky.notification.listNotifications', { limit, cursor }); return res.ok ? res.data : { error: res.error }; };
  bridge.extract_images_from_post = (uri: string) => { return { error: 'Not implemented in PWA bridge' }; };
  bridge.download_image = (did: string, cid: string, filename?: string) => { return { error: 'Not implemented in PWA bridge' }; };
  bridge.view_image = (did?: string, cid?: string, alt?: string, uploadIndex?: number) => { return { error: 'Not implemented in PWA bridge' }; };
  bridge.extract_external_link = (uri: string) => { return { error: 'Not implemented in PWA bridge' }; };
  bridge.fetch_web_markdown = (url: string) => { return { error: 'Not implemented in PWA bridge' }; };
  bridge.search_web_ddg = (query: string) => { return { error: 'Not implemented in PWA bridge' }; };
  bridge.search_wikipedia = (query: string, lang?: string) => { return { error: 'Not implemented in PWA bridge' }; };
  bridge.get_lists = (actor?: string) => { const res = get('app.bsky.graph.getLists', { actor }); return res.ok ? res.data : { error: res.error }; };
  bridge.get_list_feed = (list: string, limit?: number, cursor?: string) => { const res = get('app.bsky.feed.getListFeed', { list, limit, cursor }); return res.ok ? res.data : { error: res.error }; };

  // Write operations (disabled by default)
  const writeTools = ['create_post', 'like', 'repost', 'follow', 'create_list', 'edit_list_members'];
  for (const tool of writeTools) {
    bridge[tool] = () => ({ error: `Write operation '${tool}' requires user confirmation. Not available in PWA Python sandbox.` });
  }

  return bridge;
}

/**
 * Generate Python wrapper code for Pyodide.
 * This version uses synchronous JS calls via the `js` module.
 */
export function getPyodidePythonWrapper(): string {
  return `
import js
from typing import List, Dict, Any, Optional

class BskyToolsError(Exception):
    pass

class BskyTools:
    def __init__(self):
        self._bridge = js.bskyToolsBridge

    def _call(self, method: str, *args):
        result = getattr(self._bridge, method)(*args)
        # Convert JS proxy to Python dict
        if hasattr(result, 'to_py'):
            return result.to_py()
        return result

    def resolve_handle(self, handle: str, fields: Optional[List[str]] = None):
        return self._call('resolve_handle', handle)

    def get_record(self, uri: str, fields: Optional[List[str]] = None):
        return self._call('get_record', uri)

    def list_records(self, repo: str, collection: str, limit: int = 50, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('list_records', repo, collection, limit, cursor)

    def search_posts(self, q: str, limit: int = 25, cursor: Optional[str] = None, sort: str = 'top', fields: Optional[List[str]] = None):
        return self._call('search_posts', q, limit, cursor, sort)

    def get_timeline(self, limit: int = 50, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('get_timeline', limit, cursor)

    def get_author_feed(self, actor: str, limit: int = 50, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('get_author_feed', actor, limit, cursor)

    def get_popular_feed_generators(self, limit: int = 50, fields: Optional[List[str]] = None):
        return self._call('get_popular_feed_generators', limit)

    def get_feed_generator(self, feed: str, fields: Optional[List[str]] = None):
        return self._call('get_feed_generator', feed)

    def get_feed(self, feed: str, limit: int = 50, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('get_feed', feed, limit, cursor)

    def get_post_thread(self, uri: str, depth: int = 3, fields: Optional[List[str]] = None):
        return self._call('get_post_thread', uri, depth)

    def get_post_context(self, uri: str, max_replies: int = 5, fields: Optional[List[str]] = None):
        return self._call('get_post_context', uri, max_replies)

    def get_post_interactions(self, uri: str, type: str = 'likes', limit: int = 50, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('get_post_interactions', uri, type, limit, cursor)

    def get_quotes(self, uri: str, limit: int = 25, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('get_quotes', uri, limit, cursor)

    def search_actors(self, q: str, limit: int = 25, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('search_actors', q, limit, cursor)

    def get_profile(self, actor: str, fields: Optional[List[str]] = None):
        return self._call('get_profile', actor)

    def get_connections(self, actor: str, direction: str = 'following', limit: int = 50, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('get_connections', actor, direction, limit, cursor)

    def get_suggested_follows(self, actor: str, fields: Optional[List[str]] = None):
        return self._call('get_suggested_follows', actor)

    def list_notifications(self, limit: int = 50, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('list_notifications', limit, cursor)

    def extract_images_from_post(self, uri: str, fields: Optional[List[str]] = None):
        return self._call('extract_images_from_post', uri)

    def download_image(self, did: str, cid: str, filename: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('download_image', did, cid, filename)

    def view_image(self, did: Optional[str] = None, cid: Optional[str] = None, alt: Optional[str] = None, upload_index: Optional[int] = None, fields: Optional[List[str]] = None):
        return self._call('view_image', did, cid, alt, upload_index)

    def extract_external_link(self, uri: str, fields: Optional[List[str]] = None):
        return self._call('extract_external_link', uri)

    def fetch_web_markdown(self, url: str, fields: Optional[List[str]] = None):
        return self._call('fetch_web_markdown', url)

    def search_web_ddg(self, query: str, fields: Optional[List[str]] = None):
        return self._call('search_web_ddg', query)

    def search_wikipedia(self, query: str, lang: str = 'en', fields: Optional[List[str]] = None):
        return self._call('search_wikipedia', query, lang)

    def get_lists(self, actor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('get_lists', actor)

    def get_list_feed(self, list_uri: str, limit: int = 30, cursor: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('get_list_feed', list_uri, limit, cursor)

    # Write operations
    def create_post(self, text: str, reply_to: Optional[str] = None, quote_uri: Optional[str] = None, images: Optional[List[Dict]] = None, threadgate: Optional[Dict] = None, fields: Optional[List[str]] = None):
        return self._call('create_post', text, reply_to, quote_uri, images, threadgate)

    def like(self, uri: str, fields: Optional[List[str]] = None):
        return self._call('like', uri)

    def repost(self, uri: str, fields: Optional[List[str]] = None):
        return self._call('repost', uri)

    def follow(self, subject: str, fields: Optional[List[str]] = None):
        return self._call('follow', subject)

    def create_list(self, name: str, purpose: str, description: Optional[str] = None, fields: Optional[List[str]] = None):
        return self._call('create_list', name, purpose, description)

    def edit_list_members(self, list_uri: str, subject: str, action: str = 'add', fields: Optional[List[str]] = None):
        return self._call('edit_list_members', list_uri, subject, action)

bsky_tools = BskyTools()
`;
}
