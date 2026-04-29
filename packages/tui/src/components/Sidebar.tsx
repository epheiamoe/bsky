import React from 'react';
import { Box, Text } from 'ink';
import { useI18n } from '@bsky/app';
import type { AppView } from '@bsky/app';

export interface SidebarProps {
  currentView: AppView;
  goBack: () => void;
  canGoBack: boolean;
  goHome: () => void;
  width: number;
  notifCount?: number;
}

const TAB_EMOJI: Record<string, string> = {
  feed: '📋', notifications: '🔔', search: '🔍', profile: '👤', bookmarks: '🔖', aiChat: '🤖', compose: '✏️',
};

const TAB_NAV_KEY: Record<string, string> = {
  feed: 'nav.feed', notifications: 'nav.notifications', search: 'nav.search', profile: 'nav.profile', bookmarks: 'nav.bookmarks', aiChat: 'nav.aiChat', compose: 'nav.compose',
};

const TABS = [
  { key: 'feed', shortcut: 't' },
  { key: 'notifications', shortcut: 'n' },
  { key: 'search', shortcut: 's' },
  { key: 'profile', shortcut: 'p' },
  { key: 'bookmarks', shortcut: 'b' },
  { key: 'aiChat', shortcut: 'a' },
  { key: 'compose', shortcut: 'c' },
];

const BREADCRUMB_EMOJI: Record<string, string> = {
  detail: '📄', thread: '🧵', compose: '✏️', profile: '👤', notifications: '🔔', search: '🔍', aiChat: '🤖', bookmarks: '🔖',
};

const BREADCRUMB_KEY: Record<string, string> = {
  detail: 'breadcrumb.detail', thread: 'breadcrumb.thread', compose: 'breadcrumb.compose', profile: 'breadcrumb.profile', notifications: 'breadcrumb.notifications', search: 'breadcrumb.search', aiChat: 'breadcrumb.aiChat', bookmarks: 'breadcrumb.bookmarks',
};

export function Sidebar({ currentView, goBack, canGoBack, goHome, width, notifCount = 0 }: SidebarProps) {
  const { t } = useI18n();
  const innerW = width - 2;

  return (
    <Box flexDirection="column" width={width} paddingX={0} borderStyle="single" borderColor="blue">
      <Text bold color="cyanBright">{' 🦋 Bluesky'}</Text>
      <Text dimColor>{'─'.repeat(innerW)}</Text>

      {/* Breadcrumb */}
      <Box height={1}>
        <Text dimColor>
          {currentView.type === 'feed' ? ' ' + t('breadcrumb.feed') : ' ' + viewBreadcrumb(currentView, t)}
        </Text>
      </Box>

      {/* Navigation */}
      <Box flexDirection="column" marginTop={0}>
        {TABS.map((tab) => {
          const isActive = (
            (tab.key === 'feed' && currentView.type === 'feed') ||
            (tab.key === 'notifications' && currentView.type === 'notifications') ||
            (tab.key === 'search' && currentView.type === 'search') ||
            (tab.key === 'profile' && currentView.type === 'profile') ||
            (tab.key === 'bookmarks' && currentView.type === 'bookmarks') ||
            (tab.key === 'aiChat' && currentView.type === 'aiChat') ||
            (tab.key === 'compose' && currentView.type === 'compose')
          );
          const badge = tab.key === 'notifications' && notifCount > 0 ? ` ${notifCount}` : '';
          const label = (TAB_EMOJI[tab.key] ?? '') + ' ' + t(TAB_NAV_KEY[tab.key] ?? tab.key);

          return (
            <Box key={tab.key} height={1}>
              <Text backgroundColor={isActive ? '#1e40af' : undefined} color={isActive ? 'cyanBright' : undefined}>
                {isActive ? '▶' : ' '}{label}{badge}
                <Text dimColor> [{tab.shortcut}]</Text>
              </Text>
            </Box>
          );
        })}
      </Box>

      <Text dimColor>{'─'.repeat(innerW)}</Text>
      {canGoBack && (
        <Text color="yellow" dimColor>{'← '}{t('common.escBack')}</Text>
      )}
    </Box>
  );
}

function viewBreadcrumb(v: AppView, t: (key: string) => string): string {
  const emoji = BREADCRUMB_EMOJI[v.type] ?? '';
  const key = BREADCRUMB_KEY[v.type];
  return key ? emoji + ' ' + t(key) : '';
}
