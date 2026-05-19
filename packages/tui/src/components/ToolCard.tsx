import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { PythonResult } from './PythonResult.js';

// ── Utility types ──
interface ToolResultDisplay {
  summary: string;
  body: string;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '...';
}

function jsonTry<T>(text: string, fn: (obj: Record<string, unknown>) => T | null): T | null {
  try {
    return fn(JSON.parse(text) as Record<string, unknown>);
  } catch {
    return null;
  }
}

function formatToolResult(toolName: string, content: string): ToolResultDisplay {
  // Write tools
  if (toolName === 'create_post') {
    const r = jsonTry(content, obj => ({ text: truncate(String(obj.text ?? ''), 200), uri: String(obj.uri ?? '') }));
    if (r) return { summary: truncate(r.text, 80), body: `${r.text}\n${r.uri}` };
    return { summary: 'Posted', body: truncate(content, 500) };
  }
  if (toolName === 'like') {
    const r = jsonTry(content, obj => ({ liked: String(obj.liked ?? ''), cid: String(obj.cid ?? '') }));
    const rkey = r?.liked ? r.liked.split('/').pop() : '';
    return { summary: rkey ? `Liked: ...${rkey?.slice(-8)}` : 'Liked', body: r ? `Liked: ${r.liked}` : truncate(content, 300) };
  }
  if (toolName === 'repost') {
    const r = jsonTry(content, obj => ({ reposted: String(obj.reposted ?? ''), cid: String(obj.cid ?? '') }));
    const rkey = r?.reposted ? r.reposted.split('/').pop() : '';
    return { summary: rkey ? `Reposted: ...${rkey?.slice(-8)}` : 'Reposted', body: r ? `Reposted: ${r.reposted}` : truncate(content, 300) };
  }
  if (toolName === 'follow') {
    const r = jsonTry(content, obj => String(obj.followed ?? ''));
    const short = r ? r.split(':').pop()?.slice(0, 10) : '';
    return { summary: short ? `Followed: ...${short}` : 'Followed', body: r ? `Followed: ${r}` : truncate(content, 300) };
  }
  if (toolName === 'create_list') {
    const r = jsonTry(content, obj => ({ name: String(obj.name ?? ''), uri: String(obj.uri ?? '') }));
    return { summary: r?.name ?? 'List created', body: r ? `Created list: ${r.name}\n${r.uri}` : truncate(content, 300) };
  }
  if (toolName === 'edit_list_members') {
    const r = jsonTry(content, obj => ({ list: String(obj.list ?? ''), action: String(obj.action ?? ''), subject: String(obj.subject ?? '') }));
    return { summary: r ? `${r.action} ${r.subject} to ${r.list}` : 'List updated', body: truncate(content, 300) };
  }
  // Read tools — return truncated content
  return { summary: truncate(content, 80), body: truncate(content, 500) };
}

// ── Component props ──
interface ToolCardProps {
  toolName: string;
  args?: string;
  resultContent?: string;
  expanded: boolean;
  onToggle: () => void;
  chatId?: string;
}

export function ToolCard({ toolName, args, resultContent, expanded, chatId }: ToolCardProps) {
  const display = useMemo(
    () => formatToolResult(toolName, resultContent ?? args ?? ''),
    [toolName, resultContent, args]
  );

  const formattedArgs = useMemo(() => {
    if (!args) return '';
    // Special handling for execute_python: show code line count instead of raw code
    if (toolName === 'execute_python') {
      const match = args.match(/\{.*\}/s);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          const code = (parsed.code as string) || '';
          const lines = code.split('\n').filter((l: string) => l.trim()).length;
          return `Code · ${lines} line${lines !== 1 ? 's' : ''}`;
        } catch {}
      }
      return 'Python code';
    }
    const match = args.match(/\{.*\}/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return Object.entries(parsed)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(', ');
      } catch {}
    }
    return args;
  }, [args, toolName]);

  const previewText = toolName === 'execute_python' ? 'Python sandbox execution' : display.summary;

  // Collapsed view
  if (!expanded) {
    return (
      <Text color="yellow">
        {'▸ 🔧 '}{toolName}: {previewText}
      </Text>
    );
  }

  // Expanded view
  return (
    <Box flexDirection="column">
      <Text color="yellow">{'▼ 🔧 '}{toolName}</Text>

      {formattedArgs && (
        <Text color="yellow" dimColor>{'| Args: '}{formattedArgs}</Text>
      )}

      {/* Always show Python code for execute_python */}
      {toolName === 'execute_python' && args && (
        <Box flexDirection="column">
          <Text color="yellow" dimColor>{'| Python Code:'}</Text>
          {(() => {
            const match = args.match(/\{.*\}/s);
            if (match) {
              try {
                const parsed = JSON.parse(match[0]);
                const code = (parsed.code as string) || '';
                return code.split('\n').map((line: string, i: number) => (
                  <Text key={i} color="yellow" dimColor>{'| '}{line}</Text>
                ));
              } catch {}
            }
            return null;
          })()}
        </Box>
      )}

      <Text color="yellow" dimColor>{'| Result:'}</Text>

      {toolName === 'execute_python' && resultContent ? (
        <PythonResult result={resultContent} chatId={chatId} />
      ) : toolName !== 'execute_python' ? (
        display.body.split('\n').map((line, i) => (
          <Text key={i} color="yellow" dimColor>{'| '}{line}</Text>
        ))
      ) : (
        <Text color="yellow" dimColor>{'| 等待执行结果...'}</Text>
      )}
    </Box>
  );
}
