# AIAssistant 核心对话架构

`AIAssistant` 是驱动整个应用 AI 能力的核心引擎，位于 packages/core/src/ai/assistant.ts。它不是一个简单的 API 封装，而是一个**有状态的多轮对话运行时**——管理消息历史、协调工具执行、控制视觉上下文注入，并在写操作前通过 Promise 阻塞机制实现用户确认门控。

## 类的状态模型

`AIAssistant` 实例持有五组内部状态：

| 状态 | 类型 | 用途 |
|------|------|------|
| `config` | `AIConfig` | API Key、baseUrl、model、thinkingEnabled、visionEnabled |
| `tools` / `toolMap` | `ToolDescriptor[]` / `Map` | 已注册的工具定义及名称到描述符的映射 |
| `messages` | `ChatMessage[]` | 完整的多轮对话消息历史 |
| `_pendingImages` | `Array<{url, alt?}>` | 待注入到下一条用户消息的视觉内容 |
| `_userUploads` | `Array<{data, mimeType, alt}>` | 用户上传的图片原始数据（供发帖使用） |

此外，还有一个关键的异步门控状态 `_confirmPromise` / `_confirmResolve`，用于写操作的用户确认。

[来源](packages/core/src/ai/assistant.ts#L61-L79)

## 工具循环：`sendMessage`

`sendMessage` 是核心入口，其控制流是一个最多 **10 轮** 的 `for` 循环。每轮循环执行一次 `makeRequest`，然后根据响应判断：

- 如果响应包含 `tool_calls` → 依次执行每个工具，将结果作为 `tool` 角色消息追加到 `messages`，然后 **continue** 进入下一轮
- 如果响应没有 `tool_calls` → 将最终 assistant 消息追加到 `messages`，**return** 结果

```typescript
for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  const response = await this.makeRequest();
  const message = response.choices[0].message;

  if (message.tool_calls && message.tool_calls.length > 0) {
    // 执行工具，追加结果，continue
  }

  // 最终响应
  this.messages.push({ role: 'assistant', content: finalContent, ... });
  return { content: finalContent, toolCallsExecuted, intermediateSteps };
}

throw new Error('Max tool calling rounds exceeded');
```

**10 轮上限** 是一个安全阀——防止 LLM 在工具调用中无限循环。如果达到上限仍未产生最终文本响应，抛出错误。每轮执行中，`intermediateSteps` 数组累积了 `tool_call`/`tool_result`/`assistant` 类型的事件，供调用方（如 TUI 的 `AIPanel`）渲染进度。

[来源](packages/core/src/ai/assistant.ts#L105-L156)

## `makeRequest`：构造 ChatCompletionRequest

`makeRequest` 将内部状态序列化为一个标准的 OpenAI 兼容请求体：

```typescript
const body: ChatCompletionRequest = {
  model: this.config.model,
  messages: this._buildMessages(),   // ← 视觉注入点
  temperature: 0.7,
  max_tokens: 4096,
  thinking: { type: this.config.thinkingEnabled ? 'enabled' : 'disabled' },
};
```

工具定义通过 `this.tools.map(...)` 转换为 tools 数组，`tool_choice` 固定为 `'auto'`——LLM 自主决定是否调用工具以及调用哪个工具。当 `this.tools` 为空时（如翻译、润色等单轮场景），tools 字段被省略，这是与 `singleTurnAI` 函数共享的 API 调用模式。

请求发送使用原生 `fetch`，**没有使用 ky 或其他 HTTP 客户端**，直接拼装 URL（`${baseUrl}/v1/chat/completions`）和 Bearer Token 头。网络错误的处理有其特殊性：捕获 `TypeError` 并检查 `message === 'fetch failed'` 来区分 DNS/连接错误与其他异常，给出友好的中文错误提示。

[来源](packages/core/src/ai/assistant.ts#L175-L219)

## `_buildMessages`：视觉内容注入

`_buildMessages` 是视觉模态支持的关键。当满足两个条件时触发注入：

1. `this.hasPendingImages` 为 `true`
2. `this.config.visionEnabled` 为 `true`

注入策略是**从后往前扫描消息列表，找到最后一条 `user` 角色消息**，将其 `content` 从纯字符串替换为 `ContentBlock[]` 数组：

```typescript
const blocks: ContentBlock[] = [
  { type: 'text', text: originalContent },
  ...this._pendingImages.flatMap(img => [
    img.alt ? { type: 'text', text: `[图片 ALT: ${img.alt}]` } : null,
    { type: 'image_url', image_url: { url: img.url, detail: 'auto' } },
  ].filter(Boolean)),
];
```

这种设计遵循了多模态 API（OpenAI、Claude、DeepSeek VL）的约定——`content` 为数组类型，交替包含文本和图片 URL。`detail: 'auto'` 将分辨率决策权交给 LLM 服务端。

注入完成后立即调用 `this.clearPendingImages()`，确保同一批图片只被使用一次。如果 `visionEnabled` 为 `false`，则原样返回 `this.messages`，图片描述符不会被发送。

[来源](packages/core/src/ai/assistant.ts#L159-L173)

## 确认门控：`_waitForConfirmation`

写操作（发帖、点赞、转发、关注）在 `sendMessage` 的工具执行循环中受到一个 **Promise 阻塞** 机制的防护：

```typescript
if (toolDesc.requiresWrite) {
  const approved = await this._waitForConfirmation();
  if (!approved) {
    toolResult = 'User cancelled the operation.';
    // 追加 tool 角色消息后 continue
  }
}
```

`_waitForConfirmation` 的实现极简——创建一个未 resolve 的 Promise，将 resolve 函数保存到实例属性 `_confirmResolve` 上。**调用方（UI 层）通过 `confirmAction(true/false)` 来释放这个 Promise**：

```typescript
private async _waitForConfirmation(): Promise<boolean> {
  this._confirmPromise = new Promise<boolean>((resolve) => {
    this._confirmResolve = resolve;
  });
  return this._confirmPromise;
}
```

这意味着在 `await this._waitForConfirmation()` 这行，`sendMessage` 的执行流**完全暂停**，等待用户在 UI 层做出选择。TUI 的 AIPanel 通过轮询 `assistant.hasPendingConfirmation` 来显示确认对话框；PWA 的 AIChatPage 则通过 `useAIChat` 暴露的 `pendingConfirmation` 状态渲染模态框，用户点击确认/取消按钮时调用 `assistant.confirmAction(true/false)`。

取消操作时，工具执行不会抛出异常——而是返回 `'User cancelled the operation.'` 作为 tool result，让 LLM 有机会理解用户取消并做出适当回应。

[来源](packages/core/src/ai/assistant.ts#L92-L98)

## 多模态数据流

`AIAssistant` 支持两种图片数据流：

### 1. `addPendingImage` —— 视觉分析流

用于从 Bluesky 帖子中下载的图片。调用路径：

`tool: view_image` → 下载 blob → Base64 Data URL → `assistant.addPendingImage(dataUrl, alt)` → 下一轮 `_buildMessages` 注入 → 多模态 LLM 分析

**关键约束**：此方法只存储 Data URL 到 `_pendingImages` 数组，`_buildMessages` 将其注入到**下一轮**请求的最后一条用户消息中。这意味着 `view_image` 工具本身返回一个 JSON 说明（"图像已存储"），LLM 在后续轮次才能真正"看到"图片。

[来源](packages/core/src/ai/assistant.ts#L64-L66)

### 2. `addUserUpload` —— 用户上传流

用于用户在聊天界面上传的本地图片。调用路径：

用户选择文件 → `Uint8Array` 编码 → `assistant.addUserUpload(data, mimeType, alt)` → 返回索引 → 用户在消息中引用索引 → `tool: create_post` 通过 `pendingImageIndex` 参数获取原始数据 → 上传到用户的 PDS → 嵌入帖子

`addUserUpload` 返回一个数字索引，供后续 `create_post` 工具的 `pendingImageIndex` 参数引用。**这绕过了 Bluesky CDN**——图片直接从内存上传到用户自己的 PDS，无需先发帖再下载。

**两张流的对比**：

| 特性 | `addPendingImage` | `addUserUpload` |
|------|-------------------|-----------------|
| 数据来源 | Bluesky CDN 下载 | 用户本地文件 |
| 存储形式 | Base64 Data URL | `Uint8Array` 原始数据 |
| 消费方 | `_buildMessages` → 多模态 LLM | `create_post` → PDS 上传 |
| 生命周期 | 单次注入后清除 | 持久保留（索引引用） |
| 清除方法 | `clearPendingImages()` | `clearUserUploads()` |

[来源](packages/core/src/ai/assistant.ts#L68-L72)

## `sendMessageStreaming`：AsyncGenerator 实现

`sendMessageStreaming` 是与 `sendMessage` 并行的流式版本，返回值类型为 `AsyncGenerator`。其核心差异在于：

### 请求层差异

流式请求在 `ChatCompletionRequest` 中设置 `stream: true`，并通过 `AbortSignal` 参数支持取消：

```typescript
const body: ChatCompletionRequest = {
  model: this.config.model,
  messages: this._buildMessages(),
  stream: true,                   // ← 关键差异
  thinking: { type: ... },
  // ...
};

res = await fetch(url, { ..., signal });  // ← 支持中止
```

### SSE 解析引擎

响应通过 `res.body.getReader()` 逐块读取，按 `\n` 分割 SSE 行，解析 `data: ` 前缀后的 JSON chunk。每个 chunk 的 `delta` 字段被分发为三种 yield 类型：

| SSE delta 字段 | yield type | 说明 |
|----------------|------------|------|
| `delta.reasoning_content` | `'thinking'` | 思考过程（DeepSeek 特有） |
| `delta.content` | `'token'` | 文本 token（逐字输出） |
| `delta.tool_calls` | 累积到 `toolCallAccum` | 工具调用（需等待完整参数） |

`toolCallAccum` 是一个 `Map<number, {id, name, arguments}>`，用于处理和聚合分块到达的工具调用——LLM 的 tool_calls 参数可能跨多个 SSE chunk 传输，需要按 `index` 合并。

### 工具执行循环

与 `sendMessage` 的 `for` 循环逻辑相同，但中间步骤通过 `yield` 输出而非累积到 `intermediateSteps` 数组。**确认门控**在此同样生效，但在 streaming 模式中多了一个 `'confirmation_needed'` 事件类型（通过 `(event as any).type` 绕过类型系统），让 UI 层可以在流式渲染过程中弹出确认对话框。

### 中断与清理

`AbortSignal` 在三个层面生效：

1. **fetch 请求前**：`signal?.aborted` 检查 → yield `'done'` 并 return
2. **SSE 读取中**：信号中断 → 捕获异常 → yield 已累积文本 → return
3. **工具执行中**：信号中断发生在 fetch 调用内，由 fetch 原生支持

[来源](packages/core/src/ai/assistant.ts#L220-L336)

## 双通道输出模式对比

| 维度 | `sendMessage` | `sendMessageStreaming` |
|------|---------------|------------------------|
| 返回类型 | `Promise<{content, toolCallsExecuted, intermediateSteps}>` | `AsyncGenerator` |
| 工具进度 | 通过 `intermediateSteps` 数组一次性返回 | 通过 `yield` 逐事件推送 |
| 文本输出 | 全部就绪后返回 | 逐 token 输出 (`'token'` 类型) |
| 思考过程 | 保存在 `reasoning_content` 但不暴露 | 独立 `'thinking'` 事件 yield |
| 确认门控 | 同步阻塞 `sendMessage` 线程 | yield `'confirmation_needed'` 事件后等待 |
| 取消支持 | 不原生支持（可通过外层超时） | 内建 `AbortSignal` 支持 |
| UI 推荐 | TUI（终端，单次展示更简单） | PWA（浏览器，实时刷新更流畅） |

`useAIChat` Hook 通过 `options.stream` 布尔值选择使用哪个方法，实现了对两端渲染模式的透明适配。

[来源](packages/core/src/ai/assistant.ts)

---

**推荐阅读**：
- [31 个工具系统详解](31-个工具系统详解.md) — 工具的注册、定义与 `requiresWrite` 标记机制
- [useAIChat: 深度解析](useaichat-深度解析.md) — Hook 层如何串联 AIAssistant 与 UI 渲染
- [流式输出 SSE 实时渲染](流式输出-sse-实时渲染.md) — 从 AsyncGenerator 到 UI 的完整事件管道
- [系统提示词工程](系统提示词工程.md) — `P_ASSISTANT_BASE` 等提示词片段如何组合注入