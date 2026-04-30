import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useNavigation, useAuth, useNotifications, useTimeline, useCompose, useBookmarks, useI18n } from '@bsky/app';
import type { ComposeImage, AppView, Locale } from '@bsky/app';
import type { AIConfig } from '@bsky/core';
import { readFileSync, existsSync, statSync } from 'fs';
import { Sidebar } from './Sidebar.jsx';
import { PostList } from './PostList.jsx';
import { ProfileView } from './ProfileView.jsx';
import { SearchView } from './SearchView.jsx';
import { NotifView } from './NotifView.jsx';
import { AIChatView } from './AIChatView.jsx';
import { UnifiedThreadView } from './UnifiedThreadView.jsx';
import { enableMouseTracking, disableMouseTracking, parseMouseEvent } from '../utils/mouse.js';
import type { MouseEvent } from '../utils/mouse.js';

interface AppConfig {
  blueskyHandle: string;
  blueskyPassword: string;
  aiConfig: AIConfig;
  targetLang?: string;
}

type FocusTarget = 'main' | 'ai' | 'compose';

export interface AppProps {
  config: AppConfig;
  isRawModeSupported?: boolean;
}

export function App({ config, isRawModeSupported = true }: AppProps) {
  const { stdout } = useStdout();
  const [cols, setCols] = useState(() => stdout?.columns ?? 80);
  const [rows, setRows] = useState(() => stdout?.rows ?? 24);
  useEffect(() => {
    const onResize = () => { setCols(stdout?.columns ?? 80); setRows(stdout?.rows ?? 24); };
    stdout?.on('resize', onResize);
    return () => { stdout?.off('resize', onResize); };
  }, [stdout]);

  const { currentView, canGoBack, goTo, goBack, goHome } = useNavigation();
  const { client, loading: authLoading, login } = useAuth();
  const { unreadCount } = useNotifications(client);
  const bookmarks = useBookmarks(client);
  const [bookmarkIdx, setBookmarkIdx] = useState(0);
  const { t, locale } = useI18n(config.targetLang as Locale);
  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';

  // Feed
  const { posts, loading: feedLoading, cursor, loadMore, refresh } = useTimeline(client);
  const [feedIdx, setFeedIdx] = useState(0);

  // Thread
  const threadUri = currentView.type === 'thread' ? (currentView as { uri: string }).uri : undefined;
  const [threadKey, setThreadKey] = useState(0);

  // Compose
  const compose = useCompose(client, goBack, () => { goHome(); });
  const [composeDraft, setComposeDraft] = useState('');
  const [composeImages, setComposeImages] = useState<ComposeImage[]>([]);
  const [imagePathInput, setImagePathInput] = useState<string | null>(null);
  const [composeUploadError, setComposeUploadError] = useState<string | null>(null);

  // AI
  const [focusedPanel, setFocusedPanel] = useState<FocusTarget>('main');

  // Auto-login
  const [wasAuthenticated, setWasAuthenticated] = useState(false);
  useEffect(() => {
    if (!authLoading) login(config.blueskyHandle, config.blueskyPassword);
  }, []);

  // Re-login on expired session (e.g., after system sleep)
  useEffect(() => {
    if (client?.isAuthenticated()) {
      setWasAuthenticated(true);
    } else if (wasAuthenticated) {
      setWasAuthenticated(false);
      login(config.blueskyHandle, config.blueskyPassword);
    }
  }, [client]);

  // Refresh bookmarks when entering bookmarks page
  useEffect(() => {
    if (currentView.type === 'bookmarks') { bookmarks.refresh(); setBookmarkIdx(0); }
  }, [currentView.type]);

  // Reset images when entering compose
  useEffect(() => {
    if (currentView.type === 'compose') {
      setComposeImages([]);
      setImagePathInput(null);
      setComposeUploadError(null);
    }
  }, [currentView.type]);

  // ═════════════════════ KEYBOARD ═════════════════════
  useInput((input, key) => {
    // Tab / Esc — always processed
    if (key.tab) {
      if (currentView.type === 'aiChat') setFocusedPanel(f => f === 'ai' ? 'main' : 'ai');
      return;
    }
    if (key.escape) {
      if (currentView.type === 'aiChat') {
        if (focusedPanel === 'ai') { setFocusedPanel('main'); return; }
        goBack(); return;
      }
      if (currentView.type === 'compose') {
        if (imagePathInput !== null) { setImagePathInput(null); return; }
        goBack(); return;
      }
      if (currentView.type !== 'feed') { goBack(); return; }
      return;
    }
    if (currentView.type === 'aiChat' && focusedPanel === 'ai') return;

    // Arrows — feed + bookmarks
    if (key.upArrow && currentView.type === 'feed') { setFeedIdx(i => Math.max(0, i - 1)); return; }
    if (key.downArrow && currentView.type === 'feed') { setFeedIdx(i => Math.min(posts.length - 1, i + 1)); return; }
    if (key.upArrow && currentView.type === 'bookmarks') { setBookmarkIdx(i => Math.max(0, i - 1)); return; }
    if (key.downArrow && currentView.type === 'bookmarks') { setBookmarkIdx(i => Math.min(bookmarks.bookmarks.length - 1, i + 1)); return; }

    // Enter — feed + bookmarks (compose Enter handled by TextInput onSubmit)
    if (key.return) {
      if (currentView.type === 'feed') {
        const p = posts[feedIdx];
        if (p) goTo({ type: 'thread', uri: p.uri });
        return;
      }
      if (currentView.type === 'bookmarks') {
        const bm = bookmarks.bookmarks[bookmarkIdx];
        if (bm) goTo({ type: 'thread', uri: bm.uri });
        return;
      }
      return;
    }

    // Ctrl+G
    if (input === '\x07') { goTo({ type: 'aiChat', contextUri: threadUri ?? undefined }); return; }

    const k = input.toLowerCase();
    if (!k) return;

    if (currentView.type === 'aiChat' && focusedPanel === 'main') {
      if (k === 'a' || k === 't') { goBack(); goTo({ type: 'feed' }); }
      return;
    }

    // When composing: handle image path input or pass to TextInput
    if (currentView.type === 'compose') {
      if (imagePathInput !== null) {
        if (key.return) {
          const path = imagePathInput.trim();
          if (path) {
            try {
              if (!existsSync(path)) { setComposeUploadError(t('compose.fileNotFound', { path })); }
              else if (composeImages.length >= 4) { setComposeUploadError(t('compose.maxImages', { n: 4 })); }
              else {
                const stat = statSync(path);
                if (stat.size > 1024 * 1024) { setComposeUploadError(t('compose.imageOverLimit', { name: path })); }
                else {
                  const data = readFileSync(path);
                  const mime = path.endsWith('.png') ? 'image/png' : path.endsWith('.gif') ? 'image/gif' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
                  client?.uploadBlob(data, mime).then(res => {
                    setComposeImages(prev => [...prev, { blobRef: { $link: res.blob.ref.$link, mimeType: mime, size: stat.size }, alt: '' }]);
                    setImagePathInput(null);
                    setComposeUploadError(null);
                  }).catch(e => setComposeUploadError(t('compose.uploadFailed') + ': ' + e.message));
                }
              }
            } catch (e) { setComposeUploadError(String(e)); }
          } else {
            setImagePathInput(null);
          }
          return;
        }
        if (key.escape) { setImagePathInput(null); return; }
        return;
      }
      if (input === 'i' || input === 'I') {
        if (composeImages.length < 4) setImagePathInput('');
        return;
      }
      return;
    }

    // ── Global navigation shortcuts ──
    if (k === 't') { goHome(); return; }
    if (k === 'n') { goTo({ type: 'notifications' }); return; }
    if (k === 'p') { goTo({ type: 'profile', actor: config.blueskyHandle }); return; }
    if (k === 's') { goTo({ type: 'search' }); return; }
    if (k === 'a') { goTo({ type: 'aiChat', contextUri: threadUri ?? undefined }); return; }
    if (k === 'c') { goTo({ type: 'compose' }); return; }
    if (k === 'b') { goTo({ type: 'bookmarks' }); return; }

    // ── Feed-specific ──
    if (currentView.type === 'feed') {
      if (k === 'j') setFeedIdx(i => Math.min(posts.length - 1, i + 1));
      else if (k === 'k') setFeedIdx(i => Math.max(0, i - 1));
      else if (k === 'm') loadMore?.();
      else if (k === 'r') refresh?.();
      else if (k === 'v') {
        const p = posts[feedIdx];
        if (p) bookmarks.toggleBookmark(p.uri, p.cid);
      }
    }

    // ── Bookmarks-specific ──
    if (currentView.type === 'bookmarks') {
      if (k === 'j') setBookmarkIdx(i => Math.min(bookmarks.bookmarks.length - 1, i + 1));
      else if (k === 'k') setBookmarkIdx(i => Math.max(0, i - 1));
      else if (k === 'b') bookmarks.refresh();
      else if (k === 'd') {
        const bm = bookmarks.bookmarks[bookmarkIdx];
        if (bm) bookmarks.removeBookmark(bm.uri);
      }
      return;
    }

    // PgUp/PgDn: scroll feed
    if (currentView.type === 'feed') {
      if (input === '\x1b[5~') { setFeedIdx(i => Math.max(0, i - 5)); return; }
      if (input === '\x1b[6~') { setFeedIdx(i => Math.min(posts.length - 1, i + 5)); return; }
    }
  });

  // ── Mouse scroll dispatch ──
  useEffect(() => {
    if (!stdout) return;
    enableMouseTracking(stdout);
    const onData = (data: Buffer) => {
      const evt = parseMouseEvent(data);
      if (!evt) return;
      if (evt.type === 'scrollUp') {
        if (currentView.type === 'feed') setFeedIdx(i => Math.max(0, i - 1));
      } else if (evt.type === 'scrollDown') {
        if (currentView.type === 'feed') setFeedIdx(i => Math.min(posts.length - 1, i + 1));
      }
    };
    process.stdin.on('data', onData);
    return () => {
      process.stdin.off('data', onData);
      disableMouseTracking(stdout);
    };
  }, [stdout, currentView.type, posts.length]);

  // ── Layout ──
  const sidebarW = Math.max(16, Math.floor(cols * 0.14));
  const mainW = cols - sidebarW - 2;
  const timeStr = new Date().toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
  const onlineStatus = client ? '🟢' : '🔴';

  const renderView = () => {
    switch (currentView.type) {
      case 'feed':
        return (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="gray" paddingX={1}>
            <Box height={1}><Text bold>{'📋 '}{t('nav.feed')}</Text><Text dimColor>{' '}{t('keys.feed')}</Text></Box>
            <PostList posts={posts} loading={feedLoading} cursor={cursor} selectedIndex={feedIdx} width={mainW - 4} height={rows - 5} />
          </Box>
        );
      case 'thread':
        return (
          <UnifiedThreadView
            key={threadKey}
            client={client}
            uri={(currentView as { uri: string }).uri}
            goBack={goBack}
            goTo={(v) => goTo(v as AppView)}
            refreshThread={(newUri) => { goTo({ type: 'thread', uri: newUri }); setThreadKey(k => k + 1); }}
            cols={mainW}
            isBookmarked={bookmarks.isBookmarked}
            toggleBookmark={bookmarks.toggleBookmark}
          />
        );
      case 'compose':
        return (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
            <Box height={1}><Text bold color="yellow">{(currentView as { replyTo?: string }).replyTo ? '✏️ ' + t('compose.titleReply') : '✏️ ' + t('compose.title')}</Text><Text dimColor>{imagePathInput !== null ? ' ' + t('keys.composeImage') : ' ' + t('keys.compose')}</Text></Box>
            {(currentView as { replyTo?: string }).replyTo && <Box><Text dimColor>{t('compose.replyTo')} </Text><Text color="blue">{(currentView as { replyTo: string }).replyTo}</Text></Box>}
            <Box borderStyle="single" borderColor="gray" padding={1} marginTop={0}>
              <TextInput
                value={imagePathInput !== null ? imagePathInput : composeDraft}
                onChange={imagePathInput !== null ? setImagePathInput : setComposeDraft}
                onSubmit={() => { if (imagePathInput === null && composeDraft.trim()) compose.submit(composeDraft.trim(), (currentView as { replyTo?: string }).replyTo, composeImages.length > 0 ? composeImages : undefined); }}
                placeholder={imagePathInput !== null ? t('compose.imagePathPlaceholder') : t('compose.placeholder')}
              />
            </Box>
            <Box height={1}>
              {imagePathInput === null ? <Text color={composeDraft.length > 280 ? 'yellow' : undefined}>{composeDraft.length}/300</Text> : <Text dimColor>{'🖼 '}{t('compose.imageMode')}</Text>}
              {composeImages.length > 0 && <Text color="green">{' 📎 ' + composeImages.length + ' ' + t('compose.imageCount')}</Text>}
              {compose.submitting && <Text color="cyan">{' '}{t('action.sending')}</Text>}
              {composeUploadError && <Text color="red">{' '}{composeUploadError}</Text>}
            </Box>
          </Box>
        );
      case 'profile':
        return <ProfileView client={client} actor={(currentView as { actor: string }).actor} goBack={goBack} cols={mainW} />;
      case 'notifications':
        return <NotifView client={client} goBack={goBack} goTo={goTo} cols={mainW} />;
      case 'search':
        return <SearchView client={client} query={(currentView as { query?: string }).query} goBack={goBack} cols={mainW} rows={rows} goTo={goTo} />;
      case 'aiChat':
        return <AIChatView client={client} aiConfig={config.aiConfig} contextUri={(currentView as { contextUri?: string }).contextUri} goBack={goBack} cols={mainW} rows={rows} focused={focusedPanel === 'ai'} />;
      case 'bookmarks':
        return (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="yellow" paddingX={1}>
            <Box height={1}><Text bold color="yellow">{'🔖 '}{t('bookmarks.title')}</Text><Text dimColor>{' '}{t('keys.bookmarks')}</Text></Box>
            {bookmarks.loading && <Text dimColor>{t('status.loading')}</Text>}
            {!bookmarks.loading && bookmarks.bookmarks.length === 0 && <Text dimColor>{t('bookmarks.empty')}</Text>}
            {bookmarks.bookmarks.slice(0, rows - 5).map((post, i) => {
              const isSel = i === bookmarkIdx;
              const text = (post.record.text || '').slice(0, cols - post.author.handle.length - 30);
              return (
                <Box key={post.uri} height={1}>
                  <Text backgroundColor={isSel ? '#1e40af' : undefined} color={isSel ? 'cyanBright' : undefined}>
                    {isSel ? '▶' : ' '}{' '}
                    <Text color={isSel ? 'cyanBright' : 'green'}>{post.author.handle}</Text>
                    <Text>: </Text>
                    <Text>{(post.record.text || '').slice(0, cols - post.author.handle.length - 35)}</Text>
                  </Text>
                </Box>
              );
            })}
          </Box>
        );
      default:
        return <Text>{t('common.unknownPage')}</Text>;
    }
  };

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box width={cols} height={1}>
        <Text backgroundColor="#1a56db" color="white" bold>{' 🦋 Bluesky '}</Text>
        <Text backgroundColor="#1a56db" color="white">{' @'}{config.blueskyHandle}{' '}</Text>
        <Text backgroundColor="#1a56db" color="cyanBright">{onlineStatus}</Text>
        <Box flexGrow={1}><Text backgroundColor="#1a56db">{' '}</Text></Box>
        {currentView.type !== 'feed' && <Text backgroundColor="#1a56db" color="yellow">{'  '}{viewLabel(currentView, t)}{' '}</Text>}
        <Box flexGrow={1}><Text backgroundColor="#1a56db">{' '}</Text></Box>
        <Text backgroundColor="#1a56db" color="gray" dimColor>{timeStr}{' '}</Text>
      </Box>
      <Box flexDirection="row" flexGrow={1}>
        <Sidebar currentView={currentView} goBack={goBack} canGoBack={canGoBack} goHome={goHome} width={sidebarW} notifCount={unreadCount} />
        {authLoading ? (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="gray" paddingX={1}><Text dimColor>{t('login.connecting')}</Text></Box>
        ) : renderView()}
      </Box>
      <Box width={cols} height={1}>
        <Text backgroundColor="#1a56db" color="white" dimColor>{footerHint(currentView, canGoBack, t)}</Text>
        <Box flexGrow={1}><Text backgroundColor="#1a56db">{' '}</Text></Box>
        <Text backgroundColor="#1a56db" color="white" dimColor>{timeStr}{' '}</Text>
      </Box>
      {!isRawModeSupported && (
        <Box width={cols} height={1}><Text backgroundColor="#92400e" color="yellow">{'⚠ '}{t('common.rawModeWarning')}</Text></Box>
      )}
    </Box>
  );
}

const VIEW_EMOJI: Record<string, string> = { feed: '📋', thread: '🧵', compose: '✏️', profile: '👤', notifications: '🔔', search: '🔍', aiChat: '🤖', bookmarks: '🔖' };
const VIEW_KEY: Record<string, string> = { feed: 'breadcrumb.feed', thread: 'breadcrumb.thread', compose: 'breadcrumb.compose', profile: 'breadcrumb.profile', notifications: 'breadcrumb.notifications', search: 'breadcrumb.search', aiChat: 'breadcrumb.aiChat', bookmarks: 'breadcrumb.bookmarks' };

function viewLabel(v: { type: string }, t: (key: string) => string): string {
  const emoji = VIEW_EMOJI[v.type] ?? '';
  const key = VIEW_KEY[v.type];
  return key ? emoji + ' ' + t(key) : v.type;
}

const KEY_MAP: Record<string, string> = {
  feed: 'keys.feed', thread: 'keys.thread', compose: 'keys.compose',
  profile: 'keys.profile', notifications: 'keys.notifications', search: 'keys.search',
  aiChat: 'keys.aiChat', bookmarks: 'keys.bookmarks',
};

function footerHint(v: { type: string }, canGoBack: boolean, t: (key: string) => string): string {
  const back = canGoBack ? ' Esc:' + t('nav.back') : '';
  const key = KEY_MAP[v.type];
  const hint = key ? t(key) : '';
  return hint ? back + ' ' + hint : back;
}
