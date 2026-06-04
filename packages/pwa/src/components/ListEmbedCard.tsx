import React from 'react';
import type { ExtractListEmbed } from '@bsky/app';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';

interface ListEmbedCardProps {
  list: ExtractListEmbed;
  onClick: () => void;
}

function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function ListEmbedCard({ list, onClick }: ListEmbedCardProps) {
  const { t } = useI18n();

  return (
    <button
      onClick={onClick}
      className="mt-2 w-full text-left block border border-border rounded-xl p-3 hover:bg-surface/80 hover:border-primary/30 transition-colors cursor-pointer group"
    >
      <div className="flex items-start gap-3">
        {/* Left: Avatar */}
        <div className="shrink-0">
          <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-text-primary font-bold text-sm overflow-hidden border border-border/50">
            {list.avatar ? (
              <img src={list.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              avatarLetter(list.name)
            )}
          </div>
        </div>

        {/* Middle: Name, creator, description */}
        <div className="flex-1 min-w-0">
          <h3 className="text-text-primary font-semibold text-sm truncate">{list.name}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-text-secondary text-xs truncate max-w-[120px]">
              {list.creatorDisplayName || list.creatorHandle}
            </span>
            <span className="text-text-secondary text-xs">@{list.creatorHandle}</span>
          </div>
          {list.description && (
            <p className="text-text-secondary text-xs mt-1 line-clamp-2">{list.description}</p>
          )}
        </div>

        {/* Right: Member count badge */}
        <div className="shrink-0">
          <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary font-medium whitespace-nowrap">
            {list.listItemCount.toLocaleString()} {list.listItemCount === 1 ? t('list.member') : t('list.members')}
          </span>
        </div>
      </div>

      {/* Bottom row: List icon + label */}
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
        <Icon name="list" size={14} className="text-text-secondary/60" />
        <span className="text-text-secondary/60 text-xs font-medium">{t('list.label')}</span>
      </div>
    </button>
  );
}
