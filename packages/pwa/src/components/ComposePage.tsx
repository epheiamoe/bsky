import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCompose, useI18n } from '@bsky/app';
import type { ComposeImage } from '@bsky/app';
import type { BskyClient } from '@bsky/core';

const MAX_IMAGES = 4;
const MAX_SIZE = 1024 * 1024; // 1MB per image (generous for Bluesky)

interface ComposePageProps {
  client: BskyClient;
  replyTo?: string;
  goBack: () => void;
  goHome: () => void;
}

interface LocalImage {
  file: File;
  preview: string;
  uploading: boolean;
  error?: string;
}

export function ComposePage({ client, replyTo, goBack, goHome }: ComposePageProps) {
  const { t } = useI18n();
  const { draft, setDraft, submitting, error, setReplyTo, submit } = useCompose(client, goBack, goHome);
  const [replyHandle, setReplyHandle] = useState<string | null>(null);
  const [images, setImages] = useState<LocalImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replyTo) {
      setReplyTo(replyTo);
      // ...existing reply handle resolution...
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
        return; // Don't post if upload fails
      }
    }

    submit(draft.trim(), replyTo ?? undefined, uploadedImages.length > 0 ? uploadedImages : undefined);
  }, [draft, replyTo, isEmpty, submitting, submit, images, client]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A]">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={goBack} className="text-sm text-text-secondary hover:text-text-primary transition-colors">{t('action.cancel')}</button>
          <h1 className="text-lg font-semibold text-text-primary">{replyTo ? '✏️ ' + t('compose.titleReply') : '✏️ ' + t('compose.title')}</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-content mx-auto px-4 py-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {replyTo && replyHandle && (
            <div className="text-sm text-text-secondary bg-surface rounded-lg px-3 py-2 border border-border">
              {t('compose.replyTo')} <span className="text-primary font-medium">@{replyHandle}</span>
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
