import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAIChat, useChatHistory, useI18n } from '@bsky/app';
import type { AIChatMessage } from '@bsky/app';
import type { BskyClient, AIConfig } from '@bsky/core';
import { IndexedDBChatStorage } from '../services/indexeddb-chat-storage.js';
import { formatTime } from '../utils/format.js';
import { Icon } from './Icon.js';

interface AIChatPageProps {
  client: BskyClient;
  aiConfig: AIConfig;
  sessionId?: string;
  contextPost?: string;
  contextProfile?: string;
  contextUri?: string;
  goTo: (v: import('@bsky/app').AppView) => void;
  goBack: () => void;
}

export function AIChatPage({ client, aiConfig, sessionId, contextPost, contextProfile, contextUri, goTo, goBack }: AIChatPageProps) {
  const { t, locale } = useI18n();
  const storage = useMemo(() => new IndexedDBChatStorage(), []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const userHandle = useMemo(() => (client.isAuthenticated() ? client.getHandle() : undefined), [client]);

  const isProfile = contextUri && !contextUri?.startsWith('at://');

  const { messages, loading, guidingQuestions, send, pendingConfirmation, confirmAction, rejectAction, undoLastMessage, edit, editByIndex } = useAIChat(client, aiConfig, isProfile ? undefined : contextUri, {
    chatId: sessionId,
    storage,
    stream: true,
    userHandle,
    environment: 'pwa',
    locale,
    contextProfile: contextProfile ?? (isProfile ? contextUri : undefined),
    contextPost,
  });
  const { conversations, deleteConversation } = useChatHistory(storage);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || loading) return;
    void send(input.trim());
    setInput('');
  }, [input, loading, send]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleNewChat = useCallback(() => {
    goTo({ type: 'aiChat', sessionId: crypto.randomUUID() });
    setSidebarOpen(false);
    setInput('');
  }, [goTo]);

  const handleSelectChat = useCallback((id: string) => {
    goTo({ type: 'aiChat', sessionId: id });
    setSidebarOpen(false);
    setInput('');
  }, [goTo]);

  const handleDeleteChat = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await deleteConversation(id);
      if (sessionId === id) goTo({ type: 'aiChat' });
    },
    [sessionId, deleteConversation, goTo],
  );

  const handleGuidingQuestion = useCallback(
    (q: string) => {
      void send(q);
    },
    [send],
  );

  return (
    <div className="flex h-[calc(100dvh-3rem)] bg-white dark:bg-[#0A0A0A] font-sans">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-[280px] flex flex-col bg-surface border-r border-border transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary"><Icon name="astroid-as-AI-Button" size={18} /> {t('ai.history')}</h2>
          <button
            className="md:hidden text-text-secondary hover:text-text-primary p-1"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full py-2 px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
          >
            <Icon name="plus" size={16} /> {t('ai.newChat')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <p className="text-text-secondary text-xs text-center mt-8 px-4">{t('ai.emptyHistory')}</p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => handleSelectChat(c.id)}
                className={`group flex items-start gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors mx-1 ${
                  c.id === sessionId
                    ? 'bg-primary/10 border border-primary/30'
                    : 'hover:bg-surface border border-transparent'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{c.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-text-secondary">
                      {t('ai.messageCount', { n: c.messageCount })}
                    </span>
                    <span className="text-xs text-text-secondary/60">
                      {formatTime(c.updatedAt)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteChat(e, c.id)}
                  className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-red-500 p-0.5 transition-all shrink-0"
                  title={t('ai.deleteChat')}
                >
                  <Icon name="trash-2" size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-border bg-white dark:bg-[#0A0A0A] flex-shrink-0">
          <button
            onClick={goBack}
            className="text-text-secondary hover:text-text-primary p-1 transition-colors"
            title={t('nav.back')}
          >
            <Icon name="arrow-big-left" size={20} />
          </button>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="md:hidden text-text-secondary hover:text-text-primary p-1 transition-colors"
            title={t('ai.history')}
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg"><Icon name="astroid-as-AI-Button" size={18} /></span>
            <h1 className="text-base font-semibold text-text-primary truncate">{t('nav.aiChat')}</h1>
            {messages.length > 0 && (
              <button
                onClick={() => {
                  const txt = messages
                    .filter(m => m.role === 'user' || m.role === 'assistant')
                    .map(m => `[${m.role === 'user' ? '▸' : '<Icon name="astroid-as-AI-Button" size={18} />'}] ${m.content}`)
                    .join('\n\n');
                  navigator.clipboard.writeText(txt).catch(() => {});
                }}
                className="ml-auto text-xs text-text-secondary hover:text-primary transition-colors px-2 py-1 rounded border border-border"
                title={t('ai.copyTranscript')}
              >
                <Icon name="copy" size={16} /> {t('ai.copyTranscript')}
              </button>
            )}
          </div>
          {contextUri && (
            <span className="ml-auto text-xs text-text-secondary bg-surface border border-border rounded-full px-2.5 py-0.5 truncate max-w-[200px]">
              <Icon name="pin" size={14} /> {contextUri.split('/').pop()}
            </span>
          )}
        </header>

        {/* ── Write confirmation modal ── */}
        {pendingConfirmation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={rejectAction}>
            <div className="bg-white dark:bg-[#1a1a2e] rounded-xl p-6 max-w-md mx-4 border-2 border-yellow-500 shadow-xl" onClick={e => e.stopPropagation()}>
              <p className="text-yellow-600 dark:text-yellow-400 font-semibold text-lg mb-2"><Icon name="triangle-alert" size={18} /> Confirm Action</p>
              <p className="text-sm text-text-primary mb-4">{pendingConfirmation.description}</p>
              <div className="flex gap-3 justify-end">
                <button onClick={rejectAction} className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-surface transition-colors">{t('action.cancel')}</button>
                <button onClick={confirmAction} className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors">{t('action.confirm')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Messages area */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
        >
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              {guidingQuestions.length > 0 ? (
                <div className="space-y-3 w-full max-w-sm">
                  <p className="text-text-secondary text-sm mb-4">{t('ai.quickQuestions')}</p>
                  {guidingQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleGuidingQuestion(q)}
                      className="w-full py-2.5 px-4 rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 text-sm font-medium transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-text-secondary text-sm">{t('ai.emptyPrompt')}</p>
              )}
            </div>
          )}

          {messages.map((msg, i) => {
            if (msg.role === 'thinking') {
              return (
                <div key={i} className="flex justify-start mb-1">
                  <div className="border-l-2 border-text-secondary/20 pl-3 py-1 text-xs text-text-secondary/60 italic max-w-[85%] whitespace-pre-wrap break-words">
                    <span className="font-medium not-italic text-text-secondary/70">💭 Thinking:</span>{' '}{msg.content}
                  </div>
                </div>
              );
            }
            if (msg.role === 'tool_call') {
              return (
                <div key={i} className="flex justify-center">
                  <div className="text-xs text-text-secondary/50 px-3 py-0.5">
                    🔧 <span className="font-mono">{msg.toolName ?? ''}</span>
                  </div>
                </div>
              );
            }
            if (msg.role === 'tool_result') {
              return (
                <div key={i} className="flex justify-center">
                  <div className="text-xs text-text-secondary/50 px-3 py-0.5 max-w-lg text-center break-words overflow-hidden">
                    ⮡ {msg.content}
                  </div>
                </div>
              );
            }
            if (msg.role === 'user') {
              const userIdx = messages.slice(0, i + 1).filter(m => m.role === 'user').length - 1;
              const isLastUser = i === messages.length - 1 || messages.slice(i + 1).every(m => m.role !== 'user');
              return (
                <div key={i} className="flex justify-end items-start gap-2">
                  <div className="flex flex-col gap-1 pt-1">
                    {!loading && msg.content && (
                      <button
                        onClick={() => { const text = editByIndex(userIdx); if (text) { setInput(text); } }}
                        title="Edit"
                        className="text-xs text-text-secondary/60 hover:text-primary transition-colors px-1"
                      ><Icon name="pencil-line" size={16} /></button>
                    )}
                  </div>
                  <div className="bg-primary text-white rounded-lg px-3 py-2 max-w-[75%]">
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </div>
              );
            }
            const isError = (msg as any).isError === true;
            return (
              <div key={i} className="flex justify-start group">
                <div className={`rounded-lg px-3 py-2 max-w-[85%] border relative ${
                  isError
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                    : 'bg-surface border-border'
                }`}>
                  <div className="text-sm text-text-primary markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                  {!isError && msg.content && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(msg.content).catch(() => {});
                        setCopiedIdx(i);
                        setTimeout(() => setCopiedIdx(null), 1500);
                      }}
                      className="absolute bottom-1 right-1 text-xs text-text-secondary/60 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded bg-surface/80"
                      title={t('ai.copyLast')}
                    >
                      {copiedIdx === i ? '<Icon name="copy" size={16} /> ' + t('ai.copied') : '<Icon name="copy" size={16} />'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-surface rounded-lg px-4 py-2.5 border border-border flex items-center gap-1.5">
                <span className="text-sm text-text-secondary"><Icon name="astroid-as-AI-Button" size={18} /> {t('ai.thinking')}</span>
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '200ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '400ms' }} />
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-border bg-white dark:bg-[#0A0A0A] px-4 py-3">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('ai.placeholder')}
              disabled={loading}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 max-h-32"
              style={{ minHeight: '42px' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 128) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="shrink-0 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {t('action.send')}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
