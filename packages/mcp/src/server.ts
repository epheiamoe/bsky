import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BskyClient, setGlobalPythonSandbox } from '@bsky/core';
import { NodePythonSandbox } from '@bsky/app/services/node-python-sandbox';
import { loadConfig } from './config.js';
import { getMcpTools, callTool } from './tools.js';

export async function main() {
  const config = loadConfig();

  const client = new BskyClient({ pdsUrl: config.pdsUrl });
  await client.login(config.handle, config.appPassword);

  // Initialize Python sandbox for execute_python tool
  const sandbox = new NodePythonSandbox();
  setGlobalPythonSandbox(sandbox);
  console.error('[MCP] Python sandbox initialized');

  const { descriptors, list: toolList } = getMcpTools(
    client,
    config.enableWrite,
  );

  const server = new Server(
    {
      name: 'bsky',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolList,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return callTool(name, (args ?? {}) as Record<string, unknown>, descriptors, client, config.enableWrite);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
