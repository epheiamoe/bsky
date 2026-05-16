# Animation System (v0.10.8)

> Image lightbox hero animation + sidebar slide + unified modal system.

## Image Lightbox

### Architecture

```
createPortal → document.body
  └── <div fixed inset-0 z-[9999]>          ← backdrop (CSS transition bg-color)
      └── <motion.div fixed z-[1]>           ← wrapper (spring position/size)
          └── <AnimatePresence mode="wait">   ← image switch animation
              └── <motion.div key={current}>  ← slide + fade per image
                  ├── <img object-fit: contain/>   ← back layer (full image, always visible after crossfade)
                  └── <img object-fit: cover/>     ← front layer (cropped like thumbnail, fades out)
```

### Problems Solved

| # | Symptom | Root Cause | Fix |
|---|---------|-----------|-----|
| 1 | Click outside lightbox → opens post | `click` event not blocked by `onPointerDown` stopPropagation alone | Added `onClick={e => e.stopPropagation()}` on outer div |
| 2 | Image "flies away" on close | `sourceRect` falls back to `DOMRect(0,0,1,1)` during exit | `sourceRectsRef` preserves array from open phase; `isSourceValid` only checks `width>0 && height>0` |
| 3 | Cannot reopen lightbox after first close | `useRef` callback reset race condition on re-render | Changed to `e.currentTarget.getBoundingClientRect()` in click handler |
| 4 | Exit animation shows wrong image (flicker) | `useEffect(() => setCurrent(initial), [initial])` resets to image 0 on close | Added `if (open)` guard: `useEffect(() => { if (open) setCurrent(initial); }, [open, initial])` |
| 5 | Exit always flies to first image's grid position | All images shared one `sourceRect` (clicked image's) | `sourceRects: DOMRect[]` array, one rect per image; uses `sourceRects[current]` |
| 6 | Image switch between arrows has no animation | Missing `AnimatePresence` wrapper | `<AnimatePresence mode="wait"><motion.div key={current} initial={{x:slideDir*80,opacity:0}} ... /></AnimatePresence>` |
| 7 | Second session onwards: wrong initial position | `useState(initial)` stale from previous session | `key={`lb-${lbSession}`}` on component forces remount per session |
| 8 | Timeline cannot scroll | `touch-action: pan-y` + `setPointerCapture` on main container | Removed (reverted); touch drag sidebar postponed |

### Key Data Flow

```
PostCard.ImageGrid
  │ gridRef.current.querySelectorAll('img')
  │ → DOMRect[] per image index
  │
  ▼
ImageLightboxDialog
  │ sourceRects[current]      ← enter position per current image
  │ sourceRectsRef.current[current]  ← exit position per current image
  │
  ▼
motion.div (wrapper)
  initial: sourceRects[current]    → first frame
  animate: target (center)         → spring to center
  exit: sourceRectsRef.current[current] → spring back on close
```

### Lightbox lifecycle (simplified)

```
Mount (open=true)
  ├── useState('hidden') → effect: setPhase('visible')
  ├── motion.div: initial=sourceRects[current] → animate=target
  ├── setTimeout 80ms → crossfade=true (cover fades out, contain fades in)
  └── Keyboard/touch listeners added

Close (open=false)
  ├── effect: setPhase('exiting')
  ├── motion.div: animate=sourceRectsRef.current[current] (shrinks back)
  ├── setTimeout 250ms → setPhase('hidden')
  └── Keyboard/touch listeners removed (via effect cleanup)
```

### `sourceRects` Array

Captured once per click via `gridRef.current.querySelectorAll('img').map(img => img.getBoundingClientRect())`.

Preserved for exit via `useRef(sourceRects)`, updated only when `open=true`.

Fallback: `DOMRect(viewWidth/2, viewHeight/2, 120, 120)` if array empty or index out of range.

### Two-layer Crossfade

- **Back layer**: `object-fit: contain` — shows full image at proper aspect ratio
- **Front layer**: `object-fit: cover` — matches timeline thumbnail crop
- `crossfade` state flips after 80ms: front opacity 1→0, back opacity 0→1

Creates the visual effect of the cropped thumbnail "expanding" to reveal the full image.

### Reuse Guide

To add a new image grid with lightbox somewhere:

```tsx
// 1. Add gridRef + lightboxRects state
const gridRef = useRef<HTMLDivElement>(null);
const [lightbox, setLightbox] = useState<number | null>(null);
const [lightboxRects, setLightboxRects] = useState<DOMRect[] | null>(null);
const [naturalAspectRatio, setNaturalAspectRatio] = useState(1);

// 2. Grid container needs ref
<div ref={gridRef} className="grid ...">
  {images.map((img, i) => (
    <img onClick={(e) => {
      e.stopPropagation();
      const allImgs = gridRef.current?.querySelectorAll<HTMLImageElement>('img');
      if (!allImgs) return;
      const rects = Array.from(allImgs).map(img => img.getBoundingClientRect());
      setLightboxRects(rects);
      setNaturalAspectRatio(el.naturalWidth / el.naturalHeight);
      setLightbox(i);
    }} />
  ))}
</div>

// 3. Render dialog
<ImageLightboxDialog
  open={lightbox !== null && lightboxRects !== null}
  images={images}
  initial={lightbox ?? 0}
  sourceRects={lightboxRects ?? []}
  naturalAspectRatio={naturalAspectRatio}
  onClose={() => { setLightbox(null); setLightboxRects(null); }}
/>
```

## Mobile Sidebar

- `AnimatePresence` handles enter/exit
- Left slide: `x: '-100%' → 0` (spring, damping 25, stiffness 300)
- Backdrop: `bg-black/40 backdrop-blur-sm`
- Touch drag-to-open: pending (reverted due to scroll conflict)

## Unified Modal Component

`packages/pwa/src/components/Modal.tsx`:
- Enter: `scale: 0.95 → 1` + `opacity: 0 → 1`
- Exit: reverse via `AnimatePresence`
- Backdrop: `bg-black/40 backdrop-blur-sm`
- Esc key closes
- Variants: `'center'` (default), `'bottom-sheet'` (slide up)
