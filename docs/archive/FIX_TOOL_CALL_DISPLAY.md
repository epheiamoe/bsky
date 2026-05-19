# v0.12.2: AI Chat Tool Call Display Fix & OpenAI Format

> **Date**: 2026-05-12  
> **Affected**: `@bsky/app`, `@bsky/pwa`  
> **Root cause**: `mapMessages()` output ordering + stale message ref propagation

---

## Problem

AI chat tool calls displayed incorrectly after editing/undoing a message or reloading a conversation:

1. **Tool calls and results split apart**: `tool_call` cards shown standalone, `tool_result` cards shown with fake tool name `"result"` — instead of paired together.
2. **Empty assistant messages**: Blank grey message bubbles appeared between tool calls and results.
3. **Persistent after reload**: Once corrupted, the incorrect display survived page refreshes.

### Pre-fix display (view.txt excerpt)

```
思考                          ← correct
工具调用 get_profile          ← tool_call shown ALONE, no result
哎呀，你说你是我开发者？...    ← assistant text (correct but displaced)
工具调用 result               ← FAKE tool name "result" from orphaned tool_result
{"did":"did:plc:..."}          ← result content
```

### Expected display

```
思考
哎呀，你说你是我开发者？...    ← assistant text
🔧 工具调用 get_profile        ← tool_call+result paired together
{"did":"did:plc:..."}          ← inline result
```

---

## Root Cause Analysis

### The corruption chain (5 steps)

**Step 1: `mapMessages()` produces reversed order**

`useAIChat.ts:mapMessages()` converts OpenAI-format assistant messages (internal state) to display messages. Before the fix:

```typescript
// OLD (broken) order:
if (m.tool_calls && m.tool_calls.length > 0) {
    for (const tc of m.tool_calls) {
        result.push({ role: 'tool_call', ... });  // PUSHED FIRST
    }
}
result.push({ role: 'assistant', content: text });  // PUSHED SECOND
```

When an assistant message has BOTH text content AND tool calls (standard — the model says "let me check..." then calls a tool), the output was: `[tool_call, tool_call, ..., assistant(text)]`.

But the display grouping logic (`messageGroups` in AIChatPage.tsx) uses **adjacency** to pair `tool_call` + `tool_result`. With assistant text between them, the tool_call gets orphaned and the tool_result creates a fake `"result"` tool name.

**Step 2: Empty assistant from load reconstruction**

When a chat is loaded from IndexedDB, the stored `tool_call` messages are reconstructed as internal assistant messages with `content: ''`:

```typescript
// useAIChat.ts:150-152
chatMsgs.push({
    role: 'assistant',
    content: '',  // <— EMPTY
    tool_calls: [{ id: m.toolCallId, function: { name: m.toolName, arguments: '{}' } }],
});
```

When `mapMessages` processed these, the empty content produced empty assistant display messages.

**Step 3: Stale messagesRef after setMessages**

`editByIndex` and `undoLastMessage` called `setMessages(mapMessages(...))` with a **direct value** (not an updater function). The `messagesRef.current` was NOT updated:

```typescript
// OLD: ref not synced
setMessages(mapMessages(keep));  // state updated, but messagesRef is stale!
```

**Step 4: Corruption propagated to autoSave**

When the user sent a new message after editing, `send()` called `setMessages(prev => [...prev, newMsg])`. The `prev` state was the corrupted state from `mapMessages`. The updater updated `messagesRef.current` → autoSave saved the corrupted state to IndexedDB.

**Step 5: Permanent on reload**

`loadChat` → `setMessages(record.messages)` loaded the corrupted state from IndexedDB. Each reload showed the same broken display.

---

## Fixes

### Fix 1: `mapMessages()` ordering (`useAIChat.ts:420-461`)

Reordered to push assistant text BEFORE tool_calls:

```typescript
// NEW (correct) order:
// 1. reasoning_content → thinking message
if (m.reasoning_content) { result.push({ role: 'thinking', ... }); }

// 2. text content (if non-empty) → assistant message
if (hasContent) { result.push({ role: 'assistant', content: text }); }

// 3. tool calls → tool_call messages
if (m.tool_calls?.length > 0) { result.push(...tool_calls); }

// 4. Skip empty assistant entirely when no content and no tool_calls
```

Result: `tool_call` messages are now **adjacent** to their `tool_result` messages → `messageGroups` adjacency pairing works correctly.

### Fix 2: Empty assistant elimination

Empty-content assistant messages are no longer pushed (skip when `content.trim() === ''` and `tool_calls.length > 0`).

### Fix 3: `messagesRef` sync (`useAIChat.ts:473,491`)

```typescript
const newMsgs = mapMessages(keep);
setMessages(newMsgs);
messagesRef.current = newMsgs;  // ← ADDED
```

### Fix 4: Auto-repair on load (`useAIChat.ts`)

New `repairCorruptedMessages()` function:

1. **Remove empty assistants**: Filter out `role === 'assistant' && content.trim() === ''`
2. **Reorder corrupted blocks**: Detect `tool_call×N → assistant → tool_result×N` → reorder to `assistant → tool_call×N → tool_result×N`
3. **Write back**: If repaired, call `saveChat()` to permanently fix IndexedDB data

```typescript
// In load effect:
const repaired = repairCorruptedMessages(record.messages);
setMessages(repaired);
if (repaired !== record.messages) {
    saveChat(record.id, repaired, record.title, ...);
}
```

### Fix 5: OpenAI standard export/import (`AIChatPage.tsx`)

**Export** (`toOpenAIFormat`):
| Display format | OpenAI export |
|---|---|
| `thinking("...")` | `assistant.reasoning_content` |
| `assistant("text")` | `assistant.content` |
| `tool_call(name, args)` | `assistant.tool_calls[{function:{name, arguments}}]` |
| `tool_result(data, id)` | `role: "tool"`, `content`, `tool_call_id` |
| `user("text")` | `role: "user"`, `content` |

Format version: `bsky-chat-v1` → `bsky-chat-v2`.

**Import** (`fromOpenAIFormat` + `detectImportFormat`):
- `bsky-chat-v1`: old format parser (preserved for backward compatibility)
- `bsky-chat-v2` / OpenAI style: new parser
- Auto-detection: checks for `tool_calls` or `role: "tool"` vs `role: "tool_call"` / `role: "tool_result"`

### Fix 6: Mobile user message width

`UserMessage.tsx`: `max-w-[75%]` → `max-w-[85%] md:max-w-[75%]`. Mobile screens get wider messages, desktop unchanged.

### Fix 7: About page check-for-updates

`services/pwa.ts`: Added `checkForPwaUpdateManual()` that doesn't set `_ignoreNextUpdate`. About page uses it instead of `checkForPwaUpdate()`.

---

## Files Modified

| File | Lines | Changes |
|------|-------|---------|
| `packages/app/src/hooks/useAIChat.ts` | +84/-9 | mapMessages reorder, ref sync, repairCorruptedMessages, load repair |
| `packages/pwa/src/components/AIChatPage.tsx` | +148/-45 | toOpenAIFormat, fromOpenAIFormat, detectImportFormat, export v2, dual import |
| `packages/pwa/src/components/ai/UserMessage.tsx` | +1/-1 | Mobile width responsive |
| `packages/pwa/src/services/pwa.ts` | +5/-0 | checkForPwaUpdateManual |
| `packages/pwa/src/components/AboutPage.tsx` | +2/-2 | Use checkForPwaUpdateManual |
| `packages/pwa/src/components/ai/ThinkingCard.tsx` | +3/-2 | overflow-x-auto, overscrollBehaviorY auto |
| `packages/pwa/src/components/ai/ToolCard.tsx` | +3/-2 | overflow-x-auto, overscrollBehaviorY auto |
| `packages/pwa/src/components/AIChatPage.tsx` | +2/-10 | Remove visualHeight JS listener, use CSS dvh |
| `packages/core/src/at/client.ts` | +1/-1 | APP_VERSION → 0.12.2 |
| `packages/pwa/package.json` | +1/-1 | version → 0.12.2 |
| `CHANGELOG.md` | +30/-0 | v0.12.1 + v0.12.2 entries |

---

## Verification

1. Stream new conversation with tool calls → pairs display correctly
2. Edit message during/after streaming → no empty assistants, correct grouping
3. Load previously corrupted conversation → auto-repaired on first load
4. Export → valid OpenAI standard JSON with reasoning_content and nested tool_calls
5. Import v1 JSON → backward compatible
6. Import v2 JSON → correctly converted to display format
7. About page → "Check for updates" detects available SW updates
8. Mobile AI chat → user messages 85% width, assistant 85% width
