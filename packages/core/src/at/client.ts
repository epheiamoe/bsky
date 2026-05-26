import ky, { HTTPError, type KyInstance } from 'ky';
import type {
  CreateSessionResponse,
  DidDocument,
  ResolveHandleResponse,
  ResolveDidResponse,
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
  GetListResponse,
  GetListsResponse,
  GetListFeedResponse,
  GetListBlocksResponse,
  GetListMutesResponse,
  GetListsWithMembershipResponse,
  ListPurpose,
  GetActorLikesResponse,
  GetRelationshipsResponse,
  ThreadgateRule,
  Label,
  LabelerView,
} from './types.js';
import { parseAtUri } from './types.js';

const BSKY_SERVICE = 'https://bsky.social';
const PUBLIC_API = 'https://public.api.bsky.app';
const CHAT_API = 'https://api.bsky.chat';
const APP_VERSION = '0.13.1';

export interface LoginErrorDetail {
  status: number;
  blueskyError?: string;
  blueskyMessage?: string;
  requestUrl: string;
  timestamp: string;
  handleOriginal: string;
  passwordMasked: string;
  pdsUrl: string;
  version: string;
  commitHash: string;
  buildTime: string;
}

export class BskyClient {
  static commitHash = '(unknown)';
  static buildTime = '(unknown)';

  session: CreateSessionResponse | null = null;
  pdsUrl: string;
  private ky: KyInstance;
  private publicKy: KyInstance;
  private chatKy: KyInstance;
  private _withRefresh: (request: Request, _options: unknown, response: Response) => Promise<Response | void>;
  private _authHook: (request: Request) => Promise<Request>;
  private _refreshPromise: Promise<CreateSessionResponse | null> | null = null;
  /** Called when a JWT refresh attempt fails and the session becomes invalid. Auth store hooks into this to reset UI state. */
  _onSessionExpired?: () => void;

  constructor(options?: { pdsUrl?: string }) {
    const entryPds = options?.pdsUrl ?? BSKY_SERVICE;
    this.pdsUrl = entryPds;
    const self = this;

    this._authHook = async (request) => {
      if (self.session) {
        request.headers.set('Authorization', `Bearer ${self.session.accessJwt}`);
      }
      return request;
    };

    this._withRefresh = async (request, _options, response) => {
      if (!response.ok) {
        const body = await response.clone().text();
        if ((response.status === 400 || response.status === 401) && self.session) {
          try {
            const err = JSON.parse(body);
            if (err.error === 'ExpiredToken' || err.error === 'InvalidToken') {
              if (!self._refreshPromise) {
                self._refreshPromise = (async () => {
                  const session = self.session!;
                  await new Promise(r => setTimeout(r, 200));
                  try {
                    const r = await fetch(`${self.pdsUrl}/xrpc/com.atproto.server.refreshSession`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${session.refreshJwt}` },
                    });
                    if (r.ok) {
                      self.session = await r.json() as CreateSessionResponse;
                      return self.session;
                    }
                  } catch {
                    return null;
                  }
                  self.session = null;
                  self._onSessionExpired?.();
                  return null;
                })();
                self._refreshPromise.finally(() => { self._refreshPromise = null; });
              }
              const refreshed = await self._refreshPromise;
              if (refreshed && self.session) {
                const retryRes = await fetch(request.url, {
                  method: request.method,
                  headers: { Authorization: `Bearer ${self.session.accessJwt}` },
                });
                if (retryRes.ok) return retryRes;
              }
            }
          } catch { /* non-JSON body */ }
        }
        console.error(`[bsky] ${response.status} ${request.method} ${request.url} → ${body}`);
      }
    };

    this.ky = ky.create({
      prefixUrl: entryPds + '/xrpc',
      timeout: 30000,
      retry: { limit: 1, statusCodes: [408, 413, 429, 500, 502, 503, 504] },
      hooks: { beforeRequest: [this._authHook], afterResponse: [this._withRefresh] },
    });
    this.publicKy = ky.create({
      prefixUrl: PUBLIC_API + '/xrpc',
      timeout: 30000,
      retry: { limit: 1, statusCodes: [408, 413, 429, 500, 502, 503, 504] },
    });
    this.chatKy = ky.create({
      prefixUrl: CHAT_API + '/xrpc',
      timeout: 30000,
      retry: { limit: 1, statusCodes: [408, 413, 429, 500, 502, 503, 504] },
      hooks: { beforeRequest: [this._authHook], afterResponse: [this._withRefresh] },
    });
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.session) return {};
    return { Authorization: `Bearer ${this.session.accessJwt}` };
  }

  async login(handle: string, password: string): Promise<CreateSessionResponse> {
    const entryUrl = this.pdsUrl;
    const entryKy = entryUrl === BSKY_SERVICE || !this.ky
      ? ky.create({
          prefixUrl: entryUrl + '/xrpc',
          timeout: 30000,
          retry: { limit: 1, statusCodes: [408, 413, 429, 500, 502, 503, 504] },
        })
      : this.ky;

    let res: CreateSessionResponse & { didDoc?: DidDocument };
    try {
      res = await entryKy.post('com.atproto.server.createSession', {
        json: { identifier: handle, password },
      }).json<CreateSessionResponse & { didDoc?: DidDocument }>();
    } catch (e) {
      if (e instanceof HTTPError) {
        const body = await e.response.clone().text();
        const detail: LoginErrorDetail = {
          status: e.response.status,
          requestUrl: e.request.url,
          timestamp: new Date().toISOString(),
          handleOriginal: handle,
          passwordMasked: password.replace(/[A-Za-z0-9]/g, '*'),
          pdsUrl: entryUrl,
          version: APP_VERSION,
          commitHash: BskyClient.commitHash,
          buildTime: BskyClient.buildTime,
        };
        try {
          const err = JSON.parse(body) as { error?: string; message?: string };
          detail.blueskyError = err.error;
          detail.blueskyMessage = err.message;
          throw new Error(err.message || err.error || e.message, { cause: detail });
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.cause) throw parseErr;
          throw new Error(e.message, { cause: detail });
        }
      }
      throw e;
    }

    this.session = res;

    // Discover user's actual PDS from DID document
    let userPdsUrl = entryUrl;
    if (res.didDoc) {
      const pdsService = res.didDoc.service?.find(
        s => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
      );
      if (pdsService?.serviceEndpoint) {
        userPdsUrl = pdsService.serviceEndpoint.replace(/\/+$/, '');
      }
    } else {
      try {
        const discovered = await this._discoverPdsFromDid(res.did);
        if (discovered) userPdsUrl = discovered;
      } catch { /* stay with entryUrl */ }
    }

    this.pdsUrl = userPdsUrl;
    this.ky = ky.create({
      prefixUrl: this.pdsUrl + '/xrpc',
      timeout: 30000,
      retry: { limit: 1, statusCodes: [408, 413, 429, 500, 502, 503, 504] },
      hooks: { beforeRequest: [this._authHook], afterResponse: [this._withRefresh] },
    });

    return res;
  }

  private async _discoverPdsFromDid(did: string): Promise<string | null> {
    const didDoc = await this.publicKy.get('com.atproto.identity.resolveDid', {
      searchParams: { did },
    }).json<ResolveDidResponse>();
    const pdsService = didDoc.didDoc?.service?.find(
      s => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
    );
    return pdsService?.serviceEndpoint?.replace(/\/+$/, '') ?? null;
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
    return this.publicKy.get('app.bsky.actor.searchActors', {
      searchParams,
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

  // ── List methods (app.bsky.graph.*) ──

  async getList(listUri: string, limit = 50, cursor?: string): Promise<GetListResponse> {
    const params: Record<string, string | number> = { list: listUri, limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.graph.getList', {
      searchParams: params,
      ...headers,
    }).json<GetListResponse>();
  }

  async getLists(actor: string, limit = 50, cursor?: string, purposes?: string[]): Promise<GetListsResponse> {
    const sp = new URLSearchParams({ actor, limit: String(limit) });
    if (cursor) sp.set('cursor', cursor);
    if (purposes) purposes.forEach(p => sp.append('purposes', p));
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.graph.getLists', {
      searchParams: sp.toString(),
      ...headers,
    }).json<GetListsResponse>();
  }

  async getListFeed(listUri: string, limit = 50, cursor?: string): Promise<GetListFeedResponse> {
    const params: Record<string, string | number> = { list: listUri, limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.feed.getListFeed', {
      searchParams: params,
      ...headers,
    }).json<GetListFeedResponse>();
  }

  async getListBlocks(limit = 50, cursor?: string): Promise<GetListBlocksResponse> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    return this.ky.get('app.bsky.graph.getListBlocks', {
      headers: this.getAuthHeaders(),
      searchParams: params,
    }).json<GetListBlocksResponse>();
  }

  async getListMutes(limit = 50, cursor?: string): Promise<GetListMutesResponse> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    return this.ky.get('app.bsky.graph.getListMutes', {
      headers: this.getAuthHeaders(),
      searchParams: params,
    }).json<GetListMutesResponse>();
  }

  async getListsWithMembership(actor: string, limit = 50, cursor?: string, purposes?: string[]): Promise<GetListsWithMembershipResponse> {
    const sp = new URLSearchParams({ actor, limit: String(limit) });
    if (cursor) sp.set('cursor', cursor);
    if (purposes) purposes.forEach(p => sp.append('purposes', p));
    return this.ky.get('app.bsky.graph.getListsWithMembership', {
      headers: this.getAuthHeaders(),
      searchParams: sp.toString(),
    }).json<GetListsWithMembershipResponse>();
  }

  async muteActorList(listUri: string): Promise<void> {
    await this.ky.post('app.bsky.graph.muteActorList', {
      headers: this.getAuthHeaders(),
      json: { list: listUri },
    });
  }

  async unmuteActorList(listUri: string): Promise<void> {
    await this.ky.post('app.bsky.graph.unmuteActorList', {
      headers: this.getAuthHeaders(),
      json: { list: listUri },
    });
  }

  async putRecord(
    repo: string,
    collection: string,
    rkey: string,
    record: Record<string, unknown>,
    swapRecord?: string,
  ): Promise<CreateRecordResponse> {
    const body: Record<string, unknown> = { repo, collection, rkey, record };
    if (swapRecord) body.swapRecord = swapRecord;
    return this.ky.post('com.atproto.repo.putRecord', {
      headers: this.getAuthHeaders(),
      json: body,
    }).json<CreateRecordResponse>();
  }

  async createList(name: string, purpose: ListPurpose, description?: string, avatar?: UploadBlobResponse['blob']): Promise<{ uri: string; cid: string }> {
    const record: Record<string, unknown> = {
      $type: 'app.bsky.graph.list',
      purpose,
      name,
      createdAt: new Date().toISOString(),
    };
    if (description) record.description = description;
    if (avatar) record.avatar = avatar;
    const did = this.getDID();
    return this.createRecord(did, 'app.bsky.graph.list', record);
  }

  async deleteList(listUri: string): Promise<void> {
    const rkey = listUri.split('/').pop() ?? '';
    await this.deleteRecord(this.getDID(), 'app.bsky.graph.list', rkey);
  }

  async updateList(listUri: string, params: { name?: string; description?: string; avatar?: UploadBlobResponse['blob'] }): Promise<{ uri: string; cid: string }> {
    const rkey = listUri.split('/').pop() ?? '';
    const parsed = parseAtUri(listUri);
    const existing = await this.getList(listUri);
    const record: Record<string, unknown> = {
      $type: 'app.bsky.graph.list',
      purpose: existing.list.purpose,
      name: params.name ?? existing.list.name,
      createdAt: existing.list.indexedAt ?? new Date().toISOString(),
    };
    if (params.description !== undefined) record.description = params.description;
    if (params.avatar) record.avatar = params.avatar;
    return this.putRecord(parsed.did, 'app.bsky.graph.list', rkey, record);
  }

  async addListItem(listUri: string, subjectDid: string): Promise<{ uri: string; cid: string }> {
    const record = {
      $type: 'app.bsky.graph.listitem',
      subject: subjectDid,
      list: listUri,
      createdAt: new Date().toISOString(),
    };
    return this.createRecord(this.getDID(), 'app.bsky.graph.listitem', record);
  }

  async removeListItem(listItemUri: string): Promise<void> {
    const parsed = parseAtUri(listItemUri);
    await this.deleteRecord(parsed.did, 'app.bsky.graph.listitem', parsed.rkey);
  }

  async blockList(listUri: string): Promise<{ uri: string; cid: string }> {
    const record = {
      $type: 'app.bsky.graph.listblock',
      subject: listUri,
      createdAt: new Date().toISOString(),
    };
    return this.createRecord(this.getDID(), 'app.bsky.graph.listblock', record);
  }

  async unblockList(listBlockUri: string): Promise<void> {
    const parsed = parseAtUri(listBlockUri);
    await this.deleteRecord(parsed.did, 'app.bsky.graph.listblock', parsed.rkey);
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
    // Try bsky.social proxy first — handles cross-shard blobs, most common case
    try {
      const proxyKy = this.ky.extend({ prefixUrl: 'https://bsky.social/xrpc' });
      const res = await proxyKy.get('com.atproto.sync.getBlob', {
        searchParams: { did, cid },
        timeout: 30000,
      });
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      // Fall back to direct PDS (works for same-shard blobs)
      const res = await this.ky.get('com.atproto.sync.getBlob', {
        searchParams: { did, cid },
        timeout: 30000,
      });
      return new Uint8Array(await res.arrayBuffer());
    }
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

  restoreSession(session: CreateSessionResponse, pdsUrl?: string): void {
    this.session = session;
    if (pdsUrl) this.pdsUrl = pdsUrl;
    this.ky = ky.create({
      prefixUrl: this.pdsUrl + '/xrpc',
      timeout: 30000,
      retry: { limit: 1, statusCodes: [408, 413, 429, 500, 502, 503, 504] },
      hooks: { beforeRequest: [this._authHook], afterResponse: [this._withRefresh] },
    });
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

  // ── Threadgate (app.bsky.feed.threadgate) methods ──

  /**
   * Create or update a threadgate for a post.
   * The rkey MUST match the post's rkey. putRecord handles both create and update.
   * Pass allow=undefined for "everyone can reply" (no record needed — call deleteThreadgate instead).
   */
  async putThreadgate(postUri: string, allow: ThreadgateRule[]): Promise<CreateRecordResponse> {
    const parsed = parseAtUri(postUri);
    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.threadgate',
      post: postUri,
      allow,
      createdAt: new Date().toISOString(),
    };
    return this.putRecord(parsed.did, 'app.bsky.feed.threadgate', parsed.rkey, record);
  }

  /** Delete an existing threadgate (= revert to "anyone can reply"). Silently ignores if none exists. */
  async deleteThreadgate(postUri: string): Promise<void> {
    const parsed = parseAtUri(postUri);
    try {
      await this.deleteRecord(parsed.did, 'app.bsky.feed.threadgate', parsed.rkey);
    } catch {
      // threadgate may not exist yet — silently ignore
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

  async putProfile(params: { displayName?: string; description?: string; avatar?: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }; banner?: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }; pronouns?: string }): Promise<void> {
    const did = this.getDID();
    const record: Record<string, unknown> = {
      $type: 'app.bsky.actor.profile',
      displayName: params.displayName,
      description: params.description,
    };
    if (params.avatar) record.avatar = params.avatar;
    if (params.banner) record.banner = params.banner;
    if (params.pronouns !== undefined) {
      if (params.pronouns) record.pronouns = params.pronouns;
      // if empty string, we still need to include it to clear the field
      else record.pronouns = undefined;
    }
    await this.ky.post('com.atproto.repo.putRecord', {
      headers: this.getAuthHeaders(),
      json: { repo: did, collection: 'app.bsky.actor.profile', rkey: 'self', record },
    });
  }

  /** Get the raw app.bsky.actor.profile record (includes pronouns and other fields not exposed by getProfile) */
  async getProfileRecord(): Promise<Record<string, unknown>> {
    const did = this.getDID();
    return this.ky.get('com.atproto.repo.getRecord', {
      headers: this.getAuthHeaders(),
      searchParams: { repo: did, collection: 'app.bsky.actor.profile', rkey: 'self' },
    }).json<{ value: Record<string, unknown> }>().then(r => r.value);
  }

  // ── AtPlay: Social Circle API methods ──

  async getActorLikes(actor: string, limit = 50, cursor?: string): Promise<GetActorLikesResponse> {
    const params: Record<string, string | number> = { actor, limit };
    if (cursor) params.cursor = cursor;
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    return kyInstance.get('app.bsky.feed.getActorLikes', {
      searchParams: params,
      ...headers,
    }).json<GetActorLikesResponse>();
  }

  async getRelationships(actor: string, others: string[]): Promise<GetRelationshipsResponse> {
    const chunks = [];
    for (let i = 0; i < others.length; i += 30) {
      chunks.push(others.slice(i, i + 30));
    }
    const allRelationships: GetRelationshipsResponse['relationships'] = [];
    for (const chunk of chunks) {
      const sp = new URLSearchParams();
      sp.set('actor', actor);
      chunk.forEach(d => sp.append('others', d));
      const kyInstance = this.session ? this.ky : this.publicKy;
      const headers = this.session ? { headers: this.getAuthHeaders() } : {};
      const res = await kyInstance.get('app.bsky.graph.getRelationships', {
        searchParams: sp.toString(),
        ...headers,
      }).json<GetRelationshipsResponse>();
      allRelationships.push(...(res.relationships || []));
    }
    return { actor, relationships: allRelationships };
  }

  // ── Labeling / Moderation API methods ──

  async queryLabels(params: { uriPatterns: string[]; sources?: string[]; limit?: number; cursor?: string }): Promise<{ labels: Label[]; cursor?: string }> {
    const sp = new URLSearchParams();
    params.uriPatterns.forEach(p => sp.append('uriPatterns', p));
    if (params.sources) params.sources.forEach(s => sp.append('sources', s));
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.cursor) sp.set('cursor', params.cursor);
    return this.publicKy.get('com.atproto.label.queryLabels', {
      searchParams: sp,
    }).json<{ labels: Label[]; cursor?: string }>();
  }

  async getLabelerServices(dids: string[]): Promise<LabelerView[]> {
    const sp = new URLSearchParams();
    dids.forEach(d => sp.append('dids', d));
    const kyInstance = this.session ? this.ky : this.publicKy;
    const headers = this.session ? { headers: this.getAuthHeaders() } : {};
    const res = await kyInstance.get('app.bsky.labeler.getServices', {
      searchParams: sp,
      ...headers,
    }).json<{ views: LabelerView[] }>();
    return res.views || [];
  }

  async getPreferences(): Promise<{ preferences: unknown[] }> {
    return this.ky.get('app.bsky.actor.getPreferences', {
      headers: this.getAuthHeaders(),
    }).json<{ preferences: unknown[] }>();
  }

  async putPreferences(preferences: unknown[]): Promise<void> {
    await this.ky.post('app.bsky.actor.putPreferences', {
      headers: this.getAuthHeaders(),
      json: { preferences },
    });
  }

  /**
   * [v0.15.0] Extract moderation preferences from PDS.
   * Returns adultContentEnabled, contentLabels, and subscribed labeler DIDs.
   * Per-labeler preferences are NOT stored in PDS and will be empty.
   */
  async getModerationPrefs(): Promise<{ adultContentEnabled: boolean; contentLabels: Array<{ label: string; visibility: 'show' | 'warn' | 'hide' }>; labelerDids: string[] }> {
    const { preferences } = await this.getPreferences();
    let adultContentEnabled = false;
    const contentLabels: Array<{ label: string; visibility: 'show' | 'warn' | 'hide' }> = [];
    const labelerDids: string[] = [];

    for (const pref of preferences) {
      const p = pref as Record<string, unknown>;
      if (p.$type === 'app.bsky.actor.defs#adultContentPref') {
        adultContentEnabled = !!p.enabled;
      } else if (p.$type === 'app.bsky.actor.defs#contentLabelPref') {
        const vis = p.visibility as string;
        if (vis === 'show' || vis === 'warn' || vis === 'hide') {
          contentLabels.push({ label: p.label as string, visibility: vis });
        }
      } else if (p.$type === 'app.bsky.actor.defs#labelersPref') {
        const labelers = p.labelers as Array<{ did: string }> | undefined;
        if (labelers) {
          for (const l of labelers) {
            if (l.did) labelerDids.push(l.did);
          }
        }
      }
    }

    return { adultContentEnabled, contentLabels, labelerDids };
  }

  /**
   * [v0.15.0] Write moderation preferences to PDS.
   * Only adultContentPref, contentLabelPref, and labelersPref are synced.
   * Per-labeler label preferences are NOT synced (PDS API limitation).
   */
  async putModerationPrefs(params: { adultContentEnabled: boolean; contentLabels: Array<{ label: string; visibility: 'show' | 'warn' | 'hide' }>; labelerDids: string[] }): Promise<void> {
    // Get existing preferences to preserve non-moderation prefs
    const { preferences } = await this.getPreferences();
    const newPrefs: unknown[] = [];

    // Keep all non-moderation preferences
    for (const pref of preferences) {
      const p = pref as Record<string, unknown>;
      const type = p.$type as string;
      if (type !== 'app.bsky.actor.defs#adultContentPref' &&
          type !== 'app.bsky.actor.defs#contentLabelPref' &&
          type !== 'app.bsky.actor.defs#labelersPref') {
        newPrefs.push(pref);
      }
    }

    // Add adult content preference
    newPrefs.push({
      $type: 'app.bsky.actor.defs#adultContentPref',
      enabled: params.adultContentEnabled,
    });

    // Add content label preferences
    for (const cl of params.contentLabels) {
      newPrefs.push({
        $type: 'app.bsky.actor.defs#contentLabelPref',
        label: cl.label,
        visibility: cl.visibility,
      });
    }

    // Add labelers preference
    if (params.labelerDids.length > 0) {
      newPrefs.push({
        $type: 'app.bsky.actor.defs#labelersPref',
        labelers: params.labelerDids.map(did => ({ did })),
      });
    }

    await this.putPreferences(newPrefs);
  }

  async createModerationReport(params: {
    reasonType: string;
    reason?: string;
    subject: { did?: string; uri?: string; cid?: string };
    reportedBy?: string;
  }): Promise<{ id: number; report: unknown }> {
    return this.ky.post('com.atproto.moderation.createReport', {
      headers: this.getAuthHeaders(),
      json: params,
    }).json<{ id: number; report: unknown }>();
  }
}
