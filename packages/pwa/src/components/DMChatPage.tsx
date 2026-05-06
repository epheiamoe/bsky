import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { BskyClient, MessageView, DeletedMessageView, SystemMessageView } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useChatMessages, parsePostUri, useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

type AnyMsg = MessageView | DeletedMessageView | SystemMessageView;

interface DMChatPageProps {
  client: BskyClient;
  conversationId: string;
  goBack: () => void;
  goTo: (v: AppView) => void;
}

const COMMON_EMOJIS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F621}', '\u{1F525}', '\u{1F389}'];

export function DMChatPage({ client, conversationId, goBack, goTo }: DMChatPageProps) {
  const { t } = useI18n();
  const { messages, convo, loading, sending, error, loadConvo, sendMessage, toggleReaction, refresh } = useChatMessages(client);
  const [input, setInput] = useState('');
  const [quotePreview, setQuotePreview] = useState<{ uri: string; resolved?: { cid: string; text: string; author: string } } | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [showQuoteLoading, setShowQuoteLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const did = client.getDID();

  useEffect(() => {
    loadConvo(conversationId, true);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const handleInputChange = useCallback(async (value: string) => {
    setInput(value);
    const uri = parsePostUri(value);
    if (uri && !quotePreview) {
      setQuotePreview({ uri: uri.uri });
      setShowQuoteLoading(true);
      try {
        const parts = uri.uri.match(/^at:\/\/(did:plc:[^\/]+)\/app\.bsky\.feed\.post\/([^\s]+)$/);
        if (parts) {
          const [, did_, rkey] = parts;
          const rec = await client.getRecord(did_!, 'app.bsky.feed.post', rkey!);
          setQuotePreview({ uri: uri.uri, resolved: { cid: rec.cid ?? '', text: (rec.value as any)?.text ?? '', author: '' } });
        }
      } catch {
        setQuotePreview(null);
      } finally {
        setShowQuoteLoading(false);
      }
    }
    if (!uri && quotePreview) {
      setQuotePreview(null);
    }
  }, [quotePreview, client]);

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

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={goBack} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Back">
          <Icon name="arrow-big-left" size={20} />
        </button>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
          {getMemberAvatar() ? <img src={getMemberAvatar()} alt="" className="w-full h-full object-cover" /> : (getMemberName())[0]}
        </div>
        <span className="text-sm font-semibold text-text-primary flex-1">{getMemberName()}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && messages.length === 0 && (
          <div className="text-center text-text-secondary py-8 animate-pulse">{t('common.loading')}</div>
        )}
        {error && <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-600 text-sm rounded-lg">{error}</div>}
        {messages.map((msg) => {
          if (isDeleted(msg)) {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-text-secondary italic bg-surface px-3 py-1 rounded-full">{t('dm.deletedMessage')}</span>
              </div>
            );
          }
          if (!('text' in msg)) {
            // System message — skip for now
            return null;
          }
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
              {!own && (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs shrink-0">
                  {getMemberName()[0]}
                </div>
              )}
              <div className={`flex flex-col ${own ? 'items-end' : 'items-start'} max-w-[75%]`}>
                {/* Quote embed */}
                {msgView.embed?.record?.value && (
                  <div className="mb-1 border-l-2 border-primary/50 pl-2 text-xs text-text-secondary bg-surface/50 rounded px-2 py-1">
                    <p className="text-text-primary text-xs line-clamp-1">{msgView.embed.record.value.text}</p>
                  </div>
                )}
                {/* Message bubble */}
                <div className={`rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words ${
                  own ? 'bg-primary text-white rounded-br-md' : 'bg-surface border border-border rounded-bl-md text-text-primary'
                }`}>
                  {msgView.text}
                </div>
                {/* Timestamp */}
                <span className={`text-xs text-text-secondary mt-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                  {formatTime(msgView.sentAt)}
                </span>
                {/* Reactions bar */}
                {msgReactions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(grouped).map(([value, reactions]) => {
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
                )}
                {/* Emoji picker (only for this message) */}
                {activeReactionMsgId === msg.id && (
                  <div className="flex gap-1 mt-1 p-1 bg-surface border border-border rounded-lg shadow-lg animate-slideUp">
                    {COMMON_EMOJIS.map(emoji => {
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
    </div>
  );
}
