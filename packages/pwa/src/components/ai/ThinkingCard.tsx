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
      className={`relative rounded-xl border border-border overflow-hidden cursor-pointer transition-all duration-200 hover:border-white/10 ${
        compact ? 'mb-1.5' : ''
      } ${expanded ? 'border-purple-500/30' : ''}`}
    >
      <div className={`flex items-center gap-2 bg-white/[0.03] ${compact ? 'px-3 py-1.5' : 'px-3.5 py-2.5'}`}>
        <Icon name="brain" size={compact ? 14 : 16} />
        <span className={`font-medium text-purple-400 ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
          {t('ai.thinkingCard')}
        </span>
      </div>

      {/* Preview line — fades out on expand */}
      <div className={`transition-all duration-200 ease-out ${
        compact ? 'px-3 py-1.5 text-[12px]' : 'px-3.5 py-2.5 text-[14px]'
      } text-text-secondary/70 whitespace-nowrap overflow-hidden text-ellipsis ${
        expanded ? 'opacity-0 invisible max-h-0 py-0 my-0 overflow-hidden' : 'opacity-100 visible'
      }`}>
        {firstLine}
      </div>

      {/* Expanded content — animated max-height + opacity */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className={`border-t border-border ${compact ? 'px-3 py-2 text-[12px]' : 'px-3.5 py-3 text-[14px]'} text-text-secondary/80 whitespace-pre-wrap leading-relaxed`}>
          {content}
        </div>
      </div>
    </div>
  );
}
