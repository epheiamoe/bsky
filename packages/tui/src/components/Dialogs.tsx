import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onReject: () => void;
}

export function ConfirmDialog({ visible, title, message, onConfirm, onReject }: ConfirmDialogProps) {
  if (!visible) return null;

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={2} paddingY={1}>
      <Text bold color="yellow">⚠ {title}</Text>
      <Text>{message}</Text>
      <Box marginTop={1}>
        <Text color="green">[Y/Enter] 确认</Text>
        <Text>  </Text>
        <Text color="red">[N] 取消</Text>
      </Box>
    </Box>
  );
}

export interface ComposePanelProps {
  visible: boolean;
  onPost: (text: string) => void;
  onClose: () => void;
  focused?: boolean;
}

export function ComposePanel({ visible, onPost, onClose, focused = true }: ComposePanelProps) {
  const [text, setText] = useState('');

  if (!visible) return null;

  const remaining = 300 - text.length;
  const counterColor = remaining < 20 ? 'red' : remaining < 50 ? 'yellow' : undefined;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
      <Box height={1}>
        <Text bold color="yellow">✏️ 发帖</Text>
        <Text dimColor>  Enter 发送 · Esc 取消 · 最多 300 字符</Text>
      </Box>

      <Box borderStyle="single" borderColor="gray" padding={1} marginTop={0}>
        {focused ? (
          <TextInput
            value={text}
            onChange={setText}
            onSubmit={() => {
              if (text.trim()) { onPost(text.trim()); setText(''); }
            }}
            placeholder="此刻的想法..."
          />
        ) : (
          <Text>{text || ' '}</Text>
        )}
      </Box>

      <Box height={1}>
        <Text color={counterColor}>{text.length}/300</Text>
        {text.length > 280 && <Text color="yellow">  ⚠ 接近上限</Text>}
      </Box>
    </Box>
  );
}
