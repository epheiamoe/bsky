import { BskyClient } from '@bsky/core';
import type { CreateSessionResponse, ProfileView } from '@bsky/core';

export interface AuthStore {
  client: BskyClient | null;
  session: CreateSessionResponse | null;
  profile: ProfileView | null;
  loading: boolean;
  error: string | null;
  login: (handle: string, password: string) => Promise<void>;
  restoreSession: (session: CreateSessionResponse) => void;
  listener: (() => void) | null;

  _notify(): void;
  subscribe(fn: () => void): () => void;
}

export function createAuthStore(): AuthStore {
  const store: AuthStore = {
    client: null,
    session: null,
    profile: null,
    loading: false,
    error: null,
    listener: null,

    async login(handle: string, password: string) {
      store.loading = true;
      store.error = null;
      store._notify();
      try {
        const c = new BskyClient();
        store.session = await c.login(handle, password);
        store.client = c;
        store.profile = await store.client.getProfile(handle);
      } catch (e) {
        store.error = e instanceof Error ? e.message : String(e);
      } finally {
        store.loading = false;
        store._notify();
      }
    },

    restoreSession(session: CreateSessionResponse) {
      const c = new BskyClient();
      c.restoreSession(session);
      store.session = session;
      store.client = c;
      c.getProfile(session.handle).then(p => {
        store.profile = p;
        store._notify();
      }).catch(() => {});
    },

    _notify() { if (store.listener) store.listener(); },
    subscribe(fn) {
      store.listener = fn;
      return () => { store.listener = null; };
    },
  };
  return store;
}
