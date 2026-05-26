import React, { useState, useEffect } from 'react';
import { fetchAllEmojis, type EmojiItem } from '@bsky/app';
import { Icon } from './Icon.js';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [allEmojis, setAllEmojis] = useState<EmojiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    if (allEmojis.length === 0 && !loading) {
      setLoading(true);
      fetchAllEmojis()
        .then(emojis => {
          setAllEmojis(emojis);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [allEmojis.length, loading]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-end justify-center animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-background rounded-t-2xl border-t border-x border-border shadow-2xl w-full max-w-lg max-h-[60vh] flex flex-col animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">Emoji</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Close emoji picker">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Emoji Grid */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && allEmojis.length === 0 && (
            <p className="text-text-secondary text-sm text-center py-8">Failed to load emojis</p>
          )}
          {!loading && (
            <div className="grid grid-cols-8 gap-1">
              {allEmojis.map((item) => {
                const isExpanded = expandedKey === item.key;
                return (
                  <div key={item.key} className="relative">
                    <button
                      onClick={() => {
                        if (item.hasVariants) {
                          setExpandedKey(isExpanded ? null : item.key);
                        } else {
                          onSelect(item.emoji);
                        }
                      }}
                      className="w-10 h-10 flex items-center justify-center rounded-xl text-xl hover:bg-surface-hover hover:scale-105 transition-all"
                    >
                      <span>{item.emoji}</span>
                      {item.hasVariants && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-text-secondary/30" />
                      )}
                    </button>
                    {/* Skin tone picker */}
                    <div
                      className={`overflow-hidden transition-all duration-200 ${
                        isExpanded ? 'max-h-12 opacity-100 mt-1' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="flex gap-0.5 justify-center">
                        {item.variants.map(v => (
                          <button
                            key={v}
                            onClick={(e) => { e.stopPropagation(); onSelect(v); }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-sm hover:bg-surface-hover transition-all"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
