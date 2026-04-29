import { useState, useEffect, useCallback } from 'react';
import { createAuthStore } from '../stores/auth.js';
import type { AuthStore } from '../stores/auth.js';
import type { CreateSessionResponse } from '@bsky/core';

export function useAuth() {
  const [store] = useState(() => createAuthStore());
  const [, force] = useState(0);
  const tick = useCallback(() => force(n => n + 1), []);

  useEffect(() => store.subscribe(tick), [store, tick]);

  return {
    client: store.client,
    session: store.session,
    profile: store.profile,
    loading: store.loading,
    error: store.error,
    login: (h: string, p: string) => store.login(h, p),
    restoreSession: (s: Parameters<typeof store.restoreSession>[0]) => store.restoreSession(s),
  };
}
