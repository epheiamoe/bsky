import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getDefaultWorkspaceStorage, useI18n } from '@bsky/app';
import type { WorkspaceFile } from '@bsky/app';
import { Modal } from './Modal.js';
import { Icon } from './Icon.js';
import { PreviewModal } from './PreviewModal.js';

interface WorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  chatId?: string; // Current chat session ID for file isolation
}

export function WorkspaceModal({ open, onClose, chatId }: WorkspaceModalProps) {
  const { t } = useI18n();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const storage = getDefaultWorkspaceStorage();
      const list = await storage.listFiles(chatId);
      setFiles(list);
    } catch (err) {
      console.error('Failed to load workspace files:', err);
    } finally {
      setLoading(false);
    }
  }, [open, chatId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleDownload = useCallback(async (file: WorkspaceFile) => {
    try {
      const blob = new Blob([file.data as BlobPart], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download file:', err);
    }
  }, []);

  const handlePreview = useCallback((file: WorkspaceFile) => {
    setPreviewFile(file);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const storage = getDefaultWorkspaceStorage();
      await storage.deleteFile(id);
      await loadFiles();
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  }, [loadFiles]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const id = crypto.randomUUID();
      const storage = getDefaultWorkspaceStorage();
      await storage.saveFile({
        id,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        data,
        uploadedAt: new Date().toISOString(),
        chatId,
      });
      await loadFiles();
    } catch (err) {
      console.error('Failed to upload file to workspace:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [chatId, loadFiles]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getFileIcon = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return 'file-image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.includes('csv')) return 'table';
    if (mimeType.includes('json')) return 'file-code';
    return 'file-text';
  };

  const canPreview = (mimeType: string): boolean => {
    return mimeType.startsWith('image/') ||
           mimeType.startsWith('text/') ||
           mimeType.includes('json') ||
           mimeType.includes('csv') ||
           mimeType.includes('markdown');
  };

  return (
    <>
    <Modal open={open} onClose={onClose} titleId="workspace-title">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        aria-hidden="true"
      />
      <div className="flex flex-col max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 id="workspace-title" className="text-base font-semibold text-text-primary flex items-center gap-2">
            <Icon name="database" size={18} />
            {t('workspace.title') || 'Workspace'}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-primary hover:bg-surface transition-colors disabled:opacity-50"
              title={t('action.upload') || 'Upload'}
              aria-label={t('action.upload') || 'Upload'}
            >
              {uploading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <Icon name="upload" size={16} />
              )}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
              aria-label={t('action.close') || 'Close'}
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {loading ? (
            <div className="text-center py-8 text-text-secondary text-sm">{t('common.loading') || 'Loading...'}</div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-text-secondary text-sm">
              {t('workspace.empty') || 'No files in workspace. Upload files from the AI chat input.'}
            </div>
          ) : (
            <AnimatePresence>
              {files.map((file) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-3 py-3 border-b border-border last:border-0"
                >
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-surface flex items-center justify-center text-text-secondary">
                    <Icon name={getFileIcon(file.mimeType)} size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate font-medium">{file.name}</div>
                    <div className="text-xs text-text-secondary">
                      {formatSize(file.size)} · {new Date(file.uploadedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canPreview(file.mimeType) && (
                      <button
                        onClick={() => handlePreview(file)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-primary hover:bg-surface transition-colors"
                        title={t('action.preview') || 'Preview'}
                        aria-label={t('action.preview') || 'Preview'}
                      >
                        <Icon name="eye" size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDownload(file)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-primary hover:bg-surface transition-colors"
                      title={t('action.download') || 'Download'}
                      aria-label={t('action.download') || 'Download'}
                    >
                      <Icon name="download" size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      title={t('action.delete') || 'Delete'}
                      aria-label={t('action.delete') || 'Delete'}
                    >
                      <Icon name="trash-2" size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0 text-xs text-text-secondary">
          {files.length} {files.length === 1 ? (t('workspace.file') || 'file') : (t('workspace.files') || 'files')} ·{' '}
          {formatSize(files.reduce((sum, f) => sum + f.size, 0))}
        </div>
      </div>
    </Modal>
    <PreviewModal
      file={previewFile}
      onClose={() => setPreviewFile(null)}
    />
    </>
  );
}
