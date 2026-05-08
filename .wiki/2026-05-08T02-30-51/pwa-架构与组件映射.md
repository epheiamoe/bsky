# PWA 架构与组件映射

PWA 客户端（`@bsky/pwa`）与 TUI 客户端共享 100% 的业务逻辑——所有数据流、AI 引擎、认证、导航状态、草稿管理均来自 `@bsky/app` 包。差异仅在渲染层：PWA 使用 **React DOM + Tailwind CSS**，TUI 使用 **Ink（React for Terminal）**。理解这层映射，是掌握双界面架构的关键。

---

## 核心架构：AppView 联合类型

两个客户端的导航状态统一由 `AppView` 联合类型描述，定义在 `packages/app/src/state/navigation.ts`：

```typescript
export type AppView =
  | { type: 'feed'; feedUri?: string }
  | { type: 'detail'; uri: string }
  | { type: 'thread'; uri: string }
  | { type: 'compose'; replyTo?: string; quoteUri?: string; draftId?: string }
  | { type: 'profile'; actor: string; profileTab?: string }
  | { type: 'notifications' }
  | { type: 'search'; query?: string; searchTab?: string }
  | { type: 'aiChat'; contextUri?: string; sessionId?: string; contextPost?: string; contextProfile?: string }
  | { type: 'bookmarks' }
  | { type: 'drafts' }
  | { type: 'components' }
  | { type: 'dm' }
  | { type: 'dmChat'; conversationId: string }
  | { type: 'lists'; actor?: string }
  | { type: 'listDetail'; uri: string; tab?: 'posts' | 'members' }
  | { type: 'about' };
```

[来源](packages/app/src/state/navigation.ts#L1-L17)

PWA 的 `App.tsx` 使用 `switch` 对 `currentView.type` 做分发，每个 `case` 渲染对应页面组件；TUI 的 `App.tsx` 做法完全相同。[来源](packages/pwa/src/App.tsx#L224-L331)

---

## 组件映射表：PWA ↔ TUI

下表中，"PWA 组件" 列列出 `packages/pwa/src/components/` 下的 React DOM 组件，"TUI 对应" 列列出 TUI 中等效的 Ink 组件或视图（来自 `@bsky/tui` 包），"路由路径" 列显示 `useHashRouter` 编码后的 URL 模式。

| PWA 组件 | TUI 对应 | AppView.type | 路由路径 |
|---|---|---|---|
| `LoginPage` | 无（TUI 使用 `.env`） | — | `/`（未登录） |
| `FeedTimeline` | `FeedView`（ink-box 列表） | `feed` | `#/feed?feed=...` |
| `ThreadView` | `ThreadView`（ink-box 树） | `thread` | `#/thread?uri=...` |
| `ComposePage` | `ComposeView`（ink-text-input） | `compose` | `#/compose?replyTo=...` |
| `AIChatPage` | `AIChatView`（ink-box 对话） | `aiChat` | `#/ai?session=...&post=...` |
| `ProfilePage` | `ProfileView`（ink-box） | `profile` | `#/profile?actor=...` |
| `SearchPage` | `SearchView` | `search` | `#/search?q=...` |
| `NotifsPage` | `NotificationsView` | `notifications` | `#/notifications` |
| `BookmarkPage` | `BookmarksView` | `bookmarks` | `#/bookmarks` |
| `ListsPage` | `ListsView` | `lists` | `#/lists?actor=...` |
| `ListDetailPage` | — | `listDetail` | `#/list?uri=...` |
| `ConvoListPage` | `DMsView` | `dm` | `#/dm` |
| `DMChatPage` | `DMChatView` | `dmChat` | `#/dm?conv=...` |
| `DraftsPage` | `DraftsView` | `drafts` | `#/drafts` |
| `AboutPage` | — | `about` | `#/about` |
| `ComponentsPage` | — | `components` | `#/components` |

[来源](packages/pwa/src/App.tsx#L224-L331) | [来源](packages/pwa/src/hooks/useHashRouter.ts#L76-L163)

底层容器的映射关系：

| TUI (Ink) | PWA (React DOM) |
|---|---|
| `<Box>` | `<div>` |
| `<Text>` | `<span>` / `<p>` |
| `useInput` | `onClick` / `onKeyDown` |
| `ink-text-input` | `<input>` / `<textarea>` |
| `borderStyle="single"` | `border: 1px solid` CSS |
| `color="cyan"` | `color: #00FFFF` CSS |

[来源](docs/PWA_GUIDE.md#L128-L138)

---

## useHashRouter：将 AppView 编码为 #/path URL

PWA 使用 **`useHashRouter`**（而非传统的 React Router）实现导航，原因是 PWA 部署在静态托管上（Cloudflare Pages、Netlify），不支持服务端 `pushState` fallback。哈希路由确保任意 URL 刷新后仍能定位到正确视图。[来源](packages/pwa/src/hooks/useHashRouter.ts#L6-L20)

### 编码规则

`encodeView(view)` 将 `AppView` 对象映射为哈希 URL。核心模式是 `#/{path}?{params}`：

```
feed     → #/feed?feed=at://... (默认: following/discover)
thread   → #/thread?uri=at://did:plc:xxx/app.bsky.feed.post/yyy
profile  → #/profile?actor=did:plc:xxx&tab=posts
compose  → #/compose?replyTo=at://...&quoteUri=...&draftId=...
aiChat   → #/ai?session=uuid&post=at://...&profile=did:plc:...
search   → #/search?q=关键词&tab=top
bookmarks→ #/bookmarks
lists    → #/lists?actor=did:plc:...
list     → #/list?uri=at://...&tab=members
dm       → #/dm (或 #/dm?conv=convId 单聊)
```

[来源](packages/pwa/src/hooks/useHashRouter.ts#L165-L239)

### contextPost / contextProfile 持久化

AI 聊天页面的上下文注入最关键的两个参数——`contextPost` 和 `contextProfile`——被编码为 URL 参数 `&post=` 和 `&profile=`，确保页面刷新后不丢失：

```typescript
// encodeView — aiChat 分支
case 'aiChat': {
  if (view.sessionId) {
    let url = `#/ai?session=${encodeURIComponent(view.sessionId)}`;
    if (post) url += `&post=${encodeURIComponent(post)}`;
    if (profile) url += `&profile=${encodeURIComponent(profile)}`;
    return url;
  }
  // ...旧版 contextUri 兜底
}
```

[来源](packages/pwa/src/hooks/useHashRouter.ts#L224-L235)

解析时，`parseHash` 从参数中恢复：

```typescript
case '/ai': {
  const session = params.get('session');
  const post = params.get('post');
  const profile = params.get('profile');
  if (session) {
    const view: AppView = { type: 'aiChat', sessionId: decodeURIComponent(session) };
    if (post) (view as { contextPost?: string }).contextPost = decodeURIComponent(post);
    if (profile) (view as { contextProfile?: string }).contextProfile = decodeURIComponent(profile);
    return view;
  }
  // ...
}
```

[来源](packages/pwa/src/hooks/useHashRouter.ts#L147-L159)

这解决了 v0.3.0 之前"刷新页面后上下文丢失"的问题。[来源](docs/AI_CONTEXT.md#L233-L234)

### pushState + popstate 驱动

`useHashRouter` 通过 `window.history.pushState` 写入导航，通过 `popstate` 事件监听浏览器前进/后退：

```typescript
window.addEventListener('popstate', handler);
// goTo 时 pushState，goBack 时 history.back()
```

[来源](packages/pwa/src/hooks/useHashRouter.ts#L42-L44) | [来源](packages/pwa/src/hooks/useHashRouter.ts#L60-L64)

---

## 事件处理差异：TUI 的 useInput vs PWA 的 onClick/onKeyDown

| 维度 | TUI (Ink) | PWA (React DOM) |
|---|---|---|
| 输入模型 | 键盘优先，全局 `useInput` 捕获按键流 | 鼠标/触摸优先，`onClick` + 表单 `onKeyDown` |
| 滚动 | 上下箭头 / `jk` 逐行滚动 | 触摸滚动 / 鼠标滚轮 / `@tanstack/react-virtual` |
| 返回 | `Esc` | 浏览器返回按钮 / 页面内 `←` 按钮（`goBack`） |
| 回复 | `R` 键 | 点击 `Reply` 按钮（`PostActionsRow`） |
| 翻译 | `T` 键 | 点击 `Translate` 按钮 |
| 展开线程 | `H` 键 | 点击帖子卡片 → `goTo({ type: 'thread', uri })` |
| AI 分析 | `A` 键 → AI 面板 | 点击 AI 按钮 → `goTo({ type: 'aiChat', ... })` |
| 发帖 | 输入 `:p` 命令 | 点击 `Compose` 按钮 → 弹出 Composer |
| 输入焦点 | `Tab` 切换焦点 | 鼠标点击聚焦 `<input>` / `<textarea>` |

[来源](docs/PWA_GUIDE.md#L112-L127) | [来源](packages/pwa/src/components/FeedTimeline.tsx#L154-L156) | [来源](packages/pwa/src/components/AIChatPage.tsx#L155-L163)

PWA 的 `AIChatPage` 中，`onKeyDown` 处理 Enter 发送消息（Shift+Enter 换行）：[来源](packages/pwa/src/components/AIChatPage.tsx#L155-L163)

```typescript
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  },
  [handleSend],
);
```

对比 TUI 中 `useInput` 的全局按键分发，PWA 的事件绑定在具体 DOM 元素上，利用事件冒泡机制。这意味着 PWA 天然支持多焦点区域（多个 `<input>`、`<textarea>`、`<button>`），而 TUI 需要手动管理焦点栈。

---

## AI 上下文注入架构

PWA 与 TUI 在上下文注入上的架构完全一致，由 `useAIChat` 的三个 Effect 分工驱动。完整的架构流程图参见 [](ai-上下文注入机制.md)（原 `docs/AI_CONTEXT.md`）：

```
点击 AI 按钮 (ThreadView/ProfilePage/PostActionsRow)
    │  goTo({ type: 'aiChat', sessionId: uuid, contextPost: uri })
    ▼
useHashRouter.encodeView → 编码到 URL
    │  #/ai?session=uuid&post=at://did:plc:xxx/app.bsky.feed.post/yyy
    ▼
App.tsx → AIChatPage
    │  contextPost / contextProfile 作为 props 传入
    ▼
useAIChat(client, aiConfig, contextUri?, options?)
    │
    ├─► Effect 1 (chatId 变化): 清空 + 注入 system prompt + 引导问题
    │
    ├─► Effect 2 (storage restore): 从 IndexedDB 恢复 context
    │
    ├─► Effect 3 (client 就绪): tools 初始化 + context 变化时重新注入
    │
    └─► Auto-start Effect: 仅 profile 上下文 → 自动发送分析消息
```

[来源](docs/AI_CONTEXT.md#L5-L26)

PWA 与 TUI 在传递 context 时的差异在于：TUI 将 `contextPost` 作为 `useAIChat` 的第三个参数（`contextUri`）传入；PWA 将第三个参数设为 `undefined`，全部通过 `options.contextPost` / `options.contextProfile` 传入。两种方式均有效。[来源](docs/AI_CONTEXT.md#L237)

---

## 推荐阅读

- [导航与状态管理](导航与状态管理.md) — `AppView` 联合类型的纯状态机实现
- [React Hooks 架构与 Store 模式](react-hooks-架构与-store-模式.md) — `@bsky/app` 的 Hook 桥接模式
- [AI Chat 与聊天历史](ai-chat-与聊天历史.md) — `useAIChat` 的双模式流式/非流式实现
- [PWA 存储与离线能力](pwa-存储与离线能力.md) — IndexedDB 聊天存储、localStorage 配置持久化
- [国际化（i18n）与主题](国际化-i18n-与主题.md) — 三语言切换、CSS 变量暗色模式在 PWA 中的应用