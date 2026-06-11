import React, { useRef, useState } from 'react';
import { Modal } from './Modal.js';
import { useI18n } from '@bsky/app';

export interface LocalCaption {
  lang: string;
  data: Uint8Array;
  fileName: string;
}

interface MediaMetadataModalProps {
  open: boolean;
  mode: 'image' | 'video';
  mediaUrl: string;
  initialAlt: string;
  initialCaptions?: LocalCaption[];
  onClose: () => void;
  onSave: (result: { alt: string; captions?: LocalCaption[] }) => void;
}

export function MediaMetadataModal({
  open,
  mode,
  mediaUrl,
  initialAlt,
  initialCaptions,
  onClose,
  onSave,
}: MediaMetadataModalProps) {
  const { t } = useI18n();
  const [alt, setAlt] = useState(initialAlt);
  const [captions, setCaptions] = useState<LocalCaption[]>(initialCaptions ?? []);
  const [captionLang, setCaptionLang] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxLength = mode === 'image' ? 2000 : 10000;
  const titleKey = mode === 'image' ? 'compose.altTextModalTitle' : 'compose.videoMetadataModalTitle';

  const handleSave = () => {
    onSave({
      alt,
      captions: mode === 'video' ? captions : undefined,
    });
    onClose();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 大小检查：20KB = 20 * 1024 bytes
    if (file.size > 20 * 1024) {
      alert(t('compose.captionTooLarge'));
      return;
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const lang = captionLang.trim() || 'und';

    setCaptions(prev => [...prev, { lang, data, fileName: file.name }]);
    setCaptionLang('');
    // Reset file input so the same file can be selected again if removed
    e.target.value = '';
  };

  const removeCaption = (index: number) => {
    setCaptions(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-text-primary">{t(titleKey)}</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label={t('action.close')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Media preview */}
          <div className="rounded-lg overflow-hidden border border-border">
            {mode === 'image' ? (
              <img src={mediaUrl} alt="" className="w-full max-h-48 object-contain bg-black" />
            ) : (
              <video src={mediaUrl} className="w-full max-h-48 object-contain bg-black" controls muted />
            )}
          </div>

          {/* Description (image mode only) */}
          {mode === 'image' && (
            <p className="text-sm text-text-secondary">{t('compose.altTextDesc')}</p>
          )}

          {/* ALT textarea */}
          <div className="space-y-2">
            <textarea
              value={alt}
              onChange={e => setAlt(e.target.value)}
              placeholder={mode === 'image' ? t('compose.altPlaceholder') : t('compose.videoAltPlaceholder')}
              maxLength={maxLength}
              className="w-full h-24 px-3 py-2 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none text-sm"
            />
            <div className="flex items-center justify-end">
              <span className="text-xs text-text-secondary">{alt.length}/{maxLength}</span>
            </div>
          </div>

          {/* Captions section — video mode only */}
          {mode === 'video' && (
            <div className="space-y-3 pt-2 border-t border-border">
              <h3 className="text-sm font-medium text-text-primary">{t('compose.captionsTitle')}</h3>

              {/* Existing captions list */}
              {captions.length > 0 && (
                <ul className="space-y-2">
                  {captions.map((cap, idx) => (
                    <li key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                        {cap.lang}
                      </span>
                      <span className="flex-1 text-sm text-text-primary truncate">{cap.fileName}</span>
                      <button
                        onClick={() => removeCaption(idx)}
                        className="text-text-secondary hover:text-red-500 transition-colors"
                        aria-label={t('compose.removeCaption')}
                        title={t('compose.removeCaption')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add caption controls */}
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".vtt,text/vtt"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 text-text-secondary hover:text-primary text-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  {t('compose.addCaption')}
                </button>

                <div className="space-y-1">
                  <label className="block text-xs text-text-secondary">{t('compose.captionLang')}</label>
                  <input
                    type="text"
                    value={captionLang}
                    onChange={e => setCaptionLang(e.target.value)}
                    placeholder="en, zh-Hans, ja..."
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  />
                </div>

                <p className="text-xs text-text-secondary">{t('compose.maxCaptions', { n: '20' })}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={handleSave}
            className="w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors"
          >
            {t('action.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Backward-compatible alias for gradual migration
export const AltTextModal = MediaMetadataModal;
