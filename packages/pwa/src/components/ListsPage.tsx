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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // List add popup (when viewing another user's lists)
  const [showListAddPopup, setShowListAddPopup] = useState(false);
  const [listMembership, setListMembership] = useState<any[]>([]);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const isOwn = !actor || actor === client.getHandle();

  const openListAddPopup = async () => {
    if (!actor) return;
    setShowListAddPopup(true);
    setMembershipLoading(true);
    try {
      const res = await client.getListsWithMembership(actor);
      setListMembership(res.listsWithMembership);
    } catch (e) { console.error('List membership error:', e); }
    finally { setMembershipLoading(false); }
  };

  const handleAddToList = async (listUri: string) => {
    if (!actor) return;
    try {
      const targetProfile = await client.getProfile(actor);
      await client.addListItem(listUri, targetProfile.did);
      setListMembership(prev => prev.map(item => {
        if (item.list.uri !== listUri) return item;
        return { ...item, listItem: { uri: 'pending', subject: { did: targetProfile.did, handle: targetProfile.handle } } };
      }));
    } catch (e) { console.error('Add to list error:', e); }
  };

  const handleRemoveFromList = async (itemUri: string, listUri: string) => {
    try {
      await client.removeListItem(itemUri);
      setListMembership(prev => prev.map(item => {
        if (item.list.uri !== listUri) return item;
        return { ...item, listItem: undefined };
      }));
    } catch (e) { console.error('Remove from list error:', e); }
  };

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
          {isOwn && (
            <button onClick={() => setShowCreate(true)} className="text-primary hover:text-primary-hover transition-colors text-sm font-medium" aria-label={t('lists.create')}>
              <Icon name="plus" size={18} />
            </button>
          )}
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

      {/* Add-to-my-list bar (when viewing another user) */}
      {!isOwn && actor && (
        <div className="border-b border-border px-4 py-2 bg-surface flex items-center justify-between">
          <button
            onClick={openListAddPopup}
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover font-medium transition-colors btn-press"
          >
            <Icon name="user-plus" size={16} />
            {t('lists.addMember')} @{actor}
          </button>
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
                  {isOwn && (
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(list.uri); }}
                      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-text-secondary/40 hover:text-red-500 hover:bg-red-500/10 transition-colors self-center"
                      title={t('lists.delete')}
                      aria-label={t('lists.delete')}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
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
          {isOwn && (
            <button onClick={() => setShowCreate(true)} className="mt-4 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors btn-press">
              {t('lists.create')}
            </button>
          )}
        </div>
      )}
      {/* List add popup overlay */}
      {showListAddPopup && (
        <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowListAddPopup(false)}>
          <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-border max-w-sm w-full max-h-[70vh] overflow-hidden shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-text-primary text-sm">{t('lists.addMember')} @{actor}</h3>
              <button onClick={() => setShowListAddPopup(false)} className="text-text-secondary hover:text-text-primary transition-colors" aria-label={t('action.close')}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {membershipLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : listMembership.length === 0 ? (
                <div className="px-4 py-12 text-center text-text-secondary text-sm">{t('lists.empty')}</div>
              ) : (
                listMembership.map((item: any) => {
                  const list = item.list;
                  const isMember = !!item.listItem;
                  const isMod = list.purpose === 'app.bsky.graph.defs#modlist';
                  return (
                    <button
                      key={list.uri}
                      onClick={() => isMember ? handleRemoveFromList(item.listItem.uri, list.uri) : handleAddToList(list.uri)}
                      className="w-full text-left px-4 py-3 border-b border-border hover:bg-surface transition-colors flex items-center gap-3"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isMod ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'
                      }`}>
                        <Icon name="list" size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-text-primary text-sm truncate">{list.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                            isMod ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          }`}>
                            {isMod ? t('lists.moderation') : t('lists.curated')}
                          </span>
                        </div>
                      </div>
                      <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors btn-press ${
                        isMember ? 'bg-primary text-white' : 'bg-border text-text-secondary'
                      }`}>
                        {isMember ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-border max-w-sm w-full shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-text-primary font-semibold text-sm mb-2">{t('lists.delete')}</h3>
            <p className="text-text-secondary text-sm mb-4">{t('lists.deleteConfirm')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">{t('action.cancel')}</button>
              <button onClick={() => { deleteList(deleteTarget); setDeleteTarget(null); }} className="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium">{t('action.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
