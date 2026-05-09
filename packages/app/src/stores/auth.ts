import { BskyClient } from '@bsky/core';
import type { CreateSessionResponse, ProfileView } from '@bsky/core';

export interface AuthStore {
  client: BskyClient | null;
  session: CreateSessionResponse | null;
  pdsUrl: string | null;
  profile: ProfileView | null;
  loading: boolean;
  error: string | null;
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
    listener: null,

    async login(handle: string, password: string, pdsUrl?: string) {
      store.loading = true;
      store.error = null;
      store._notify();
      try {
        const c = new BskyClient(pdsUrl ? { pdsUrl } : undefined);
        store.session = await c.login(handle, password);
        store.pdsUrl = c.pdsUrl;
        store.client = c;
        store.profile = await c.getProfile(handle);
      } catch (e) {
        store.error = e instanceof Error ? e.message : String(e);
      } finally {
        store.loading = false;
        store._notify();
      }
    },

    restoreSession(session: CreateSessionResponse, pdsUrl: string) {
      const c = new BskyClient();
      c.restoreSession(session, pdsUrl);
      store.session = session;
      store.pdsUrl = pdsUrl;
      store.client = c;
      c.getProfile(session.handle).then(p => {
        store.profile = p;
        store._notify();
      }).catch(() => {
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
