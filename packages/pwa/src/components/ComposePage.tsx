import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCompose, useI18n, useDrafts, extractImages, setComposeDraftForWidgets, registerComposeDraftSetter, getEnabledWidgetIds, formatThreadgateSummary, buildThreadgateRules } from '@bsky/app';
import type { ComposeMedia, ComposePostItem, AppDraft, AppView } from '@bsky/app';
import { BskyClient, makeUniqueVideoName, VideoServiceError } from '@bsky/core';
import type { PostView, AIConfig, ListView, VideoUploadOptions, VideoUploadResult } from '@bsky/core';
import { Icon } from './Icon.js';
import { GalleryCard } from './GalleryCard.js';
import { compressImage, formatSize } from '../utils/compressImage.js';
import { formatTime } from '../utils/format.js';
import { WidgetModal } from './WidgetModal.js';
import { CircularProgress } from './CircularProgress.js';
import { EmojiPicker } from './EmojiPicker.js';
import { MediaMetadataModal, type LocalCaption } from './AltTextModal.js';
import { ContentWarningModal } from './ContentWarningModal.js';
import { ReplyOptionsModal } from './ReplyOptionsModal.js';
import { LanguageSelector } from './LanguageSelector.js';
import { Modal } from './Modal.js';

const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const MAX_VIDEO_SIZE = 300 * 1024 * 1024; // 300MB
const WARN_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB — warning threshold

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
  /** Actual image bytes read immediately after selection to avoid File-reference staleness. */
  data: Uint8Array;
  fileName: string;
  mimeType: string;
  preview: string;
  uploading: boolean;
  error?: string;
  altText: string;
  wasCompressed?: boolean;
  originalSize?: number;
  compressedSize?: number;
  /** Detected native dimensions for gallery embed aspectRatio */
  aspectRatio?: { width: number; height: number };
}

interface LocalVideo {
  /** Actual video bytes read immediately after selection to avoid File-reference staleness. */
  data: Uint8Array;
  fileName: string;
  mimeType: string;
  preview: string;
  uploading: boolean;
  error?: string;
  /** Video ALT text (max 10000 chars in lexicon) */
  alt: string;
  /** VTT caption tracks */
  captions: LocalCaption[];
  /** Detected or user-specified aspect ratio */
  aspectRatio?: { width: number; height: number };
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
  phase: 'media' | 'video_uploading' | 'video_processing' | 'posting' | 'done' | 'error';
  current: number;
  total: number;
  message: string;
  error?: string;
}

export function ComposePage({ client, replyTo, quoteUri, draftId, initialText, goBack, goHome, goTo, polishConfig }: ComposePageProps) {
  const { t, locale: currentLocale } = useI18n();
  const handlePosted = useCallback((uris?: string[]) => {
    goBack();
    // Use setTimeout to ensure goBack completes before goTo
    setTimeout(() => {
      if (uris && uris.length > 0) {
        // Thread: jump to last post; Reply/Quote: jump to first (new) post
        const targetUri = uris.length > 1 ? uris[uris.length - 1] : uris[0];
        goTo({ type: 'thread', uri: targetUri });
      } else {
        goHome();
      }
    }, 0);
  }, [goBack, goTo, goHome]);
  const { posts, addPost, removePost, setPostText, submitting, error, setReplyTo, setQuoteUri, threadgateRules, setThreadgateRules, langs, setLangs, submit, loadFromDraft, toDraftData } = useCompose(client, handlePosted);
  const { drafts, saveDraft, findDuplicateOnServer } = useDrafts(client);
  const [replyHandle, setReplyHandle] = useState<string | null>(null);
  const [replyAncestors, setReplyAncestors] = useState<PostView[]>([]);
  const [replyToPost, setReplyToPost] = useState<PostView | null>(null);

  // Pre-fill initial text if provided
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
  const [postQuoteErrors, setPostQuoteErrors] = useState<Map<string, string>>(new Map());
  const [quoteInputExpanded, setQuoteInputExpanded] = useState<Set<string>>(new Set());
  const [quoteInputValues, setQuoteInputValues] = useState<Map<string, string>>(new Map());
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [showDraftSaveModal, setShowDraftSaveModal] = useState(false);
  const [showThreadgate, setShowThreadgate] = useState(false);
  const [selectedThreadgate, setSelectedThreadgate] = useState<string[]>(['everyone']);
  const [selectedListUri, setSelectedListUri] = useState('');
  const [userLists, setUserLists] = useState<ListView[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState<string | null>(null);
  const [submitProgress, setSubmitProgress] = useState<SubmitProgress>({ visible: false, phase: 'media', current: 0, total: 0, message: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const perPostImagesRef = useRef<Map<string, LocalImage[]>>(perPostImages);
  const perPostVideosRef = useRef<Map<string, LocalVideo | null>>(perPostVideos);
  const [fileTargetPostId, setFileTargetPostId] = useState<string | null>(null);
  const [polishTargetPostId, setPolishTargetPostId] = useState<string | null>(null);
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const [showPostedOverlay, setShowPostedOverlay] = useState(false);
  const postedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAltConfirmModal, setShowAltConfirmModal] = useState(false);
  const [altMissingCount, setAltMissingCount] = useState(0);

  const [showVideoErrorModal, setShowVideoErrorModal] = useState(false);
  const [videoErrorMessage, setVideoErrorMessage] = useState('');
  const videoErrorResolveRef = useRef<((choice: 'retry' | 'skip' | 'cancel') => void) | null>(null);

  // Keep refs in sync with latest state for unmount cleanup
  useEffect(() => { perPostImagesRef.current = perPostImages; }, [perPostImages]);
  useEffect(() => { perPostVideosRef.current = perPostVideos; }, [perPostVideos]);

  // Cleanup all blob URLs + pending timers on unmount
  useEffect(() => {
    return () => {
      for (const imgs of perPostImagesRef.current.values()) {
        imgs.forEach(img => URL.revokeObjectURL(img.preview));
      }
      for (const vid of perPostVideosRef.current.values()) {
        if (vid) URL.revokeObjectURL(vid.preview);
      }
      if (submitProgressTimerRef.current) {
        clearTimeout(submitProgressTimerRef.current);
        submitProgressTimerRef.current = null;
      }
    };
  }, []);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiTargetPostId, setEmojiTargetPostId] = useState<string | null>(null);
  const [altModalOpen, setAltModalOpen] = useState(false);
  const [altModalImageUrl, setAltModalImageUrl] = useState('');
  const [altModalInitialAlt, setAltModalInitialAlt] = useState('');
  const [altModalPostId, setAltModalPostId] = useState('');
  const [altModalImageIdx, setAltModalImageIdx] = useState(0);

  // Video metadata modal state
  const [videoMetaModalOpen, setVideoMetaModalOpen] = useState(false);
  const [videoMetaModalPostId, setVideoMetaModalPostId] = useState('');
  const [videoMetaModalVideo, setVideoMetaModalVideo] = useState<LocalVideo | null>(null);

  const [showReplyOptions, setShowReplyOptions] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [dragOverPostId, setDragOverPostId] = useState<string | null>(null);
  const [focusedPostId, setFocusedPostId] = useState<string>(posts[0]?.id ?? '');
  const [selfLabelsMap, setSelfLabelsMap] = useState<Map<string, string[]>>(new Map());
  const [activeLabelPostId, setActiveLabelPostId] = useState<string | null>(null);

  const selectedThreadgateRules = buildThreadgateRules(selectedThreadgate, selectedListUri);

  // Sync threadgate rules to useCompose
  useEffect(() => {
    setThreadgateRules(selectedThreadgateRules);
  }, [selectedThreadgate, selectedListUri, setThreadgateRules]);

  // Fetch user lists when reply options modal opens
  useEffect(() => {
    if (showReplyOptions) {
      setListsLoading(true);
      setListsError(null);
      client.getLists(client.getHandle())
        .then(r => {
          setUserLists(r.lists);
          setListsLoading(false);
        })
        .catch((e) => {
          setListsError(e instanceof Error ? e.message : String(e));
          setListsLoading(false);
        });
    }
  }, [showReplyOptions, client]);

  // Keep polish target in sync
  useEffect(() => {
    setPolishTargetPostId(prev => {
      if (prev && posts.some(p => p.id === prev)) return prev;
      return posts.find(p => p.text.trim())?.id ?? posts[0]?.id ?? null;
    });
  }, [posts]);

  // Keep focused post in sync
  useEffect(() => {
    if (!posts.some(p => p.id === focusedPostId)) {
      setFocusedPostId(posts[0]?.id ?? '');
    }
  }, [posts]);

  // Initialize replyTo
  useEffect(() => {
    if (replyTo) {
      setReplyTo(replyTo);
      const parts = replyTo.match(/^at:\/\/(did:plc:[^\/]+)\/([^\/]+)\/([^\/]+)$/);
      if (parts) {
        const did = parts[1]!;
        client.getProfile(did).then(profile => setReplyHandle(profile.handle)).catch(() => setReplyHandle(did));
      }
      client.getPostThread(replyTo, 3, 0).then(res => {
        if (res.thread.$type === 'app.bsky.feed.defs#threadViewPost') {
          setReplyToPost(res.thread.post);
        }
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
      setReplyToPost(null);
    }
  }, [replyTo, client, setReplyTo]);

  // Initialize per-post quote from navigation quoteUri
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
        fetchPostQuote(firstId, quoteUri);
      }
    } else if (!quoteUri) {
      setQuoteUri(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteUri, setQuoteUri]);

  const fetchPostQuote = useCallback(async (postId: string, uri: string) => {
    setPostQuoteLoading(prev => new Map(prev).set(postId, true));
    setPostQuoteErrors(prev => { const n = new Map(prev); n.delete(postId); return n; });
    try {
      const res = await client.getPostThread(uri, 0, 0);
      if (res.thread.$type === 'app.bsky.feed.defs#threadViewPost') {
        const post = res.thread.post;
        setPostQuotePreviews(prev => new Map(prev).set(postId, {
          authorName: post.author.displayName || post.author.handle,
          authorHandle: post.author.handle,
          authorAvatar: post.author.avatar,
          text: post.record.text,
          images: extractImages(post),
          indexedAt: post.indexedAt ?? '',
        }));
      } else {
        setPostQuotePreviews(prev => new Map(prev).set(postId, null));
        setPostQuoteErrors(prev => new Map(prev).set(postId, t('compose.quoteInvalid')));
      }
    } catch (e) {
      setPostQuotePreviews(prev => new Map(prev).set(postId, null));
        setPostQuoteErrors(prev => new Map(prev).set(postId, e instanceof Error ? e.message : t('compose.quoteLoadFailed')));
    } finally {
      setPostQuoteLoading(prev => new Map(prev).set(postId, false));
    }
  }, [client]);

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 56) + 'px';
  }, []);

  // [fix] Resize textareas after loading from draft or when posts change
  useEffect(() => {
    requestAnimationFrame(() => {
      for (const [, el] of textareaRefs.current) {
        autoResize(el);
      }
    });
  }, [posts, autoResize]);

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

  // Warn before closing/refreshing if there is unsaved compose state
  useEffect(() => {
    const hasUnsaved = () => {
      const hasText = posts.some(p => p.text.trim());
      const hasImages = posts.some(p => (perPostImages.get(p.id) ?? []).length > 0);
      const hasVideo = posts.some(p => !!(perPostVideos.get(p.id) ?? null));
      const hasQuote = postQuoteUris.size > 0;
      const hasReply = !!replyTo;
      const hasThreadgate = threadgateRules !== undefined && threadgateRules !== null && threadgateRules.length > 0;
      const hasLabels = Array.from(selfLabelsMap.values()).some(arr => arr.length > 0);
      const hasLangs = langs.length > 0;
      return hasText || hasImages || hasVideo || hasQuote || hasReply || hasThreadgate || hasLabels || hasLangs;
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved()) {
        e.preventDefault();
        // Modern browsers show a generic message; returnValue is required for legacy support
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [posts, perPostImages, perPostVideos, postQuoteUris, replyTo, threadgateRules, selfLabelsMap, langs]);

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
    await processFiles(fileTargetPostId, Array.from(e.target.files ?? []));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [fileTargetPostId]);

  const processFiles = useCallback(async (postId: string, files: File[]) => {
    const currentImages = perPostImages.get(postId) ?? [];
    const currentVideo = perPostVideos.get(postId) ?? null;

    const videoFile = files.find(f => f.type.startsWith('video/'));
    if (videoFile) {
      if (currentVideo) { alert('Only 1 video allowed'); return; }
      if (currentImages.length > 0) { alert('Cannot mix video with images'); return; }
      if (videoFile.size > MAX_VIDEO_SIZE) {
        alert(t('compose.maxVideoSize', { size: formatSize(MAX_VIDEO_SIZE) }));
        return;
      }
      // Warning for files between 100MB and 300MB
      if (videoFile.size > WARN_VIDEO_SIZE) {
        const proceed = window.confirm(
          t('compose.videoSizeWarning', {
            size: formatSize(videoFile.size),
            warnSize: formatSize(WARN_VIDEO_SIZE),
          }),
        );
        if (!proceed) return;
      }
      try {
        const data = new Uint8Array(await videoFile.arrayBuffer());
        const blob = new Blob([data], { type: videoFile.type });
        setPerPostVideos(prev => new Map(prev).set(postId, {
          data,
          fileName: videoFile.name,
          mimeType: videoFile.type,
          preview: URL.createObjectURL(blob),
          uploading: false,
          alt: '',
          captions: [],
        }));
        // Detect aspect ratio asynchronously
        const videoEl = document.createElement('video');
        videoEl.preload = 'metadata';
        videoEl.onloadedmetadata = () => {
          setPerPostVideos(prev => {
            const next = new Map(prev);
            const vid = next.get(postId);
            if (vid) {
              next.set(postId, {
                ...vid,
                aspectRatio: { width: videoEl.videoWidth, height: videoEl.videoHeight },
              });
            }
            return next;
          });
          URL.revokeObjectURL(videoEl.src);
        };
        videoEl.onerror = () => {
          URL.revokeObjectURL(videoEl.src);
        };
        videoEl.src = URL.createObjectURL(blob);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        alert(`${t('compose.uploadFailed')}: ${detail}`);
      }
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
      try {
        const result = await compressImage(file);
        if (result.wasCompressed) {
          compressNotices.push(
            `${result.originalName}: ${formatSize(result.originalSize)} → ${formatSize(result.compressedSize)}`,
          );
        }
        const data = new Uint8Array(await result.file.arrayBuffer());
        const blob = new Blob([data], { type: result.file.type });
        const previewUrl = URL.createObjectURL(blob);

        // Detect native image dimensions for gallery embed aspectRatio
        let aspectRatio: { width: number; height: number } | undefined;
        try {
          const bmp = await createImageBitmap(blob);
          aspectRatio = { width: bmp.width, height: bmp.height };
          bmp.close();
        } catch { /* dimension detection failure is non-fatal */ }

        newImages.push({
          data,
          fileName: result.file.name,
          mimeType: result.file.type,
          preview: previewUrl,
          uploading: false,
          altText: '',
          wasCompressed: result.wasCompressed,
          originalSize: result.originalSize,
          compressedSize: result.compressedSize,
          aspectRatio,
        });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        alert(`${t('compose.uploadFailed')}: ${detail}`);
      }
    }
    if (compressNotices.length > 0) {
      setCompressInfo(compressNotices.join('; '));
      setTimeout(() => setCompressInfo(null), 5000);
    }
    setPerPostImages(prev => {
      const next = new Map(prev);
      next.set(postId, [...(next.get(postId) ?? []), ...newImages].slice(0, MAX_IMAGES));
      return next;
    });
  }, [perPostImages, perPostVideos, t]);

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
    // Detect any meaningful compose state that the user might want to preserve
    const hasText = posts.some(p => p.text.trim());
    const hasImages = posts.some(p => (perPostImages.get(p.id) ?? []).length > 0);
    const hasVideo = posts.some(p => !!(perPostVideos.get(p.id) ?? null));
    const hasQuote = postQuoteUris.size > 0;
    const hasReply = !!replyTo;
    const hasThreadgate = threadgateRules !== undefined && threadgateRules !== null && threadgateRules.length > 0;
    const hasLabels = Array.from(selfLabelsMap.values()).some(arr => arr.length > 0);
    const hasLangs = langs.length > 0;

    if (hasText || hasImages || hasVideo || hasQuote || hasReply || hasThreadgate || hasLabels || hasLangs) {
      setShowDraftSaveModal(true);
    } else {
      goBack();
    }
  }, [posts, perPostImages, perPostVideos, postQuoteUris, replyTo, threadgateRules, selfLabelsMap, langs, goBack]);

  const confirmSaveDraft = useCallback(async () => {
    const data = toDraftData();
    const duplicate = findDuplicateOnServer(data);
    if (duplicate) {
      // An identical draft already exists on the PDS — skip redundant save and exit
      setShowDraftSaveModal(false);
      goBack();
      return;
    }
    await saveDraft(data, draftId);
    setShowDraftSaveModal(false);
    goBack();
  }, [toDraftData, saveDraft, findDuplicateOnServer, goBack, draftId]);

  const discardDraft = useCallback(() => {
    setShowDraftSaveModal(false);
    goBack();
  }, [goBack]);

  const handleLoadDraft = useCallback((draft: AppDraft) => {
    loadFromDraft(draft.posts, draft.replyTo, draft.quoteUri);
    setShowDrafts(false);
  }, [loadFromDraft]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // [UX] Check ALT immediately before any upload (images + video)
    let noAltCount = 0;
    for (const post of posts) {
      const imgs = perPostImages.get(post.id) ?? [];
      noAltCount += imgs.filter(img => !img.altText.trim()).length;
      const vid = perPostVideos.get(post.id) ?? null;
      if (vid && !vid.alt.trim()) noAltCount++;
    }
    if (noAltCount > 0) {
      setAltMissingCount(noAltCount);
      setShowAltConfirmModal(true);
      return;
    }

    await executeSubmit();
  }, [posts, perPostImages, perPostVideos, submitting]);

  const executeSubmit = useCallback(async () => {
    // Count posts that have text or media
    const hasContent = (post: typeof posts[0]) => {
      const hasText = !!post.text.trim();
      const hasImages = (perPostImages.get(post.id) ?? []).length > 0;
      const hasVideo = !!(perPostVideos.get(post.id) ?? null);
      return hasText || hasImages || hasVideo;
    };
    const contentPosts = posts.filter(hasContent);
    let totalItems = 0;
    for (const post of contentPosts) {
      totalItems += (perPostImages.get(post.id) ?? []).length;
      const vid = perPostVideos.get(post.id) ?? null;
      if (vid) {
        totalItems += 1; // video blob
        totalItems += vid.captions.length; // caption blobs
      }
    }
    totalItems += contentPosts.length;

    let currentItem = 0;
    setSubmitProgress({ visible: true, phase: 'media', current: 0, total: totalItems, message: '' });

    const mediaMap = new Map<string, ComposeMedia[]>();

    for (const post of contentPosts) {
      const imgs = perPostImages.get(post.id) ?? [];
      const vid = perPostVideos.get(post.id) ?? null;
      if (imgs.length === 0 && !vid) continue;

      const uploaded: ComposeMedia[] = [];

      if (vid) {
        currentItem++;
        const onVideoProgress: VideoUploadOptions['onProgress'] = ({ phase, progress }) => {
          if (phase === 'uploading') {
            setSubmitProgress({
              visible: true,
              phase: 'video_uploading',
              current: progress,
              total: 100,
              message: t('compose.videoUploading'),
            });
          } else {
            setSubmitProgress({
              visible: true,
              phase: 'video_processing',
              current: progress,
              total: 100,
              message: t('compose.videoProcessing', { progress: String(progress) }),
            });
          }
        };

        const tryUploadVideo = async (allowFallback: boolean): Promise<{ result?: VideoUploadResult; error?: VideoServiceError }> => {
          const uniqueName = makeUniqueVideoName(vid.fileName);
          try {
            const result = await client.uploadVideo(vid.data, uniqueName, {
              onProgress: onVideoProgress,
              allowFallback,
            });
            return { result };
          } catch (e) {
            if (e instanceof VideoServiceError) {
              if (e.recoverable && !allowFallback) {
                return { error: e };
              }
            }
            throw e;
          }
        };

        let uploadOutcome: VideoUploadResult | null = null;
        try {
          const firstTry = await tryUploadVideo(false);
          if (firstTry.error) {
            // Recoverable preprocessing failure — ask user whether to retry, skip, or cancel.
            // TODO: replace with structured log
            console.warn('[compose] Video preprocessing failed, showing decision modal:', { postId: post.id, code: firstTry.error.code });
            const choice = await new Promise<'retry' | 'skip' | 'cancel'>((resolve) => {
              setVideoErrorMessage(firstTry.error!.message);
              setShowVideoErrorModal(true);
              videoErrorResolveRef.current = resolve;
            });
            // TODO: replace with structured log
            console.warn('[compose] Video preprocessing decision:', { choice, postId: post.id });
            if (choice === 'retry') {
              const retry = await tryUploadVideo(false);
              if (retry.error) {
                // Second failure on retry — stop and preserve draft.
                setShowVideoErrorModal(false);
                setSubmitProgress({ visible: true, phase: 'error', current: currentItem, total: totalItems, message: t('compose.uploadFailed'), error: t('compose.videoProcessingFailed', { message: retry.error.message }) });
                return;
              }
              uploadOutcome = retry.result ?? null;
            } else if (choice === 'skip') {
              const skip = await tryUploadVideo(true);
              if (skip.error) {
                setShowVideoErrorModal(false);
                setSubmitProgress({ visible: true, phase: 'error', current: currentItem, total: totalItems, message: t('compose.uploadFailed'), error: t('compose.videoProcessingFailed', { message: skip.error.message }) });
                return;
              }
              uploadOutcome = skip.result ?? null;
            } else {
              // cancel: preserve all compose state and close the progress modal
              setShowVideoErrorModal(false);
              setSubmitProgress(prev => ({ ...prev, visible: false }));
              return;
            }
          } else {
            uploadOutcome = firstTry.result ?? null;
          }
        } catch (e) {
          const isTimeout = e instanceof Error &&
            (e.name === 'TimeoutError' || e.message.toLowerCase().includes('timeout'));
          const detail = isTimeout
            ? t('compose.uploadTimeoutDetail', { size: formatSize(vid.data.length) })
            : (e instanceof Error ? e.message : String(e));
          setShowVideoErrorModal(false);
          setSubmitProgress({ visible: true, phase: 'error', current: currentItem, total: totalItems, message: t('compose.uploadFailed'), error: `${t('compose.uploadFailed')}: ${detail}` });
          return;
        }

        if (!uploadOutcome) {
          setSubmitProgress({ visible: true, phase: 'error', current: currentItem, total: totalItems, message: t('compose.uploadFailed'), error: t('compose.uploadFailed') });
          return;
        }

        // Log fallback for observability
        if (!uploadOutcome.processed) {
          // TODO: replace with structured log
          console.warn('[compose] Video Service unavailable; uploaded without preprocessing:', uploadOutcome.fallbackReason);
          setSubmitProgress({ visible: true, phase: 'video_processing', current: 100, total: 100, message: t('compose.videoFallbackNotice') });
        }

        // Upload caption blobs (still use uploadBlob)
        const uploadedCaptions = [];
        for (const caption of vid.captions) {
          currentItem++;
          setSubmitProgress({ visible: true, phase: 'media', current: currentItem, total: totalItems, message: t('compose.uploadProgress', { current: String(currentItem), total: String(totalItems) }) });
          try {
            const capRes = await client.uploadBlob(caption.data, 'text/vtt');
            uploadedCaptions.push({
              lang: caption.lang,
              blobRef: { $link: capRes.blob.ref.$link, mimeType: 'text/vtt', size: caption.data.length },
            });
          } catch (capErr) {
            console.warn('Caption upload failed:', capErr);
          }
        }

        uploaded.push({
          type: 'video',
          blobRef: uploadOutcome.blobRef,
          alt: vid.alt,
          captions: uploadedCaptions.length > 0 ? uploadedCaptions : undefined,
          aspectRatio: vid.aspectRatio,
        });
      }

      if (imgs.length > 0) {
        for (const img of imgs) {
          currentItem++;
          setSubmitProgress({ visible: true, phase: 'media', current: currentItem, total: totalItems, message: t('compose.uploadProgress', { current: String(currentItem), total: String(totalItems) }) });
          try {
            const res = await client.uploadBlob(img.data, img.mimeType);
            uploaded.push({
              type: 'image',
              blobRef: { $link: res.blob.ref.$link, mimeType: img.mimeType, size: img.data.length },
              alt: img.altText,
              aspectRatio: img.aspectRatio,
            });
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            setSubmitProgress({ visible: true, phase: 'error', current: currentItem, total: totalItems, message: t('compose.uploadFailed'), error: `${t('compose.uploadFailed')}: ${detail}` });
            return;
          }
        }
      }

      if (uploaded.length > 0) mediaMap.set(post.id, uploaded);
    }

    const quoteMap = new Map<string, string>();
    for (const [postId, uri] of postQuoteUris) {
      if (uri) quoteMap.set(postId, uri);
    }

    setSubmitProgress({ visible: true, phase: 'posting', current: 0, total: contentPosts.length, message: t('compose.postProgress', { current: '0', total: String(contentPosts.length) }) });

    try {
      await submit(mediaMap, quoteMap.size > 0 ? quoteMap : undefined);
      // Success: show done state briefly then auto-hide
      setSubmitProgress({ visible: true, phase: 'done', current: totalItems, total: totalItems, message: t('compose.posted') });
      if (submitProgressTimerRef.current) clearTimeout(submitProgressTimerRef.current);
      submitProgressTimerRef.current = setTimeout(() => {
        setSubmitProgress(prev => ({ ...prev, visible: false }));
        submitProgressTimerRef.current = null;
      }, 1200);
    } catch (e) {
      // submit() failed — show the error in the progress modal so the user isn't stuck on "posting"
      const detail = e instanceof Error ? e.message : String(e);
      setSubmitProgress({ visible: true, phase: 'error', current: currentItem, total: totalItems, message: t('compose.uploadFailed'), error: detail });
    }
  }, [posts, perPostImages, perPostVideos, submit, client, t, postQuoteUris]);

  const truncate = (s: string, max = 40) => s.length > max ? s.slice(0, max) + '…' : s;

  const isReply = !!replyTo;
  const nonEmptyCount = posts.filter(p => p.text.trim()).length;
  const polishPost = posts.find(p => p.id === polishTargetPostId) ?? posts.find(p => p.text.trim()) ?? posts[0];

  // Derived: can the focused post accept more media?
  const focusedImgs = perPostImages.get(focusedPostId) ?? [];
  const focusedVid = perPostVideos.get(focusedPostId) ?? null;
  const canAddMedia = focusedImgs.length < MAX_IMAGES && !focusedVid && !submitting;

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent, postId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPostId(postId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPostId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, postId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPostId(null);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(postId, files);
    }
  }, [processFiles]);

  // Paste images from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0 && focusedPostId) {
      e.preventDefault();
      processFiles(focusedPostId, imageFiles);
    }
    // If no image files, let default paste behavior handle text
  }, [focusedPostId, processFiles]);

  const openAltModal = (postId: string, imgIdx: number, img: LocalImage) => {
    setAltModalPostId(postId);
    setAltModalImageIdx(imgIdx);
    setAltModalImageUrl(img.preview);
    setAltModalInitialAlt(img.altText);
    setAltModalOpen(true);
  };

  const handleAltSave = ({ alt }: { alt: string }) => {
    setImageAlt(altModalPostId, altModalImageIdx, alt);
  };

  const openVideoMetadataModal = (postId: string, vid: LocalVideo) => {
    setVideoMetaModalPostId(postId);
    setVideoMetaModalVideo(vid);
    setVideoMetaModalOpen(true);
  };

  const handleVideoMetadataSave = ({ alt, captions }: { alt: string; captions?: LocalCaption[] }) => {
    setPerPostVideos(prev => {
      const next = new Map(prev);
      const vid = next.get(videoMetaModalPostId);
      if (vid) {
        next.set(videoMetaModalPostId, {
          ...vid,
          alt,
          captions: captions ?? [],
        });
      }
      return next;
    });
  };

  const insertEmoji = (emoji: string) => {
    if (!emojiTargetPostId) return;
    const post = posts.find(p => p.id === emojiTargetPostId);
    if (!post) return;
    const textarea = textareaRefs.current.get(emojiTargetPostId);
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = post.text.slice(0, start) + emoji + post.text.slice(end);
      setPostText(emojiTargetPostId, newText);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
        textarea.focus();
      });
    } else {
      setPostText(emojiTargetPostId, post.text + emoji);
    }
    setShowEmojiPicker(false);
  };

  const totalCharCount = posts.reduce((sum, p) => sum + p.text.length, 0);

  return (
    <div className="min-h-[100dvh] bg-background animate-fadeIn" onPaste={handlePaste}>
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={handleBack} className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            {t('action.cancel')}
          </button>
          <div className="flex items-center gap-2">
            {!isReply && drafts.length > 0 && (
              <button onClick={() => goTo({ type: 'drafts' })} className="text-sm text-text-secondary hover:text-primary transition-colors">
                {t('drafts.title')} ({drafts.length})
              </button>
            )}
            <button type="submit" form="compose-form" disabled={nonEmptyCount === 0 || submitting}
              className="px-5 py-1.5 rounded-full bg-primary hover:bg-primary-hover text-white font-semibold disabled:opacity-50 transition-colors text-sm"
            >
              {submitting ? t('action.sending') : posts.length > 1 ? t('compose.submitThread', { n: String(nonEmptyCount) }) : t('action.send')}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-content mx-auto">
        <form id="compose-form" onSubmit={handleSubmit} className="divide-y divide-border">
          {/* ── Reply ancestors ── */}
          {(replyToPost || replyAncestors.length > 0) && (
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs text-text-secondary font-medium">── {t('thread.discussionSource')} ──</p>
              {replyAncestors.map((ancestor, i) => (
                <div key={i} onClick={() => goTo({ type: 'thread', uri: ancestor.uri })}
                  className="px-3 py-2 rounded-xl border border-border bg-surface/20 opacity-60 hover:opacity-100 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-text-primary">{ancestor.author.displayName || ancestor.author.handle}</span>
                    <span className="text-xs text-text-secondary">@{ancestor.author.handle}</span>
                    <span className="text-xs text-text-secondary">· {formatTime(ancestor.indexedAt ?? '')}</span>
                  </div>
                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap line-clamp-4">{ancestor.record.text}</p>
                </div>
              ))}
              {replyToPost && (
                <div onClick={() => goTo({ type: 'thread', uri: replyToPost.uri })}
                  className="px-3 py-2 rounded-xl border border-border bg-surface/20 opacity-60 hover:opacity-100 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-text-primary">{replyToPost.author.displayName || replyToPost.author.handle}</span>
                    <span className="text-xs text-text-secondary">@{replyToPost.author.handle}</span>
                    <span className="text-xs text-text-secondary">· {formatTime(replyToPost.indexedAt ?? '')}</span>
                  </div>
                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap line-clamp-4">{replyToPost.record.text}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Post list ── */}
          {posts.map((post, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === posts.length - 1;
            const imgs = perPostImages.get(post.id) ?? [];
            const vid = perPostVideos.get(post.id) ?? null;
            const charLen = post.text.length;
            const postQuote = postQuotePreviews.get(post.id);
            const postQuoteUri = postQuoteUris.get(post.id);
            const isQuoteLoading = postQuoteLoading.get(post.id) ?? false;
            const quoteError = postQuoteErrors.get(post.id);
            const isQuoteExpanded = quoteInputExpanded.has(post.id);
            const quoteInputVal = quoteInputValues.get(post.id) ?? '';
            const isDragOver = dragOverPostId === post.id;

            return (
              <div
                key={post.id}
                className={`px-4 py-3 transition-colors ${isDragOver ? 'bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg' : ''}`}
                onDragOver={(e) => handleDragOver(e, post.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, post.id)}
              >
                {/* Post header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-secondary">
                    {isReply ? t('compose.titleReply') : t('compose.title')} {idx + 1}/{posts.length}
                  </span>
                  {!isReply && !isFirst && (
                    <button
                      type="button"
                      onClick={() => removePost(post.id)}
                      className="text-text-secondary hover:text-red-500 transition-colors"
                      aria-label={t('compose.removePost')}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>

                {/* ── Quote preview (above text input) ── */}
                {isQuoteLoading && (
                  <div className="mb-2 border border-border rounded-xl p-3 bg-surface animate-pulse">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <div className="h-3 w-20 bg-gray-300 dark:bg-gray-600 rounded" />
                    </div>
                    <div className="h-3 w-full bg-gray-300 dark:bg-gray-600 rounded mb-1" />
                    <div className="h-3 w-2/3 bg-gray-300 dark:bg-gray-600 rounded" />
                  </div>
                )}
                {quoteError && !isQuoteLoading && (
                  <div className="mb-2 border border-red-200 dark:border-red-800 rounded-xl p-3 bg-red-50 dark:bg-red-900/20">
                    <div className="flex items-center gap-2">
                      <Icon name="triangle-alert" size={14} className="text-red-500" />
                      <span className="text-xs text-red-600 dark:text-red-400">{quoteError}</span>
                    </div>
                  </div>
                )}
                {postQuote && !isQuoteLoading && !quoteError && (
                  <div className="mb-2 border border-border rounded-xl p-3 bg-surface overflow-hidden"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {postQuote.authorAvatar ? (
                          <img src={postQuote.authorAvatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600" />
                        )}
                        <span className="text-xs font-semibold text-text-primary">{postQuote.authorName}</span>
                        <span className="text-xs text-text-secondary">@{postQuote.authorHandle}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPostQuoteUris(prev => { const n = new Map(prev); n.delete(post.id); return n; });
                          setPostQuotePreviews(prev => { const n = new Map(prev); n.delete(post.id); return n; });
                          setPostQuoteErrors(prev => { const n = new Map(prev); n.delete(post.id); return n; });
                        }}
                        className="text-text-secondary hover:text-red-500 transition-colors"
                        aria-label="Remove quote"
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-text-primary line-clamp-3 break-words whitespace-pre-wrap">{postQuote.text}</p>
                    {postQuote.images.length > 0 && (
                      <div className="mt-1 flex gap-1">
                        {postQuote.images.slice(0, 2).map((img, i) => (
                          <img key={i} src={img.url} alt={img.alt} className="w-16 h-16 object-cover rounded-md" />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Image preview ── */}
                {imgs.length > 0 && imgs.length <= 4 && (
                  <div className="mb-2 grid grid-cols-2 gap-1">
                    {imgs.map((img, i) => (
                      <div key={i} className="relative rounded-lg overflow-hidden border border-border aspect-square group"
                      >
                        <img src={img.preview} alt="" className="w-full h-full object-cover" />
                        {/* Alt text button */}
                        <button
                          type="button"
                          onClick={() => openAltModal(post.id, i, img)}
                          className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-black/60 hover:bg-black/80 text-white text-[10px] font-medium rounded-md transition-colors flex items-center gap-1"
                        >
                          <span>+ {t('compose.altLabel')}</span>
                        </button>
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => removeImage(post.id, i)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors"
                          aria-label="Remove image"
                        >
                          <Icon name="x" size={12} />
                        </button>
                        {/* Edit button */}
                        <button
                          type="button"
                          onClick={() => openAltModal(post.id, i, img)}
                          className="absolute bottom-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                          aria-label="Edit alt text"
                        >
                          <Icon name="pencil" size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Gallery preview (5+ images) ── */}
                {imgs.length > 4 && (
                  <div className="mb-2">
                    <GalleryCard
                      images={imgs.map(img => ({
                        thumbnail: img.preview,
                        fullsize: img.preview,
                        alt: img.altText,
                      }))}
                      onImageClick={(index) => openAltModal(post.id, index, imgs[index]!)}
                    />
                    {/* Count + add-more bar */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-text-secondary tabular-nums">{imgs.length}/{MAX_IMAGES}</span>
                      {imgs.length < MAX_IMAGES && !vid && (
                        <button
                          type="button"
                          onClick={() => { setFileTargetPostId(post.id); fileInputRef.current?.click(); }}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-border bg-surface text-xs text-text-secondary hover:text-primary hover:border-primary/30 transition-colors"
                          aria-label={t('compose.addImage')}
                        >
                          <Icon name="plus" size={10} />
                          <span>{t('compose.addImage')}</span>
                        </button>
                      )}
                    </div>
                    {/* Thumbnail strip — tap to edit alt, hover for remove */}
                    <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                      {imgs.map((img, i) => (
                        <div key={i} className="relative shrink-0 group">
                          <img
                            src={img.preview}
                            alt=""
                            className="w-14 h-14 object-cover rounded-lg border border-border cursor-pointer hover:border-primary/50 transition-colors"
                            onClick={() => openAltModal(post.id, i, img)}
                          />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeImage(post.id, i); }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/70 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Remove image"
                          >
                            <Icon name="x" size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Video preview */}
                {vid && (
                  <div className="mb-2 relative rounded-lg overflow-hidden border border-border">
                    <video src={vid.preview} className="w-full max-h-48 object-contain bg-black" controls preload="metadata" />
                    {/* Subtitle & Alt button */}
                    <button
                      type="button"
                      onClick={() => openVideoMetadataModal(post.id, vid)}
                      className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-black/60 hover:bg-black/80 text-white text-[10px] font-medium rounded-md transition-colors flex items-center gap-1"
                      aria-label={t('compose.videoMetadataButton')}
                    >
                      <span>+ {t('compose.subtitleAltLabel')}</span>
                    </button>
                    <button type="button" onClick={() => removeVideo(post.id)} className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                      aria-label="Remove video"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                )}

                {/* ALT hint bar */}
                {imgs.length > 0 && imgs.some(img => !img.altText.trim()) && (
                  <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-xs text-text-secondary"
                  >
                    <Icon name="badge-info" size={14} className="text-text-secondary shrink-0" />
                    <span>{t('compose.altHint')}</span>
                  </div>
                )}

                {/* ── Textarea ── */}
                <div className="relative">
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
                  {!post.text && (
                    <div className="absolute inset-0 pointer-events-none px-3 py-2 text-text-secondary/50 text-sm leading-relaxed" aria-hidden="true">
                      {t('compose.placeholder')}
                    </div>
                  )}
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
                    onFocus={() => {
                      setFocusedPostId(post.id);
                      setPolishTargetPostId(post.id);
                    }}
                    placeholder=""
                    aria-label={t('a11y.composeInput')}
                    disabled={submitting}
                    className="relative w-full resize-none text-sm leading-relaxed px-3 py-2 text-transparent caret-gray-800 dark:caret-gray-200 bg-transparent focus:outline-none disabled:opacity-50"
                    style={{ minHeight: '56px' }}
                  />
                </div>

                {/* Char count */}
                <div className="flex items-center justify-end mt-1">
                  <span className={`text-xs tabular-nums transition-colors ${
                    charLen > 300 ? 'text-red-500 font-semibold' : charLen >= 280 ? 'text-yellow-500' : 'text-text-secondary'
                  }`}>
                    {charLen > 300 ? `${charLen}/300 +${charLen - 300}` : `${charLen}/300`}
                  </span>
                </div>

                {/* ── Per-post labels button ── */}
                <div className="flex items-center gap-2 mt-2">
                  {(() => {
                    const postLabels = selfLabelsMap.get(post.id) ?? [];
                    return (
                      <button
                        type="button"
                        onClick={() => setActiveLabelPostId(post.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors ${
                          postLabels.length > 0
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-border bg-surface text-text-secondary hover:text-text-primary hover:border-primary/30'
                        }`}
                      >
                        <Icon name="tag" size={12} />
                        <span>{postLabels.length > 0 ? t('compose.labelsCount', { n: String(postLabels.length) }) : t('compose.labels')}</span>
                      </button>
                    );
                  })()}
                </div>

                {/* ── Quote input (pill button style) ── */}
                {!postQuoteUri && !isQuoteLoading && (
                  <div className="mt-2">
                    {!isQuoteExpanded ? (
                      <button
                        type="button"
                        onClick={() => setQuoteInputExpanded(prev => new Set(prev).add(post.id))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-surface text-xs text-text-secondary hover:text-text-primary hover:border-primary/30 transition-colors"
                      >
                        <Icon name="corner-down-right" size={12} />
                        <span>{t('compose.addQuote')}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 animate-fadeIn"
                      >
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
                          placeholder="Paste AT URI to quote..."
                          autoFocus
                          className="flex-1 px-3 py-1.5 text-xs rounded-full border border-border bg-surface text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setQuoteInputExpanded(prev => { const n = new Set(prev); n.delete(post.id); return n; });
                            setQuoteInputValues(prev => { const n = new Map(prev); n.delete(post.id); return n; });
                          }}
                          className="text-text-secondary hover:text-text-primary transition-colors"
                          aria-label="Cancel"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileSelect} className="hidden" aria-label="Add media" />

          {/* Compression info */}
          {compressInfo && (
            <div role="status" className="mx-4 mb-3 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-1.5 transition-all"
            >
              {t('compose.imageCompressed')}: {compressInfo}
            </div>
          )}

          {/* Threadgate controls */}
          {!isReply && (
            <div className="px-4 py-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowReplyOptions(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-surface text-xs text-text-secondary hover:text-text-primary hover:border-primary/30 transition-colors"
              >
                <Icon name="message-square" size={12} />
                <span>{selectedThreadgate.length === 0 || selectedThreadgate.includes('everyone') ? t('compose.everyoneCanInteract') : selectedThreadgateRules ? formatThreadgateSummary(selectedThreadgateRules, selectedListUri ? [{ uri: selectedListUri, name: userLists.find(l => l.uri === selectedListUri)?.name ?? '' }] : undefined) : t('compose.restricted')}</span>
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div role="alert" className="mx-4 mb-3 text-red-500 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 transition-all">{error}</div>
          )}
        </form>
      </div>

      {/* ── Bottom toolbar ── */}
      <div className="sticky bottom-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-t border-border"
      >
        <div className="max-w-content mx-auto px-4 h-12 flex items-center justify-between"
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setFileTargetPostId(focusedPostId); fileInputRef.current?.click(); }}
              disabled={!canAddMedia}
              className="p-2 text-text-secondary hover:text-primary transition-colors disabled:opacity-30"
              aria-label="Add media"
              title={canAddMedia ? undefined : t('compose.maxImages', { n: MAX_IMAGES })}
            >
              <Icon name="camera" size={18} />
            </button>
            {polishConfig && (
              <button
                type="button"
                onClick={() => {
                  if (focusedPostId) {
                    setPolishTargetPostId(focusedPostId);
                    setShowPolishModal(true);
                  }
                }}
                disabled={submitting || !posts.some(p => p.id === focusedPostId && p.text.trim())}
                className="p-2 text-text-secondary hover:text-primary transition-colors disabled:opacity-30"
                aria-label={t('action.polish')}
              >
                <Icon name="sparkles" size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEmojiTargetPostId(focusedPostId);
                setShowEmojiPicker(true);
              }}
              disabled={submitting}
              className="p-2 text-text-secondary hover:text-primary transition-colors disabled:opacity-30"
              aria-label="Add emoji"
            >
              <Icon name="smile" size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (focusedPostId) {
                  setQuoteInputExpanded(prev => new Set(prev).add(focusedPostId));
                }
              }}
              disabled={submitting}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-border bg-surface text-xs text-text-secondary hover:text-text-primary hover:border-primary/30 transition-colors disabled:opacity-30"
              aria-label="Add quote"
            >
              <Icon name="corner-down-right" size={12} />
              <span>{t('compose.quote')}</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!isReply && posts.length < 10 && (
              <button
                type="button"
                onClick={addPost}
                disabled={submitting}
                className="p-2 text-text-secondary hover:text-primary transition-colors disabled:opacity-30"
                aria-label="Add post"
              >
                <Icon name="plus" size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowLanguageSelector(true)}
              disabled={submitting}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30"
              aria-label={t('compose.language')}
            >
              {langs.length === 0
                ? (() => {
                    try {
                      return new Intl.DisplayNames([currentLocale], { type: 'language' }).of(currentLocale) ?? currentLocale.toUpperCase();
                    } catch {
                      return currentLocale.toUpperCase();
                    }
                  })()
                : langs.length === 1
                  ? (() => {
                      try {
                        return new Intl.DisplayNames([currentLocale], { type: 'language' }).of(langs[0]!) ?? langs[0]!.toUpperCase();
                      } catch {
                        return langs[0]!.toUpperCase();
                      }
                    })()
                  : (() => {
                      try {
                        const first = new Intl.DisplayNames([currentLocale], { type: 'language' }).of(langs[0]!) ?? langs[0]!.toUpperCase();
                        return `${first} + ${langs.length - 1}`;
                      } catch {
                        return `${langs[0]!.toUpperCase()} + ${langs.length - 1}`;
                      }
                    })()}
            </button>
            <CircularProgress value={totalCharCount} max={300 * posts.length} />
          </div>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* ALT text modal (image mode) */}
      {altModalOpen && (
        <MediaMetadataModal
          open={altModalOpen}
          mode="image"
          mediaUrl={altModalImageUrl}
          initialAlt={altModalInitialAlt}
          onClose={() => setAltModalOpen(false)}
          onSave={handleAltSave}
        />
      )}

      {/* Video metadata modal (video mode) */}
      {videoMetaModalVideo && (
        <MediaMetadataModal
          open={videoMetaModalOpen}
          mode="video"
          mediaUrl={videoMetaModalVideo.preview}
          initialAlt={videoMetaModalVideo.alt}
          initialCaptions={videoMetaModalVideo.captions}
          onClose={() => setVideoMetaModalOpen(false)}
          onSave={handleVideoMetadataSave}
        />
      )}

      {/* Emoji picker */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={insertEmoji}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {/* Content warning modal */}
      <ContentWarningModal
        open={!!activeLabelPostId}
        selectedLabels={activeLabelPostId ? (selfLabelsMap.get(activeLabelPostId) ?? []) : []}
        onClose={() => setActiveLabelPostId(null)}
        onChange={(labels) => {
          if (activeLabelPostId) {
            setSelfLabelsMap(prev => new Map(prev).set(activeLabelPostId, labels));
          }
        }}
        hasMedia={activeLabelPostId ? ((perPostImages.get(activeLabelPostId)?.length ?? 0) > 0 || !!perPostVideos.get(activeLabelPostId)) : false}
      />

      {/* Reply options modal */}
      <ReplyOptionsModal
        open={showReplyOptions}
        selectedTypes={selectedThreadgate}
        selectedListUri={selectedListUri}
        allowQuote={true}
        userLists={userLists.map(l => ({ uri: l.uri, name: l.name, count: l.listItemCount }))}
        listsLoading={listsLoading}
        listsError={listsError}
        onClose={() => setShowReplyOptions(false)}
        onChangeTypes={(types, listUri) => {
          setSelectedThreadgate(types);
          if (listUri !== undefined) setSelectedListUri(listUri);
        }}
      />

      {/* Upload progress modal */}
      {submitProgress.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn"
        >
          <div className="bg-white dark:bg-[#1A1A1A] rounded-xl shadow-2xl border border-border p-6 w-80 max-w-[90vw] transition-all animate-slideUp"
          >
            <div className="flex flex-col items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                submitProgress.phase === 'done' ? 'bg-green-100 dark:bg-green-900/30' :
                submitProgress.phase === 'error' ? 'bg-red-100 dark:bg-red-900/30' :
                'bg-primary/10'
              }`}
              >
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
              <p className="text-sm text-text-primary font-medium text-center"
              >
                {submitProgress.phase === 'done' ? t('compose.posted') : submitProgress.phase === 'error' ? submitProgress.error : submitProgress.message}
              </p>
              {submitProgress.phase !== 'done' && submitProgress.phase !== 'error' && submitProgress.total > 0 && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden"
                >
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((submitProgress.current / submitProgress.total) * 100)}%` }}
                  />
                </div>
              )}
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

      {/* Language selector modal */}
      <LanguageSelector
        open={showLanguageSelector}
        selectedCodes={langs}
        onChange={setLangs}
        onClose={() => setShowLanguageSelector(false)}
        locale={currentLocale}
      />

      {/* Polish modal */}
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

      {/* Draft save confirmation modal */}
      {showDraftSaveModal && (
        <Modal open onClose={() => setShowDraftSaveModal(false)}>
          <div className="flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h2 className="text-base font-bold text-text-primary">{t('compose.draftSaveModalTitle')}</h2>
              <button onClick={() => setShowDraftSaveModal(false)} className="text-text-secondary hover:text-text-primary transition-colors" aria-label={t('action.close')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-text-secondary">{t('compose.draftSaveModalDesc')}</p>
            </div>
            {/* Footer */}
            <div className="p-4 border-t border-border shrink-0 space-y-2">
              <button
                onClick={confirmSaveDraft}
                className="w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors"
              >
                {t('compose.saveDraft')}
              </button>
              <button
                onClick={discardDraft}
                className="w-full px-4 py-2.5 rounded-lg border border-border text-text-secondary hover:bg-surface text-sm font-semibold transition-colors"
              >
                {t('compose.discardDraft')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Video preprocessing error modal */}
      {showVideoErrorModal && (
        <Modal open onClose={() => {
          setShowVideoErrorModal(false);
          videoErrorResolveRef.current?.('cancel');
          videoErrorResolveRef.current = null;
        }}>
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-text-primary">{t('compose.videoProcessingErrorTitle')}</h3>
                <p className="text-sm text-text-secondary mt-1">{t('compose.videoProcessingErrorMessage')}</p>
                {videoErrorMessage && (
                  <p className="text-xs text-text-secondary mt-1 font-mono">{videoErrorMessage}</p>
                )}
              </div>
            </div>
            <div className="space-y-2 mt-5">
              <button
                onClick={() => {
                  setShowVideoErrorModal(false);
                  videoErrorResolveRef.current?.('retry');
                  videoErrorResolveRef.current = null;
                }}
                className="w-full px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
              >
                {t('compose.retryVideoProcessing')}
              </button>
              <button
                onClick={() => {
                  setShowVideoErrorModal(false);
                  videoErrorResolveRef.current?.('skip');
                  videoErrorResolveRef.current = null;
                }}
                className="w-full px-4 py-2.5 rounded-lg border border-yellow-500/50 text-yellow-700 dark:text-yellow-400 text-sm font-medium hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
              >
                {t('compose.uploadWithoutPreprocessing')}
              </button>
              <button
                onClick={() => {
                  setShowVideoErrorModal(false);
                  videoErrorResolveRef.current?.('cancel');
                  videoErrorResolveRef.current = null;
                }}
                className="w-full px-4 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium hover:bg-surface transition-colors"
              >
                {t('compose.backToCompose')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ALT confirmation modal */}
      {showAltConfirmModal && (
        <Modal open onClose={() => setShowAltConfirmModal(false)}>
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-text-primary">{t('compose.altMissingTitle')}</h3>
                <p className="text-sm text-text-secondary mt-1">{t('compose.altWarning', { n: String(altMissingCount) })}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  setShowAltConfirmModal(false);
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-secondary hover:bg-surface transition-colors"
              >
                {t('compose.addAltNow')}
              </button>
              <button
                onClick={() => {
                  setShowAltConfirmModal(false);
                  executeSubmit();
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
              >
                {t('compose.sendWithoutAlt')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
