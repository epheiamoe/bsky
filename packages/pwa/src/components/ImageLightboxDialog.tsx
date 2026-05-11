import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface ImageLightboxDialogProps {
  open: boolean;
  images: Array<{ url: string; alt: string }>;
  initial: number;
  sourceRects: DOMRect[];
  naturalAspectRatio: number;
  onClose: () => void;
}

export function ImageLightboxDialog({ open, images, initial, sourceRects, naturalAspectRatio, onClose }: ImageLightboxDialogProps) {
  const [current, setCurrent] = useState(initial);
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'exiting'>('hidden');
  const [crossfade, setCrossfade] = useState(false);
  const [slideDir, setSlideDir] = useState(1);
  const prevOpen = useRef(false);
  const sourceRectsRef = useRef(sourceRects);

  useEffect(() => {
    if (open) setCurrent(initial);
  }, [open, initial]);

  useEffect(() => {
    if (open) sourceRectsRef.current = sourceRects;
  }, [open, sourceRects]);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setPhase('visible');
      const timer = setTimeout(() => setCrossfade(true), 80);
      prevOpen.current = true;
      return () => clearTimeout(timer);
    } else if (!open && prevOpen.current) {
      setPhase('exiting');
      const timer = setTimeout(() => setPhase('hidden'), 250);
      prevOpen.current = false;
      return () => clearTimeout(timer);
    }
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

  const currentRect = sourceRects[current];
  const rect = currentRect || sourceRects[0] || new DOMRect(vw / 2 - 60, vh / 2 - 60, 120, 120);
  const isSourceValid = rect.width > 0 && rect.height > 0
    && rect.top < vh && rect.bottom > 0
    && rect.left < vw && rect.right > 0;

  const exitRects = sourceRectsRef.current;
  const exitCurrentRect = exitRects[current] || exitRects[0] || new DOMRect(vw / 2 - 60, vh / 2 - 60, 120, 120);
  const isExitValid = exitCurrentRect.width > 0 && exitCurrentRect.height > 0
    && exitCurrentRect.top < vh && exitCurrentRect.bottom > 0
    && exitCurrentRect.left < vw && exitCurrentRect.right > 0;

  const fromX = isSourceValid ? rect.left : vw / 2 - (rect.width || 100) / 2;
  const fromY = isSourceValid ? rect.top : vh / 2 - (rect.height || 100) / 2;
  const fromW = rect.width || 100;
  const fromH = rect.height || 100;
  const exitFromX = isExitValid ? exitCurrentRect.left : vw / 2 - (exitCurrentRect.width || 100) / 2;
  const exitFromY = isExitValid ? exitCurrentRect.top : vh / 2 - (exitCurrentRect.height || 100) / 2;
  const exitFromW = exitCurrentRect.width || 100;
  const exitFromH = exitCurrentRect.height || 100;

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasMultiple) { setSlideDir(-1); setCurrent(i => Math.max(0, i - 1)); }
      if (e.key === 'ArrowRight' && hasMultiple) { setSlideDir(1); setCurrent(i => Math.min(images.length - 1, i + 1)); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose, hasMultiple, images.length]);

  const goPrev = () => { setSlideDir(-1); setCurrent(i => Math.max(0, i - 1)); };
  const goNext = () => { setSlideDir(1); setCurrent(i => Math.min(images.length - 1, i + 1)); };

  if (phase === 'hidden') return null;

  const showControls = phase === 'visible' || (phase === 'exiting' && open);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      style={{
        backgroundColor: open ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0)',
        transition: 'background-color 250ms ease-out',
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && open) onClose();
      }}
    >
      {showControls && (
        <button
          className="absolute top-4 right-4 text-white/70 hover:text-white z-10 p-2"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      )}

      {hasMultiple && showControls && (
        <>
          {current > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10 p-2"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          {current < images.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10 p-2"
              onClick={(e) => { e.stopPropagation(); goNext(); }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          )}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm z-10">
            {current + 1} / {images.length}
          </div>
        </>
      )}

      <motion.div
        className="fixed z-[1]"
        style={{ borderRadius: 8, overflow: 'hidden' }}
        initial={{
          left: fromX, top: fromY,
          width: fromW, height: fromH,
        }}
        animate={{
          left: open ? targetX : exitFromX,
          top: open ? targetY : exitFromY,
          width: open ? targetW : exitFromW,
          height: open ? targetH : exitFromH,
        }}
        transition={{ type: 'spring', damping: 35, stiffness: 350, mass: 0.8 }}
        onClick={(e) => e.stopPropagation()}
      >
        <AnimatePresence mode="wait" custom={slideDir}>
          <motion.div
            key={current}
            className="absolute inset-0"
            custom={slideDir}
            initial={{ x: slideDir * 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: slideDir * -80, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {/* Back layer: full image (contain), fades in */}
            <img
              src={img.url}
              alt={img.alt}
              className="absolute inset-0 w-full h-full"
              draggable={false}
              style={{
                objectFit: 'contain',
                opacity: crossfade ? 1 : 0,
                transition: 'opacity 200ms ease-out',
              }}
            />

            {/* Front layer: cropped thumbnail (cover), fades out */}
            <img
              src={img.url}
              alt=""
              className="absolute inset-0 w-full h-full"
              draggable={false}
              style={{
                objectFit: 'cover',
                opacity: crossfade ? 0 : 1,
                transition: 'opacity 200ms ease-out',
              }}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {img.alt && showControls && (
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
