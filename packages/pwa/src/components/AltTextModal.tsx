import React, { useState } from 'react';
import { Modal } from './Modal.js';
import { useI18n } from '@bsky/app';

interface AltTextModalProps {
  open: boolean;
  imageUrl: string;
  initialAlt: string;
  onClose: () => void;
  onSave: (alt: string) => void;
}

export function AltTextModal({ open, imageUrl, initialAlt, onClose, onSave }: AltTextModalProps) {
  const { t } = useI18n();
  const [alt, setAlt] = useState(initialAlt);

  const handleSave = () => {
    onSave(alt);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-text-primary">{t('compose.altTextModalTitle')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Image preview */}
          <div className="rounded-lg overflow-hidden border border-border">
            <img src={imageUrl} alt="" className="w-full max-h-48 object-contain bg-black" />
          </div>

          {/* Description */}
          <p className="text-sm text-text-secondary">{t('compose.altTextDesc')}</p>

          {/* Input */}
          <textarea
            value={alt}
            onChange={e => setAlt(e.target.value)}
            placeholder={t('compose.altPlaceholder')}
            maxLength={2000}
            className="w-full h-24 px-3 py-2 rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none text-sm"
          />

          {/* Char count */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">{alt.length}/2000</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={handleSave}
            className="w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors"
          >
            {t('action.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
