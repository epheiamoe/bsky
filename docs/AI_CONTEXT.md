# AI Context Injection — 上下文注入机制

> 本文档描述 Bluesky Client 如何将帖子/用户上下文注入 AI 会话，以及如何扩展新的上下文类型。

## 架构概览

```
点击 AI 按钮 (ThreadView/ProfilePage/PostActionsRow)
    │  goTo({ type: 'aiChat', sessionId: uuid, contextPost: uri })
    ▼
useHashRouter.encodeView → 编码到 URL
    │  #/ai?session=uuid&post=at://did:plc:xxx/app.bsky.feed.post/yyy
    ▼
App.tsx → AIChatPage/AIChatView
    │  contextPost / contextProfile 作为 props 传入
    ▼
useAIChat(client, aiConfig, contextUri?, options?)
    │
    ├─► Effect 1 (chatId 变化): 清空 + 注入 system prompt + 引导问题
    │
    ├─► Effect 2 (storage restore): 从 IndexedDB/File 恢复 context
    │
    ├─► Effect 3 (client 就绪): tools 初始化 + context 变化时重新注入
    │
    └─► Auto-start Effect: 仅 profile 上下文 → 自动发送分析消息
```

## System Prompt 组装

所有上下文信息通过 **一条 system message** 注入，由 `buildSystemPrompt()` 组装：

```typescript
// packages/app/src/hooks/useAIChat.ts
function buildSystemPrompt(withContext?: string, contextProfile?: string) {
  const parts = [];
  parts.push(P_ASSISTANT_BASE);           // AI 角色定义 + 3 条硬规则
  parts.push(PF_CURRENT_USER(name, handle)); // 当前用户信息
  if (contextProfile) {
    parts.push(PF_PROFILE_CONTEXT(handle, currentUser));
  } else if (withContext) {
    parts.push(PF_POST_CONTEXT(uri));
  }
  parts.push(PF_ENVIRONMENT('tui'|'pwa'));
  parts.push(PF_LOCALE_HINT(locale));
  parts.push(PF_CURRENT_TIME());
  parts.push(PF_VISION_HINT(enabled));
  parts.push(P_CONCISE);
  return parts.join('');
}
```

| 场景 | 触发方式 | 注入的 Prompt |
|------|----------|---------------|
| 帖子分析 | `goTo({ contextPost: uri })` | `PF_POST_CONTEXT(uri)` — "用户正在查看帖子 at://..." |
| 用户分析 | `goTo({ contextProfile: handle })` | `PF_PROFILE_CONTEXT(handle)` — 详细分析指令 |
| 通用对话 | 无 context | 仅基础 assistant prompt |

## 关键 Prompt 定义

```typescript
// packages/core/src/ai/prompts.ts

// P_ASSISTANT_BASE (line 47):
//   "你是用户的 Bluesky 助手。" + 3 条硬规则禁止主动发帖

// PF_POST_CONTEXT (line 81):
//   "用户正在查看帖子 {uri}，如果需要请用工具获取上下文。"
//   → 简单告知 AI 帖子 URI

// PF_PROFILE_CONTEXT (line 65):
//   [
//     "用户正在查看 {handle} 的主页。",
//     "请先查看他们的近期帖子（get_author_feed）。",
//     "如果当前用户与他们有互动历史，请使用 search_posts...",
//     "概括至少 3 个要点...",
//     "【仅分析，不要代表用户发帖或互动】",
//   ]
//   → 详细指令 + 工具调用指导

// PF_AUTO_ANALYSIS (line 171):
//   "请分析 @{handle} 的主页，概括他们的近期动态。"
//   → 仅 profile 上下文自动发送（500ms 延迟）

// P_GUIDING_QUESTIONS (line 179):
//   ["总结这个讨论", "解释这个讨论", "分析帖子情绪"]
//   → 帖子上下文时显示为可点击按钮
```

## 三个 Effect 的分工

### Effect 1 — chatId 变化（初始导航）

```typescript
// 触发条件: options?.chatId !== lastChatId.current
// 场景: 点击 AI 按钮创建新会话 (sessionId = crypto.randomUUID())
// 行为:
//   - assistant.clearMessages() → 清空对话历史
//   - setMessages([]) → 清空 UI
//   - setGuidingQuestions([]) → 清空引导问题
//   - 注入 system prompt + 设置引导问题
```

### Effect 2 — Storage 恢复（页面刷新后）

```typescript
// 触发条件: storage 存在 && options?.chatId 存在
// 场景: 用户刷新页面，或从 URL 恢复会话
// 行为:
//   - 从 storage 加载 ChatRecord
//   - 恢复 messages（对话历史）
//   - 如果 record.context 存在 → 重新注入 system prompt
//   - 如果 record.messages.length === 0 → 设置 guidingQuestions
```

### Effect 3 — Client 就绪 + context 变化

```typescript
// 触发条件: client 存在 && (contextUri | contextPost | contextProfile) 变化
// 场景: 登录完成后 tools 初始化，或 context 从 A 变到 B
// changed 追踪三个独立 ref:
//   - lastContextUri.current vs contextUri
//   - lastContextPost.current vs options?.contextPost
//   - lastContextProfile.current vs options?.contextProfile
```

## 如何扩展新的上下文类型

### 1. 添加新的 `PF_NEW_CONTEXT` prompt（`prompts.ts`）

```typescript
export function PF_FEED_CONTEXT(feedUri: string): string {
  return [
    `用户正在查看 Feed ${feedUri}。`,
    '请使用 get_feed 工具获取该 Feed 的内容。',
    '总结最近的帖子趋势和讨论主题。',
    '【仅分析，不要代表用户发帖或互动】',
  ].join('');
}
```

### 2. 添加 `P_GUIDING_FEED_QUESTIONS`（`prompts.ts`）

```typescript
export const P_GUIDING_FEED_QUESTIONS = [
  '这个 Feed 在讨论什么',
  '有哪些热门帖子',
  '总结趋势',
];
```

### 3. 在 `UseAIChatOptions` 添加字段（`useAIChat.ts`）

```typescript
interface UseAIChatOptions {
  // ... existing fields
  contextFeed?: string;  // 新增
}
```

### 4. 在 `buildSystemPrompt` 处理新类型（`useAIChat.ts`）

```typescript
if (options?.contextFeed) {
  parts.push(PF_FEED_CONTEXT(options.contextFeed));
}
```

### 5. 更新 Effect 1、2、3 的分支逻辑

在每个 effect 中添加 `contextFeed` 的处理：

```typescript
// Effect 1
} else if (options?.contextFeed) {
  assistant.addSystemMessage(buildSystemPrompt(undefined, undefined, options.contextFeed));
  setGuidingQuestions(P_GUIDING_FEED_QUESTIONS);
}

// Effect 3
lastContextFeed.current = options?.contextFeed;
// ... 在 changed 检查中包含 contextFeed
```

### 6. 在调用方传入新参数

```tsx
goTo({ type: 'aiChat', sessionId: crypto.randomUUID(), contextFeed: feedUri })
```

### 7. 在 `useHashRouter` 编码 URL（可选，用于刷新恢复）

```typescript
if (feed) url += `&feed=${encodeURIComponent(feed)}`;
```

### 8. 在 `ChatRecord.context` 联合类型添加新类型

```typescript
context?: { type: 'post'; uri: string }
  | { type: 'profile'; handle: string }
  | { type: 'feed'; uri: string };  // 新增
```

## 非导航方式复用 AI 分析

如果需要**不导航**直接调用 AI（如弹窗内分析），可：

```typescript
// 方案 A: 直接使用 useAIChat（绕过路由）
function InlineAnalysis({ client, aiConfig, postUri }) {
  const { messages, loading, send } = useAIChat(
    client, aiConfig,
    postUri,  // 作为 3rd arg
    { stream: true, environment: 'pwa' }
  );
  // send(P_GUIDING_QUESTIONS[0]) 直接发送
}

// 方案 B: 导入 buildSystemPrompt + singleTurnAI（最短路径）
import { buildSystemPrompt } from './hooks/useAIChat.js';  // 需 export
import { singleTurnAI } from '@bsky/core';
const prompt = buildSystemPrompt(postUri);
const result = await singleTurnAI(aiConfig, prompt, '分析这个帖子');
```

**注意**：方案 B 需要将 `buildSystemPrompt` 从 hook 内部导出为纯函数。当前它在 `useAIChat` 的 `useCallback` 内，依赖于 `options?.userHandle` 等外部值。建议提取为独立纯函数。

## 常见问题

**Q: 为什么 profile 自动分析但 post 不自动？**
A: Profile 的 `PF_AUTO_ANALYSIS` 在 auto-start effect 中自动发送。Post 无此机制，因为分析帖子通常需要用户选择想分析的方向（总结/解释/情绪）。如果需要 post 也自动分析，在 auto-start effect 中添加 `contextPost` 处理即可。

**Q: contextPost 在 URL 中会丢失吗？**
A: v0.3.0+ 已修复。`useHashRouter.encodeView` 现在将 `contextPost` 和 `contextProfile` 编码为 URL 参数（`&post=` / `&profile=`），页面刷新后 `parseHash` 会恢复。

**Q: TUI 和 PWA 的上下文传递方式有什么不同？**
A: TUI 将 contextPost 作为 `useAIChat` 的 3rd arg (`contextUri`) 传入；PWA 将 3rd arg 设为 `undefined`，全部通过 `options.contextPost` 传入。两种均有效，但需注意 Effect 3 的 `changed` 检查需要追踪所有三个来源。
