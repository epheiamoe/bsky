import React from 'react';
import { useI18n } from '@bsky/app';

const BRAIN_SVG = '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M9 13a4.5 4.5 0 0 0 3-4" /><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" /><path d="M3.477 10.896a4 4 0 0 1 .585-.396" /><path d="M6 18a4 4 0 0 1-1.967-.516" /><path d="M12 13h4" /><path d="M12 18h6a2 2 0 0 1 2 2v1" /><path d="M12 8h8" /><path d="M16 8V5a2 2 0 0 1 2-2" /><circle cx="16" cy="13" r=".5" /><circle cx="18" cy="3" r=".5" /><circle cx="20" cy="21" r=".5" /><circle cx="20" cy="8" r=".5" />';

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
        <svg viewBox="0 0 24 24" width={compact ? 14 : 16} height={compact ? 14 : 16} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="shrink-0 text-purple-400" dangerouslySetInnerHTML={{ __html: BRAIN_SVG }} />
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
        <div className={`border-t border-border ${compact ? 'px-3 py-2 text-[12px]' : 'px-3.5 py-3 text-[14px]'} text-text-secondary/80 whitespace-pre-wrap break-all leading-relaxed`}>
          {content}
        </div>
      </div>
    </div>
  );
}
