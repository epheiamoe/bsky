import React from 'react';
import { Box, Text } from 'ink';

interface ThinkingCardProps {
  content: string;
  expanded: boolean;
  onToggle: () => void;
  isFocused?: boolean;
}

export function ThinkingCard({ content, expanded, isFocused }: ThinkingCardProps) {
  const lines = content.split('\n');
  const firstLine = lines[0] || content;

  if (!expanded) {
    return (
      <Text color={isFocused ? 'cyan' : 'gray'} dimColor={!isFocused} bold={isFocused}>
        {(isFocused ? '▸ ' : '') + '▸ Thinking: '}{firstLine}
      </Text>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={isFocused ? 'cyan' : 'gray'} dimColor={!isFocused} bold={isFocused}>
        {(isFocused ? '▸ ' : '') + '▼ Thinking:'}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} color="gray" dimColor>
          {'| '}{line}
        </Text>
      ))}
    </Box>
  );
}
