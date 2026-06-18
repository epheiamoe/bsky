import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { getHelpCategories, searchHelp, getCategoryInfo, iconToEmoji, type HelpEntry, type Platform } from '@bsky/app';
import { useI18n } from '@bsky/app';

interface HelpViewProps {
  goBack: () => void;
  cols: number;
  rows: number;
}

interface DisplayItem {
  type: 'category' | 'entry';
  category?: string;
  entry?: HelpEntry;
  isOtherPlatform?: boolean;
}

export function HelpView({ goBack, cols, rows }: HelpViewProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);

  const currentPlatform: Platform = 'tui';

  // Build display items based on search or category view
  const displayItems = useMemo((): DisplayItem[] => {
    if (query.trim()) {
      // Search mode: show flat list of matching entries
      const results = searchHelp(query, undefined); // search all platforms
      const currentPlatformResults = results.filter(e => e.platforms.includes(currentPlatform));
      const otherPlatformResults = results.filter(e => !e.platforms.includes(currentPlatform));

      const items: DisplayItem[] = [];
      if (currentPlatformResults.length > 0) {
        for (const entry of currentPlatformResults) {
          items.push({ type: 'entry', entry });
        }
      }
      if (otherPlatformResults.length > 0) {
        // Add separator
        items.push({ type: 'category', category: 'other', isOtherPlatform: true });
        for (const entry of otherPlatformResults) {
          items.push({ type: 'entry', entry, isOtherPlatform: true });
        }
      }
      return items;
    }

    // Category view: show entries grouped by category
    const categories = getHelpCategories();
    const categoryOrder = ['navigation', 'media', 'ai', 'shortcuts', 'settings', 'social', 'advanced'];
    const items: DisplayItem[] = [];

    // First, show current platform entries grouped by category
    for (const category of categoryOrder) {
      const entries = categories[category];
      if (!entries || entries.length === 0) continue;

      const currentPlatformEntries = entries.filter(e => e.platforms.includes(currentPlatform));
      if (currentPlatformEntries.length > 0) {
        items.push({ type: 'category', category });
        for (const entry of currentPlatformEntries) {
          items.push({ type: 'entry', entry });
        }
      }
    }

    // Then, show other platform entries at the bottom
    const otherPlatformEntries: HelpEntry[] = [];
    for (const category of categoryOrder) {
      const entries = categories[category];
      if (!entries) continue;
      const otherEntries = entries.filter(e => !e.platforms.includes(currentPlatform));
      otherPlatformEntries.push(...otherEntries);
    }

    if (otherPlatformEntries.length > 0) {
      items.push({ type: 'category', category: 'other', isOtherPlatform: true });
      for (const entry of otherPlatformEntries) {
        items.push({ type: 'entry', entry, isOtherPlatform: true });
      }
    }

    return items;
  }, [query, currentPlatform]);

  // Get visible items (entries are hidden if they belong to a collapsed category or are not expanded)
  const visibleItems = useMemo(() => {
    const result: Array<{ item: DisplayItem; index: number }> = [];
    let currentCategory = '';
    let isCategoryCollapsed = false;

    for (let i = 0; i < displayItems.length; i++) {
      const item = displayItems[i]!;

      if (item.type === 'category') {
        currentCategory = item.category ?? '';
        isCategoryCollapsed = false;
        result.push({ item, index: i });
        continue;
      }

      if (item.type === 'entry' && item.entry) {
        // If this entry is expanded, show it and its details
        if (expandedId === item.entry.id) {
          result.push({ item, index: i });
        } else {
          // Just show the entry (collapsed)
          result.push({ item, index: i });
        }
      }
    }

    return result;
  }, [displayItems, expandedId]);

  // Handle keyboard input
  useInput((input, key) => {
    // If search is focused, let TextInput handle most keys
    if (searchFocused) {
      if (key.escape) {
        setSearchFocused(false);
        return;
      }
      if (key.return) {
        setSearchFocused(false);
        return;
      }
      // Let TextInput handle other keys
      return;
    }

    // Global keys
    if (key.escape || input === 'q') {
      goBack();
      return;
    }

    // Focus search
    if (input === '/') {
      setSearchFocused(true);
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(visibleItems.length - 1, i + 1));
      return;
    }

    // Expand/collapse
    if (key.return) {
      const visibleItem = visibleItems[selectedIndex];
      if (visibleItem?.item.type === 'entry' && visibleItem.item.entry) {
        const entryId = visibleItem.item.entry.id;
        if (expandedId === entryId) {
          setExpandedId(null);
        } else {
          setExpandedId(entryId);
        }
      }
      return;
    }

    // Jump to next category
    if (key.tab) {
      let nextIndex = selectedIndex + 1;
      while (nextIndex < visibleItems.length) {
        if (visibleItems[nextIndex]?.item.type === 'category') {
          setSelectedIndex(nextIndex);
          return;
        }
        nextIndex++;
      }
      // Wrap to start
      setSelectedIndex(0);
      return;
    }
  });

  // Render a single item
  const renderItem = (visibleItem: { item: DisplayItem; index: number }, listIndex: number) => {
    const { item } = visibleItem;
    const isSelected = listIndex === selectedIndex;

    if (item.type === 'category') {
      const isOther = item.isOtherPlatform;
      const categoryInfo = !isOther && item.category ? getCategoryInfo(item.category) : null;

      return (
        <Box key={`cat-${item.category}-${listIndex}`} height={1}>
          <Text bold color={isOther ? 'gray' : 'cyan'}>
            {isOther ? '── Other Platform ──' : `${categoryInfo?.emoji ?? ''} ${t(categoryInfo?.labelKey ?? `help.category.${item.category}`)}`}
          </Text>
        </Box>
      );
    }

    if (item.type === 'entry' && item.entry) {
      const entry = item.entry;
      const isExpanded = expandedId === entry.id;
      const emoji = iconToEmoji(entry.icon);
      const title = t(entry.titleKey);
      const summary = t(entry.summaryKey);
      const platformTag = entry.platforms.length === 1
        ? entry.platforms[0] === 'pwa' ? ' [PWA]' : ' [TUI]'
        : '';

      // Render expanded content
      if (isExpanded) {
        const detailText = t(entry.detailKey);
        const detailLines = wrapText(detailText, cols - 6);

        return (
          <Box key={`entry-${entry.id}-${listIndex}`} flexDirection="column">
            {/* Entry header */}
            <Box height={1}>
              <Text
                backgroundColor={isSelected ? '#1e40af' : undefined}
                color={isSelected ? 'cyanBright' : undefined}
              >
                {isSelected ? '▸' : ' '}
                {' '}
                <Text>{emoji}</Text>
                {' '}
                <Text bold>{title}</Text>
                {platformTag && <Text dimColor>{platformTag}</Text>}
              </Text>
            </Box>
            {/* Detail text */}
            {detailLines.map((line, i) => (
              <Box key={`detail-${i}`} height={1} paddingLeft={4}>
                <Text dimColor>{line}</Text>
              </Box>
            ))}
            {/* Tips */}
            {entry.tips.map((tip, i) => (
              <Box key={`tip-${i}`} height={1} paddingLeft={4}>
                <Text dimColor>{iconToEmoji(tip.icon)} {t(tip.textKey)}</Text>
              </Box>
            ))}
          </Box>
        );
      }

      // Render collapsed entry
      return (
        <Box key={`entry-${entry.id}-${listIndex}`} height={1}>
          <Text
            backgroundColor={isSelected ? '#1e40af' : undefined}
            color={isSelected ? 'cyanBright' : undefined}
          >
            {isSelected ? '▸' : ' '}
            {' '}
            <Text>{emoji}</Text>
            {' '}
            <Text bold={isSelected}>{title}</Text>
            {platformTag && <Text dimColor>{platformTag}</Text>}
            <Text dimColor> — {summary.slice(0, Math.max(0, cols - title.length - 20))}</Text>
          </Text>
        </Box>
      );
    }

    return null;
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box height={1} marginBottom={1}>
        <Text bold color="cyan">❓ Help Center</Text>
        <Text dimColor>{'  '}{t('help.searchPlaceholder')}</Text>
      </Box>

      {/* Search input */}
      <Box height={1} marginBottom={1}>
        <Text>{searchFocused ? '▸ ' : '  '}</Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={() => setSearchFocused(false)}
          focus={searchFocused}
          placeholder={t('help.searchPlaceholder')}
        />
      </Box>

      {/* Entry list */}
      <Box flexDirection="column" height={rows - 8}>
        {visibleItems.length === 0 ? (
          <Text dimColor>{t('help.noResults')}</Text>
        ) : (
          visibleItems.map((visibleItem, listIndex) => renderItem(visibleItem, listIndex))
        )}
      </Box>

      {/* Platform legend */}
      <Box marginTop={1}>
        <Text dimColor>{'  '}</Text>
        <Text dimColor>[PWA]</Text>
        <Text dimColor>{' = PWA only  '}</Text>
        <Text dimColor>[TUI]</Text>
        <Text dimColor>{' = TUI only'}</Text>
      </Box>

      {/* Keyboard hints */}
      <Box marginTop={0}>
        <Text dimColor>{'  /:search  j/k:nav  Enter:expand  Tab:next category  q/Esc:back'}</Text>
      </Box>
    </Box>
  );
}

// Helper function to wrap text to fit within width
function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];
  
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.length > 0 ? lines : [''];
}