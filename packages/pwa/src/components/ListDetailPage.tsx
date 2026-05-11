import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { BskyClient } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useListDetail, useI18n, useVirtualizedList } from '@bsky/app';
import { Icon } from './Icon.js';
import { PostCard } from './PostCard.js';
import { PostActionsRow } from './PostActionsRow.js';

interface ListDetailPageProps {
  client: BskyClient;
  listUri: string;
  goBack: () => void;
  goTo: (v: AppView) => void;
  initialTab?: 'posts' | 'members';
  initialScrollTop?: number;
  onScrollTopChange?: (top: number) => void;
  membersScrollTop?: number;
  onMembersScrollTop?: (top: number) => void;
}

export function ListDetailPage({ client, listUri, goBack, goTo, initialTab, initialScrollTop, onScrollTopChange, membersScrollTop, onMembersScrollTop }: ListDetailPageProps) {
  const { t } = useI18n();
  const { list, loading, error, members, membersCursor, loadMoreMembers, feed, feedCursor, loadMoreFeed, isMuted, toggleMute, removeMember, updateListInfo, deleteList, refresh } = useListDetail(client, listUri);
  const [tab, setTab] = useState<'posts' | 'members'>(initialTab ?? 'posts');
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const isOwnList = list?.creator?.did === client.getDID();

  const {
    scrollRef: feedScrollRef,
    virtualizer: feedVirtualizer,
    measureAndCache: feedMeasureAndCache,
  } = useVirtualizedList(feed, `listDetail-posts-${listUri}`, 120, p => p.uri, { initialScrollTop, onScrollTopChange });

  const {
    scrollRef: memberScrollRef,
    virtualizer: memberVirtualizer,
    measureAndCache: memberMeasureAndCache,
  } = useVirtualizedList(members, `listDetail-members-${listUri}`, 52, m => m.uri, { initialScrollTop: membersScrollTop, onScrollTopChange: onMembersScrollTop });

  // Auto-load-more for feed
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !loadMoreFeed || !feedCursor) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) loadMoreFeed(); },
      { root: feedScrollRef.current, rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMoreFeed, feedCursor, feed.length]);

  // Auto-load-more for members
  const handleLoadMoreMembers = useCallback(() => {
    if (membersCursor && !loading) loadMoreMembers();
  }, [membersCursor, loading, loadMoreMembers]);

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)] animate-fadeIn">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={goBack} className="text-text-secondary hover:text-text-primary transition-colors shrink-0" aria-label={t('nav.back')}>
            <Icon name="arrow-big-left" size={20} />
          </button>
          <h1 className="text-text-primary font-semibold text-lg truncate">{list?.name ?? '\u2026'}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOwnList && (
            <>
              <button onClick={toggleMute} className="text-text-secondary hover:text-text-primary transition-colors" title={isMuted ? t('lists.unmute') : t('lists.mute')} aria-label={isMuted ? t('lists.unmute') : t('lists.mute')}>
                <Icon name="bell" size={16} filled={!isMuted} />
              </button>
              <button onClick={() => setShowDeleteConfirm(true)} className="text-text-secondary hover:text-red-500 transition-colors" title={t('lists.delete')} aria-label={t('lists.delete')}>
                <Icon name="trash-2" size={16} />
              </button>
            </>
          )}
          <button onClick={() => refresh()} disabled={loading} className="text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50" aria-label={t('action.refresh')}>
            <Icon name="refresh-cw" size={16} />
          </button>
        </div>
      </div>

      {/* Info Card */}
      {list && (
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              list.purpose === 'app.bsky.graph.defs#modlist' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'
            }`}>
              <Icon name="list" size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                {editingName && isOwnList ? (
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={() => { if (editName.trim() && editName.trim() !== list.name) updateListInfo({ name: editName.trim() }); setEditingName(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingName(false); }}
                    className="flex-1 px-2 py-1 text-lg font-bold bg-white dark:bg-[#1A1A1A] border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    maxLength={64}
                    autoFocus
                  />
                ) : (
                  <h2 className="text-text-primary font-bold text-lg break-words">{list.name}</h2>
                )}
                {isOwnList && !editingName && (
                  <button onClick={() => { setEditName(list.name); setEditingName(true); }}
                    className="text-text-secondary/40 hover:text-primary transition-colors shrink-0"
                    title="Edit name" aria-label="Edit name">
                    <Icon name="pencil" size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-text-secondary">
                <span className={list.purpose === 'app.bsky.graph.defs#modlist' ? 'text-orange-500' : 'text-blue-500'}>
                  {list.purpose === 'app.bsky.graph.defs#modlist' ? t('lists.moderation') : t('lists.curated')}
                </span>
                <span aria-hidden="true">&middot;</span>
                <span><Icon name="users" size={14} className="inline" /> {t('lists.memberCount', { n: list.listItemCount ?? 0 })}</span>
              </div>
              <button onClick={() => goTo({ type: 'profile', actor: list.creator.handle })} className="text-sm text-text-secondary hover:text-primary mt-1 transition-colors">
                {t('lists.createdBy')} @{list.creator.handle}
              </button>
              <div className="flex items-start gap-1 mt-2">
                {editingDesc && isOwnList ? (
                  <textarea
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    onBlur={() => { if (editDesc.trim() !== (list.description || '')) updateListInfo({ description: editDesc.trim() || undefined }); setEditingDesc(false); }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) (e.target as HTMLTextAreaElement).blur(); if (e.key === 'Escape') setEditingDesc(false); }}
                    className="flex-1 px-2 py-1 text-sm bg-white dark:bg-[#1A1A1A] border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    rows={2}
                    maxLength={300}
                    autoFocus
                    placeholder={t('lists.descPlaceholder')}
                  />
                ) : (
                  <div className="flex-1">
                    {list.description ? (
                      <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{list.description}</p>
                    ) : isOwnList ? (
                      <p className="text-sm text-text-secondary/40 italic">{t('lists.descPlaceholder')}</p>
                    ) : null}
                  </div>
                )}
                {isOwnList && !editingDesc && (
                  <button onClick={() => { setEditDesc(list.description || ''); setEditingDesc(true); }}
                    className="text-text-secondary/40 hover:text-primary transition-colors shrink-0 mt-0.5"
                    title="Edit description" aria-label="Edit description">
                    <Icon name="pencil" size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && !list ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !list ? (
        <div className="flex items-center justify-center py-16 text-text-secondary text-sm">{t('common.error')}</div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="sticky top-0 z-10 bg-white dark:bg-[#0A0A0A] border-b border-border flex">
            <button onClick={() => setTab('posts')}
              className={`flex-1 text-center py-3 text-sm font-medium transition-colors relative ${
                tab === 'posts' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('lists.tabPosts')}
              {tab === 'posts' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-primary rounded-full" />}
            </button>
            <button onClick={() => setTab('members')}
              className={`flex-1 text-center py-3 text-sm font-medium transition-colors relative ${
                tab === 'members' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('lists.tabMembers', { n: list.listItemCount ?? members.length })}
              {tab === 'members' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-primary rounded-full" />}
            </button>
          </div>

          {/* Tab: Posts */}
          <div ref={feedScrollRef} className={`flex-1 overflow-y-auto ${tab !== 'posts' ? 'hidden' : ''}`}>
            {feed.length > 0 ? (
              <>
                <div style={{ height: feedVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                  {feedVirtualizer.getVirtualItems().map((vi) => {
                    const post = feed[vi.index]!;
                    return (
                      <div key={post.uri} data-index={vi.index}
                        ref={(el) => feedMeasureAndCache(el, post)}
                        style={{ position: 'absolute', top: 0, left: 0, transform: `translateY(${vi.start}px)`, width: '100%' }}
                      >
                        <PostCard post={post} onClick={() => goTo({ type: 'thread', uri: post.uri })} goTo={goTo}>
                          <PostActionsRow client={client} goTo={goTo} post={post} />
                        </PostCard>
                      </div>
                    );
                  })}
                </div>
                <div ref={sentinelRef} className="h-px" />
                {feedCursor && (
                  <div className="flex justify-center py-4">
                    <button onClick={loadMoreFeed} disabled={loading}
                      className="rounded-full bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-6 py-2 disabled:opacity-50 transition-colors btn-press">
                      {loading ? t('action.loading') : t('action.loadMore')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Icon name="list" size={20} className="text-primary" />
                </div>
                <p className="text-text-secondary text-sm">{t('lists.noPosts')}</p>
              </div>
            )}
          </div>

          {/* Tab: Members */}
          <div ref={memberScrollRef} className={`flex-1 overflow-y-auto ${tab !== 'members' ? 'hidden' : ''}`}>
            {members.length > 0 ? (
              <>
                <div style={{ height: memberVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                  {memberVirtualizer.getVirtualItems().map((vi) => {
                    const member = members[vi.index]!;
                    return (
                      <div key={member.uri} data-index={vi.index}
                        ref={(el) => memberMeasureAndCache(el, member)}
                        style={{ position: 'absolute', top: 0, left: 0, transform: `translateY(${vi.start}px)`, width: '100%' }}
                        className="flex items-center border-b border-border hover:bg-surface transition-colors"
                      >
                        <button
                          onClick={() => goTo({ type: 'profile', actor: member.subject.handle })}
                          className="flex-1 text-left px-4 py-3 flex items-center gap-3 min-w-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0 overflow-hidden">
                            {member.subject.avatar ? (
                              <img src={member.subject.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              member.subject.handle?.[0]?.toUpperCase() ?? '?'
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-text-primary text-sm font-medium truncate">
                              {member.subject.displayName || member.subject.handle}
                            </p>
                            {member.subject.displayName && (
                              <p className="text-text-secondary text-xs truncate">@{member.subject.handle}</p>
                            )}
                          </div>
                        </button>
                        {isOwnList && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeMember(member.uri); }}
                            className="shrink-0 mr-3 w-7 h-7 rounded-full flex items-center justify-center text-text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title={t('lists.removeMember')}
                            aria-label={t('lists.removeMember')}
                          >
                            <Icon name="x" size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {membersCursor && (
                  <div className="flex justify-center py-4">
                    <button onClick={handleLoadMoreMembers} disabled={loading}
                      className="rounded-full bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-6 py-2 disabled:opacity-50 transition-colors btn-press">
                      {loading ? t('action.loading') : t('action.loadMore')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Icon name="users" size={20} className="text-primary" />
                </div>
                <p className="text-text-secondary text-sm">{t('lists.noMembers')}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-border max-w-sm w-full shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-text-primary font-semibold text-sm mb-2">{t('lists.delete')}</h3>
            <p className="text-text-secondary text-sm mb-4">{t('lists.deleteConfirm')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">{t('action.cancel')}</button>
              <button onClick={async () => { setDeleting(true); await deleteList(); setDeleting(false); setShowDeleteConfirm(false); goBack(); }}
                disabled={deleting}
                className="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors font-medium"
              >
                {deleting ? t('action.loading') : t('action.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
