import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from './Icon.js';

export const REFRESH_NOOP = async () => {};

interface PullToRefreshProps {
  scrollRef: React.RefObject<HTMLDivElement>;
  onRefresh: () => Promise<void>;
}

export function PullToRefresh({ scrollRef, onRefresh }: PullToRefreshProps) {
  const [pullDist, setPullDist] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refs for touch handlers to avoid stale closures
  const startYRef = useRef(0);
  const activeRef = useRef(false);
  const refreshingRef = useRef(false);
  const pullDistRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Sync state to ref synchronously
  pullDistRef.current = pullDist;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop !== 0 || refreshingRef.current) return;
      startYRef.current = e.touches[0].clientY;
      activeRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!activeRef.current || refreshingRef.current) return;
      if (el.scrollTop !== 0) { setPullDist(0); activeRef.current = false; return; }
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) { setPullDist(0); activeRef.current = false; return; }
      e.preventDefault();
      setPullDist(Math.min(dy * 0.4, 120));
    };

    const onTouchEnd = async () => {
      if (!activeRef.current || refreshingRef.current) { setPullDist(0); return; }
      activeRef.current = false;
      if (pullDistRef.current < 60) { setPullDist(0); return; }
      refreshingRef.current = true;
      setIsRefreshing(true);
      setPullDist(50);
      try { await onRefreshRef.current(); } catch {}
      refreshingRef.current = false;
      setIsRefreshing(false);
      setPullDist(0);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const h = isRefreshing ? 50 : pullDist;

  return (
    <div className="flex-shrink-0 overflow-hidden flex justify-center items-center transition-[height] duration-200 ease-out"
      style={{ height: h, opacity: Math.min(h / 30, 1) }}
    >
      {h > 0 && (
        <motion.div
          animate={isRefreshing ? { rotate: 360 } : { scale: Math.min(pullDist / 60, 1) }}
          transition={isRefreshing ? { repeat: Infinity, duration: 1, ease: 'linear' } : { type: 'spring', stiffness: 300, damping: 20 }}
        >
          <Icon name="astroid-as-AI-Button" size={22} />
        </motion.div>
      )}
    </div>
  );
}
