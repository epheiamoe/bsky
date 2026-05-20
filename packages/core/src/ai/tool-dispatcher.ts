/**
 * Unified Tool Dispatcher — single source of truth for all bsky_tools API calls.
 *
 * Architecture:
 * - All platforms (PWA, TUI, MCP) route Python tool calls through this dispatcher
 * - Reuses existing tool handlers from tools.ts (zero duplication)
 * - Centralizes fields filtering, error handling, and response normalization
 *
 * Usage:
 *   const dispatcher = new ToolDispatcher(client);
 *   const response = await dispatcher.dispatch({
 *     method: 'search_posts',
 *     params: { q: 'AI', limit: 10 }
 *   });
 */

import { createTools, type ToolHandler } from './tools.js';
import type { BskyClient } from '../at/client.js';
import { filterFields } from './bsky-tools-api.js';

export interface ToolDispatchRequest {
  method: string;
  params: Record<string, unknown>;
}

export interface ToolDispatchResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

export class ToolDispatcher {
  private handlers: Map<string, ToolHandler>;

  constructor(client: BskyClient) {
    const tools = createTools(client);
    this.handlers = new Map();
    for (const tool of tools) {
      if (tool.definition.name !== 'execute_python') {
        this.handlers.set(tool.definition.name, tool.handler);
      }
    }
  }

  async dispatch(request: ToolDispatchRequest): Promise<ToolDispatchResponse> {
    const handler = this.handlers.get(request.method);
    if (!handler) {
      return { success: false, error: `Unknown method: ${request.method}` };
    }

    try {
      // Extract fields before calling handler
      const params = { ...request.params };
      const fields = params.fields as string[] | string | undefined;
      delete params.fields;

      // Call handler (returns JSON string)
      const jsonResult = await handler(params);
      const result = JSON.parse(jsonResult);

      // Apply fields filtering if requested
      if (fields !== undefined && fields !== null) {
        let fieldList: string[];
        if (typeof fields === 'string') {
          fieldList = fields.split(',').map(f => f.trim()).filter(f => f.length > 0);
        } else if (Array.isArray(fields)) {
          fieldList = fields;
        } else {
          fieldList = [];
        }

        if (fieldList.length > 0) {
          return {
            success: true,
            result: filterFields(result, fieldList),
          };
        }
      }

      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
