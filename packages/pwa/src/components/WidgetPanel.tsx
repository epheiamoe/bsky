import React, { useState, useMemo, useCallback } from 'react';
import { useI18n, getWidgetsForView } from '@bsky/app';
import type { WidgetContext } from '@bsky/app';
import { Icon } from './Icon.js';

interface WidgetPanelProps {
  viewType: string;
  enabledIds: string[];
  context?: WidgetContext;
  onCloseWidget: (id: string) => void;
  onReorderWidget?: (fromIdx: number, toIdx: number) => void;
}

export function WidgetPanel({ viewType, enabledIds, context, onCloseWidget, onReorderWidget }: WidgetPanelProps) {
  const { t } = useI18n();
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const availableWidgets = useMemo(() => getWidgetsForView(viewType), [viewType]);
  const enabledWidgets = useMemo(() => {
    return availableWidgets.filter(w => enabledIds.includes(w.id));
  }, [availableWidgets, enabledIds]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string, idx: number) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    (e.currentTarget as HTMLElement).classList.add('opacity-30');
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('opacity-30');
    setDraggedId(null);
    setDragOverIdx(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIdx(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(fromIdx) && fromIdx !== toIdx) {
      onReorderWidget?.(fromIdx, toIdx);
    }
    setDraggedId(null);
    setDragOverIdx(null);
  }, [onReorderWidget]);

  if (availableWidgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary/60 text-xs gap-2 p-4">
        <Icon name="astroid-as-AI-Button" size={20} />
        <span>{t('layout.aiSuggestions')}</span>
        <span>No widgets available for this view</span>
      </div>
    );
  }

  if (enabledWidgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary/60 text-xs gap-2 p-4">
        <Icon name="astroid-as-AI-Button" size={20} />
        <span>No widgets active</span>
        <span>Click 组件 in sidebar to add</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-3 overflow-y-auto gap-1">
      {enabledWidgets.map((w, idx) => (
        <React.Fragment key={w.id}>
          {/* Drop indicator above (except first) */}
          {dragOverIdx === idx && draggedId !== w.id && (
            <div className="h-0.5 rounded-full bg-primary/60 mx-1" />
          )}
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, w.id, idx)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, idx)}
            className={`border border-border rounded-xl bg-surface/50 transition-all duration-150 ${
              draggedId === w.id ? 'opacity-30 shadow-sm' : dragOverIdx === idx ? 'border-primary/50' : ''
            }`}
          >
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-0 cursor-grab active:cursor-grabbing select-none" onMouseDown={(e) => e.stopPropagation()}>
              <Icon name="grip-vertical" size={12} />
            </div>
            <div className="px-3 pb-3">
              {w.render({ onClose: () => onCloseWidget(w.id), context })}
            </div>
          </div>
        </React.Fragment>
      ))}
      {/* Drop indicator at very end */}
      {dragOverIdx === enabledWidgets.length && (
        <div className="h-0.5 rounded-full bg-primary/60 mx-1" />
      )}
    </div>
  );
}

export default WidgetPanel;
