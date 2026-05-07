import React, { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { BskyClient, ListPurpose } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useLists, useI18n, useScrollRestore } from '@bsky/app';
import { Icon } from './Icon.js';

interface ListsPageProps {
  client: BskyClient;
  goBack: () => void;
  goTo: (v: AppView) => void;
  actor?: string;
}

export function ListsPage({ client, goBack, goTo, actor }: ListsPageProps) {
  const { t } = useI18n();
  const { lists, loading, error, createList, deleteList, refresh } = useLists(client, actor);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPurpose, setNewPurpose] = useState<ListPurpose>('app.bsky.graph.defs#curatelist');
  const [creating, setCreating] = useState(false);

  const virtualizer = useVirtualizer({
    count: lists.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  useScrollRestore('lists', scrollRef, !loading && lists.length > 0);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const list = await createList(newName.trim(), newPurpose, newDesc.trim() || undefined);
    setCreating(false);
    if (list) {
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      goTo({ type: 'listDetail', uri: list.uri });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] animate-fadeIn">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="text-text-secondary hover:text-text-primary transition-colors" aria-label={t('nav.back')}>
            <Icon name="arrow-big-left" size={20} />
          </button>
          <h1 className="text-text-primary font-semibold text-lg">{t('lists.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)} className="text-primary hover:text-primary-hover transition-colors text-sm font-medium" aria-label={t('lists.create')}>
            <Icon name="plus" size={18} />
          </button>
          <button onClick={() => refresh()} disabled={loading} className="text-primary hover:text-primary-hover disabled:opacity-50 transition-colors text-sm font-medium" aria-label={t('action.refresh')}>
            <Icon name="refresh-cw" size={16} />
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="border-b border-border p-4 bg-surface space-y-3 animate-slideUp">
          <div className="flex items-center justify-between">
            <h3 className="text-text-primary font-semibold text-sm">{t('lists.createTitle')}</h3>
            <button onClick={() => setShowCreate(false)} className="text-text-secondary hover:text-text-primary" aria-label={t('action.cancel')}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setNewPurpose('app.bsky.graph.defs#curatelist')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                newPurpose === 'app.bsky.graph.defs#curatelist'
                  ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'border-border text-text-secondary hover:border-blue-500/50'
              }`}
            >
              {t('lists.curated')}
            </button>
            <button
              onClick={() => setNewPurpose('app.bsky.graph.defs#modlist')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                newPurpose === 'app.bsky.graph.defs#modlist'
                  ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  : 'border-border text-text-secondary hover:border-orange-500/50'
              }`}
            >
              {t('lists.moderation')}
            </button>
          </div>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={t('lists.namePlaceholder')}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-[#1A1A1A] border border-border rounded-lg text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
            maxLength={64}
            autoFocus
          />
          <input
            type="text"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder={t('lists.descPlaceholder')}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-[#1A1A1A] border border-border rounded-lg text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
            maxLength={300}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">
              {t('action.cancel')}
            </button>
            <button onClick={handleCreate} disabled={creating || !newName.trim()}
              className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors font-medium"
            >
              {creating ? t('action.loading') : t('action.confirm')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && lists.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lists.length > 0 ? (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const list = lists[vi.index]!;
              const isMod = list.purpose === 'app.bsky.graph.defs#modlist';
              return (
                <div key={list.uri} data-index={vi.index} ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, transform: `translateY(${vi.start}px)`, width: '100%' }}
                >
                  <button
                    onClick={() => goTo({ type: 'listDetail', uri: list.uri })}
                    className="w-full text-left px-4 py-3 border-b border-border hover:bg-surface transition-colors flex items-start gap-3"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isMod ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'
                    }`}>
                      <Icon name="list" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-text-primary font-medium text-sm truncate">{list.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          isMod ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        }`}>
                          {isMod ? t('lists.moderation') : t('lists.curated')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-text-secondary mt-0.5">
                        <Icon name="users" size={12} />
                        <span>{t('lists.memberCount', { n: list.listItemCount ?? 0 })}</span>
                      </div>
                      {list.description && (
                        <p className="text-xs text-text-secondary mt-1 line-clamp-2">{list.description}</p>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Icon name="list" size={24} className="text-primary" />
          </div>
          <p className="text-text-secondary text-sm">{t('lists.empty')}</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors btn-press">
            {t('lists.create')}
          </button>
        </div>
      )}
    </div>
  );
}
