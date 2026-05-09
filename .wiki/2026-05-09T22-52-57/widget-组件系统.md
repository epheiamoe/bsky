# Widget 组件系统

Widget 组件系统是 PWA 右侧边栏（lg+ 390px）的扩展功能体系。它在不离开当前页面的前提下，为用户提供推荐的关注/动态源、趋势话题、帖文润色、资料预览和 AI 对话等辅助能力。整个系统围绕 **组件注册表**（widget registry）和 **启用状态管理**（widget store）两条主线展开，通过模块级共享状态实现跨组件通信。

---

## 注册机制：`registerWidget`

所有 Widget 在启动时通过 `registerWidget` 注册到全局 `Map<string, WidgetEntry>` 中。注册发生在 `App.tsx` 的 `useEffect` 内，仅执行一次：

```typescript
registerWidget({ id, titleKey, icon, views, defaultOpen }, render)
```

注册的信息分为两部分：

| 字段 | 含义 |
|------|------|
| `id` | 唯一标识符，用于启停和排序索引 |
| `titleKey` | i18n 键，渲染 WidgetPanel header 的显示名 |
| `icon` | 图标名称，映射到 PWA 的 `Icon` 组件 |
| `views` | 可见范围。空数组 `[]` 表示全部视图，`['compose']` 表示仅发帖页 |
| `defaultOpen` | 首次加载时是否默认启用 |
| `headerButtons?` | 可选的 React 组件，渲染在 header 的箭头按钮左侧 |

render 函数接收 `WidgetProps`（含 `onClose` 和 `context`），负责渲染纯内容区域——WidgetPanel 统一提供 header（icon + title + 上/下箭头 + 关闭按钮），Widget 不重复绘制标题和关闭按钮。

[来源](packages/app/src/hooks/widgetRegistry.ts#L42-L46)

`getWidgetsForView(viewType)` 根据当前视图类型过滤可用 Widget：如果 `views` 为空数组则返回全部，否则返回 `views` 包含该视图类型的 Widget。WidgetPanel 和 ComponentsPage 依赖此函数确定"当前视图下哪些 Widget 可展示"。

[来源](packages/app/src/hooks/widgetRegistry.ts#L56-L58)

---

## 启用状态管理：模块级数组 + localStorage 持久化

Widget 的启用/关闭状态由 `packages/app/src/hooks/widgetStore.ts` 管理。核心数据结构是一个模块级字符串数组 `_order`，它同时承载两重职责：**启用集合**（哪些 Widget 开着）和 **渲染顺序**（按数组顺序排列）。

```typescript
let _order: string[] = [];
```

### 状态操作函数

| 函数 | 行为 |
|------|------|
| `initEnabledWidgets(ids)` | 替换 `_order` 为指定数组 |
| `getEnabledWidgetIds()` | 返回 `_order` 的副本 |
| `isWidgetEnabled(id)` | 检查 `_order.includes(id)` |
| `enableWidget(id)` | 若注册表中存在且未启用，追加到数组末尾 |
| `disableWidget(id)` | 从数组中过滤掉该 id |
| `toggleWidget(id)` | 切换启用/关闭，并通过回调触发持久化 |

[来源](packages/app/src/hooks/widgetStore.ts#L1-L53)

### 持久化链路

两端触发持久化：

1. **Layout 组件挂载时**：从 `config.enabledWidgets`（来自 `localStorage`）读取，若为空则自动启用所有 `defaultOpen: true` 的 Widget，并写入 `saveAppConfig()`。
2. **任何 toggle 操作后**：`toggleWidget()` 调用 `setWidgetToggleCallback` 注册的持久化函数 → `saveAppConfig({ ...appConfig, enabledWidgets: getEnabledWidgetIds() })`。

```typescript
// Layout.tsx
setWidgetToggleCallback((id: string) => {
  const updated = { ...config, enabledWidgets: getEnabledWidgetIds() };
  saveAppConfig(updated);
  onConfigChange(updated);
});
```

[来源](packages/pwa/src/components/Layout.tsx#L84-L92)

### 排序管理

ComponentsPage（`#/components`）提供 ↑↓ 箭头按钮，调用 `moveWidget(fromIdx, toIdx)` 对 `_order` 数组执行 splice 交换，然后立即持久化。排序索引使用完整的 `enabledIds.indexOf(w.id)`（即 `_order` 中的物理索引），而非过滤后的视觉索引——因为 `view-limited` Widget 在特定视图中被排除后，视觉索引会发生偏移，用物理索引才能保证箭头操作的准确性。

[来源](packages/pwa/src/components/ComponentsPage.tsx#L22-L29)

---

## 六个内置 Widget

六个 Widget 在 `App.tsx` 的 `useEffect` 中注册，分布在 `packages/pwa/src/components/widgets/` 目录下：

| Widget | id | views | defaultOpen | 职责 |
|--------|----|-------|-------------|------|
| Polish | `polish` | `['compose']` | ✅ | 调用 AI 润色当前草稿 |
| ProfilePreview | `profilePreview` | `['thread']` | ✅ | 展示当前帖子作者的资料预览 |
| SuggestedFollows | `suggestedFollows` | `[]` (全部) | ❌ | 推荐关注用户 |
| SuggestedFeeds | `suggestedFeeds` | `[]` (全部) | ❌ | 推荐动态源，显示订阅/取消订阅状态 |
| Trends | `trends` | `[]` (全部) | ❌ | 趋势话题 |
| AIChat | `aiChat` | `[]` (全部) | ❌ | 侧边栏 AI 对话，含 headerButtons |

[来源](packages/pwa/src/App.tsx#L92-L134)

### PolishWidget：ComposePage 草稿桥接

PolishWidget 展示当前草稿的摘要（前 120 字符），用户输入润色要求后调用 `polishDraft` AI 函数，结果可通过 "Replace" 按钮写回草稿。数据获取采用**两级回退**策略：

1. 优先从 `context.composeDraft`（WidgetProps 传入的上下文）读取
2. 回退到模块级 `getComposeDraftForWidgets()`（从 `widgetStore.ts` 的 `_composeDraft` 读取）

写入时同理：先尝试 `context.onComposeDraftChange`，否则使用 `replaceComposeDraft`（调用 `_composeDraftSetter`）。

[来源](packages/pwa/src/components/widgets/PolishWidget.tsx#L16-L19)

这个桥接机制由 `widgetStore.ts` 的四行模块级变量支撑：

```typescript
let _composeDraft = '';
let _composeDraftSetter: ((text: string) => void) | null = null;
```

ComposePage 在每次草稿变化时调用 `setComposeDraftForWidgets(text)` 更新模块级草稿，并在挂载时通过 `registerComposeDraftSetter(fn)` 注册写入函数。WidgetPanel 渲染 PolishWidget 时传入 `context.composeDraft`，后者优先级高于模块级变量，适用于 WidgetModal 弹出模式。

[来源](packages/app/src/hooks/widgetStore.ts#L60-L67)

### AIChatWidget：持久化会话 + headerButtons

AIChatWidget 在右侧边栏中提供一个完整的 AI 对话界面。它的关键设计是**会话持久化**：通过 `getAIChatSessionId()` 读取模块级 `_aiChatSessionId`，若不存在则调用 `resetAIChatSession()` 生成新的 UUID。这个 ID 在页面刷新后仍可通过 `IndexedDBChatStorage` 恢复历史消息。

[来源](packages/app/src/hooks/widgetStore.ts#L28-L36)

Widget 的 headerButtons 区域渲染两个按钮：

1. **Open in full page**：调用 `goTo({ type: 'aiChat', sessionId })` 并 `onClose()`，跳转到全屏 AIChatPage
2. **New chat**：调用 `resetAIChatSession()` + 递增 `widgetKey` 强制重挂载组件

这两个按钮通过模块级可变对象 `_widgetCallbacks` 与 Widget body 通信——WidgetPanel 渲染 header 时调用 `AIChatHeaderButtons` 组件，后者读取 `_widgetCallbacks` 获取 `onNewChat` 和 `chatId`。

[来源](packages/pwa/src/components/widgets/AIChatWidget.tsx#L90-L99)

### ProfilePreviewWidget：ThreadView 资料桥接

ProfilePreviewWidget 在帖子详情页（thread view）显示当前聚焦帖子的作者资料。它通过模块级变量 `_focusedProfileActor` 获取目标用户的 DID/handle，这个变量由 ThreadView 在导航到某条帖子时通过 `setFocusedProfileActor(actor)` 设置。

[来源](packages/app/src/hooks/widgetStore.ts#L69-L73)

---

## AIChatPage 进入时自动禁用 AI Widget

当用户导航到 `#/ai` 全屏对话页时，AI Widget（侧边栏版本）与 AIChatPage 同时存在会导致两个对话实例竞争状态、显示重复内容。因此 Layout 组件在 `currentView.type === 'aiChat'` 时自动禁用 `aiChat` Widget：

```typescript
useEffect(() => {
  if (currentView.type === 'aiChat') {
    const current = getEnabledWidgetIds();
    if (current.includes('aiChat')) {
      widgetOrderRef.current = current;      // 保存完整列表
      disableWidget('aiChat');               // 临时移除
      setWidgetTick(t => t + 1);
    }
  } else if (widgetOrderRef.current.length > 0) {
    initEnabledWidgets(widgetOrderRef.current); // 离开时恢复
    widgetOrderRef.current = [];
    setWidgetTick(t => t + 1);
  }
}, [currentView.type]);
```

关键细节：**离开 AIChatPage 时自动恢复**。`widgetOrderRef` 保存进入前的完整 Widget 顺序，当 `currentView.type` 从 `'aiChat'` 变为其他值时，调用 `initEnabledWidgets(widgetOrderRef.current)` 恢复原始状态。

[来源](packages/pwa/src/components/Layout.tsx#L94-L109)

此外，AIChatPage 自身提供了一个 **"Open in Widgets"** 按钮（仅在大屏视口显示），点击后调用 `enableWidget('aiChat')` 重新启用 AI Widget，然后 `goTo({ type: 'feed' })` 回到时间线——用户可以从侧边栏继续对话。

[来源](packages/pwa/src/components/AIChatPage.tsx#L467-L474)

---

## 架构总览

```mermaid
flowchart TB
    subgraph Registry[注册表 - widgetRegistry.ts]
        REG[Map<string, WidgetEntry>]
        RW[registerWidget]
        GV[getWidgetsForView]
    end

    subgraph Store[启用状态 - widgetStore.ts]
        ORDER[_order: string[]]
        EW[enableWidget]
        DW[disableWidget]
        TW[toggleWidget]
        CB[setWidgetToggleCallback]
        CD[_composeDraft / _composeDraftSetter]
        AI[_aiChatSessionId]
        PA[_focusedProfileActor]
    end

    subgraph Persistence[持久化]
        CFG[config.enabledWidgets]
        LS[localStorage]
        SAVE[saveAppConfig]
    end

    subgraph UI[渲染层]
        LAYOUT[Layout.tsx]
        PANEL[WidgetPanel]
        COMP[ComponentsPage]
        MODAL[WidgetModal]
        AICHAT[AIChatPage]
    end

    subgraph Widgets[内置 Widget]
        P[PolishWidget]
        PP[ProfilePreviewWidget]
        SF[SuggestedFollowsWidget]
        SFE[SuggestedFeedsWidget]
        T[TrendsWidget]
        AIW[AIChatWidget]
    end

    RW --> REG
    LAYOUT -->|mount 初始化| ORDER
    LAYOUT -->|toggle| TW
    TW --> CB --> SAVE --> LS
    LAYOUT -->|视图切换| ORDER
    LAYOUT -->|aiChat 禁/启| DW / EW
    AICHAT -->|Open in Widgets| EW
    COMP -->|排序+开关| ORDER
    PANEL --> GV --> REG
    PANEL --> ORDER
    P --> CD
    PP --> PA
    AIW --> AI
```

---

## 下一步

- 了解 PWA 整体渲染架构详见 [PWA 应用架构](pwa-应用架构.md)
- Widget 的 context 数据（`composeDraft`、`polishConfig` 等）由 Layout 通过 `WidgetContext` 传递，详见 [PWA 核心组件详解](pwa-核心组件详解.md)
- AI Chat Widget 内部的会话管理与 `useAIChat` hook 详见 [AI 对话引擎](ai-对话引擎.md)
- 查看 Widget 排序索引 Lesson 15 的教训详见 [关键教训与架构决策记录](关键教训与架构决策记录.md)