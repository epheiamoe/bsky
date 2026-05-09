# PWA 存储与离线能力

PWA 客户端面临一个核心挑战：浏览器中没有文件系统、没有 `os.homedir()`、没有 `fs.writeFileSync()`。TUI 依赖的这些 Node.js 原生能力在浏览器上下文中全部失效。因此，PWA 必须在浏览器提供的替代存储介质上重建相同的持久化语义。整个存储架构围绕两条主线展开：**结构化数据 → IndexedDB**，**轻量配置 → localStorage**，中间层由 **Service Worker** 提供网络离线兜底。

---

## IndexedDB：浏览器中的结构化存储引擎

IndexedDB 是浏览器内建的对象存储数据库，支持键值存取、事务、索引和游标。PWA 用它将 TUI 的 JSON 文件存储迁移为浏览器原生数据库操作。

### 聊天存储：IndexedDBChatStorage

`IndexedDBChatStorage` 实现了 `@bsky/app` 导出的 `ChatStorage` 接口，该接口定义四个方法：

```typescript
export interface ChatStorage {
  saveChat(chat: ChatRecord): Promise<void>;
  loadChat(id: string): Promise<ChatRecord | null>;
  listChats(): Promise<ChatSummary[]>;
  deleteChat(id: string): Promise<void>;
}
```
[来源](packages/app/src/services/chatStorage.ts#L33-L38)

**数据库模式**：单一数据库 `bsky-chats`（version 1），包含一个名为 `chats` 的对象存储，以 `id` 为主键。`openDB()` 函数在 `onupgradeneeded` 事件中按需创建该存储——这是 IndexedDB 标准的版本升级模式，确保多次打开不会重复创建。
[来源](packages/pwa/src/services/indexeddb-chat-storage.ts#L3-L19)

**事务封装**：`withStore()` 辅助函数封装了打开数据库、创建事务、获取对象存储的完整链路，将三步骤压缩为一个 Promise：

```typescript
function withStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db => {
    const tx = db.transaction(STORE_NAME, mode);
    return tx.objectStore(STORE_NAME);
  });
}
```
[来源](packages/pwa/src/services/indexeddb-chat-storage.ts#L21-L26)

四个方法的实现与 TUI 的 `FileChatStorage` 形成严格对应：

| 方法 | `FileChatStorage`（TUI） | `IndexedDBChatStorage`（PWA） |
|------|--------------------------|-------------------------------|
| `saveChat` | `fs.writeFileSync` 写入 JSON 文件 | `store.put()` 写入对象存储，自动填充 `updatedAt` |
| `loadChat` | `fs.readFileSync` 读取并 parse JSON | `store.get(id)` 返回 `ChatRecord \| null` |
| `listChats` | 遍历目录读取所有 `.json` 文件，过滤 messageCount，按 `updatedAt` 降序 | `store.getAll()` 结果集上执行同样的过滤和排序 |
| `deleteChat` | `fs.unlinkSync` 删除文件 | `store.delete(id)` |

[来源](packages/pwa/src/services/indexeddb-chat-storage.ts#L28-L76)

两个实现的关键差异在于：`FileChatStorage` 在构造函数中立即创建目录（同步操作），而 `IndexedDBChatStorage` 采用懒初始化——数据库连接在第一次方法调用时才建立，因为 `indexedDB.open` 是异步的。
[来源](packages/app/src/services/chatStorage.ts#L40-L48)

在组件中，`IndexedDBChatStorage` 在 `useMemo` 内实例化一次：

```typescript
// AIChatPage.tsx
const storage = useMemo(() => new IndexedDBChatStorage(), []);
```
[来源](packages/pwa/src/components/AIChatPage.tsx#L23)

综合理解可参阅 [AI Chat 与聊天历史](ai-chat-与聊天历史.md) 中关于 `ChatStorage` 接口和 `useChatHistory`  Hook 的完整说明。

### 草稿存储：IndexedDBDraftStorage

`IndexedDBDraftStorage` 实现了 `DraftStorage` 接口，采用与聊天存储相同的 IndexedDB 模式，但使用独立的数据库 `bsky_drafts` 和存储名称 `drafts`。一个值得注意的差异：它缓存了数据库连接 Promise（`dbPromise`），避免每次操作都重新 `openDB`。
[来源](packages/pwa/src/services/indexeddb-draft-storage.ts#L21-L26)

```typescript
export class IndexedDBDraftStorage implements DraftStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDB();
    return this.dbPromise;
  }
  // ...
}
```

注册方式：PWA 的 `App.tsx` 在组件顶部调用 `setDraftStorageFactory(() => new IndexedDBDraftStorage())`。这个工厂模式允许 `@bsky/app` 的 `getDefaultDraftStorage()` 根据运行环境自动选择实现——浏览器中使用 IndexedDB，Node.js 中使用 `FileDraftStorage`。
[来源](packages/pwa/src/App.tsx#L38)
[来源](packages/app/src/services/draftStorage.ts#L72-L100)

详细背景可查阅 [发帖与草稿管理](发帖与草稿管理.md) 中关于 `DraftStorage` 接口和双存储策略的讨论。

---

## localStorage：轻量配置持久化

与 IndexedDB 承载的"大量、结构化"数据不同，配置项数据量小、读写频繁、结构简单，因此使用 `localStorage` 更合适。

### 会话持久化（useSessionPersistence）

`getSession()`、`saveSession()`、`clearSession()` 三个函数在 `localStorage` 的 `bsky_session` 键下存取 `StoredSession`（包含 `accessJwt`、`refreshJwt`、`handle`、`did`）。此处的 JWT 令牌是 PWA 与 TUI 共享的认证产物，生命周期管理逻辑完全一致。
[来源](packages/pwa/src/hooks/useSessionPersistence.ts#L1-L26)

PWA 的 `App.tsx` 在挂载时调用 `getSession()` 读取保存的会话，然后通过 `restoreSession()` 重新初始化 `BskyClient`；登录成功后，`session` 被序列化回 `localStorage`；认证出错时（如长时间休眠后令牌过期），`clearSession()` 被调用，将用户退回登录页。
[来源](packages/pwa/src/App.tsx#L155-L187)

完整的认证流程详见 [认证与会话管理](认证与会话管理.md)。

### 应用配置（useAppConfig）

`bsky_app_config` 键下存储整个 `AppConfig` 对象，涵盖所有用户可调的设置项：

| 字段 | 默认值 | 用途 |
|------|--------|------|
| `aiConfig.apiKey` | `''` | AI 服务 API 密钥 |
| `aiConfig.baseUrl` | `'https://api.deepseek.com'` | AI 服务端点 |
| `aiConfig.model` | `'deepseek-v4-flash'` | 默认模型 |
| `targetLang` | `'zh'` | 翻译目标语言 |
| `translateMode` | `'simple'` | 翻译模式（simple/json） |
| `darkMode` | `false` | 暗色主题开关 |
| `thinkingEnabled` | `true` | AI 思考过程开关 |
| `visionEnabled` | `false` | 多模态视觉开关 |
| `apiKeys` | `{}` | 按 provider ID 存储的独立 API 密钥 |
| `scenarioModels` | `{ aiChat: '', translate: '', polish: '' }` | 按场景的模型覆盖（`provider/model` 格式） |
| `enabledWidgets` | `[]` | 右侧面板启用的 widget ID 列表 |

[来源](packages/pwa/src/hooks/useAppConfig.ts#L5-L42)

写入配置使用 `saveAppConfig()`（全量覆盖）或 `updateAppConfig()`（部分更新）。读取时，`getAppConfig()` 将 `localStorage` 中的数据与 `DEFAULT_CONFIG` 做浅合并，确保新版本新增的字段不会导致前端读取 `undefined`。
[来源](packages/pwa/src/hooks/useAppConfig.ts#L44-L63)

配置项的实际使用入口位于 `Layout.tsx` 的 `SettingsModal` 组件中，用户在此修改 AI 配置、语言、主题等。`App.tsx` 则通过 `resolveScenarioConfig()` 将 `scenarioModels` 字符串（如 `"deepseek/deepseek-chat"`）解析为完整的 `AIConfig` 对象，注入各页面。
[来源](packages/pwa/src/App.tsx#L56-L74)

PWA_GUIDE.md 给出了一个极简配置模板，仅包含 `aiConfig` 和 `targetLang`：
[来源](docs/PWA_GUIDE.md#L204-L213)

```typescript
const config: { aiConfig: AIConfig; targetLang: string } = {
  aiConfig: {
    apiKey: localStorage.getItem('ai_api_key') ?? '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  },
  targetLang: localStorage.getItem('target_lang') ?? 'zh',
};
```

生产代码在此基础上扩展了翻译模式、暗色主题、多 provider 密钥管理和场景模型覆盖。

---

## Node.js 垫片（stubs）：浏览器兼容中的"死代码"

`packages/pwa/src/stubs/` 目录下有三个文件，分别垫片了 Node.js 的 `fs`、`path`、`os` 模块：

```typescript
// stubs/fs.ts
export const existsSync = () => false;
export const mkdirSync = () => {};
export const writeFileSync = () => {};
export const readFileSync = () => '';
export const readdirSync = () => [];
export const unlinkSync = () => {};
```
[来源](packages/pwa/src/stubs/fs.ts#L1-L7)

```typescript
// stubs/os.ts
export const homedir = () => '/';
```
[来源](packages/pwa/src/stubs/os.ts#L1-L2)

```typescript
// stubs/path.ts
export const join = (...args: string[]) => args.join('/');
```
[来源](packages/pwa/src/stubs/path.ts#L1-L2)

这些垫片的存在原因是 `@bsky/app` 中的 `FileChatStorage` 和 `FileDraftStorage` 在顶层导入了 `fs`、`path`、`os`（参见 `chatStorage.ts` 和 `draftStorage.ts` 的 import 语句）。Vite 在打包 PWA 时会将 `@bsky/app` 中的代码 bundle 进来，如果 Node.js 内置模块没有垫片，构建会失败。

关键在于：**这些垫片永远不应该被真正调用**。PWA 通过 `setDraftStorageFactory(() => new IndexedDBDraftStorage())` 覆盖了默认存储工厂，因此运行时走的是 `IndexedDBDraftStorage` 而非 `FileDraftStorage`。ChatStorage 则在组件层直接实例化 `IndexedDBChatStorage`，不会触及 `FileChatStorage`。垫片只是满足打包器的模块解析需求。

Vite 配置中通过 `resolve.alias` 将这些垫片映射到 Node 模块名：

```typescript
// vite.config.ts (推断)
resolve: {
  alias: {
    fs: '/src/stubs/fs.ts',
    path: '/src/stubs/path.ts',
    os: '/src/stubs/os.ts',
  }
}
```

---

## Service Worker：网络离线兜底

`public/sw.js` 实现了三层缓存策略，按请求来源分级处理：

```
请求来源          → 缓存策略        → 说明
─────────────────────────────────────────────────
cdn.bsky.app     → cache-first      → 内容寻址图片，不可变
fonts.gstatic.com → cache-first     → 字体文件，极少变更
fonts.googleapis.com → stale-while-revalidate  → 字体 CSS，需偶尔更新
bsky.social / API → network-first   → 始终获取最新数据，离线时降级
/assets/* /icons/* → cache-first    → 哈希文件名，内容不可变
/ → root HTML     → stale-while-revalidate  → 快速首屏，后台更新
```
[来源](packages/pwa/public/sw.js#L31-L72)

**network-first** 策略对 API 请求最关键：优先从网络获取，失败时从缓存读取，若缓存也无则返回 503 错误。这使得 PWA 在离线状态下至少能展示已加载过的内容，但写操作（发帖、点赞等）在离线时将无法执行。
[来源](packages/pwa/public/sw.js#L77-L92)

**Install 事件** 缓存了静态外壳（`./`、`index.html`、`manifest.json`），**Activate 事件** 清理旧版本缓存。缓存版本号 `CACHE_NAME = 'bsky-v3'` 在部署新版本时递增，触发全量更新。
[来源](packages/pwa/public/sw.js#L7-L28)

`manifest.json` 声明了 `display: "standalone"`、主题色 `#00A5E0` 和三种尺寸的图标，使 PWA 可以安装到用户设备主屏幕。
[来源](packages/pwa/public/manifest.json#L1-L30)

---

## 存储架构全景

```
                    PWA 存储分层
                    
  ┌──────────────────────────────────────┐
  │           React 组件层               │
  │  (AIChatPage, ComposePage, Layout)   │
  └──────────┬───────────────┬───────────┘
             │               │
     ┌───────▼───────┐ ┌────▼────┐
     │ IndexedDB     │ │localStorage      │
     │               │ │                   │
     │ bsky-chats    │ │ bsky_session      │
     │   → chats     │ │ bsky_app_config   │
     │               │ │                   │
     │ bsky_drafts   │ └───────────────────┘
     │   → drafts    │
     └───────────────┘
             │
     ┌───────▼───────┐
     │ Service Worker │  (Cache API)
     │ 离线资源兜底    │
     └───────────────┘
```

IndexedDB 主要负责"用户生成数据"——聊天记录和草稿；localStorage 负责配置与认证凭证；Service Worker 的 Cache API 负责网络资源的离线可用性。三者互不重叠，共同构成 PWA 的全栈持久化方案。

关于各存储上层 Hook 的详细数据流，可参阅 [React Hooks 架构与 Store 模式](react-hooks-架构与-store-模式.md)。PWA 的完整部署与离线体验请见 [PWA 部署指南](pwa-部署指南.md)。