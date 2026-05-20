import React, { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAIChat, useChatHistory, useI18n, enableWidget, saveChatNow } from '@bsky/app';
import { getAppConfig } from '../hooks/useAppConfig.js';
import type { AIChatMessage } from '@bsky/app';
import type { BskyClient, AIConfig } from '@bsky/core';
import { formatTime } from '../utils/format.js';
import { Icon } from './Icon.js';
import { MobileHeaderCtx } from './Layout.js';
import { ThinkingCard, ToolCard, UserMessage, AssistantMessage } from './ai/index.js';
import { WorkspaceModal } from './WorkspaceModal.js';
import { getDefaultWorkspaceStorage } from '@bsky/app';
import { PyodideSandbox } from '../services/pyodide-sandbox.js';
import { setGlobalPythonSandbox, getGlobalPythonSandbox } from '@bsky/core';

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
  userDisplayName?: string;
}

export function AIChatPage({ client, aiConfig, sessionId, contextPost, contextProfile, contextUri, goTo, goBack, userDisplayName }: AIChatPageProps) {
  const { t, locale } = useI18n();
  const { onSidebarOpen: onAppSidebarOpen, dmCount } = useContext(MobileHeaderCtx);
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
    userDisplayName,
    userPronouns: getAppConfig().userPronouns,
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; preview: string; workspaceId?: string } | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const visionEnabled = aiConfig.visionEnabled ?? false;
  const [aiConsent, setAiConsent] = useState(() => localStorage.getItem('bsky_ai_consent') === '1');
  const [sandboxInit, setSandboxInit] = useState<{ active: boolean; progress: number; message: string }>({ active: false, progress: 0, message: '' });

  // Scroll refs — user-controlled
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Initialize Python sandbox — lazy init, background loading
  useEffect(() => {
    const sandbox = new PyodideSandbox();
    sandbox.setClient(client);
    setGlobalPythonSandbox(sandbox);
    return () => {
      sandbox.dispose();
    };
  }, [client]);

  // Sync current chat session ID with sandbox for workspace file isolation
  useEffect(() => {
    const sandbox = getGlobalPythonSandbox();
    if (sandbox instanceof PyodideSandbox) {
      sandbox.setCurrentChatId(sessionId);
    }
  }, [sessionId]);

  // Track sandbox initialization progress via callback
  useEffect(() => {
    const sandbox = getGlobalPythonSandbox();
    if (sandbox instanceof PyodideSandbox) {
      sandbox.setOnProgress((msg) => {
        if (msg.stage === 'ready') {
          setSandboxInit({ active: false, progress: 1, message: '' });
        } else {
          setSandboxInit({ active: true, progress: msg.progress, message: msg.message });
        }
      });
    }
  }, []);

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

  // File upload handler — supports images (preview) and any file type (workspace)
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      setPendingFile({ file, preview: URL.createObjectURL(file) });
    } else {
      // Save non-image files to workspace
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const id = crypto.randomUUID();
        const storage = getDefaultWorkspaceStorage();
        await storage.saveFile({
          id,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          data,
          uploadedAt: new Date().toISOString(),
          chatId: sessionId,
        });
        setPendingFile({ file, preview: '', workspaceId: id });
        setImportSuccess(`已保存到工作区: ${file.name}`);
        setTimeout(() => setImportSuccess(null), 3000);
      } catch (err) {
        console.error('Failed to save file to workspace:', err);
        setImportError(`保存到工作区失败: ${file.name}`);
        setTimeout(() => setImportError(null), 3000);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [sessionId]);

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
      if (pendingFile.workspaceId) {
        // Non-image file saved to workspace — reference it in message
        const ref = `[文件: /workspace/data/${pendingFile.file.name}]`;
        void send(text + '\n\n' + ref);
      } else {
        // Image file — use existing image upload flow
        const data = new Uint8Array(await pendingFile.file.arrayBuffer());
        const idx = addUserImage(data, pendingFile.file.type || 'image/jpeg', '');
        const ref = `[图片: index=${idx}]`;
        void send(text + '\n\n' + ref);
      }
      setInput('');
      setPendingFile(null);
    } else {
      void send(text);
      setInput('');
    }
    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
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
    // Also abort sandbox initialization if in progress
    const sandbox = getGlobalPythonSandbox();
    if (sandbox instanceof PyodideSandbox) {
      sandbox.abort();
    }
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
    setMenuOpen(false);
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
    <div ref={chatContainerRef} className="h-dvh md:h-[calc(100dvh-3rem)] flex bg-background font-sans animate-fadeIn">
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
        <header className="sticky top-0 z-10 flex items-center gap-1 px-2 py-3 border-b border-border bg-background flex-shrink-0">
          <button
            onClick={onAppSidebarOpen}
            className="md:hidden text-text-secondary hover:text-text-primary p-1 transition-colors relative"
            aria-label={t('nav.menu')}
          >
            <Icon name="menu" size={20} />
            {dmCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />}
          </button>
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
            <Icon name="clock" size={20} />
          </button>
          <div className="flex items-center gap-1 min-w-0">
            <h1 className="text-base font-semibold text-text-primary truncate">{t('nav.aiChat')}</h1>
            {messages.length > 0 ? (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="text-text-secondary hover:text-text-primary transition-colors p-1"
                  title="More"
                  aria-label="More"
                >
                  <Icon name="ellipsis" size={16} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-[#1a1a2e] border border-border rounded-lg shadow-lg z-50 py-1 min-w-[140px]">
                      <button
                        onClick={() => {
                          const txt = messages
                            .filter(m => m.role === 'user' || m.role === 'assistant')
                            .map(m => `[${m.role === 'user' ? '▸' : '🤖'}] ${m.content}`)
                            .join('\n\n');
                          navigator.clipboard.writeText(txt).catch(() => {});
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors"
                      >
                        Copy transcript
                      </button>
                      {(['json', 'html', 'md'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => { handleExport(f); setMenuOpen(false); }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors"
                        >
                          Export {f.toUpperCase()}
                        </button>
                      ))}
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={() => { importFileRef.current?.click(); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors"
                      >
                        Import JSON
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={() => importFileRef.current?.click()}
                className="md:hidden text-text-secondary hover:text-text-primary transition-colors p-1"
                title="Import JSON"
              >
                <Icon name="upload" size={16} />
              </button>
            )}
            <input ref={importFileRef} type="file" accept=".json" onChange={handleImport} className="hidden" aria-label="Import chat" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            {contextUri && (
              <span className="text-xs text-text-secondary bg-surface border border-border rounded-full px-2.5 py-0.5 truncate max-w-[200px]">
                <Icon name="pin" size={14} /> {contextUri.split('/').pop()}
              </span>
            )}
          </div>
          {/* Import toast */}
          {importError && (
            <div role="alert" className="fixed bottom-4 right-4 bg-red-500 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-[100]">{importError}</div>
          )}
          {importSuccess && (
            <div role="status" className="fixed bottom-4 right-4 bg-green-500 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-[100]">{importSuccess}</div>
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
        {/* Sandbox initialization banner */}
        {sandboxInit.active && (
          <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-2 text-sm text-blue-400 flex items-center gap-2 shrink-0"
               role="status" aria-live="polite">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{sandboxInit.message}</span>
          </div>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 pt-4 pb-14 space-y-1"
        >
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              {!aiConsent ? (
                <div className="max-w-sm space-y-4">
                  <Icon name="badge-info" size={32} className="text-primary mx-auto" />
                  <p className="text-base font-semibold text-text-primary">{t('ai.consentTitle')}</p>
                  <p className="text-sm text-text-secondary leading-relaxed">{t('ai.consentDesc')}</p>
                  <button
                    onClick={() => {
                      localStorage.setItem('bsky_ai_consent', '1');
                      setAiConsent(true);
                    }}
                    className="w-full py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
                  >
                    {t('ai.consentAccept')}
                  </button>
                </div>
              ) : guidingQuestions.length > 0 ? (
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
                    chatId={sessionId}
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
              {pendingFile.preview ? (
                <img src={pendingFile.preview} alt="" className="w-12 h-12 object-cover rounded border border-border" />
              ) : (
                <div className="w-12 h-12 rounded border border-border flex items-center justify-center bg-surface">
                  <Icon name="file-text" size={20} className="text-text-secondary" />
                </div>
              )}
              <span className="text-xs text-text-secondary">{pendingFile.file.name} ({Math.round(pendingFile.file.size / 1024)}KB)</span>
              <button onClick={() => setPendingFile(null)} className="text-xs text-red-500 hover:text-red-400">{t('action.remove') || 'Remove'}</button>
            </div>
          )}
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <input ref={fileInputRef} type="file" accept="image/*,*/*" onChange={handleFileSelect} className="hidden" aria-label={t('a11y.uploadFile')} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="shrink-0 w-10 h-10 rounded-lg border border-border text-text-secondary hover:text-primary hover:border-primary transition-colors flex items-center justify-center disabled:opacity-50"
              title={t('a11y.uploadFile') || 'Upload file'}
            >
              <Icon name="paperclip" size={20} />
            </button>
            <button
              onClick={() => setWorkspaceOpen(true)}
              disabled={loading}
              className="shrink-0 w-10 h-10 rounded-lg border border-border text-text-secondary hover:text-primary hover:border-primary transition-colors flex items-center justify-center disabled:opacity-50"
              title={t('workspace.open') || 'Open workspace'}
              aria-label={t('workspace.open') || 'Open workspace'}
            >
              <Icon name="database" size={20} />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (e.target.value === '') {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                }
              }}
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

      {/* Workspace Modal */}
      <WorkspaceModal open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} chatId={sessionId} />

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
