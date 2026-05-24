// @bsky/core - Public API surface
// No UI dependencies. Pure functions and classes for Bluesky AT Protocol and AI.

export { BskyClient } from './at/client.js';
export { createTools } from './ai/tools.js';
export type { ToolDefinition, ToolHandler, ToolDescriptor } from './ai/tools.js';
export { ToolDispatcher } from './ai/tool-dispatcher.js';
export type { ToolDispatchRequest, ToolDispatchResponse } from './ai/tool-dispatcher.js';
export { parseAtUri } from './at/types.js';
export {
  BUILTIN_FEEDS,
  RECOMMENDED_FEEDS,
  getFeedLabel,
  resolveFeedId,
} from './at/feeds.js';
export type { FeedInfo } from './at/feeds.js';
export type {
  DidDocument,
  ResolveDidResponse,
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
  GetSuggestedFeedsResponse,
  FeedGeneratorView,
  TrendingTopic,
  GetTrendsResponse,
  DraftInput,
  DraftPostInput,
  DraftView,
  DraftsResponse,
  CreateDraftResponse,
  ConvoView,
  ConvoListResponse,
  GetMessagesResponse,
  GetConvoResponse,
  MessageView,
  MessageInput,
  DeletedMessageView,
  SystemMessageView,
  ReactionView,
  ListView,
  ListViewBasic,
  ListViewerState,
  ListItemView,
  ListPurpose,
  ListWithMembership,
  GetListResponse,
  GetListsResponse,
  GetListFeedResponse,
  GetListBlocksResponse,
  GetListMutesResponse,
  GetListsWithMembershipResponse,
  GetActorLikesResponse,
  GetRelationshipsResponse,
  RelationshipInfo,
  ThreadgateRule,
  ThreadgateRecord,
  ThreadgateView,
  Label,
  LabelValueDefinition,
  LabelerPolicies,
  LabelerServiceRecord,
  LabelerView,
  ContentLabelPref,
  ModerationPrefs,
} from './at/types.js';

// AI exports
export { AIAssistant, singleTurnAI, translateToChinese, translateText, polishDraft, generateChatTitle, describeImage } from './ai/assistant.js';
export type { TranslationResult } from './ai/assistant.js';
export type { AIConfig, ChatMessage, ToolCall } from './ai/adapter.js';
export { getAdapter, registerAdapter } from './ai/adapter.js';
export type { ApiAdapter, StreamProcessor } from './ai/adapter.js';

// Adapter implementations (auto-register on import)
import './ai/responses-adapter.js';

// AI prompts (centralized, single source of truth)
export {
  LANG_LABELS,
  buildSystemPrompt,
  PF_AUTO_ANALYSIS,
  P_GUIDING_QUESTIONS,
  PF_TRANSLATE_SIMPLE,
  PF_TRANSLATE_JSON,
  P_POLISH_SYSTEM,
  PF_POLISH_USER,
  P_AUTO_TITLE_SYSTEM,
  PF_AUTO_TITLE_USER,
  P_ALT_DESCRIPTION_SYSTEM,
  PF_ALT_DESCRIPTION_USER,
} from './ai/prompts.js';

// Multi-provider support
export {
  PROVIDERS,
  getProviderById,
  getProviderByBaseUrl,
  getModelInfo,
  cleanBaseUrl,
  isCustomModel,
  shouldSendThinkingParam,
} from './ai/providers.js';
export type { ProviderInfo, ModelInfo } from './ai/providers.js';
export type { LoginErrorDetail } from './at/client.js';

// Moderation / Labeling
export {
  resolveModeration,
  DEFAULT_MODERATION_CONFIG,
  OFFICIAL_LABELER_DID,
  STANDARD_LABELS,
  isStandardLabel,
} from './moderation.js';
export type {
  ModerationAction,
  ModerationDecision,
  LabelerConfig,
  ModerationConfig,
} from './moderation.js';
export { LabelCache } from './moderation-cache.js';
export type { LabelerFailureState, RetryConfig } from './moderation-cache.js';

// Python Sandbox
export type { PythonSandboxEngine, PythonExecutionResult, PythonFile } from './ai/python-sandbox.js';
export { setGlobalPythonSandbox, getGlobalPythonSandbox } from './ai/python-sandbox.js';

// Web fetch utilities
export { fetchViaJina } from './ai/fetchViaJina.js';

// Bsky Tools (Python batch calling)
export {
  BSKY_TOOLS,
  WRITE_TOOLS,
  isWriteTool,
  generatePyodideWrapper,
  generateNodeWrapper,
  generateASTAnalysisCode,
} from './ai/bsky-tools-definitions.js';
export type {
  BskyToolDefinition,
  BskyToolParameter,
  WriteOperationSummary,
  ASTAnalysisResult,
} from './ai/bsky-tools-definitions.js';
export {
  filterFields,
} from './ai/bsky-tools-api.js';
export type {
  BskyToolsAPI,
  BskyToolsBaseOptions,
} from './ai/bsky-tools-api.js';
