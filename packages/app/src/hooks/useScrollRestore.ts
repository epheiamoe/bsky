import { useEffect, useRef } from 'react';

// Module-level scroll position cache across view changes
const _scrollTops = new Map<string, number>();

export function saveScrollTop(key: string, value: number): void {
  if (key) _scrollTops.set(key, value);
}

export function getScrollTop(key: string): number | undefined {
  return _scrollTops.get(key);
}

function getGlobalScrollY(): number {
  try { return (globalThis as any).scrollY ?? 0; } catch { return 0; }
}

function setGlobalScrollTop(y: number): void {
  try { (globalThis as any).scrollTo(0, y); } catch {}
}

/**
 * Restore scroll position on mount, save on unmount.
 * @param key - Unique key for this view (e.g. 'profile-actor', 'search-query', 'bookmarks')
 * @param scrollRef - Ref to the scrollable container (null = use global scroll)
 * @param ready - Whether data is loaded and the component is ready to scroll
 */
export function useScrollRestore(key: string | undefined, scrollRef: any, ready: boolean) {
  const restored = useRef(false);

  useEffect(() => {
    if (!key || !ready || restored.current) return;
    const saved = _scrollTops.get(key);
    if (saved !== undefined) {
      if (scrollRef?.current) {
        scrollRef.current.scrollTop = saved;
      } else {
        setGlobalScrollTop(saved);
      }
      restored.current = true;
    }
  }, [key, ready]);

  useEffect(() => {
    return () => {
      if (key) {
        _scrollTops.set(key, scrollRef?.current ? scrollRef.current.scrollTop : getGlobalScrollY());
      }
    };
  }, [key]);
}
