import React, { useState, useEffect } from 'react';
import type { BskyClient } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useSearch } from '@bsky/app';
import { PostCard } from './PostCard.js';

interface SearchPageProps {
  client: BskyClient;
  initialQuery?: string;
  goBack: () => void;
  goTo: (v: AppView) => void;
}

export function SearchPage({ client, initialQuery, goBack, goTo }: SearchPageProps) {
  const { results, loading, search } = useSearch(client);
  const [input, setInput] = useState(initialQuery ?? '');

  useEffect(() => {
    if (initialQuery) {
      search(initialQuery);
    }
  }, []);

  const handleSearch = () => {
    if (!input.trim()) return;
    search(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A]">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={goBack}
          className="text-text-secondary hover:text-text-primary transition-colors text-lg shrink-0"
        >
          ←
        </button>
        <h1 className="text-text-primary font-semibold text-lg">🔍 搜索</h1>
      </div>

      <div className="px-4 py-3 flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="🔍 搜索 Bluesky 帖子..."
            autoFocus
            className="w-full px-4 py-2 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!input.trim() || loading}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-semibold text-sm disabled:opacity-50 transition-colors shrink-0"
        >
          搜索
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : results.length > 0 ? (
        <div>
          {results.map((post) => (
            <PostCard
              key={post.uri}
              post={post}
              onClick={() => goTo({ type: 'thread', uri: post.uri })}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <p className="text-text-secondary text-sm">输入关键词搜索</p>
        </div>
      )}
    </div>
  );
}
