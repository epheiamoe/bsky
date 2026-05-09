import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { BskyClient, MessageView, DeletedMessageView, SystemMessageView } from '@bsky/core';
import type { AppView, EmojiItem } from '@bsky/app';
import { useChatMessages, parsePostUri, useI18n, markConvoRead, getDmEmojiConfig, saveDmEmojiConfig, fetchAllEmojis } from '@bsky/app';
import { Icon } from './Icon.js';

type AnyMsg = MessageView | DeletedMessageView | SystemMessageView;

interface DMChatPageProps {
  client: BskyClient;
  conversationId: string;
  goBack: () => void;
  goTo: (v: AppView) => void;
}

const SKIN_TONES = ['\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];

export function DMChatPage({ client, conversationId, goBack, goTo }: DMChatPageProps) {
  const { t } = useI18n();
  const { messages, convo, loading, sending, error, loadConvo, loadOlder, sendMessage, toggleReaction, refresh, deleteMessage, markRead, muteConvo, unmuteConvo } = useChatMessages(client);
  const [input, setInput] = useState('');
  const [quotePreview, setQuotePreview] = useState<{ uri: string; resolved?: { cid: string; text: string; author: string } } | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [showQuoteLoading, setShowQuoteLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [customEmojis, setCustomEmojis] = useState<string[]>(() => getDmEmojiConfig());
  const [showEmojiConfig, setShowEmojiConfig] = useState(false);
  const [allEmojis, setAllEmojis] = useState<EmojiItem[]>([]);
  const [emojiConfigLoading, setEmojiConfigLoading] = useState(false);
  const [expandedEmojiKey, setExpandedEmojiKey] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const did = client.getDID();

  useEffect(() => {
    loadConvo(conversationId, true).then(() => { markRead(); markConvoRead(conversationId); });
  }, [conversationId]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Scroll-to-top → load older messages
  const loadingOlderRef = useRef(false);
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || loading || loadingOlderRef.current) return;
    if (el.scrollTop < 60) {
      loadingOlderRef.current = true;
      loadOlder().finally(() => { loadingOlderRef.current = false; });
    }
  }, [loadOlder, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');

    let embed: { $type: 'app.bsky.embed.record'; record: { uri: string; cid: string } } | undefined;
    if (quotePreview?.resolved) {
      embed = { $type: 'app.bsky.embed.record', record: { uri: quotePreview.uri, cid: quotePreview.resolved.cid } };
      setQuotePreview(null);
    }
    await sendMessage(text, embed);
  };

  const resolveQuoteRecord = useCallback(async (parsed: { uri: string; did?: string; rkey?: string; handle?: string }) => {
    setShowQuoteLoading(true);
    try {
      let did = parsed.did;
      let rkey = parsed.rkey!;
      if (!did && parsed.handle) {
        const resolved = await client.resolveHandle(parsed.handle);
        did = resolved.did;
      }
      if (did) {
        const rec = await client.getRecord(did, 'app.bsky.feed.post', rkey);
        setQuotePreview({
          uri: parsed.uri,
          resolved: {
            cid: rec.cid ?? '',
            text: (rec.value as any)?.text ?? '',
            author: '',
          },
        });
      }
    } catch {
      setQuotePreview(null);
    } finally {
      setShowQuoteLoading(false);
    }
  }, [client]);

  const handleInputChange = useCallback(async (value: string) => {
    setInput(value);
    const parsed = parsePostUri(value);
    if (parsed && !quotePreview) {
      setQuotePreview({ uri: parsed.uri });
      await resolveQuoteRecord(parsed);
    }
    if (!parsed && quotePreview) {
      setQuotePreview(null);
    }
  }, [quotePreview, resolveQuoteRecord]);

  const handleDelete = async (msgId: string) => {
    if (!confirm(t('dm.confirmDelete'))) return;
    setDeleting(msgId);
    await deleteMessage(msgId);
    setDeleting(null);
  };

  const isOwn = (msg: AnyMsg): boolean => !('data' in msg) && msg.sender.did === did;
  const isDeleted = (msg: AnyMsg): boolean => !('text' in msg) && !('data' in msg);

  const getMemberName = () => {
    if (!convo) return '';
    const members = convo.members || [];
    const other = members.find(m => m.did !== did) ?? members[0];
    return other?.displayName || other?.handle || '';
  };

  const getMemberAvatar = () => {
    if (!convo) return undefined;
    const members = convo.members || [];
    const other = members.find(m => m.did !== did) ?? members[0];
    return other?.avatar;
  };

  const handleReactionClick = (messageId: string) => {
    setActiveReactionMsgId(prev => prev === messageId ? null : messageId);
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Load all emojis when config panel opens
  useEffect(() => {
    if (showEmojiConfig && allEmojis.length === 0 && !emojiConfigLoading) {
      setEmojiConfigLoading(true);
      fetchAllEmojis().then(emojis => {
        setAllEmojis(emojis);
        setEmojiConfigLoading(false);
      }).catch(() => setEmojiConfigLoading(false));
    }
  }, [showEmojiConfig, allEmojis.length, emojiConfigLoading]);

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={goBack} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Back">
          <Icon name="arrow-big-left" size={20} />
        </button>
        <div
          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => {
            const member = convo?.members?.find(m => m.did !== did);
            if (member?.handle) goTo({ type: 'profile', actor: member.handle });
          }}
        >
          {getMemberAvatar() ? <img src={getMemberAvatar()} alt="" className="w-full h-full object-cover" /> : (getMemberName())[0]}
        </div>
        <span className="text-sm font-semibold text-text-primary flex-1">{getMemberName()}</span>
        {convo && (
          <button
            onClick={() => convo.muted ? unmuteConvo() : muteConvo()}
            className="text-text-secondary hover:text-text-primary transition-colors text-xs"
            title={convo.muted ? t('dm.unmute') : t('dm.mute')}
            aria-label={convo.muted ? t('dm.unmute') : t('dm.mute')}
          >
            <Icon name="bell" size={16} filled={!convo.muted} />
          </button>
        )}
        <button onClick={() => refresh()} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Refresh">
          <Icon name="refresh-cw" size={16} />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
      >
        {loading && messages.length === 0 && (
          <div className="text-center text-text-secondary py-8 animate-pulse">{t('common.loading')}</div>
        )}
        {error && <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-600 text-sm rounded-lg">{error}</div>}
        {messages.filter(Boolean).map((msg) => {
          if (isDeleted(msg)) {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-text-secondary italic bg-surface px-3 py-1 rounded-full">{t('dm.deletedMessage')}</span>
              </div>
            );
          }
          if (!('text' in msg)) return null;
          const msgView = msg as MessageView;
          const own = isOwn(msgView);
          const msgReactions = msgView.reactions || [];
          const grouped = msgReactions.reduce((acc, r) => {
            const key = r.value;
            if (!acc[key]) acc[key] = [];
            acc[key]!.push(r);
            return acc;
          }, {} as Record<string, typeof msgReactions>);
          const myReactions = msgReactions.filter(r => r.sender.did === did);

          return (
            <div key={msg.id} className={`flex ${own ? 'justify-end' : 'justify-start'} items-end gap-2 group animate-messageIn`}>
              <div className={`flex flex-col ${own ? 'items-end' : 'items-start'} max-w-[75%]`}>
                {/* Quote embed */}
                {msgView.embed?.record?.value && (
                  <div className="mb-1 border-l-2 border-primary/50 pl-2 text-xs text-text-secondary bg-surface/50 rounded px-2 py-1">
                    <p className="text-text-primary text-xs line-clamp-1">{msgView.embed.record.value.text}</p>
                  </div>
                )}
                {/* Message bubble */}
                <div className={`rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words relative ${
                  own ? 'bg-primary text-white rounded-br-md' : 'bg-surface border border-border rounded-bl-md text-text-primary'
                }`}>
                  {msgView.text}
                  {/* Delete button (own messages, on hover) */}
                  {own && (
                    <button
                      onClick={() => handleDelete(msgView.id)}
                      disabled={deleting === msgView.id}
                      className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 rounded-full p-0.5 shadow text-red-500 hover:text-red-600"
                      aria-label="Delete message"
                    >
                      <Icon name="trash-2" size={12} />
                    </button>
                  )}
                </div>
                {/* Timestamp */}
                <span className="text-xs text-text-secondary mt-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatTime(msgView.sentAt)}
                </span>
                {/* Reactions bar — always shows add button */}
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  {msgReactions.length > 0 && Object.entries(grouped).map(([value, reactions]) => {
                    const hasMy = reactions.some(r => r.sender.did === did);
                    return (
                      <button
                        key={value}
                        onClick={() => toggleReaction(msgView.id, value, hasMy)}
                        className={`text-xs px-1.5 py-0.5 rounded-full transition-colors ${
                          hasMy ? 'bg-primary/20 text-primary font-bold' : 'bg-surface border border-border text-text-secondary hover:bg-primary/10'
                        }`}
                      >
                        {value} {reactions.length > 1 ? <span className="opacity-70">{reactions.length}</span> : ''}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handleReactionClick(msgView.id)}
                    className="text-xs px-1.5 py-0.5 rounded-full bg-surface border border-border text-text-secondary hover:bg-primary/10 transition-colors"
                    aria-label="Add reaction"
                  >
                    <Icon name="smile" size={14} />
                  </button>
                </div>
                {/* Emoji picker */}
                {activeReactionMsgId === msg.id && (
                  <div className="flex gap-1 mt-1 p-1 bg-surface border border-border rounded-lg shadow-lg animate-slideUp">
                    {customEmojis.map(emoji => {
                      const hasMy = myReactions.some(r => r.value === emoji);
                      return (
                        <button
                          key={emoji}
                          onClick={() => {
                            toggleReaction(msgView.id, emoji, hasMy);
                            setActiveReactionMsgId(null);
                          }}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-colors ${
                            hasMy ? 'bg-primary/20' : 'hover:bg-surface-hover'
                          }`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => { setActiveReactionMsgId(null); setShowEmojiConfig(true); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary/10 text-primary transition-colors"
                      title="Configure quick emojis"
                    >
                      <Icon name="plus" size={14} />
                    </button>
                    <button
                      onClick={() => setActiveReactionMsgId(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-hover transition-colors"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Quote preview */}
      {quotePreview && (
        <div className="px-4 py-2 border-t border-border bg-surface flex items-center gap-3 animate-slideUp">
          <div className="flex-1 min-w-0">
            {quotePreview.resolved ? (
              <p className="text-xs text-text-primary line-clamp-2">{quotePreview.resolved.text}</p>
            ) : (
              <p className="text-xs text-text-secondary animate-pulse">{t('dm.resolvingQuote')}</p>
            )}
          </div>
          <button onClick={() => setQuotePreview(null)} className="text-text-secondary hover:text-text-primary">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border px-4 py-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          rows={1}
          placeholder={t('dm.placeholder')}
          className="flex-1 px-3 py-2 rounded-xl border border-border bg-white dark:bg-[#1A1A1A] text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm leading-relaxed max-h-32"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="px-3 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {sending ? '...' : t('dm.send')}
        </button>
      </div>

      {/* Emoji Config Panel */}
      {showEmojiConfig && (
        <EmojiConfigPanel
          allEmojis={allEmojis}
          loading={emojiConfigLoading}
          selected={customEmojis}
          expandedKey={expandedEmojiKey}
          onToggle={(emoji) => {
            const next = customEmojis.includes(emoji)
              ? customEmojis.filter(e => e !== emoji)
              : [...customEmojis, emoji];
            setCustomEmojis(next);
            saveDmEmojiConfig(next);
          }}
          onExpandKey={(key) => setExpandedEmojiKey(prev => prev === key ? null : key)}
          onClose={() => { setShowEmojiConfig(false); setExpandedEmojiKey(null); }}
        />
      )}
    </div>
  );
}

function EmojiConfigPanel({ allEmojis, loading, selected, expandedKey, onToggle, onExpandKey, onClose }: {
  allEmojis: EmojiItem[];
  loading: boolean;
  selected: string[];
  expandedKey: string | null;
  onToggle: (emoji: string) => void;
  onExpandKey: (key: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4 animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-[#0A0A0A] rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">{t('dm.emojiConfig')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Emoji Grid */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && allEmojis.length === 0 && (
            <p className="text-text-secondary text-sm text-center py-8">{t('common.error')}</p>
          )}
          {!loading && (
            <div className="grid grid-cols-8 gap-1">
              {allEmojis.map((item, idx) => {
                const inList = selected.includes(item.emoji);
                const isExpanded = expandedKey === item.key;
                return (
                  <div key={item.key} className="relative">
                    <button
                      onClick={() => {
                        if (item.hasVariants) {
                          onExpandKey(item.key);
                        } else {
                          onToggle(item.emoji);
                        }
                      }}
                      className={`w-10 h-10 flex items-center justify-center rounded-xl text-xl transition-all duration-150 ${
                        inList
                          ? 'bg-primary/15 ring-2 ring-primary scale-105'
                          : 'hover:bg-surface-hover hover:scale-105'
                      }`}
                      style={{ animationDelay: `${(idx % 8) * 30}ms` }}
                    >
                      <span>{item.emoji}</span>
                      {item.hasVariants && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-text-secondary/30" />
                      )}
                    </button>
                    {/* Skin tone picker */}
                    <div
                      className={`overflow-hidden transition-all duration-200 ${
                        isExpanded ? 'max-h-12 opacity-100 mt-1' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="flex gap-0.5 justify-center">
                        {item.variants.map(v => {
                          const inVariantList = selected.includes(v);
                          return (
                            <button
                              key={v}
                              onClick={(e) => { e.stopPropagation(); onToggle(v); }}
                              className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-all ${
                                inVariantList
                                  ? 'bg-primary/15 ring-1 ring-primary scale-110'
                                  : 'hover:bg-surface-hover'
                              }`}
                            >
                              {v}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">{t('dm.emojiConfigHint', { n: selected.length })}</p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            {t('action.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
