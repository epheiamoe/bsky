import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { useNavigation, useAuth, useNotifications } from '@bsky/app';
import type { AIConfig } from '@bsky/core';
import { Sidebar } from './Sidebar.jsx';
import { FeedView } from './FeedView.jsx';
import { PostDetail } from './PostDetail.jsx';
import { ThreadView } from './ThreadView.jsx';
import { ComposeView } from './ComposeView.jsx';
import { ProfileView } from './ProfileView.jsx';
import { SearchView } from './SearchView.jsx';
import { NotifView } from './NotifView.jsx';
import { AIPanel } from './AIPanel.jsx';

interface AppConfig {
  blueskyHandle: string;
  blueskyPassword: string;
  aiConfig: AIConfig;
}

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

  // Auto-login
  useEffect(() => {
    if (!authLoading) login(config.blueskyHandle, config.blueskyPassword);
  }, []);

  const sidebarW = Math.max(16, Math.floor(cols * 0.14));
  const mainW = cols - sidebarW - 2;
  const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const onlineStatus = client ? '🟢' : '🔴';

  const renderView = () => {
    switch (currentView.type) {
      case 'feed':     return <FeedView     client={client} goTo={goTo} cols={mainW} rows={rows} isRawModeSupported={isRawModeSupported} />;
      case 'detail':   return <PostDetail   client={client} uri={currentView.uri} goTo={goTo} goBack={goBack} cols={mainW} rows={rows} aiConfig={config.aiConfig} />;
      case 'thread':   return <ThreadView   client={client} uri={currentView.uri} goTo={goTo} goBack={goBack} cols={mainW} rows={rows} />;
      case 'compose':  return <ComposeView  client={client} replyTo={currentView.replyTo} goBack={goBack} cols={mainW} />;
      case 'profile':  return <ProfileView  client={client} actor={currentView.actor} goBack={goBack} cols={mainW} />;
      case 'notifications': return <NotifView client={client} goBack={goBack} cols={mainW} />;
      case 'search':   return <SearchView   client={client} query={currentView.query} goBack={goBack} cols={mainW} rows={rows} goTo={goTo} />;
      case 'aiChat':   return <AIPanel       assistant={null} postContext={currentView.contextUri} onClose={goBack} focused={true} width={Math.max(32, Math.floor(cols * 0.35))} visible={true} />;
      default:         return <Text>Unknown view</Text>;
    }
  };

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      {/* Header */}
      <Box width={cols} height={1}>
        <Text backgroundColor="#1a56db" color="white" bold>{' 🦋 Bluesky '}</Text>
        <Text backgroundColor="#1a56db" color="white">{' @'}{config.blueskyHandle}{' '}</Text>
        <Text backgroundColor="#1a56db" color="cyanBright">{onlineStatus}</Text>
        <Box flexGrow={1}><Text backgroundColor="#1a56db">{' '}</Text></Box>
        {currentView.type !== 'feed' && <Text backgroundColor="#1a56db" color="yellow">{'  '}{viewLabel(currentView)}{' '}</Text>}
        <Box flexGrow={1}><Text backgroundColor="#1a56db">{' '}</Text></Box>
        <Text backgroundColor="#1a56db" color="gray" dimColor>{timeStr}{' '}</Text>
      </Box>

      {/* Body */}
      <Box flexDirection="row" flexGrow={1}>
        <Sidebar currentView={currentView} goBack={goBack} canGoBack={canGoBack} goHome={goHome} width={sidebarW} notifCount={unreadCount} />
        {authLoading ? (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="gray" paddingX={1}>
            <Text dimColor>正在登录 Bluesky...</Text>
          </Box>
        ) : (
          renderView()
        )}
      </Box>

      {/* Footer */}
      <Box width={cols} height={1}>
        <Text backgroundColor="#1a56db" color="white" dimColor>
          {' Esc:返回 '}{canGoBack ? 'Backspace:后退 ' : ''}{'Tab:切换焦点'}
        </Text>
      </Box>

      {!isRawModeSupported && (
        <Box width={cols} height={1}>
          <Text backgroundColor="#92400e" color="yellow">⚠ 当前终端不支持 raw mode。请在 Windows Terminal / iTerm2 中运行。</Text>
        </Box>
      )}
    </Box>
  );
}

function viewLabel(v: { type: string }): string {
  const labels: Record<string, string> = {
    feed: '📋 时间线', detail: '📄 帖子', thread: '🧵 对话', compose: '✏️ 发帖',
    profile: '👤 资料', notifications: '🔔 通知', search: '🔍 搜索', aiChat: '🤖 AI',
  };
  return labels[v.type] ?? v.type;
}
