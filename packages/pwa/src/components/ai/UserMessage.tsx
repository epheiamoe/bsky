import React from 'react';
import { Icon } from '../Icon.js';

interface UserMessageProps {
  content: string;
  isLastUser?: boolean;
  compact?: boolean;
  loading?: boolean;
  onEdit?: () => void;
}

export function UserMessage({ content, isLastUser, compact, loading, onEdit }: UserMessageProps) {
  return (
    <div className={`flex justify-end items-start gap-2 ${compact ? 'mb-1.5' : 'mb-2'}`}>
      <div className="flex flex-col gap-1 pt-1">
        {!loading && content && onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="text-xs text-text-secondary/60 hover:text-primary transition-colors px-1"
          >
            <Icon name="pencil-line" size={compact ? 12 : 16} />
          </button>
        )}
      </div>
      <div className={`bg-primary text-white rounded-lg ${compact ? 'px-2.5 py-1.5 max-w-[85%]' : 'px-3 py-2 max-w-[75%]'}`}>
        <p className={`whitespace-pre-wrap break-words ${compact ? 'text-[13px]' : 'text-sm'}`}>{content}</p>
      </div>
    </div>
  );
}
