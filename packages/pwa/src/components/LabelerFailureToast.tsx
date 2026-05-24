import React, { useEffect, useState } from 'react';
import { useI18n } from '@bsky/app';
import type { FailedLabelerInfo } from '@bsky/app';
import { Icon } from './Icon.js';

interface LabelerFailureToastProps {
  failedLabelers: FailedLabelerInfo[];
  duration?: number; // ms, default 5000
}

/**
 * Bottom-right toast for silent-level labeler failures.
 * Auto-dismisses after duration.
 */
export function LabelerFailureToast({ failedLabelers, duration = 5000 }: LabelerFailureToastProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(true);
  
  // Only show silent level failures
  const silentFailures = failedLabelers.filter(f => f.behavior === 'silent');
  
  if (silentFailures.length === 0 || !visible) return null;
  
  const names = silentFailures.map(f => f.name).join(', ');
  
  return (
    <ToastItem
      message={t('moderation.silentLevelFailure', { count: silentFailures.length, names })}
      duration={duration}
      onDismiss={() => setVisible(false)}
    />
  );
}

function ToastItem({ message, duration, onDismiss }: { 
  message: string; 
  duration: number; 
  onDismiss: () => void;
}) {
  const [progress, setProgress] = useState(100);
  
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);
    
    return () => clearInterval(interval);
  }, [duration, onDismiss]);
  
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-fadeIn">
      <div className="bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
        <div className="px-4 py-3 flex items-start gap-3">
          <Icon name="info" size={16} className="text-text-secondary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary">{message}</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-text-secondary hover:text-text-primary transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="h-0.5 bg-border">
          <div 
            className="h-full bg-primary transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
