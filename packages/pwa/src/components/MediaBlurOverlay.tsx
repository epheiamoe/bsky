import React, { useState } from 'react';
import { useI18n } from '@bsky/app';

interface MediaBlurOverlayProps {
  children: React.ReactNode;
  onShow: () => void;
}

/**
 * [v0.15.0] Twitter-style media blur overlay.
 *
 * Wraps ONLY media (images/video) with high blur + dark overlay.
 * Post text, author, interactions remain fully visible and clickable.
 *
 * Design:
 * ┌─────────────────────────────────────────────┐
 * │ [Author info - fully visible]               │
 * │ [Post text - fully visible]                 │
 * │                                             │
 * │ ┌─────────────────────────────────────────┐ │
 * │ │                                         │ │
 * │ │    [heavily blurred image underneath]   │ │
 * │ │                                         │ │
 * │ │         [eye-off icon]                  │ │
 * │ │         点击显示媒体                      │ │
 * │ │                                         │ │
 * │ └─────────────────────────────────────────┘ │
 * │ [Interactions - fully visible]              │
 * └─────────────────────────────────────────────┘
 */
export function MediaBlurOverlay({ children, onShow }: MediaBlurOverlayProps) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative cursor-pointer group"
      onClick={(e) => { e.stopPropagation(); onShow(); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      aria-label={t('moderation.clickToShowMedia')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onShow();
        }
      }}
    >
      {/* Blurred media underneath */}
      <div className="blur-2xl brightness-50 transition-all duration-300">
        {children}
      </div>

        {/* Dark overlay */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 rounded-lg transition-all duration-300 ${
            isHovered ? 'bg-black/30' : ''
          }`}
        >
          {/* Lucide eye-off icon as inline SVG */}
          <svg
          className="w-8 h-8 text-white/80"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
          />
        </svg>
        <span className="text-sm text-white/90 font-medium">
          {t('moderation.clickToShowMedia')}
        </span>
      </div>
    </div>
  );
}
