# AI 对话引擎

## 核心契约：类型系统

引擎的骨架由一组精确的类型定义支撑。`ChatMessage` 是贯穿全局的数据单元，支持四种角色，且 **`content` 字段可以是纯字符串或结构化的多模态块数组**——这一设计直接服务于视觉模型。

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  name?: string;
  tool_call_id?: string;      // 关联 tool 调用链
  tool_calls?: ToolCall[];     // assistant 消息中的函数调用声明
  reasoning_content?: string;  // DeepSeek 私有字段，保留推理轨迹
}

interface ContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}
```

`AIConfig` 是引擎的配置契约，其中 `reasoningStyle` 字段是跨提供商适配的关键开关：

```typescript
type AIConfig = {
  apiKey: string;
  baseUrl: string;           // 默认 https://api.deepseek.com
  model: string;             // 默认 deepseek-v4-flash
  thinkingEnabled?: boolean;
  visionEnabled?: boolean;
  provider?: string;         // 'deepseek' | 'mistral' | 自定义
  reasoningStyle?: 'reasoning_content' | 'structured_content' | 'none';
  customSystemPrompt?: string;
};
```

[来源](packages/core/src/ai/assistant.ts#L13-L88)

---

## 核心循环：无界工具调用（`for(;;)`）

`sendMessage` 和 `sendMessageStreaming` 的核心都是一个 **无界循环**（`for (let round = 0; ; round++)`）。没有硬编码的最大轮数——用户通过 UI 的"暂停"按钮或 `AbortSignal` 控制终止。

```
用户消息
  │
  ▼
addUserMessage()
  │
  ▼
makeRequest() ──→ POST {messages[] + tools[]}
  │                    │
  │              ◀──── response
  │
  ├── tool_calls 存在?
  │     YES ──→ 遍历每个 tool_call:
  │                ├── 解析 JSON arguments
  │                ├── 查 toolMap 获取 handler
  │                ├── [写工具? → 等待用户确认]
  │                ├── 执行 handler → toolResult
  │                └── 推 tool 消息 → continue 下一轮
  │
  └── NO tool_calls ──→ 推 assistant 消息 → return final
```

关键设计决策：**AI 的每个 tool_call 都被视为状态转换，而非副作用事件**。工具执行结果以 `role: 'tool'` 消息追加到 `this.messages` 数组，使对话历史在每轮迭代中自然增长，保证多轮工具调用的上下文完整性。

[来源](packages/core/src/ai/assistant.ts#L204-L317)

### 无界循环的风险控制

不设硬上限并非无安全措施。风险控制通过两个正交机制实现：

1. **UI 层**：`AbortSignal` 可随时中断 fetch 请求（流式模式），抛出的 `AbortedError` 被 `sendMessageStreaming` 捕获，yield `{ type: 'done', content: '[已暂停]' }` 后 return。
2. **工具层**：写操作确认门（见下文）阻止 AI 自主执行破坏性操作。

[来源](packages/core/src/ai/assistant.ts#L468-L478)
[来源](packages/core/src/ai/assistant.ts#L494-L498)

---

## 流式 SSE 解析器

`sendMessageStreaming` 使用原生的 `fetch()` + `response.body.getReader()` 手动解析 SSE 流，避免引入第三方 SSE 库的依赖。其解析逻辑精炼且完整：

```typescript
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let fullContent = '';
let reasoningContent = '';
let toolCallAccum: Map<number, { id: string; name: string; arguments: string }> = new Map();

while (true) {
  if (signal?.aborted) { /* yield done */ break; }
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value, { stream: true });
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') continue;
    const chunk = JSON.parse(data);
    const delta = chunk.choices?.[0]?.delta;
    // ... 处理 delta.content, delta.reasoning_content, delta.tool_calls
  }
}
```

### `reasoning_content` 的保留策略

DeepSeek 系列模型在 SSE 流中通过 `choices[0].delta.reasoning_content` 字段输出推理过程。解析器 **独立累加** 该字段到 `reasoningContent` 变量，同时 yield `{ type: 'thinking', content }` 给 UI 层实时展示思考过程。最终，`reasoningContent` 被一同写入 `ChatMessage.reasoning_content`，保证推理轨迹在后继轮次的 `_buildMessages()` 中可被重新利用。

```typescript
// 流中 yield 给 UI
if (delta.reasoning_content) {
  reasoningContent += delta.reasoning_content;
  yield { type: 'thinking', content: delta.reasoning_content as string };
}
// 最终持久化到消息历史
this.messages.push({
  role: 'assistant',
  content: fullContent,
  ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
});
```

### 结构化内容处理（Mistral 适配）

Mistral 的思考模型不使用 `reasoning_content` 字段，而是在 `delta.content` 中返回 **`ContentBlock[]` 数组**，每个块可能为 `{ type: 'thinking', thinking: [...] }` 或 `{ type: 'text', text: '...' }`。解析器通过 `Array.isArray(delta.content)` 分支处理这一差异，将 `thinking` 块的内容映射为 `'thinking'` yield，将 `text` 块的内容映射为 `'token'` yield。

[来源](packages/core/src/ai/assistant.ts#L421-L644)
[来源](packages/core/src/ai/assistant.ts#L510-L538)

---

## 写操作确认门（Confirmation Gate）

引擎中最具架构特色的设计：**通过 Promise 挂起/恢复实现同步风格的异步确认流程**。

```typescript
private _confirmPromise: Promise<boolean> | null = null;
private _confirmResolve: ((v: boolean) => void) | null = null;

private async _waitForConfirmation(): Promise<boolean> {
  this._confirmPromise = new Promise<boolean>((resolve) => {
    this._confirmResolve = resolve;
  });
  return this._confirmPromise;
}

confirmAction(approved: boolean): void {
  if (this._confirmResolve) {
    this._confirmResolve(approved);
    this._confirmPromise = null;
    this._confirmResolve = null;
  }
}
```

### 设计模式分析

这是 **Promise 外部化（Externalized Promise）** 模式的典型实现：

1. **挂起点**：当 AI 调用一个 `requiresWrite === true` 的工具时，代码进入 `_waitForConfirmation()`，创建 Promise 并保存其 `resolve` 引用，然后 **await**——执行流在此暂停。
2. **外部触发**：UI 层的 TUI 或 PWA 组件通过 `assistant.confirmAction(true/false)` 触发 resolve，Promise 兑现，`await` 恢复。
3. **分支逻辑**：若 `approved === false`，工具返回 `'User cancelled the operation.'` 并记录到消息历史；若 `approved === true`，继续执行 `handler()`。

```
AIAssistant 线程               UI 线程
    │                           │
    ├─ tool.requiresWrite?      │
    │   YES                     │
    ├─ _waitForConfirmation()   │
    │   └─ Promise 挂起 ────────┤
    │                           ├─ 用户看到确认对话框
    │                           ├─ 点击"确认"/"取消"
    │                           ├─ confirmAction(true/false)
    │                           │   └─ resolve(approved)
    │   ◀──── Promise 恢复 ─────┤
    ├─ approved? ──YES──→ 执行  │
    │   └─NO──→ 取消            │
```

### 为什么不是回调或事件？

Promise + 外部 resolve 的收益在于：**工具执行循环的线性逻辑无需重构为状态机**。如果采用事件驱动，每个写工具都需要拆分出"请求确认→等待事件→处理结果"三个阶段，代码将碎片化。此模式在单一线程中维持了完整的顺序语义。

[来源](packages/core/src/ai/assistant.ts#L102-L104)
[来源](packages/core/src/ai/assistant.ts#L188-L202)
[来源](packages/core/src/ai/assistant.ts#L249-L270)

---

## 多模态支持：`_pendingImages` 注入

视觉模型的集成采用 **惰性注入策略**：图片并不预先嵌入消息历史，而是暂存在 `_pendingImages` 队列中，在每次 `_buildMessages()` 调用时注入到最后一条 `role: 'user'` 消息。

```typescript
private _pendingImages: Array<{ url: string; alt?: string }> = [];

addPendingImage(base64DataUrl: string, alt?: string): void {
  this._pendingImages.push({ url: base64DataUrl, alt });
}

// 在 _buildMessages() 中注入到最后一个 user 消息
for (let i = msgs.length - 1; i >= 0; i--) {
  if (msgs[i]!.role === 'user') {
    const text: string = typeof msgs[i]!.content === 'string' ? msgs[i]!.content : '';
    const blocks: ContentBlock[] = [
      { type: 'text', text },
      ...this._pendingImages.flatMap(img => [
        ...(img.alt ? [{ type: 'text' as const, text: `[图片 ALT: ${img.alt}]` }] : []),
        { type: 'image_url' as const, image_url: { url: img.url, detail: 'auto' as const } },
      ]),
    ];
    msgs[i] = { ...msgs[i]!, content: blocks };
    // 持久化到消息历史，确保多轮工具调用后图片不丢失
    this.messages[i] = { ...this.messages[i]!, content: blocks };
    break;
  }
}
this.clearPendingImages();
```

### 设计要点

- **合并而非替换**：图片 `ContentBlock` 追加到文本之后，AI 同时接收文字和图像。
- **ALT 文本前置**：图片之前插入 `[图片 ALT: ...]` 文本块，辅助 LLM 理解上下文。
- **持久化到消息历史**：`this.messages[i] = ...` 确保图片在多轮工具调用中持续可用，避免第二轮回合丢失视觉上下文。
- **hasPendingImages 守卫**：只有当 `visionEnabled === true` 且存在待处理图片时才执行注入逻辑。

[来源](packages/core/src/ai/assistant.ts#L107)
[来源](packages/core/src/ai/assistant.ts#L160-L166)
[来源](packages/core/src/ai/assistant.ts#L340-L362)

---

## 跨提供商适配：`reasoningStyle` 处理

不同 LLM 提供商对思考链（reasoning/thinking）的支持方式各异。引擎通过 **`reasoningStyle` + `_buildMessages()` 的预处理器** 实现适配层。

### 三种模式

| 模式 | 提供商 | 行为 |
|------|--------|------|
| `reasoning_content` | DeepSeek | 原生字段保留，API 直接接收/返回 `reasoning_content` |
| `structured_content` | Mistral | 思考过程嵌入 `content` 中的结构化数组，请求时发送 `reasoning_effort: 'high'` |
| `none` | 其他 | 清除所有推理相关字段，避免 `extra_forbidden` 错误 |

### `_buildMessages()` 中的适配逻辑

```typescript
private _buildMessages(): ChatMessage[] {
  let msgs = this.messages;
  // 非 reasoning_content 模式：将 reasoning_content 合并为 thinking 前缀
  if (this.config.reasoningStyle !== 'reasoning_content') {
    msgs = msgs.map(m => {
      const rc = (m as any).reasoning_content;
      if (!rc || m.role !== 'assistant') return m;
      const { reasoning_content: _, ...rest } = m as any;
      const prefix = `【上一步思考过程】\n${rc}\n\n`;
      if (typeof rest.content === 'string') {
        rest.content = prefix + rest.content;
      }
      return rest;
    });
  }
  // 清理没有 tool_call_id 的 tool 消息（存储损坏恢复）
  msgs = msgs.filter(m => m.role !== 'tool' || m.tool_call_id);
  // ... 多模态注入
}
```

### 请求阶段的参数控制

`makeRequest()` 中，根据提供商类型发送不同的请求参数：

```typescript
// 仅 DeepSeek 发送 thinking 参数
if (this.config.provider && shouldSendThinkingParam(this.config.provider)) {
  (body as any).thinking = { type: this.config.thinkingEnabled ? 'enabled' : 'disabled' };
}
// Mistral 结构化思考模式
if (this.config.reasoningStyle === 'structured_content' && this.config.thinkingEnabled !== false) {
  (body as any).reasoning_effort = 'high';
}
```

### 提供商注册表

提供商信息集中在 `providers.json` 中，通过 `providers.ts` 提供查找函数。当前注册了两个提供商：

| 提供商 | ID | reasoningStyle | 模型 |
|--------|----|----------------|------|
| DeepSeek | `deepseek` | `reasoning_content` | V4 Flash (thinking), V4 Pro (thinking) |
| Mistral | `mistral` | `structured_content` | Small 24B (thinking+vision), Pixtral Large (vision), Medium (vision), Ministral 3B |

`cleanBaseUrl()` 函数确保无论用户配置的 `baseUrl` 是裸地址、带 `/v1/` 还是带 `/v1/chat/completions`，都能规范化为 API 端点：

```typescript
function cleanBaseUrl(baseUrl: string): string {
  return baseUrl
    .replace(/\/v1\/chat\/completions\/?$/, '')
    .replace(/\/v1\/?$/, '')
    .replace(/\/+$/, '');
}
```

[来源](packages/core/src/ai/assistant.ts#L321-L337)
[来源](packages/core/src/ai/assistant.ts#L370-L375)
[来源](packages/core/src/ai/providers.ts#L1-L56)
[来源](packages/core/src/ai/providers.json#L1-L24)

---

## 工具注册与分发

`setTools()` 接受 `ToolDescriptor[]`，构建 `toolMap`（`Map<string, ToolDescriptor>`）提供 O(1) 查找。`ToolDescriptor` 的关键结构：

```typescript
interface ToolDescriptor {
  definition: ToolDefinition;   // name, description, inputSchema
  handler: (params: Record<string, unknown>, assistant?: AIAssistant) => Promise<string>;
  requiresWrite: boolean;       // 写操作标识，触发确认门
}
```

`handler` 的第二个可选参数 `assistant` 使工具能够访问引擎内部状态，例如 `create_post` 需要从 `_userUploads` 读取用户上传的图片数据。

[来源](packages/core/src/ai/tools.ts#L71-L75)
[来源](packages/core/src/ai/assistant.ts#L120-L126)

---

## 与 UI 层的集成

引擎不直接依赖任何 UI 框架。集成通过两个出口完成：

1. **`sendMessage` 返回 `intermediateSteps`**：包含 `'tool_call' | 'tool_result' | 'assistant' | 'user'` 类型的步骤快照，供 TUI/PWA 渲染为交互日志。
2. **`sendMessageStreaming` 的 AsyncGenerator**：实时产出 `'token' | 'thinking' | 'tool_call' | 'tool_result' | 'done'` 事件。PWA 端的 `useAIChat` hook 消费此 generator，通过 `onToken` 回调逐 token 追加到 React state。参见 [React Hooks 体系](react-hooks-体系.md)。

[来源](packages/core/src/ai/assistant.ts#L204-L211)
[来源](packages/core/src/ai/assistant.ts#L421-L426)

---

## 推荐阅读

- [38 个 AI 工具系统](38-个-ai-工具系统.md) —— `createTools` 工厂函数、全部工具清单与线程扁平化格式
- [AI 系统提示词与多提供商](ai-系统提示词与多提供商.md) —— 集中式提示词管理、`singleTurnAI` 和 `translateText` 的单轮接口
- [三层架构详解](三层架构详解.md) —— `packages/core` 层在整体架构中的定位与依赖流动
- [关键教训与架构决策记录](关键教训与架构决策记录.md) —— AI 安全相关的历史决策和教训