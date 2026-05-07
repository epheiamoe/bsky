import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useAIChat, useI18n, getEnabledWidgetIds } from '@bsky/app';
import type { AIChatMessage } from '@bsky/app';
import type { WidgetProps } from '@bsky/app';
import type { AIConfig } from '@bsky/core';
import { IndexedDBChatStorage } from '../../services/indexeddb-chat-storage.js';
import { Icon } from '../Icon.js';
import { ThinkingCard, ToolCard, AssistantMessage } from '../ai/index.js';

export function AIChatWidget({ onClose, context }: WidgetProps) {
  const { t } = useI18n();
  const client = context?.client;
  const aiConfig = context?.aiConfig as AIConfig | undefined;

  const storage = useMemo(() => new IndexedDBChatStorage(), []);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, loading, send, stop } = useAIChat(client ?? null, aiConfig!, undefined, {
    storage,
    stream: true,
    environment: 'pwa',
    locale: context?.locale as string | undefined,
  });

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || loading) return;
    send(input.trim());
    setInput('');
  }, [input, loading, send]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Compact message groups (same grouping as AIChatPage)
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
          <Icon name="astroid-as-AI-Button" size={14} /> {t('ai.widgetTitle')}
        </span>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors p-0.5">
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {messageGroups.length === 0 && !loading && (
          <p className="text-[12px] text-text-secondary/60 text-center mt-8">{t('ai.emptyPrompt')}</p>
        )}
        {messageGroups.map((group, gi) => {
          if (group.type === 'thinking') {
            return <ThinkingCard key={gi} content={group.msg.content} expanded={false} onToggle={() => {}} compact />;
          }
          if (group.type === 'tool') {
            return (
              <ToolCard
                key={gi}
                toolName={group.msg.toolName ?? ''}
                args={group.msg.content}
                resultContent={group.result?.content}
                expanded={false}
                onToggle={() => {}}
                compact
              />
            );
          }
          if (group.type === 'user') {
            return <div key={gi} className="flex justify-end mb-1"><div className="bg-primary text-white rounded-lg px-2.5 py-1.5 max-w-[85%] text-[13px] whitespace-pre-wrap break-words">{group.msg.content}</div></div>;
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
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {t('action.send')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
