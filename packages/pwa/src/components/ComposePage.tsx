import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCompose, useI18n, useDrafts, getCdnImageUrl, setComposeDraftForWidgets, registerComposeDraftSetter, getEnabledWidgetIds, formatThreadgateSummary, buildThreadgateRules } from '@bsky/app';
import type { ComposeMedia, ComposePostItem, AppDraft, AppView } from '@bsky/app';
import type { BskyClient, PostView, AIConfig, ListView } from '@bsky/core';
import { Icon } from './Icon.js';
import { compressImage, formatSize } from '../utils/compressImage.js';
import { formatTime } from '../utils/format.js';
import { WidgetModal } from './WidgetModal.js';

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

interface ComposePageProps {
  client: BskyClient;
  replyTo?: string;
  quoteUri?: string;
  draftId?: string;
  initialText?: string;
  goBack: () => void;
  goHome: () => void;
  goTo: (v: AppView) => void;
  polishConfig?: AIConfig;
}

interface LocalImage {
  file: File;
  preview: string;
  uploading: boolean;
  error?: string;
  altText: string;
}

interface LocalVideo {
  file: File;
  preview: string;
  uploading: boolean;
  error?: string;
}

interface QuotePreview {
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
  text: string;
  images: Array<{ url: string; alt: string }>;
  indexedAt: string;
}

interface SubmitProgress {
  visible: boolean;
  phase: 'media' | 'posting' | 'done' | 'error';
  current: number;
  total: number;
  message: string;
  error?: string;
}

function extractQuotePreviews(post: PostView): Array<{ url: string; alt: string }> {
  const images: Array<{ url: string; alt: string }> = [];
  const embed = post.record.embed;
  if (!embed) return images;
  if (embed.$type === 'app.bsky.embed.images') {
    for (const img of embed.images) {
      images.push({
        url: getCdnImageUrl(post.author.did, img.image.ref.$link, img.image.mimeType),
        alt: img.alt,
      });
    }
  } else if (embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media.$type === 'app.bsky.embed.images') {
    for (const img of embed.media.images) {
      images.push({
        url: getCdnImageUrl(post.author.did, img.image.ref.$link, img.image.mimeType),
        alt: img.alt,
      });
    }
  }
  return images;
}

export function ComposePage({ client, replyTo, quoteUri, draftId, initialText, goBack, goHome, goTo, polishConfig }: ComposePageProps) {
  const { t } = useI18n();
  const handlePosted = useCallback((uris?: string[]) => {
    if (uris && uris.length > 0) {
      goTo({ type: 'thread', uri: uris[0] });
    } else {
      goHome();
    }
  }, [goTo, goHome]);
  const { posts, addPost, removePost, setPostText, submitting, error, setReplyTo, setQuoteUri, threadgateRules, setThreadgateRules, submit, loadFromDraft, toDraftData } = useCompose(client, goBack, handlePosted);
  const { drafts, saveDraft } = useDrafts(client);
  const [replyHandle, setReplyHandle] = useState<string | null>(null);
  const [replyAncestors, setReplyAncestors] = useState<PostView[]>([]);

  // Pre-fill initial text if provided (from "Share" actions in other pages)
  const initialTextAppliedRef = useRef(false);
  useEffect(() => {
    if (initialText && !initialTextAppliedRef.current && !draftId) {
      loadFromDraft([{ text: initialText }]);
      initialTextAppliedRef.current = true;
    }
  }, [initialText, draftId, loadFromDraft]);
  const [perPostImages, setPerPostImages] = useState<Map<string, LocalImage[]>>(new Map());
  const [perPostVideos, setPerPostVideos] = useState<Map<string, LocalVideo | null>>(new Map());
  const [compressInfo, setCompressInfo] = useState<string | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [postQuoteUris, setPostQuoteUris] = useState<Map<string, string>>(new Map());
  const [postQuotePreviews, setPostQuotePreviews] = useState<Map<string, QuotePreview | null>>(new Map());
  const [postQuoteLoading, setPostQuoteLoading] = useState<Map<string, boolean>>(new Map());
  const [quoteInputExpanded, setQuoteInputExpanded] = useState<Set<string>>(new Set());
  const [quoteInputValues, setQuoteInputValues] = useState<Map<string, string>>(new Map());
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [draftSaveHint, setDraftSaveHint] = useState(false);
  const [showThreadgate, setShowThreadgate] = useState(false);
  const [selectedThreadgate, setSelectedThreadgate] = useState<string>('everyone');
  const [selectedListUri, setSelectedListUri] = useState('');
  const [userLists, setUserLists] = useState<ListView[]>([]);
  const [submitProgress, setSubmitProgress] = useState<SubmitProgress>({ visible: false, phase: 'media', current: 0, total: 0, message: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileTargetPostId, setFileTargetPostId] = useState<string | null>(null);
  const [polishTargetPostId, setPolishTargetPostId] = useState<string | null>(null);
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const [showPostedOverlay, setShowPostedOverlay] = useState(false);
  const postedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const threadgateOptions = [
    { value: 'everyone', label: t('compose.everyone') },
    { value: 'nobody', label: t('compose.nobody') },
    { value: 'mentioned', label: t('compose.onlyMentioned') },
    { value: 'followers', label: t('compose.onlyFollowers') },
    { value: 'following', label: t('compose.onlyFollowing') },
    { value: 'list', label: t('compose.onlyLists') },
  ];

  const selectedThreadgateRules = buildThreadgateRules(selectedThreadgate, selectedThreadgate === 'list' ? selectedListUri : undefined);

  // Sync threadgate rules to useCompose
  useEffect(() => {
    setThreadgateRules(selectedThreadgateRules);
  }, [selectedThreadgate, selectedListUri, setThreadgateRules]);

  // Fetch user lists when selecting list mode
  useEffect(() => {
    if (selectedThreadgate === 'list') {
      client.getLists(client.getHandle()).then(r => setUserLists(r.lists)).catch(() => {});
    }
  }, [selectedThreadgate, client]);

  // Keep polish target in sync: default to first non-empty post, or first post
  useEffect(() => {
    setPolishTargetPostId(prev => {
      if (prev && posts.some(p => p.id === prev)) return prev;
      return posts.find(p => p.text.trim())?.id ?? posts[0]?.id ?? null;
    });
  }, [posts]);

  // Initialize replyTo — show @handle + fetch parent ancestors for display
  useEffect(() => {
    if (replyTo) {
      setReplyTo(replyTo);
      const parts = replyTo.match(/^at:\/\/(did:plc:[^/]+)\/([^/]+)\/([^/]+)$/);
      if (parts) {
        const did = parts[1]!;
        client.getProfile(did).then(profile => setReplyHandle(profile.handle)).catch(() => setReplyHandle(did));
      }
      // Fetch parent chain for reply ancestor display (req 5)
      client.getPostThread(replyTo, 3, 0).then(res => {
        const ancestors: PostView[] = [];
        let current = res.thread;
        while (current.$type === 'app.bsky.feed.defs#threadViewPost' && current.parent) {
          if (current.parent.$type === 'app.bsky.feed.defs#threadViewPost') {
            ancestors.push(current.parent.post);
            current = current.parent;
          } else break;
        }
        setReplyAncestors(ancestors);
      }).catch(() => {});
    } else {
      setReplyTo(undefined);
      setReplyHandle(null);
      setReplyAncestors([]);
    }
  }, [replyTo, client, setReplyTo]);

  // Initialize per-post quote from navigation quoteUri (assign to first post)
  useEffect(() => {
    if (quoteUri && posts.length > 0) {
      setQuoteUri(quoteUri);
      const firstId = posts[0]!.id;
      if (!postQuoteUris.has(firstId)) {
        setPostQuoteUris(prev => {
          if (prev.has(firstId)) return prev;
          return new Map(prev).set(firstId, quoteUri);
        });
        setQuoteInputValues(prev => new Map(prev).set(firstId, quoteUri));
        // Fetch quote preview for first post
        fetchPostQuote(firstId, quoteUri);
      }
    } else if (!quoteUri) {
      setQuoteUri(undefined);
    }
    // Only run on mount / quoteUri prop change, not on every posts change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteUri, setQuoteUri]);

  const fetchPostQuote = useCallback(async (postId: string, uri: string) => {
    setPostQuoteLoading(prev => new Map(prev).set(postId, true));
    try {
      const res = await client.getPostThread(uri, 0, 0);
      if (res.thread.$type === 'app.bsky.feed.defs#threadViewPost') {
        const post = res.thread.post;
        setPostQuotePreviews(prev => new Map(prev).set(postId, {
          authorName: post.author.displayName || post.author.handle,
          authorHandle: post.author.handle,
          authorAvatar: post.author.avatar,
          text: post.record.text,
          images: extractQuotePreviews(post),
          indexedAt: post.indexedAt ?? '',
        }));
      } else {
        setPostQuotePreviews(prev => new Map(prev).set(postId, null));
      }
    } catch {
      setPostQuotePreviews(prev => new Map(prev).set(postId, null));
    } finally {
      setPostQuoteLoading(prev => new Map(prev).set(postId, false));
    }
  }, [client]);

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 56) + 'px';
  }, []);

  // Load draft if draftId is provided
  useEffect(() => {
    if (draftId) {
      const draft = drafts.find(d => d.id === draftId);
      if (draft) {
        loadFromDraft(draft.posts, draft.replyTo, draft.quoteUri);
        goTo({ type: 'compose' } as AppView);
      }
    }
  }, [draftId, drafts]);

  // Bridge the currently-focused post's draft to widget system
  useEffect(() => {
    const targetPost = posts.find(p => p.id === polishTargetPostId) ?? posts.find(p => p.text.trim()) ?? posts[0];
    setComposeDraftForWidgets(targetPost?.text ?? '');
  }, [posts, polishTargetPostId]);

  useEffect(() => {
    registerComposeDraftSetter((text) => {
      const targetPost = posts.find(p => p.id === polishTargetPostId) ?? posts.find(p => p.text.trim()) ?? posts[0];
      if (targetPost) setPostText(targetPost.id, text);
    });
    return () => registerComposeDraftSetter(null);
  }, [posts, polishTargetPostId]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!fileTargetPostId) return;
    const files = Array.from(e.target.files ?? []);

    const currentImages = perPostImages.get(fileTargetPostId) ?? [];
    const currentVideo = perPostVideos.get(fileTargetPostId) ?? null;

    const videoFile = files.find(f => f.type.startsWith('video/'));
    if (videoFile) {
      if (currentVideo) { alert('Only 1 video allowed'); return; }
      if (currentImages.length > 0) { alert('Cannot mix video with images'); return; }
      if (videoFile.size > MAX_VIDEO_SIZE) { alert(`"${videoFile.name}" exceeds 100MB limit`); return; }
      setPerPostVideos(prev => new Map(prev).set(fileTargetPostId, {
        file: videoFile,
        preview: URL.createObjectURL(videoFile),
        uploading: false,
      }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (currentVideo) { alert('Cannot mix images with video'); return; }
    if (currentImages.length + imageFiles.length > MAX_IMAGES) {
      alert(t('compose.maxImages', { n: MAX_IMAGES }));
      return;
    }
    const newImages: LocalImage[] = [];
    const compressNotices: string[] = [];
    for (const file of imageFiles) {
      const result = await compressImage(file);
      if (result.wasCompressed) {
        compressNotices.push(
          `${result.originalName}: ${formatSize(result.originalSize)} → ${formatSize(result.compressedSize)}`,
        );
      }
      newImages.push({
        file: result.file,
        preview: URL.createObjectURL(result.file),
        uploading: false,
        altText: '',
      });
    }
    if (compressNotices.length > 0) {
      setCompressInfo(compressNotices.join('; '));
      setTimeout(() => setCompressInfo(null), 5000);
    }
    setPerPostImages(prev => {
      const next = new Map(prev);
      next.set(fileTargetPostId, [...(next.get(fileTargetPostId) ?? []), ...newImages].slice(0, MAX_IMAGES));
      return next;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [fileTargetPostId, perPostImages, perPostVideos, t]);

  const removeImage = useCallback((postId: string, idx: number) => {
    setPerPostImages(prev => {
      const next = new Map(prev);
      const imgs = next.get(postId) ?? [];
      if (imgs[idx]) URL.revokeObjectURL(imgs[idx]!.preview);
      next.set(postId, imgs.filter((_, i) => i !== idx));
      return next;
    });
  }, []);

  const setImageAlt = useCallback((postId: string, idx: number, alt: string) => {
    setPerPostImages(prev => {
      const next = new Map(prev);
      const imgs = [...(next.get(postId) ?? [])];
      if (imgs[idx]) imgs[idx] = { ...imgs[idx]!, altText: alt };
      next.set(postId, imgs);
      return next;
    });
  }, []);

  const removeVideo = useCallback((postId: string) => {
    setPerPostVideos(prev => {
      const next = new Map(prev);
      const vid = next.get(postId) ?? null;
      if (vid) URL.revokeObjectURL(vid.preview);
      next.set(postId, null);
      return next;
    });
  }, []);

  const handleBack = useCallback(async () => {
    const hasContent = posts.some(p => p.text.trim());
    if (hasContent) {
      setDraftSaveHint(true);
    } else {
      goBack();
    }
  }, [posts, goBack]);

  const confirmSaveDraft = useCallback(async () => {
    const data = toDraftData();
    await saveDraft(data);
    setDraftSaveHint(false);
    goBack();
  }, [toDraftData, saveDraft, goBack]);

  const discardDraft = useCallback(() => {
    setDraftSaveHint(false);
    goBack();
  }, [goBack]);

  const handleLoadDraft = useCallback((draft: AppDraft) => {
    loadFromDraft(draft.posts, draft.replyTo, draft.quoteUri);
    setShowDrafts(false);
  }, [loadFromDraft]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Count total items for progress
    let totalItems = 0;
    for (const post of posts) {
      if (!post.text.trim()) continue;
      totalItems += (perPostImages.get(post.id) ?? []).length;
      if (perPostVideos.get(post.id) ?? null) totalItems += 1;
    }
    const nonEmptyCount = posts.filter(p => p.text.trim()).length;
    totalItems += nonEmptyCount; // post creation steps

    let currentItem = 0;
    setSubmitProgress({ visible: true, phase: 'media', current: 0, total: totalItems, message: '' });

    const mediaMap = new Map<string, ComposeMedia[]>();

    // Upload media for all posts (req 8: progress tracking)
    for (const post of posts) {
      if (!post.text.trim()) continue;
      const imgs = perPostImages.get(post.id) ?? [];
      const vid = perPostVideos.get(post.id) ?? null;
      if (imgs.length === 0 && !vid) continue;

      const uploaded: ComposeMedia[] = [];

      if (vid) {
        currentItem++;
        setSubmitProgress({ visible: true, phase: 'media', current: currentItem, total: totalItems, message: t('compose.uploadProgress', { current: String(currentItem), total: String(totalItems) }) });
        try {
          const data = new Uint8Array(await vid.file.arrayBuffer());
          const res = await client.uploadBlob(data, vid.file.type);
          uploaded.push({
            type: 'video',
            blobRef: { $link: res.blob.ref.$link, mimeType: vid.file.type, size: vid.file.size },
            alt: '',
          });
        } catch {
          setSubmitProgress({ visible: true, phase: 'error', current: currentItem, total: totalItems, message: t('compose.uploadFailed'), error: t('compose.uploadFailed') });
          return;
        }
      }

      if (imgs.length > 0) {
        for (const img of imgs) {
          currentItem++;
          setSubmitProgress({ visible: true, phase: 'media', current: currentItem, total: totalItems, message: t('compose.uploadProgress', { current: String(currentItem), total: String(totalItems) }) });
          try {
            const data = new Uint8Array(await img.file.arrayBuffer());
            const res = await client.uploadBlob(data, img.file.type);
            uploaded.push({
              type: 'image',
              blobRef: { $link: res.blob.ref.$link, mimeType: img.file.type, size: img.file.size },
              alt: img.altText,
            });
          } catch {
            setSubmitProgress({ visible: true, phase: 'error', current: currentItem, total: totalItems, message: t('compose.uploadFailed'), error: t('compose.uploadFailed') });
            return;
          }
        }
      }

      if (uploaded.length > 0) mediaMap.set(post.id, uploaded);
    }

    // Check for missing ALT text
    let noAltCount = 0;
    for (const [, media] of mediaMap) {
      noAltCount += media.filter(m => m.type === 'image' && !m.alt.trim()).length;
    }
    if (noAltCount > 0) {
      const confirmed = window.confirm(t('compose.altWarning', { n: String(noAltCount) }));
      if (!confirmed) {
        setSubmitProgress(prev => ({ ...prev, visible: false }));
        return;
      }
    }

    // Build per-post quote map
    const quoteMap = new Map<string, string>();
    for (const [postId, uri] of postQuoteUris) {
      if (uri) quoteMap.set(postId, uri);
    }

    // Switch to posting phase
    setSubmitProgress({ visible: true, phase: 'posting', current: 0, total: nonEmptyCount, message: t('compose.postProgress', { current: '0', total: String(nonEmptyCount) }) });

    // Override goBack to show "Posted!" before navigating
    // We pass a no-op goBack and handle navigation ourselves after submit
    const originalGoBack = goBack;
    const noOpGoBack = () => {};
    // Re-create a no-goBack version via modified props
    // Actually, we just call submit which will call the goBack from useCompose's closure.
    // The goBack that useCompose captured is our prop goBack.
    // We need a different approach: use submit with options

    try {
      await submit(mediaMap, quoteMap.size > 0 ? quoteMap : undefined);
      // Submit calls goBack internally, which navigates away
      // The progress modal will unmount with the page
    } catch {
      // Error already handled in submit's catch
    }
  }, [posts, perPostImages, perPostVideos, submitting, submit, client, t, postQuoteUris, goBack]);

  const truncate = (s: string, max = 40) => s.length > max ? s.slice(0, max) + '…' : s;

  const isReply = !!replyTo;
  const nonEmptyCount = posts.filter(p => p.text.trim()).length;
  const polishPost = posts.find(p => p.id === polishTargetPostId) ?? posts.find(p => p.text.trim()) ?? posts[0];

  return (
    <div className="min-h-[100dvh] bg-background animate-fadeIn">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={handleBack} className="text-sm text-text-secondary hover:text-text-primary transition-colors">{t('action.cancel')}</button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-text-primary"><Icon name="pencil-line" size={16} /> {isReply ? t('compose.titleReply') : posts.length > 1 ? t('compose.threadTitle') : t('compose.title')}</h1>
            {polishConfig && polishPost?.text?.trim() && (
              <button
                onClick={() => setShowPolishModal(true)}
                className={`text-sm text-purple-500 hover:text-purple-600 transition-colors flex items-center gap-1${getEnabledWidgetIds().includes('polish') ? ' lg:hidden' : ''}`}
              >
                <Icon name="file-text" size={14} /> {t('action.polish')}
                {posts.length > 1 && <span className="text-xs text-text-secondary ml-1">帖子 {posts.indexOf(polishPost!) + 1}/{posts.length}</span>}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isReply && drafts.length > 0 && (
              <button onClick={() => goTo({ type: 'drafts' })} className="text-sm text-text-secondary hover:text-primary transition-colors flex items-center gap-1">
                <Icon name="file-text" size={16} /> {t('drafts.title')} ({drafts.length})
              </button>
            )}
            <button type="submit" form="compose-form" disabled={nonEmptyCount === 0 || submitting}
              className="px-4 py-1.5 rounded-full bg-primary hover:bg-primary-hover text-white font-semibold disabled:opacity-50 transition-colors text-sm">
              {submitting ? t('action.sending') : posts.length > 1 ? t('compose.submitThread', { n: String(nonEmptyCount) }) : t('action.send')}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-content mx-auto px-4 py-4">
        {/* Draft save hint */}
        {draftSaveHint && (
          <div role="alert" className="mb-4 border border-yellow-400 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-4 animate-fadeIn">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">{t('compose.draftSaveHint')}</p>
            <div className="flex gap-2">
              <button onClick={confirmSaveDraft} className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors">
                {t('compose.saveDraft')}
              </button>
              <button onClick={discardDraft} className="px-3 py-1.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors">
                {t('action.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Drafts list overlay */}
        {showDrafts && (
          <div className="mb-4 border border-border rounded-lg bg-surface p-3 space-y-2 animate-fadeIn">
            <p className="text-sm font-semibold text-text-primary">
              <Icon name="file-text" size={16} /> {t('drafts.title')}
            </p>
            <div className="border-t border-border" />
            {drafts.length === 0 && (
              <p className="text-sm text-text-secondary">{t('drafts.empty')}</p>
            )}
            {drafts.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2 py-1">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-text-primary block truncate">{truncate(d.posts[0]?.text?.trim() || '(empty)')}</span>
                  <span className="text-xs text-text-secondary">{d.posts.length > 1 ? `+${d.posts.length - 1}` : ''} {new Date(d.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleLoadDraft(d)} className="text-xs text-primary hover:text-primary-hover px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/10 transition-colors">Load</button>
                  <button onClick={() => saveDraft(d)} className="text-xs text-red-500 hover:text-red-600 px-2 py-0.5 rounded border border-red-500/30 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form id="compose-form" onSubmit={handleSubmit} className="space-y-3">
          {/* ── Reply: display parent ancestors in discussion source style (req 5) ── */}
          {replyAncestors.length > 0 && (
            <div className="space-y-1 animate-fadeIn">
              <p className="text-xs text-text-secondary font-medium pl-4">── {t('thread.discussionSource')} ──</p>
              {replyAncestors.map((ancestor, i) => (
                <div key={i}>
                  <div
                    onClick={() => goTo({ type: 'thread', uri: ancestor.uri })}
                    className="mx-2 px-3 py-2 rounded-xl border border-border bg-surface/20 opacity-60 hover:opacity-100 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-text-primary">
                        {ancestor.author.displayName || ancestor.author.handle}
                      </span>
                      <span className="text-xs text-text-secondary">
                        @{ancestor.author.handle}
                      </span>
                      <span className="text-xs text-text-secondary">·</span>
                      <span className="text-xs text-text-secondary">
                        {formatTime(ancestor.indexedAt ?? '')}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap line-clamp-4">
                      {ancestor.record.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reply handle indicator */}
          {replyTo && replyHandle && (
            <div className="text-sm text-text-secondary bg-surface rounded-lg px-3 py-2 border border-border">
              {t('compose.replyTo')} <span className="text-primary font-medium">@{replyHandle}</span>
            </div>
          )}

          {/* ── Post cards ── */}
          {posts.map((post, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === posts.length - 1;
            const imgs = perPostImages.get(post.id) ?? [];
            const vid = perPostVideos.get(post.id) ?? null;
            const charLen = post.text.length;
            const postQuote = postQuotePreviews.get(post.id);
            const postQuoteUri = postQuoteUris.get(post.id);
            const isQuoteLoading = postQuoteLoading.get(post.id) ?? false;
            const isQuoteExpanded = quoteInputExpanded.has(post.id);
            const quoteInputVal = quoteInputValues.get(post.id) ?? '';

            return (
              <div key={post.id}>
                {idx > 0 && (
                  <div className="flex justify-center py-1 animate-fadeIn">
                    <div className="w-0.5 h-4 bg-border rounded" />
                    <span className="text-xs text-text-secondary mx-2">↓</span>
                    <div className="w-0.5 h-4 bg-border rounded" />
                  </div>
                )}
                <div className={`border border-border rounded-lg bg-surface p-3 space-y-2 transition-all ${idx > 0 ? 'animate-slideUp' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary font-medium">
                      {t('compose.title')} {idx + 1}/{posts.length}
                    </span>
                    {!isReply && !isFirst && (
                      <button
                        type="button"
                        onClick={() => removePost(post.id)}
                        className="text-text-secondary hover:text-red-500 transition-colors"
                        title={t('compose.removePost')}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </div>

                  {/* ── Textarea with red-mark overlay (req 1, 2, 3) ── */}
                  <div className="relative">
                    {/* Background mirror — shows text visually */}
                    <div
                      className="absolute inset-0 pointer-events-none whitespace-pre-wrap break-words text-sm leading-relaxed px-3 py-2 text-text-primary"
                      aria-hidden="true"
                    >
                      {post.text.length <= 300 ? (
                        <span>{post.text}</span>
                      ) : (
                        <>
                          <span>{post.text.slice(0, 300)}</span>
                          <span className="text-red-500">{post.text.slice(300)}</span>
                        </>
                      )}
                    </div>
                    {/* Placeholder shown when empty */}
                    {!post.text && (
                      <div className="absolute inset-0 pointer-events-none px-3 py-2 text-text-secondary/50 text-sm leading-relaxed" aria-hidden="true">
                        {t('compose.placeholder')}
                      </div>
                    )}
                    {/* Transparent textarea for input */}
                    <textarea
                      ref={el => {
                        if (el) textareaRefs.current.set(post.id, el);
                        else textareaRefs.current.delete(post.id);
                      }}
                      value={post.text}
                      onChange={e => {
                        setPostText(post.id, e.target.value);
                        const el = textareaRefs.current.get(post.id);
                        if (el) autoResize(el);
                      }}
                      onInput={e => {
                        const el = e.currentTarget;
                        autoResize(el);
                      }}
                      onFocus={() => setPolishTargetPostId(post.id)}
                      placeholder=""
                      aria-label={t('a11y.composeInput')}
                      disabled={submitting}
                      className="relative w-full resize-none text-sm leading-relaxed px-3 py-2 text-transparent caret-gray-800 dark:caret-gray-200 bg-transparent focus:outline-none disabled:opacity-50"
                      style={{ minHeight: '56px' }}
                    />
                  </div>

                  {/* Char counter with overflow indication */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs tabular-nums transition-colors ${
                        charLen > 300 ? 'text-red-500 font-semibold' : charLen >= 280 ? 'text-yellow-500' : 'text-text-secondary'
                      }`}>
                        {charLen > 300 ? `${charLen}/300 ${t('compose.overLimit', { n: String(charLen - 300) })}` : `${charLen}/300`}
                      </span>
                    </div>
                  </div>

                  {/* ── Inline quote preview per post (req 4, 6) ── */}
                  {isQuoteLoading && (
                    <div className="border border-border rounded-xl p-3 bg-surface animate-pulse">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600" />
                        <div className="h-3 w-20 bg-gray-300 dark:bg-gray-600 rounded" />
                      </div>
                      <div className="h-3 w-full bg-gray-300 dark:bg-gray-600 rounded mb-1" />
                      <div className="h-3 w-2/3 bg-gray-300 dark:bg-gray-600 rounded" />
                    </div>
                  )}
                  {postQuote && !isQuoteLoading && (
                    <div
                      className="border border-border rounded-xl p-3 bg-surface overflow-hidden cursor-pointer hover:bg-surface/80 hover:border-primary/30 transition-all"
                      onClick={(e) => { e.stopPropagation(); goTo({ type: 'thread', uri: postQuoteUri ?? '' }); }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {postQuote.authorAvatar ? (
                          <img src={postQuote.authorAvatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600" />
                        )}
                        <span className="text-xs font-semibold text-text-primary">{postQuote.authorName}</span>
                        <span className="text-xs text-text-secondary">@{postQuote.authorHandle}</span>
                      </div>
                      <p className="text-xs text-text-primary line-clamp-3 break-words whitespace-pre-wrap">{postQuote.text}</p>
                      {postQuote.images.length > 0 && (
                        <div className="mt-1 flex gap-1">
                          {postQuote.images.slice(0, 2).map((img, i) => (
                            <img key={i} src={img.url} alt={img.alt} className="w-16 h-16 object-cover rounded-md" />
                          ))}
                        </div>
                      )}
                      {postQuoteUri && !isFirst && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPostQuoteUris(prev => { const n = new Map(prev); n.delete(post.id); return n; }); setPostQuotePreviews(prev => { const n = new Map(prev); n.delete(post.id); return n; }); }}
                          className="mt-1 text-xs text-red-500 hover:text-red-600 transition-colors"
                        >
                          {t('compose.quoteRemove')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Quote input (req 4: per-post quote) ── */}
                  {!postQuoteUri && !isQuoteLoading && (
                    <div>
                      {!isQuoteExpanded ? (
                        <button
                          type="button"
                          onClick={() => setQuoteInputExpanded(prev => new Set(prev).add(post.id))}
                          className="text-xs text-text-secondary hover:text-primary transition-colors flex items-center gap-1"
                        >
                          <Icon name="corner-down-right" size={12} /> {t('compose.addQuote')}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 animate-fadeIn">
                          <input
                            type="text"
                            value={quoteInputVal}
                            onChange={e => setQuoteInputValues(prev => new Map(prev).set(post.id, e.target.value))}
                            onBlur={() => {
                              const val = quoteInputValues.get(post.id) ?? '';
                              if (val.startsWith('at://')) {
                                setPostQuoteUris(prev => new Map(prev).set(post.id, val));
                                fetchPostQuote(post.id, val);
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const val = quoteInputValues.get(post.id) ?? '';
                                if (val.startsWith('at://')) {
                                  setPostQuoteUris(prev => new Map(prev).set(post.id, val));
                                  fetchPostQuote(post.id, val);
                                }
                              }
                              if (e.key === 'Escape') {
                                setQuoteInputExpanded(prev => { const n = new Set(prev); n.delete(post.id); return n; });
                                setQuoteInputValues(prev => { const n = new Map(prev); n.delete(post.id); return n; });
                              }
                            }}
                            placeholder={t('compose.quotePlaceholder')}
                            autoFocus
                            className="flex-1 px-2 py-1 text-xs rounded border border-border bg-surface text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setQuoteInputExpanded(prev => { const n = new Set(prev); n.delete(post.id); return n; });
                              setQuoteInputValues(prev => { const n = new Map(prev); n.delete(post.id); return n; });
                            }}
                            className="text-text-secondary hover:text-text-primary transition-colors"
                          >
                            <Icon name="x" size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Video preview per post */}
                  {vid && (
                    <div className="relative rounded-lg overflow-hidden border border-border">
                      <video src={vid.preview} className="w-full max-h-48 object-contain bg-black" controls preload="metadata" />
                      <button type="button" onClick={() => removeVideo(post.id)} className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs hover:bg-black/80 flex items-center justify-center"><Icon name="x" size={14} /></button>
                    </div>
                  )}

                  {/* Image preview per post */}
                  {imgs.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1">
                        {imgs.map((img, i) => (
                          <div key={i} className="relative rounded overflow-hidden border border-border aspect-square">
                            <img src={img.preview} alt="" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => removeImage(post.id, i)} className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs hover:bg-black/80 flex items-center justify-center"><Icon name="x" size={12} /></button>
                          </div>
                        ))}
                      </div>
                      {imgs.map((img, i) => (
                        <input
                          key={i}
                          type="text"
                          value={img.altText}
                          onChange={(e) => setImageAlt(post.id, i, e.target.value)}
                          placeholder={t('compose.altPlaceholder')}
                          maxLength={500}
                          className="w-full px-2 py-1 text-xs rounded border border-border bg-surface text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      ))}
                    </div>
                  )}

                  {/* Controls per post */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button type="button"
                        onClick={() => { setFileTargetPostId(post.id); fileInputRef.current?.click(); }}
                        disabled={submitting || (vid ? true : imgs.length >= MAX_IMAGES)}
                        className="text-text-secondary hover:text-primary transition-colors text-xs disabled:opacity-30 flex items-center gap-1">
                        <Icon name="camera" size={14} /> {imgs.length > 0 ? `(${imgs.length}/${MAX_IMAGES})` : ''}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileSelect} className="hidden" aria-label="Add media" />

          {/* Compression info */}
          {compressInfo && (
            <div role="status" className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-1.5 transition-all">
              {t('compose.imageCompressed')}: {compressInfo}
            </div>
          )}

          {/* Add post button (for new threads, not replies) */}
          {!isReply && posts.length < 10 && (
            <button type="button" onClick={addPost}
              className="w-full px-3 py-2 rounded-lg border border-dashed border-border text-text-secondary hover:text-primary hover:border-primary transition-colors text-sm flex items-center justify-center gap-1">
              <Icon name="plus" size={14} /> {t('compose.addPost')}
            </button>
          )}

          {/* Threadgate selector — only for original posts and quotes (not replies) */}
          {!isReply && (
            <div className="border border-border rounded-lg bg-surface">
              <button
                type="button"
                onClick={() => setShowThreadgate(!showThreadgate)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                <span className="flex items-center gap-1"><Icon name="corner-down-right" size={14} /> {t('compose.replyRestriction')}</span>
                <Icon name="chevron-down" size={14} className={`transition-transform ${showThreadgate ? 'rotate-180' : ''}`} />
              </button>
              {showThreadgate && (
                <div className="px-3 pb-3 space-y-1.5 border-t border-border pt-2">
                  <p className="text-xs text-text-secondary mb-1">{t('compose.replyRestriction')}</p>
                  {threadgateOptions.map(opt => (
                    <label key={opt.value} className="flex items-start gap-2 py-1 cursor-pointer hover:bg-surface/50 rounded px-2 transition-colors">
                      <input
                        type="radio"
                        name="compose-threadgate"
                        value={opt.value}
                        checked={selectedThreadgate === opt.value}
                        onChange={() => { setSelectedThreadgate(opt.value); if (opt.value !== 'list') setSelectedListUri(''); }}
                        className="accent-primary mt-0.5"
                      />
                      <span className="text-sm text-text-primary leading-5">{opt.label}</span>
                    </label>
                  ))}
                  {selectedThreadgate === 'list' && (
                    <div className="ml-6 pl-2 border-l-2 border-border space-y-1 max-h-40 overflow-y-auto">
                      {userLists.length === 0 ? (
                        <p className="text-xs text-text-secondary py-1">{t('compose.noLists')}</p>
                      ) : (
                        userLists.map(lst => (
                          <label key={lst.uri} className="flex items-start gap-2 py-0.5 cursor-pointer hover:bg-surface/50 rounded px-2 transition-colors">
                            <input
                              type="radio"
                              name="compose-threadgate-list"
                              value={lst.uri}
                              checked={selectedListUri === lst.uri}
                              onChange={() => setSelectedListUri(lst.uri)}
                              className="accent-primary mt-0.5"
                            />
                            <span className="text-sm text-text-primary leading-5">{lst.name}</span>
                            <span className="text-xs text-text-secondary leading-5 ml-auto">{lst.listItemCount ?? 0}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  {selectedThreadgate !== 'everyone' && selectedThreadgateRules && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                      {t('thread.replyRestricted', { rule: formatThreadgateSummary(selectedThreadgateRules, 
                        selectedThreadgate === 'list' && selectedListUri 
                          ? [{ uri: selectedListUri, name: userLists.find(l => l.uri === selectedListUri)?.name ?? '' }]
                          : undefined
                      )})}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div role="alert" className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 transition-all">{error}</div>
          )}
        </form>
      </div>

      {/* ── Upload progress modal (req 8) ── */}
      {submitProgress.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-xl shadow-2xl border border-border p-6 w-80 max-w-[90vw] transition-all animate-slideUp">
            <div className="flex flex-col items-center gap-4">
              {/* Icon */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                submitProgress.phase === 'done' ? 'bg-green-100 dark:bg-green-900/30' :
                submitProgress.phase === 'error' ? 'bg-red-100 dark:bg-red-900/30' :
                'bg-primary/10'
              }`}>
                {submitProgress.phase === 'done' ? (
                  <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : submitProgress.phase === 'error' ? (
                  <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
              </div>

              {/* Message */}
              <p className="text-sm text-text-primary font-medium text-center">
                {submitProgress.phase === 'done' ? t('compose.posted') : submitProgress.phase === 'error' ? submitProgress.error : submitProgress.message}
              </p>

              {/* Progress bar (not for done/error) */}
              {submitProgress.phase !== 'done' && submitProgress.phase !== 'error' && submitProgress.total > 0 && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((submitProgress.current / submitProgress.total) * 100)}%` }}
                  />
                </div>
              )}

              {/* Action button for done/error */}
              {submitProgress.phase === 'error' && (
                <button
                  onClick={() => setSubmitProgress(prev => ({ ...prev, visible: false }))}
                  className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary-hover transition-colors"
                >
                  {t('compose.backToCompose')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Posted overlay (quick success flash before navigation) */}
      {showPostedOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-xl shadow-2xl border border-border p-8 w-80 max-w-[90vw] transition-all animate-slideUp">
            <div className="flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-base text-text-primary font-semibold">{t('compose.posted')}</p>
            </div>
          </div>
        </div>
      )}

      {showPolishModal && polishConfig && polishPost && (
        <WidgetModal
          widgetId="polish"
          context={{
            composeDraft: polishPost.text,
            onComposeDraftChange: (text: string) => setPostText(polishPost.id, text),
            polishConfig,
            viewType: 'compose',
          }}
          onClose={() => setShowPolishModal(false)}
        />
      )}
    </div>
  );
}
