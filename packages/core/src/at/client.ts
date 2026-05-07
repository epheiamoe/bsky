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
  GetSuggestedFeedsResponse,
  ListNotificationsResponse,
  AuthorFeedResponse,
  GetFeedResponse,
  GetFeedGeneratorsResponse,
  GetFeedGeneratorResponse,
  GetTrendsResponse,
  ListRecordsResponse,
  GetRecordResponse,
  UploadBlobResponse,
  CreateRecordResponse,
  CreateBookmarkResponse,
  GetBookmarksResponse,
  DraftInput,
  DraftsResponse,
  CreateDraftResponse,
  ConvoListResponse,
  ConvoView,
  GetMessagesResponse,
  GetConvoResponse,
  MessageInput,
  MessageView,
} from './types.js';
import { parseAtUri } from './types.js';

const BSKY_SERVICE = 'https://bsky.social';
const PUBLIC_API = 'https://public.api.bsky.app';
const CHAT_API = 'https://api.bsky.chat';

export class BskyClient {
  private session: CreateSessionResponse | null = null;
  private ky: KyInstance;
  private publicKy: KyInstance;
  private chatKy: KyInstance;

  constructor() {
    const self = this;

    let _refreshPromise: Promise<CreateSessionResponse | null> | null = null;

    const withRefresh: (request: Request, _options: unknown, response: Response) => Promise<Response | void> = async (request, _options, response) => {
      if (!response.ok) {
        const body = await response.clone().text();
        if (response.status === 400 && self.session) {
          try {
            const err = JSON.parse(body);
            if (err.error === 'ExpiredToken' || err.error === 'InvalidToken') {
              // Shared refresh promise: concurrent 400s wait for the same refresh
              if (!_refreshPromise) {
                _refreshPromise = (async () => {
                  const session = self.session!;
                  await new Promise(r => setTimeout(r, 200));
                  try {
                    const r = await fetch(`${BSKY_SERVICE}/xrpc/com.atproto.server.refreshSession`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${session.refreshJwt}` },
                    });
                    if (r.ok) {
                      self.session = await r.json() as CreateSessionResponse;
                      return self.session;
                    }
                  } catch {
                    // Network error during refresh — keep session
                    return null;
                  }
                  self.session = null;
                  return null;
                })();
                _refreshPromise.finally(() => { _refreshPromise = null; });
              }
              const refreshed = await _refreshPromise;
              if (refreshed && self.session) {
                const retryRes = await fetch(request.url, {
                  method: request.method,
                  headers: { Authorization: `Bearer ${self.session.accessJwt}` },
                });
                if (retryRes.ok) return retryRes;
              }
              // Refresh or retry failed — will fall through to console.error below
            }
          } catch { /* non-JSON body */ }
        }
        console.error(`[bsky] ${response.status} ${request.method} ${request.url} → ${body}`);
      }
    };

    this.ky = ky.create({
      prefixUrl: BSKY_SERVICE + '/xrpc',
      timeout: 30000,
      hooks: { afterResponse: [withRefresh] },
    });
    this.publicKy = ky.create({
      prefixUrl: PUBLIC_API + '/xrpc',
      timeout: 30000,
    });
    this.chatKy = ky.create({
      prefixUrl: CHAT_API + '/xrpc',
      timeout: 30000,
      hooks: { afterResponse: [withRefresh] },
    });
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

  async getAuthorFeed(actor: string, limit = 50, cursor?: string, filter?: string): Promise<AuthorFeedResponse> {
    const params: Record<string, string | number> = { actor, limit };
    if (cursor) params.cursor = cursor;
    if (filter) params.filter = filter;
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
    // searchPosts requires authentication — public API returns 403
    return this.ky.get('app.bsky.feed.searchPosts', {
      headers: this.getAuthHeaders(),
      searchParams,
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

  async getSuggestedFeeds(limit = 30, cursor?: string): Promise<GetSuggestedFeedsResponse> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    return this.ky.get('app.bsky.feed.getSuggestedFeeds', {
      headers: this.getAuthHeaders(),
      searchParams: params,
    }).json<GetSuggestedFeedsResponse>();
  }

  async getTrends(limit = 20, personalizedFor?: string): Promise<GetTrendsResponse> {
    const params: Record<string, string | number> = { limit };
    if (personalizedFor) params.personalizedFor = personalizedFor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.unspecced.getTrends', {
      searchParams: params,
      ...headers,
    }).json<GetTrendsResponse>();
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

  async deleteRecord(repo: string, collection: string, rkey: string): Promise<void> {
    await this.ky.post('com.atproto.repo.deleteRecord', {
      headers: this.getAuthHeaders(),
      json: { repo, collection, rkey },
    });
  }

  async follow(did: string): Promise<{ uri: string }> {
    const res = await this.createRecord(this.getDID(), 'app.bsky.graph.follow', {
      subject: did,
      createdAt: new Date().toISOString(),
    });
    return { uri: res.uri };
  }

  async unfollow(followUri: string): Promise<void> {
    const rkey = followUri.split('/').pop() ?? '';
    await this.deleteRecord(this.getDID(), 'app.bsky.graph.follow', rkey);
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

  restoreSession(session: CreateSessionResponse): void {
    this.session = session;
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

  async deletePost(uri: string): Promise<void> {
    const parsed = parseAtUri(uri);
    await this.ky.post('com.atproto.repo.deleteRecord', {
      headers: this.getAuthHeaders(),
      json: {
        repo: parsed.did,
        collection: parsed.collection,
        rkey: parsed.rkey,
      },
    });
  }

  async getBookmarks(limit = 50, cursor?: string): Promise<GetBookmarksResponse> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    return this.ky.get('app.bsky.bookmark.getBookmarks', {
      headers: this.getAuthHeaders(),
      searchParams: params,
    }).json<GetBookmarksResponse>();
  }

  async createDraft(draft: DraftInput): Promise<CreateDraftResponse> {
    return this.ky.post('app.bsky.draft.createDraft', {
      headers: this.getAuthHeaders(),
      json: { draft },
    }).json<CreateDraftResponse>();
  }

  async updateDraft(id: string, draft: DraftInput): Promise<void> {
    await this.ky.post('app.bsky.draft.updateDraft', {
      headers: this.getAuthHeaders(),
      json: { draft: { id, draft } },
    });
  }

  async getDrafts(limit = 50, cursor?: string): Promise<DraftsResponse> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    return this.ky.get('app.bsky.draft.getDrafts', {
      headers: this.getAuthHeaders(),
      searchParams: params,
    }).json<DraftsResponse>();
  }

  async deleteDraft(id: string): Promise<void> {
    await this.ky.post('app.bsky.draft.deleteDraft', {
      headers: this.getAuthHeaders(),
      json: { id },
    });
  }

  getVideoThumbnailUrl(did: string, cid: string): string {
    return `https://video.bsky.app/watch/${encodeURIComponent(did)}/${encodeURIComponent(cid)}/thumbnail.jpg`;
  }

  getVideoPlaylistUrl(did: string, cid: string): string {
    return `https://video.bsky.app/watch/${encodeURIComponent(did)}/${encodeURIComponent(cid)}/playlist.m3u8`;
  }

  // ── Chat (DM) methods ──

  private async chatGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const searchParams: Record<string, string | number> = params ?? {};
    return this.chatKy.get(path, {
      headers: this.getAuthHeaders(),
      searchParams,
    }).json<T>();
  }

  private async chatPost<T>(path: string, body: unknown): Promise<T> {
    return this.chatKy.post(path, {
      headers: this.getAuthHeaders(),
      json: body,
    }).json<T>();
  }

  async listConvos(limit = 30, cursor?: string): Promise<ConvoListResponse> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    return this.chatGet<ConvoListResponse>('chat.bsky.convo.listConvos', params);
  }

  async getConvoForMembers(members: string[]): Promise<GetConvoResponse> {
    return this.chatGet<GetConvoResponse>('chat.bsky.convo.getConvoForMembers', {
      members: members.join(','),
    });
  }

  async getMessages(convoId: string, limit = 30, cursor?: string): Promise<GetMessagesResponse> {
    const params: Record<string, string | number> = { convoId, limit };
    if (cursor) params.cursor = cursor;
    return this.chatGet<GetMessagesResponse>('chat.bsky.convo.getMessages', params);
  }

  async sendMessage(convoId: string, message: MessageInput): Promise<MessageView> {
    return this.chatPost<MessageView>('chat.bsky.convo.sendMessage', {
      convoId,
      message,
    });
  }

  async addReaction(convoId: string, messageId: string, value: string): Promise<MessageView> {
    const res = await this.chatPost<{ message: MessageView }>('chat.bsky.convo.addReaction', {
      convoId,
      messageId,
      value,
    });
    return res.message;
  }

  async removeReaction(convoId: string, messageId: string, value: string): Promise<MessageView> {
    const res = await this.chatPost<{ message: MessageView }>('chat.bsky.convo.removeReaction', {
      convoId,
      messageId,
      value,
    });
    return res.message;
  }

  async updateRead(convoId: string, messageId?: string): Promise<{ convo: ConvoView }> {
    return this.chatPost<{ convo: ConvoView }>('chat.bsky.convo.updateRead', {
      convoId,
      ...(messageId ? { messageId } : {}),
    });
  }

  async deleteMessageForSelf(convoId: string, messageId: string): Promise<void> {
    await this.chatPost('chat.bsky.convo.deleteMessageForSelf', { convoId, messageId });
  }

  async muteConvo(convoId: string): Promise<{ convo: ConvoView }> {
    return this.chatPost<{ convo: ConvoView }>('chat.bsky.convo.muteConvo', { convoId });
  }

  async unmuteConvo(convoId: string): Promise<{ convo: ConvoView }> {
    return this.chatPost<{ convo: ConvoView }>('chat.bsky.convo.unmuteConvo', { convoId });
  }

  async leaveConvo(convoId: string): Promise<{ convo: ConvoView }> {
    return this.chatPost<{ convo: ConvoView }>('chat.bsky.convo.leaveConvo', { convoId });
  }

  async putProfile(params: { displayName?: string; description?: string; avatar?: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }; banner?: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number } }): Promise<void> {
    const did = this.getDID();
    const record: Record<string, unknown> = {
      $type: 'app.bsky.actor.profile',
      displayName: params.displayName,
      description: params.description,
    };
    if (params.avatar) record.avatar = params.avatar;
    if (params.banner) record.banner = params.banner;
    await this.ky.post('com.atproto.repo.putRecord', {
      headers: this.getAuthHeaders(),
      json: { repo: did, collection: 'app.bsky.actor.profile', rkey: 'self', record },
    });
  }
}
