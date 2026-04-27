import React from 'react';
import { Box, Text } from 'ink';

export interface SidebarProps {
  activeTab: string;
  width: number;
  notifCount?: number;
}

const TABS = [
  { key: 'timeline', label: '📋 时间线', shortcut: 't' },
  { key: 'notifications', label: '🔔 通知', shortcut: 'n' },
  { key: 'profile', label: '👤 资料', shortcut: 'p' },
  { key: 'search', label: '🔍 搜索', shortcut: 's' },
  { key: 'ai', label: '🤖 AI', shortcut: 'a' },
  { key: 'compose', label: '✏️ 发帖', shortcut: 'c' },
];

export function Sidebar({ activeTab, width, notifCount = 0 }: SidebarProps) {
  const innerW = width - 2;
  const divider = '─'.repeat(innerW);

  return (
    <Box flexDirection="column" width={width} paddingX={0} borderStyle="single" borderColor="blue">
      <Text bold color="cyanBright">
        {' 🦋 Bluesky'}
      </Text>
      <Text dimColor>{divider}</Text>

      <Box flexDirection="column" marginTop={0}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const prefix = isActive ? '▶' : ' ';
          const label = tab.label;
          const badge = tab.key === 'notifications' && notifCount > 0
            ? ` ${notifCount}` : '';

          return (
            <Box key={tab.key} height={1}>
              <Text
                backgroundColor={isActive ? '#1e40af' : undefined}
                color={isActive ? 'cyanBright' : undefined}
              >
                {prefix}{label}{badge}
                <Text dimColor> [{tab.shortcut}]</Text>
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
