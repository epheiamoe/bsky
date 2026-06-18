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
  ListView,
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
  VideoUploadOptions,
  VideoUploadResult,
  VideoJobStatus,
  GetServiceAuthResponse,
} from './types.js';
import { parseAtUri, VideoServiceError, VideoServiceErrorCode } from './types.js';

// Exported for unit tests. These are pure functions with no client state.
export function normalizeJobStatus(payload: unknown): VideoJobStatus | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as Record<string, unknown>;
  const jobStatus = (p.jobStatus ?? p) as Record<string, unknown>;
  if (!jobStatus.jobId || typeof jobStatus.jobId !== 'string') return undefined;
  return jobStatus as unknown as VideoJobStatus;
}

export function classifyHttpError(status: number, body?: string): VideoServiceError {
  const message = body?.trim() ? `Video upload failed: ${status} ${body}` : `Video upload failed: ${status}`;
  switch (status) {
    case 400:
      return new VideoServiceError('invalid_video', message, false, status);
    case 401:
    case 403:
      return new VideoServiceError('auth', message, false, status);
    case 413:
      return new VideoServiceError('payload_too_large', message, false, status);
    case 429:
      return new VideoServiceError('rate_limited', message, false, status);
    case 408:
      return new VideoServiceError('timeout', message, true, status);
    case 409:
      return new VideoServiceError('invalid_video', message, false, status);
    default:
      if (status >= 500 && status < 600) {
        return new VideoServiceError('service_unavailable', message, true, status);
      }
      // Any unrecognised status is treated as non-recoverable by default.
      return new VideoServiceError('service_unavailable', message, false, status);
  }
}

export function classifyError(error: unknown): VideoServiceError {
  if (error instanceof VideoServiceError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new VideoServiceError('cancelled', error.message || 'Upload cancelled', false);
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new VideoServiceError('cancelled', error.message || 'Upload cancelled', false);
  }
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return new VideoServiceError('timeout', msg, true);
  }
  // Network errors from fetch are typically TypeError with message like 'fetch failed'.
  if (error instanceof TypeError || lower.includes('network') || lower.includes('fetch') || lower.includes('econnreset')) {
    return new VideoServiceError('network', msg, true);
  }
  return new VideoServiceError('service_unavailable', msg, false);
}

export function makeUniqueVideoName(fileName: string): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '') || 'video.mp4';
  const randomId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${randomId}-${safeFileName}`;
}

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
  private ky!: KyInstance;
  private publicKy: KyInstance;
  private chatKy: KyInstance;
  private _withRefresh: (request: Request, _options: unknown, response: Response) => Promise<Response | void>;
  private _authHook: (request: Request) => Promise<Request>;
  private _refreshPromise: Promise<CreateSessionResponse | null> | null = null;
  /** Called when a JWT refresh attempt fails and the session becomes invalid. Auth store hooks into this to reset UI state. */
  _onSessionExpired?: () => void;
  private actualPdsUrl?: string;

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
                // Preserve original headers (especially Content-Type) and body for retries,
                // so that POSTs with binary payloads (e.g. uploadBlob) don't fail on token refresh.
                const retryHeaders = new Headers(request.headers);
                retryHeaders.set('Authorization', `Bearer ${self.session.accessJwt}`);
                // Remove ky-internal headers that shouldn't be forwarded to native fetch
                retryHeaders.delete('content-length');
                const retryInit: RequestInit = {
                  method: request.method,
                  headers: retryHeaders,
                  body: request.body,
                  redirect: request.redirect,
                  signal: request.signal,
                };
                const retryRes = await fetch(request.url, retryInit);
                if (retryRes.ok) return retryRes;
              }
            }
          } catch { /* non-JSON body */ }
        }
        console.error(`[bsky] ${response.status} ${request.method} ${request.url} → ${body}`);
      }
    };

    this._rebuildKy(entryPds);
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

  private _rebuildKy(pdsUrl: string): void {
    this.ky = ky.create({
      prefixUrl: pdsUrl + '/xrpc',
      timeout: 30000,
      retry: { limit: 1, statusCodes: [413, 429, 500, 502, 503, 504] },
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
    this._rebuildKy(this.pdsUrl);

    await this.resolveActualPds();
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

  async resolveActualPds(): Promise<void> {
    if (!this.session) return;
    try {
      // Resolve DID document via PLC directory
      const did = this.session.did;
      let doc: Record<string, unknown> | null = null;

      if (did.startsWith('did:plc:')) {
        const res = await fetch(`https://plc.directory/${did}`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) doc = await res.json() as Record<string, unknown>;
      } else if (did.startsWith('did:web:')) {
        const host = did.replace('did:web:', '');
        const res = await fetch(`https://${host}/.well-known/did.json`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) doc = await res.json() as Record<string, unknown>;
      }

      if (doc) {
        const services = (doc.service as Array<{ id: string; type: string; serviceEndpoint: string }>) ?? [];
        const pdsService = services.find(s => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
        if (pdsService?.serviceEndpoint) {
          const actualUrl = pdsService.serviceEndpoint.replace(/\/+$/, '');
          this.actualPdsUrl = actualUrl;
          // If actual PDS differs from current pdsUrl, update pdsUrl and rebuild ky
          // so that restoreSession (and subsequent requests) target the user's real PDS.
          if (actualUrl !== this.pdsUrl) {
            this.pdsUrl = actualUrl;
            this._rebuildKy(this.pdsUrl);
          }
        }
      }
    } catch (e) {
      console.warn('[bsky] Failed to resolve actual PDS:', e);
    }
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

  async updateNotificationsSeen(seenAt?: string): Promise<void> {
    await this.ky.post('app.bsky.notification.updateSeen', {
      headers: this.getAuthHeaders(),
      json: { seenAt: seenAt ?? new Date().toISOString() },
    });
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

  async uploadBlob(
    data: Uint8Array,
    mimeType: string,
    options?: { timeoutMs?: number },
  ): Promise<UploadBlobResponse> {
    return this.ky.post('com.atproto.repo.uploadBlob', {
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': mimeType,
      },
      body: data,
      timeout: options?.timeoutMs ?? 30000,
    }).json<UploadBlobResponse>();
  }

  async getServiceAuth(aud: string, lxm: string, exp?: number): Promise<GetServiceAuthResponse> {
    const params: Record<string, string | number> = { aud, lxm };
    if (exp) params.exp = exp;
    return this.ky.get('com.atproto.server.getServiceAuth', {
      headers: this.getAuthHeaders(),
      searchParams: params,
    }).json<GetServiceAuthResponse>();
  }

  async uploadVideo(
    data: Uint8Array,
    name: string,
    options?: VideoUploadOptions,
  ): Promise<VideoUploadResult> {
    const mimeType = 'video/mp4';
    const timeoutMs = BskyClient.calculateUploadTimeout(data.length);
    const maxProcessingTimeMs = options?.maxProcessingTimeMs ?? 600_000; // 10 min
    const pollIntervalMs = options?.pollIntervalMs ?? 1000;
    const signal = options?.signal;
    const onProgress = options?.onProgress;
    const allowFallback = options?.allowFallback ?? false;

    // TODO: replace with structured log
    const pdsDid = await this._resolvePdsDid();
    console.log('[bsky] video_upload_start', { did: this.getDID(), name, size: data.length, pdsDid });

    try {
      // Step 1: Get service auth tokens (retry 3 times)
      // pdsToken is used to upload the bytes; videoServiceToken is required to poll getJobStatus.
      const exp = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes
      const pdsToken = await this._getVideoServiceAuthWithRetry(pdsDid, 'com.atproto.repo.uploadBlob', exp, signal);
      const videoServiceToken = await this._getVideoServiceAuthWithRetry('did:web:video.bsky.app', 'app.bsky.video.getJobStatus', exp, signal);

      // Step 2: Upload to video service
      onProgress?.({ phase: 'uploading', progress: 0 });
      const jobStatus = await this._uploadVideoToService(data, name, pdsToken, timeoutMs, signal);
      onProgress?.({ phase: 'uploading', progress: 100 });

      // If blob is already present (e.g. already_exists case), return immediately
      if (jobStatus.blob) {
        return {
          blobRef: { $link: jobStatus.blob.ref.$link, mimeType: jobStatus.blob.mimeType, size: jobStatus.blob.size },
          processed: true,
        };
      }

      // Step 3: Poll for processing completion
      const finalStatus = await this._pollVideoJobStatus(jobStatus.jobId, videoServiceToken, {
        maxProcessingTimeMs,
        pollIntervalMs,
        signal,
        onProgress,
      });

      if (finalStatus.blob) {
        return {
          blobRef: { $link: finalStatus.blob.ref.$link, mimeType: finalStatus.blob.mimeType, size: finalStatus.blob.size },
          processed: true,
        };
      }

      // No blob after polling — this should not happen; treat as non-recoverable.
      throw new VideoServiceError('invalid_video', 'Video processing completed but no blob returned', false);
    } catch (e) {
      if (signal?.aborted || (e instanceof Error && e.name === 'AbortError') || (e instanceof DOMException && e.name === 'AbortError')) {
        throw new VideoServiceError('cancelled', 'Upload cancelled', false);
      }
      const classified = classifyError(e);
      // TODO: replace with structured log
      console.warn('[bsky] video_upload_decision', { decision: allowFallback && classified.recoverable ? 'fallback' : 'throw', code: classified.code, reason: classified.message });
      if (!classified.recoverable || !allowFallback) throw classified;
      // TODO: replace with structured log
      console.warn('[bsky] Video Service failed, falling back to uploadBlob:', classified.code, classified.message);
      return this._fallbackToUploadBlob(data, mimeType, timeoutMs, signal, onProgress, classified.message);
    }
  }

  private _pdsDidCache?: { url: string; did: string };

  private _isKnownBskyShard(host: string): boolean {
    return host === 'bsky.social' || host.endsWith('.bsky.network') || host.endsWith('.bsky.app');
  }

  private async _resolvePdsDid(): Promise<string> {
    const pdsUrl = this.actualPdsUrl ?? this.pdsUrl;
    if (this._pdsDidCache?.url === pdsUrl) return this._pdsDidCache.did;
    try {
      const url = new URL(pdsUrl);
      const derived = `did:web:${url.host}`;
      let did = derived;
      // For custom / non-Bluesky PDS, prefer the DID declared by describeServer
      // to avoid hostname mismatch. If the declared DID's host matches the URL
      // host, the derived DID is already correct and we skip the network call.
      if (!this._isKnownBskyShard(url.host)) {
        const described = await this._describeServerDid(pdsUrl);
        if (described) {
          const describedHost = described.replace(/^did:web:/, '');
          if (describedHost !== url.host) {
            did = described;
          }
        }
      }
      this._pdsDidCache = { url: pdsUrl, did };
      return did;
    } catch {
      const host = pdsUrl.replace(/^https?:\/\//, '').split('/')[0];
      const did = `did:web:${host}`;
      this._pdsDidCache = { url: pdsUrl, did };
      return did;
    }
  }

  private async _describeServerDid(pdsUrl: string): Promise<string | undefined> {
    try {
      const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.describeServer`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return undefined;
      const json = await res.json() as Record<string, unknown>;
      const did = json.did as string | undefined;
      if (did?.startsWith('did:web:')) return did;
    } catch { /* ignore — fall back to URL-derived DID */ }
    return undefined;
  }

  private async _getVideoServiceAuthWithRetry(
    aud: string,
    lxm: string,
    exp: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const maxRetries = 3;
    const retryDelayMs = 2000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (signal?.aborted) throw new Error('Aborted');
      try {
        const res = await this.getServiceAuth(aud, lxm, exp);
        return res.token;
      } catch (e) {
        if (attempt === maxRetries - 1) throw e;
        if (signal?.aborted) throw e;
        await new Promise(r => setTimeout(r, retryDelayMs));
      }
    }
    throw new Error('Failed to get service auth after retries');
  }

  private async _uploadVideoToService(
    data: Uint8Array,
    name: string,
    token: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<VideoJobStatus> {
    const did = this.getDID();
    const url = new URL('https://video.bsky.app/xrpc/app.bsky.video.uploadVideo');
    url.searchParams.set('did', did);
    url.searchParams.set('name', name);

    const maxRetries = 2; // Retry on 5xx network errors
    const retryDelayMs = 2000;

    const isAbortLike = (err: unknown): boolean =>
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError') ||
      (err instanceof VideoServiceError && err.code === 'cancelled');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) throw new VideoServiceError('cancelled', 'Upload cancelled', false);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Link external abort signal
      const abortHandler = () => controller.abort();
      signal?.addEventListener('abort', abortHandler);

      try {
        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'video/mp4',
            'Content-Length': String(data.length),
          },
          body: data,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const body = await res.text();
        if (!res.ok) {
          // 409 already_exists — parse jobStatus and return it so the caller can use the blob.
          if (res.status === 409) {
            try {
              const jobStatus = normalizeJobStatus(JSON.parse(body));
              if (jobStatus) {
                console.log('[bsky] video_upload_response', { status: res.status, state: jobStatus.state, hasBlob: !!jobStatus.blob, error: jobStatus.error, message: jobStatus.message });
                return jobStatus;
              }
            } catch { /* ignore parse error, fall through */ }
          }
          console.log('[bsky] video_upload_response', { status: res.status, hasBlob: false, body });
          throw classifyHttpError(res.status, body);
        }

        const jobStatus = normalizeJobStatus(JSON.parse(body));
        console.log('[bsky] video_upload_response', { status: res.status, state: jobStatus?.state, hasBlob: !!jobStatus?.blob, error: jobStatus?.error, message: jobStatus?.message });
        if (!jobStatus) throw new VideoServiceError('service_unavailable', 'Unexpected upload response', false);
        return jobStatus;
      } catch (e) {
        clearTimeout(timeoutId);
        // Network errors: retry if attempts remain, but never retry user cancellation.
        if (attempt < maxRetries && !isAbortLike(e) && !(e instanceof Error && /\b413\b/.test(e.message)) && !(e instanceof Error && /\b429\b/.test(e.message))) {
          await new Promise(r => setTimeout(r, retryDelayMs));
          continue;
        }
        throw e;
      } finally {
        signal?.removeEventListener('abort', abortHandler);
      }
    }

    throw new VideoServiceError('service_unavailable', 'Video upload failed after retries', true);
  }

  private async _pollVideoJobStatus(
    jobId: string,
    token: string,
    options: {
      maxProcessingTimeMs: number;
      pollIntervalMs: number;
      signal?: AbortSignal;
      onProgress?: VideoUploadOptions['onProgress'];
    },
  ): Promise<VideoJobStatus> {
    const startTime = Date.now();
    let interval = options.pollIntervalMs;
    let attempt = 0;

    while (Date.now() - startTime < options.maxProcessingTimeMs) {
      if (options.signal?.aborted) throw new VideoServiceError('cancelled', 'Upload cancelled', false);
      attempt++;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const abortHandler = () => controller.abort();
      options.signal?.addEventListener('abort', abortHandler);

      try {
        const res = await fetch(
          `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        if (!res.ok) {
          // If getJobStatus fails, wait and retry
          await new Promise(r => setTimeout(r, interval));
          interval = Math.min(interval * 1.5, 5000);
          continue;
        }

        const jobStatus = normalizeJobStatus(await res.json());

        if (!jobStatus) {
          // Unrecognised shape — back off and retry
          await new Promise(r => setTimeout(r, interval));
          interval = Math.min(interval * 1.5, 5000);
          continue;
        }

        // TODO: replace with structured log
        console.log('[bsky] video_job_status', { jobId, state: jobStatus.state, progress: jobStatus.progress, attempt, elapsedMs: Date.now() - startTime });

        // Any response that carries a blob is usable, even if state is FAILED / already_exists.
        if (jobStatus.blob) return jobStatus;

        switch (jobStatus.state) {
          case 'JOB_STATE_COMPLETED':
            throw new VideoServiceError('invalid_video', 'Processing completed but no blob returned', false);
          case 'JOB_STATE_FAILED':
            throw new VideoServiceError('invalid_video', jobStatus.error || jobStatus.message || 'Video processing failed', false);
          case 'JOB_STATE_CREATED':
          case 'JOB_STATE_ENCODING':
          case 'JOB_STATE_SCANNING':
            options.onProgress?.({ phase: 'processing', progress: jobStatus.progress ?? 0 });
            await new Promise(r => setTimeout(r, interval));
            interval = Math.min(interval * 1.5, 5000);
            break;
          default:
            await new Promise(r => setTimeout(r, interval));
            interval = Math.min(interval * 1.5, 5000);
        }
      } finally {
        clearTimeout(timeoutId);
        options.signal?.removeEventListener('abort', abortHandler);
      }
    }

    throw new VideoServiceError('timeout', 'Video processing timed out', true);
  }

  private async _fallbackToUploadBlob(
    data: Uint8Array,
    mimeType: string,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    onProgress: VideoUploadOptions['onProgress'] | undefined,
    fallbackReason: string,
  ): Promise<VideoUploadResult> {
    onProgress?.({ phase: 'uploading', progress: 0 });
    const res = await this.uploadBlob(data, mimeType, { timeoutMs });
    onProgress?.({ phase: 'uploading', progress: 100 });
    return {
      blobRef: { $link: res.blob.ref.$link, mimeType, size: data.length },
      processed: false,
      fallbackReason,
    };
  }

  /**
   * Calculate a reasonable upload timeout based on file size.
   * Assumes a conservative upload speed of ~256 KB/s (2 Mbps).
   * Minimum: 60s, Maximum: 600s (10 min).
   */
  static calculateUploadTimeout(fileSizeBytes: number): number {
    const bytesPerSecond = 256 * 1024; // 256 KB/s conservative estimate
    const estimatedSeconds = Math.ceil(fileSizeBytes / bytesPerSecond);
    return Math.min(Math.max(estimatedSeconds * 1000, 60000), 600000);
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

  async restoreSession(session: CreateSessionResponse, pdsUrl?: string): Promise<void> {
    const oldPds = pdsUrl ?? this.pdsUrl;
    this.session = session;
    if (pdsUrl) this.pdsUrl = pdsUrl;
    this._rebuildKy(this.pdsUrl);
    await this.resolveActualPds();
    // resolveActualPds() already rebuilds ky when actual PDS differs
    const actualPds = this.actualPdsUrl ?? this.pdsUrl;
    // TODO: replace with structured log
    console.log('[bsky] session_restore_pds', { oldPds, actualPds, updated: oldPds !== actualPds });
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
