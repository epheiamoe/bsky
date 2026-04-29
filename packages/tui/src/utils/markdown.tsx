import React from 'react';
import { Text } from 'ink';

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
      out.push(
        <Text key={key++} bold color={h[1]!.length === 1 ? 'cyanBright' : 'cyan'}>
          {h[2]}
        </Text>
      );
      continue;
    }

    if (line.startsWith('> ')) {
      out.push(
        <Text key={key++} dimColor>│ {line.slice(2)}</Text>
      );
      continue;
    }

    const ul = line.match(/^[\s]*[-*]\s+(.+)/);
    if (ul) {
      const indent = (line.match(/^(\s*)/)?.[1]?.length ?? 0);
      const pad = '  '.repeat(Math.floor(indent / 2));
      out.push(<Text key={key++}>{pad}• {ul[1]}</Text>);
      continue;
    }

    const ol = line.match(/^[\s]*(\d+)\.\s+(.+)/);
    if (ol) {
      const indent = (line.match(/^(\s*)/)?.[1]?.length ?? 0);
      const pad = '  '.repeat(Math.floor(indent / 2));
      out.push(<Text key={key++}>{pad}{ol[1]}. {ol[2]}</Text>);
      continue;
    }

    out.push(<Text key={key++}>{line}</Text>);
  }

  if (inCodeBlock && codeLines.length > 0) {
    for (const cl of codeLines) {
      out.push(<Text key={key++} dimColor>{'  '}{cl}</Text>);
    }
  }

  return out;
}
