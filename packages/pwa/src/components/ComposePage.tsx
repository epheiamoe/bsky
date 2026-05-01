import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCompose, useI18n, useDrafts, getCdnImageUrl } from '@bsky/app';
import type { ComposeImage, Draft } from '@bsky/app';
import type { BskyClient, PostView } from '@bsky/core';

const MAX_IMAGES = 4;
const MAX_SIZE = 1024 * 1024; // 1MB per image (generous for Bluesky)

interface ComposePageProps {
  client: BskyClient;
  replyTo?: string;
  quoteUri?: string;
  goBack: () => void;
  goHome: () => void;
}

interface LocalImage {
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

export function ComposePage({ client, replyTo, quoteUri, goBack, goHome }: ComposePageProps) {
  const { t } = useI18n();
  const { draft, setDraft, submitting, error, setReplyTo, setQuoteUri, submit } = useCompose(client, goBack, goHome);
  const { drafts, saveDraft, deleteDraft, loadDraft } = useDrafts();
  const [replyHandle, setReplyHandle] = useState<string | null>(null);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [quotePreview, setQuotePreview] = useState<QuotePreview | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replyTo) {
      setReplyTo(replyTo);
      const parts = replyTo.match(/^at:\/\/(did:plc:[^/]+)\/([^/]+)\/([^/]+)$/);
      if (parts) {
        const did = parts[1]!;
        const collection = parts[2]!;
        const rkey = parts[3]!;
        client.getRecord(did, collection, rkey).then(() => {
          client.getProfile(did).then(profile => setReplyHandle(profile.handle)).catch(() => setReplyHandle(did));
        }).catch(() => {});
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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (images.length + files.length > MAX_IMAGES) {
      alert(t('compose.maxImages', { n: MAX_IMAGES }));
      return;
    }
    const newImages: LocalImage[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_SIZE) {
        alert(`"${file.name}" ${t('compose.imageOverLimit')}`);
        continue;
      }
      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        uploading: false,
      });
    }
    setImages(prev => [...prev, ...newImages].slice(0, MAX_IMAGES));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [images.length]);

  const removeImage = useCallback((idx: number) => {
    setImages(prev => { URL.revokeObjectURL(prev[idx]!.preview); return prev.filter((_, i) => i !== idx); });
  }, []);

  const charLen = draft.length;
  const isEmpty = charLen === 0;

  const handleBack = useCallback(() => {
    if (draft.trim().length > 0) {
      const shouldSave = confirm(t('compose.saveDraftBeforeLeave') || 'Save draft before leaving?');
      if (shouldSave) {
        saveDraft({
          id: crypto.randomUUID(),
          text: draft,
          replyTo,
          quoteUri,
        });
      }
    }
    goBack();
  }, [draft, replyTo, quoteUri, goBack, saveDraft, t]);

  const handleLoadDraft = useCallback((d: Draft) => {
    setDraft(d.text);
    if (d.replyTo) {
      setReplyTo(d.replyTo);
    }
    if (d.quoteUri) {
      setQuoteUri(d.quoteUri);
    }
    setShowDrafts(false);
  }, [setDraft, setReplyTo, setQuoteUri]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmpty || submitting) return;

    const uploadedImages: ComposeImage[] = [];
    setImages(prev => prev.map(i => ({ ...i, uploading: true, error: undefined })));

    for (const img of images) {
      try {
        const data = new Uint8Array(await img.file.arrayBuffer());
        const res = await client.uploadBlob(data, img.file.type);
        uploadedImages.push({
          blobRef: { $link: res.blob.ref.$link, mimeType: img.file.type, size: img.file.size },
          alt: '',
        });
      } catch (err) {
        setImages(prev => prev.map((i, idx) => idx === images.indexOf(img) ? { ...i, uploading: false, error: t('compose.uploadFailed') } : i));
        return;
      }
    }

    submit(draft.trim(), replyTo ?? undefined, uploadedImages.length > 0 ? uploadedImages : undefined);
  }, [draft, replyTo, isEmpty, submitting, submit, images, client]);

  const truncate = (s: string, max = 40) => s.length > max ? s.slice(0, max) + '…' : s;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A]">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={handleBack} className="text-sm text-text-secondary hover:text-text-primary transition-colors">{t('action.cancel')}</button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-text-primary">{replyTo ? '✏️ ' + t('compose.titleReply') : '✏️ ' + t('compose.title')}</h1>
            {drafts.length > 0 && (
              <button onClick={() => setShowDrafts(!showDrafts)} className="text-sm text-text-secondary hover:text-primary transition-colors">
                📝 {t('compose.drafts') || 'Drafts'}
              </button>
            )}
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-content mx-auto px-4 py-4">
        {/* Drafts list */}
        {showDrafts && (
          <div className="mb-4 border border-border rounded-lg bg-surface p-3 space-y-2">
            <p className="text-sm font-semibold text-text-primary">
              📝 {t('compose.drafts') || 'Drafts'}
            </p>
            <div className="border-t border-border" />
            {drafts.length === 0 && (
              <p className="text-sm text-text-secondary">{t('compose.noDrafts') || 'No saved drafts'}</p>
            )}
            {drafts.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm text-text-primary flex-1 truncate">{truncate(d.text.trim() || '(empty)')}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleLoadDraft(d)} className="text-xs text-primary hover:text-primary-hover px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/10 transition-colors">Load</button>
                  <button onClick={() => deleteDraft(d.id)} className="text-xs text-red-500 hover:text-red-600 px-2 py-0.5 rounded border border-red-500/30 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <textarea
            value={draft}
            onChange={e => { if (e.target.value.length <= 300) setDraft(e.target.value); }}
            rows={4} maxLength={300} placeholder={t('compose.placeholder')} disabled={submitting}
            className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none text-base leading-relaxed"
          />

          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative rounded-lg overflow-hidden border border-border aspect-square">
                  <img src={img.preview} alt="" className="w-full h-full object-cover" />
                  {img.uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {img.error && <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center text-red-500 text-xs">{img.error}</div>}
                  <button type="button" onClick={() => removeImage(i)} className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs hover:bg-black/80">✕</button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={images.length >= MAX_IMAGES || submitting}
                className="text-text-secondary hover:text-primary transition-colors text-sm disabled:opacity-30">
                🖼 {t('compose.addImage')}{images.length > 0 ? ` (${images.length}/${MAX_IMAGES})` : ''}
              </button>
              <span className={`text-sm tabular-nums ${charLen >= 280 ? 'text-yellow-500' : 'text-text-secondary'}`}>{charLen}/300</span>
            </div>

            <button type="submit" disabled={isEmpty || submitting}
              className="px-6 py-2 rounded-full bg-primary hover:bg-primary-hover text-white font-semibold disabled:opacity-50 transition-colors text-sm">
              {submitting ? t('action.sending') : t('action.send')}
            </button>
          </div>

          {error && (
            <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</div>
          )}
        </form>
      </main>
    </div>
  );
}
