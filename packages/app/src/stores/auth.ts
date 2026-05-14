import { BskyClient } from '@bsky/core';
import type { CreateSessionResponse, ProfileView, LoginErrorDetail } from '@bsky/core';

export interface AuthStore {
  client: BskyClient | null;
  session: CreateSessionResponse | null;
  pdsUrl: string | null;
  profile: ProfileView | null;
  loading: boolean;
  error: string | null;
  errorLog: LoginErrorDetail | null;
  login: (handle: string, password: string, pdsUrl?: string) => Promise<void>;
  restoreSession: (session: CreateSessionResponse, pdsUrl: string) => void;
  listener: (() => void) | null;

  _notify(): void;
  subscribe(fn: () => void): () => void;
}

export function createAuthStore(): AuthStore {
  const store: AuthStore = {
    client: null,
    session: null,
    pdsUrl: null,
    profile: null,
    loading: false,
    error: null,
    errorLog: null,
    listener: null,

    async login(handle: string, password: string, pdsUrl?: string) {
      store.loading = true;
      store.error = null;
      store.errorLog = null;
      store._notify();
      try {
        const c = new BskyClient(pdsUrl ? { pdsUrl } : undefined);
        store.session = await c.login(handle, password);
        store.pdsUrl = c.pdsUrl;
        store.client = c;
        store.profile = await c.getProfile(handle);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const detail = e instanceof Error ? (e.cause as LoginErrorDetail | undefined) : undefined;
        if (detail) store.errorLog = detail;
        if (msg.includes('AuthenticationRequired') || msg.includes('Invalid identifier') || msg.includes('401')) {
          store.error = `${msg}. Make sure you are using an App Password (not your account password).`;
        } else {
          store.error = msg;
        }
      } finally {
        store.loading = false;
        store._notify();
      }
    },

    restoreSession(session: CreateSessionResponse, pdsUrl: string) {
      const c = new BskyClient();
      c.restoreSession(session, pdsUrl);

      // When JWT refresh fails (token expired + refresh unreachable),
      // the client nulls its session. This callback propagates that
      // to the auth store so the UI can show the login page immediately
      // instead of throwing "Not authenticated" on the next API call.
      c._onSessionExpired = () => {
        if (store.client !== c) return;
        store.client = null;
        store.session = null;
        store.pdsUrl = null;
        store.error = 'session_expired';
        store._notify();
      };

      store.session = session;
      store.pdsUrl = pdsUrl;
      store.client = c;
      c.getProfile(session.handle).then(p => {
        store.profile = p;
        store.session = c.session;
        store._notify();
      }).catch(() => {
        if (store.client !== c) return;
        if (!c.isAuthenticated()) {
          store.client = null;
          store.session = null;
          store.pdsUrl = null;
          store.error = 'session_expired';
          store._notify();
        }
      });
    },

    _notify() { if (store.listener) store.listener(); },
    subscribe(fn) {
      store.listener = fn;
      return () => { store.listener = null; };
    },
  };
  return store;
}
