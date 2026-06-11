import React, { useEffect, useState } from 'react';
import { Icon } from './Icon.js';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  duration?: number; // ms, default 3000
  onDismiss: () => void;
}

/**
 * Generic bottom-right auto-dismiss toast.
 */
export function Toast({ message, type = 'success', duration = 3000, onDismiss }: ToastProps) {
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

  const iconName = type === 'success' ? 'badge-check' : 'badge-alert';
  const iconColor = type === 'success'
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
  const barColor = type === 'success'
    ? 'bg-green-500 dark:bg-green-400'
    : 'bg-red-500 dark:bg-red-400';

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-fadeIn" role="status" aria-live="polite">
      <div className="bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
        <div className="px-4 py-3 flex items-start gap-3">
          <Icon name={iconName} size={16} className={`${iconColor} shrink-0 mt-0.5`} aria-hidden="true" />
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
            className={`h-full ${barColor} transition-all duration-100 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
