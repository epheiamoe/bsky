// @bsky/core - Public API surface
// No UI dependencies. Pure functions and classes for Bluesky AT Protocol and AI.

export { BskyClient } from './at/client.js';
export { createTools } from './at/tools.js';
export type { ToolDefinition, ToolHandler, ToolDescriptor } from './at/tools.js';
export { parseAtUri } from './at/types.js';
export type {
  PostView,
  ProfileView,
  ProfileViewBasic,
  Notification,
  ThreadViewPost,
  NotFoundPost,
  CreateSessionResponse,
  PostRecord,
  GetBookmarksResponse,
  BookmarkResult,
} from './at/types.js';

// AI exports
export { AIAssistant, singleTurnAI, translateToChinese, polishDraft } from './ai/assistant.js';
export type { AIConfig, ChatMessage, ToolCall } from './ai/assistant.js';
