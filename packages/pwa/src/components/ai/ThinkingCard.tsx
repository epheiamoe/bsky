import React from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from '../Icon.js';

interface ThinkingCardProps {
  content: string;
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
}

export function ThinkingCard({ content, expanded, onToggle, compact }: ThinkingCardProps) {
  const { t } = useI18n();
  const firstLine = content.split('\n')[0] || content;

  return (
    <div
      onClick={onToggle}
      className={`rounded-xl border border-border overflow-hidden cursor-pointer transition-all duration-200 hover:border-white/10 ${
        compact ? 'mb-1.5' : ''
      } ${expanded ? 'border-purple-500/30' : ''}`}
    >
      <div className={`flex items-center gap-2 bg-white/[0.03] ${compact ? 'px-3 py-1.5' : 'px-3.5 py-2.5'}`}>
        <Icon name="brain" size={compact ? 14 : 16} />
        <span className={`font-medium text-purple-400 ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
          {t('ai.thinkingCard')}
        </span>
      </div>
      {!expanded && (
        <div className={`${compact ? 'px-3 py-1.5 text-[12px]' : 'px-3.5 py-2.5 text-[14px]'} text-text-secondary/70 whitespace-nowrap overflow-hidden text-ellipsis`}>
          {firstLine}
        </div>
      )}
      {expanded && (
        <div className={`border-t border-border ${compact ? 'px-3 py-2 text-[12px]' : 'px-3.5 py-3 text-[14px]'} text-text-secondary/80 whitespace-pre-wrap leading-relaxed`}>
          {content}
        </div>
      )}
    </div>
  );
}
