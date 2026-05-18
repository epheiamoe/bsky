# Storage & Persistence Lessons

> IndexedDB, file system, localStorage, caching, and data persistence
>
> Part of the [Lessons Learned](../LESSONS.md) collection.

---

## Lesson 10: Component Persistence — Module-Level Toggle Needs Callback

**Category**: Storage/Persistence

**Root Cause**: `PostActionsRow` 和 `ProfilePage` 的 AI 按钮调用 `toggleWidget('aiChat')`（module-level 操作），只改了 `_order` 数组，没有调用 `saveAppConfig()` 写入 localStorage。只有 `Layout.handleToggleWidget`（Layout 自己的 handler）会保存。

**Fix**: 在 `widgetStore.ts` 中引入 `_onWidgetToggle` 回调机制：
```typescript
let _onWidgetToggle: ((id: string) => void) | null = null;
export function setWidgetToggleCallback(fn) { _onWidgetToggle = fn; }

// toggleWidget 调用后触发回调
export function toggleWidget(id: string): boolean {
  if (isWidgetEnabled(id)) { disableWidget(id); }
  else { enableWidget(id); }
  _onWidgetToggle?.(id);
  return !enabled;
}
```

`Layout.tsx` mount 时注册 `saveAppConfig` 到回调：
```typescript
useEffect(() => {
  setWidgetToggleCallback((id) => {
    const updated = { ...config, enabledWidgets: getEnabledWidgetIds() };
    saveAppConfig(updated);
    onConfigChange(updated);
  });
  return () => setWidgetToggleCallback(null);
}, [config, onConfigChange]);
```

**Lesson Learned**: module-level 状态（`_order`）的变更必须有一个统一的持久化回调，确保无论从哪个入口调用 `enableWidget`/`disableWidget`/`toggleWidget`，都能触发 `saveAppConfig`。

---

---

## Lesson 11: Array vs Set — Use Array for Ordered State

**Category**: Storage/Persistence

**Root Cause**: 原来用 `Set` 管理 widget 启用状态。`Set` 的插入顺序会导致问题——`enableWidget` 时 `Set.add(id)` 总是追加到末尾。但 `initEnabledWidgets` 期望从 localStorage 恢复特定顺序。`Set` 的顺序不可信赖。

**Fix**: 完全改用 `string[]` 数组：
```typescript
let _order: string[] = [];
export function enableWidget(id: string): void {
  if (getWidget(id) && !_order.includes(id)) _order.push(id);
}
export function disableWidget(id: string): void {
  _order = _order.filter(x => x !== id);
}
```

**Lesson Learned**: 需要顺序保持的状态应使用数组而非 Set。Set 适合「是否包含」判断，但顺序行为不可靠（特别是 clear + add 模式）。

---

# Session 2026-05-08

---

## Lesson 49: ChatStorage Factory Pattern

**Category**: Storage/Persistence

**Root Cause**: `useChatHistory` 硬编码 `new FileChatStorage()`（Node.js 文件系统），PWA 被迫在每个组件中手动 `new IndexedDBChatStorage()` 并传入参数。

**Fix**: 参照 DraftStorage 的工厂模式，在 `chatStorage.ts` 中引入 `setChatStorageFactory()` + `getDefaultChatStorage()`。

```
TUI:  自动检测 Node.js → FileChatStorage（无需注册）
PWA:  App.tsx 注册 setChatStorageFactory(() => new IndexedDBChatStorage())
      AIChatPage/AIChatWidget → 无参调用 useChatHistory()
```

**Lesson Learned**: 写第二个类似系统时（ChatStorage 先写，DraftStorage 后写），应直接使用工厂模式而非硬编码。工厂模式消除调用方选择责任。

---

---

## Lesson 50: autoSave Race Condition — Concurrent IndexedDB Writes

**Category**: Storage/Persistence

**Root Cause**: `useAIChat` 的 `send()` 函数有两处 `void autoSave()`：

```
send():
  1. setMessages(prev => { void autoSave(updated); return updated; })
     ← 用户消息发出时立即保存（仅用户消息，不等待）
  [streaming...]
  2. setMessages(prev => { void autoSave(prev); return prev; })
     ← 流结束后保存（完整消息，也不等待）
```

两个 `autoSave` 都对同一 `chatIdRef.current` 执行 `IndexedDB.put()`（upsert）。`void` 不等待，两个写入并发。**即便 IndexedDB 有事务排队机制，最后一个完成的写入覆盖前一个**——较小的数据包（仅用户消息）可能晚于完整数据包完成，覆盖完整数据。

**Fix**: 删除 `send()` 中的第 1 处过早保存，只保留流结束后的第 2 处保存。

**Lesson Learned**: `void` + `IndexedDB.put()` + 同一个 key = 竞态。所有写入同一个 key 的异步操作必须序列化，或只保留一个写入点。

---

---

## Lesson 51: autoSave Write Queue — Prevent Transaction Reordering

**Category**: Storage/Persistence

**Root Cause**: Lesson 50 移除了过早保存后，PWA 中若两次 `autoSave` 并发（如 auto-analysis 与用户手动发消息同时触发），IndexedDB 事务可能乱序完成——`autoSave A`（不完整数据）在 `autoSave B`（完整数据）之后完成，覆盖掉完整数据。

```
autoSave A: version=1, idx 写入 data_A  ← 发起
autoSave B: version=2, idx 写入 data_B  ← 发起
  [B 完成] → 磁盘 data_B（正确）
  [A 完成] → 磁盘 data_A（不完整！覆盖 B）
```

版本检查 `if (version !== saveVersionRef.current)` 在写入**之后**——无法阻止已发生的覆盖。

**Fix**: 引入 `saveQueueRef`（Promise 链），将所有 `storage.saveChat()` 串行化执行：

```typescript
const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

// autoSave 中的核心变化：
await new Promise((resolve, reject) => {
  saveQueueRef.current = saveQueueRef.current.then(async () => {
    if (version !== saveVersionRef.current) { resolve(); return; }
    if (saveChatId !== chatIdRef.current) { resolve(); return; }
    await storage.saveChat(data);       // ← 入队执行
    // ... 标题生成等后续操作 ...
    resolve();
  }).catch(reject);
});
```

队列保证 `autoSave B` 的写入始终在 `autoSave A` 的写入**完成之后**才开始。加上 `saveChatId` 快照守卫（防止会话切换时错误覆盖），三重防护。

**Lesson Learned**: 异步 I/O 竞态不能靠"写入后检查"解决——写入本身不可逆。必须用 Promise 链（写队列）保证顺序，并在写入前做版本校验。

---

---

## Lesson 69: Unified File Storage Across Platforms

**Category**: Architecture / Cross-Platform

**Root Cause**: Initially planned to pass file content through AI tool results (from Worker → tools.ts → UI), but content was stripped to save tokens. Files ended up empty in workspace.

**Context**:
- PWA uses IndexedDB for file storage
- TUI uses filesystem for file storage
- Both implement `WorkspaceStorage` interface
- AI messages shouldn't carry binary content (wastes tokens)

**Solution**: Store files in workspace at sandbox layer, return metadata-only to AI:
```
Worker → content ✅
  → Sandbox.saveToWorkspace(chatId) ✅
  → tools.ts → metadata JSON → AI
  → UI loads from workspace by chatId ✅
```

**Lesson Learned**:
1. **Separate data storage from AI messaging** — don't put files in chat history
2. **Use shared abstractions** — `WorkspaceStorage` interface works for both PWA and TUI
3. **Metadata is lightweight** — name, size, type are enough for AI context
4. **Cross-platform consistency** — PWA + TUI + MCP share same data flow
5. **Test on all platforms** — IndexedDB and filesystem have different characteristics