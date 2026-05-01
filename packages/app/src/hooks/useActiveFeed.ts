import { useState, useEffect, useCallback } from 'react';
import { getFeedConfig } from '../state/feedConfig.js';

// ── Module-level shared state (survives component mounts, not page reloads) ──
let _lastFeedUri: string | null = null;
const _listeners: Array<() => void> = [];

export function getLastFeedUri(): string | null {
  return _lastFeedUri;
}

export function setLastFeedUri(uri: string | null): void {
  _lastFeedUri = uri;
  _listeners.forEach(fn => fn());
}

export function useActiveFeed() {
  const [, tick] = useState(0);

  useEffect(() => {
    const fn = () => tick(n => n + 1);
    _listeners.push(fn);
    return () => {
      const i = _listeners.indexOf(fn);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }, []);

  const resolveFeed = useCallback((feedUri?: string | null): string | undefined => {
    return feedUri ?? _lastFeedUri ?? getFeedConfig().defaultFeedUri ?? undefined;
  }, []);

  const recordFeed = useCallback((uri: string | undefined) => {
    if (uri !== undefined && uri !== null) {
      setLastFeedUri(uri);
    }
  }, []);

  const goHomeFeed = useCallback((): string | undefined => {
    return getFeedConfig().defaultFeedUri ?? undefined;
  }, []);

  return { resolveFeed, recordFeed, goHomeFeed };
}
