import React, { useState, useEffect, useRef } from 'react';
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
  const [imageMap, setImageMap] = useState<Map<string, string>>(new Map());
  const [imagesLoading, setImagesLoading] = useState(false);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Pre-load workspace images referenced in markdown ![]() syntax
  useEffect(() => {
    let cancelled = false;
    setImagesLoading(true);

    const loadImages = async () => {
      try {
        const { getDefaultWorkspaceStorage } = await import('@bsky/app');
        const storage = getDefaultWorkspaceStorage();

        // Extract all workspace image references from content
        const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        const filenames = new Set<string>();
        let match;
        while ((match = regex.exec(content)) !== null) {
          const src = match[2];
          // Skip external URLs - only handle workspace/local paths
          if (src.startsWith('http://') || src.startsWith('https://')) continue;
          const filename = src.split('/').pop() || src;
          if (filename) filenames.add(filename);
        }

        if (filenames.size === 0) {
          setImagesLoading(false);
          return;
        }

        // Load all workspace files (across all sessions for AI references)
        const allFiles = await storage.listFiles();
        const newMap = new Map<string, string>();

        for (const filename of filenames) {
          const file = allFiles.find(f =>
            f.name === filename || f.name.toLowerCase() === filename.toLowerCase()
          );

          if (file && file.mimeType.startsWith('image/')) {
            const blob = new Blob([file.data as BlobPart], { type: file.mimeType });
            const url = URL.createObjectURL(blob);
            blobUrlsRef.current.add(url);
            newMap.set(filename, url);
          }
        }

        if (!cancelled) {
          setImageMap(newMap);
        } else {
          // Clean up if cancelled
          newMap.forEach(url => URL.revokeObjectURL(url));
        }
      } catch (err) {
        console.error('[AssistantMessage] Failed to load workspace images:', err);
      } finally {
        if (!cancelled) setImagesLoading(false);
      }
    };

    loadImages();

    return () => {
      cancelled = true;
      // Clean up old blob URLs
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
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
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ src, alt }) => {
                if (!src) return null;

                // Extract filename from src (handles both "chart.png" and "/workspace/output/chart.png")
                const filename = src.split('/').pop() || src;

                // Check if we have a pre-loaded blob URL for this workspace image
                const blobUrl = imageMap.get(filename);
                if (blobUrl) {
                  return (
                    <img
                      src={blobUrl}
                      alt={alt || 'Workspace image'}
                      className="max-w-full h-auto rounded-lg border border-border"
                      loading="lazy"
                    />
                  );
                }

                // If it's a workspace path (not http) but not loaded yet, show loading state
                if (!src.startsWith('http://') && !src.startsWith('https://')) {
                  if (imagesLoading) {
                    return (
                      <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 text-text-secondary/60 text-sm">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        <span>Loading {filename}...</span>
                      </div>
                    );
                  }
                  // Not found in workspace
                  return (
                    <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 text-text-secondary/60 text-sm">
                      <Icon name="file-image" size={16} />
                      <span>Image not found: {filename}</span>
                    </div>
                  );
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
