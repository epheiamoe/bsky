import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAIChat, useChatHistory, useI18n, enableWidget, saveChatNow } from '@bsky/app';
import type { AIChatMessage } from '@bsky/app';
import type { BskyClient, AIConfig } from '@bsky/core';
import { formatTime } from '../utils/format.js';
import { Icon } from './Icon.js';
import { ThinkingCard, ToolCard, UserMessage, AssistantMessage } from './ai/index.js';

// ── Export/Import format conversion utilities ──

/** Convert display messages to OpenAI standard format for export (bsky-chat-v2). */
function toOpenAIFormat(messages: AIChatMessage[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  let reasoning = '';
  let textContent = '';
  const toolCalls: Record<string, unknown>[] = [];

  function flushAssistant() {
    if (textContent || toolCalls.length > 0 || reasoning) {
      const entry: Record<string, unknown> = { role: 'assistant', content: textContent };
      if (reasoning) entry.reasoning_content = reasoning;
      if (toolCalls.length > 0) entry.tool_calls = [...toolCalls];
      result.push(entry);
    }
    reasoning = '';
    textContent = '';
    toolCalls.length = 0;
  }

  for (const m of messages) {
    if (m.role === 'thinking') {
      reasoning += (reasoning ? '\n' : '') + m.content;
    } else if (m.role === 'assistant') {
      textContent = m.content;
    } else if (m.role === 'tool_call') {
      const argsMatch = m.content.match(/\{.*\}/s);
      toolCalls.push({
        id: m.toolCallId || '',
        type: 'function',
        function: { name: m.toolName || '', arguments: argsMatch ? argsMatch[0] : '{}' },
      });
    } else if (m.role === 'tool_result') {
      flushAssistant();
      result.push({
        role: 'tool',
        content: m.content,
        tool_call_id: m.toolCallId || '',
        name: m.toolName || '',
      });
    } else if (m.role === 'user') {
      flushAssistant();
      result.push({ role: 'user', content: m.content });
    }
  }
  flushAssistant();
  return result;
}

/** Convert OpenAI standard messages to internal AIChatMessage format for import. */
function fromOpenAIFormat(messages: Record<string, unknown>[]): AIChatMessage[] {
  const result: AIChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'assistant') {
      const rc = m.reasoning_content;
      if (typeof rc === 'string' && rc.length > 0) {
        result.push({ role: 'thinking', content: rc });
      }
      const text = typeof m.content === 'string' ? m.content : '';
      if (text.trim().length > 0) {
        result.push({ role: 'assistant', content: text });
      }
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls as Record<string, unknown>[]) {
          const func = (tc.function || {}) as Record<string, unknown>;
          result.push({
            role: 'tool_call',
            content: String(func.name || ''),
            toolName: String(func.name || ''),
            toolCallId: String(tc.id || ''),
          });
        }
      }
    } else if (m.role === 'tool') {
      result.push({
        role: 'tool_result',
        content: typeof m.content === 'string' ? m.content : String(m.content || ''),
        toolName: typeof m.name === 'string' ? m.name : undefined,
        toolCallId: typeof m.tool_call_id === 'string' ? m.tool_call_id : undefined,
      });
    } else {
      result.push({
        role: String(m.role || 'user') as AIChatMessage['role'],
        content: typeof m.content === 'string' ? m.content : String(m.content || ''),
      });
    }
  }
  return result;
}

/** Detect whether imported data uses v1 (old custom) or v2 (OpenAI standard) format. */
function detectImportFormat(data: Record<string, unknown>, messages: Record<string, unknown>[]): 'v1' | 'v2' {
  if (data.format === 'bsky-chat-v1') return 'v1';
  if (data.format === 'bsky-chat-v2') return 'v2';
  if (messages.length > 0) {
    const hasOldRoles = messages.some(m => m.role === 'tool_call' || m.role === 'tool_result' || m.role === 'thinking');
    const hasNewRoles = messages.some(m => m.role === 'tool' || (m.role === 'assistant' && (m as Record<string, unknown>).tool_calls));
    if (hasOldRoles && !hasNewRoles) return 'v1';
    if (hasNewRoles) return 'v2';
  }
  return 'v2';
}

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const toggleCard = useCallback((idx: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const userHandle = useMemo(() => (client.isAuthenticated() ? client.getHandle() : undefined), [client]);

  const isProfile = contextUri && !contextUri?.startsWith('at://');

  const { conversations, deleteConversation, saveConversation, loadConversation, refresh } = useChatHistory();

  const { messages, loading, guidingQuestions, wasRepaired, send, stop, addUserImage, pendingConfirmation, confirmAction, rejectAction, undoLastMessage, edit, editByIndex } = useAIChat(client, aiConfig, isProfile ? undefined : contextUri, {
    chatId: sessionId,
    stream: true,
    userHandle,
    environment: 'pwa',
    locale,
    contextProfile: contextProfile ?? (isProfile ? contextUri : undefined),
    contextPost,
    onChatSaved: refresh,
    onTitleChanged: refresh,
  });
  // Group messages for card display: pair tool_call + tool_result
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

  // Auto-expand the last thinking/tool card during streaming
  const lastStreamGroupIndex = useMemo(() => {
    if (!loading) return -1;
    for (let i = messageGroups.length - 1; i >= 0; i--) {
      const g = messageGroups[i];
      if (g.type === 'thinking' || g.type === 'tool') return i;
    }
    return -1;
  }, [messageGroups, loading]);

  const [exportOpen, setExportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const visionEnabled = aiConfig.visionEnabled ?? false;

  // Scroll refs — user-controlled
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Keep container height synced with visual viewport on mobile (keyboard safe)
  useEffect(() => {
    const vv = window.visualViewport;
    const el = chatContainerRef.current;
    if (!vv || !el) return;
    const update = () => { el.style.height = `${vv.height - 48}px`; };
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  // File upload handler
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      setPendingFile({ file, preview: URL.createObjectURL(file) });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    let text = input.trim();
    if (text.startsWith('/view')) {
      const clean = text.replace(/^\/view\s*/i, '');
      const ctx = contextPost ? `帖子: ${contextPost}` : contextProfile ? `用户: @${contextProfile}` : null;
      if (ctx) {
        text = `<currently_viewing>用户当前正在浏览: ${ctx}。这个信息可能有帮助，但如果用户没有要求你使用，请不要提及。</currently_viewing>\n${clean}`;
      }
    }
    if (pendingFile) {
      const data = new Uint8Array(await pendingFile.file.arrayBuffer());
      const idx = addUserImage(data, pendingFile.file.type || 'image/jpeg', '');
      const ref = `[图片: index=${idx}]`;
      void send(text + '\n\n' + ref);
      setInput('');
      setPendingFile(null);
    } else {
      void send(text);
      setInput('');
    }
  }, [input, loading, send, pendingFile, addUserImage, contextPost, contextProfile]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  // ═══════════════════ Export ═══════════════════
  const handleExport = useCallback((format: 'json' | 'html' | 'md') => {
    if (format === 'json') {
      // Export in OpenAI standard format (bsky-chat-v2) — tools nested in assistant, thinking as reasoning_content
      const exp: Record<string, unknown> = {
        format: 'bsky-chat-v2',
        exportedAt: new Date().toISOString(),
        model: aiConfig.model,
        provider: aiConfig.provider || null,
        messages: toOpenAIFormat(messages),
      };
      if (contextUri) exp.contextUri = contextUri;
      if (contextPost) exp.contextPost = contextPost;
      if (contextProfile) exp.contextProfile = contextProfile;
      downloadFile(JSON.stringify(exp, null, 2), 'chat.json', 'application/json');
    } else if (format === 'html') {
      const visible = messages.filter(m => m.role === 'user' || m.role === 'assistant');
      const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chat Export</title><style>body{font-family:sans-serif;max-width:800px;margin:auto;padding:20px;background:#0A0A0A;color:#F1F5F9}.user{background:#00A5E0;color:#fff;padding:10px 16px;border-radius:12px;margin:8px 0 8px 40px}.ai{background:#121212;border:1px solid #27272A;padding:10px 16px;border-radius:12px;margin:8px 40px 8px 0}</style></head><body>' +
        visible.map(m => `<div class="${m.role}"><strong>${m.role === 'user' ? 'You' : 'AI'}</strong><p>${escapeHtml(m.content)}</p></div>`).join('') +
        '</body></html>';
      downloadFile(html, 'chat.html', 'text/html');
    } else {
      const visible = messages.filter(m => m.role === 'user' || m.role === 'assistant');
      const md = visible.map(m => `### ${m.role === 'user' ? 'You' : 'AI'}\n\n${m.content}\n`).join('\n');
      downloadFile(md, 'chat.md', 'text/markdown');
    }
    setExportOpen(false);
  }, [messages, aiConfig, contextUri, contextPost, contextProfile]);

  // ═══════════════════ Import ═══════════════════
  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);

    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setImportError('Invalid JSON file.');
        return;
      }

      const data = parsed as Record<string, unknown>;
      if (!Array.isArray(data.messages)) {
        setImportError('Missing required field: "messages" is not an array.');
        return;
      }
      const msgs = data.messages as Array<Record<string, unknown>>;
      if (msgs.length === 0) {
        setImportError('Cannot import an empty conversation.');
        return;
      }

      const fmt = detectImportFormat(data, msgs);
      let imported: AIChatMessage[];

      if (fmt === 'v1') {
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i]!;
          if (!m.role || m.content === undefined) {
            setImportError(`Invalid message at index ${i}: missing "role" or "content".`);
            return;
          }
          if (!['user', 'assistant', 'tool_call', 'tool_result', 'thinking'].includes(String(m.role))) {
            setImportError(`Unknown role "${m.role}" at index ${i}.`);
            return;
          }
        }
        imported = msgs.map(m => ({
          role: m.role as AIChatMessage['role'],
          content: String(m.content),
          toolName: typeof m.toolName === 'string' ? m.toolName : undefined,
          toolCallId: typeof m.toolCallId === 'string' ? m.toolCallId : undefined,
          isError: typeof m.isError === 'boolean' ? m.isError : undefined,
        }));
      } else {
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i]!;
          if (!m.role) {
            setImportError(`Invalid message at index ${i}: missing "role".`);
            return;
          }
          const validRoles = ['system', 'user', 'assistant', 'tool'];
          if (!validRoles.includes(String(m.role))) {
            setImportError(`Unsupported role "${m.role}" at index ${i} for v2 format. Expected: ${validRoles.join(', ')}.`);
            return;
          }
        }
        imported = fromOpenAIFormat(msgs);
      }

      const newId = crypto.randomUUID();
      await saveChatNow({
        id: newId,
        title: file.name.replace(/\.json$/i, '') || 'Imported Chat',
        messages: imported,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setImportSuccess('Imported successfully.');
      goTo({ type: 'aiChat', sessionId: newId });
    } catch (_err) {
      setImportError('Failed to read file.');
    } finally {
      if (importFileRef.current) importFileRef.current.value = '';
    }
  }, [goTo]);

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click(); URL.revokeObjectURL(url);
  };

  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');



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

  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const handleRenameChat = useCallback(async () => {
    if (!renameTarget || !renameInput.trim()) return;
    const existing = await loadConversation(renameTarget.id);
    if (existing) {
      existing.title = renameInput.trim();
      await saveConversation(existing);
    }
    setRenameTarget(null);
    setRenameInput('');
  }, [renameTarget, renameInput, loadConversation, saveConversation]);

  const handleGuidingQuestion = useCallback(
    (q: string) => {
      void send(q);
    },
    [send],
  );

  return (
    <div ref={chatContainerRef} className="h-[calc(100dvh-3rem)] flex bg-background font-sans animate-fadeIn">
      {/* Mobile sidebar overlay with slide animation */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="ai-chat-sidebar"
            className="fixed inset-0 z-[60] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <motion.aside
              className="absolute left-0 top-0 h-full w-[280px] flex flex-col bg-surface border-r border-border shadow-lg"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
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
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setRenameTarget({ id: c.id, title: c.title }); setRenameInput(c.title); }}
                          className="text-text-secondary hover:text-primary p-0.5 transition-colors"
                          title={t('ai.renameChat')}
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteChat(e, c.id)}
                          className="text-text-secondary hover:text-red-500 p-0.5 transition-colors"
                          title={t('ai.deleteChat')}
                        >
                          <Icon name="trash-2" size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col w-[280px] flex-shrink-0 bg-surface border-r border-border"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary"><Icon name="astroid-as-AI-Button" size={18} /> {t('ai.history')}</h2>
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
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setRenameTarget({ id: c.id, title: c.title }); setRenameInput(c.title); }}
                    className="text-text-secondary hover:text-primary p-0.5 transition-colors"
                    title={t('ai.renameChat')}
                  >
                    <Icon name="pencil" size={14} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteChat(e, c.id)}
                    className="text-text-secondary hover:text-red-500 p-0.5 transition-colors"
                    title={t('ai.deleteChat')}
                  >
                    <Icon name="trash-2" size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-border bg-background flex-shrink-0">
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
              <>
                <button
                  onClick={() => {
                    const txt = messages
                      .filter(m => m.role === 'user' || m.role === 'assistant')
                      .map(m => `[${m.role === 'user' ? '▸' : '🤖'}] ${m.content}`)
                      .join('\n\n');
                    navigator.clipboard.writeText(txt).catch(() => {});
                  }}
                  className="ml-auto text-text-secondary hover:text-primary transition-colors p-1"
                  title="Copy transcript"
                >
                  <Icon name="copy" size={16} />
                </button>
                <div className="relative">
                  <button onClick={() => setExportOpen(!exportOpen)} className="text-text-secondary hover:text-primary transition-colors p-1" title="Export">
                    <Icon name="arrow-big-down" size={16} />
                  </button>
                  {exportOpen && (
                    <div className="absolute top-full right-0 mt-1 bg-white dark:bg-[#1a1a2e] border border-border rounded-lg shadow-lg z-50 py-1 min-w-[120px]" onClick={e => e.stopPropagation()}>
                      {(['json', 'html', 'md'] as const).map(f => (
                        <button key={f} onClick={() => handleExport(f)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors">{f.toUpperCase()}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { enableWidget('aiChat'); goTo({ type: 'feed' }); }}
                  className="text-text-secondary hover:text-primary transition-colors p-1 ml-0.5 hidden lg:flex"
                  title="Open in Widgets"
                  aria-label="Open in Widgets"
                >
                  <Icon name="arrow-big-right" size={16} />
                </button>
              </>
            )}
            <button
              onClick={() => importFileRef.current?.click()}
              className="text-text-secondary hover:text-primary transition-colors p-1 ml-0.5"
              title="Import JSON"
            >
              <Icon name="upload" size={16} />
            </button>
            <input ref={importFileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            {/* Import toast */}
            {importError && (
              <div role="alert" className="fixed bottom-4 right-4 bg-red-500 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-[100]">{importError}</div>
            )}
            {importSuccess && (
              <div role="status" className="fixed bottom-4 right-4 bg-green-500 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-[100]">{importSuccess}</div>
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

        {/* ── Rename chat modal ── */}
        {renameTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRenameTarget(null)}>
            <div className="bg-white dark:bg-[#1a1a2e] rounded-xl p-6 max-w-sm mx-4 border border-border shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-text-primary font-semibold text-sm mb-3">{t('ai.renameChat')}</h3>
              <input
                type="text"
                value={renameInput}
                onChange={e => setRenameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameChat(); }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-primary mb-4"
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <button onClick={() => setRenameTarget(null)} className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-surface transition-colors text-sm">{t('action.cancel')}</button>
                <button onClick={handleRenameChat} className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors text-sm">{t('action.save')}</button>
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

          {/* ── /view preview card ── */}
          {input.trimStart().startsWith('/view') && (contextPost || contextProfile) && (
            <div className="flex justify-center">
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-1.5 text-xs text-text-secondary/70 max-w-[85%] break-all">
                📋 {contextPost ? `帖子: ${contextPost}` : `用户: @${contextProfile}`}
              </div>
            </div>
          )}

          {messageGroups.map((group, gi) => {
            if (group.type === 'thinking') {
              return (
                <div key={`t${gi}`} className="mb-2">
                  <ThinkingCard
                    content={group.msg.content}
                    expanded={expandedCards.has(gi) || (loading && gi === lastStreamGroupIndex)}
                    onToggle={() => toggleCard(gi)}
                  />
                </div>
              );
            }
            if (group.type === 'tool') {
              return (
                <div key={`t${gi}`} className="mb-2">
                  <ToolCard
                    toolName={group.msg.toolName ?? ''}
                    args={group.msg.content}
                    resultContent={group.result?.content}
                    expanded={expandedCards.has(gi) || (loading && gi === lastStreamGroupIndex)}
                    onToggle={() => toggleCard(gi)}
                  />
                </div>
              );
            }
            if (group.type === 'user') {
              const userIdx = messages.slice(0, messages.indexOf(group.msg) + 1).filter(m => m.role === 'user').length - 1;
              const viewingRegex = /<currently_viewing>([\s\S]*?)<\/currently_viewing>/;
              const match = group.msg.content.match(viewingRegex);
              const cleanContent = match ? group.msg.content.replace(match[0], '').trim() : group.msg.content;
              return (
                <div key={`u${gi}`} className="flex flex-col items-end gap-1">
                  {match && (
                    <div className="flex justify-start w-full">
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-1.5 text-xs text-text-secondary/70 max-w-[85%]">
                        📋 {match[1]!.split('\n')[0]}
                      </div>
                    </div>
                  )}
                  {cleanContent && (
                    <UserMessage
                      content={cleanContent}
                      loading={loading}
                      onEdit={() => {
                        const text = editByIndex(userIdx);
                        if (text) setInput(text);
                      }}
                    />
                  )}
                </div>
              );
            }
            return (
              <AssistantMessage
                key={`a${gi}`}
                content={group.msg.content}
                isError={(group.msg as any).isError === true}
              />
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
        <div className="border-t border-border bg-background px-4 py-3">
          {pendingFile && (
            <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2">
              <img src={pendingFile.preview} alt="" className="w-12 h-12 object-cover rounded border border-border" />
              <span className="text-xs text-text-secondary">{pendingFile.file.name} ({Math.round(pendingFile.file.size / 1024)}KB)</span>
              <button onClick={() => setPendingFile(null)} className="text-xs text-red-500 hover:text-red-400">Remove</button>
            </div>
          )}
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="shrink-0 w-10 h-10 rounded-lg border border-border text-text-secondary hover:text-primary hover:border-primary transition-colors flex items-center justify-center disabled:opacity-50"
              title="Upload image"
            >
              <Icon name="plus" size={20} />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
          placeholder={t('ai.placeholder')}
          aria-label={t('a11y.aiInput')}
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
            {loading ? (
              <button
                onClick={handleStop}
                className="shrink-0 px-5 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
              >
                {t('action.stop') || 'Stop'}
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && !pendingFile}
                className="shrink-0 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {t('action.send')}
              </button>
            )}
          </div>
        </div>
      </div>
        {/* Repair toast — shown when a previously corrupted conversation was auto-fixed */}
        {wasRepaired && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs px-4 py-3 rounded-xl shadow-lg z-[100] flex items-center gap-3 animate-slideUp max-w-[90%]">
            <span className="leading-snug">{t('ai.repaired')}</span>
            <button
              onClick={() => window.location.reload()}
              className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0"
            >
              {t('action.refresh')}
            </button>
          </div>
        )}
    </div>
  );
}
