import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '@bsky/app';
import { Icon } from '../Icon.js';
import { WorkspaceImage } from './WorkspaceImage.js';

interface AssistantMessageProps {
  content: string;
  isError?: boolean;
  compact?: boolean;
}

export function AssistantMessage({ content, isError, compact }: AssistantMessageProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`flex justify-start group ${compact ? 'mb-1.5' : 'mb-2'}`}>
      <div className={`rounded-lg border relative ${
        isError
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
          : 'bg-surface border-border'
      } ${compact ? 'px-2.5 py-1.5 max-w-[90%]' : 'px-3 py-2 max-w-[85%]'}`} role={isError ? 'alert' : undefined}>
        <div className={`text-text-primary markdown-body ${compact ? 'text-[13px]' : 'text-sm'}`}>
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ src, alt }) => {
                // Check if this is a workspace image reference
                // Supports: ![alt](filename.png) or ![alt](/workspace/data/filename.png)
                if (src && (src.startsWith('/workspace/') || !src.startsWith('http'))) {
                  return <WorkspaceImage src={src} alt={alt} />;
                }
                // Regular external image
                return <img src={src} alt={alt} className="max-w-full h-auto rounded-lg" />;
              }
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
        {!isError && content && (
          <button
            onClick={handleCopy}
            className={`absolute bottom-1 right-1 text-xs text-text-secondary/60 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded bg-surface/80`}
            title={t('ai.copyLast')}
          >
            {copied ? <><Icon name="badge-check" size={compact ? 12 : 14} /> {t('ai.copied')}</> : <Icon name="copy" size={compact ? 12 : 14} />}
          </button>
        )}
      </div>
    </div>
  );
}
