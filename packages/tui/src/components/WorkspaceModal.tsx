import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { getDefaultWorkspaceStorage, useI18n } from '@bsky/app';
import type { WorkspaceFile } from '@bsky/app';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { wrapLines } from '../utils/text.js';

interface WorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  chatId?: string;
}

type ModalMode = 'list' | 'preview' | 'download' | 'upload' | 'delete';

export function WorkspaceModal({ open, onClose, chatId }: WorkspaceModalProps) {
  const { t } = useI18n();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<ModalMode>('list');
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null);
  const [inputPath, setInputPath] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const messageTimer = useRef<NodeJS.Timeout | null>(null);

  const loadFiles = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const storage = getDefaultWorkspaceStorage();
      const list = await storage.listFiles(chatId);
      setFiles(list);
      if (selectedIdx >= list.length) setSelectedIdx(Math.max(0, list.length - 1));
    } catch (err) {
      console.error('Failed to load workspace files:', err);
      showMessage(t('error.loadFailed') || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [open, chatId, selectedIdx, t]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const showMessage = useCallback((msg: string) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setMessage(msg);
    messageTimer.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getFileIcon = (mimeType: string, filename?: string): string => {
    if (mimeType.startsWith('image/')) return '[I]';
    if (mimeType.startsWith('video/')) return '[V]';
    if (mimeType.includes('csv')) return '[T]';
    if (mimeType.includes('json')) return '{ }';
    if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext && ['png', 'jpg', 'jpeg'].includes(ext)) return '[I]';
      if (ext === 'csv') return '[T]';
      if (ext === 'json') return '{ }';
    }
    return '[F]';
  };

  const canPreviewText = (mimeType: string, filename?: string): boolean => {
    if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('csv')) return true;
    if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext && ['csv', 'json', 'txt', 'md'].includes(ext)) return true;
    }
    return false;
  };

  const handlePreview = useCallback((file: WorkspaceFile) => {
    if (!canPreviewText(file.mimeType, file.name)) {
      showMessage(t('workspace.cannotPreview') || 'Cannot preview this file type');
      return;
    }
    try {
      const text = new TextDecoder().decode(file.data);
      setPreviewContent(text);
      setPreviewFile(file);
      setMode('preview');
    } catch {
      showMessage(t('error.previewFailed') || 'Failed to preview file');
    }
  }, [showMessage, t]);

  const handleDownload = useCallback((file: WorkspaceFile) => {
    setPreviewFile(file);
    setInputPath(file.name);
    setMode('download');
  }, []);

  const handleDelete = useCallback((file: WorkspaceFile) => {
    setPreviewFile(file);
    setMode('delete');
  }, []);

  const executeDownload = useCallback(() => {
    if (!previewFile || !inputPath.trim()) {
      setMode('list');
      return;
    }
    try {
      writeFileSync(inputPath.trim(), Buffer.from(previewFile.data));
      showMessage((t('action.downloaded') || 'Downloaded') + ': ' + inputPath.trim());
    } catch (err) {
      showMessage((t('error.downloadFailed') || 'Download failed') + ': ' + String(err));
    }
    setInputPath('');
    setMode('list');
  }, [previewFile, inputPath, showMessage, t]);

  const executeDelete = useCallback(async () => {
    if (!previewFile) {
      setMode('list');
      return;
    }
    try {
      const storage = getDefaultWorkspaceStorage();
      await storage.deleteFile(previewFile.id);
      showMessage(t('action.deleted') || 'Deleted');
      await loadFiles();
    } catch (err) {
      showMessage((t('error.deleteFailed') || 'Delete failed') + ': ' + String(err));
    }
    setPreviewFile(null);
    setMode('list');
  }, [previewFile, showMessage, loadFiles, t]);

  const executeUpload = useCallback(async () => {
    if (!inputPath.trim()) {
      setMode('list');
      return;
    }
    const path = inputPath.trim();
    if (!existsSync(path)) {
      showMessage(t('error.fileNotFound') || 'File not found');
      setInputPath('');
      setMode('list');
      return;
    }
    try {
      const data = readFileSync(path);
      const name = path.split(/[\\/]/).pop() || 'unknown';
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'csv' ? 'text/csv' : ext === 'json' ? 'application/json' : 'application/octet-stream';
      const id = crypto.randomUUID();
      const storage = getDefaultWorkspaceStorage();
      await storage.saveFile({
        id,
        name,
        mimeType,
        size: data.length,
        data: new Uint8Array(data),
        uploadedAt: new Date().toISOString(),
        chatId,
      });
      showMessage(t('action.uploaded') || 'Uploaded');
      await loadFiles();
    } catch (err) {
      showMessage((t('error.uploadFailed') || 'Upload failed') + ': ' + String(err));
    }
    setInputPath('');
    setMode('list');
  }, [inputPath, chatId, showMessage, loadFiles, t]);

  // Keyboard handling
  useInput((input, key) => {
    if (!open) return;

    if (mode === 'preview') {
      if (key.escape || input === 'q' || input === 'Q') {
        setMode('list');
        setPreviewFile(null);
        setPreviewContent(null);
      }
      return;
    }

    if (mode === 'download' || mode === 'upload') {
      if (key.escape) {
        setMode('list');
        setInputPath('');
        return;
      }
      if (key.return) {
        if (mode === 'download') executeDownload();
        else executeUpload();
        return;
      }
      return;
    }

    if (mode === 'delete') {
      if (input === 'y' || input === 'Y' || key.return) {
        void executeDelete();
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setMode('list');
        setPreviewFile(null);
        return;
      }
      return;
    }

    // list mode
    if (key.escape || input === 'q' || input === 'Q') {
      onClose();
      return;
    }

    if (input === 'u' || input === 'U') {
      setInputPath('');
      setMode('upload');
      return;
    }

    if (files.length === 0) return;

    if (key.upArrow) {
      setSelectedIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx(i => Math.min(files.length - 1, i + 1));
      return;
    }

    const file = files[selectedIdx];
    if (!file) return;

    if (key.return) {
      handlePreview(file);
      return;
    }
    if (input === 'd' || input === 'D') {
      handleDownload(file);
      return;
    }
    if (key.delete) {
      handleDelete(file);
      return;
    }
  });

  if (!open) return null;

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={1} paddingY={1}>
      {/* Header */}
      <Box height={1}>
        <Text bold color="cyan">{t('workspace.title') || 'Workspace'}</Text>
        <Text dimColor>{' '}{files.length} {files.length === 1 ? (t('workspace.file') || 'file') : (t('workspace.files') || 'files')} · {formatSize(totalSize)}</Text>
      </Box>

      {/* Message toast */}
      {message && (
        <Box>
          <Text color="green">{message}</Text>
        </Box>
      )}

      {/* Mode: list */}
      {mode === 'list' && (
        <>
          {loading && (
            <Box>
              <Text dimColor>{t('common.loading') || 'Loading...'}</Text>
            </Box>
          )}
          {!loading && files.length === 0 && (
            <Box>
              <Text dimColor>{t('workspace.empty') || 'No files in workspace'}</Text>
            </Box>
          )}
          {files.map((file, i) => (
            <Box key={file.id} height={1}>
              <Text color={i === selectedIdx ? 'cyan' : undefined}>{i === selectedIdx ? '▸' : ' '}</Text>
              <Text>{' '}</Text>
              <Text dimColor>{getFileIcon(file.mimeType, file.name)}</Text>
              <Text color={i === selectedIdx ? 'cyanBright' : undefined}>{' '}{file.name}</Text>
              <Text dimColor>{' '}{formatSize(file.size)} · {new Date(file.uploadedAt).toLocaleString()}</Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>{'↑↓:nav Enter:preview d:download Del:delete u:upload q:close'}</Text>
          </Box>
        </>
      )}

      {/* Mode: preview */}
      {mode === 'preview' && previewFile && (
        <Box flexDirection="column">
          <Box>
            <Text bold>{previewFile.name}</Text>
            <Text dimColor>{' '}{formatSize(previewFile.size)}</Text>
          </Box>
          {previewContent && (
            <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
              {wrapLines(previewContent, 80, 0).map((line, i) => (
                <Box key={i}>
                  <Text>{line}</Text>
                </Box>
              ))}
            </Box>
          )}
          {previewContent === null && (
            <Box>
              <Text>{'[Image: '}{previewFile.name}{'] (path: /workspace/output/'}{previewFile.name}{')'}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>{'Esc/q: back'}</Text>
          </Box>
        </Box>
      )}

      {/* Mode: download */}
      {mode === 'download' && previewFile && (
        <Box flexDirection="column">
          <Box>
            <Text bold>{t('action.download') || 'Download'}: {previewFile.name}</Text>
          </Box>
          <Box>
            <Text dimColor>{'Save to:'}</Text>
            <TextInput
              value={inputPath}
              onChange={setInputPath}
              onSubmit={executeDownload}
              placeholder="Enter save path..."
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>{'Enter: confirm Esc: cancel'}</Text>
          </Box>
        </Box>
      )}

      {/* Mode: upload */}
      {mode === 'upload' && (
        <Box flexDirection="column">
          <Box>
            <Text bold>{t('action.upload') || 'Upload'}</Text>
          </Box>
          <Box>
            <Text dimColor>{'File path:'}</Text>
            <TextInput
              value={inputPath}
              onChange={setInputPath}
              onSubmit={executeUpload}
              placeholder="Enter file path..."
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>{'Enter: confirm Esc: cancel'}</Text>
          </Box>
        </Box>
      )}

      {/* Mode: delete confirm */}
      {mode === 'delete' && previewFile && (
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">{t('action.delete') || 'Delete'}: {previewFile.name}?</Text>
          <Box marginTop={1}>
            <Text color="green">{'[Y/Enter] '}{t('action.confirm')}</Text>
            <Text>{'  '}</Text>
            <Text color="red">{'[N/Esc] '}{t('action.cancel')}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
