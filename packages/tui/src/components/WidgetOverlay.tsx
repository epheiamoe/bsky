import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { BskyClient } from '@bsky/core';
import { useI18n } from '@bsky/app';
import type { Locale } from '@bsky/app';
import { AIChatWidget } from './widgets/AIChatWidget.js';
import { PolishWidget } from './widgets/PolishWidget.js';

interface WidgetOverlayProps {
  open: boolean;
  onClose: () => void;
  viewType: string;
  client: BskyClient | null;
  goTo: (v: any) => void;
  cols: number;
  rows: number;
}

interface WidgetDef {
  id: string;
  title: string;
  available: boolean;
  component: React.ReactNode;
}

export function WidgetOverlay({ open, onClose, viewType, client, goTo, cols, rows }: WidgetOverlayProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { t } = useI18n();

  const overlayW = Math.floor(cols * 0.8);
  const overlayH = Math.floor(rows * 0.8);

  const widgets: WidgetDef[] = [
    {
      id: 'aiChat',
      title: '🤖 ' + t('widget.aiChatTitle'),
      available: true,
      component: (
        <AIChatWidget
          client={client}
          goTo={goTo}
          onClose={onClose}
          cols={overlayW - 4}
          rows={overlayH - 6}
        />
      ),
    },
    {
      id: 'polish',
      title: '✨ ' + t('widget.polishTitle'),
      available: viewType === 'compose',
      component: (
        <PolishWidget
          client={client}
          onClose={onClose}
          cols={overlayW - 4}
        />
      ),
    },
    // TODO: Deferred widgets
    // {
    //   id: 'suggestedFollows',
    //   title: '👥 Suggested Follows',
    //   available: true,
    //   component: <Text dimColor>Coming soon</Text>,
    // },
    // {
    //   id: 'suggestedFeeds',
    //   title: '📰 Suggested Feeds',
    //   available: true,
    //   component: <Text dimColor>Coming soon</Text>,
    // },
    // {
    //   id: 'trends',
    //   title: '🔥 Trends',
    //   available: true,
    //   component: <Text dimColor>Coming soon</Text>,
    // },
    // {
    //   id: 'profilePreview',
    //   title: '👤 Profile Preview',
    //   available: true,
    //   component: <Text dimColor>Coming soon</Text>,
    // },
  ];

  const availableWidgets = widgets.filter(w => w.available);

  useInput((input, key) => {
    if (!open) return;

    if (key.escape || input === 'q' || input === 'Q') {
      onClose();
      return;
    }

    if (key.upArrow || input === 'k' || input === 'K') {
      setSelectedIdx(i => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow || input === 'j' || input === 'J') {
      setSelectedIdx(i => Math.min(availableWidgets.length - 1, i + 1));
      return;
    }

    if (key.return) {
      const widget = availableWidgets[selectedIdx];
      if (widget) {
        setExpandedId(prev => (prev === widget.id ? null : widget.id));
      }
      return;
    }
  });

  if (!open) return null;

  return (
    <Box
      position="absolute"
      width={overlayW}
      height={overlayH}
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
    >
      <Box height={1}>
        <Text bold>{t('widget.title')}</Text>
      </Box>
      <Box height={1}>
        <Text dimColor>{t('widget.navHint')}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {availableWidgets.map((widget, i) => {
          const isSelected = i === selectedIdx;
          const isExpanded = expandedId === widget.id;
          return (
            <Box key={widget.id} flexDirection="column">
              <Box height={1}>
                <Text
                  backgroundColor={isSelected ? '#1e40af' : undefined}
                  color={isSelected ? 'cyanBright' : undefined}
                >
                  {isSelected ? '▶' : ' '}{' '}
                  {isExpanded ? '▼' : '▸'}{' '}
                  {widget.title}
                </Text>
              </Box>
              {isExpanded && (
                <Box
                  flexDirection="column"
                  borderStyle="single"
                  borderColor="gray"
                  paddingX={1}
                  paddingY={1}
                  marginTop={1}
                  marginBottom={1}
                >
                  {widget.component}
                </Box>
              )}
            </Box>
          );
        })}
        {availableWidgets.length === 0 && (
          <Text dimColor>{t('widget.empty')}</Text>
        )}
      </Box>
    </Box>
  );
}
