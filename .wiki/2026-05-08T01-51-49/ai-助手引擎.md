## 核心设计：无限循环的 AI 对话引擎

`AIAssistant` 是整个 AI 系统的 **中枢神经**。它不是一个简单的 API 封装，而是一个 **自主驱动的多轮对话循环**：向 LLM 发送请求 → 解析工具调用 → 执行工具 → 将结果注入下一轮上下文中 → 继续，直到 LLM 输出纯文本回复。这个循环没有内置上限——唯一的停止条件是用户通过 `AbortSignal` 主动中断，或者 LLM 主动返回 `finish_reason: 'stop'`。

---

### 类型系统与配置

文件开头（L11–91）定义了一组与 OpenAI Chat Completions API **对齐但非严格耦合**的接口。核心类型链为：

```
ContentBlock          → 支持 text/image_url 的多模态内容单元
ChatMessage           → role (system/user/assistant/tool) + content (string | ContentBlock[])
ToolCall              → id + type + function.name + function.arguments
ChatCompletionRequest → 最终送入 API 的完整请求体
AIConfig              → 运行时配置：apiKey、baseUrl、model、thinkingEnabled、visionEnabled、reasoningStyle
```

`AIConfig.reasoningStyle` 是关键的 **适配层参数**，取值为 `'reasoning_content' | 'structured_content' | 'none'`，决定 `_buildMessages` 如何预处理思维链内容（见下文）。

默认配置（L87–91）使用 DeepSeek 端点：

```typescript
const DEFAULT_CONFIG: Partial<AIConfig> = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  thinkingEnabled: true,
};
```

[来源](packages/core/src/ai/assistant.ts#L11-L91)

---

### 构造函数与动态更新

构造函数（L109–111）极其简洁——将传入的部分配置与 `DEFAULT_CONFIG` 合并：

```typescript
constructor(config?: Partial<AIConfig>) {
  this.config = { ...DEFAULT_CONFIG, ...config } as AIConfig;
}
```

`updateConfig`（L113–115）在实例生命周期内随时替换任意配置项：

```typescript
updateConfig(config: Partial<AIConfig>): void {
  this.config = { ...this.config, ...config };
}
```

这种设计意味着：**不需要重建实例来切换模型、API Key 或提供商**。[AI 对话 Hook](ai-对话-hook-深度解析.md) 在用户切换模型时直接调用 `updateConfig`，对话状态（messages、tools）保持不变。

[来源](packages/core/src/ai/assistant.ts#L109-L115)

---

### 工具注册与消息管理

`setTools`（L117–123）接受 `ToolDescriptor[]` 数组（定义见 [31 个 AI 工具系统](31-个-ai-工具系统.md)），同时构建 `toolMap` 用于 O(1) 名称查找：

```typescript
setTools(tools: ToolDescriptor[]): void {
  this.tools = tools;
  this.toolMap.clear();
  for (const tool of tools) {
    this.toolMap.set(tool.definition.name, tool);
  }
}
```

消息队列管理（L137–155）提供标准的增/查/清/加载接口：`addSystemMessage`、`addUserMessage`、`getMessages`、`clearMessages`、`loadMessages`。`loadMessages` 用于从 [存储系统](存储与持久化.md) 恢复历史会话。

图片管理分为两种（L157–178）：
- **`_pendingImages`**：通过 `view_image` 工具获取的 base64 数据 URL，在下一轮构建消息时注入最近的 user message 作为多模态视觉输入。
- **`_userUploads`**：用户上传的原始图片数据（Uint8Array），用于在 AI 执行 `create_post` 等写工具时附加图片。

[来源](packages/core/src/ai/assistant.ts#L117-L178)

---

### `sendMessage`：非流式多轮循环

`sendMessage`（L201–316）是 **同步风格的异步方法**，返回包含最终回复、工具调用计数和中间步骤追踪的对象。

#### 核心循环逻辑

```
for (let round = 0; ; round++)         ← 无上限循环
  response = await makeRequest()        ← 调用 LLM API
  if (response.choices[0].message.tool_calls)
    执行每个工具调用 → 结果推入 messages → continue
  else
    推入 assistant 消息 → return finalContent
```

循环的终止条件只有两种：
1. LLM 返回的消息 **不包含** `tool_calls`——视为最终答复。
2. 外层调用者通过 `AbortSignal` 中止——但非流式模式下未传递 signal，实际中止只能通过检查点（目前非流式不暴露 signal）。

#### JSON 解析容错

工具调用的 `arguments` 是 JSON 字符串（L231–237）。当 LLM 产生畸形 JSON（如 DeepSeek 偶尔输出不完整的多行 JSON），解析失败不会终止流程，而是回退为 `{ _raw: tc.function.arguments }` 并打印警告：

```typescript
try {
  toolArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
} catch {
  toolArgs = { _raw: tc.function.arguments };
  console.warn(`[assistant] Malformed JSON in tool call "${toolName}" arguments, using raw string`);
}
```

这对下游工具 handler 是透明的——它们需要自行处理 `_raw` 字段。

#### 中间步骤追踪

每次工具调用、工具结果和最终回复都会推入 `intermediateSteps` 数组（L240–307），返回给调用者（[AI 对话 Hook](ai-对话-hook-深度解析.md) 将其渲染为聊天界面中的逐步日志）。

[来源](packages/core/src/ai/assistant.ts#L201-L316)

---

### `sendMessageStreaming`：流式多轮循环

`sendMessageStreaming`（L418–641）是一个 **AsyncGenerator**，逐帧产出结构化事件。与非流式版本相比，核心差异有三：

#### 1. SSE 流的手动解析

使用原生 `fetch` + `ReadableStream` 手动解析 SSE（L484–552），而非依赖任何 SSE 库：

```typescript
const reader = res.body!.getReader();
const decoder = new TextDecoder();
// 逐块读取 → 按 '\n' 分割 → 过滤 'data: ' 前缀
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value, { stream: true });
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    if (data === '[DONE]') continue;  // 流结束标记
    const chunk = JSON.parse(data);
  }
}
```

每个 `delta` 块三种可能性并行处理：
- **`delta.reasoning_content`**：原生推理内容（DeepSeek R1 风格），累加并 `yield { type: 'thinking' }`。
- **`delta.content`**：普通 token，累加到 `fullContent` 并 `yield { type: 'token' }`。当 content 为数组时（Mistral 的 `structured_content`），递归解析 `thinking` 和 `text` 子块。
- **`delta.tool_calls`**：流式工具调用，按 `index` 字段累加到 `toolCallAccum` Map 中。

#### 2. 工具调用的流式累积

由于工具调用可能跨多个 chunk 分片到达，使用 `Map<number, { id, name, arguments }>` 按 index 累积（L488, L538–549）：

```typescript
if (delta.tool_calls) {
  for (const tc of delta.tool_calls) {
    const idx = tc.index;
    if (!toolCallAccum.has(idx)) {
      toolCallAccum.set(idx, { id: '', name: '', arguments: '' });
    }
    const acc = toolCallAccum.get(idx)!;
    if (tc.id) acc.id = tc.id;
    if (tc.function?.name) acc.name = tc.function.name;
    if (tc.function?.arguments) acc.arguments += tc.function.arguments; // 拼接
  }
}
```

流结束后，按 index 排序，构造完整的 `ToolCall[]` 数组。

#### 3. AbortSignal 控制

与 `sendMessage` 不同，流式版本将 `signal` 传递给 `fetch`（L464），并在每个关键检查点检测中止状态：

- **fetch 前**的 TypeError 捕获中（L467–476）：如果 `signal.aborted`，直接 `yield { type: 'done', content: '\\n\\n[已暂停]' }` 并 return。
- **SSE 读取循环中**（L492–494）：每次迭代检查 `signal?.aborted`，yield 已累积的 partial content。
- **SSE 读取异常**（L553–559）：如果 reader 因中止抛错，也 yield partial content 而非抛出。

这种设计确保 **用户随时暂停，不丢失已生成的内容**，这是 [流式输出与思考模式](流式输出与思考模式.md) 中讨论的核心需求。

[来源](packages/core/src/ai/assistant.ts#L418-L641)

---

### `_buildMessages`：消息预处理管线

`_buildMessages`（L318–359）在每次 `makeRequest` 前执行，对原始消息队列做三层转换：

#### 第一层：reasoningStyle 适配

当 `reasoningStyle !== 'reasoning_content'`（即 `'structured_content'` 或 `'none'`），将 `reasoning_content` 字段 **合并到 content 正文** 中作为思考过程前缀，然后删除 `reasoning_content` 字段（L323–334）：

```typescript
// 转换前：{ role: 'assistant', reasoning_content: '先分析...', content: '答案是 X' }
// 转换后：{ role: 'assistant', content: '【上一步思考过程】\n先分析...\n\n答案是 X' }
```

这一步解决了两个问题：
1. 不支持 `reasoning_content` 字段的 API（如 Mistral）不会因 `extra_forbidden` 报错。
2. 结构化内容（Mistral）的 thinking/text 数组也能正确渲染。

#### 第二层：tool 消息过滤

过滤掉 `tool` 角色但没有 `tool_call_id` 的消息（L336）。这类消息可能来自 **存储恢复时的数据损坏**（如 IndexedDB schema 变更），过滤防止 API 拒绝请求。

#### 第三层：Vision 图片注入

当有 `_pendingImages` 且 `visionEnabled === true` 时（L337–357），从后往前扫描最后一个 user 消息，将其 content 从纯文本重构为 `ContentBlock[]` 数组：

```typescript
const blocks: ContentBlock[] = [
  { type: 'text', text: originalText },
  ...pendingImages.map(img => [
    ...(img.alt ? [{ type: 'text', text: `[图片 ALT: ${img.alt}]` }] : []),
    { type: 'image_url', image_url: { url: img.url, detail: 'auto' } },
  ]),
];
```

**关键细节**：注入后的 blocks 同时写回 `this.messages[i]`（L353），确保图片上下文在后续工具循环中持久保留。处理完后 `clearPendingImages()` 清空队列。

[来源](packages/core/src/ai/assistant.ts#L318-L359)

---

### `makeRequest`：API 调用层

`makeRequest`（L360–412）构建 `ChatCompletionRequest` 并发送 POST 请求。

请求体构建逻辑：
- 始终携带 `model`、`messages`（经 `_buildMessages` 处理）、`temperature: 0.7`、`max_tokens: 4096`。
- 根据 `shouldSendThinkingParam(provider)` 决定是否附加 `thinking` 对象（L367–369）。
- 根据 `reasoningStyle === 'structured_content'` 决定是否附加 `reasoning_effort: 'high'`（L370–372）。
- 仅在 `this.tools.length > 0` 时携带 `tools` 数组和 `tool_choice: 'auto'`（L375–385）。

网络错误处理（L390–404）区分 `TypeError`（DNS/网络不通，给出可操作错误信息）和其他异常。

[来源](packages/core/src/ai/assistant.ts#L360-L412)

---

### `_waitForConfirmation`：写操作确认门

`_waitForConfirmation`（L194–199）是实现 **用户确认门** 的同步等待模式：

```typescript
private async _waitForConfirmation(): Promise<boolean> {
  this._confirmPromise = new Promise<boolean>((resolve) => {
    this._confirmResolve = resolve;
  });
  return this._confirmPromise;
}
```

`confirmAction(approved: boolean)`（L186–192）由 UI 层调用（点击确认/取消按钮），resolve 该 Promise。设计要点：

- **单次挂起**：一次只能有一个确认对话框，新确认会覆盖旧引用（但旧 Promise 永远不会被 resolve——TODO 改进点）。
- **非侵入式**：工具循环在此处暂停等待，不阻塞其他 UI 渲染。
- **取消处理**：当 `sendMessage`/`sendMessageStreaming` 检测到 `approved === false`，注入取消结果消息后 `continue` 进入下一轮。

在流式模式中（L595–608），写工具触发前额外 yield 一个 `confirmation_needed` 事件，让 UI 层（如 [AI 对话 Hook](ai-对话-hook-深度解析.md)）渲染确认弹窗。

[来源](packages/core/src/ai/assistant.ts#L180-L199)

---

### `singleTurnAI` 与 `polishDraft`：轻量工具函数

`singleTurnAI`（L661–707）是一个 **无工具、无循环** 的单轮 AI 调用，专供翻译、润色等场景使用。与 `AIAssistant` 相比，它不管理消息队列，不追踪中间步骤，直接返回 `string`。

`polishDraft`（L831–840）是对 `singleTurnAI` 的简单包装，注入 `P_POLISH_SYSTEM`（系统提示）和 `PF_POLISH_USER`（用户提示），专门用于帖子润色：

```typescript
export async function polishDraft(config: AIConfig, draft: string, requirement: string, modelOverride?: string): Promise<string> {
  return singleTurnAI(config, P_POLISH_SYSTEM, PF_POLISH_USER(requirement, draft), 0.7, 2000, modelOverride);
}
```

`translateText`（L725–818）是另一个包装，支持 `simple`/`json` 双模式，包含 **重试逻辑**：最多 `maxRetries` 次（默认 3），指数退避（800ms × attempt）。`json` 模式下额外校验 `translated` 字段是否存在，缺失时自动重试。

[来源](packages/core/src/ai/assistant.ts#L658-L840)

---

### 架构约束与设计取舍

| 维度 | 说明 |
|------|------|
| **循环无上限** | 非流式和流式的主循环都是 `for(;;)` 无界设计。用户通过 `AbortSignal` 或暂停按钮手动控制。 |
| **JSON 容错** | tool call arguments 解析失败不回滚、不重试，降级为 `_raw` 字符串。 |
| **消息突变** | `_buildMessages` 会直接修改 `this.messages`（图片注入），这是设计意图——跨轮次持久保留视觉上下文。 |
| **确认门单次** | `_waitForConfirmation` 不处理并发确认（写工具之间不会同时出现）。 |
| **Provider 适配** | 所有 Provider 差异通过 `providers.ts` 的 `shouldSendThinkingParam` 和 `reasoningStyle` 配置解耦。 |

---

### 下一步

- 查看 [流式输出与思考模式](流式输出与思考模式.md) 理解 SSE 解析的完整协议细节。
- 阅读 [31 个 AI 工具系统](31-个-ai-工具系统.md) 了解 AIAssistant 的工具注册与执行链。
- 深入 [AI 对话 Hook 深度解析](ai-对话-hook-深度解析.md) 了解 UI 层如何桥接 AIAssistant。