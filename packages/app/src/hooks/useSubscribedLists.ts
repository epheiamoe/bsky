import { useState, useEffect, useCallback } from 'react';
import type { BskyClient } from '@bsky/core';
import { getFeedConfig, addSubscribedList, removeSubscribedList } from '../state/feedConfig';

export function useSubscribedLists(_client: BskyClient | null) {
  const [lists, setLists] = useState(() => getFeedConfig().subscribedLists);
  const [loading, setLoading] = useState(false);

  // Sync with localStorage on mount
  useEffect(() => {
    setLists(getFeedConfig().subscribedLists);
  }, []);

  const subscribe = useCallback((listUri: string, listName: string) => {
    const updated = addSubscribedList(listUri, listName);
    setLists(updated.subscribedLists);
    return true;
  }, []);

  const unsubscribe = useCallback((listUri: string) => {
    const updated = removeSubscribedList(listUri);
    setLists(updated.subscribedLists);
    return true;
  }, []);

  const isSubscribed = useCallback((listUri: string) => {
    return lists.some(l => l.uri === listUri);
  }, [lists]);

  return { lists, loading, subscribe, unsubscribe, isSubscribed };
}
