import React from 'react';
import { getWidget } from '@bsky/app';
import type { WidgetContext } from '@bsky/app';
import { Modal } from './Modal.js';

interface WidgetModalProps {
  widgetId: string;
  context?: WidgetContext;
  onClose: () => void;
}

export function WidgetModal({ widgetId, context, onClose }: WidgetModalProps) {
  const widget = getWidget(widgetId);
  if (!widget) return null;

  return (
    <Modal open onClose={onClose}>
      <div className="p-4">
        {widget.render({ onClose, context })}
      </div>
    </Modal>
  );
}

export default WidgetModal;
