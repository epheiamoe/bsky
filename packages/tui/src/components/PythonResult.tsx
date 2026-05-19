import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { getDefaultWorkspaceStorage } from '@bsky/app';
import type { WorkspaceFile } from '@bsky/app';
import { wrapLines } from '../utils/text.js';

interface PythonResultProps {
  result: string;
  chatId?: string;
}

export function PythonResult({ result, chatId }: PythonResultProps) {
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [expandedError, setExpandedError] = useState(false);
  const [expandedStdout, setExpandedStdout] = useState(true);

  const parsed = useMemo(() => {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }, [result]);

  // Load workspace files and filter by executionTimestamp
  useEffect(() => {
    if (!chatId || !parsed?.executionTimestamp) return;
    const loadFiles = async () => {
      try {
        const storage = getDefaultWorkspaceStorage();
        const files = await storage.listFiles(chatId);
        const executionTimestamp = typeof parsed.executionTimestamp === 'number' ? parsed.executionTimestamp : 0;
        const recentFiles = files.filter(f => {
          const fileTime = new Date(f.uploadedAt).getTime();
          return fileTime >= executionTimestamp - 5000; // 5s tolerance
        });
        setWorkspaceFiles(recentFiles);
      } catch (err) {
        console.error('Failed to load workspace files:', err);
      }
    };
    loadFiles();
  }, [chatId, parsed?.executionTimestamp]);

  if (!parsed || typeof parsed !== 'object') {
    return <Text color="red">Failed to parse execution result</Text>;
  }

  const success = parsed.success === true;
  const hasStdout = typeof parsed.stdout === 'string' && parsed.stdout.length > 0;
  const hasStderr = typeof parsed.stderr === 'string' && parsed.stderr.length > 0;
  const hasError = typeof parsed.error === 'string' && parsed.error.length > 0;
  const hasExecutionTime = typeof parsed.executionTime === 'number';
  const hasFiles = workspaceFiles.length > 0;

  const errorText = hasError ? String(parsed.error) : '';
  const isErrorLong = errorText.length > 200;

  return (
    <Box flexDirection="column">
      {!success && hasError && (
        <Box flexDirection="column">
          <Text color="red" bold>
            {expandedError ? '▼' : '▸'} Execution Error
          </Text>
          {expandedError ? (
            errorText.split('\n').map((line: string, i: number) => (
              <Text key={i} color="red" dimColor>{'| '}{line}</Text>
            ))
          ) : (
            <Text color="red" dimColor>{'| '}{isErrorLong ? errorText.slice(0, 80) + '...' : errorText}</Text>
          )}
        </Box>
      )}

      {hasStdout && (
        <Box flexDirection="column">
          <Text dimColor bold>
            {expandedStdout ? '▼' : '▸'} Output ({parsed.stdout.split('\n').length} lines)
          </Text>
          {expandedStdout && (
            parsed.stdout.split('\n').map((line: string, i: number) => (
              <Text key={i} dimColor>{'| '}{line}</Text>
            ))
          )}
        </Box>
      )}

      {hasStderr && (
        <Box flexDirection="column">
          <Text color="yellow" bold>{'▼'} Warnings / Errors</Text>
          {parsed.stderr.split('\n').map((line: string, i: number) => (
            <Text key={i} color="yellow" dimColor>{'| '}{line}</Text>
          ))}
        </Box>
      )}

      {hasFiles && (
        <Box flexDirection="column">
          <Text bold>{'▼'} Files ({workspaceFiles.length})</Text>
          {workspaceFiles.map((file, i) => (
            <Box key={i} flexDirection="column">
              <Text>{'| '}{file.name} ({formatBytes(file.size)})</Text>
              <FilePreview file={file} />
            </Box>
          ))}
        </Box>
      )}

      {hasExecutionTime && (
        <Text dimColor>
          {'| '}{success ? 'Success' : 'Failed'}{' · '}{parsed.executionTime}{'ms'}
        </Text>
      )}
    </Box>
  );
}

function FilePreview({ file }: { file: WorkspaceFile }) {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return <Text dimColor>{'|   [Image] '}{file.name}</Text>;
  }

  if (ext === 'csv') {
    try {
      const text = new TextDecoder().decode(file.data);
      const lines = text.split('\n').slice(0, 20);
      return (
        <Box flexDirection="column">
          {lines.map((line, i) => (
            <Text key={i} dimColor>{'|   '}{line}</Text>
          ))}
          {text.split('\n').length > 20 && (
            <Text dimColor>{'|   ... ('}{text.split('\n').length - 20}{' more rows)'}</Text>
          )}
        </Box>
      );
    } catch {
      return <Text dimColor>{'|   [CSV preview failed]'}</Text>;
    }
  }

  if (ext === 'json') {
    try {
      const text = new TextDecoder().decode(file.data);
      const obj = JSON.parse(text);
      const pretty = JSON.stringify(obj, null, 2);
      const lines = pretty.split('\n').slice(0, 30);
      return (
        <Box flexDirection="column">
          {lines.map((line, i) => (
            <Text key={i} dimColor>{'|   '}{line}</Text>
          ))}
          {pretty.split('\n').length > 30 && (
            <Text dimColor>{'|   ... ('}{pretty.split('\n').length - 30}{' more lines)'}</Text>
          )}
        </Box>
      );
    } catch {
      return <Text dimColor>{'|   [JSON preview failed]'}</Text>;
    }
  }

  if (['txt', 'md', 'py'].includes(ext)) {
    try {
      const text = new TextDecoder().decode(file.data);
      const lines = text.split('\n').slice(0, 20);
      return (
        <Box flexDirection="column">
          {lines.map((line, i) => (
            <Text key={i} dimColor>{'|   '}{line}</Text>
          ))}
          {text.split('\n').length > 20 && (
            <Text dimColor>{'|   ... ('}{text.split('\n').length - 20}{' more lines)'}</Text>
          )}
        </Box>
      );
    } catch {
      return <Text dimColor>{'|   [Text preview failed]'}</Text>;
    }
  }

  return <Text dimColor>{'|   ['}{ext.toUpperCase()}{' file] '}{formatBytes(file.size)}</Text>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
