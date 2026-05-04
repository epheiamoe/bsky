# 聊天存储：ChatStorage 接口

## 设计动机

AI 对话需要在会话间保持连续性，这意味着聊天记录必须持久化。但运行环境决定了存储手段：Node.js 终端可以读写文件系统，浏览器只能使用 IndexedDB。**ChatStorage 接口**正是为此而生——它将持久化抽象为四个基本操作，让上层逻辑与底层存储介质彻底解耦。

[来源](packages/app/src/services/chatStorage.ts#L29-L35)

---

## 核心数据结构

### AIChatMessage：单条消息

每条消息定义为一个类型联合：

```typescript
export interface AIChatMessage {
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thinking';
  content: string;
  toolName?: string;
  isError?: boolean;
}
```

五种角色覆盖 AI 对话全场景：`user` 表示用户输入，`assistant` 是 AI 回复，`thinking` 是推理过程展示（参见 [思考模式与视觉模式](思考模式与视觉模式.md)），`tool_call`/`tool_result` 对应工具调用链（参见 [31 个 AI 工具详解](31-个-ai-工具详解.md)）。`isError` 标记异常回复。

[来源](packages/app/src/services/chatStorage.ts#L3-L7)

### ChatRecord：完整聊天记录

```typescript
export interface ChatRecord {
  id: string;
  title: string;
  contextUri?: string;
  context?: { type: 'post'; uri: string } | { type: 'profile'; handle: string };
  messages: AIChatMessage[];
  createdAt: string;
  updatedAt: string;
}
```

| 字段 | 说明 |
|------|------|
| `id` | UUID v4，由 `useAIChat` 在创建对话时生成 |
| `title` | 取第一条用户消息的前 80 个字符，默认"新对话" |
| `contextUri` | 关联的 AT URI，用于"从帖子发起对话"场景 |
| `context` | 结构化上下文，标记来源是帖子还是用户主页 |
| `messages` | 完整消息数组 |
| `createdAt` / `updatedAt` | ISO 时间戳 |

`context` 字段的设计值得注意：它区分了两种入口——`{ type: 'post', uri }` 表示从某条帖子发起对话（AI 会读取该帖），`{ type: 'profile', handle }` 表示从用户主页发起。

[来源](packages/app/src/services/chatStorage.ts#L9-L22)

### ChatSummary：列表摘要

```typescript
export interface ChatSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}
```

`messageCount` 只统计 `user` + `assistant` 角色的消息，排除工具调用和推理过程，确保摘要清爽可读。

[来源](packages/app/src/services/chatStorage.ts#L24-L28)

---

## ChatStorage 接口

四个方法构成完整的 CRUD 契约：

```typescript
export interface ChatStorage {
  saveChat(chat: ChatRecord): Promise<void>;
  loadChat(id: string): Promise<ChatRecord | null>;
  listChats(): Promise<ChatSummary[]>;
  deleteChat(id: string): Promise<void>;
}
```

[来源](packages/app/src/services/chatStorage.ts#L29-L35)

---

## 两种实现对比

| 维度 | FileChatStorage | IndexedDBChatStorage |
|------|----------------|---------------------|
| **所属包** | `@bsky/app` | `@bsky/pwa` 内部 |
| **运行环境** | Node.js (TUI) | 浏览器 (PWA) |
| **存储位置** | `~/.bsky-tui/chats/{id}.json` | IndexedDB 数据库 `bsky-chats` |
| **存储格式** | 每个 chat 一个 JSON 文件 | ObjectStore，`id` 为主键 |
| **初始化时机** | 包首次加载时惰性创建目录 | 首次读写时自动触发 `onupgradeneeded` |
| **异常处理** | 文件缺失 → 返回 `null`，目录不存在 → 返回 `[]` | 不存在 key → 返回 `null`，空库 → 返回 `[]` |

### FileChatStorage（TUI 端）

```typescript
export class FileChatStorage implements ChatStorage {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? path.join(homedir(), '.bsky-tui', 'chats');
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }
  // ...
}
```

- 默认路径为 `~/.bsky-tui/chats/`，可通过构造函数参数覆盖。
- `saveChat` 写入前自动更新 `updatedAt` 时间戳。
- `listChats` 遍历目录下全部 `.json` 文件，解析后按 `updatedAt` 降序排列。损坏文件静默跳过。
- `deleteChat` 使用 `unlinkSync` 删除文件，文件不存在不报错。

[来源](packages/app/src/services/chatStorage.ts#L36-L95)

### IndexedDBChatStorage（PWA 端）

```typescript
const DB_NAME = 'bsky-chats';
const DB_VERSION = 1;
const STORE_NAME = 'chats';
```

- 使用 `indexedDB.open()` 连接数据库，`onupgradeneeded` 时创建 `chats` 表（主键 `id`）。
- 辅助函数 `withStore(mode)` 封装了打开事务、获取 ObjectStore 的流程，消除样板代码。
- `saveChat` 使用 `put` 操作（存在则更新，不存在则新增），时间戳由调用方传入或自动生成。
- `listChats` 使用 `getAll()` 批量读取，在内存中完成摘要映射和排序。
- `deleteChat` 使用 `delete(id)` 操作。

[来源](packages/pwa/src/services/indexeddb-chat-storage.ts#L1-L60)

---

## useChatHistory Hook：连接 UI 与存储

`useChatHistory` 是 `@bsky/app` 导出的 React Hook，负责将 ChatStorage 实例变成可响应的状态：

```typescript
export function useChatHistory(storage?: ChatStorage) {
  const [conversations, setConversations] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const store = storage ?? getDefaultStorage();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await store.listChats();
      setConversations(list);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadConversation = useCallback(async (id: string) => store.loadChat(id), [store]);
  const saveConversation = useCallback(async (chat: ChatRecord) => {
    await store.saveChat(chat);
    await refresh();
  }, [store, refresh]);
  const deleteConversation = useCallback(async (id: string) => {
    await store.deleteChat(id);
    await refresh();
  }, [store, refresh]);

  return { conversations, loading, loadConversation, saveConversation, deleteConversation, refresh, storage: store };
}
```

关键设计决策：

1. **默认存储**：TUI 环境通过 `getDefaultStorage()` 惰性加载 `FileChatStorage` 单例；PWA 环境显式传入 `new IndexedDBChatStorage()`。
2. **写后刷新**：`saveConversation` 和 `deleteConversation` 在执行写操作后自动调用 `refresh()`，确保列表状态始终与持久层一致。
3. **Single Source of Truth**：所有变更都先持久化，再从持久层读回，避免内存状态与文件/数据库不一致。

[来源](packages/app/src/hooks/useChatHistory.ts#L1-L47)

---

## 自动保存：useAIChat 中的存储集成

`useAIChat` Hook 内部通过 `autoSave` 回调实现自动保存：

```typescript
const autoSave = useCallback(async (msgs: AIChatMessage[]) => {
  if (!storage) return;
  const title = msgs.find(m => m.role === 'user')?.content.slice(0, 80) ?? '新对话';
  try {
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
  } catch { /* silently fail */ }
}, [storage, contextUri, options?.onChatSaved]);
```

触发时机：

- **用户发送消息后立即保存**（先于流式响应）
- **流式响应完成后再次保存**（包含完整 AI 回复）
- **流式出错时也保存**（错误消息一并持久化）

每条消息的第一个 `user` 消息前 80 个字符成为对话标题。`onChatSaved` 回调用于通知 `useChatHistory` 刷新列表，形成完整的保存-刷新闭环。

[来源](packages/app/src/hooks/useAIChat.ts#L196-L210)

---

## 两种模式的使用方式

在 TUI 端，`AIChatView` 直接调用 `getDefaultStorage()` 获得 `FileChatStorage` 实例，两条 Hook 共享同一个实例：

```typescript
const storage = getDefaultStorage();
const { conversations, deleteConversation, refresh } = useChatHistory(storage);
const { messages, ... } = useAIChat(client, aiConfig, postContext, {
  chatId: sessionId, storage, stream: true, onChatSaved: refresh
});
```

[来源](packages/tui/src/components/AIChatView.tsx#L35-L38)

在 PWA 端，`AIChatPage` 使用 `useMemo` 延后创建 `IndexedDBChatStorage` 单例：

```typescript
const storage = useMemo(() => new IndexedDBChatStorage(), []);
```

[来源](packages/pwa/src/components/AIChatPage.tsx#L24)

---

## 架构启示

ChatStorage 的设计遵循了 [三层架构设计](三层架构设计.md) 的分层原则：

- **Core 层**完全不感知持久化——`AIAssistant` 只处理消息流和工具调用
- **App 层**定义接口并提供一种默认实现（FileChatStorage），`useChatHistory` 和 `useAIChat` 负责编排
- **PWA 层**提供替代实现（IndexedDBChatStorage），通过依赖注入无缝替换

这种模式使得新增存储后端（如 SQLite、云同步）时，只需实现 `ChatStorage` 接口的四个方法，无需改动任何业务逻辑。