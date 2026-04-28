import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout, useInput } from 'ink';
import { useNavigation, useAuth, useNotifications, useTimeline, useCompose } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { AIConfig } from '@bsky/core';
import { Sidebar } from './Sidebar.jsx';
import { PostList } from './PostList.jsx';
import { ProfileView } from './ProfileView.jsx';
import { SearchView } from './SearchView.jsx';
import { NotifView } from './NotifView.jsx';
import { AIChatView } from './AIChatView.jsx';
import { UnifiedThreadView } from './UnifiedThreadView.jsx';

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

  // Feed
  const { posts, loading: feedLoading, cursor, loadMore, refresh } = useTimeline(client);
  const [feedIdx, setFeedIdx] = useState(0);

  // Thread
  const threadUri = currentView.type === 'thread' ? (currentView as { uri: string }).uri : undefined;
  const [threadKey, setThreadKey] = useState(0);

  // Compose
  const compose = useCompose(client, goBack, () => { goHome(); });
  const [composeDraft, setComposeDraft] = useState('');

  // AI
  const [focusedPanel, setFocusedPanel] = useState<FocusTarget>('main');

  // Auto-login
  useEffect(() => {
    if (!authLoading) login(config.blueskyHandle, config.blueskyPassword);
  }, []);

  // ═════════════════════ KEYBOARD ═════════════════════
  useInput((input, key) => {
    // Tab / Esc — always processed
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
    if (currentView.type === 'aiChat' && focusedPanel === 'ai') return;

    // Arrows — only feed; thread/view-specific arrows handled by child useInput
    if (key.upArrow && currentView.type === 'feed') { setFeedIdx(i => Math.max(0, i - 1)); return; }
    if (key.downArrow && currentView.type === 'feed') { setFeedIdx(i => Math.min(posts.length - 1, i + 1)); return; }

    // Enter — only feed + compose; thread Enter handled by UnifiedThreadView
    if (key.return) {
      if (currentView.type === 'feed') {
        const p = posts[feedIdx];
        if (p) goTo({ type: 'thread', uri: p.uri });
        return;
      }
      if (currentView.type === 'compose') {
        if (composeDraft.trim()) compose.submit(composeDraft.trim(), (currentView as { replyTo?: string }).replyTo);
        return;
      }
      return;
    }

    // Ctrl+G
    if (input === '\x07') { goTo({ type: 'aiChat', contextUri: threadUri ?? undefined }); return; }

    const k = input.toLowerCase();
    if (!k) return;

    if (currentView.type === 'aiChat' && focusedPanel === 'main') {
      if (k === 'a' || k === 't') { goBack(); goTo({ type: 'feed' }); }
      return;
    }

    // ── Global navigation shortcuts (work from any view) ──
    if (k === 't') { goHome(); return; }
    if (k === 'n') { goTo({ type: 'notifications' }); return; }
    if (k === 'p') { goTo({ type: 'profile', actor: config.blueskyHandle }); return; }
    if (k === 's') { goTo({ type: 'search' }); return; }
    if (k === 'a') { goTo({ type: 'aiChat' }); return; }
    if (k === 'c') { goTo({ type: 'compose' }); return; }

    // ── Feed-specific ──
    if (currentView.type === 'feed') {
      if (k === 'j') setFeedIdx(i => Math.min(posts.length - 1, i + 1));
      else if (k === 'k') setFeedIdx(i => Math.max(0, i - 1));
      else if (k === 'm') loadMore?.();
      else if (k === 'r') refresh?.();
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
            <Box height={1}><Text bold>📋 时间线</Text><Text dimColor>{' ↑↓/jk:导航 Enter:查看 m:更多 r:刷新'}</Text></Box>
            <PostList posts={posts} loading={feedLoading} cursor={cursor} selectedIndex={feedIdx} width={mainW - 4} height={rows - 5} />
          </Box>
        );
      case 'thread':
        return (
          <UnifiedThreadView
            key={threadKey}
            client={client}
            uri={(currentView as { uri: string }).uri}
            goBack={goBack}
            goTo={(v) => goTo(v as AppView)}
            refreshThread={(newUri) => { goTo({ type: 'thread', uri: newUri }); setThreadKey(k => k + 1); }}
            cols={mainW}
          />
        );
      case 'compose':
        return (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
            <Box height={1}><Text bold color="yellow">{(currentView as { replyTo?: string }).replyTo ? '✏️ 回复' : '✏️ 发帖'}</Text><Text dimColor>{' Enter 发送 · Esc 取消 · 最多 300 字符'}</Text></Box>
            {(currentView as { replyTo?: string }).replyTo && <Box><Text dimColor>回复: </Text><Text color="blue">{(currentView as { replyTo: string }).replyTo}</Text></Box>}
            <Box borderStyle="single" borderColor="gray" padding={1} marginTop={0}><Text>{composeDraft || ' '}</Text></Box>
            <Box height={1}>
              <Text color={composeDraft.length > 280 ? 'yellow' : undefined}>{composeDraft.length}/300</Text>
              {compose.submitting && <Text color="cyan"> 发送中...</Text>}
              {compose.error && <Text color="red">{' '}{compose.error}</Text>}
            </Box>
          </Box>
        );
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

function viewLabel(v: { type: string }): string {
  const labels: Record<string, string> = { feed: '📋 时间线', thread: '🧵 讨论', compose: '✏️ 发帖', profile: '👤 资料', notifications: '🔔 通知', search: '🔍 搜索', aiChat: '🤖 AI' };
  return labels[v.type] ?? v.type;
}

function footerHint(v: { type: string }, canGoBack: boolean): string {
  const esc = canGoBack ? ' Esc:返回' : '';
  const hints: Record<string, string> = {
    feed: `${esc} ↑↓/jk:导航 Enter:查看 m:更多 r:刷新`,
    thread: `${esc} h:主题帖 ↑↓/jk:移动 Enter:聚焦 c:回复 l:赞 r:转发`,
    compose: `${esc} Enter:发送`,
    profile: `${esc}`,
    notifications: `${esc} R:刷新`,
    search: `${esc}`,
    aiChat: `${esc} Enter:发送 Tab:切面板`,
  };
  return hints[v.type] ?? esc;
}
