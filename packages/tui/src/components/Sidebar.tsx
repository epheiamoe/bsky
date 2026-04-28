import React from 'react';
import { Box, Text } from 'ink';
import type { AppView } from '@bsky/app';

export interface SidebarProps {
  currentView: AppView;
  goBack: () => void;
  canGoBack: boolean;
  goHome: () => void;
  width: number;
  notifCount?: number;
}

const TABS = [
  { key: 'feed', label: '📋 时间线', shortcut: 't' },
  { key: 'notifications', label: '🔔 通知', shortcut: 'n' },
  { key: 'search', label: '🔍 搜索', shortcut: 's' },
  { key: 'bookmarks', label: '🔖 书签', shortcut: 'b' },
  { key: 'aiChat', label: '🤖 AI', shortcut: 'a' },
  { key: 'compose', label: '✏️ 发帖', shortcut: 'c' },
];

export function Sidebar({ currentView, goBack, canGoBack, goHome, width, notifCount = 0 }: SidebarProps) {
  const innerW = width - 2;

  return (
    <Box flexDirection="column" width={width} paddingX={0} borderStyle="single" borderColor="blue">
      <Text bold color="cyanBright">{' 🦋 Bluesky'}</Text>
      <Text dimColor>{'─'.repeat(innerW)}</Text>

      {/* Breadcrumb */}
      <Box height={1}>
        <Text dimColor>
          {currentView.type === 'feed' ? ' 时间线' : ` ${viewBreadcrumb(currentView)}`}
        </Text>
      </Box>

      {/* Navigation */}
      <Box flexDirection="column" marginTop={0}>
        {TABS.map((tab) => {
          const isActive = (
            (tab.key === 'feed' && currentView.type === 'feed') ||
            (tab.key === 'notifications' && currentView.type === 'notifications') ||
            (tab.key === 'search' && currentView.type === 'search') ||
            (tab.key === 'bookmarks' && currentView.type === 'bookmarks') ||
            (tab.key === 'aiChat' && currentView.type === 'aiChat') ||
            (tab.key === 'compose' && currentView.type === 'compose')
          );
          const badge = tab.key === 'notifications' && notifCount > 0 ? ` ${notifCount}` : '';

          return (
            <Box key={tab.key} height={1}>
              <Text backgroundColor={isActive ? '#1e40af' : undefined} color={isActive ? 'cyanBright' : undefined}>
                {isActive ? '▶' : ' '}{tab.label}{badge}
                <Text dimColor> [{tab.shortcut}]</Text>
              </Text>
            </Box>
          );
        })}
      </Box>

      <Text dimColor>{'─'.repeat(innerW)}</Text>
      {canGoBack && (
        <Text color="yellow" dimColor>{'← Esc/Backspace 返回'}</Text>
      )}
    </Box>
  );
}

function viewBreadcrumb(v: AppView): string {
  switch (v.type) {
    case 'detail': return '📄 帖子详情';
    case 'thread': return '🧵 对话树';
    case 'compose': return '✏️ 发帖';
    case 'profile': return '👤 资料';
    case 'notifications': return '🔔 通知';
    case 'search': return '🔍 搜索';
    case 'aiChat': return '🤖 AI 对话';
    case 'bookmarks': return '🔖 书签';
    default: return '';
  }
}
