import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import { usePostDetail, useTranslation } from '@bsky/app';
import type { AppView } from '@bsky/app';
import type { BskyClient, AIConfig } from '@bsky/core';

interface PostDetailProps {
  client: BskyClient | null;
  uri: string;
  goTo: (v: AppView) => void;
  goBack: () => void;
  cols: number;
  rows: number;
  aiConfig: AIConfig;
  targetLang?: string;
}

const TARGET_LANG_LABELS: Record<string, string> = {
  zh: '中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español',
};

export function PostDetail({ client, uri, goTo, goBack, cols, rows, aiConfig, targetLang = 'zh' }: PostDetailProps) {
  const { post, flatThread, loading, translate, actions } = usePostDetail(
    client, uri, goTo, aiConfig.apiKey, aiConfig.baseUrl, targetLang,
  );
  const [translations, setTranslations] = useState<Map<string, string>>(new Map());
  const [showTranslation, setShowTranslation] = useState(false);

  useEffect(() => {
    const handler = (data: Buffer) => {
      for (const ch of data.toString()) {
        if (ch === '\x1b') { goBack(); return; } // Esc
        const k = ch.toLowerCase();
        if (k === 'r') { goTo({ type: 'compose', replyTo: uri }); return; }
        if (k === 't') {
          if (post && !showTranslation) {
            translate(post.record.text).then(t => {
              setTranslations(prev => { prev.set(post.record.text, t); return new Map(prev); });
              setShowTranslation(true);
            });
          } else {
            setShowTranslation(false);
          }
          return;
        }
        if (k === 'h') { goTo({ type: 'thread', uri }); return; }
        if (k === 'a') { goTo({ type: 'aiChat', contextUri: uri }); return; }
      }
    };
    process.stdin.on('data', handler);
    return () => { process.stdin.off('data', handler); };
  }, [goBack, goTo, uri, post, showTranslation, translate]);

  if (loading || !post) {
    return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>加载中...</Text></Box>;
  }

  const postText = post.record.text;
  const translation = translations.get(postText);
  const displayName = post.author.displayName || post.author.handle;

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      {/* Author header */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="cyan">{displayName}</Text>
          <Text dimColor>{' @'}{post.author.handle}</Text>
        </Box>
        <Text dimColor>{post.indexedAt ? new Date(post.indexedAt).toLocaleString('zh-CN') : ''}</Text>
      </Box>

      {/* Post text */}
      <Box flexDirection="column" marginY={1} paddingX={1}>
        <Box borderStyle="single" borderColor="blue" padding={1}>
          <Text>{postText}</Text>
        </Box>
        {showTranslation && translation && (
          <Box marginTop={0} paddingX={2}>
            <Text color="yellow" dimColor>{TARGET_LANG_LABELS[targetLang] ?? targetLang}：</Text>
            <Text color="yellow">{translation}</Text>
          </Box>
        )}
      </Box>

      {/* Stats */}
      <Box marginBottom={1}>
        <Text color="blue">{'♥ '}{post.likeCount ?? 0}</Text>
        <Text>{'  ♺ '}{post.repostCount ?? 0}</Text>
        <Text>{'  💬 '}{post.replyCount ?? 0}</Text>
      </Box>

      {/* Action bar */}
      <Box marginBottom={1}>
        <Text backgroundColor="#1e40af" color="white">{' [R] 回复 '}</Text>
        <Text>{' '}</Text>
        <Text backgroundColor={showTranslation ? '#1e40af' : '#374151'} color="white">{' [T] '}{TARGET_LANG_LABELS[targetLang] ?? '翻译'} {' '}</Text>
        <Text>{' '}</Text>
        <Text backgroundColor="#374151" color="white">{' [H] 展开对话 '}</Text>
        <Text>{' '}</Text>
        <Text backgroundColor="#374151" color="white">{' [Esc] 返回 '}</Text>
      </Box>

      {/* Thread preview */}
      {flatThread && (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
          <Text dimColor>对话预览：</Text>
          {flatThread.split('\n').slice(0, 15).map((line, i) => (
            <Text key={i} dimColor>{line.slice(0, cols - 4)}</Text>
          ))}
          {flatThread.split('\n').length > 15 && (
            <Text color="cyan">按 H 查看完整对话树</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
