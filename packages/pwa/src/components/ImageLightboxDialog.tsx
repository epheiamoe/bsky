import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

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

  useEffect(() => {
    setCurrent(initial);
  }, [initial]);

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

  const portalContent = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="lb"
          className="fixed inset-0 z-[9999]"
          initial={{ backgroundColor: 'rgba(0,0,0,0)' }}
          animate={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
          exit={{ backgroundColor: 'rgba(0,0,0,0)' }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0" onClick={onClose}>
            <motion.button
              className="absolute top-4 right-4 text-white/70 hover:text-white z-10 p-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => { e.stopPropagation(); onClose(); }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </motion.button>

            {hasMultiple && (
              <>
                <motion.button
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10 p-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: current > 0 ? 1 : 0.3 }}
                  onClick={(e) => { e.stopPropagation(); setCurrent(i => Math.max(0, i - 1)); }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                </motion.button>
                <motion.button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10 p-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: current < images.length - 1 ? 1 : 0.3 }}
                  onClick={(e) => { e.stopPropagation(); setCurrent(i => Math.min(images.length - 1, i + 1)); }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                </motion.button>
              </>
            )}

            {hasMultiple && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm z-10">
                {current + 1} / {images.length}
              </div>
            )}
          </div>

          <motion.div
            className="absolute z-[1]"
            onClick={(e) => e.stopPropagation()}
            initial={{
              left: sourceRect.left, top: sourceRect.top,
              width: sourceRect.width, height: sourceRect.height,
              borderRadius: '8px',
            }}
            animate={{
              left: targetX, top: targetY,
              width: targetW, height: targetH,
              borderRadius: '8px',
            }}
            exit={{
              left: sourceRect.left, top: sourceRect.top,
              width: sourceRect.width, height: sourceRect.height,
              borderRadius: '8px',
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 300, mass: 0.8 }}
          >
            <img src={img.url} alt={img.alt} className="w-full h-full object-contain" draggable={false} />
          </motion.div>

          {img.alt && (
            <motion.div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[80vw] z-10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.15, duration: 0.15 }}
            >
              <div className="bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg max-h-20 overflow-y-auto text-center">
                {img.alt}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(portalContent, document.body) : null;
}
