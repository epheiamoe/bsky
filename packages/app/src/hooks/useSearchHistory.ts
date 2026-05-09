import { useState, useCallback } from 'react';

type SearchTab = 'top' | 'latest' | 'users' | 'feeds';

type SearchHistoryData = Record<SearchTab, string[]>;

const STORAGE_KEY = 'bsky_search_history';
const MAX_ITEMS = 10;

function loadHistory(): SearchHistoryData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { top: [], latest: [], users: [], feeds: [] };
    return { top: [], latest: [], users: [], feeds: [], ...JSON.parse(raw) };
  } catch {
    return { top: [], latest: [], users: [], feeds: [] };
  }
}

function saveHistory(data: SearchHistoryData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const _listeners = new Set<() => void>();

function notify(): void {
  _listeners.forEach(fn => fn());
}

export function addToHistory(tab: SearchTab, query: string): void {
  if (!query.trim()) return;
  const data = loadHistory();
  const list = data[tab];
  const filtered = list.filter(q => q !== query);
  filtered.unshift(query);
  data[tab] = filtered.slice(0, MAX_ITEMS);
  saveHistory(data);
  notify();
}

export function removeFromHistory(tab: SearchTab, query: string): void {
  const data = loadHistory();
  data[tab] = data[tab].filter(q => q !== query);
  saveHistory(data);
  notify();
}

export function clearHistory(tab?: SearchTab): void {
  const data = loadHistory();
  if (tab) {
    data[tab] = [];
  } else {
    data.top = [];
    data.latest = [];
    data.users = [];
    data.feeds = [];
  }
  saveHistory(data);
  notify();
}

export function getHistory(tab: SearchTab): string[] {
  return loadHistory()[tab];
}

export function useSearchHistory(tab: SearchTab): {
  history: string[];
  add: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
} {
  const [, setTick] = useState(0);

  const add = useCallback((query: string) => {
    addToHistory(tab, query);
    setTick(t => t + 1);
  }, [tab]);

  const remove = useCallback((query: string) => {
    removeFromHistory(tab, query);
    setTick(t => t + 1);
  }, [tab]);

  const clear = useCallback(() => {
    clearHistory(tab);
    setTick(t => t + 1);
  }, [tab]);

  return {
    history: getHistory(tab),
    add,
    remove,
    clear,
  };
}
