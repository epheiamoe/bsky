import React, { useState, useCallback, useRef } from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

/**
 * Data for a single image in a gallery embed.
 * Matches the shape produced by extractGallery() in @bsky/app utils.
 */
export interface GalleryImage {
  thumbnail: string;
  fullsize: string;
  alt: string;
  aspectRatio?: { width: number; height: number };
}

interface GalleryCardProps {
  images: GalleryImage[];
  /** Called when the user clicks/taps the current image. Parent opens lightbox at this index. */
  onImageClick?: (index: number) => void;
}

/**
 * GalleryCard — a swipeable image carousel for `app.bsky.embed.gallery` embeds.
 *
 * Features:
 * - CSS translateX carousel with 300ms transition
 * - Count badge (top-right)
 * - Left/right arrow navigation (disabled at boundaries)
 * - Keyboard: ArrowLeft/ArrowRight, Home/End
 * - Touch swipe with 50px threshold
 * - ALT badge (matching ImageGrid pattern) when alt text is present
 * - Click → onImageClick(current) for lightbox
 * - WCAG: role="region" + aria-roledescription="carousel", slide roles, aria-hidden
 * - Aspect ratio constraint via inline style when provided
 *
 * Accessibility:
 * - Container: role="region" + aria-roledescription="carousel" + aria-label
 * - Slides: role="group" + aria-roledescription="slide" + indexed aria-label
 * - Non-current slides: aria-hidden="true"
 * - Arrow buttons: descriptive aria-labels, aria-disabled at boundaries
 * - Keyboard-operable (tabIndex on container)
 *
 * NOTE: images with 0 length render nothing (returns null).
 */
export function GalleryCard({ images, onImageClick }: GalleryCardProps) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // ── Navigation helpers ────────────────────────────────────────────
  const goTo = useCallback(
    (index: number) => {
      setCurrent(Math.max(0, Math.min(index, images.length - 1)));
    },
    [images.length],
  );

  const goPrev = useCallback(() => goTo(current - 1), [current, goTo]);
  const goNext = useCallback(() => goTo(current + 1), [current, goTo]);

  // ── Keyboard navigation ───────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(images.length - 1);
      }
    },
    [goPrev, goNext, goTo, images.length],
  );

  // ── Touch swipe detection ─────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]!.clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const diff = touchStartX.current - e.changedTouches[0]!.clientX;
      touchStartX.current = null;
      // Require >50px swipe distance to trigger
      if (Math.abs(diff) < 50) return;
      if (diff > 0) {
        goNext();
      } else {
        goPrev();
      }
    },
    [goPrev, goNext],
  );

  // ── Click → delegate to parent for lightbox ─────────────────────
  // Stop propagation so the click doesn't bubble up to PostPreviewCard's
  // onClick handler, which would navigate to the thread page instead.
  const handleImageClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onImageClick?.(current);
    },
    [current, onImageClick],
  );

  // ── Empty state ──────────────────────────────────────────────────
  if (!images.length) return null;

  const isFirst = current === 0;
  const isLast = current === images.length - 1;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={t('gallery.carouselLabel')}
      className="mt-2 focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative overflow-hidden rounded-xl border border-border">
        {/* ═══ Carousel track ═══ */}
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {images.map((img, i) => {
            const isCurrent = i === current;
            const hasAlt = !!img.alt?.trim();
            const style: React.CSSProperties = {};
            if (img.aspectRatio?.width && img.aspectRatio?.height) {
              style.aspectRatio = `${img.aspectRatio.width}/${img.aspectRatio.height}`;
            }

            return (
              <div
                key={i}
                className="w-full shrink-0"
                role="group"
                aria-roledescription="slide"
                aria-label={t('gallery.slideN', { current: i + 1, total: images.length })}
                aria-hidden={!isCurrent || undefined}
              >
                <div className="relative w-full bg-black/5" style={style}>
                  <img
                    src={img.thumbnail}
                    alt={img.alt || t('post.imageAlt', { n: i + 1 })}
                    className="w-full h-full object-cover cursor-pointer select-none"
                    onClick={handleImageClick}
                    loading="lazy"
                    draggable={false}
                  />

                  {/* ALT badge — mirroring ImageGrid pattern */}
                  {hasAlt && (
                    <div
                      className="absolute bottom-1 left-1 bg-black/70 rounded-md px-1.5 py-0.5 z-10 pointer-events-none"
                      role="status"
                      aria-label={t('compose.altLabel')}
                    >
                      <svg
                        width="24"
                        height="14"
                        viewBox="0 0 24 14"
                        fill="none"
                        aria-hidden="true"
                      >
                        <rect width="24" height="14" rx="3" fill="white" fillOpacity="0.9" />
                        <text
                          x="12"
                          y="10"
                          textAnchor="middle"
                          fontSize="8"
                          fontWeight="bold"
                          fill="#374151"
                        >
                          ALT
                        </text>
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══ Count badge (top-right) ═══ */}
        {images.length > 1 && (
          <div
            className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full z-10 pointer-events-none"
            aria-live="polite"
          >
            {current + 1}/{images.length}
          </div>
        )}

        {/* ═══ Navigation arrows ═══ */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              disabled={isFirst}
              className={`absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors z-10 ${
                isFirst ? 'opacity-50 pointer-events-none' : ''
              }`}
              aria-label={t('gallery.prevSlide')}
              aria-disabled={isFirst}
            >
              <Icon name="arrow-big-left" size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={isLast}
              className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors z-10 ${
                isLast ? 'opacity-50 pointer-events-none' : ''
              }`}
              aria-label={t('gallery.nextSlide')}
              aria-disabled={isLast}
            >
              <Icon name="arrow-big-right" size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export { type GalleryCardProps };
