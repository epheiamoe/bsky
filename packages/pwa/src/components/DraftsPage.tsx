import React, { useState } from 'react';
import type { BskyClient } from '@bsky/core';
import type { AppView, AppDraft } from '@bsky/app';
import { useDrafts, useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface DraftsPageProps {
  client: BskyClient;
  goBack: () => void;
  goTo: (v: AppView) => void;
}

export function DraftsPage({ client, goBack, goTo }: DraftsPageProps) {
  const { t } = useI18n();
  const { drafts, loading, deleteDraft, syncDraft, refreshDrafts } = useDrafts(client);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleSync = async (id: string) => {
    setSyncing(id);
    try {
      await syncDraft(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    await deleteDraft(id);
    setConfirmDelete(null);
  };

  const truncate = (s: string, max = 50) => s.length > max ? s.slice(0, max) + '…' : s;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-[100dvh] bg-background animate-fadeIn">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="text-text-secondary hover:text-text-primary transition-colors text-lg"
          >
            ←
          </button>
          <h1 className="text-text-primary font-semibold text-lg"><Icon name="file-text" size={18} /> {t('drafts.title')}</h1>
        </div>
        <button
          onClick={refreshDrafts}
          disabled={loading}
          className="text-primary hover:text-primary-hover disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {t('action.refresh')}
        </button>
      </div>

      {loading && drafts.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : drafts.length > 0 ? (
        <div role="list">
          {drafts.map((draft, i) => (
            <div key={draft.id} role="listitem" className={`border-b border-border animate-slideUp stagger-${(i % 6) + 1}`}>
              <button
                onClick={() => goTo({ type: 'compose', draftId: draft.id })}
                className="w-full text-left px-4 py-3 hover:bg-surface transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">
                      {truncate(draft.posts[0]?.text?.trim() || '(empty)')}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-text-secondary">
                        {formatDate(draft.updatedAt)}
                      </span>
                      {draft.posts.length > 1 && (
                        <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {t('drafts.threadPreview', { n: draft.posts.length })}
                        </span>
                      )}
                      {draft.replyTo && (
                        <span className="text-xs text-text-secondary">{t('drafts.replyPreview')}</span>
                      )}
                      {draft.syncStatus === 'local' && (
                        <span role="status" className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded">
                          {t('drafts.notSynced')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>

              <div className="flex items-center justify-end gap-2 px-4 pb-2">
                {draft.syncStatus === 'local' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSync(draft.id);
                    }}
                    disabled={syncing === draft.id}
                    className="text-xs text-primary hover:text-primary-hover px-2 py-1 rounded border border-primary/30 hover:bg-primary/10 transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {syncing === draft.id ? (
                      <><div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> {t('drafts.syncing')}</>
                    ) : t('drafts.sync')}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(draft.id);
                  }}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    confirmDelete === draft.id
                      ? 'text-white bg-red-500 border-red-500 hover:bg-red-600'
                      : 'text-red-500 hover:text-red-600 border-red-500/30 hover:bg-red-50 dark:hover:bg-red-900/20'
                  }`}
                  onBlur={() => setConfirmDelete(null)}
                >
                  {confirmDelete === draft.id ? t('action.confirm') : t('action.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <p className="text-text-secondary text-sm">{t('drafts.empty')}</p>
        </div>
      )}
    </div>
  );
}
