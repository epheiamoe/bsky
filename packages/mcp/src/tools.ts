import { createTools, type ToolDescriptor } from '@bsky/core';
import type { BskyClient } from '@bsky/core';

const WRITE_TOOL_NAMES = new Set([
  'create_post',
  'like',
  'repost',
  'follow',
  'create_list',
  'edit_list_members',
]);

export interface McpToolListEntry {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
}

export function getMcpTools(client: BskyClient, enableWrite: boolean) {
  const allDescriptors = createTools(client);

  const allowed = allDescriptors.filter((d) =>
    enableWrite || !d.requiresWrite,
  );

  const list: McpToolListEntry[] = allowed.map((d) => ({
    name: d.definition.name,
    description: d.requiresWrite
      ? `[WRITE] ${d.definition.description}`
      : d.definition.description,
    inputSchema: d.definition.inputSchema,
  }));

  return { descriptors: allowed, list };
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  descriptors: ToolDescriptor[],
  client: BskyClient,
  enableWrite: boolean,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tool = descriptors.find((d) => d.definition.name === name);
  if (!tool) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) },
      ],
    };
  }

  if (tool.requiresWrite && !enableWrite) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error:
              'Write tools are disabled. Set BSKY_ENABLE_WRITE=true to enable them.',
          }),
        },
      ],
    };
  }

  try {
    const jsonText = await tool.handler(args, undefined);
    return { content: [{ type: 'text', text: jsonText }] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    };
  }
}
