# AI 对话 Hook 深度解析

`useAIChat` 是 `@bsky/app` 层的核心 Hook，它作为 React 组件与 `AIAssistant` 引擎之间的桥梁，管理着对话状态、消息持久化、流式渲染和用户交互的完整生命周期。525 行代码覆盖了从单例初始化到自动保存的**八个功能块**，每个块都承担着明确的架构职责。

---

## 架构定位：桥接模式

```
┌─────────────────────────────────────────────────────────────┐
│                    React 组件层 (PWA/TUI)                    │
│   send() / stop() / editByIndex() / confirmAction() ...    │
└─────────────────────────┬───────────────────────────────────┘
                          │ useAIChat Hook
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  AIAssistant (纯 TS 类, 零 UI 依赖)                         │
│  sendMessage() / sendMessageStreaming() / messages[]        │
│  _waitForConfirmation() / addUserUpload()                   │
└─────────────────────────────────────────────────────────────┘
```

Hook 不复制 `AIAssistant` 的能力，而是将引擎的状态映射为 React 响应式状态（`messages`、`loading`、`pendingConfirmation`），并将用户交互指令转发回引擎。

[来源](packages/app/src/hooks/useAIChat.ts#L37-L48)

---

## 1. 单例初始化与配置同步

`useState(() => new AIAssistant(aiConfig))` 实现了 React 中常见的**惰性单例模式**——`AIAssistant` 只在组件挂载时创建一次，此后所有重新渲染都复用同一实例。

```typescript
const [assistant] = useState(() => new AIAssistant(aiConfig));

useEffect(() => {
  assistant.updateConfig(aiConfig);
}, [aiConfig, assistant]);
```

`useEffect` 监听 `aiConfig` 对象引用变化，调用 `assistant.updateConfig()` 做**浅合并更新**。这意味着当用户切换 LLM 提供商或修改模型/API Key 时，引擎无需重建，只会更新 `this.config` 的属性值。对比每次都 `new AIAssistant()` 的方案，这种设计避免了丢失已有对话上下文的风险。

这里有一个需要留意的地方：`aiConfig` 作为对象被 React 依赖追踪，如果父组件每次渲染都创建新对象，`updateConfig` 会被频繁调用。建议父组件配合 `useMemo` 稳定引用。

[来源](packages/app/src/hooks/useAIChat.ts#L43-L48) | [AIAssistant 构造函数](packages/core/src/ai/assistant.ts#L109-L115)

---

## 2. 动态系统提示构建

`buildSystemPrompt` 是一个 `useCallback`，负责在当前上下文（帖子/用户主页/无上下文）变化时，动态组合系统提示字符串。

```typescript
const buildSystemPrompt = useCallback((withContext?: string, contextProfile?: string) => {
  const parts: string[] = [];
  parts.push(P_ASSISTANT_BASE);
  if (options?.userHandle || options?.userDisplayName) {
    parts.push(PF_CURRENT_USER(name, options.userHandle));
  }
  if (contextProfile) {
    parts.push(PF_PROFILE_CONTEXT(contextProfile, options?.userHandle));
  } else if (withContext) {
    parts.push(PF_POST_CONTEXT(withContext));
  }
  parts.push(PF_ENVIRONMENT(options?.environment || 'pwa'));
  // ... locale, time, vision, concise
  return parts.join('');
}, [...deps]);
```

组合顺序遵循**从通用到具体**的原则：先是基础角色（`P_ASSISTANT_BASE`），然后是用户身份（`PF_CURRENT_USER`），接着是上下文注入（帖子/个人主页二选一），最后是环境提示和格式控制。所有提示片段定义在 `prompts.ts` 中，采用 `P_`/`PF_` 前缀命名规范。

`contextProfile` 参数使用**二选一分支**（`if contextProfile ... else if withContext`），确保系统提示中不会同时出现帖子上下文和个人主页上下文——这是设计约束，因为同时注入两种上下文会让 AI 混淆分析焦点。

[来源](packages/app/src/hooks/useAIChat.ts#L68-L86) | [提示词体系](ai-助手引擎.md)

---

## 3. 双路径发送机制

`send` 方法是 Hook 最复杂的逻辑块，根据 `options.stream` 走两条独立路径。

### 3.1 流式路径 (`sendMessageStreaming`)

流式路径的核心是 `for await` 消费 `AsyncGenerator`，每次事件立即通过 `setMessages` 推入 React 状态。

```
事件类型 → 状态更新策略
─────────┬───────────────────────────────
token    │ 累积 streamingContent → 追加/替换最后一条 assistant 消息
thinking │ 累加 reasoning_content → 合并或新建 thinking 消息
tool_call│ 重置 streamingContent → 插入 tool_call 消息
tool_result│ 插入 tool_result 消息
confirmation_needed│ 设置 pendingConfirmation（不插入消息）
done     │ 不操作（消息已通过 token 更新完）
```

关键设计细节：

- **`streamingContent` 变量**：跨越多次 `setMessages` 调用保持最新的 token 累积结果。每次 `tool_call` 事件后重置为空，因为下一轮的 assistant 回复是独立的。
- **`thinking` 消息的增量更新**：通过检查 `prev[prev.length-1]?.role === 'thinking'` 来判断是追加还是新建，实现思考过程的逐字渲染。
- **错误处理**：非 `aborted` 的异常会插入一条 `isError: true` 的 assistant 消息，并触发 `autoSave`。

### 3.2 非流式路径 (`sendMessage`)

非流式路径适用于 TUI 终端环境，在 `sendMessage` 返回后才一次性更新状态：

```typescript
const result = await assistant.sendMessage(text);
setMessages(prev => {
  const newMsgs: AIChatMessage[] = [];
  for (const step of result.intermediateSteps) {
    if (step.type === 'tool_call') { ... }
    else if (step.type === 'tool_result') { ... }
  }
  newMsgs.push({ role: 'assistant', content: result.content });
  return [...prev, ...newMsgs];
});
```

中间步骤（`intermediateSteps`）被**批量展平**为 `tool_call` → `tool_result` → `assistant` 的顺序数组。注意这里的 `extractToolName` 辅助函数通过正则从 `"Calling xyz(...)"` 文本中提取工具名，这是非流式路径独有的降级处理——流式路径直接从事件对象中获取结构化的 `toolName` 字段。

两种路径共享 `AbortController` 机制：`abortRef.current` 在 send 开始时赋值，`stop` 调用时触发 `ctrl.abort()`。引擎检测到 `signal.aborted` 后会 yield `{ type: 'done', content: '[已暂停]' }` 并提前返回。

[来源](packages/app/src/hooks/useAIChat.ts#L238-L367) | [流式输出与思考模式](流式输出与思考模式.md) | [AIAssistant sendMessageStreaming](packages/core/src/ai/assistant.ts#L418-L641)

---

## 4. 对话回滚机制

三个方法构成了对话编辑的完整工具集：

| 方法 | 行为 | 返回 |
|---|---|---|
| `editByIndex(n)` | 回滚到第 n 条用户消息之前（0-indexed） | 用户消息文本 或 null |
| `edit()` | 回滚到最后一条用户消息之前 | 用户消息文本 或 null |
| `undoLastMessage()` | 回滚到最后一条用户消息之前 | `void` |

`editByIndex` 的实现是对话回滚的核心算法：

```typescript
const allMsgs = assistant.getMessages();
let count = 0;
for (let i = 0; i < allMsgs.length; i++) {
  if (allMsgs[i]!.role === 'user') {
    if (count === n) {
      const userContent = contentToString(allMsgs[i]!.content);
      const keep = allMsgs.slice(0, i);
      assistant.loadMessages(keep);          // 同步引擎状态
      setMessages(mapMessages(keep));        // 同步 React 状态
      return userContent;
    }
    count++;
  }
}
```

**关键约束**：`assistant.getMessages()` 返回的是 `AIAssistant` 内部的 `ChatMessage[]`（包含 system/system/tool 等完整 API 格式），而 `useState messages` 是 UI 友好的 `AIChatMessage[]`（展平的 thinking/tool_call/tool_result）。因此回滚后需要通过 `mapMessages` 做格式转换。

`edit()` 是对 `editByIndex` 的封装——先找到最后一条 user 消息的索引，再调用 `editByIndex`。`undoLastMessage` 是 `edit()` 的简化版本，只回滚不返回文本。

这三个方法都通过 `assistant.loadMessages(keep)` 直接替换引擎历史，这意味着**任何回滚都会丢失被裁剪轮次中 AI 的中间状态**——工具执行结果不会被缓存，重新 `send` 后会重新执行。

[来源](packages/app/src/hooks/useAIChat.ts#L434-L473) | [mapMessages 格式转换](packages/app/src/hooks/useAIChat.ts#L391-L432)

---

## 5. 图片上传管线

`addUserImage` 是极简的转发层：

```typescript
const addUserImage = useCallback((data: Uint8Array, mimeType: string, alt: string): number => {
  return assistant.addUserUpload(data, mimeType, alt);
}, [assistant]);
```

它接收原始二进制数据（`Uint8Array`）而不是 base64/blob URL，因为 `AIAssistant` 的 `_userUploads` 数组存储的正是原始字节，后续 `create_post` 等写工具上传到 Bluesky 时需要这种格式。返回的 `number` 是上传在数组中的索引，供组件层追踪。

图片的**视觉注入**走另一条路径——通过 `PF_VISION_HINT` 提示片段告知 AI 模型有图像分析能力，通过 `addPendingImage`（基64 data URL）将图片插入到最近一条 user 消息的 `ContentBlock[]` 中。这两条管线服务于不同目的：`addUserUpload` 供发布使用，`addPendingImage` 供视觉分析使用。Hook 层仅暴露了前者。

[来源](packages/app/src/hooks/useAIChat.ts#L479-L481) | [AIAssistant 图片管理](packages/core/src/ai/assistant.ts#L157-L178)

---

## 6. 写操作确认门

`confirmAction` 和 `rejectAction` 是一对互补方法，操作引擎内部的 `_confirmPromise`：

```typescript
const confirmAction = useCallback(() => {
  assistant.confirmAction(true);
  setPendingConfirmation(null);
}, [assistant]);

const rejectAction = useCallback(() => {
  assistant.confirmAction(false);
  setPendingConfirmation(null);
}, [assistant]);
```

引擎侧在遇到 `toolDesc.requiresWrite === true` 的工具时，会 `yield { type: 'confirmation_needed' }`（流式）或推入 intermediateStep（非流式），然后调用 `_waitForConfirmation()` 创建一个 Promise 并暂停工具执行循环。Hook 监听到 `confirmation_needed` 事件后设置 `pendingConfirmation` 状态，UI 据此渲染确认对话框。用户点击确认/拒绝后，`assistant.confirmAction(bool)` resolve 该 Promise，引擎继续执行或插入取消结果。

这个机制是异步暂停/恢复模式在 React 中的典型应用：引擎的 `await` 不会阻塞事件循环，Hook 在收到暂停信号后等待用户交互，再通过方法调用恢复。

[来源](packages/app/src/hooks/useAIChat.ts#L381-L389) | [引擎确认门实现](packages/core/src/ai/assistant.ts#L194-L199)

---

## 7. 自动保存机制

`autoSave` 被包装为 `useCallback`，在 `setMessages` 的 updater 函数中触发：

```typescript
const autoSave = useCallback(async (msgs: AIChatMessage[]) => {
  if (!storage) return;
  const title = msgs.find(m => m.role === 'user')?.content.slice(0, 80) ?? '新对话';
  await storage.saveChat({
    id: chatIdRef.current,
    title,
    contextUri,
    context: contextRef.current,
    messages: msgs,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (!chatNotifiedRef.current) {
    chatNotifiedRef.current = true;
    options?.onChatSaved?.();
  }
}, [storage, contextUri, options?.onChatSaved]);
```

触发时机表：

| 时机 | 代码位置 |
|---|---|
| 用户发送消息后（插入 user 消息时） | `setMessages(prev => { ... void autoSave(updated); ... })` |
| 流式完成时 | `setMessages(prev => { void autoSave(prev); ... })` |
| 流式出错时 | `setMessages(prev => { ... void autoSave(updated); ... })` |
| 非流式完成/出错时 | 同上 |

`chatNotifiedRef` 确保 `onChatSaved` 回调只在对话的**首次保存**时触发一次，用于通知外部刷新对话列表。

值得注意的是 `autoSave` 是 `async` 但不 `await`——它在状态更新器内部以 `void` 调用，因此保存失败不会阻塞 UI 更新。错误被 `try/catch` 静默吞掉，避免持久化异常影响用户体验。

`contextRef.current` 跟踪当前对话的上下文类型（`{ type: 'post', uri }` 或 `{ type: 'profile', handle }`），保存在 `ChatRecord.context` 字段中。这个字段在页面刷新后从 storage 恢复时用于重建系统提示。

[来源](packages/app/src/hooks/useAIChat.ts#L218-L236) | [聊天存储接口](packages/app/src/services/chatStorage.ts#L33-L38)

---

## 8. 对话恢复流程

从 storage 恢复对话是一个**多阶段异步过程**，涉及两个 `useEffect` 的协同：

### 第一阶段：清理与初始化（chatId 变化时）

```typescript
useEffect(() => {
  if (options?.chatId === lastChatId.current) return;
  assistant.clearMessages();
  setMessages([]);
  setGuidingQuestions([]);
  // ... 根据 contextPost/contextProfile 初始化 system prompt
}, [options?.chatId, ...]);
```

当 `chatId` 变化时（用户切换到另一个对话），立即清除引擎和 React 中的所有状态，并根据上下文类型设置初始 system prompt 和 guiding questions。

### 第二阶段：加载已存数据

```typescript
useEffect(() => {
  if (!storage || !options?.chatId) return;
  void (async () => {
    const record = await storage.loadChat(options.chatId!);
    if (record) {
      setMessages(record.messages);
      // 从保存的 context 重建 system prompt
      if (record.context) {
        contextRef.current = record.context;
        // 根据 context 类型重建 system prompt
      }
      // 重建引擎内部的 chatMsgs（含格式转换）
      assistant.loadMessages([...system, ...chatMsgs]);
    }
  })();
}, [options?.chatId, storage]);
```

从 storage 加载后的**格式映射**是这段逻辑最微妙的部分。`ChatRecord` 中存储的是 `AIChatMessage[]`（5 种角色：user/assistant/tool_call/tool_result/thinking），但 `AIAssistant.loadMessages` 需要的是 `ChatMessage[]`（标准 OpenAI 格式：system/user/assistant/tool）。映射规则如下：

| AIChatMessage role | ChatMessage role | 特殊处理 |
|---|---|---|
| `thinking` | **跳过** | 仅 UI 展示不传给 API |
| `tool_call` | `assistant` + `tool_calls[]` | 从 content 中通过正则提取 arguments JSON |
| `tool_result` | `tool` | 直接映射 role 和 content |
| `user` / `assistant` | 同左 | 保留 `reasoning_content` |

这个映射确保了引擎的上下文窗口在页面刷新后依然完整，包括工具调用链。`loadMessages` 直接替换引擎的 `messages` 数组，而不是 `push`，因此必须包含 system prompt。

[来源](packages/app/src/hooks/useAIChat.ts#L93-L172)

---

## 9. 自动分析：Profile 上下文的隐式发送

当 `contextProfile` 被设置在一个空对话上时，Hook 会**自动触发首次发送**：

```typescript
useEffect(() => {
  if (options?.contextProfile && messages.length === 0 && client && !loading && !autoStartedRef.current) {
    autoStartedRef.current = true;
    const timer = setTimeout(() => {
      send(PF_AUTO_ANALYSIS(displayName));
    }, 500);
    return () => clearTimeout(timer);
  }
}, [options?.contextProfile, messages.length, client, loading, send]);
```

`autoStartedRef` 确保这个自动发送只执行一次，`setTimeout` 的 500ms 延迟给 UI 足够时间完成初始渲染。发送的内容是 `PF_AUTO_ANALYSIS`——一条预设提示词 `"请分析 @{handle} 的主页，概括他们的近期动态。"`。

这个机制服务于 PWA 的"用户主页 → AI 对话"快捷操作：当用户在帖子列表中选择"分析此人"时，导航上下文携带 `contextProfile`，Hook 自动发起分析请求，用户无需手动输入。

[来源](packages/app/src/hooks/useAIChat.ts#L369-L379) | [PF_AUTO_ANALYSIS 定义](packages/core/src/ai/prompts.ts#L183-L185)

---

## State 生命周期总览

```
组件挂载
  │
  ├─ useState(() => new AIAssistant(config))  ← 单例创建
  │
  ├─ [chatId 变化]
  │   ├─ assistant.clearMessages() + setMessages([])
  │   ├─ 根据 contextPost/contextProfile 重建 system prompt
  │   └─ [storage].loadChat → 加载 + 重建 + setMessages
  │
  ├─ [client 就绪]
  │   ├─ assistant.setTools(createTools(client))
  │   └─ 根据 contextUri/contextPost/contextProfile 重建 system prompt
  │
  ├─ [contextProfile + 空对话] → 自动 send(PF_AUTO_ANALYSIS)
  │
  └─ [用户 send()]
      ├─ setMessages(prev => [...prev, userMsg] + autoSave)
      ├─ setLoading(true)
      │
      ├─ [流式] for await (event of stream)
      │   ├─ token → 更新最后一条 assistant
      │   ├─ thinking → 更新最后一条 thinking
      │   ├─ tool_call → 插入 tool_call 消息
      │   ├─ tool_result → 插入 tool_result 消息
      │   ├─ confirmation_needed → setPendingConfirmation
      │   └─ done → 完成 + autoSave
      │
      └─ [非流式] await sendMessage()
          └─ setMessages → 批量插入 intermediateSteps + final + autoSave
```

---

## 推荐阅读

- [AI 助手引擎](ai-助手引擎.md) —— Hook 桥接的下游引擎，`sendMessage`/`sendMessageStreaming` 的完整实现
- [流式输出与思考模式](流式输出与思考模式.md) —— SSE 解析与 `reasoning_content` 的逐字渲染
- [系统提示词体系](系统提示词体系.md) —— `buildSystemPrompt` 用到的所有提示片段
- [存储与持久化](存储与持久化.md) —— `ChatStorage` 接口的 TUI/PWA 两套实现
- [核心 Hooks 参考](核心-hooks-参考.md) —— 本 Hook 在 `@bsky/app` hooks 生态中的定位