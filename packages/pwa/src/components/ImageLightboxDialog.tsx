import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

interface ImageLightboxDialogProps {
  open: boolean;
  images: Array<{ url: string; alt: string }>;
  initial: number;
  sourceRect: DOMRect;
  naturalAspectRatio: number;
  onClose: () => void;
}

export function ImageLightboxDialog({ open, images, initial, sourceRect, naturalAspectRatio, onClose }: ImageLightboxDialogProps) {
  const [current, setCurrent] = useState(initial);
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'exiting'>('hidden');
  const prevOpen = useRef(false);

  useEffect(() => {
    setCurrent(initial);
  }, [initial]);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setPhase('visible');
    } else if (!open && prevOpen.current) {
      setPhase('exiting');
      const timer = setTimeout(() => setPhase('hidden'), 200);
      return () => clearTimeout(timer);
    }
    prevOpen.current = open;
  }, [open]);

  const img = images[current];
  if (!img) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = vw * 0.9;
  const maxH = vh * 0.9;

  let targetW: number, targetH: number;
  if (naturalAspectRatio > maxW / maxH) {
    targetW = maxW;
    targetH = maxW / naturalAspectRatio;
  } else {
    targetH = maxH;
    targetW = maxH * naturalAspectRatio;
  }
  const targetX = (vw - targetW) / 2;
  const targetY = (vh - targetH) / 2;

  const hasMultiple = images.length > 1;

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasMultiple) setCurrent(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight' && hasMultiple) setCurrent(i => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose, hasMultiple, images.length]);

  if (phase === 'hidden') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      style={{
        pointerEvents: 'auto',
        backgroundColor: open ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0)',
        transition: 'background-color 200ms ease-out',
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && open) onClose();
      }}
    >
      {/* Close button */}
      {open && (
        <button
          className="absolute top-4 right-4 text-white/70 hover:text-white z-10 p-2"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      )}

      {/* Nav arrows */}
      {hasMultiple && open && (
        <>
          {current > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10 p-2"
              onClick={(e) => { e.stopPropagation(); setCurrent(i => i - 1); }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          {current < images.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10 p-2"
              onClick={(e) => { e.stopPropagation(); setCurrent(i => i + 1); }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          )}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm z-10">
            {current + 1} / {images.length}
          </div>
        </>
      )}

      {/* Image with hero animation */}
      <motion.img
        src={img.url}
        alt={img.alt}
        draggable={false}
        style={{
          position: 'fixed',
          borderRadius: 8,
          objectFit: 'contain',
        }}
        initial={{
          left: sourceRect.left,
          top: sourceRect.top,
          width: sourceRect.width,
          height: sourceRect.height,
        }}
        animate={{
          left: open ? targetX : sourceRect.left,
          top: open ? targetY : sourceRect.top,
          width: open ? targetW : sourceRect.width,
          height: open ? targetH : sourceRect.height,
        }}
        transition={{
          type: 'spring',
          damping: 25,
          stiffness: 300,
          mass: 0.8,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />

      {/* Alt text */}
      {img.alt && open && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[80vw] z-10"
          style={{
            opacity: phase === 'visible' ? 1 : 0,
            transition: 'opacity 150ms ease-out',
          }}
        >
          <div className="bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg max-h-20 overflow-y-auto text-center">
            {img.alt}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
