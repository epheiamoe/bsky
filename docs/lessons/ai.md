# AI & Prompting Lessons

> AI integration, tool calls, prompt engineering, and model interactions
>
> Part of the [Lessons Learned](../LESSONS.md) collection.

---

## Lesson 2: tool_call_id Loss on Three Paths

**Category**: AI

**Root Cause**: `tool_call_id` 在三个独立路径上丢失：
1. **assistant.ts:617** — 正常执行路径的 `tool_result` yield 缺少 `toolCallId: tc.id`（取消路径第 599 行有，正常路径忘了）
2. **useAIChat.ts:137** — 会话恢复路径将 `tool_call` 和 `tool_result` **都映射为 `role: 'tool'`**，导致 API 收到一系列连续的 tool 消息，但没有前面的 `assistant { tool_calls }` 消息 → API 400
3. **useAIChat.ts:371** — `mapMessages`（edit/undo 后恢复 UI 状态）丢失 `toolName` 和 `toolCallId`

**Fix**:
1. `assistant.ts:617` 补上 `toolCallId: tc.id`
2. `useAIChat.ts` 恢复路径重写：`tool_call` → 重建 `assistant { tool_calls[] }` 消息，`tool_result` → `tool { tool_call_id }` 消息，保持正确序列
3. `useAIChat.ts:371` `mapMessages` 补上 `toolName: m.name, toolCallId: m.tool_call_id`

**Lesson Learned**: 存储格式（`AIChatMessage`）和 API 格式（`ChatMessage`）的转换是高风险区。每个 field 的路线都需要端到端验证——是否存在、是否在序列化中保留、是否在恢复中还原。

---

---

## Lesson 3: Double Formatting — tryJsonSummary vs formatToolResult

**Category**: AI

**Root Cause**: `useAIChat.ts` 的流式处理器先用 `tryJsonSummary(event.content)` 把 JSON 压缩为短字符串（如 `"用户: @handle (name)"`），再存入 `AIChatMessage.content`。然后 `formatToolResult` 收到这个已压缩的字符串，尝试 `JSON.parse` → 失败 → 落到 fallback 显示 `"Profile"`。

**Fix**:
- `useAIChat.ts` 改为直接存储原始 `event.content`（不经过 `tryJsonSummary`），让 `formatToolResult` 处理所有显示
- `formatToolResult` 的最终 fallback 改为显示内容第一行，而非 `toolLabel(name)`

**Lesson Learned**: 格式化层不能重复。如果有两个格式化函数，一个在数据处理层，一个在视图层，它们会互相干扰。只能保留一层——要么在数据层格式化（TUI 场景），要么在视图层（PWA 场景）。

---

---

## Lesson 17: AI Card Data Retention — `mapMessages` Must Rebuild Sequence

**Category**: AI

**Root Cause**: `AIChatMessage`（存储格式）缺少 `reasoning_content` 和 `tool_calls` 字段。`mapMessages`（`ChatMessage[]` → `AIChatMessage[]`）丢弃了这些字段。编辑/恢复后 UI 显示空白。

**Fix**:
1. `AIChatMessage` 加 `reasoning_content?: string` + `tool_calls?: any[]`
2. `mapMessages` 重写为遍历循环：assistant 消息有 `reasoning_content` → 先 emit thinking card；有 `tool_calls` → emit tool_call entries；然后 emit assistant 消息本身
3. 存储恢复路径保留 `reasoning_content`

**Lesson Learned**: 存储格式与 API 格式的字段映射必须是双向完整的。`ChatMessage`（API 格式）的每个重要字段都应在 `AIChatMessage`（存储格式）有对应字段，并且在 `mapMessages` 双向转换中保留。

---

---

## Lesson 18: `buildToolDescription` — New Write Tools Must Add Description

**Category**: AI

**Root Cause**: `buildToolDescription` 只有 `create_post`、`like`、`repost`、`follow`、`upload_blob` 的 switch case。新增工具 fall through 到 default 的 `JSON.stringify(args)` 截断。

**Fix**: 每个 `requiresWrite: true` 的工具必须在 `buildToolDescription` 添加 human-readable case：
```typescript
case 'create_list': return `创建列表: "${args.name}" (${args.purpose === 'moderation' ? '管理' : '精选'})`;
case 'add_to_list': return `添加用户 ${args.subject} 到列表`;
case 'remove_from_list': return `从列表移除用户 ${args.subject}`;
```

**Lesson Learned**: 确认门的三层（`requiresWrite` → `buildToolDescription` → UI 弹窗）必须完整覆盖。添加新 write 工具时，这三层都要检查。

---

---

## Lesson 68: Pass Context Through Tool Handlers

**Category**: AI / Architecture

**Root Cause**: `tools.ts` `execute_python` handler called `sandbox.execute(p.code)` without passing `chatId`, so Python-generated files were never saved to workspace storage.

**Context**:
- `PythonSandboxEngine.execute(code, chatId?)` accepts optional chatId for isolation
- `createTools(client)` creates tools without chat session context
- Tool handlers run in AIAssistant, which has access to chatId
- Missing chatId means `if (chatId && ...)` condition is always false

**Solution**: Pass getChatId function through tool creation:
```typescript
// createTools receives a function to get current chatId
export function createTools(client: BskyClient, getChatId?: () => string | undefined): ToolDescriptor[] {
  // ...
  handler: async (p) => {
    const result = await sandbox.execute(p.code as string, getChatId?.());
    // ...
  }
}
```

**Lesson Learned**:
1. **Tools need runtime context** — session ID, user preferences, etc.
2. **Use getter functions for dynamic values** — static values become stale
3. **Test tool execution in different sessions** — verify isolation
4. **Document context requirements** — each tool should declare what context it needs

---