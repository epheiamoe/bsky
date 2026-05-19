import React, { useEffect, useState } from 'react';
import { getDefaultWorkspaceStorage } from '@bsky/app';
import { Icon } from '../Icon.js';

interface WorkspaceImageProps {
  src: string;
  alt?: string;
  className?: string;
}

export function WorkspaceImage({ src, alt, className }: WorkspaceImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadImage = async () => {
      try {
        setLoading(true);
        setError(false);

        // Extract filename from path (e.g., "/workspace/data/chart.png" → "chart.png")
        const filename = src.split('/').pop() || src;
        if (!filename) {
          setError(true);
          return;
        }

        // Search all workspace files for matching filename
        const storage = getDefaultWorkspaceStorage();
        const allFiles = await storage.listFiles(); // Get all files across all sessions
        
        const file = allFiles.find(f => 
          f.name === filename || 
          f.name.toLowerCase() === filename.toLowerCase()
        );

        if (!file || !file.mimeType.startsWith('image/')) {
          setError(true);
          return;
        }

        const blob = new Blob([file.data as BlobPart], { type: file.mimeType });
        const url = URL.createObjectURL(blob);
        
        if (!cancelled) {
          setBlobUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error('[WorkspaceImage] Failed to load image:', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadImage();

    return () => {
      cancelled = true;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-surface border border-border rounded-lg min-h-[100px] ${className || ''}`}>
        <svg className="animate-spin h-5 w-5 text-text-secondary/50" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className={`flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 text-text-secondary/60 text-sm ${className || ''}`}>
        <Icon name="file-image" size={16} />
        <span>{alt || src}</span>
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt || 'Workspace image'}
      className={`max-w-full h-auto rounded-lg border border-border ${className || ''}`}
      loading="lazy"
    />
  );
}
