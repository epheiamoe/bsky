import { useState, useCallback } from 'react';
import type { Draft } from './useCompose.js';

export interface DraftStore {
  drafts: Draft[];
  saveDraft(d: Omit<Draft, 'createdAt' | 'updatedAt'>): void;
  deleteDraft(id: string): void;
  loadDraft(id: string): Draft | undefined;
}

export function createDraftsStore(): DraftStore {
  const store: DraftStore = {
    drafts: [],

    saveDraft(d) {
      const existing = store.drafts.findIndex(x => x.id === d.id);
      const now = new Date().toISOString();
      if (existing >= 0) {
        store.drafts[existing] = { ...d, createdAt: store.drafts[existing]!.createdAt, updatedAt: now };
      } else {
        store.drafts.push({ ...d, createdAt: now, updatedAt: now });
      }
    },

    deleteDraft(id: string) {
      store.drafts = store.drafts.filter(d => d.id !== id);
    },

    loadDraft(id: string) {
      return store.drafts.find(d => d.id === id);
    },
  };
  return store;
}

export function useDrafts() {
  const [store] = useState(() => createDraftsStore());
  const [, tick] = useState(0);

  const saveDraft = useCallback((d: Omit<Draft, 'createdAt' | 'updatedAt'>) => {
    store.saveDraft(d);
    tick(n => n + 1);
  }, [store]);

  const deleteDraft = useCallback((id: string) => {
    store.deleteDraft(id);
    tick(n => n + 1);
  }, [store]);

  return {
    drafts: store.drafts,
    saveDraft,
    deleteDraft,
    loadDraft: store.loadDraft.bind(store),
  };
}
