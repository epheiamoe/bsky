import ky, { type KyInstance } from 'ky';
import type {
  CreateSessionResponse,
  ResolveHandleResponse,
  ProfileView,
  TimelineResponse,
  PostThreadResponse,
  GetLikesResponse,
  GetRepostedByResponse,
  SearchPostsResponse,
  SearchActorsResponse,
  GetFollowsResponse,
  GetFollowersResponse,
  GetSuggestedFollowsResponse,
  ListNotificationsResponse,
  AuthorFeedResponse,
  GetFeedResponse,
  GetFeedGeneratorsResponse,
  GetFeedGeneratorResponse,
  ListRecordsResponse,
  GetRecordResponse,
  UploadBlobResponse,
  CreateRecordResponse,
  CreateBookmarkResponse,
  GetBookmarksResponse,
} from './types.js';

const BSKY_SERVICE = 'https://bsky.social';
const PUBLIC_API = 'https://public.api.bsky.app';

export class BskyClient {
  private session: CreateSessionResponse | null = null;
  private ky: KyInstance;
  private publicKy: KyInstance;

  constructor() {
    this.ky = ky.create({ prefixUrl: BSKY_SERVICE + '/xrpc', timeout: 30000 });
    this.publicKy = ky.create({ prefixUrl: PUBLIC_API + '/xrpc', timeout: 30000 });
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.session) throw new Error('Not authenticated. Call login() first.');
    return { Authorization: `Bearer ${this.session.accessJwt}` };
  }

  async login(handle: string, password: string): Promise<CreateSessionResponse> {
    const res = await this.ky.post('com.atproto.server.createSession', {
      json: { identifier: handle, password },
    }).json<CreateSessionResponse>();
    this.session = res;
    return res;
  }

  async resolveHandle(handle: string): Promise<ResolveHandleResponse> {
    return this.publicKy.get('com.atproto.identity.resolveHandle', {
      searchParams: { handle },
    }).json<ResolveHandleResponse>();
  }

  async getProfile(actor: string): Promise<ProfileView> {
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.actor.getProfile', {
      searchParams: { actor },
      ...headers,
    }).json<ProfileView>();
  }

  async getTimeline(limit = 50, cursor?: string): Promise<TimelineResponse> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    return this.ky.get('app.bsky.feed.getTimeline', {
      headers: this.getAuthHeaders(),
      searchParams: params,
    }).json<TimelineResponse>();
  }

  async getAuthorFeed(actor: string, limit = 50, cursor?: string): Promise<AuthorFeedResponse> {
    const params: Record<string, string | number> = { actor, limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.feed.getAuthorFeed', {
      searchParams: params,
      ...headers,
    }).json<AuthorFeedResponse>();
  }

  async getPostThread(uri: string, depth = 6, parentHeight = 80): Promise<PostThreadResponse> {
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.feed.getPostThread', {
      searchParams: { uri, depth, parentHeight },
      ...headers,
    }).json<PostThreadResponse>();
  }

  async getLikes(uri: string, limit = 50, cursor?: string): Promise<GetLikesResponse> {
    const params: Record<string, string | number> = { uri, limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.feed.getLikes', {
      searchParams: params,
      ...headers,
    }).json<GetLikesResponse>();
  }

  async getRepostedBy(uri: string, limit = 50, cursor?: string): Promise<GetRepostedByResponse> {
    const params: Record<string, string | number> = { uri, limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.feed.getRepostedBy', {
      searchParams: params,
      ...headers,
    }).json<GetRepostedByResponse>();
  }

  async searchPosts(params: { q: string; limit?: number; cursor?: string; sort?: string }): Promise<SearchPostsResponse> {
    const searchParams: Record<string, string | number> = { q: params.q, limit: params.limit ?? 50 };
    if (params.cursor) searchParams.cursor = params.cursor;
    if (params.sort) searchParams.sort = params.sort;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.feed.searchPosts', {
      searchParams,
      ...headers,
    }).json<SearchPostsResponse>();
  }

  async searchActors(params: { q: string; limit?: number; cursor?: string }): Promise<SearchActorsResponse> {
    const searchParams: Record<string, string | number> = { q: params.q, limit: params.limit ?? 25 };
    if (params.cursor) searchParams.cursor = params.cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.actor.searchActors', {
      searchParams,
      ...headers,
    }).json<SearchActorsResponse>();
  }

  async getFollows(actor: string, limit = 50, cursor?: string): Promise<GetFollowsResponse> {
    const params: Record<string, string | number> = { actor, limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.graph.getFollows', {
      searchParams: params,
      ...headers,
    }).json<GetFollowsResponse>();
  }

  async getFollowers(actor: string, limit = 50, cursor?: string): Promise<GetFollowersResponse> {
    const params: Record<string, string | number> = { actor, limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.graph.getFollowers', {
      searchParams: params,
      ...headers,
    }).json<GetFollowersResponse>();
  }

  async getSuggestedFollows(actor: string): Promise<GetSuggestedFollowsResponse> {
    return this.ky.get('app.bsky.graph.getSuggestedFollowsByActor', {
      headers: this.getAuthHeaders(),
      searchParams: { actor },
    }).json<GetSuggestedFollowsResponse>();
  }

  async listNotifications(limit = 50, cursor?: string, priority?: boolean): Promise<ListNotificationsResponse> {
    const params: Record<string, string | number | boolean> = { limit };
    if (cursor) params.cursor = cursor;
    if (priority !== undefined) params.priority = priority;
    return this.ky.get('app.bsky.notification.listNotifications', {
      headers: this.getAuthHeaders(),
      searchParams: params,
    }).json<ListNotificationsResponse>();
  }

  async getPopularFeedGenerators(limit = 50, cursor?: string): Promise<GetFeedGeneratorsResponse> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.unspecced.getPopularFeedGenerators', {
      searchParams: params,
      ...headers,
    }).json<GetFeedGeneratorsResponse>();
  }

  async getFeedGenerator(feed: string): Promise<GetFeedGeneratorResponse> {
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.feed.getFeedGenerator', {
      searchParams: { feed },
      ...headers,
    }).json<GetFeedGeneratorResponse>();
  }

  async getFeed(feedUri: string, limit = 50, cursor?: string): Promise<GetFeedResponse> {
    const params: Record<string, string | number> = { feed: feedUri, limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.feed.getFeed', {
      searchParams: params,
      ...headers,
    }).json<GetFeedResponse>();
  }

  async listRecords(repo: string, collection: string, limit = 50, cursor?: string): Promise<ListRecordsResponse> {
    const params: Record<string, string | number> = { repo, collection, limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('com.atproto.repo.listRecords', {
      searchParams: params,
      ...headers,
    }).json<ListRecordsResponse>();
  }

  async getRecord(repo: string, collection: string, rkey: string): Promise<GetRecordResponse> {
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('com.atproto.repo.getRecord', {
      searchParams: { repo, collection, rkey },
      ...headers,
    }).json<GetRecordResponse>();
  }

  async createRecord(
    repo: string,
    collection: string,
    record: Record<string, unknown>,
    rkey?: string,
    swapCommit?: string,
  ): Promise<CreateRecordResponse> {
    const body: Record<string, unknown> = { repo, collection, record };
    if (rkey) body.rkey = rkey;
    if (swapCommit) body.swapCommit = swapCommit;
    return this.ky.post('com.atproto.repo.createRecord', {
      headers: this.getAuthHeaders(),
      json: body,
    }).json<CreateRecordResponse>();
  }

  async uploadBlob(data: Uint8Array, mimeType: string): Promise<UploadBlobResponse> {
    return this.ky.post('com.atproto.repo.uploadBlob', {
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': mimeType,
      },
      body: data,
    }).json<UploadBlobResponse>();
  }

  async downloadBlob(did: string, cid: string): Promise<Uint8Array> {
    // Use the PDS directly for blob download with a longer timeout
    const blobUrl = `${BSKY_SERVICE}/xrpc/com.atproto.sync.getBlob`;
    const res = await ky.get(blobUrl, {
      searchParams: { did, cid },
      timeout: 30000,
      ...(this.session ? { headers: this.getAuthHeaders() } : {}),
    });
    return new Uint8Array(await res.arrayBuffer());
  }

  getDID(): string {
    if (!this.session) throw new Error('Not authenticated');
    return this.session.did;
  }

  getHandle(): string {
    if (!this.session) throw new Error('Not authenticated');
    return this.session.handle;
  }

  getAccessJwt(): string {
    if (!this.session) throw new Error('Not authenticated');
    return this.session.accessJwt;
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }

  async createBookmark(uri: string, cid: string): Promise<CreateBookmarkResponse> {
    return this.ky.post('app.bsky.bookmark.createBookmark', {
      headers: this.getAuthHeaders(),
      json: { uri, cid },
    }).json<CreateBookmarkResponse>();
  }

  async deleteBookmark(uri: string): Promise<void> {
    try {
      await this.ky.post('app.bsky.bookmark.deleteBookmark', {
        headers: this.getAuthHeaders(),
        json: { uri },
      });
    } catch {
      // silently ignore if bookmark doesn't exist
    }
  }

  async getBookmarks(limit = 50, cursor?: string): Promise<GetBookmarksResponse> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    return this.ky.get('app.bsky.bookmark.getBookmarks', {
      headers: this.getAuthHeaders(),
      searchParams: params,
    }).json<GetBookmarksResponse>();
  }
}
