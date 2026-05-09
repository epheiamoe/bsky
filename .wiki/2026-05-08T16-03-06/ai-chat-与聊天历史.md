# AI Chat 与聊天历史

`useAIChat` 是整个聊天功能的中心枢纽。它不是一个简单的 API 包装器，而是一个**状态机 + 事件处理器 + 持久化层**的复合体，统一了流式与非流式两种模式，并将 LLM 协程的输出映射为 UI 可消费的消息队列。

## 双模式消息流

Hook 内部根据 `options.stream` 走两条截然不同的路径。

### 流式模式：六种事件类型

当 `stream: true`（PWA 默认），`assistant.sendMessageStreaming()` 返回一个 `AsyncGenerator`，逐个 yield 事件。`useAIChat` 的 `send` 回调在 `for await` 循环中逐一处理：

| 事件类型 | 触发时机 | UI 映射 |
|---------|---------|--------|
| `token` | LLM 返回增量文本 | 追加或创建 `role: 'assistant'` 消息，`streamingContent` 累加器持续更新 |
| `tool_call` | LLM 请求调用工具 | 插入 `role: 'tool_call'` 消息，重置 `streamingContent` 准备下一轮 |
| `tool_result` | 工具执行完成 | 插入 `role: 'tool_result'` 消息 |
| `thinking` | 推理内容（`reasoning_content` / Mistral 结构化块） | 追加到上一条 `thinking` 消息，或新建一条 |
| `done` | 一轮完成 | 无额外操作——文本已通过 `token` 事件逐字写入 |
| `confirmation_needed` | 写操作需要用户批准 | 设置 `pendingConfirmation` 状态，阻塞后续事件直到用户响应 |

**关键设计**：`confirmation_needed` 不是 `type` 联合中的正式成员（代码中用 `as any` 绕过类型检查），它来自 `AIAssistant` 内部的**写操作确认门**。只有当工具的 `requiresWrite` 为 `true` 时才会触发，`useAIChat` 通过 `confirmAction` / `rejectAction` 调用 `assistant.confirmAction(bool)` 放行或取消。用户批准前，协程挂起在 `_waitForConfirmation()` 的 Promise 上。

[来源](packages/app/src/hooks/useAIChat.ts#L251-L330)

### 非流式模式：intermediateSteps

当 `stream: false`（TUI 默认），走 `assistant.sendMessage(text)` 的 Promise 路径。返回值包含 `intermediateSteps` 数组和 `content` 字符串：

```typescript
for (const step of result.intermediateSteps) {
  if (step.type === 'tool_call') {
    // 提取工具名：正则 /Calling (\w+)\(/
    newMsgs.push({ role: 'tool_call', content, toolName });
  } else if (step.type === 'tool_result') {
    newMsgs.push({ role: 'tool_result', content, toolName, toolCallId });
  }
}
newMsgs.push({ role: 'assistant', content: result.content });
```

两种模式的输出最后都会进入同一个 `autoSave` 路径。

[来源](packages/app/src/hooks/useAIChat.ts#L333-L367)

---

## 三个 Effect 的精确分工

`useAIChat` 中有三个 `useEffect`，它们的职责严格分离：

```
┌─────────────────────────────────────────────────────────┐
│  Effect 1: 同步 AIAssistant 配置                         │
│  依赖: [aiConfig, assistant]                            │
│  动作: assistant.updateConfig(aiConfig)                 │
│  用途: provider/model/baseUrl 变化时热更新               │
├─────────────────────────────────────────────────────────┤
│  Effect 2: 加载持久化聊天                                 │
│  依赖: [options?.chatId, storage]                       │
│  动作: storage.loadChat() → setMessages + 重建 assistant│
│  用途: 从磁盘/IndexedDB 恢复会话                         │
├─────────────────────────────────────────────────────────┤
│  Effect 3: 初始化系统提示 + 工具注册                       │
│  依赖: [client, contextUri, ...]                        │
│  动作: client → createTools → assistant.setTools()      │
│        + buildSystemPrompt() + contextRef 记录          │
│  用途: 首次挂载或上下文变化时重置环境                       │
└─────────────────────────────────────────────────────────┘
```

**Effect 1**（第 46-48 行）最简单：每当用户切换 AI 提供商或模型，立即同步到 `AIAssistant` 实例。

**Effect 2**（第 116-172 行）在 `chatId` 变化时从存储层加载记录。但加载不仅仅是 `setMessages`——它还需要**重建 assistant 的内部消息历史**，因为后续的 `editByIndex` 依赖 assistant 中的完整 Message 数组。重建过程将 `AIChatMessage` 的 `tool_call`/`tool_result` 角色映射回 OpenAI 兼容的 `assistant.tool_calls` 和 `tool` 角色格式。注意 `thinking` 角色被跳过，因为它是纯 UI 展示。

**Effect 3**（第 175-217 行）是最复杂的。它负责：
- 调用 `createTools(client)` 注册所有工具
- 将 `options.contextPost` / `options.contextProfile` 写入 `contextRef`（供 `autoSave` 使用）
- 通过 `buildSystemPrompt` 设置系统消息
- 在上下文发生变化时，重置对话（`clearMessages` + `setMessages([])`）

**重要细节**：上下文变化检测使用四个 `useRef`（`lastContextUri`、`lastContextPost`、`lastContextProfile`、`lastChatId`）做新旧值对比，避免重复初始化。

[来源](packages/app/src/hooks/useAIChat.ts#L46-L217)

---

## buildSystemPrompt：碎片组装

系统提示不是写死的字符串，而是由 8 个可选的逻辑片段拼接而成：

```
P_ASSISTANT_BASE          ← 角色定义（核心）
PF_CURRENT_USER           ← 用户名/显示名（可选）
PF_PROFILE_CONTEXT        ← 用户资料上下文（可选，优先于 post）
PF_POST_CONTEXT           ← 帖子上下文（可选）
PF_ENVIRONMENT            ← 环境标识 "tui" | "pwa"
PF_LOCALE_HINT            ← 语言偏好（可选）
PF_CURRENT_TIME           ← 当前时间戳
PF_VISION_HINT            ← 视觉能力开关
P_CONCISE                 ← "请简洁回答" 指令
```

每个片段来自 `@bsky/core` 的 prompt 模块。调用时根据 `contextProfile` 和 `withContext`（即 `contextUri`）决定传入哪个上下文参数。如果同时提供，`contextProfile` 优先走 `PF_PROFILE_CONTEXT`，否则走 `PF_POST_CONTEXT`。

[来源](packages/app/src/hooks/useAIChat.ts#L68-L86)

---

## 自动保存：无感持久化

### 触发时机

`autoSave` 回调在三个时间点被调用：

1. **用户发送消息后**（`setMessages` 内部 `void autoSave(updated)`）
2. **非流式模式返回后**（更新 state 前同步调用）
3. **流式模式完成后**（在 `setMessages` 回调用 `void autoSave(prev)`）
4. **错误发生**（错误消息追加后立即保存）

每次保存的都是**完整的消息数组**，而非增量。`updatedAt` 在存储层写入时更新。

### ChatStorage 接口

```typescript
interface ChatStorage {
  saveChat(chat: ChatRecord): Promise<void>;
  loadChat(id: string): Promise<ChatRecord | null>;
  listChats(): Promise<ChatSummary[]>;
  deleteChat(id: string): Promise<void>;
}
```

`ChatRecord` 包含 `id`、`title`、`contextUri`、`context`（type & uri/handle）、`messages`、`createdAt`、`updatedAt`。标题自动截取首条用户消息的前 80 个字符。

`onChatSaved` 回调在首次自动保存时触发（通过 `chatNotifiedRef` 防重），用于刷新侧边栏会话列表。

[来源](packages/app/src/hooks/useAIChat.ts#L218-L236)

---

## 对话编辑能力

两个互逆的操作实现了对聊天历史的修正：

### undoLastMessage

找到倒数第一条 `role: 'user'` 的消息，截断其后所有内容（包括工具调用和 AI 回复），然后用 `assistant.loadMessages(keep)` 恢复 assistant 状态。

### editByIndex

按用户消息的 0-based 索引定位，截断到该消息之前，返回该用户消息的文本内容。调用者可以将其回填到输入框供用户修改。

```typescript
// 获取第 n 条用户消息的文本并删除其后所有内容
const text = editByIndex(n); // 0, 1, 2...
if (text) setInput(text);
```

**注意**：两种操作都操作的是 `assistant.getMessages()` 中的原始 Message 数组，而非 UI 层的 `AIChatMessage[]`。修改后通过 `mapMessages` 重新映射为 UI 格式。这保证了 assistant 内部状态与 UI 显示的一致性。

[来源](packages/app/src/hooks/useAIChat.ts#L435-L473)

---

## 存储实现对比

`ChatStorage` 接口有两个实现，服务于不同的运行时环境：

| 维度 | FileChatStorage (TUI) | IndexedDBChatStorage (PWA) |
|------|-----------------------|----------------------------|
| **存储介质** | JSON 文件 | 浏览器 IndexedDB |
| **数据库** | `~/.bsky-tui/chats/*.json` | 数据库名 `bsky-chats`，对象仓库 `chats` |
| **读写方式** | `fs.writeFileSync` / `fs.readFileSync`（同步 API，但接口返回 Promise） | `IDBObjectStore.put` / `get`（异步） |
| **索引** | 通过 `fs.readdirSync` 过滤 `.json` 后缀 | `store.getAll()` 获取全部记录 |
| **排序** | `listChats` 中按 `updatedAt` 降序排列 | 同左 |
| **防崩溃** | 无——写入直接覆盖 | 无——IndexedDB 本身有事务保证 |
| **依赖** | `fs`、`path`、`os`（Node.js 内置） | `indexedDB`（浏览器内置） |

**FileChatStorage** 将每条聊天记录存为独立 JSON 文件。初始化时按 `~/.bsky-tui/chats/` 路径创建目录。`listChats` 遍历目录、解析每个文件、提取摘要、按更新时间排序——这可能成为大量对话时的性能瓶颈。

**IndexedDBChatStorage** 位于 `packages/pwa/src/services/` 中，使用 `indexedDB.open` 创建/升级数据库。`saveChat` 调用 `store.put`，`loadChat` 调用 `store.get(id)`。`listChats` 通过 `getAll()` 一次读出全部记录，在 JS 层做过滤排序。

两个实现共享同一套 `ChatRecord` 类型定义，因此导出的 JSON 文件与 IndexedDB 中的记录结构完全兼容。PWA 的导入/导出功能正是利用了这一点。

[来源](packages/app/src/services/chatStorage.ts#L33-L93) | [来源](packages/pwa/src/services/indexeddb-chat-storage.ts#L28-L76)

---

## 相关页面

- [AIAssistant：多提供者 LLM 引擎](aiassistant-多提供者-llm-引擎.md) —— `sendMessageStreaming` 的事件产出源头，包含写操作确认门的完整逻辑
- [36 个 AI 工具：从定义到执行](36-个-ai-工具-从定义到执行.md) —— 工具的 `requiresWrite` 标记如何触发 `confirmation_needed`
- [React Hooks 架构与 Store 模式](react-hooks-架构与-store-模式.md) —— `useAIChat` 在 Hook 全景中的定位
- [PWA 存储与离线能力](pwa-存储与离线能力.md) —— `IndexedDBChatStorage` 的浏览器上下文
- [导航与状态管理](导航与状态管理.md) —— `contextPost` / `contextProfile` 从导航传入的路径
- [Prompt 工程与多提供者注册表](prompt-工程与多提供者注册表.md) —— `P_ASSISTANT_BASE` 等片段的定义来源