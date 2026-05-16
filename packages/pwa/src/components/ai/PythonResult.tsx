import React, { useMemo, useState } from 'react';
import { useI18n } from '@bsky/app';
import { Icon } from '../Icon.js';

interface PythonFile {
  name: string;
  type: string;
  size: number;
  path: string;
  content?: string; // optional — may be omitted to keep chat history lean
}

interface PythonResultProps {
  result: string; // JSON string from the tool result
}

export function PythonResult({ result }: PythonResultProps) {
  const { t } = useI18n();
  const parsed = useMemo(() => {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }, [result]);

  if (!parsed || typeof parsed !== 'object') {
    return (
      <div className="text-red-400 text-sm">
        无法解析执行结果
      </div>
    );
  }

  const success = parsed.success === true;
  const hasStdout = typeof parsed.stdout === 'string' && parsed.stdout.length > 0;
  const hasStderr = typeof parsed.stderr === 'string' && parsed.stderr.length > 0;
  const hasError = typeof parsed.error === 'string' && parsed.error.length > 0;
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  const hasExecutionTime = typeof parsed.executionTime === 'number';

  // Error state
  if (!success) {
    return (
      <div className="space-y-3">
        {hasError && <ErrorBlock error={parsed.error} />}
        {hasStdout && <OutputBlock stdout={parsed.stdout} />}
        {hasStderr && <StderrBlock stderr={parsed.stderr} />}
        {files.length > 0 && <FileList files={files} />}
        {hasExecutionTime && <MetaBar executionTime={parsed.executionTime} success={false} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasStdout && <OutputBlock stdout={parsed.stdout} />}
      {hasStderr && <StderrBlock stderr={parsed.stderr} />}
      {files.length > 0 && <FileList files={files} />}
      {hasExecutionTime && <MetaBar executionTime={parsed.executionTime} success={true} />}
    </div>
  );
}

// ── Error Block ──
function ErrorBlock({ error = '' }: { error?: string }) {
  const safeError = String(error ?? '');
  const [expanded, setExpanded] = useState(false);
  const isLong = safeError.length > 200;
  const displayText = expanded || !isLong ? safeError : safeError.slice(0, 200) + '...';

  return (
    <div className="border border-red-500/20 rounded-xl overflow-hidden">
      <div className="bg-red-500/10 px-3 py-2 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 shrink-0">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span className="text-sm font-medium text-red-400">执行失败</span>
      </div>
      <pre className="px-3 py-2 text-xs text-red-300/90 whitespace-pre-wrap leading-relaxed">
        {displayText}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="px-3 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          {expanded ? '收起' : '展开'}
        </button>
      )}
    </div>
  );
}

// ── Output Block ──
function OutputBlock({ stdout = '' }: { stdout?: string }) {
  const safeStdout = String(stdout ?? '');
  const [expanded, setExpanded] = useState(false);
  const lines = safeStdout.split('\n');
  const isLong = lines.length > 15;
  const displayLines = isLong && !expanded ? lines.slice(0, 15) : lines;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="bg-surface/80 px-3 py-1.5 text-xs font-medium text-text-secondary/60 flex items-center justify-between">
        <span>Standard Output</span>
        <span className="text-text-secondary/40">{lines.length} lines</span>
      </div>
      <pre className="px-3 py-2 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed font-mono text-[13px]">
        {displayLines.join('\n')}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-1.5 text-xs text-text-secondary/60 hover:text-text-secondary hover:bg-surface transition-colors border-t border-border"
        >
          {expanded ? '收起输出' : `展开剩余 ${lines.length - 15} 行`}
        </button>
      )}
    </div>
  );
}

// ── Stderr Block ──
function StderrBlock({ stderr = '' }: { stderr?: string }) {
  return (
    <div className="border border-yellow-500/20 rounded-xl overflow-hidden">
      <div className="bg-yellow-500/10 px-3 py-1.5 text-xs font-medium text-yellow-400">
        Warnings / Errors
      </div>
      <pre className="px-3 py-2 text-xs text-yellow-300/80 whitespace-pre-wrap leading-relaxed font-mono">
        {String(stderr ?? '')}
      </pre>
    </div>
  );
}

// ── File List ──
function FileList({ files }: { files: PythonFile[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-text-secondary/60">
        Output Files ({files.length})
      </div>
      <div className="grid gap-2">
        {files.map((file, i) => (
          <PythonFilePreview key={i} file={file} />
        ))}
      </div>
    </div>
  );
}

function PythonFilePreview({ file }: { file: PythonFile }) {
  const hasContent = typeof file.content === 'string';

  if (file.type === 'csv' && hasContent) {
    return <CsvPreview content={file.content!} filename={file.name} />;
  }

  if (['png', 'jpg', 'jpeg'].includes(file.type) && hasContent) {
    return <ImagePreview content={file.content!} filename={file.name} />;
  }

  if (file.type === 'json' && hasContent) {
    return <JsonPreview content={file.content!} filename={file.name} />;
  }

  // Fallback: show file metadata (content omitted or unsupported type)
  return (
    <div className="flex items-center gap-3 bg-surface rounded-lg px-3 py-2 border border-border">
      <FileIcon type={file.type} />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-text-secondary truncate block">{file.name}</span>
        {!hasContent && (
          <span className="text-xs text-text-secondary/40">在工作区中查看</span>
        )}
      </div>
      <span className="text-xs text-text-secondary/40 shrink-0">{formatSize(file.size)}</span>
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  const iconMap: Record<string, string> = {
    csv: 'table',
    json: 'file-code',
    png: 'file-image',
    jpg: 'file-image',
    jpeg: 'file-image',
    txt: 'file-text',
    md: 'file-text',
    unknown: 'file-text',
  };
  return <Icon name={iconMap[type] || iconMap['unknown']} size={16} className="shrink-0 text-text-secondary/60" />;
}

// ── CSV Preview ──
function CsvPreview({ content, filename }: { content: string; filename: string }) {
  const safeContent = String(content ?? '');
  const rows = useMemo(() => {
    const lines = safeContent.trim().split('\n');
    return lines.map(line => line.split(','));
  }, [safeContent]);

  if (rows.length === 0) return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="bg-surface/80 px-3 py-1.5 text-xs text-text-secondary/60 border-b border-border flex items-center gap-2">
        <Icon name="table" size={14} className="text-text-secondary/40" />
        <span>{filename}</span>
        <span className="ml-auto text-text-secondary/40">{rows.length} rows × {rows[0]?.length} cols</span>
      </div>
      <div className="overflow-x-auto max-h-[300px]">
        <table className="w-full text-sm">
          <thead className="bg-surface/50 sticky top-0">
            <tr>
              {rows[0]!.map((cell, i) => (
                <th key={i} className="px-3 py-1.5 text-left text-text-secondary font-medium text-xs border-b border-border">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, ri) => (
              <tr key={ri} className="border-b border-border/30 last:border-0 hover:bg-surface/30">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1 text-text-secondary/80 text-xs">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Image Preview ──
function ImagePreview({ content, filename }: { content: string; filename: string }) {
  const safeContent = String(content ?? '');
  const src = useMemo(() => `data:image/png;base64,${safeContent}`, [safeContent]);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="bg-surface/80 px-3 py-1.5 text-xs text-text-secondary/60 border-b border-border flex items-center gap-2">
        <Icon name="file-image" size={14} className="text-text-secondary/40" />
        <span>{filename}</span>
      </div>
      <img
        src={src}
        alt={filename}
        className="w-full h-auto max-h-[400px] object-contain bg-black/20"
        loading="lazy"
      />
    </div>
  );
}

// ── JSON Preview ──
function JsonPreview({ content, filename }: { content: string; filename: string }) {
  const safeContent = String(content ?? '');
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(safeContent), null, 2);
    } catch {
      return safeContent;
    }
  }, [safeContent]);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="bg-surface/80 px-3 py-1.5 text-xs text-text-secondary/60 border-b border-border flex items-center gap-2">
        <Icon name="file-code" size={14} className="text-text-secondary/40" />
        <span>{filename}</span>
      </div>
      <pre className="px-3 py-2 text-xs text-text-secondary/80 whitespace-pre overflow-x-auto max-h-[300px] font-mono leading-relaxed">
        {formatted}
      </pre>
    </div>
  );
}

// ── Meta Bar ──
function MetaBar({ executionTime = 0, success }: { executionTime?: number; success: boolean }) {
  const safeTime = typeof executionTime === 'number' ? executionTime : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-text-secondary/40">
      <span className={`w-2 h-2 rounded-full ${success ? 'bg-green-500' : 'bg-red-500'}`}></span>
      <span>{success ? 'Success' : 'Failed'}</span>
      <span>·</span>
      <span>{safeTime}ms</span>
    </div>
  );
}

function formatSize(bytes: number): string {
  const safeBytes = typeof bytes === 'number' && !isNaN(bytes) ? bytes : 0;
  if (safeBytes < 1024) return `${safeBytes}B`;
  if (safeBytes < 1024 * 1024) return `${(safeBytes / 1024).toFixed(1)}KB`;
  return `${(safeBytes / (1024 * 1024)).toFixed(1)}MB`;
}
