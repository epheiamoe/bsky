import React, { useEffect, useState } from 'react';
import type { BskyClient, ConvoView } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useConvoList, useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface ConvoListPageProps {
  client: BskyClient;
  goBack: () => void;
  goTo: (v: AppView) => void;
}

export function ConvoListPage({ client, goBack, goTo }: ConvoListPageProps) {
  const { t } = useI18n();
  const { convos, loading, error, refresh } = useConvoList(client);
  const [refreshing, setRefreshing] = useState(false);

  // Filter out group chats — they are not yet supported in this client.
  // Group convos (kind === 'group') are silently hidden; a banner guides users to bsky.app.
  const directConvos = convos.filter(c => c.kind === 'direct' || !c.kind);
  const groupConvoCount = convos.filter(c => c.kind === 'group').length;

  useEffect(() => {
    refresh();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleConvoClick = (convo: ConvoView) => {
    // Guard: group chats are filtered from the list, but prevent navigation if somehow triggered
    if (convo.kind === 'group') return;
    // For direct (1-1) convos, navigate to the other member
    const members = convo.members || [];
    const currentDid = client.getDID();
    const other = members.find(m => m.did !== currentDid);
    if (other) {
      goTo({ type: 'dmChat', conversationId: other.did });
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t('time.justNow');
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d`;
    return d.toLocaleDateString();
  };

  const getLastMessageText = (convo: ConvoView): string => {
    if (!convo.lastMessage) return '';
    if ('text' in convo.lastMessage) return convo.lastMessage.text;
    if ('data' in convo.lastMessage) return t('dm.systemMessage');
    return '';
  };

  const getLastMessageTime = (convo: ConvoView): string => {
    if (!convo.lastMessage) return '';
    if ('sentAt' in convo.lastMessage) return formatTime(convo.lastMessage.sentAt);
    return '';
  };

  const getMemberName = (convo: ConvoView): string => {
    const members = convo.members || [];
    const currentDid = client.getDID();
    const other = members.find(m => m.did !== currentDid) ?? members[0];
    return other?.displayName || other?.handle || t('dm.unknown');
  };

  const getMemberHandle = (convo: ConvoView): string => {
    const members = convo.members || [];
    const currentDid = client.getDID();
    const other = members.find(m => m.did !== currentDid) ?? members[0];
    return other?.handle ?? '';
  };

  const getMemberAvatar = (convo: ConvoView): string | undefined => {
    const members = convo.members || [];
    const currentDid = client.getDID();
    const other = members.find(m => m.did !== currentDid) ?? members[0];
    return other?.avatar;
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={goBack} className="text-text-secondary hover:text-text-primary transition-colors" aria-label={t('a11y.back')}>
          <Icon name="arrow-big-left" size={20} />
        </button>
        <span className="text-lg font-semibold text-text-primary flex-1">{t('nav.dm')}</span>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className={`text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 ${refreshing ? 'animate-spin' : ''}`}
          aria-label={t('action.refresh')}
        >
          <Icon name="refresh-cw" size={18} />
        </button>
      </div>

      {/* Group chat banner — shown only when group chats exist */}
      {groupConvoCount > 0 && (
        <a
          href="https://bsky.app/messages"
          target="_blank"
          rel="noopener noreferrer"
          role="status"
          className="flex items-center gap-2 px-4 py-2 mx-3 mt-2 mb-1 bg-primary/10 text-primary text-sm rounded-lg hover:bg-primary/20 transition-colors no-underline"
        >
          <Icon name="info" size={16} aria-hidden="true" />
          <span>{t('dm.groupChatBanner', { n: groupConvoCount })}</span>
        </a>
      )}

      {/* List */}
      <div role="list" className="flex-1 overflow-y-auto">
        {loading && directConvos.length === 0 && (
          <div className="p-6 text-center text-text-secondary animate-pulse">{t('common.loading')}</div>
        )}
        {error && <div className="p-3 m-3 bg-red-100 dark:bg-red-900/20 text-red-600 text-sm rounded-lg">{error}</div>}
        {!loading && directConvos.length === 0 && (
          <div className="p-6 text-center text-text-secondary">
            {groupConvoCount > 0
              ? t('dm.emptyWithGroupChats', { n: groupConvoCount })
              : t('dm.empty')}
          </div>
        )}
        {directConvos.map((convo) => {
          const memberHandle = getMemberHandle(convo);
          return (
          <div key={convo.id} role="listitem" className="flex items-center px-4 py-3 border-b border-border hover:bg-surface transition-colors">
            {/* Avatar — clickable for profile */}
            <div
              className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity mr-3"
              onClick={(e) => {
                e.stopPropagation();
                if (memberHandle) goTo({ type: 'profile', actor: memberHandle });
              }}
            >
              {getMemberAvatar(convo) ? (
                <img src={getMemberAvatar(convo)} alt="" className="w-full h-full object-cover" />
              ) : (
                (getMemberName(convo) || '?')[0]
              )}
            </div>
            {/* Rest of the row — clickable for chat */}
            <button
              onClick={() => handleConvoClick(convo)}
              className="flex-1 min-w-0 text-left"
            >
              <div className="flex items-center gap-2">
                {convo.muted && <span className="text-text-secondary text-xs" title={t('dm.muted')}><Icon name="bell" size={12} /></span>}
                <span className="text-sm font-semibold text-text-primary truncate">{getMemberName(convo)}</span>
                <span className="text-xs text-text-secondary truncate">@{memberHandle}</span>
                {getLastMessageTime(convo) && (
                  <span className="text-xs text-text-secondary ml-auto shrink-0">{getLastMessageTime(convo)}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-text-secondary truncate flex-1">{getLastMessageText(convo) || t('dm.noMessages')}</span>
                {convo.unreadCount > 0 && (
                  <span className="bg-primary text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none shrink-0">
                    {convo.unreadCount > 99 ? '99+' : convo.unreadCount}
                  </span>
                )}
              </div>
            </button>
          </div>
          );
        })}
      </div>
    </div>
  );
}
