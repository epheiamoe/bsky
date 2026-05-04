import { useState, useCallback, useEffect } from 'react';
import type { BskyClient } from '@bsky/core';
import type { AppDraft } from '../services/draftStorage.js';
import { getDefaultDraftStorage } from '../services/draftStorage.js';

export interface DraftStore {
  drafts: AppDraft[];
  loading: boolean;
  saving: boolean;
  setClient(c: BskyClient | null): void;
  saveDraft(data: { posts: { text: string }[]; replyTo?: string; quoteUri?: string }, draftId?: string): Promise<string>;
  deleteDraft(id: string): Promise<void>;
  syncDraft(id: string): Promise<void>;
  refreshDrafts(): Promise<void>;
  loadDraft(id: string): AppDraft | undefined;
}

// Module-level mutable client ref — avoids stale closure capture via singleton
let _clientRef: BskyClient | null = null;

export function createDraftsStore(initialClient: BskyClient | null): DraftStore {
  // Update the shared ref when a valid client comes in
  if (initialClient) _clientRef = initialClient;

  const storage = getDefaultDraftStorage();

  const store: DraftStore = {
    drafts: [],
    loading: false,
    saving: false,

    setClient(c: BskyClient | null) {
      _clientRef = c;
    },

    async saveDraft(data, draftId) {
      store.saving = true;
      try {
        const id = draftId ?? crypto.randomUUID();
        const now = new Date().toISOString();
        const existing = store.drafts.find(d => d.id === id);

        const draft: AppDraft = {
          id,
          serverId: existing?.serverId,
          posts: data.posts.map(p => ({ text: p.text })),
          replyTo: data.replyTo,
          quoteUri: data.quoteUri,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          syncStatus: 'local',
        };

        // Try PDS first
        if (_clientRef?.isAuthenticated()) {
          try {
            if (draft.serverId) {
              await _clientRef.updateDraft(draft.serverId, { posts: draft.posts });
              draft.syncStatus = 'synced';
            } else {
              const res = await _clientRef.createDraft({ posts: draft.posts });
              draft.serverId = res.id;
              draft.syncStatus = 'synced';
            }
          } catch {
            // PDS failed, save locally
            draft.syncStatus = 'local';
          }
        }

        // Save to local storage
        await storage.set(draft);

        // Update in-memory list
        const idx = store.drafts.findIndex(d => d.id === id);
        if (idx >= 0) {
          store.drafts[idx] = draft;
        } else {
          store.drafts.push(draft);
        }
        store.drafts = [...store.drafts].sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );

        return id;
      } finally {
        store.saving = false;
      }
    },

    async deleteDraft(id) {
      const draft = store.drafts.find(d => d.id === id);
      if (!draft) return;

      // Delete from PDS if synced
      if (draft.serverId && _clientRef?.isAuthenticated()) {
        try { await _clientRef.deleteDraft(draft.serverId); } catch { /* ignore */ }
      }

      // Delete from local storage
      await storage.delete(id);
      store.drafts = store.drafts.filter(d => d.id !== id);
    },

    async syncDraft(id) {
      const draft = store.drafts.find(d => d.id === id);
      if (!draft || !_clientRef?.isAuthenticated()) return;

      if (draft.serverId) {
        await _clientRef.updateDraft(draft.serverId, { posts: draft.posts });
      } else {
        const res = await _clientRef.createDraft({ posts: draft.posts });
        draft.serverId = res.id;
      }

      draft.syncStatus = 'synced';
      draft.updatedAt = new Date().toISOString();
      await storage.set(draft);

      store.drafts = store.drafts.map(d => d.id === id ? { ...draft } : d);
    },

    async refreshDrafts() {
      store.loading = true;
      try {
        // Load local drafts first
        const localDrafts = await storage.getAll();
        const localMap = new Map<string, AppDraft>();
        const mergedDrafts: AppDraft[] = [];

        for (const d of localDrafts) {
          localMap.set(d.id, d);
        }

        // Try fetching from PDS
        if (_clientRef?.isAuthenticated()) {
          try {
            const res = await _clientRef.getDrafts();
            const serverDrafts = res.drafts ?? [];

            const localByServerId = new Map<string, AppDraft>();
            for (const d of localDrafts) {
              if (d.serverId) localByServerId.set(d.serverId, d);
            }

            for (const sd of serverDrafts) {
              const existing = localByServerId.get(sd.id);
              if (existing) {
                // Update local copy from server (server is authoritative)
                existing.posts = (sd.draft.posts ?? []).map((p: { text: string }) => ({ text: p.text }));
                existing.serverId = sd.id;
                existing.syncStatus = 'synced';
                existing.createdAt = sd.createdAt ?? existing.createdAt;
                existing.updatedAt = sd.updatedAt ?? existing.updatedAt;
                existing.replyTo = existing.replyTo;
                existing.quoteUri = existing.quoteUri;
                await storage.set(existing);
                mergedDrafts.push(existing);
                localMap.delete(existing.id);
              } else {
                // New draft from server, add to local
                const newDraft: AppDraft = {
                  id: crypto.randomUUID(),
                  serverId: sd.id,
                  posts: (sd.draft.posts ?? []).map((p: { text: string }) => ({ text: p.text })),
                  createdAt: sd.createdAt ?? new Date().toISOString(),
                  updatedAt: sd.updatedAt ?? new Date().toISOString(),
                  syncStatus: 'synced',
                };
                await storage.set(newDraft);
                mergedDrafts.push(newDraft);
              }
            }
          } catch {
            // PDS fetch failed, use local only
          }
        }

        // Add remaining local-only drafts
        for (const d of localMap.values()) {
          mergedDrafts.push(d);
        }

        mergedDrafts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        store.drafts = mergedDrafts;
      } finally {
        store.loading = false;
      }
    },

    loadDraft(id) {
      return store.drafts.find(d => d.id === id);
    },
  };

  return store;
}

export function useDrafts(client: BskyClient | null) {
  const [store] = useState(() => createDraftsStore(client));
  const [, tick] = useState(0);

  // Always sync the latest client to the store
  useEffect(() => { store.setClient(client); }, [client, store]);

  useEffect(() => {
    store.refreshDrafts().then(() => tick(n => n + 1));
  }, [client]);

  const saveDraft = useCallback(async (data: { posts: { text: string }[]; replyTo?: string; quoteUri?: string }, draftId?: string) => {
    const id = await store.saveDraft(data, draftId);
    tick(n => n + 1);
    return id;
  }, [store]);

  const deleteDraft = useCallback(async (id: string) => {
    await store.deleteDraft(id);
    tick(n => n + 1);
  }, [store]);

  const syncDraft = useCallback(async (id: string) => {
    await store.syncDraft(id);
    tick(n => n + 1);
  }, [store]);

  const refreshDrafts = useCallback(async () => {
    await store.refreshDrafts();
    tick(n => n + 1);
  }, [store]);

  return {
    drafts: store.drafts,
    loading: store.loading,
    saving: store.saving,
    saveDraft,
    deleteDraft,
    syncDraft,
    refreshDrafts,
    loadDraft: (id: string) => store.loadDraft(id),
  };
}
