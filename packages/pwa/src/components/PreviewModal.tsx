import React, { useEffect, useMemo, useState } from 'react';
import type { WorkspaceFile } from '@bsky/app';
import { useI18n } from '@bsky/app';
import { Modal } from './Modal.js';
import { Icon } from './Icon.js';

interface PreviewModalProps {
  file: WorkspaceFile | null;
  onClose: () => void;
}

export function PreviewModal({ file, onClose }: PreviewModalProps) {
  const { t } = useI18n();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file && file.mimeType.startsWith('image/')) {
      const blob = new Blob([file.data as BlobPart], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setBlobUrl(null);
      };
    }
    setBlobUrl(null);
  }, [file]);

  const textContent = useMemo(() => {
    if (!file || file.mimeType.startsWith('image/')) return null;
    try {
      return new TextDecoder('utf-8').decode(file.data);
    } catch {
      return null;
    }
  }, [file]);

  const csvData = useMemo(() => {
    if (!file || !textContent) return null;
    if (!file.mimeType.includes('csv') && !file.name.toLowerCase().endsWith('.csv')) {
      return null;
    }

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < textContent.length; i++) {
      const char = textContent[i];
      const nextChar = textContent[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentField += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentField);
          currentField = '';
        } else if (char === '\n') {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
        } else if (char === '\r') {
          // Skip carriage return, \n will handle the line break
        } else {
          currentField += char;
        }
      }
    }

    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows;
  }, [file, textContent]);

  const jsonContent = useMemo(() => {
    if (!file || !textContent) return null;
    if (!file.mimeType.includes('json') && !file.name.toLowerCase().endsWith('.json')) {
      return null;
    }
    try {
      return JSON.parse(textContent);
    } catch {
      return null;
    }
  }, [file, textContent]);

  const handleDownload = () => {
    if (!file) return;
    const blob = new Blob([file.data as BlobPart], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!file) return null;

  const renderContent = () => {
    // Images
    if (file.mimeType.startsWith('image/')) {
      if (!blobUrl) {
        return (
          <div className="flex items-center justify-center py-12 text-text-secondary">
            {t('common.loading') || 'Loading...'}
          </div>
        );
      }
      return (
        <img
          src={blobUrl}
          alt={file.name}
          className="max-w-full max-h-[60vh] object-contain mx-auto"
        />
      );
    }

    // CSV files
    if (csvData && csvData.length > 0) {
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface border-b border-border">
                {csvData[0]?.map((header, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left text-text-primary font-semibold border-r border-border last:border-r-0"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csvData.slice(1).map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-border last:border-b-0 hover:bg-surface/50"
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-3 py-2 text-text-secondary border-r border-border last:border-r-0"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // JSON files
    if (jsonContent !== null) {
      const formatted = JSON.stringify(jsonContent, null, 2);
      return (
        <pre
          className="text-sm whitespace-pre-wrap break-all font-mono leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlightJson(formatted) }}
        />
      );
    }

    // Text files
    const isTextFile =
      file.mimeType.startsWith('text/') ||
      file.name.toLowerCase().endsWith('.md') ||
      file.name.toLowerCase().endsWith('.txt') ||
      file.name.toLowerCase().endsWith('.markdown') ||
      file.name.toLowerCase().endsWith('.mdx');

    if (isTextFile && textContent !== null) {
      return (
        <pre className="text-sm whitespace-pre-wrap break-all font-mono text-text-primary leading-relaxed">
          {textContent}
        </pre>
      );
    }

    // Unsupported files
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Icon name="file-text" size={48} className="text-text-secondary opacity-50" />
        <p className="text-text-secondary text-sm text-center">
          {t('preview.notAvailable') || 'Preview not available for this file type.'}
        </p>
        <button
          onClick={handleDownload}
          className="px-4 py-2 rounded-lg bg-surface border border-border text-text-primary hover:bg-surface/80 transition-colors text-sm flex items-center gap-2"
          aria-label={t('action.download') || 'Download'}
        >
          <Icon name="download" size={16} />
          {t('action.download') || 'Download'}
        </button>
      </div>
    );
  };

  return (
    <Modal open={!!file} onClose={onClose} titleId="preview-title">
      <div className="flex flex-col max-h-[75vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 gap-3">
          <h2
            id="preview-title"
            className="text-base font-semibold text-text-primary flex items-center gap-2 truncate"
          >
            <Icon name="eye" size={18} />
            <span className="truncate">{file.name}</span>
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface transition-colors shrink-0"
            aria-label={t('action.close') || 'Close'}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0 text-xs text-text-secondary flex items-center justify-between">
          <span className="truncate">{file.mimeType}</span>
          <span className="shrink-0">{formatSize(file.size)}</span>
        </div>
      </div>
    </Modal>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightJson(json: string): string {
  const escaped = escapeHtml(json);
  const strings: string[] = [];

  // Replace JSON strings with placeholders to protect them from other regexes
  const withoutStrings = escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g,
    (match) => {
      const isKey = match.endsWith(':');
      const cls = isKey ? 'text-sky-400' : 'text-emerald-400';
      const index = strings.push(`<span class="${cls}">${match}</span>`) - 1;
      return `__STRING_${index}__`;
    }
  );

  // Highlight booleans, null, numbers, and structural punctuation
  const highlighted = withoutStrings
    .replace(/\b(true|false|null)\b/g, '<span class="text-amber-400">$&</span>')
    .replace(/\b\d+\.?\d*\b/g, '<span class="text-violet-400">$&</span>')
    .replace(/([{}\[\],])/g, '<span class="text-text-secondary">$1</span>');

  // Restore strings
  return highlighted.replace(/__STRING_(\d+)__/g, (_, index) => strings[parseInt(index, 10)]);
}
