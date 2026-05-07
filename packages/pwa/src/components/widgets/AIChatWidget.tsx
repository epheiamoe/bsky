import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useAIChat, useI18n, getAIChatSessionId, resetAIChatSession } from '@bsky/app';
import type { AIChatMessage } from '@bsky/app';
import type { WidgetProps } from '@bsky/app';
import type { AIConfig } from '@bsky/core';
import { IndexedDBChatStorage } from '../../services/indexeddb-chat-storage.js';
import { Icon } from '../Icon.js';
import { ThinkingCard, ToolCard, AssistantMessage } from '../ai/index.js';

export function AIChatWidget({ onClose, context }: WidgetProps) {
  const { t } = useI18n();
  const client = context?.client;
  const goTo = context?.goTo as ((v: unknown) => void) | undefined;
  const aiConfig: AIConfig = (context?.aiConfig as AIConfig | undefined) ?? { apiKey: '', baseUrl: '', model: '' };

  const [widgetKey, setWidgetKey] = useState(0);
  const chatId = useMemo(() => getAIChatSessionId() || resetAIChatSession(), [widgetKey]);
  const storage = useMemo(() => new IndexedDBChatStorage(), []);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, loading, send, stop } = useAIChat(client ?? null, aiConfig!, undefined, {
    chatId,
    storage,
    stream: true,
    environment: 'pwa',
    locale: context?.locale as string | undefined,
  });

  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const toggleCard = useCallback((idx: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // ── /view context from current page ──
  const viewContext = useMemo(() => {
    const vt = context?.viewType as string | undefined;
    if (vt === 'thread' && context?.threadUri) return `帖子: ${context.threadUri}`;
    if (vt === 'profile' && (context as any)?.profileActor) return `用户: @${(context as any).profileActor}`;
    if (vt === 'search' && (context as any)?.searchQuery) return `搜索: ${(context as any).searchQuery}`;
    return null;
  }, [context?.viewType, context?.threadUri, (context as any)?.profileActor, (context as any)?.searchQuery]);

  const inputStartsWithView = input.trimStart().startsWith('/view') && viewContext;

  const handleSend = useCallback(() => {
    let text = input;
    if (!text.trim() || loading) return;
    if (text.trimStart().startsWith('/view') && viewContext) {
      const clean = text.replace(/^\/view\s*/i, '');
      text = `<currently_viewing>用户当前正在浏览: ${viewContext}。这个信息可能有帮助，但如果用户没有要求你使用，请不要提及。</currently_viewing>\n${clean}`;
    }
    send(text.trim());
    setInput('');
  }, [input, loading, send, viewContext]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleNewChat = useCallback(() => {
    resetAIChatSession();
    setWidgetKey(k => k + 1);
  }, []);

  const handleOpenInPage = useCallback(() => {
    goTo?.({ type: 'aiChat', sessionId: chatId });
    onClose();
  }, [goTo, chatId, onClose]);

  // Compact message groups
  const messageGroups = useMemo(() => {
    const groups: Array<{ type: 'thinking' | 'tool' | 'user' | 'assistant'; msg: AIChatMessage; result?: AIChatMessage }> = [];
    let pendingTool: AIChatMessage | null = null;
    for (const msg of messages) {
      if (msg.role === 'thinking') {
        groups.push({ type: 'thinking', msg });
      } else if (msg.role === 'tool_call') {
        pendingTool = msg;
      } else if (msg.role === 'tool_result') {
        if (pendingTool) {
          groups.push({ type: 'tool', msg: pendingTool, result: msg });
          pendingTool = null;
        } else {
          groups.push({ type: 'tool', msg: { ...msg, role: 'tool_call' as const, toolName: 'result' }, result: msg });
        }
      } else if (msg.role === 'user') {
        if (pendingTool) { groups.push({ type: 'tool', msg: pendingTool }); pendingTool = null; }
        groups.push({ type: 'user', msg });
      } else if (msg.role === 'assistant') {
        if (pendingTool) { groups.push({ type: 'tool', msg: pendingTool }); pendingTool = null; }
        groups.push({ type: 'assistant', msg });
      }
    }
    if (pendingTool) groups.push({ type: 'tool', msg: pendingTool });
    return groups;
  }, [messages]);

  const viewingTagRegex = /<currently_viewing>([\s\S]*?)<\/currently_viewing>/;

  return (
    <div className="flex flex-col max-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
          <Icon name="astroid-as-AI-Button" size={14} /> {t('ai.widgetTitle')}
        </span>
        <div className="flex items-center gap-1">
          {goTo && (
            <button onClick={handleOpenInPage} className="text-text-secondary hover:text-primary transition-colors p-0.5" title="Open in full page">
              <Icon name="arrow-big-right" size={14} />
            </button>
          )}
          <button onClick={handleNewChat} className="text-text-secondary hover:text-primary transition-colors p-0.5" title="New chat">
            <Icon name="plus" size={14} />
          </button>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors p-0.5">
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {messageGroups.length === 0 && !loading && (
          <div className="text-[12px] text-text-secondary/60 text-center mt-6 px-2">
            <p>{t('ai.emptyPrompt')}</p>
            {viewContext && <p className="mt-2 text-[11px]">{t('ai.viewHint')}</p>}
          </div>
        )}
        {messageGroups.map((group, gi) => {
          if (group.type === 'thinking') {
            return <ThinkingCard key={gi} content={group.msg.content} expanded={expandedCards.has(gi)} onToggle={() => toggleCard(gi)} compact />;
          }
          if (group.type === 'tool') {
            return (
              <ToolCard key={gi} toolName={group.msg.toolName ?? ''} args={group.msg.content} resultContent={group.result?.content}
                expanded={expandedCards.has(gi)} onToggle={() => toggleCard(gi)} compact />
            );
          }
          if (group.type === 'user') {
            const match = group.msg.content.match(viewingTagRegex);
            const cleanContent = match ? group.msg.content.replace(match[0], '').trim() : group.msg.content;
            return (
              <div key={gi} className="flex flex-col items-end gap-0.5">
                {match && (
                  <div className="flex justify-start w-full">
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg px-2.5 py-1.5 text-[11px] text-text-secondary/70 max-w-[90%] break-all">
                      📋 {match[1]!.split('\n')[0]}
                    </div>
                  </div>
                )}
                {cleanContent && (
                  <div className="bg-primary text-white rounded-lg px-2.5 py-1.5 max-w-[85%] text-[13px] whitespace-pre-wrap break-words">{cleanContent}</div>
                )}
              </div>
            );
          }
          return <AssistantMessage key={gi} content={group.msg.content} compact />;
        })}
        {loading && (
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <span className="text-[12px] text-text-secondary"><Icon name="astroid-as-AI-Button" size={12} /> {t('ai.thinking')}</span>
            <span className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '200ms' }} />
              <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '400ms' }} />
            </span>
          </div>
        )}
      </div>

      {/* /view preview card */}
      {inputStartsWithView && (
        <div className="px-2 pt-1">
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg px-2.5 py-1.5 text-[11px] text-text-secondary/70 break-all">
            📋 {viewContext}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border px-2 py-2">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('ai.placeholder')}
            disabled={loading}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 px-3 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 max-h-16"
          />
          {loading ? (
            <button onClick={stop} className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors">
              {t('action.stop')}
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-medium transition-colors disabled:opacity-50">
              {t('action.send')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
