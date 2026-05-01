import React from 'react';
import { Text } from 'ink';

const TOKEN_REGEX = /(https?:\/\/[^\s<>"']+|@[a-zA-Z0-9._-]+(?:\.[a-zA-Z]{2,})+)/g;

function tokenizeLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    parts.push(<Text key={match.index} color="blue">{match[1]}</Text>);
    lastIndex = TOKEN_REGEX.lastIndex;
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [line];
}

/**
 * Render markdown to Ink React elements (no ANSI codes).
 * Output is `Array<React.ReactNode>` suitable for direct inclusion.
 */
export function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        if (codeLines.length > 0) {
          for (const cl of codeLines) {
            out.push(
              <Text key={key++} dimColor>{'  '}{cl}</Text>
            );
          }
          codeLines = [];
        }
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      out.push(<Text key={key++}> </Text>);
      continue;
    }

    if (line.match(/^---+\s*$/)) {
      out.push(<Text key={key++} dimColor>{'─'.repeat(36)}</Text>);
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.+)/);
    if (h) {
      const level = h[1]!.length;
      out.push(
        <Text key={key++} bold color={level === 1 ? 'cyanBright' : 'cyan'}>
          {tokenizeLine(h[2]!)}
        </Text>
      );
      continue;
    }

    if (line.startsWith('> ')) {
      out.push(
        <Text key={key++} dimColor>│ {tokenizeLine(line.slice(2))}</Text>
      );
      continue;
    }

    const ul = line.match(/^[\s]*[-*]\s+(.+)/);
    if (ul) {
      const indent = (line.match(/^(\s*)/)?.[1]?.length ?? 0);
      const pad = '  '.repeat(Math.floor(indent / 2));
      out.push(<Text key={key++}>{pad}• {tokenizeLine(ul[1]!)}</Text>);
      continue;
    }

    const ol = line.match(/^[\s]*(\d+)\.\s+(.+)/);
    if (ol) {
      const indent = (line.match(/^(\s*)/)?.[1]?.length ?? 0);
      const pad = '  '.repeat(Math.floor(indent / 2));
      out.push(<Text key={key++}>{pad}{ol[1]}. {tokenizeLine(ol[2]!)}</Text>);
      continue;
    }

    out.push(<Text key={key++}>{tokenizeLine(line)}</Text>);
  }

  if (inCodeBlock && codeLines.length > 0) {
    for (const cl of codeLines) {
      out.push(<Text key={key++} dimColor>{'  '}{cl}</Text>);
    }
  }

  return out;
}
