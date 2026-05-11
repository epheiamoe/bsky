import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const _globalHeightCaches = new Map<string, Map<string, number>>();

export function useVirtualizedList<T>(
  items: T[],
  cacheKey: string,
  estimateHeight: number,
  getItemKey: (item: T) => string,
  options?: {
    overscan?: number;
    initialScrollTop?: number;
    onScrollTopChange?: (top: number) => void;
  },
) {
  let _heightCache = _globalHeightCaches.get(cacheKey);
  if (!_heightCache) {
    _heightCache = new Map();
    _globalHeightCaches.set(cacheKey, _heightCache);
  }

  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const item = items[index];
      if (item) {
        const cached = _heightCache!.get(getItemKey(item));
        if (cached) return cached;
      }
      return estimateHeight;
    },
    overscan: options?.overscan ?? 5,
    initialOffset: (options?.initialScrollTop ?? 0) > 0 ? options!.initialScrollTop : 0,
  });

  const measureAndCache = (el: HTMLDivElement | null, item: T) => {
    if (el) {
      virtualizer.measureElement(el);
      const h = (el as any).getBoundingClientRect?.()?.height ?? 0;
      if (h > 0) _heightCache!.set(getItemKey(item), h);
    }
  };

  // FeedTimeline pattern: real-time scroll position report via callback
  useEffect(() => {
    const el = scrollRef.current as any;
    if (!el) return;
    const { onScrollTopChange } = options ?? {};
    const report = () => {
      const c = scrollRef.current as any;
      if (c) {
        const st = c.scrollTop ?? 0;
        onScrollTopChange?.(st);
      }
    };
    el.addEventListener('scroll', report, { passive: true });
    const raf = (globalThis as any).requestAnimationFrame?.(report);
    return () => {
      el.removeEventListener('scroll', report);
      if (raf != null) (globalThis as any).cancelAnimationFrame?.(raf);
    };
  }, [options?.onScrollTopChange, cacheKey, items.length]);

  return { scrollRef, virtualizer, measureAndCache };
}
