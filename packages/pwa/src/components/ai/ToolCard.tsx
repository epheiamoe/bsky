import React, { useMemo } from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from '../Icon.js';
import { formatToolResult } from './formatToolResult.js';

interface ToolCardProps {
  toolName: string;
  args?: string;
  resultContent?: string;
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
}

export function ToolCard({ toolName, args, resultContent, expanded, onToggle, compact }: ToolCardProps) {
  const { t } = useI18n();
  const display = useMemo(() => formatToolResult(toolName, resultContent ?? args ?? ''), [toolName, resultContent, args]);

  return (
    <div
      onClick={onToggle}
      className={`relative rounded-xl border border-border overflow-hidden cursor-pointer transition-all duration-200 hover:border-white/10 ${
        compact ? 'mb-1.5' : ''
      } ${expanded ? 'border-amber-500/30' : ''}`}
    >
      <div className={`flex items-center gap-2 bg-white/[0.03] ${compact ? 'px-3 py-1.5' : 'px-3.5 py-2.5'}`}>
        <Icon name="wrench" size={compact ? 14 : 16} />
        <span className={`font-medium text-amber-400 ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
          {t('ai.toolCallCard')}
        </span>
        <code className={`${compact ? 'text-[10px]' : 'text-[12px]'} text-text-secondary/60`}>
          {toolName}
        </code>
        <span className={`ml-auto text-text-secondary/40 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
          ▸
        </span>
      </div>

      {/* Preview line — fades out on expand */}
      <div className={`transition-all duration-200 ease-out ${
        compact ? 'px-3 py-1.5 text-[12px]' : 'px-3.5 py-2.5 text-[14px]'
      } text-text-secondary/70 whitespace-nowrap overflow-hidden text-ellipsis ${
        expanded ? 'opacity-0 invisible max-h-0 py-0 my-0 overflow-hidden' : 'opacity-100 visible'
      }`}>
        {display.summary}
      </div>

      {/* Expanded content — animated max-height + opacity */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className={`border-t border-border ${compact ? 'px-3 py-2 text-[12px]' : 'px-3.5 py-3 text-[14px]'} text-text-secondary/80 whitespace-pre-wrap break-all leading-relaxed`}>
          {args && <div className="mb-2 pb-2 border-b border-border/50 text-text-secondary/60 font-mono text-xs">参数: {args}</div>}
          {display.body}
        </div>
      </div>
    </div>
  );
}
