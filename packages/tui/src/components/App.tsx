import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useStdout, useInput } from 'ink';
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

  // ═════════════════════ CENTRALIZED KEYBOARD DISPATCHER (useInput) ═════════════════════
  useInput((input, key) => {
    // Tab and Esc always work, even when AI panel is focused
    if (key.tab) {
      if (currentView.type === 'aiChat') setFocusedPanel(f => f === 'ai' ? 'main' : 'ai');
      return;
    }
    if (key.escape) {
      if (currentView.type === 'aiChat') {
        if (focusedPanel === 'ai') { setFocusedPanel('main'); return; }
        goBack(); return;
      }
      if (currentView.type === 'compose') { goBack(); return; }
      if (currentView.type !== 'feed') { goBack(); return; }
      return;
    }

    // AI Chat mode with AI focused: let TextInput handle all other keys
    if (currentView.type === 'aiChat' && focusedPanel === 'ai') return;

    // Arrow keys
    if (key.upArrow) {
      if (currentView.type === 'feed') setFeedIdx(i => Math.max(0, i - 1));
      else if (currentView.type === 'thread') setThreadIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      if (currentView.type === 'feed') setFeedIdx(i => Math.min(posts.length - 1, i + 1));
      else if (currentView.type === 'thread') setThreadIdx(i => Math.min(thread.flatLines.length - 1, i + 1));
      return;
    }

    // Enter
    if (key.return) {
      if (currentView.type === 'feed') {
        const p = posts[feedIdx];
        if (p) goTo({ type: 'detail', uri: p.uri });
      } else if (currentView.type === 'thread') {
        const l = thread.flatLines[threadIdx];
        if (l?.uri) goTo({ type: 'detail', uri: l.uri });
      } else if (currentView.type === 'compose') {
        if (composeDraft.trim()) compose.submit(composeDraft.trim(), (currentView as { replyTo?: string }).replyTo);
      }
      return;
    }

    // Ctrl+G
    if (input === '\x07') {
      goTo({ type: 'aiChat', contextUri: detailUri ?? undefined });
      return;
    }

    // Single char keys
    const k = input.toLowerCase();
    if (!k) return;

    // AI visible but main has focus
    if (currentView.type === 'aiChat' && focusedPanel === 'main') {
      if (k === 'a' || k === 't') { goBack(); goTo({ type: 'feed' }); }
      return;
    }

    // View-specific
    switch (currentView.type) {
      case 'feed':
        if (k === 'j') setFeedIdx(i => Math.min(posts.length - 1, i + 1));
        else if (k === 'k') setFeedIdx(i => Math.max(0, i - 1));
        else if (k === 'm') loadMore?.();
        else if (k === 'r') refresh?.();
        break;
      case 'detail':
        if (k === 'r') goTo({ type: 'compose', replyTo: detailUri });
        else if (k === 'h' && detailUri) goTo({ type: 'thread', uri: detailUri });
        else if (k === 'a' && detailUri) goTo({ type: 'aiChat', contextUri: detailUri });
        else if (k === 't' && post && !showTranslation) {
          void doTranslate(post.record.text).then(t => {
            setTranslations(prev => { prev.set(post.record.text, t); return new Map(prev); });
            setShowTranslation(true);
          });
        } else if (k === 't') setShowTranslation(false);
        break;
      case 'thread':
        if (k === 'j') setThreadIdx(i => Math.min(thread.flatLines.length - 1, i + 1));
        else if (k === 'k') setThreadIdx(i => Math.max(0, i - 1));
        else if (k === 'r') {
          const l = thread.flatLines[threadIdx];
          if (l?.uri) goTo({ type: 'compose', replyTo: l.uri });
        }
        break;
    }
  });

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
        return <AIChatView client={client} aiConfig={config.aiConfig} contextUri={(currentView as { contextUri?: string }).contextUri} goBack={goBack} cols={mainW} rows={rows} focused={focusedPanel === 'ai'} />;
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
