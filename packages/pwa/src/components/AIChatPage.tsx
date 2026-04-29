import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAIChat, useChatHistory } from '@bsky/app';
import type { AIChatMessage } from '@bsky/app';
import type { BskyClient, AIConfig } from '@bsky/core';
import { IndexedDBChatStorage } from '../services/indexeddb-chat-storage.js';
import { formatTime } from '../utils/format.js';

interface AIChatPageProps {
  client: BskyClient;
  aiConfig: AIConfig;
  contextUri?: string;
  goBack: () => void;
}

export function AIChatPage({ client, aiConfig, contextUri, goBack }: AIChatPageProps) {
  const storage = useMemo(() => new IndexedDBChatStorage(), []);
  const [chatId, setChatId] = useState<string | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState('');

  const { messages, loading, guidingQuestions, send } = useAIChat(client, aiConfig, contextUri, {
    chatId,
    storage,
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
    setChatId(undefined);
    setSidebarOpen(false);
    setInput('');
  }, []);

  const handleSelectChat = useCallback((id: string) => {
    setChatId(id);
    setSidebarOpen(false);
    setInput('');
  }, []);

  const handleDeleteChat = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await deleteConversation(id);
      if (chatId === id) setChatId(undefined);
    },
    [chatId, deleteConversation],
  );

  const handleGuidingQuestion = useCallback(
    (q: string) => {
      void send(q);
    },
    [send],
  );

  return (
    <div className="flex h-[100dvh] bg-white dark:bg-[#0A0A0A] font-sans">
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
          <h2 className="text-sm font-semibold text-text-primary">🤖 AI 对话历史</h2>
          <button
            className="md:hidden text-text-secondary hover:text-text-primary p-1"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full py-2 px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
          >
            ＋ 新对话
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <p className="text-text-secondary text-xs text-center mt-8 px-4">暂无对话历史</p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => handleSelectChat(c.id)}
                className={`group flex items-start gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors mx-1 ${
                  c.id === chatId
                    ? 'bg-primary/10 border border-primary/30'
                    : 'hover:bg-surface border border-transparent'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{c.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-text-secondary">
                      {c.messageCount} 条消息
                    </span>
                    <span className="text-xs text-text-secondary/60">
                      {formatTime(c.updatedAt)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteChat(e, c.id)}
                  className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-red-500 p-0.5 transition-all shrink-0"
                  title="删除对话"
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-white dark:bg-[#0A0A0A]">
          <button
            onClick={goBack}
            className="text-text-secondary hover:text-text-primary p-1 transition-colors"
            title="返回"
          >
            ←
          </button>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="md:hidden text-text-secondary hover:text-text-primary p-1 transition-colors"
            title="对话历史"
          >
            ☰
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">🤖</span>
            <h1 className="text-base font-semibold text-text-primary truncate">AI 对话</h1>
          </div>
          {contextUri && (
            <span className="ml-auto text-xs text-text-secondary bg-surface border border-border rounded-full px-2.5 py-0.5 truncate max-w-[200px]">
              📌 {contextUri.split('/').pop()}
            </span>
          )}
        </header>

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
                  <p className="text-text-secondary text-sm mb-4">快速提问：</p>
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
                <p className="text-text-secondary text-sm">开始与 AI 对话，分析帖子内容</p>
              )}
            </div>
          )}

          {messages.map((msg, i) => {
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
              const display = msg.content.length > 300 ? msg.content.slice(0, 300) + '...' : msg.content;
              return (
                <div key={i} className="flex justify-center">
                  <div className="text-xs text-text-secondary/50 px-3 py-0.5 max-w-lg text-center">
                    ⮡ {display}
                  </div>
                </div>
              );
            }
            if (msg.role === 'user') {
              return (
                <div key={i} className="flex justify-end">
                  <div className="bg-primary text-white rounded-lg px-3 py-2 max-w-[75%]">
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="flex justify-start">
                <div className="bg-surface rounded-lg px-3 py-2 max-w-[85%] border border-border">
                  <p className="text-sm text-text-primary whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-surface rounded-lg px-4 py-2.5 border border-border flex items-center gap-1.5">
                <span className="text-sm text-text-secondary">🤖 思考中</span>
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
              placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
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
              发送
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
