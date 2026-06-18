import { useState, useEffect, useCallback } from 'react';
import { createAuthStore } from '../stores/auth.js';
import type { AuthStore } from '../stores/auth.js';
import type { CreateSessionResponse, LoginErrorDetail } from '@bsky/core';

export function useAuth() {
  const [store] = useState(() => createAuthStore());
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);

  useEffect(() => store.subscribe(tick), [store, tick]);

  return {
    client: store.client,
    session: store.session,
    pdsUrl: store.pdsUrl,
    profile: store.profile,
    loading: store.loading,
    error: store.error,
    errorLog: store.errorLog as LoginErrorDetail | null,
    login: (h: string, p: string, pdsUrl?: string) => store.login(h, p, pdsUrl),
    restoreSession: async (s: CreateSessionResponse, pdsUrl: string) => store.restoreSession(s, pdsUrl),
  };
}
