import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import { useNavigation, useAuth, useNotifications, useTimeline, usePostDetail, useThread, useCompose } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { AIConfig } from '@bsky/core';
import { Sidebar } from './Sidebar.jsx';
import { PostList } from './PostList.jsx';
import { ProfileView } from './ProfileView.jsx';
import { SearchView } from './SearchView.jsx';
import { NotifView } from './NotifView.jsx';
import { AIChatView } from './AIChatView.jsx';

interface AppConfig {
  blueskyHandle: string;
  blueskyPassword: string;
  aiConfig: AIConfig;
  targetLang?: string;
}

type FocusTarget = 'main' | 'ai' | 'compose';

export interface AppProps {
  config: AppConfig;
  isRawModeSupported?: boolean;
}

export function App({ config, isRawModeSupported = true }: AppProps) {
  const { stdout } = useStdout();
  const [cols, setCols] = useState(() => stdout?.columns ?? 80);
  const [rows, setRows] = useState(() => stdout?.rows ?? 24);
  useEffect(() => {
    const onResize = () => { setCols(stdout?.columns ?? 80); setRows(stdout?.rows ?? 24); };
    stdout?.on('resize', onResize);
    return () => { stdout?.off('resize', onResize); };
  }, [stdout]);

  const { currentView, canGoBack, goTo, goBack, goHome } = useNavigation();
  const { client, loading: authLoading, login } = useAuth();
  const { unreadCount } = useNotifications(client);

  // ── View-local state (hoisted for centralized keyboard dispatch) ──
  const { posts, loading: feedLoading, cursor, loadMore, refresh } = useTimeline(client);
  const [feedIdx, setFeedIdx] = useState(0);
  const [threadIdx, setThreadIdx] = useState(0);
  const thread = useThread(client, currentView.type === 'thread' ? (currentView as { uri: string }).uri : undefined, goTo);
  const [composeDraft, setComposeDraft] = useState('');
  const compose = useCompose(client, goBack, () => { goHome(); });
  const [focusedPanel, setFocusedPanel] = useState<FocusTarget>('main');
  const targetLang = config.targetLang ?? 'zh';

  // ── Post detail ──
  const detailUri = currentView.type === 'detail' ? (currentView as { uri: string }).uri : undefined;
  const { post, flatThread: detailThread, translate: doTranslate, actions } = usePostDetail(
    client, detailUri, goTo, config.aiConfig.apiKey, config.aiConfig.baseUrl, targetLang,
  );
  const [showTranslation, setShowTranslation] = useState(false);
  const [translations, setTranslations] = useState<Map<string, string>>(new Map());

  // Auto-login
  useEffect(() => {
    if (!authLoading) login(config.blueskyHandle, config.blueskyPassword);
  }, []);

  // ═════════════════════ CENTRALIZED KEYBOARD DISPATCHER ═════════════════════
  // Stable refs for callbacks that change too often
  const loadMoreRef = useRef(loadMore); loadMoreRef.current = loadMore;
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  const goToRef = useRef(goTo); goToRef.current = goTo;
  const goBackRef = useRef(goBack); goBackRef.current = goBack;
  const stateRef = useRef({ currentView, focusedPanel, feedIdx, threadIdx, postsLen: posts.length, detailUri });
  stateRef.current = { currentView, focusedPanel, feedIdx, threadIdx, postsLen: posts.length, detailUri };

  useEffect(() => {
    if (!isRawModeSupported) return;

    let escTimer: ReturnType<typeof setTimeout> | null = null;
    let escSeq = '';

    function flushEsc() {
      // Single Esc press — dispatch based on current view
      const s = stateRef.current;
      if (s.currentView.type === 'aiChat') {
        if (s.focusedPanel === 'ai') { setFocusedPanel('main'); }
        else { goBackRef.current(); }
      } else if (s.currentView.type === 'compose') {
        goBackRef.current();
      } else if (s.currentView.type !== 'feed') {
        goBackRef.current();
      }
      escSeq = '';
    }

    const onData = (data: Buffer) => {
      const str = data.toString();
      for (let i = 0; i < str.length; i++) {
        const ch = str[i]!;

        // ── Escape sequence detection ──
        if (ch === '\x1b') {
          // Cancel any pending single-Esc timeout
          if (escTimer) { clearTimeout(escTimer); escTimer = null; }
          escSeq = '\x1b';
          // Start timeout: if no more chars within 30ms, it's a lone Esc
          escTimer = setTimeout(flushEsc, 30);
          continue;
        }

        // Continuation of escape sequence?
        if (escSeq.startsWith('\x1b')) {
          if (escTimer) { clearTimeout(escTimer); escTimer = null; }
          escSeq += ch;
          if (escSeq === '\x1b[' && (ch >= '0' && ch <= '9' || ch === ';')) continue; // CSI params
          if (escSeq.startsWith('\x1b[') && escSeq.length >= 3) {
            const final = escSeq[escSeq.length - 1]!;
            if (final === 'A') arrowDispatch('up');
            else if (final === 'B') arrowDispatch('down');
            escSeq = '';
            continue;
          }
          escSeq = ''; // unrecognized
          continue;
        }

        // ── AI Chat mode: let TextInput handle everything except Esc (handled above) ──
        if (stateRef.current.currentView.type === 'aiChat' && stateRef.current.focusedPanel === 'ai') {
          continue; // TextInput's useInput handles all keys
        }

        // ── Ctrl keys ──
        if (ch === '\x07') { goToRef.current({ type: 'aiChat', contextUri: stateRef.current.detailUri ?? undefined }); continue; }
        if (ch === '\t') {
          if (stateRef.current.currentView.type === 'aiChat') setFocusedPanel(f => f === 'ai' ? 'main' : 'ai');
          continue;
        }

        // ── Enter ──
        if (ch === '\r' || ch === '\n') {
          enterDispatch();
          continue;
        }

        const key = ch.toLowerCase();

        // ── AI visible but main focused ──
        if (stateRef.current.currentView.type === 'aiChat' && stateRef.current.focusedPanel !== 'ai') {
          switch (key) {
            case 'a': goBackRef.current(); goToRef.current({ type: 'feed' }); continue;
            case 't': goBackRef.current(); goToRef.current({ type: 'feed' }); continue;
          }
          continue;
        }

        // ── View-specific dispatch ──
        keyDispatch(key);
      }
    };

    process.stdin.on('data', onData);
    return () => {
      process.stdin.off('data', onData);
      if (escTimer) clearTimeout(escTimer);
    };
  }, [isRawModeSupported]);

  // Stable arrow/enter/key dispatch using refs
  const arrowDispatch = useCallback((dir: 'up' | 'down') => {
    const s = stateRef.current;
    if (s.currentView.type === 'feed') {
      setFeedIdx(i => dir === 'up' ? Math.max(0, i - 1) : Math.min(s.postsLen - 1, i + 1));
    } else if (s.currentView.type === 'thread') {
      setThreadIdx(i => dir === 'up' ? Math.max(0, i - 1) : Math.min(thread.flatLines.length - 1, i + 1));
    }
  }, [thread.flatLines.length]);

  const enterDispatch = useCallback(() => {
    const s = stateRef.current;
    if (s.currentView.type === 'feed') {
      const p = posts[s.feedIdx];
      if (p) goToRef.current({ type: 'detail', uri: p.uri });
    } else if (s.currentView.type === 'thread') {
      const l = thread.flatLines[s.threadIdx];
      if (l?.uri) goToRef.current({ type: 'detail', uri: l.uri });
    } else if (s.currentView.type === 'compose') {
      if (composeDraft.trim()) { compose.submit(composeDraft.trim(), (s.currentView as { replyTo?: string }).replyTo); }
    }
  }, [posts, thread.flatLines, composeDraft, compose.submit]);

  const keyDispatch = useCallback((key: string) => {
    const s = stateRef.current;
    switch (s.currentView.type) {
      case 'feed':
        if (key === 'j') { setFeedIdx(i => Math.min(s.postsLen - 1, i + 1)); return; }
        if (key === 'k') { setFeedIdx(i => Math.max(0, i - 1)); return; }
        if (key === 'm') { loadMoreRef.current?.(); return; }
        if (key === 'r') { refreshRef.current?.(); return; }
        break;
      case 'detail':
        if (key === 'r') { goToRef.current({ type: 'compose', replyTo: s.detailUri }); return; }
        if (key === 'h' && s.detailUri) { goToRef.current({ type: 'thread', uri: s.detailUri }); return; }
        if (key === 'a' && s.detailUri) { goToRef.current({ type: 'aiChat', contextUri: s.detailUri }); return; }
        if (key === 't' && post && !showTranslation) {
          void doTranslate(post.record.text).then(t => {
            setTranslations(prev => { prev.set(post.record.text, t); return new Map(prev); });
            setShowTranslation(true);
          });
        } else if (key === 't') {
          setShowTranslation(false);
        }
        return;
      case 'thread':
        if (key === 'j') { setThreadIdx(i => Math.min(thread.flatLines.length - 1, i + 1)); return; }
        if (key === 'k') { setThreadIdx(i => Math.max(0, i - 1)); return; }
        if (key === 'r') {
          const l = thread.flatLines[s.threadIdx];
          if (l?.uri) goToRef.current({ type: 'compose', replyTo: l.uri });
        }
        return;
      case 'notifications':
        if (key === 'r') { /* TODO: refresh notifications */ }
        break;
    }
  }, [post, showTranslation, doTranslate, thread.flatLines]);

  // ── Layout ──
  const sidebarW = Math.max(16, Math.floor(cols * 0.14));
  const mainW = cols - sidebarW - 2;
  const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const onlineStatus = client ? '🟢' : '🔴';

  const renderView = () => {
    switch (currentView.type) {
      case 'feed':
        return (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="gray" paddingX={1}>
            <Box height={1}><Text bold>📋 时间线</Text><Text dimColor>{' ↑↓/jk:导航 Enter:详情 m:更多 r:刷新'}</Text></Box>
            <PostList posts={posts} loading={feedLoading} cursor={cursor} selectedIndex={feedIdx} focusedPanel="main" showAIPanel={false} width={mainW - 4} height={rows - 5} />
          </Box>
        );
      case 'detail':
        return <PostDetailView post={post} loading={feedLoading} detailThread={detailThread} showTranslation={showTranslation} translation={translations.get(post?.record.text ?? '')} targetLang={targetLang} cols={mainW} />;
      case 'thread':
        return <ThreadViewRender flatLines={thread.flatLines} loading={thread.loading} focusedIndex={threadIdx} cols={mainW} rows={rows} />;
      case 'compose':
        return <ComposeViewRender draft={composeDraft} setDraft={setComposeDraft} submitting={compose.submitting} error={compose.error} replyTo={(currentView as { replyTo?: string }).replyTo} cols={mainW} />;
      case 'profile':
        return <ProfileView client={client} actor={(currentView as { actor: string }).actor} goBack={goBack} cols={mainW} />;
      case 'notifications':
        return <NotifView client={client} goBack={goBack} cols={mainW} />;
      case 'search':
        return <SearchView client={client} query={(currentView as { query?: string }).query} goBack={goBack} cols={mainW} rows={rows} goTo={goTo} />;
      case 'aiChat':
        return <AIChatView client={client} aiConfig={config.aiConfig} contextUri={(currentView as { contextUri?: string }).contextUri} goBack={goBack} cols={Math.max(32, Math.floor(cols * 0.35))} rows={rows} focused={focusedPanel === 'ai'} />;
      default:
        return <Text>Unknown view</Text>;
    }
  };

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box width={cols} height={1}>
        <Text backgroundColor="#1a56db" color="white" bold>{' 🦋 Bluesky '}</Text>
        <Text backgroundColor="#1a56db" color="white">{' @'}{config.blueskyHandle}{' '}</Text>
        <Text backgroundColor="#1a56db" color="cyanBright">{onlineStatus}</Text>
        <Box flexGrow={1}><Text backgroundColor="#1a56db">{' '}</Text></Box>
        {currentView.type !== 'feed' && <Text backgroundColor="#1a56db" color="yellow">{'  '}{viewLabel(currentView)}{' '}</Text>}
        <Box flexGrow={1}><Text backgroundColor="#1a56db">{' '}</Text></Box>
        <Text backgroundColor="#1a56db" color="gray" dimColor>{timeStr}{' '}</Text>
      </Box>
      <Box flexDirection="row" flexGrow={1}>
        <Sidebar currentView={currentView} goBack={goBack} canGoBack={canGoBack} goHome={goHome} width={sidebarW} notifCount={unreadCount} />
        {authLoading ? (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>正在登录 Bluesky...</Text></Box>
        ) : renderView()}
      </Box>
      <Box width={cols} height={1}>
        <Text backgroundColor="#1a56db" color="white" dimColor>{footerHint(currentView, canGoBack)}</Text>
        <Box flexGrow={1}><Text backgroundColor="#1a56db">{' '}</Text></Box>
        <Text backgroundColor="#1a56db" color="white" dimColor>{timeStr}{' '}</Text>
      </Box>
      {!isRawModeSupported && (
        <Box width={cols} height={1}><Text backgroundColor="#92400e" color="yellow">⚠ 当前终端不支持 raw mode。请在 Windows Terminal / iTerm2 中运行。</Text></Box>
      )}
    </Box>
  );
}

// ── Lightweight render wrappers (no stdin handlers) ──

function PostDetailView({ post, loading, detailThread, showTranslation, translation, targetLang, cols }: {
  post: ReturnType<typeof usePostDetail>['post'];
  loading: boolean;
  detailThread: string;
  showTranslation: boolean;
  translation: string | undefined;
  targetLang: string;
  cols: number;
}) {
  const TL = useRef<Record<string, string>>({ zh: '中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español' }).current;
  if (loading || !post) return <Box width={cols} paddingX={1}><Text dimColor>加载中...</Text></Box>;

  const postText = post.record.text;
  const displayName = post.author.displayName || post.author.handle;

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Box><Text bold color="cyan">{displayName}</Text><Text dimColor>{' @'}{post.author.handle}</Text></Box>
        <Text dimColor>{post.indexedAt ? new Date(post.indexedAt).toLocaleString('zh-CN') : ''}</Text>
      </Box>
      <Box flexDirection="column" marginY={1} paddingX={1}>
        <Box borderStyle="single" borderColor="blue" padding={1}><Text>{postText}</Text></Box>
        {showTranslation && translation && (
          <Box marginTop={0} paddingX={2}><Text color="yellow" dimColor>{TL[targetLang] ?? targetLang}：</Text><Text color="yellow">{translation}</Text></Box>
        )}
      </Box>
      <Box marginBottom={1}><Text color="blue">{'♥ '}{post.likeCount ?? 0}</Text><Text>{'  ♺ '}{post.repostCount ?? 0}</Text><Text>{'  💬 '}{post.replyCount ?? 0}</Text></Box>
      <Box marginBottom={1}>
        <Text backgroundColor="#1e40af" color="white">{' [R] 回复 '}</Text><Text>{' '}</Text>
        <Text backgroundColor={showTranslation ? '#1e40af' : '#374151'} color="white">{' [T] '}{TL[targetLang] ?? '翻译'} {' '}</Text><Text>{' '}</Text>
        <Text backgroundColor="#374151" color="white">{' [H] 展开对话 '}</Text><Text>{' '}</Text>
        <Text backgroundColor="#374151" color="white">{' [A] AI分析 '}</Text>
      </Box>
      {detailThread && (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
          <Text dimColor>对话预览：</Text>
          {detailThread.split('\n').slice(0, 10).map((line, i) => <Text key={i} dimColor>{line.slice(0, cols - 4)}</Text>)}
        </Box>
      )}
    </Box>
  );
}

function ThreadViewRender({ flatLines, loading, focusedIndex, cols, rows }: {
  flatLines: ReturnType<typeof useThread>['flatLines'];
  loading: boolean;
  focusedIndex: number;
  cols: number;
  rows: number;
}) {
  const visibleLines = Math.max(5, rows - 5);
  const startIdx = Math.floor(focusedIndex / visibleLines) * visibleLines;
  const showLines = flatLines.slice(startIdx, startIdx + visibleLines);

  if (loading) return <Box width={cols} paddingX={1}><Text dimColor>加载对话树...</Text></Box>;

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box height={1}><Text bold>🧵 对话树</Text><Text dimColor>{' ↑↓/jk:导航 Enter:聚焦此帖 R:回复 Esc:返回'}</Text></Box>
      <Box flexDirection="column" flexGrow={1}>
        {showLines.map((line, i) => {
          const globalIdx = startIdx + i;
          const isFocused = globalIdx === focusedIndex;
          const indent = '  '.repeat(Math.max(0, line.depth));
          let branch = '';
          if (line.depth > 0) branch = '↳ ';
          if (line.depth < 0) branch = '↰ ';
          return (
            <Box key={`${line.uri}-${globalIdx}`} height={2} flexDirection="column">
              <Box>
                <Text color={isFocused ? 'cyanBright' : 'blue'}>{isFocused ? '▐' : '│'}</Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined}>{indent}{branch}</Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined} color={isFocused ? 'cyanBright' : 'green'} bold={isFocused}>{line.displayName}</Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined} dimColor>{' @'}{line.handle}</Text>
                <Text dimColor>{' '}{line.mediaTags.join(' ')}</Text>
              </Box>
              <Box>
                <Text color={isFocused ? 'cyanBright' : 'blue'}>{isFocused ? '▐' : '│'}</Text>
                <Text backgroundColor={isFocused ? '#1e40af' : undefined}>{' '}{line.text}{line.hasReplies ? ' [+]' : ''}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function ComposeViewRender({ draft, setDraft, submitting, error, replyTo, cols }: {
  draft: string; setDraft: (s: string) => void; submitting: boolean; error: string | null; replyTo?: string; cols: number;
}) {
  const remaining = 300 - draft.length;
  const counterColor = remaining < 20 ? 'red' : remaining < 50 ? 'yellow' : undefined;
  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
      <Box height={1}><Text bold color="yellow">{replyTo ? '✏️ 回复' : '✏️ 发帖'}</Text><Text dimColor>{' Enter 发送 · Esc 取消 · 最多 300 字符'}</Text></Box>
      {replyTo && <Box marginTop={0}><Text dimColor>回复: </Text><Text color="blue">{replyTo}</Text></Box>}
      <Box borderStyle="single" borderColor="gray" padding={1} marginTop={0}>
        <Text>{draft || ' '}</Text>
      </Box>
      <Box height={1}>
        <Text color={counterColor}>{draft.length}/300</Text>
        {draft.length > 280 && <Text color="yellow"> ⚠ 接近上限</Text>}
        {submitting && <Text color="cyan"> 发送中...</Text>}
        {error && <Text color="red">{' '}{error}</Text>}
      </Box>
    </Box>
  );
}

function viewLabel(v: { type: string }): string {
  const labels: Record<string, string> = { feed: '📋 时间线', detail: '📄 帖子', thread: '🧵 对话', compose: '✏️ 发帖', profile: '👤 资料', notifications: '🔔 通知', search: '🔍 搜索', aiChat: '🤖 AI' };
  return labels[v.type] ?? v.type;
}

function footerHint(v: { type: string }, canGoBack: boolean): string {
  const esc = canGoBack ? ' Esc:返回' : '';
  const hints: Record<string, string> = {
    feed: `${esc} ↑↓/jk:导航 Enter:详情 m:更多 r:刷新`,
    detail: `${esc} R:回复 T:翻译 H:展开对话 A:AI`,
    thread: `${esc} ↑↓/jk:移动 Enter:聚焦 R:回复`,
    compose: `${esc} Enter:发送`,
    notifications: `${esc} R:刷新`,
    aiChat: `${esc} Enter:发送 Tab:切面板`,
  };
  return hints[v.type] ?? esc;
}
