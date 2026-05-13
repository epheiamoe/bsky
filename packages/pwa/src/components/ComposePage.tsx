import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCompose, useI18n, useDrafts, getCdnImageUrl, setComposeDraftForWidgets, registerComposeDraftSetter, getEnabledWidgetIds, formatThreadgateSummary, buildThreadgateRules } from '@bsky/app';
import type { ComposeMedia, ComposePostItem, AppDraft, AppView } from '@bsky/app';
import type { BskyClient, PostView, AIConfig, ListView } from '@bsky/core';
import { Icon } from './Icon.js';
import { compressImage, formatSize } from '../utils/compressImage.js';
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
  const [quotePreview, setQuotePreview] = useState<QuotePreview | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [draftSaveHint, setDraftSaveHint] = useState(false);
  const [showThreadgate, setShowThreadgate] = useState(false);
  const [selectedThreadgate, setSelectedThreadgate] = useState<string>('everyone');
  const [selectedListUri, setSelectedListUri] = useState('');
  const [userLists, setUserLists] = useState<ListView[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileTargetPostId, setFileTargetPostId] = useState<string | null>(null);
  const [polishTargetPostId, setPolishTargetPostId] = useState<string | null>(null);
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

  // Initialize replyTo / quoteUri
  useEffect(() => {
    if (replyTo) {
      setReplyTo(replyTo);
      const parts = replyTo.match(/^at:\/\/(did:plc:[^/]+)\/([^/]+)\/([^/]+)$/);
      if (parts) {
        const did = parts[1]!;
        client.getProfile(did).then(profile => setReplyHandle(profile.handle)).catch(() => setReplyHandle(did));
      }
    } else {
      setReplyTo(undefined);
      setReplyHandle(null);
    }
  }, [replyTo, client, setReplyTo]);

  useEffect(() => {
    if (quoteUri) {
      setQuoteUri(quoteUri);
      setQuoteLoading(true);
      client.getPostThread(quoteUri, 0, 0).then(res => {
        if (res.thread.$type === 'app.bsky.feed.defs#threadViewPost') {
          const post = res.thread.post;
          setQuotePreview({
            authorName: post.author.displayName || post.author.handle,
            authorHandle: post.author.handle,
            authorAvatar: post.author.avatar,
            text: post.record.text,
            images: extractQuotePreviews(post),
            indexedAt: post.indexedAt ?? '',
          });
        }
      }).catch(() => {}).finally(() => setQuoteLoading(false));
    } else {
      setQuoteUri(undefined);
      setQuotePreview(null);
    }
  }, [quoteUri, client, setQuoteUri]);

  // Load draft if draftId is provided
  useEffect(() => {
    if (draftId) {
      const draft = drafts.find(d => d.id === draftId);
      if (draft) {
        loadFromDraft(draft.posts, draft.replyTo, draft.quoteUri);
        // Clear draftId from URL (load once)
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

    const mediaMap = new Map<string, ComposeMedia[]>();

    // Upload media for all posts
    for (const post of posts) {
      if (!post.text.trim()) continue;
      const imgs = perPostImages.get(post.id) ?? [];
      const vid = perPostVideos.get(post.id) ?? null;
      if (imgs.length === 0 && !vid) continue;

      const uploaded: ComposeMedia[] = [];

      if (vid) {
        try {
          const data = new Uint8Array(await vid.file.arrayBuffer());
          const res = await client.uploadBlob(data, vid.file.type);
          uploaded.push({
            type: 'video',
            blobRef: { $link: res.blob.ref.$link, mimeType: vid.file.type, size: vid.file.size },
            alt: '',
          });
        } catch {
          alert(t('compose.uploadFailed') || `Failed to upload video for post`);
          return;
        }
      }

      if (imgs.length > 0) {
        for (const img of imgs) {
          try {
            const data = new Uint8Array(await img.file.arrayBuffer());
            const res = await client.uploadBlob(data, img.file.type);
            uploaded.push({
              type: 'image',
              blobRef: { $link: res.blob.ref.$link, mimeType: img.file.type, size: img.file.size },
              alt: img.altText,
            });
          } catch {
            alert(t('compose.uploadFailed') || `Failed to upload image`);
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
      const confirmed = window.confirm(t('compose.altWarning', { n: noAltCount }));
      if (!confirmed) return;
    }

    await submit(mediaMap);
  }, [posts, perPostImages, perPostVideos, submitting, submit, client, t]);

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
              {submitting ? t('action.sending') : posts.length > 1 ? t('compose.submitThread', { n: nonEmptyCount }) : t('action.send')}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-content mx-auto px-4 py-4">
        {/* Draft save hint */}
        {draftSaveHint && (
          <div role="alert" className="mb-4 border border-yellow-400 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-4">
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
          <div className="mb-4 border border-border rounded-lg bg-surface p-3 space-y-2">
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
          {replyTo && replyHandle && (
            <div className="text-sm text-text-secondary bg-surface rounded-lg px-3 py-2 border border-border">
              {t('compose.replyTo')} <span className="text-primary font-medium">@{replyHandle}</span>
            </div>
          )}

          {/* Quote preview */}
          {quoteLoading && (
            <div className="border border-border rounded-lg p-3 bg-surface animate-pulse">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600" />
                <div className="h-3 w-24 bg-gray-300 dark:bg-gray-600 rounded" />
              </div>
              <div className="h-3 w-full bg-gray-300 dark:bg-gray-600 rounded mb-1" />
              <div className="h-3 w-2/3 bg-gray-300 dark:bg-gray-600 rounded" />
            </div>
          )}
          {quotePreview && !quoteLoading && (
            <div className="border border-border rounded-lg p-3 bg-surface">
              <div className="flex items-center gap-2 mb-1">
                {quotePreview.authorAvatar ? (
                  <img src={quotePreview.authorAvatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600" />
                )}
                <span className="text-sm font-medium text-text-primary">{quotePreview.authorName}</span>
                <span className="text-xs text-text-secondary">@{quotePreview.authorHandle}</span>
              </div>
              <p className="text-sm text-text-primary whitespace-pre-wrap line-clamp-3">{quotePreview.text}</p>
              {quotePreview.images.length > 0 && (
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {quotePreview.images.map((img, i) => (
                    <img key={i} src={img.url} alt={img.alt} className="w-full h-20 object-cover rounded" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Post cards */}
          {posts.map((post, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === posts.length - 1;
            const imgs = perPostImages.get(post.id) ?? [];
            const vid = perPostVideos.get(post.id) ?? null;
            const charLen = post.text.length;

            return (
              <div key={post.id}>
                {idx > 0 && (
                  <div className="flex justify-center py-1">
                    <div className="w-0.5 h-4 bg-border rounded" />
                    <span className="text-xs text-text-secondary mx-2">↓</span>
                    <div className="w-0.5 h-4 bg-border rounded" />
                  </div>
                )}
                <div className="border border-border rounded-lg bg-surface p-3 space-y-2">
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

        <textarea
          value={post.text}
          onChange={e => setPostText(post.id, e.target.value)}
          onFocus={() => setPolishTargetPostId(post.id)}
          rows={3}
          maxLength={300}
          placeholder={t('compose.placeholder')}
          aria-label={t('a11y.composeInput')}
          disabled={submitting}
                    className="w-full px-3 py-2 rounded border border-border bg-white dark:bg-[#1A1A1A] text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none text-sm leading-relaxed"
                  />

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
                      <span className={`text-xs tabular-nums ${charLen >= 280 ? 'text-yellow-500' : 'text-text-secondary'}`}>{charLen}/300</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileSelect} className="hidden" />

          {/* Compression info */}
          {compressInfo && (
            <div role="status" className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-1.5">
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
            <div role="alert" className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</div>
          )}
        </form>
      </div>

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
