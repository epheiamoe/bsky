import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '@bsky/app';
import { Icon } from '../Icon.js';

interface AssistantMessageProps {
  content: string;
  isError?: boolean;
  compact?: boolean;
}

export function AssistantMessage({ content, isError, compact }: AssistantMessageProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [processedContent, setProcessedContent] = useState(content);

  // Pre-load workspace images and replace URLs with blob URLs
  useEffect(() => {
    let cancelled = false;
    const blobUrls: string[] = [];

    const processImages = async () => {
      try {
        const { getDefaultWorkspaceStorage } = await import('@bsky/app');
        const storage = getDefaultWorkspaceStorage();

        // Extract all image references: ![alt](src)
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let newContent = content;
        let match;

        while ((match = imageRegex.exec(content)) !== null) {
          const [fullMatch, alt, src] = match;

          // Skip external URLs (http/https)
          if (src.startsWith('http://') || src.startsWith('https://')) {
            continue;
          }

          // Extract filename from path (e.g., "/workspace/output/chart.png" → "chart.png")
          const filename = src.split('/').pop() || src;
          if (!filename) continue;

          try {
            // Get all files from workspace (across all sessions for AI references)
            const allFiles = await storage.listFiles();
            const file = allFiles.find(f =>
              f.name === filename || f.name.toLowerCase() === filename.toLowerCase()
            );

            if (file && file.mimeType.startsWith('image/')) {
              const blob = new Blob([file.data as BlobPart], { type: file.mimeType });
              const url = URL.createObjectURL(blob);
              blobUrls.push(url);

              if (!cancelled) {
                newContent = newContent.replace(fullMatch, `![${alt}](${url})`);
              }
            }
          } catch (err) {
            console.error('[AssistantMessage] Failed to load workspace image:', filename, err);
          }
        }

        if (!cancelled) {
          setProcessedContent(newContent);
        }
      } catch (err) {
        console.error('[AssistantMessage] Failed to process images:', err);
      }
    };

    processImages();

    return () => {
      cancelled = true;
      // Clean up blob URLs
      blobUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [content]);

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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {processedContent}
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
