# ChatService — AI 对话持久化架构

> v0.10.5 (2026-05-11) · 本次重构的核心产出

## 问题背景

### 旧架构（v0.10.4 及之前）

```
useAIChat (React hook)
  │
  ├── storage = getDefaultChatStorage()   ← 每 render 重新获取
  ├── autoSave(prev)                      ← 版本跳过 + Promise 链队列
  ├── load effect: [chatId, storage]      ← storage 变化→重跑
  │
  └── IndexedDB (PWA) / File (TUI)
```

**5 个叠加的 root cause：**

| # | 问题 | 后果 |
|---|------|------|
| 1 | `App.tsx` 中 `setChatStorageFactory()` 在渲染顶层执行 | 每 render 重置 `_defaultChatStorage = null` → PWA 端 `storage` 引用每 render 变化 |
| 2 | load effect 依赖 `[options?.chatId, storage]` | `storage` 变化 → 流式响应期间 load effect 重新触发 → `setMessages(record.messages)` 覆盖累积的对话数据 |
| 3 | `autoSave` 的 `saveVersionRef` 版本跳过机制 | autoSave(完整数据) → version=1; autoSave(残缺数据) → version=2; 版本检查跳过"旧"版本(完整)保留"新"版本(残缺) |
| 4 | 无空消息 guard | `autoSave(messages: [])` 直接写入 IndexedDB 覆盖完整对话历史 |
| 5 | `send` 的 `setMessages` 与 load effect 的 `setMessages` 竞态 | 用户消息发出后被 load effect 的 `setMessages(record.messages)` 覆盖，后续 autoSave 保存的数据缺少当前用户消息 |

**结果**: AI 工具调用期间/之后，所有历史消息（用户、AI、工具调用）全部丢失，刷新后仍丢失，导出确认数据在存储中已被覆盖。

---

## 新架构（v0.10.5）

```
┌──────────────────────────────────────────────────────┐
│                  ChatService (模块级单例)               │
│                                                      │
│  let _storage: ChatStorage | null                    │
│  let _writeQueue = Promise.resolve()                 │
│  let _debounceTimers = Map<id, Timer>                │
│  let _latestSnapshot = Map<id, ChatRecord>           │
│                                                      │
│  saveChat(id, messages, title, ...) → debounce 300ms  │
│  loadChat(id)                                        │
│  saveChatNow(record)   ← 跳过 debounce（导入用）      │
│  listChats()                                         │
│  deleteChat(id)                                      │
└──────────────────────┬───────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   IndexedDB (PWA)  File (TUI)  (未来扩展)
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   useAIChat (React)       useChatHistory (React)
   - autoSave → 直接调 saveChat   - listChats / saveChatNow
   - load effect: [chatId]         - 无 debounce
   - 无 storage 实例
```

### 核心设计决策

#### 1. 模块级单例，零 React 依赖

```typescript
// chatService.ts
let _storage: ChatStorage | null = null;

export function initChatService(storage: ChatStorage): void {
    if (!_storage) _storage = storage;  // idempotent
}
```

- `_storage` 是模块级变量，不受 React 生命周期影响
- `initChatService` 的 idempotent guard 确保同一个 `_storage` 在其后所有调用中保持稳定引用
- PWA 端在 `App.tsx` 的 `useEffect` 中调用，只执行一次
- TUI 端在 `cli.ts` 启动时调用，也只执行一次

#### 2. Debounce + 快照覆盖（替代版本跳过）

```typescript
export function saveChat(id, messages, title?, contextUri?, context?): void {
    if (messages.length === 0) return;  // ← 空消息 guard

    _latestSnapshot.set(id, record);    // ← 覆盖最新数据

    const existing = _debounceTimers.get(id);
    if (existing) clearTimeout(existing);

    _debounceTimers.set(id, setTimeout(() => {
        const snap = _latestSnapshot.get(id);
        if (!snap || snap.messages.length === 0) return;  // ← 二次 guard
        _writeQueue = _writeQueue.then(() => storage.saveChat(snap));
    }, DEBOUNCE_MS));
}
```

- **为什么 debounce 而不是版本跳过？** 版本跳过需要区分"新旧"版本，但无法知道哪个版本的 messages 数组更完整。Debounce 简单地等待数据稳定后再写，多次调用自动合并。
- **为什么保留 `_writeQueue`？** IndexedDB 的 `put()` 不是原子的——两个并发 `put` 到同一个 key 可能乱序。Promise 链保证写入顺序。
- **300ms 是什么依据？** 用户连续输入不会在 300ms 内触发两次 autoSave（streaming 的 token 间隔通常 > 50ms，但 autoSave 只在流结束时触发一次）。300ms 足以覆盖 title 更新的二次调用。

#### 3. `messagesRef` — 同步真相源

```typescript
// useAIChat.ts
const messagesRef = useRef<AIChatMessage[]>([]);

// 每个 setMessages 同时更新 ref
setMessages(prev => {
    const next = [...prev, newMsg];
    messagesRef.current = next;  // ← 同步更新 ref
    return next;
});

// autoSave 时从 ref 读（总是最新）
autoSave(messagesRef.current);
```

- React 的 `setMessages` 是异步的（batch 后 render）。在同一事件循环中读取 `messagesRef.current` 保证获取到最新数据。
- Title 生成是异步的（调用 LLM），完成时读取 `messagesRef.current` 可获取用户在此期间可能发送的新消息。

#### 4. Load effect 只依赖 `chatId`

```typescript
// Before (v0.10.4):
useEffect(() => {
    if (!storage || !options?.chatId) return;
    // ...
}, [options?.chatId, storage]);  // ← storage 变化→重跑

// After (v0.10.5):
useEffect(() => {
    if (!options?.chatId) return;
    // ...
}, [options?.chatId]);  // ← 只依赖 chatId
```

- `storage` 引用稳定（模块级单例），不需要作为 effect 依赖
- 移除 `storage` 后，load effect 只会在 chatId 变化时触发，不会在每次 render 时重新加载数据

---

## API 参考

### ChatService (`packages/app/src/services/chatService.ts`)

```typescript
// 初始化（在应用启动时调用一次）
initChatService(storage: ChatStorage): void

// 保存对话（debounced 300ms。空消息不写入）
saveChat(
    id: string,
    messages: AIChatMessage[],
    title?: string,
    contextUri?: string,
    context?: ChatRecord['context'],
): void

// 立即保存（跳过 debounce，用于导入/重命名）
saveChatNow(chat: ChatRecord): Promise<void>

// 加载对话
loadChat(id: string): Promise<ChatRecord | null>

// 列出所有对话摘要
listChats(): Promise<ChatSummary[]>

// 删除对话
deleteChat(id: string): Promise<void>

// 获取底层的 ChatStorage 实例（useChatHistory 使用）
getChatStorage(): ChatStorage
```

### useAIChat (`packages/app/src/hooks/useAIChat.ts`)

```typescript
function useAIChat(
    client: BskyClient | null,
    aiConfig: AIConfig,
    contextUri?: string,
    options?: UseAIChatOptions,
): {
    messages: AIChatMessage[],
    loading: boolean,
    guidingQuestions: string[],
    send: (text: string) => Promise<void>,
    stop: () => void,
    addUserImage: (data, mimeType, alt) => number,
    chatId: string,
    pendingConfirmation: { toolName, description } | null,
    confirmAction: () => void,
    rejectAction: () => void,
    undoLastMessage: () => void,
    edit: () => string | null,
    editByIndex: (n: number) => string | null,
}
```

关键变化：
- 不再接受 `options.storage` 参数（已移除）
- 不再调用 `getDefaultChatStorage()`
- 所有持久化通过 `ChatService.saveChat()` 完成
- `autoSave` 不再是 `useCallback`（依赖 `storage`），现在是普通闭包函数

### useChatHistory (`packages/app/src/hooks/useChatHistory.ts`)

```typescript
function useChatHistory(
    storage?: ChatStorage,  // 可选
): {
    conversations: ChatSummary[],
    loading: boolean,
    loadConversation: (id) => Promise<ChatRecord | null>,
    saveConversation: (chat: ChatRecord) => Promise<void>,
    deleteConversation: (id) => Promise<void>,
    refresh: () => Promise<void>,
    storage: ChatStorage,
}
```

- 不传 `storage` 时，使用 `getChatStorage()`（ChatService 的稳定引用）
- `saveConversation` 直接调用底层 `storage.saveChat()`（非 debounce），然后 `refresh()`

---

## 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `packages/app/src/services/chatService.ts` | **新文件** | 模块级单例，debounce 持久化 |
| `packages/app/src/services/chatStorage.ts` | 修改（移除工厂） | 只剩接口 + `FileChatStorage` |
| `packages/app/src/hooks/useAIChat.ts` | 重写 | 解耦存储，新增 `messagesRef` |
| `packages/app/src/hooks/useChatHistory.ts` | 修改 | 改用 `getChatStorage()` |
| `packages/app/src/index.ts` | 修改 | 导出 ChatService 符号 |
| `packages/pwa/src/App.tsx` | 修改 | `useEffect` + `initChatService` |
| `packages/pwa/src/components/AIChatPage.tsx` | 修改 | 导入 `saveChatNow` |
| `packages/tui/src/cli.ts` | 修改 | 启动时 `initChatService` |

---

## 边界情况与防护

| 场景 | 防护机制 |
|------|----------|
| 空 messages 写入 | `saveChat` 入口 `messages.length === 0 → return`；定时器触发时 `snap.messages.length === 0 → return` |
| 连续多次 autoSave | Debounce 300ms，每次重置定时器；`_latestSnapshot` 只保留最后一次 |
| Title 生成耗时超过 debounce | 第一次 saveChat（占位 title）写入 → title 生成完成 → 第二次 saveChat（正式 title）重新 debounce 写入 |
| 导入时数据量大 | `saveChatNow` 跳过 debounce，直接写入 |
| 两个对话同时 streaming | `_debounceTimers` 按 `id` 独立；`_writeQueue` 串行化但不会阻塞不同 id |
| 组件卸载时未写入 | 定时器独立于 React 生命周期，会正常触发写入；IndexedDB 事务在页面关闭时仍可完成 |
| StrictMode 双 mount | `initChatService` 有 `if (!_storage)` guard，不重复设置 |
| TUI 未显式调用 initChatService | `getStorage()` 的 fallback 自动检测 Node.js → `new FileChatStorage()` |

---

## 与 DraftStorage 的关系

本项目的存储层有两个独立系统：

| | ChatStorage (AI) | DraftStorage (草稿) |
|---|---|---|
| API | `ChatService` 模块级单例 | `setDraftStorageFactory` 工厂模式 |
| 访问方式 | 全局函数（`saveChat`、`loadChat`） | Hook 内通过 singleton 访问 |
| 写策略 | Debounce 300ms（合并多次写入） | 直接写入 |
| 多平台 | `initChatService` + idempotent guard | 工厂模式 + auto-detect fallback |
| 缓存 | `_latestSnapshot` Map | 无 |

DraftStorage 的工厂模式保留不变——草稿写入是用户主动触发的（"保存草稿"按钮），不需要 debounce 保护。ChatStorage 的写入是无感的（autoSave 在后台触发），需要 debounce 防抖。

---

## 回滚指南

如需回退到 v0.10.4 的工厂模式：

1. `git revert c831d94`（如果有冲突），或手动恢复文件：
   - 删除 `packages/app/src/services/chatService.ts`
   - 恢复 `chatStorage.ts` 的 `setChatStorageFactory`/`getDefaultChatStorage`
   - 恢复 `useAIChat.ts` 的 `saveQueueRef`/`saveVersionRef`/`storage`
   - 恢复 `useChatHistory.ts` 的 `getDefaultChatStorage`
   - 恢复 `App.tsx` 为 `setChatStorageFactory()` 渲染顶层调用
   - 恢复 `AIChatPage.tsx` 和 `cli.ts` 的导入
   - 恢复 `index.ts` 的导出
2. `pnpm -r build` → 部署

> 回滚后重新引入所有 5 个 root cause。建议只作为临时措施，长期解决方案是修复回滚的具体冲突。
