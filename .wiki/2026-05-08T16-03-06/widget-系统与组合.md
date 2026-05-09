# Widget 系统与组合

Widget 系统是该应用右侧面板的可插拔组件架构，允许不同视图绑定特定的侧边小部件，并通过模块级 store 实现跨组件通信。整个系统围绕三个核心机制展开：**注册（registry）**、**状态持久化（store + AppConfig）**、**双向桥接（bridge）**。

---

## 1. 注册机制：WidgetDefinition + render

所有 Widget 通过 `registerWidget(def, render)` 注册到全局 Map 中。定义与渲染函数分离，使得注册点可以集中管理。

```typescript
// 定义部分 — 元数据
interface WidgetDefinition {
  id: string;            // 唯一标识
  titleKey: string;      // i18n key
  icon: string;          // 图标名
  views: string[];       // 绑定视图列表，空数组 = 所有视图
  defaultOpen: boolean;  // 首次加载是否默认启用
  headerButtons?: React.ComponentType<{ goTo, onClose }>;  // 可选头部按钮
}

// 注册函数
function registerWidget(
  def: WidgetDefinition,
  render: (props: WidgetProps) => ReactNode
): void;
```

`_registry` 是模块级 `Map<string, WidgetEntry>`，不可从外部直接操作，确保注册的唯一性（同名 id 会覆盖）。[来源](packages/app/src/hooks/widgetRegistry.ts#L42-L46)

PWA 客户端在 `App.tsx` 的 `useEffect` 中完成全部注册，目前内置 6 个 Widget：

| id | titleKey | views | defaultOpen | 说明 |
|---|---|---|---|---|
| `polish` | `action.polish` | `['compose']` | ✅ | 草稿润色 |
| `profilePreview` | `widget.profilePreview` | `['thread']` | ✅ | 当前帖子作者预览 |
| `suggestedFollows` | `widget.suggestedFollows` | `[]`（全部） | ❌ | 推荐关注 |
| `suggestedFeeds` | `widget.suggestedFeeds` | `[]` | ❌ | 推荐 Feed |
| `trends` | `widget.trends` | `[]` | ❌ | 趋势话题 |
| `aiChat` | `ai.widgetTitle` | `[]` | ❌ | AI 聊天（带 `headerButtons`） |

注册发生在组件树的顶层，`useEffect([], [])` 确保只执行一次。[来源](packages/pwa/src/App.tsx#L86-L131)

---

## 2. 视图过滤：getWidgetsForView

`getWidgetsForView(viewType)` 从注册表中筛选出匹配当前视图的 Widget：

```typescript
function getWidgetsForView(viewType: string): WidgetEntry[] {
  return getWidgets().filter(
    w => w.views.length === 0 || w.views.includes(viewType)
  );
}
```

**语义**：`views: []`（空数组）表示"所有视图可见"，`views: ['compose']` 表示"仅 compose 视图可见"。这层过滤发生在 `WidgetPanel` 组件的 `useMemo` 中，保证视图切换时自动重算可用 Widget 列表。[来源](packages/app/src/hooks/widgetRegistry.ts#L56-L58)

---

## 3. 启用/禁用状态持久化

Widget 的启用状态由 `widgetStore.ts` 管理，通过 `AppConfig.enabledWidgets` 持久化到 `localStorage`。

### 模块级状态

```typescript
let _order: string[] = [];  // 有序启用列表

function enableWidget(id: string): void   // 追加到末尾
function disableWidget(id: string): void  // 从数组中移除
function toggleWidget(id: string): boolean // 切换，返回新状态
function isWidgetEnabled(id: string): boolean
```

`_order` 使用数组而非 Set，原因在注释中明确说明：**保持顺序可靠**，这直接支撑了拖拽排序的 UI 能力。[来源](packages/app/src/hooks/widgetStore.ts#L5-L7)

### 持久化链路

```
用户点击关闭/切换
  → toggleWidget(id)  →  更新模块级 _order
  → setWidgetToggleCallback 中的回调
  → 读取 getEnabledWidgetIds() → 写入 AppConfig.enabledWidgets
  → localStorage.setItem('bsky_app_config', ...)
```

回调注册在 `Layout.tsx` 的 `useEffect` 中，只要 `config` 或 `onConfigChange` 变化即重新绑定：

```typescript
setWidgetToggleCallback((id: string) => {
  const updated = { ...config, enabledWidgets: getEnabledWidgetIds() };
  saveAppConfig(updated);
  onConfigChange(updated);
});
```

[来源](packages/pwa/src/components/Layout.tsx#L84-L92)

### 初始化逻辑

`Layout.tsx` 挂载时从 `config.enabledWidgets` 恢复状态。若为空（首次使用），则自动启用所有 `defaultOpen: true` 的 Widget 并立即持久化：

```typescript
const existing = config.enabledWidgets || [];
if (existing.length > 0) {
  initEnabledWidgets(existing);
} else {
  const allWidgets = getWidgetsForView(currentView.type);
  const defaultIds = allWidgets.filter(w => w.defaultOpen).map(w => w.id);
  initEnabledWidgets(defaultIds);
  // 立即写入 localStorage
}
```

[来源](packages/pwa/src/components/Layout.tsx#L65-L81)

### AI Chat 视图的特殊处理

当导航到 `aiChat` 视图时，系统自动禁用 `aiChat` Widget 以避免重复渲染；离开时原样恢复。这个逻辑通过 `widgetOrderRef`（useRef）保存快照实现。[来源](packages/pwa/src/components/Layout.tsx#L94-L109)

---

## 4. ComposePage ↔ Widget 双向草稿同步

关键的跨组件通信桥接。ComposePage 将当前编辑的草稿文本暴露给右侧 Widget，Widget 修改后又能写回 ComposePage。

### 数据流架构

```
┌─────────────────┐      setComposeDraftForWidgets()      ┌─────────────────┐
│  ComposePage     │ ──────────────────────────────────▶  │  widgetStore     │
│  (主编辑器)       │                                      │  (模块级 _composeDraft)  │
│                  │ ◀──────────────────────────────────  │                  │
│  setPostText()   │      registerComposeDraftSetter()    │  replaceComposeDraft()  │
└─────────────────┘        (回调函数)                     └─────────────────┘
                                                                    │
                                                                    ▼
                                                          ┌─────────────────┐
                                                          │  PolishWidget    │
                                                          │  (读/写 draft)   │
                                                          └─────────────────┘
```

### 写方向（ComposePage → Widget）

`ComposePage` 在 `useEffect` 中根据当前聚焦的帖子（`polishTargetPostId`→第一个有内容的帖子→第一个帖子）将文本推入模块级变量：

```typescript
useEffect(() => {
  const targetPost = posts.find(p => p.id === polishTargetPostId)
    ?? posts.find(p => p.text.trim()) ?? posts[0];
  setComposeDraftForWidgets(targetPost?.text ?? '');
}, [posts, polishTargetPostId]);
```

[来源](packages/pwa/src/components/ComposePage.tsx#L146-L149)

### 读方向（Widget → ComposePage）

ComposePage 通过 `registerComposeDraftSetter` 注册一个回调函数，该函数接收新文本并调用 `setPostText` 写入对应帖子：

```typescript
useEffect(() => {
  registerComposeDraftSetter((text) => {
    const targetPost = posts.find(p => p.id === polishTargetPostId)
      ?? posts.find(p => p.text.trim()) ?? posts[0];
    if (targetPost) setPostText(targetPost.id, text);
  });
  return () => registerComposeDraftSetter(null);  // 清理
}, [posts, polishTargetPostId]);
```

[来源](packages/pwa/src/components/ComposePage.tsx#L151-L157)

### Widget 端的消费

`PolishWidget` 使用**双源回退策略**：优先使用 `context.composeDraft`（当 Widget 嵌入在模态框而非右侧面板时），否则回退到模块级 `getComposeDraftForWidgets()`。替换时同样优先用 `context.onComposeDraftChange`，否则调用 `replaceComposeDraft()`：

```typescript
const draft = wtContext?.composeDraft ?? getComposeDraftForWidgets();
const onReplace = wtContext?.onComposeDraftChange ?? replaceComposeDraft;
```

[来源](packages/pwa/src/components/widgets/PolishWidget.tsx#L17-L18)

这个设计让 PolishWidget 可以同时工作在**右侧面板**（走模块级 bridge）和**模态框内嵌**（走 prop context）两种场景。

---

## 5. ThreadView → ProfilePreviewWidget actor 同步

类似地，`ThreadView` 通过模块级 bridge 将当前聚焦帖子的作者 handle 暴露给 `ProfilePreviewWidget`：

```typescript
useEffect(() => {
  if (!client || !focused?.handle) {
    setIsFollowing(false);
    setFocusedProfileActor(null);
    return;
  }
  setFocusedProfileActor(focused.handle);
  // ... 同时获取关注状态
}, [client, focused?.handle]);
```

[来源](packages/pwa/src/components/ThreadView.tsx#L64-L71)

Store 端对应：

```typescript
let _focusedProfileActor: string | null = null;

function setFocusedProfileActor(actor: string | null): void {
  _focusedProfileActor = actor;
}
function getFocusedProfileActor(): string | null {
  return _focusedProfileActor;
}
```

[来源](packages/app/src/hooks/widgetStore.ts#L69-L73)

`ProfilePreviewWidget` 通过 `getFocusedProfileActor()` 读取当前 actor，进而使用 `client.getProfile()` 获取展示数据。

---

## 6. AI Chat 会话桥接

除了草稿和 profile 同步，widgetStore 还维护了一个 AI Chat 会话 ID 桥接：

```typescript
let _aiChatSessionId = '';

function initAIChatSession(): string   // 延迟初始化（首次调用才生成 UUID）
function getAIChatSessionId(): string
function setAIChatSessionId(id: string)
function resetAIChatSession(): string  // 重新生成新 UUID
```

[来源](packages/app/src/hooks/widgetStore.ts#L28-L36)

这使得 `AIChatWidget` 和全屏 `aiChat` 视图可以共享同一个会话上下文。

---

## 总结

Widget 系统的架构可以用一句话概括：**模块级 store 做状态中心 + 回调注册做跨组件桥接 + AppConfig 做持久化层**。它没有使用 React Context，而是通过 `widgetRegistry.ts`（只读注册表）和 `widgetStore.ts`（可变状态 + 桥接函数）两个模块完成全部通信，这是该应用"纯 Store + React Hook 桥接"模式的典型体现（详见 [React Hooks 架构与 Store 模式](react-hooks-架构与-store-模式.md)）。

| 关注点 | 机制 | 关键函数 |
|---|---|---|
| 注册 | `Map<string, WidgetEntry>` | `registerWidget()` |
| 视图绑定 | `views` 数组过滤 | `getWidgetsForView()` |
| 启停状态 | 模块级 `_order` 数组 | `enableWidget/disableWidget/toggleWidget` |
| 持久化 | `AppConfig.enabledWidgets` → localStorage | `setWidgetToggleCallback()` |
| 草稿桥接 | 模块级变量 + 回调 | `setComposeDraftForWidgets / replaceComposeDraft` |
| Profile 桥接 | 模块级变量 | `setFocusedProfileActor / getFocusedProfileActor` |
| AI 会话桥接 | 模块级 UUID | `initAIChatSession / resetAIChatSession` |

进一步了解 Widget 渲染层和排序交互可参考 [PWA 架构与组件映射](pwa-架构与组件映射.md)。