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
export { AIAssistant, singleTurnAI, translateToChinese, translateText, polishDraft } from './ai/assistant.js';
export type { TranslationResult } from './ai/assistant.js';
export type { AIConfig, ChatMessage, ToolCall } from './ai/assistant.js';

// AI prompts (centralized, single source of truth)
export {
  LANG_LABELS,
  P_ASSISTANT_BASE,
  PF_CURRENT_USER,
  PF_PROFILE_CONTEXT,
  PF_POST_CONTEXT,
  PF_ENVIRONMENT,
  PF_LOCALE_HINT,
  P_CONCISE,
  PF_TRANSLATE_SIMPLE,
  PF_TRANSLATE_JSON,
  P_POLISH_SYSTEM,
  PF_POLISH_USER,
  PF_AUTO_ANALYSIS,
  P_GUIDING_QUESTIONS,
} from './ai/prompts.js';
