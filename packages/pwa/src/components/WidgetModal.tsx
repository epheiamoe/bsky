import React from 'react';
import { getWidget } from '@bsky/app';
import type { WidgetContext } from '@bsky/app';

interface WidgetModalProps {
  widgetId: string;
  context?: WidgetContext;
  onClose: () => void;
}

export function WidgetModal({ widgetId, context, onClose }: WidgetModalProps) {
  const widget = getWidget(widgetId);
  if (!widget) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#121212] rounded-xl shadow-xl border border-border w-full max-w-sm max-h-[80vh] flex flex-col animate-fade-in">
        <div className="p-4">
          {widget.render({ onClose, context })}
        </div>
      </div>
    </div>
  );
}

export default WidgetModal;
