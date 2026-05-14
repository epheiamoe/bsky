import React, { useRef, useState, useCallback } from 'react';
import { useI18n } from '@bsky/app';
import { Modal } from './Modal.js';
import { ImageLightboxDialog } from './ImageLightboxDialog.js';

export interface ImageData {
  url: string;
  alt: string;
}

// Module-level cache for AI-generated ALT text (key = cdnUrl)
const _altCache = new Map<string, string>();

export function ImageGrid({ images, imageDescCallback, singleImageFill }: {
  images: ImageData[];
  imageDescCallback?: (index: number, cdnUrl: string, existingAlt?: string) => Promise<string>;
  singleImageFill?: boolean;
}) {
  const { t } = useI18n();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [lightboxRects, setLightboxRects] = useState<DOMRect[] | null>(null);
  const [naturalAspectRatio, setNaturalAspectRatio] = useState(1);
  const [altPopup, setAltPopup] = useState<{ index: number; text: string; aiText?: string; aiLoading: boolean; aiError?: string } | null>(null);
  const [imgAspectRatio, setImgAspectRatio] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fillMode = singleImageFill ?? true;

  const handleImgClick = useCallback((e: React.MouseEvent<HTMLImageElement>, i: number) => {
    e.stopPropagation();
    const allImgs = gridRef.current?.querySelectorAll<HTMLImageElement>('img');
    if (!allImgs) {
      const rect = e.currentTarget.getBoundingClientRect();
      setLightboxRects([rect]);
      const el = e.currentTarget;
      if (el.naturalWidth && el.naturalHeight) {
        setNaturalAspectRatio(el.naturalWidth / el.naturalHeight);
      } else {
        setNaturalAspectRatio(rect.width / rect.height || 1);
      }
      setLightbox(i);
      return;
    }
    const rects = Array.from(allImgs).map(img => img.getBoundingClientRect());
    setLightboxRects(rects);
    const el = e.currentTarget;
    if (el.naturalWidth && el.naturalHeight) {
      setNaturalAspectRatio(el.naturalWidth / el.naturalHeight);
    } else {
      setNaturalAspectRatio(rects[i]?.width / rects[i]?.height || 1);
    }
    setLightbox(i);
  }, []);

  const grid = (() => {
    const n = images.length;
    if (n === 1) return 'grid-cols-1';
    if (n === 2) return 'grid-cols-2 gap-[2px]';
    if (n === 3) return 'grid-cols-2 gap-[2px]';
    return 'grid-cols-2 gap-[2px]';
  })();

  const handleGenerateAlt = async (i: number, img: ImageData) => {
    if (!imageDescCallback || altPopup?.aiLoading) return;
    const cached = _altCache.get(img.url);
    if (cached) {
      setAltPopup(prev => prev ? { ...prev, aiText: cached, aiLoading: false } : null);
      return;
    }
    setAltPopup(prev => prev ? { ...prev, aiLoading: true, aiError: undefined } : null);
    const MAX_RETRIES = 4;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await imageDescCallback(i, img.url, img.alt);
        if (!result || !result.trim()) {
          setAltPopup(prev => prev ? { ...prev, aiLoading: false, aiError: t('a11y.altErrorEmptyResponse') } : null);
          return;
        }
        _altCache.set(img.url, result);
        setAltPopup(prev => prev ? { ...prev, aiText: result, aiLoading: false, aiError: undefined } : null);
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const is429 = msg.includes('429');
        if (is429 && attempt < MAX_RETRIES) {
          setAltPopup(prev => prev ? { ...prev, aiLoading: true, aiError: t('a11y.altRateLimited', { attempt, max: MAX_RETRIES }) } : null);
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
          continue;
        }
        const friendly = msg.length > 120 ? msg.slice(0, 120) + '…' : msg;
        setAltPopup(prev => prev ? { ...prev, aiLoading: false, aiError: friendly } : null);
        return;
      }
    }
  };

  const handleOpenPopup = (i: number, img: ImageData) => {
    if (altPopup?.index === i) {
      setAltPopup(null);
    } else {
      setAltPopup({ index: i, text: img.alt || '', aiLoading: false });
    }
  };

  return (
    <>
      {images.length === 1 && !fillMode ? (
        <div className="mt-2 rounded-xl overflow-hidden border border-border bg-black/5">
          <div ref={gridRef as React.RefObject<HTMLDivElement>} className="w-full flex items-center justify-center" style={{ maxHeight: 'min(70vh, 600px)' }}>
            {images.map((img, i) => {
              const hasAlt = !!img.alt?.trim();
              return (
                <div key={i} className="relative max-w-full max-h-full">
                  <img
                    src={img.url}
                    alt={img.alt || t('post.imageAlt', { n: i + 1 })}
                    onLoad={(e) => setImgAspectRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
                    className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={(e) => handleImgClick(e, i)}
                  />
                  {(imageDescCallback || hasAlt) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenPopup(i, img); }}
                      className="absolute bottom-1 left-1 bg-black/70 rounded-md px-1.5 py-0.5 hover:bg-black/85 transition-colors z-10"
                      title={img.alt || t('a11y.altNoOriginal')}
                    >
                      <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
                        <rect width="24" height="14" rx="3" fill="white" fillOpacity="0.9" />
                        <text x="12" y="10" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#374151">{hasAlt ? 'ALT' : 'ALT?'}</text>
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-2 rounded-xl overflow-hidden border border-border">
          <div ref={gridRef} className={`grid ${grid}`}>
            {images.map((img, i) => {
              const spanFull = images.length === 3 && i === 2;
              const hasAlt = !!img.alt?.trim();
              return (
                <div key={i} className="relative">
                  <img
                    src={img.url}
                    alt={img.alt || t('post.imageAlt', { n: i + 1 })}
                    width="800" height="600"
                    className={`w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity ${spanFull ? 'col-span-2 h-40' : ''}`}
                    onClick={(e) => handleImgClick(e, i)}
                  />
                  {(imageDescCallback || hasAlt) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenPopup(i, img); }}
                      className="absolute bottom-1 left-1 bg-black/70 rounded-md px-1.5 py-0.5 hover:bg-black/85 transition-colors z-10"
                      title={img.alt || t('a11y.altNoOriginal')}
                    >
                      <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
                        <rect width="24" height="14" rx="3" fill="white" fillOpacity="0.9" />
                        <text x="12" y="10" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#374151">{hasAlt ? 'ALT' : 'ALT?'}</text>
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {images.length > 4 && (
            <div className="text-center text-xs text-text-secondary py-1.5 bg-surface">
              +{images.length - 4} {t('post.imageCount', { n: images.length - 4 })}
            </div>
          )}
        </div>
      )}
      <Modal open={!!altPopup} onClose={() => setAltPopup(null)} titleId="alt-popup-title">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h2 id="alt-popup-title" className="text-sm font-semibold text-text-primary">{t('compose.altLabel')}</h2>
          </div>
          {altPopup?.text?.trim() ? (
            <div className="mb-3">
              <p className="text-[10px] text-text-secondary font-medium mb-0.5">{t('a11y.altOriginal')}</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">{altPopup.text}</p>
            </div>
          ) : (
            <p className="text-sm text-text-secondary italic mb-3">{t('a11y.altNoOriginal')}</p>
          )}
          {altPopup?.aiText && (
            <div className="mb-3 p-2 rounded bg-surface/50 border border-border">
              <p className="text-[10px] text-text-secondary font-medium mb-0.5">{t('a11y.altAIResult')}</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">{altPopup.aiText}</p>
            </div>
          )}
          {altPopup?.aiError && (
            <p className="text-xs text-red-500 mb-3">{altPopup.aiError}</p>
          )}
          {imageDescCallback && (
            <button
              onClick={() => handleGenerateAlt(altPopup!.index, images[altPopup!.index]!)}
              disabled={altPopup?.aiLoading}
              className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {altPopup?.aiLoading ? t('a11y.altGenerating') : altPopup?.aiText ? t('a11y.altRegenerate') : t('a11y.altGenerate')}
            </button>
          )}
        </div>
      </Modal>
      <ImageLightboxDialog
        open={lightbox !== null && lightboxRects !== null}
        images={images}
        initial={lightbox ?? 0}
        sourceRects={lightboxRects ?? [new DOMRect(window.innerWidth / 2 - 60, window.innerHeight / 2 - 60, 120, 120)]}
        naturalAspectRatio={naturalAspectRatio}
        onClose={() => { setLightbox(null); setLightboxRects(null); }}
      />
    </>
  );
}
