import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ModerationDecision } from '@bsky/core';

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
    decisions?: Map<string, ModerationDecision>;
  },
) {
  let _heightCache = _globalHeightCaches.get(cacheKey);
  if (!_heightCache) {
    _heightCache = new Map();
    _globalHeightCaches.set(cacheKey, _heightCache);
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const didRestore = useRef(false);
  const prevDecisionsRef = useRef<Map<string, ModerationDecision>>(new Map());

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

  // Invalidate height cache when moderation decisions change
  useEffect(() => {
    const decisions = options?.decisions;
    if (!decisions) return;

    const prevDecisions = prevDecisionsRef.current;
    let hasChanges = false;

    for (const [uri, decision] of decisions) {
      const prev = prevDecisions.get(uri);
      if (!prev || prev.contentAction !== decision.contentAction || prev.mediaAction !== decision.mediaAction) {
        _heightCache!.delete(uri);
        hasChanges = true;
      }
    }

    for (const uri of prevDecisions.keys()) {
      if (!decisions.has(uri)) {
        _heightCache!.delete(uri);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      virtualizer.measure();
    }

    prevDecisionsRef.current = new Map(decisions);
  }, [options?.decisions, virtualizer]);

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
    const raf = (globalThis as any).requestAnimationFrame?.(() => {
      // Only report non-zero scrollTop to avoid overwriting saved position
      // before virtualizer applies initialOffset
      const c = scrollRef.current as any;
      const st = c?.scrollTop ?? 0;
      if (st > 0) report();
    });
    return () => {
      el.removeEventListener('scroll', report);
      if (raf != null) (globalThis as any).cancelAnimationFrame?.(raf);
    };
  }, [options?.onScrollTopChange, cacheKey, items.length]);

  // Scroll restoration: restore saved scrollTop after items load (handles cache-miss remount)
  useEffect(() => {
    if (options?.initialScrollTop && options.initialScrollTop > 0 && items.length > 0 && !didRestore.current) {
      didRestore.current = true;
      (globalThis as any).requestAnimationFrame?.(() => {
        virtualizer.scrollToOffset(options!.initialScrollTop!, { align: 'start' });
      });
    }
  }, [items.length > 0, options?.initialScrollTop, cacheKey]);

  // Reset restoration flag when cacheKey changes (new list context)
  useEffect(() => {
    didRestore.current = false;
  }, [cacheKey]);

  return { scrollRef, virtualizer, measureAndCache };
}
