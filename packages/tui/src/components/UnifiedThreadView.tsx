import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useThread, useI18n } from '@bsky/app';
import type { BskyClient, AIConfig } from '@bsky/core';
import type { FlatLine } from '@bsky/app';

interface UnifiedThreadViewProps {
  client: BskyClient | null;
  uri: string;
  goBack: () => void;
  goTo: (v: { type: string; replyTo?: string }) => void;
  refreshThread: (newUri: string) => void;
  cols: number;
  isBookmarked: (uri: string) => boolean;
  toggleBookmark: (uri: string, cid: string) => Promise<void>;
  aiConfig?: AIConfig;
  targetLang?: string;
  translateMode?: 'simple' | 'json';
}

export function UnifiedThreadView({ client, uri, goBack, goTo, refreshThread, cols, isBookmarked, toggleBookmark, aiConfig, targetLang, translateMode }: UnifiedThreadViewProps) {
  const { flatLines, loading, error, focusedIndex, focused, themeUri, likePost, repostPost, isLiked, isReposted } = useThread(client, uri);

  // Cursor = arrow movement target (highlighted in replies); focused = current post (only changes on Enter/h)
  const [cursorIndex, setCursorIndex] = useState(0);
  useEffect(() => { setCursorIndex(focusedIndex); }, [focusedIndex]);
  useEffect(() => { setTranslatedText(null); }, [cursorIndex]);

  const [confirmRepost, setConfirmRepost] = useState<{ uri: string; handle: string } | null>(null);
  const [localLikeCounts, setLocalLikeCounts] = useState<Record<string, number>>({});
  const [yankedUri, setYankedUri] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const { t, locale } = useI18n();
  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';
  const dateTimeOpts: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };

  const focusedUri = focused?.uri;
  const isTheme = focused?.isRoot && focused?.depth === 0;
  const focusedDepth = focused?.depth ?? 0;
  const cursorLine = flatLines[cursorIndex];
  const flatLen = useRef(0);
  useEffect(() => { flatLen.current = flatLines.length; });

  // Theme posts = above focused, excluding focused itself
  const themeLines = flatLines.filter(l => l.depth < 0 || (l.depth === 0 && l.isRoot && l.uri !== focusedUri));
  // Replies = replies to focused (depth <= focusedDepth+1), excluding focused
  const replyLines = flatLines.filter(l => l.uri && l.depth > 0 && l.depth <= focusedDepth + 1 && l.uri !== focusedUri);

  const handleLike = async (uri: string, rkey: string) => {
    if (isLiked(uri)) return;
    setLocalLikeCounts(prev => ({ ...prev, [rkey]: (prev[rkey] ?? 0) + 1 }));
    await likePost(uri);
  };

  useInput((input, key) => {
    if (confirmRepost) {
      if (input === 'y' || input === 'Y') { void repostPost(confirmRepost.uri); setConfirmRepost(null); return; }
      if (input === 'n' || input === 'N') { setConfirmRepost(null); return; }
      return;
    }

    // Arrows/jk move cursor (highlight) only — don't change current post
    if (key.upArrow || input === 'k' || input === 'K') { setCursorIndex(i => Math.max(0, i - 1)); return; }
    if (key.downArrow || input === 'j' || input === 'J') { setCursorIndex(i => Math.min(Math.max(0, flatLen.current - 1), i + 1)); return; }

    // Enter: make cursor line the NEW current post (full refocus)
    if (key.return && cursorLine?.uri && cursorLine.uri !== uri) { refreshThread(cursorLine.uri); return; }

    // h: go back to theme post
    if ((input === 'h' || input === 'H') && themeUri) { refreshThread(themeUri); return; }

    // Actions on cursor line
    if (cursorLine?.uri) {
      if (input === 'l' || input === 'L') { void handleLike(cursorLine.uri, cursorLine.rkey); return; }
      if (input === 'r') { setConfirmRepost({ uri: cursorLine.uri, handle: cursorLine.handle }); return; }
      if (input === 'c' || input === 'C') { goTo({ type: 'compose', replyTo: cursorLine.uri }); return; }
      if (input === 'v') { void toggleBookmark(cursorLine.uri, cursorLine.cid); return; }
      if (input === 'y') {
        const rkey = cursorLine.uri.split('/').pop() ?? '';
        const url = `@${cursorLine.handle} ${cursorLine.uri} https://bsky.app/profile/${cursorLine.handle}/post/${rkey}`;
        setYankedUri(url);
        process.stderr.write(`\n📋 ${url}\n`);
        setTimeout(() => setYankedUri(null), 5000);
        return;
      }
      if (input === 'f' || input === 'F') {
        setTranslatedText(null);
        setTranslating(true);
        import('@bsky/core').then(({ translateText: tt }) => {
          const cfg = { apiKey: aiConfig?.apiKey || '', baseUrl: aiConfig?.baseUrl || 'https://api.deepseek.com', model: aiConfig?.model || 'deepseek-v4-flash' };
          tt(cfg, cursorLine.text, targetLang || 'zh', translateMode || 'simple').then(r => {
            setTranslatedText(`[${r.sourceLang ?? '?'}→${targetLang || 'zh'}] ${r.translated}`);
            setTranslating(false);
          }).catch(() => setTranslating(false));
        }).catch(() => setTranslating(false));
        return;
      }
    }
  });

  if (loading && flatLines.length === 0) return <Box width={cols} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>{t('status.loading')}</Text></Box>;
  if (!loading && error && flatLines.length === 0) return <Box width={cols} borderStyle="single" borderColor="red" paddingX={1}><Text dimColor>{t('thread.loadFailed')}</Text></Box>;

  const glc = (l: FlatLine) => l.likeCount + (localLikeCounts[l.rkey] ?? 0);

  const renderPostBody = (line: FlatLine, bg?: string) => (
    <Box flexDirection="column">
      {/* Name + media tags */}
      <Box>
        <Text backgroundColor={bg} color={bg ? 'cyanBright' : 'green'} bold={!!bg}>
          {line.displayName}
        </Text>
        <Text backgroundColor={bg} dimColor>{' @'}{line.handle}</Text>
        {line.mediaTags.length > 0 && (
          <Text backgroundColor={bg} color="yellow">{'  '}{line.mediaTags.join(' ')}</Text>
        )}
      </Box>
      {/* Text */}
      <Box><Text backgroundColor={bg}>{line.text}</Text></Box>
      {/* Images — OSC 8 clickable hyperlinks */}
      {line.imageUrls?.map((url, i) => (
        <Box key={i}><Text backgroundColor={bg}>
          {'\x1b]8;;' + url + '\x07🖼 ' + t('post.imageCount', { n: line.imageUrls!.length > 1 ? i + 1 : 1 }) + ' ' + t('image.cdnHint') + '\x1b]8;;\x07'}
        </Text></Box>
      ))}
      {/* External link */}
      {line.externalLink && (
        <Box><Text backgroundColor={bg}>
          {'\x1b]8;;' + line.externalLink.uri + '\x07🔗 ' + (line.externalLink.title || line.externalLink.uri) + '\x1b]8;;\x07'}
        </Text></Box>
      )}
      {/* Stats */}
      <Box>
        <Text backgroundColor={bg} dimColor>♥ {glc(line)}  ♺ {line.repostCount}  💬 {line.replyCount}</Text>
        {bg && isBookmarked(line.uri) && <Text backgroundColor={bg} color="yellow">{'  🔖 '}{t('action.bookmarked')}</Text>}
        {bg && line.indexedAt && <Text backgroundColor={bg} dimColor>{' · '}{new Date(line.indexedAt).toLocaleString(dateLocale, dateTimeOpts)}</Text>}
      </Box>
    </Box>
  );

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box><Text bold color="cyan">{'🧵 '}{t('breadcrumb.thread')} - {isTheme ? t('thread.rootPost') : t('action.reply')}</Text></Box>

      {/* ── Theme posts ── */}
      {themeLines.length > 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Box><Text dimColor>{'── ' + t('thread.discussionSource') + ' ──'}</Text></Box>
          {themeLines.map((line) => {
            const isCursor = line.uri === cursorLine?.uri;
            return (
              <Box key={line.uri || Math.random()} flexDirection="column" marginBottom={0}>
                <Box>
                  <Text backgroundColor={isCursor ? '#0e4a6e' : undefined} color={isCursor ? 'cyanBright' : 'green'} bold={isCursor}>
                    {line.displayName}
                  </Text>
                  <Text dimColor>{' @'}{line.handle}</Text>
                  {isCursor && <Text dimColor>{' ← '}{t('action.navigate')}</Text>}
                </Box>
                <Box><Text backgroundColor={isCursor ? '#0e4a6e' : undefined}>{line.text}</Text></Box>
                <Box>
                  <Text dimColor>♥ {glc(line)}  ♺ {line.repostCount}  💬 {line.replyCount}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── Current focused post ── */}
      {focused && (
        <Box flexDirection="column" marginTop={0}>
          <Box><Text dimColor>{isTheme ? '── ' + t('thread.rootPost') + ' ──' : '── ' + t('thread.currentPost') + ' ──'}</Text></Box>
          {renderPostBody(focused, '#1e40af')}
        </Box>
      )}

      {/* ── Replies ── */}
      <Box flexDirection="column" marginTop={0}>
        <Box><Text dimColor>{'── ' + t('thread.replies') + ' ──'}</Text></Box>
        {replyLines.length === 0 && <Box><Text dimColor>{'  '}{t('thread.noReplies')}</Text></Box>}
        {replyLines.map((line, i) => {
          if (!line.uri) return <Box key={i}><Text dimColor>{'  '}{line.text}</Text></Box>;
          const isCursor = line.uri === cursorLine?.uri;
          const indent = '  '.repeat(Math.min(line.depth - 1, 3));
          return (
            <Box key={i} flexDirection="column" marginBottom={0}>
              {/* Name line with cursor */}
              <Box>
                <Text dimColor>{indent}↳ </Text>
                <Text backgroundColor={isCursor ? '#0e4a6e' : undefined} bold={isCursor}>{line.displayName}</Text>
                <Text dimColor>{' @'}{line.handle}</Text>
                {isCursor && <Text dimColor>{' ← '}{t('action.navigate')}</Text>}
                {line.hasReplies && <Text color="cyan">{' [+]'}</Text>}
                {line.mediaTags.length > 0 && (
                  <Text color="yellow">{'  '}{line.mediaTags.join(' ')}</Text>
                )}
              </Box>
              {/* Text */}
              <Box><Text dimColor>{indent}{'  '}</Text><Text backgroundColor={isCursor ? '#0e4a6e' : undefined}>{line.text.replace(/\n/g, ' ').slice(0, 200)}</Text></Box>
              {/* Images */}
              {line.imageUrls?.map((url, idx) => (
                <Box key={idx}><Text dimColor>{indent}{'  '}</Text><Text backgroundColor={isCursor ? '#0e4a6e' : undefined}>
                  {'\x1b]8;;' + url + '\x07🖼 ' + t('post.imageCount', { n: line.imageUrls!.length > 1 ? idx + 1 : 1 }) + '\x1b]8;;\x07'}
                </Text></Box>
              ))}
              {/* Stats */}
              <Box><Text dimColor>{indent}{'  '}</Text><Text dimColor>♥ {glc(line)}  ♺ {line.repostCount}  💬 {line.replyCount}</Text></Box>
            </Box>
          );
        })}
      </Box>

      {/* ── Translation ── */}
      {(translatedText || translating) && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginTop={0}>
          {translating ? (
            <Text dimColor>{'🔄 '}{t('action.translating')}</Text>
          ) : (
            <Text color="white">{translatedText}</Text>
          )}
        </Box>
      )}

      {/* ── Repost confirm ── */}
      {confirmRepost && (
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1} marginTop={0}>
          <Text bold color="yellow">{'⚠ '}{t('thread.confirmRepost', { handle: confirmRepost.handle })}</Text>
          <Box><Text color="green">{t('thread.confirmRepostYes')}</Text><Text>{'  '}</Text><Text color="red">{t('thread.confirmRepostNo')}</Text></Box>
        </Box>
      )}

      {/* ── Yanked URI ── */}
      {yankedUri && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginTop={0}>
          <Text color="cyan" bold>{'📋 '}{t('thread.copiedToStderr')}</Text>
          <Text color="white">{yankedUri}</Text>
        </Box>
      )}
    </Box>
  );
}
