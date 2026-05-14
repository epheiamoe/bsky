import { useCallback, useEffect, useRef, useState } from 'react';
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function clampPan(x: number, y: number, scale: number, w: number, h: number) {
  if (scale <= 1) return { x: 0, y: 0 };
  const maxX = (w * (scale - 1)) / 2;
  const maxY = (h * (scale - 1)) / 2;
  return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
}

export function ImageLightboxDialog({ open, images, initial, sourceRects, naturalAspectRatio, onClose }: ImageLightboxDialogProps) {
  const [current, setCurrent] = useState(initial);
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'exiting'>('hidden');
  const [crossfade, setCrossfade] = useState(false);
  const [slideDir, setSlideDir] = useState(1);
  const [{ scale, x, y }, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const prevOpen = useRef(false);
  const sourceRectsRef = useRef(sourceRects);
  const panRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const lastTapRef = useRef(0);
  const touchAnchorRef = useRef({ id: -1, x: 0, y: 0 });
  const hashAtOpenRef = useRef('');

  const handleClose = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) setCurrent(initial);
  }, [open, initial]);

  useEffect(() => {
    if (open) {
      sourceRectsRef.current = sourceRects;
      setTransform({ scale: 1, x: 0, y: 0 });
    }
  }, [open, sourceRects]);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setPhase('visible');
      const timer = setTimeout(() => setCrossfade(true), 80);
      prevOpen.current = true;
      return () => clearTimeout(timer);
    } else if (!open && prevOpen.current) {
      setCrossfade(false);
      setPhase('exiting');
      const timer = setTimeout(() => setPhase('hidden'), 250);
      prevOpen.current = false;
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Back navigation → close lightbox
  useEffect(() => {
    if (!open) return;
    hashAtOpenRef.current = window.location.hash;
    history.pushState({ __viewer: true }, '');
    const onPopState = () => handleClose();
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (history.state?.__viewer && window.location.hash === hashAtOpenRef.current) {
        history.back();
      }
    };
  }, [open, handleClose]);

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

  const rect = sourceRects[current] || sourceRects[0] || new DOMRect(vw / 2 - 60, vh / 2 - 60, 120, 120);
  const isSourceValid = rect.width > 0 && rect.height > 0;

  const exitRects = sourceRectsRef.current;
  const exitRect = exitRects[current] || exitRects[0] || new DOMRect(vw / 2 - 60, vh / 2 - 60, 120, 120);
  const isExitValid = exitRect.width > 0 && exitRect.height > 0;

  const fromX = isSourceValid ? rect.left : vw / 2 - (rect.width || 100) / 2;
  const fromY = isSourceValid ? rect.top : vh / 2 - (rect.height || 100) / 2;
  const fromW = rect.width || 100;
  const fromH = rect.height || 100;
  const exitFromX = isExitValid ? exitRect.left : vw / 2 - (exitRect.width || 100) / 2;
  const exitFromY = isExitValid ? exitRect.top : vh / 2 - (exitRect.height || 100) / 2;
  const exitFromW = exitRect.width || 100;
  const exitFromH = exitRect.height || 100;

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowLeft' && hasMultiple) { setSlideDir(-1); setCurrent(i => Math.max(0, i - 1)); }
      if (e.key === 'ArrowRight' && hasMultiple) { setSlideDir(1); setCurrent(i => Math.min(images.length - 1, i + 1)); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, handleClose, hasMultiple, images.length]);

  // Native wheel listener for desktop Ctrl+scroll zoom (needs passive:false)
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector('.img-lightbox');
    if (!el) return;
    const onWheel = (e: Event) => {
      const we = e as WheelEvent;
      if (!we.ctrlKey && !we.metaKey) return;
      we.preventDefault();
      const delta = -we.deltaY * 0.001;
      const s = scale;
      const newScale = clamp(s * (1 + delta), 1, 5);
      if (newScale !== s) {
        setTransform(prev => {
          const clamped = clampPan(prev.x, prev.y, newScale, targetW, targetH);
          return { scale: newScale, x: clamped.x, y: clamped.y };
        });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, scale, targetW, targetH]);

  const handleDoubleTap = (clientX: number, clientY: number) => {
    if (scale > 1) {
      setTransform({ scale: 1, x: 0, y: 0 });
    } else {
      const targetScale = 2.5;
      const cx = clientX - targetX - targetW / 2;
      const cy = clientY - targetY - targetH / 2;
      const newX = cx - cx * (targetScale / scale);
      const newY = cy - cy * (targetScale / scale);
      const clamped = clampPan(newX, newY, targetScale, targetW, targetH);
      setTransform({ scale: targetScale, x: clamped.x, y: clamped.y });
    }
  };

  const goPrev = () => {
    setTransform({ scale: 1, x: 0, y: 0 });
    setSlideDir(-1);
    setCurrent(i => Math.max(0, i - 1));
  };
  const goNext = () => {
    setTransform({ scale: 1, x: 0, y: 0 });
    setSlideDir(1);
    setCurrent(i => Math.min(images.length - 1, i + 1));
  };

  if (phase === 'hidden') return null;

  const showControls = phase === 'visible' || (phase === 'exiting' && open);

  return createPortal(
    <div
      className="img-lightbox fixed inset-0 z-[9999]"
      style={{
        touchAction: 'none',
        backgroundColor: open ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0)',
        transition: 'background-color 250ms ease-out',
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && open) handleClose();
      }}
    >
      {showControls && (
        <button
          className="absolute top-4 right-4 text-white/70 hover:text-white z-10 p-2"
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
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
        style={{
          borderRadius: 8,
          overflow: open && scale > 1.01 ? 'visible' : 'hidden',
        }}
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
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.pointerType === 'touch') return;
          if (scale > 1) {
            panRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          if (!panRef.current.active) return;
          const dx = e.clientX - panRef.current.lastX;
          const dy = e.clientY - panRef.current.lastY;
          setTransform(prev => {
            const newX = prev.x + dx;
            const newY = prev.y + dy;
            const clamped = clampPan(newX, newY, prev.scale, targetW, targetH);
            return { ...prev, x: clamped.x, y: clamped.y };
          });
          panRef.current.lastX = e.clientX;
          panRef.current.lastY = e.clientY;
        }}
        onPointerUp={() => {
          panRef.current.active = false;
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          handleDoubleTap(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchRef.current = {
              startDist: Math.sqrt(dx * dx + dy * dy),
              startScale: scale,
            };
          } else if (e.touches.length === 1 && scale > 1) {
            touchAnchorRef.current = {
              id: e.touches[0].identifier,
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
            };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinchRef.current) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const ratio = dist / pinchRef.current.startDist;
            const newScale = clamp(pinchRef.current.startScale * ratio, 1, 5);
            setTransform(prev => {
              const clamped = clampPan(prev.x, prev.y, newScale, targetW, targetH);
              return { scale: newScale, x: clamped.x, y: clamped.y };
            });
          } else if (e.touches.length === 1 && touchAnchorRef.current.id >= 0) {
            const dx = e.touches[0].clientX - touchAnchorRef.current.x;
            const dy = e.touches[0].clientY - touchAnchorRef.current.y;
            setTransform(prev => {
              const newX = prev.x + dx;
              const newY = prev.y + dy;
              const clamped = clampPan(newX, newY, prev.scale, targetW, targetH);
              return { ...prev, x: clamped.x, y: clamped.y };
            });
            touchAnchorRef.current = {
              id: e.touches[0].identifier,
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
            };
          }
        }}
        onTouchEnd={(e) => {
          const wasPinching = !!pinchRef.current;
          pinchRef.current = null;
          touchAnchorRef.current.id = -1;
          if (!wasPinching && e.changedTouches.length === 1) {
            const now = Date.now();
            if (now - lastTapRef.current < 300) {
              handleDoubleTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
              lastTapRef.current = 0;
            } else {
              lastTapRef.current = now;
            }
          }
        }}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ translateX: x, translateY: y, scale }}
          transition={{ type: 'spring', damping: 30, stiffness: 350, mass: 0.5 }}
          style={{ transformOrigin: 'center center' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              className="absolute inset-0"
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
