import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Text, useStdout, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useNavigation, useAuth, useNotifications, useTimeline, useCompose, useBookmarks, useLists, useListDetail, useI18n, useDrafts, useConvoList } from '@bsky/app';
import type { ComposeMedia, AppView, Locale } from '@bsky/app';
import { RECOMMENDED_FEEDS, getFeedLabel, resolveFeedId, getProviderById, getModelInfo } from '@bsky/core';
import { setLastFeedUri, getFeedConfig } from '@bsky/app';
import type { AIConfig, BskyClient } from '@bsky/core';
import { readFileSync, existsSync, statSync } from 'fs';
import sharp from 'sharp';
import { Sidebar } from './Sidebar.jsx';
import { PostList } from './PostList.jsx';
import { ProfileView } from './ProfileView.jsx';
import { SearchView } from './SearchView.jsx';
import { NotifView } from './NotifView.jsx';
import { AIChatView } from './AIChatView.jsx';
import { UnifiedThreadView } from './UnifiedThreadView.jsx';
import { SettingsView } from './SettingsView.jsx';
import { enableMouseTracking, disableMouseTracking, parseMouseEvent } from '../utils/mouse.js';
import type { MouseEvent } from '../utils/mouse.js';
import { ComposeView } from './ComposeView.jsx';
import { DMListView } from './DMListView.jsx';
import { DMChatView } from './DMChatView.jsx';

interface AppConfig {
  blueskyHandle: string;
  blueskyPassword: string;
  aiConfig: AIConfig;
  targetLang?: string;
  translateMode?: 'simple' | 'json';
  apiKeys: Record<string, string>;
  scenarioModels: {
    aiChat: string;
    translate: string;
    polish: string;
  };
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
  const lists = useLists(client);
  const [listIdx, setListIdx] = useState(0);
  // listDetail — only active when view is 'listDetail'
  const currentListUri = currentView.type === 'listDetail' ? (currentView as { uri: string }).uri : '';
  const listDetail = useListDetail(client, currentListUri);
  const [listDetailIdx, setListDetailIdx] = useState(0);
  const [listDetailTab, setListDetailTab] = useState<'posts' | 'members'>('posts');
  const [creatingList, setCreatingList] = useState(false);
  const [editingListUri, setEditingListUri] = useState<string | null>(null);
  const [listInput, setListInput] = useState('');
  const { drafts, saveDraft, deleteDraft, loadDraft } = useDrafts(client);
  const { convos, loading: dmLoading, error: dmError, refresh: refreshDMs } = useConvoList(client);
  const [dmIdx, setDmIdx] = useState(0);
  const { t, locale } = useI18n(config.targetLang as Locale);
  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';

  // Feed
  const [currentFeedUri, setCurrentFeedUri] = useState<string | undefined>(undefined);
  const [defaultFeedUri, setDefaultFeedUri] = useState<string | undefined>(
    getFeedConfig().defaultFeedUri ?? process.env.DEFAULT_FEED ?? undefined
  );
  const [feedConfig, setFeedConfig] = useState<string[]>(() => {
    const envFeeds = process.env.BSKY_FEEDS;
    if (!envFeeds) return RECOMMENDED_FEEDS.map(f => f.uri);
    return envFeeds.split(',').map(s => s.trim()).filter(Boolean);
  });
  const [showFeedConfig, setShowFeedConfig] = useState(false);
  const [feedConfigInput, setFeedConfigInput] = useState('');

  const effectiveFeedUri = currentFeedUri ?? defaultFeedUri;
  const { posts, loading: feedLoading, cursor, loadMore, refresh } = useTimeline(client, effectiveFeedUri);
  const [feedIdx, setFeedIdx] = useState(0);

  // Track last active feed URI for sidebar/home navigation (shared PWA+TUI)
  useEffect(() => {
    if (effectiveFeedUri) setLastFeedUri(effectiveFeedUri);
  }, [effectiveFeedUri]);

  // Thread
  const threadUri = currentView.type === 'thread' ? (currentView as { uri: string }).uri : undefined;
  const [threadKey, setThreadKey] = useState(0);

  // Compose
  const compose = useCompose(client, goBack, () => { goHome(); });
  const [composePostIdx, setComposePostIdx] = useState(0);
  const [composeMedia, setComposeMedia] = useState<ComposeMedia[]>([]);
  const [imagePathInput, setImagePathInput] = useState<string | null>(null);
  const [composeUploadError, setComposeUploadError] = useState<string | null>(null);
  const [composeInfo, setComposeInfo] = useState<string | null>(null);
  const [draftListOpen, setDraftListOpen] = useState(false);
  const [draftListIdx, setDraftListIdx] = useState(0);
  const [draftSavePrompt, setDraftSavePrompt] = useState(false);
  // Polish
  const [polishPhase, setPolishPhase] = useState<'idle' | 'req' | 'loading' | 'result'>('idle');
  const [polishRequirement, setPolishRequirement] = useState('');
  const [polishResult, setPolishResult] = useState('');
  const [polishError, setPolishError] = useState<string | null>(null);
  // ALT text during upload
  const [altReqText, setAltReqText] = useState('');
  const [altReqActive, setAltReqActive] = useState(false);
  const altReqBlob = useRef<{ type: 'image' | 'video'; blobRef: { $link: string; mimeType: string; size: number } } | null>(null);

  // AI
  const [focusedPanel, setFocusedPanel] = useState<FocusTarget>('main');
  const [showSettings, setShowSettings] = useState(false);

  // ── Scenario config resolution (mirrors PWA: per-model thinking/vision) ──
  const resolveScenarioConfig = useCallback((scenarioModel: string): AIConfig => {
    if (!scenarioModel || !scenarioModel.includes('/')) {
      return { ...config.aiConfig };
    }
    const [providerId, model] = scenarioModel.split('/');
    if (!providerId || !model) return { ...config.aiConfig };
    const provider = getProviderById(providerId);
    const modelInfo = provider ? getModelInfo(providerId, model) : undefined;
    return {
      ...config.aiConfig,
      baseUrl: provider?.baseUrl || config.aiConfig.baseUrl,
      model,
      apiKey: config.apiKeys?.[providerId] || config.aiConfig.apiKey,
      provider: provider?.id,
      reasoningStyle: provider?.reasoningStyle,
      thinkingEnabled: modelInfo?.thinking ?? config.aiConfig.thinkingEnabled ?? true,
      visionEnabled: modelInfo?.vision ?? config.aiConfig.visionEnabled ?? false,
    };
  }, [config]);

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

  // Reset state when entering compose
  useEffect(() => {
    if (currentView.type === 'compose') {
      setComposeMedia([]);
      setImagePathInput(null);
      setComposeUploadError(null);
      setDraftListOpen(false);
      setDraftSavePrompt(false);
      setComposePostIdx(0);
      setPolishPhase('idle');
      setAltReqActive(false);
      setAltReqText('');
      altReqBlob.current = null;
      const replyTo = (currentView as { replyTo?: string }).replyTo;
      if (replyTo) compose.setReplyTo(replyTo);
      const qUri = (currentView as { quoteUri?: string }).quoteUri;
      if (qUri) compose.setQuoteUri(qUri);
      const dId = (currentView as { draftId?: string }).draftId;
      if (dId) {
        const draft = drafts.find(d => d.id === dId);
        if (draft) compose.loadFromDraft(draft.posts, draft.replyTo, draft.quoteUri);
      }
    }
  }, [currentView.type]);

  const handleSaveDraft = useCallback(async () => {
    const data = compose.toDraftData();
    await saveDraft(data);
  }, [compose, saveDraft]);

  const handlePolishCall = useCallback(async (text: string, requirement: string) => {
    if (!client) return;
    setPolishPhase('loading');
    setPolishError(null);
    try {
      const polishConfig = resolveScenarioConfig(config.scenarioModels.polish);
      const { polishDraft } = await import('@bsky/core');
      const result = await polishDraft(polishConfig, text, requirement);
      setPolishResult(result);
      setPolishPhase('result');
    } catch (e) {
      setPolishError(e instanceof Error ? e.message : String(e));
      setPolishResult('');
      setPolishPhase('result');
    }
  }, [client, config, resolveScenarioConfig]);

  // ═════════════════════ KEYBOARD ═════════════════════
  useInput((input, key) => {
    // Tab / Esc — always processed
    if (key.tab) {
      if (currentView.type === 'aiChat') setFocusedPanel(f => f === 'ai' ? 'main' : 'ai');
      if (currentView.type === 'compose' && compose.posts.length > 1) {
        setComposePostIdx(i => (i + 1) % compose.posts.length);
      }
      return;
    }
    if (key.escape) {
      if (creatingList) { setCreatingList(false); setListInput(''); return; }
      if (editingListUri) { setEditingListUri(null); setListInput(''); return; }
      if (showFeedConfig) { setShowFeedConfig(false); return; }
      if (currentView.type === 'search') { /* handled by SearchView */ return; }
      if (currentView.type === 'aiChat') {
        if (focusedPanel === 'ai') { setFocusedPanel('main'); return; }
        goBack(); return;
      }
      if (currentView.type === 'compose') {
        if (draftSavePrompt) { setDraftSavePrompt(false); return; }
        if (draftListOpen) { setDraftListOpen(false); return; }
        if (imagePathInput !== null) { setImagePathInput(null); return; }
        if (compose.posts.some(p => p.text.trim())) { setDraftSavePrompt(true); return; }
        goBack(); return;
      }
      if (currentView.type !== 'feed') { goBack(); return; }
      return;
    }
    if (currentView.type === 'aiChat' && focusedPanel === 'ai') return;

    // Feed config overlay active — skip all other keys
    if (showFeedConfig) return;

    // Creating/editing list name — skip all other keys
    if (creatingList || editingListUri) return;

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
      if (currentView.type === 'compose' && !draftSavePrompt && !draftListOpen && imagePathInput === null && polishPhase === 'idle' && !altReqActive) {
        // ALT check before submit
        const noAlt = composeMedia.filter(m => m.type === 'image' && !m.alt.trim()).length;
        if (noAlt > 0) {
          // TODO: show modal warning
          // For now, just submit anyway
        }
        const nonEmpty = compose.posts.filter(p => p.text.trim());
        if (nonEmpty.length > 0) {
          const mediaMap = composeMedia.length > 0 ? new Map<string, ComposeMedia[]>([[compose.posts[composePostIdx]?.id ?? compose.posts[0]!.id, composeMedia]]) : undefined;
          compose.submit(mediaMap);
        }
        return;
      }
      return;
    }

    // Ctrl+G
    if (input === '\x07') { goTo({ type: 'aiChat', sessionId: crypto.randomUUID(), contextPost: threadUri ?? undefined }); return; }

    // Settings
    if (input === ',') { setShowSettings(true); return; }

    const k = input.toLowerCase();
    if (!k) return;

    // When composing: handle image path input, draft list, save prompt, or pass to TextInput
    if (currentView.type === 'compose') {
      if (draftSavePrompt) {
        if (input === 'y' || input === 'Y') {
          handleSaveDraft().then(() => { setDraftSavePrompt(false); goBack(); });
          return;
        }
        if (input === 'n' || input === 'N') { setDraftSavePrompt(false); goBack(); return; }
        if (key.escape) { setDraftSavePrompt(false); return; }
        return;
      }
      if (draftListOpen) {
        if (key.escape) { setDraftListOpen(false); return; }
        if (key.upArrow || input === 'k' || input === 'K') { setDraftListIdx(i => Math.max(0, i - 1)); return; }
        if (key.downArrow || input === 'j' || input === 'J') { setDraftListIdx(i => Math.min(drafts.length - 1, i + 1)); return; }
        if (key.return) {
          const d = drafts[draftListIdx];
          if (d) {
            compose.loadFromDraft(d.posts, d.replyTo, d.quoteUri);
            setComposePostIdx(0);
          }
          setDraftListOpen(false);
          return;
        }
        if (input === 'd' || input === 'D') {
          const d = drafts[draftListIdx];
          if (d) deleteDraft(d.id);
          if (draftListIdx >= drafts.length - 1) setDraftListIdx(i => Math.max(0, i - 1));
          return;
        }
        if (input === 'n' || input === 'N') {
          const data = compose.toDraftData();
          saveDraft(data).then(() => {
            compose.loadFromDraft([], undefined, undefined);
            setComposePostIdx(0);
          });
          setDraftListOpen(false);
          return;
        }
        if (input === 's' || input === 'S') {
          const d = drafts[draftListIdx];
          if (d && d.syncStatus === 'local') {
            // sync handled by useDrafts
          }
          return;
        }
        return;
      }
      if (polishPhase === 'req') {
        if (key.return && polishRequirement.trim()) {
          const activePost = compose.posts[composePostIdx];
          if (activePost?.text.trim()) {
            handlePolishCall(activePost.text, polishRequirement.trim());
          }
          return;
        }
        if (key.escape) { setPolishPhase('idle'); setPolishRequirement(''); return; }
        return;
      }
      if (polishPhase === 'loading') return;
      if (polishPhase === 'result') {
        if (key.escape) { setPolishPhase('idle'); setPolishError(null); return; }
        if ((input === 'r' || input === 'R') && polishResult) {
          const activePost = compose.posts[composePostIdx];
          if (activePost) { compose.setPostText(activePost.id, polishResult); }
          setPolishPhase('idle');
          return;
        }
        if (input === 'c' || input === 'C') {
          if (polishResult) {
            process.stderr.write(polishResult);
          }
          setPolishPhase('idle');
          return;
        }
        return;
      }
      if (altReqActive) {
        if (key.return) {
          if (altReqBlob.current) {
            setComposeMedia(prev => [...prev, {
              ...altReqBlob.current!,
              alt: altReqText,
            }]);
            altReqBlob.current = null;
            setAltReqActive(false);
            setAltReqText('');
          }
          return;
        }
        if (key.escape) {
          if (altReqBlob.current) {
            setComposeMedia(prev => [...prev, {
              ...altReqBlob.current!,
              alt: '',
            }]);
            altReqBlob.current = null;
            setAltReqActive(false);
            setAltReqText('');
          }
          return;
        }
        return;
      }
      if (imagePathInput !== null) {
        if (key.return) {
          const path = imagePathInput.trim();
          if (path) {
            (async () => {
            try {
              const isVideo = /\.(mp4|mov|webm|avi|mkv)$/i.test(path);
              if (!existsSync(path)) { setComposeUploadError(t('compose.fileNotFound', { path })); }
              else if (isVideo && composeMedia.some(m => m.type === 'video')) { setComposeUploadError('Only 1 video allowed'); }
              else if (isVideo && composeMedia.length >= 1) { setComposeUploadError('Video cannot be mixed with images'); }
              else if (!isVideo && composeMedia.some(m => m.type === 'video')) { setComposeUploadError('Images cannot be mixed with video'); }
              else if (!isVideo && composeMedia.length >= 4) { setComposeUploadError(t('compose.maxImages', { n: 4 })); }
              else {
                const stat = statSync(path);
                const maxSize = isVideo ? 100 * 1024 * 1024 : 2048 * 1024;
                if (stat.size > maxSize) { setComposeUploadError(t('compose.imageOverLimit', { name: path })); }
                else {
                  let data = readFileSync(path);
                  let mime = isVideo
                    ? (path.endsWith('.mp4') ? 'video/mp4' : path.endsWith('.mov') ? 'video/quicktime' : path.endsWith('.webm') ? 'video/webm' : 'video/mp4')
                    : (path.endsWith('.png') ? 'image/png' : path.endsWith('.gif') ? 'image/gif' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
                  const originalSize = data.length;

                  // Auto-compress images > 1MB (skip GIFs)
                  if (!isVideo && !mime.includes('gif') && data.length > 2048 * 1024) {
                    try {
                      const compressed = await sharp(data)
                        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 82 })
                        .toBuffer();
                      const ratio = (compressed.length / data.length * 100).toFixed(0);
                      setComposeInfo(t('compose.imageCompressed', {
                        name: path.split(/[/\\]/).pop() || path,
                        orig: formatSize(data.length),
                        comp: formatSize(compressed.length),
                        ratio,
                      }));
                      data = Buffer.from(compressed);
                      mime = 'image/jpeg';
                    } catch { /* pass — upload original */ }
                  }

                  client?.uploadBlob(data as Uint8Array, mime).then(res => {
                    const blobRef = { $link: res.blob.ref.$link, mimeType: mime, size: data.length };
                    altReqBlob.current = { type: isVideo ? 'video' : 'image', blobRef };
                    setAltReqText('');
                    setAltReqActive(true);
                    setImagePathInput(null);
                    setComposeUploadError(null);
                    if (composeInfo) setTimeout(() => setComposeInfo(null), 8000);
                  }).catch(e => setComposeUploadError(t('compose.uploadFailed') + ': ' + e.message));
                }
              }
            } catch (e) { setComposeUploadError(String(e)); }
            })();
          } else {
            setImagePathInput(null);
          }
          return;
        }
        if (key.escape) { setImagePathInput(null); return; }
        return;
      }
      if (input === 'i' || input === 'I') {
        const hasVideo = composeMedia.some(m => m.type === 'video');
        if (hasVideo || composeMedia.length < 4) setImagePathInput('');
        return;
      }
      if (input === 'D') { setDraftListOpen(true); setDraftListIdx(0); return; }
      if (input === 'P') { compose.addPost(); setComposePostIdx(compose.posts.length); return; }
      if ((input === 'f' || input === 'F') && compose.posts[composePostIdx]?.text?.trim()) {
        setPolishRequirement('');
        setPolishPhase('req');
        return;
      }
      if (input === 'X' && compose.posts.length > 1) {
        const id = compose.posts[composePostIdx]?.id;
        if (id) compose.removePost(id);
        if (composePostIdx >= compose.posts.length - 1) setComposePostIdx(i => Math.max(0, i - 1));
        return;
      }
      return;
    }

    // Search mode — all keys handled by SearchView (like compose mode)
    if (currentView.type === 'search') return;

    // ── Global navigation shortcuts ──
    if (k === 't') { if (currentView.type !== 'aiChat') goHome(); return; }
    if (k === 'n') { goTo({ type: 'notifications' }); return; }
    if (k === 'p') { goTo({ type: 'profile', actor: config.blueskyHandle }); return; }
    if (k === 's') { goTo({ type: 'search' }); return; }
    if (k === 'a') { if (currentView.type !== 'aiChat') goTo({ type: 'aiChat', sessionId: crypto.randomUUID(), contextPost: threadUri ?? undefined }); return; }
    if (k === 'c') { if (currentView.type !== 'thread') goTo({ type: 'compose' }); return; }
    if (k === 'b') { goTo({ type: 'bookmarks' }); return; }
    if (k === 'L') { goTo({ type: 'lists' }); return; }
    if (k === 'm') { if (currentView.type !== 'feed') { goTo({ type: 'dm' }); } return; }
    if (k === '?') { goTo({ type: 'about' }); return; }

    // ── Feed-specific ──
    if (currentView.type === 'feed') {
      if (k === 'j') setFeedIdx(i => Math.min(posts.length - 1, i + 1));
      else if (k === 'k') setFeedIdx(i => Math.max(0, i - 1));
      else if (k === 'm') loadMore?.();
      else if (k === 'r') refresh?.();
      else if (k === 'f') { setFeedConfigInput(''); setShowFeedConfig(true); }
      else if (k === 'v') {
        const p = posts[feedIdx];
        if (p) bookmarks.toggleBookmark(p.uri, p.cid);
      }
      else if (k === 'q') {
        const p = posts[feedIdx] as any;
        const quoteUri = p?.embed?.record?.uri as string | undefined;
        if (quoteUri) goTo({ type: 'thread', uri: quoteUri });
      }
    }

    // ── Bookmarks-specific ──
    if (currentView.type === 'bookmarks') {
      if (k === 'j') setBookmarkIdx(i => Math.min(bookmarks.bookmarks.length - 1, i + 1));
      else if (k === 'k') setBookmarkIdx(i => Math.max(0, i - 1));
      else if (k === 'r') bookmarks.refresh();
      else if (k === 'd') {
        const bm = bookmarks.bookmarks[bookmarkIdx];
        if (bm) bookmarks.removeBookmark(bm.uri);
      }
      else if (k === 'q') {
        const bm = bookmarks.bookmarks[bookmarkIdx] as any;
        const quoteUri = bm?.embed?.record?.uri as string | undefined;
        if (quoteUri) goTo({ type: 'thread', uri: quoteUri });
      }
      return;
    }

    // ── Lists-specific ──
    if (currentView.type === 'lists') {
      if (k === 'j') setListIdx(i => Math.min(lists.lists.length - 1, i + 1));
      else if (k === 'k') setListIdx(i => Math.max(0, i - 1));
      else if (k === 'Enter') {
        const list = lists.lists[listIdx];
        if (list) goTo({ type: 'listDetail', uri: list.uri });
      }
      else if (k === 'r') lists.refresh();
      else if (k === 'd') {
        const list = lists.lists[listIdx];
        if (list) lists.deleteList(list.uri);
      }
      else if (k === 'c') {
        // Create new list
        setCreatingList(true);
      }
      else if (k === 'e') {
        const list = lists.lists[listIdx];
        if (list) { setListInput(list.name); setEditingListUri(list.uri); }
      }
      return;
    }

    // ── ListDetail-specific ──
    if (currentView.type === 'listDetail') {
      const dItems = listDetailTab === 'posts' ? listDetail.feed : listDetail.members;
      if (key.tab) setListDetailTab(t => t === 'posts' ? 'members' : 'posts');
      else if (k === 'j') setListDetailIdx(i => Math.min(dItems.length - 1, i + 1));
      else if (k === 'k') setListDetailIdx(i => Math.max(0, i - 1));
      else if (k === 'r') listDetail.refresh();
      else if (k === 'Enter') { /* handled in render */ }
      else if (k === 'e') {
        if (listDetail.list) { setListInput(listDetail.list.name); setEditingListUri(listDetail.list.uri); }
      }
      return;
    }

    // ── DM list specific ──
    if (currentView.type === 'dm') {
      if (k === 'j') setDmIdx(i => Math.min(convos.length - 1, i + 1));
      else if (k === 'k') setDmIdx(i => Math.max(0, i - 1));
      else if (k === 'r') refreshDMs();
      else if (key.return) {
        const c = convos[dmIdx];
        if (c && client) {
          const members = c.members || [];
          const other = members.find(m => m.did !== client.getDID());
          if (other) goTo({ type: 'dmChat', conversationId: other.did });
        }
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
    if (showSettings) return <SettingsView goBack={() => setShowSettings(false)} />;

    switch (currentView.type) {
      case 'feed':
        return (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="gray" paddingX={1}>
            <Box height={1}>
              <Text bold>{'📋 '}{t('nav.feed')}{effectiveFeedUri ? ' - ' + getFeedLabel(effectiveFeedUri) : ''}</Text>
              <Text dimColor>{' '}{showFeedConfig ? 'Esc:关闭' : t('keys.feed')}</Text>
            </Box>
            {showFeedConfig ? (
              <FeedConfigOverlay
                feeds={feedConfig}
                currentFeedUri={effectiveFeedUri}
                defaultFeedUri={defaultFeedUri}
                client={client}
                onSelect={(uri) => { setCurrentFeedUri(uri); setShowFeedConfig(false); }}
                onSetDefault={(uri) => setDefaultFeedUri(uri)}
                onAdd={(uri) => { setFeedConfig(prev => [...prev, uri]); }}
                onRemove={(uri) => { setFeedConfig(prev => prev.filter(f => f !== uri)); if (currentFeedUri === uri) setCurrentFeedUri(undefined); }}
                onClose={() => setShowFeedConfig(false)}
              />
            ) : (
              <PostList posts={posts} loading={feedLoading} cursor={cursor} selectedIndex={feedIdx} width={mainW - 4} height={rows - 5} />
            )}
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
            aiConfig={config.aiConfig}
            targetLang={config.targetLang}
          />
        );
      case 'compose':
        return (
          <ComposeView
            posts={compose.posts}
            activePostIdx={composePostIdx}
            setPostText={compose.setPostText}
            replyTo={(currentView as { replyTo?: string }).replyTo}
            quoteUri={compose.quoteUri}
            submitting={compose.submitting}
            error={compose.error}
            composeMedia={composeMedia}
            uploadError={composeUploadError}
            composeInfo={composeInfo}
            mode={draftSavePrompt ? 'savePrompt' : draftListOpen ? 'drafts' : altReqActive ? 'altReq' : polishPhase !== 'idle' ? (polishPhase === 'req' ? 'polishReq' : 'polishResult') : imagePathInput !== null ? 'media' : 'text'}
            imagePathInput={imagePathInput}
            setImagePathInput={setImagePathInput}
            drafts={drafts}
            draftListIdx={draftListIdx}
            cols={mainW}
            polishResult={polishResult}
            polishError={polishError}
            polishPhase={polishPhase}
            polishRequirement={polishRequirement}
            setPolishRequirement={setPolishRequirement}
            altReqText={altReqText}
            setAltReqText={setAltReqText}
          />
        );
      case 'profile':
        return <ProfileView client={client} actor={(currentView as { actor: string }).actor} goBack={goBack} cols={mainW} rows={rows} goTo={(v) => goTo(v as AppView)} aiConfig={config.aiConfig} targetLang={config.targetLang} />;
      case 'notifications':
        return <NotifView client={client} goBack={goBack} goTo={goTo} cols={mainW} />;
      case 'search':
        return <SearchView client={client} query={(currentView as { query?: string }).query} goBack={goBack} cols={mainW} rows={rows} goTo={goTo} />;
      case 'aiChat':
        return <AIChatView client={client} aiConfig={config.aiConfig} sessionId={(currentView as { sessionId?: string }).sessionId} contextPost={(currentView as { contextPost?: string }).contextPost} contextProfile={(currentView as { contextProfile?: string }).contextProfile} contextUri={(currentView as { contextUri?: string }).contextUri} goTo={goTo} goBack={goBack} cols={mainW} rows={rows} focused={focusedPanel === 'ai'} userHandle={config.blueskyHandle} locale={locale} />;
      case 'lists':
        return (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box height={1}><Text bold color="cyan">{'📃 '}{t('lists.title')}</Text><Text dimColor>{' '}{t('keys.lists')}</Text></Box>
            {/* Create / Edit list name input */}
            {(creatingList || editingListUri) && (
              <Box height={1}>
                <Text dimColor>{creatingList ? 'New list name: ' : 'Edit name: '}</Text>
                <TextInput
                  value={listInput}
                  onChange={setListInput}
                  onSubmit={() => {
                    if (creatingList) {
                      lists.createList(listInput.trim(), 'app.bsky.graph.defs#curatelist');
                      setCreatingList(false);
                      setListInput('');
                    } else if (editingListUri) {
                      lists.updateListInfo(editingListUri, { name: listInput.trim() });
                      setEditingListUri(null);
                      setListInput('');
                    }
                  }}
                />
              </Box>
            )}
            {lists.loading && <Text dimColor>{t('status.loading')}</Text>}
            {!lists.loading && lists.lists.length === 0 && <Text dimColor>{t('lists.empty')}</Text>}
            {lists.lists.slice(0, rows - 5).map((list, i) => {
              const isSel = i === listIdx;
              const purposeLabel = list.purpose.includes('modlist') ? '🛡' : '📋';
              const memberCount = list.listItemCount ?? 0;
              return (
                <Box key={list.uri} height={1}>
                  <Text backgroundColor={isSel ? '#1e40af' : undefined} color={isSel ? 'cyanBright' : undefined}>
                    {isSel ? '▶' : ' '}{' '}
                    <Text>{purposeLabel}</Text>
                    <Text> {list.name.slice(0, 30)}</Text>
                    <Text dimColor> ({memberCount})</Text>
                  </Text>
                </Box>
              );
            })}
          </Box>
        );
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
      case 'listDetail':
        const ldetail = listDetail;
        const dtabItems = listDetailTab === 'posts' ? ldetail.feed : ldetail.members;
        const dtabCount = listDetailTab === 'posts' ? ldetail.feed.length : ldetail.members.length;
        return (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box height={1}>
              <Text bold color="cyan">{'📃 '}{ldetail.list?.name ?? '\u2026'} ({ldetail.list?.listItemCount ?? 0})</Text>
              <Text dimColor>{' '}{t('keys.listDetail')}</Text>
            </Box>
            {/* Tab bar */}
            <Box height={1}>
              <Text color={listDetailTab === 'posts' ? 'cyanBright' : undefined} bold={listDetailTab === 'posts'}>
                {' ['}{t('lists.tabPosts')}{'] '}
              </Text>
              <Text color={listDetailTab === 'members' ? 'cyanBright' : undefined} bold={listDetailTab === 'members'}>
                {' ['}{t('lists.tabMembers', { n: ldetail.members.length })}{']'}
              </Text>
            </Box>
            {ldetail.loading && <Text dimColor>{t('status.loading')}</Text>}
            {!ldetail.loading && dtabItems.length === 0 && (
              <Text dimColor>{listDetailTab === 'posts' ? t('lists.noPosts') : t('lists.noMembers')}</Text>
            )}
            {dtabItems.slice(0, rows - 7).map((item, i) => {
              const isSel = i === listDetailIdx;
              if (listDetailTab === 'posts') {
                const post = item as any;
                const handle = post.author?.handle ?? '?';
                const text = (post.record?.text || '').slice(0, cols - handle.length - 30);
                return (
                  <Box key={post.uri ?? i} height={1}>
                    <Text backgroundColor={isSel ? '#1e40af' : undefined} color={isSel ? 'cyanBright' : undefined}>
                      {isSel ? '▶' : ' '}{' '}
                      <Text color={isSel ? 'cyanBright' : 'green'}>{handle}</Text>
                      <Text>: </Text>
                      <Text>{text}</Text>
                    </Text>
                  </Box>
                );
              }
              // Members
              const member = item as any;
              const handle = member.subject?.handle ?? '?';
              const name = member.subject?.displayName || '';
              return (
                <Box key={member.uri ?? i} height={1}>
                  <Text backgroundColor={isSel ? '#1e40af' : undefined} color={isSel ? 'cyanBright' : undefined}>
                    {isSel ? '▶' : ' '}{' '}
                    <Text color={isSel ? 'cyanBright' : 'green'}>{handle}</Text>
                    {name ? <Text dimColor> ({name.slice(0, 20)})</Text> : null}
                  </Text>
                </Box>
              );
            })}
          </Box>
        );
      case 'dm':
        return (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="green" paddingX={1}>
            <Box height={1}><Text bold color="green">💬 {t('nav.dm')}</Text><Text dimColor>{' '}[j/k] Nav [Enter] Open [r] Refresh</Text></Box>
            <DMListView
              convos={convos}
              loading={dmLoading}
              error={dmError}
              selectedIndex={dmIdx}
              width={mainW - 4}
              height={rows - 5}
              currentDid={client!.getDID()}
              t={t}
            />
          </Box>
        );
      case 'dmChat':
        return (
          <DMChatView
            client={client!}
            conversationId={(currentView as { conversationId: string }).conversationId}
            goBack={goBack}
            cols={mainW}
          />
        );
      case 'about':
        return (
          <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="gray" paddingX={1}>
            <Box height={1}><Text bold>{t('nav.about')}</Text></Box>
            <Text>Bluesky Client v0.5.2</Text>
            <Text> </Text>
            <Text>Repository:</Text>
            <Text>  https://github.com/epheiamoe/bsky</Text>
            <Text> </Text>
            <Text>A dual-UI (TUI + PWA) Bluesky social client with AI integration.</Text>
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
        <Text backgroundColor="#1a56db" color="white" dimColor>{footerHint(currentView, canGoBack, focusedPanel, t)}</Text>
        <Box flexGrow={1}><Text backgroundColor="#1a56db">{' '}</Text></Box>
        <Text backgroundColor="#1a56db" color="white" dimColor>{timeStr}{' '}</Text>
      </Box>
      {!isRawModeSupported && (
        <Box width={cols} height={1}><Text backgroundColor="#92400e" color="yellow">{'⚠ '}{t('common.rawModeWarning')}</Text></Box>
      )}
    </Box>
  );
}

function FeedConfigOverlay({ feeds, currentFeedUri, defaultFeedUri, client, onSelect, onSetDefault, onAdd, onRemove, onClose }: {
  feeds: string[];
  currentFeedUri: string | undefined;
  defaultFeedUri: string | undefined;
  client: BskyClient | null;
  onSelect: (uri: string) => void;
  onSetDefault: (uri: string | undefined) => void;
  onAdd: (uri: string) => void;
  onRemove: (uri: string) => void;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [suggested, setSuggested] = useState<Array<{ uri: string; label: string }>>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);

  useEffect(() => {
    if (!client) return;
    setLoadingSuggested(true);
    client.getSuggestedFeeds(10).then(res => {
      setSuggested(res.feeds.map(f => ({ uri: f.uri, label: f.displayName })));
    }).catch(() => {}).finally(() => setLoadingSuggested(false));
  }, [client]);

  useInput((input, key) => {
    if (adding) {
      if (key.escape) { setAdding(false); setAddInput(''); return; }
      if (key.return && addInput.trim()) {
        onAdd(addInput.trim());
        setAdding(false);
        setAddInput('');
        return;
      }
      return;
    }
    if (key.escape) { onClose(); return; }
    if (key.upArrow || input === 'k') { setIdx(i => Math.max(0, i - 1)); return; }
    if (key.downArrow || input === 'j') { setIdx(i => Math.min(feeds.length + suggested.length + 2, i + 1)); return; }
    if (input === 's' || input === 'S') {
      if (idx < feeds.length) { onSetDefault(feeds[idx]!); }
      else if (idx === feeds.length + suggested.length + 1) { onSetDefault(undefined); }
      return;
    }
    if (key.return) {
      if (idx < feeds.length) {
        onSelect(feeds[idx]!);
      } else if (idx < feeds.length + suggested.length) {
        const s = suggested[idx - feeds.length]!;
        onAdd(s.uri);
      } else if (idx === feeds.length + suggested.length) {
        setAdding(true);
      } else if (idx === feeds.length + suggested.length + 1) {
        onSelect(undefined as any);
      }
      return;
    }
    if (input === 'd' || input === 'D') {
      if (idx < feeds.length) onRemove(feeds[idx]!);
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text color="cyan" bold>{'⚙️ Feeds — jk:切换 Enter:选择 d:删除 s:设为默认 Esc:关闭'}</Text>
      <Box flexDirection="column" marginTop={1}>
        {feeds.map((f, i) => (
          <Text key={f} color={i === idx ? 'cyan' : undefined}>
            {i === idx ? '▸' : ' '} {f === defaultFeedUri ? '★ ' : '  '}{getFeedLabel(f)}
          </Text>
        ))}
        <Text dimColor>{'┈┈ 推荐 Feed ┈┈'}</Text>
        {loadingSuggested && <Text dimColor>{'  ⏳ 加载中...'}</Text>}
        {suggested.map((f, i) => {
          const fi = feeds.length + i;
          return (
            <Text key={f.uri} color={fi === idx ? 'cyan' : undefined}>
              {fi === idx ? '▸' : ' '} {f.label} <Text dimColor>(添加)</Text>
            </Text>
          );
        })}
        <Text dimColor>{idx === feeds.length + suggested.length ? '▸' : ' '} ── [+ 添加] ──</Text>
        <Text dimColor>{idx === feeds.length + suggested.length + 1 ? '▸' : ' '} ── 📋 时间线(主页) ──{defaultFeedUri === undefined ? ' ★' : ''}</Text>
      </Box>
      {adding && (
        <Box marginTop={1} borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text color="cyan">▸ URI: </Text>
          <TextInput value={addInput} onChange={setAddInput} onSubmit={() => {}} />
        </Box>
      )}
    </Box>
  );
}

const VIEW_EMOJI: Record<string, string> = { feed: '📋', thread: '🧵', compose: '✏️', profile: '👤', notifications: '🔔', search: '🔍', aiChat: '🤖', bookmarks: '🔖', lists: '📃', listDetail: '📃', dm: '💬', dmChat: '💬' };
const VIEW_KEY: Record<string, string> = { feed: 'breadcrumb.feed', thread: 'breadcrumb.thread', compose: 'breadcrumb.compose', profile: 'breadcrumb.profile', notifications: 'breadcrumb.notifications', search: 'breadcrumb.search', aiChat: 'breadcrumb.aiChat', bookmarks: 'breadcrumb.bookmarks', lists: 'breadcrumb.lists', listDetail: 'breadcrumb.listDetail', dm: 'nav.dm', dmChat: 'nav.dm' };

function viewLabel(v: { type: string }, t: (key: string) => string): string {
  const emoji = VIEW_EMOJI[v.type] ?? '';
  const key = VIEW_KEY[v.type];
  return key ? emoji + ' ' + t(key) : v.type;
}

const KEY_MAP: Record<string, string> = {
  feed: 'keys.feed', thread: 'keys.thread', compose: 'keys.compose',
  profile: 'keys.profile', notifications: 'keys.notifications', search: 'keys.search',
  aiChat: 'keys.aiChat', bookmarks: 'keys.bookmarks',
  lists: 'keys.lists', listDetail: 'keys.listDetail',
  dm: 'keys.dm', dmChat: 'keys.dmChat',
};

function footerHint(v: { type: string }, canGoBack: boolean, focusedPanel: FocusTarget, t: (key: string) => string): string {
  const back = canGoBack ? ' Esc:' + t('nav.back') : '';
  const key = v.type === 'aiChat' ? (focusedPanel === 'ai' ? KEY_MAP['aiChat'] : 'keys.aiMain') : KEY_MAP[v.type];
  const hint = key ? t(key) : '';
  return hint ? back + ' ' + hint : back;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
