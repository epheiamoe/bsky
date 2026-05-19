import React from 'react';
import { Box, Text } from 'ink';

interface ThinkingCardProps {
  content: string;
  expanded: boolean;
  onToggle: () => void;
}

export function ThinkingCard({ content, expanded }: ThinkingCardProps) {
  const lines = content.split('\n');
  const firstLine = lines[0] || content;

  if (!expanded) {
    return (
      <Text color="gray" dimColor>
        {'▸ Thinking: '}{firstLine}
      </Text>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="gray" dimColor>{'▼ Thinking:'}</Text>
      {lines.map((line, i) => (
        <Text key={i} color="gray" dimColor>
          {'| '}{line}
        </Text>
      ))}
    </Box>
  );
}
