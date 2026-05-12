import React, { useMemo, useCallback } from 'react';
import { useI18n } from '@bsky/app';
import { formatToolResult } from './formatToolResult.js';

const WRENCH_SVG = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />';

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

  const handleScroll = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 2;
    const atTop = el.scrollTop < 2;
    if ((atBottom && e.deltaY > 0) || (atTop && e.deltaY < 0)) return;
    e.stopPropagation();
  }, []);

  const formattedArgs = useMemo(() => {
    if (!args) return '';
    const match = args.match(/\{.*\}/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return Object.entries(parsed).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
      } catch {}
    }
    return args;
  }, [args]);

  return (
    <div
      onClick={onToggle}
      className={`relative rounded-xl border border-border overflow-hidden cursor-pointer transition-all duration-200 hover:border-white/10 ${
        compact ? 'mb-1.5' : ''
      } ${expanded ? 'border-amber-500/30' : ''}`}
    >
      <div className={`flex items-center gap-2 bg-white/[0.03] ${compact ? 'px-3 py-1.5' : 'px-3.5 py-2.5'}`}>
        <svg viewBox="0 0 24 24" width={compact ? 14 : 16} height={compact ? 14 : 16} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="shrink-0 text-amber-400" dangerouslySetInnerHTML={{ __html: WRENCH_SVG }} />
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

      {/* Expanded content — animated max-height + scrollable */}
      <div
        onWheel={handleScroll}
        style={{ overscrollBehaviorY: 'auto' }}
        className={`transition-all duration-300 ease-out ${
          expanded ? 'max-h-[600px] opacity-100 overflow-y-auto overflow-x-auto' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className={`border-t border-border ${compact ? 'px-3 py-2 text-[12px]' : 'px-3.5 py-3 text-[14px]'} text-text-secondary/80 whitespace-pre-wrap leading-relaxed`}>
          {formattedArgs && <div className="mb-2 pb-2 border-b border-border/50 text-text-secondary/60 text-xs flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="shrink-0" dangerouslySetInnerHTML={{ __html: WRENCH_SVG }} />
            {formattedArgs}
          </div>}
          {display.body}
        </div>
      </div>
    </div>
  );
}
