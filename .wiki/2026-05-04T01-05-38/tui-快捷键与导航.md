现在我有全部所需信息。让我编写这篇 Wiki 页面。

---

# TUI 快捷键与导航

## 导航哲学：键盘优先的终端体验

TUI 终端客户端采用 **键盘主导、鼠标辅助** 的交互范式。所有核心操作均可单手完成，无需离开主行区。整个系统注册了 **5 个独立的 `useInput` 钩子**，分别由不同视图持有——Ink 按注册顺序依次触发所有 handler，每个 handler 必须通过条件守卫避免冲突。[来源](packages/tui/src/components/App.tsx#L87-L87)

```
App.tsx (全局) ───────── UnifiedThreadView.tsx (帖文线程)
    │                           │
    ├ AIChatView.tsx (对话)      NotifView.tsx (通知)
    └ AIChatView.tsx (历史)      SetupWizard.tsx (首次运行)
```

除此之外，还有一个通过 `process.stdin.on('data')` 注册的 **鼠标滚轮原始监听器**。[来源](packages/tui/src/components/App.tsx#L289-L303)

---

## 全局快捷键：任何视图下均有效

### 一级快捷键（按优先级）

在这套架构中，**Esc、Tab 和 Ctrl+G** 拥有最高优先级——它们在任何视图下都首先被处理。

| 按键 | 作用 | 说明 |
|------|------|------|
| `Esc` | **后退** | 上下文相关后退（见下文明细） |
| `Tab` | **切换焦点面板** | 仅在 AI 对话视图中有效，在 `main` ↔ `ai` 面板间切换 |
| `Ctrl+G`（`\x07`） | **启动 AI 对话** | 打开新 AI 会话，若当前在帖文线程则自动附带上下文 `contextPost` |
| `,`（逗号） | **打开设置** | 弹出 SettingsView（.env 编辑器） |

[来源](packages/tui/src/components/App.tsx#L88-L114)

### Esc 的上下文敏感行为

Esc 不是简单的「返回」——它根据当前状态执行智能回退。

| 当前视图/状态 | 第一次 Esc | 第二次 Esc |
|--------------|------------|------------|
| AI 对话 + `focusedPanel === 'ai'` | 回到主面板（`focusedPanel = 'main'`） | `goBack()` 返回上一视图 |
| 发帖 + 正在输入媒体路径 | 取消媒体输入 | — |
| 发帖 + 有未发送文本 | 弹出「是否保存草稿？」确认框 | 按 Y/N 响应 |
| 发帖 + 无文本 | `goBack()` 直接返回 | — |
| Feed 切换叠加层 | 关闭叠加层 | — |
| 搜索视图 | 由 SearchView 内部处理 | — |
| 其余视图（线程/通知/书签等） | `goBack()` 返回上一视图 | — |

[来源](packages/tui/src/components/App.tsx#L89-L108)

### 全局导航快捷键组

这些快捷键在 **所有非发帖视图** 中生效。Sidebar 组件同时用 `[t]` `[n]` 等标签标注在侧边栏中，形成操作提示闭环。[来源](packages/tui/src/components/Sidebar.tsx#L38-L45)

| 按键 | 动作 | 说明 |
|------|------|------|
| `t` | `goHome()` | **时间线**——清空导航栈回到 Feed 首页 |
| `n` | `goTo({ type: 'notifications' })` | **通知** |
| `p` | `goTo({ type: 'profile', actor: handle })` | **个人主页**（当前用户） |
| `s` | `goTo({ type: 'search' })` | **搜索** |
| `a` | `goTo({ type: 'aiChat' })` | **AI 对话**——新建随机 session |
| `c` | `goTo({ type: 'compose' })` | **发帖** |
| `b` | `goTo({ type: 'bookmarks' })` | **书签** |

[来源](packages/tui/src/components/App.tsx#L175-L182)

> ⚠️ 全局键保留原则：`t` `n` `p` `s` `a` `c` `b` `Esc` `Tab` `Ctrl+G` 在所有视图中永久保留，**不得**用于任何视图级操作。添加新快捷键时应避让此集合。[来源](docs/KEYBOARD.md#global-key-reserve-rules)

---

## 视图级快捷键分谱

### Feed（时间线）视图

Feed 是 TUI 的默认首页，支持 **光标游走 + 操作** 模式。选中行通过 `selectedIndex={feedIdx}` 传递到 PostList 组件，以高亮背景渲染。[来源](packages/tui/src/components/App.tsx#L240-L243)

| 按键 | 动作 |
|------|------|
| `j` / `↓` | 光标下移 1 行 |
| `k` / `↑` | 光标上移 1 行 |
| `PgUp`（`\x1b[5~`） | 上翻 5 行 |
| `PgDn`（`\x1b[6~`） | 下翻 5 行 |
| `Enter` | 打开选中帖子（进入线程视图 `goTo({ type: 'thread', uri })`） |
| `m` | 加载更多（调用 `loadMore?.()` 分页加载） |
| `r` | 刷新（调用 `refresh?.()` 重新拉取顶部） |
| `f` | 切换 Feed（打开 FeedConfigOverlay） |
| `v` | 收藏/取消收藏选中帖子（`bookmarks.toggleBookmark`） |
| `q` | 打开选中帖子的引用帖（若有 `embed.record.uri`） |

**底部提示**：`↑↓/jk:导航 Enter:查看 m:更多 r:刷新 f:切换Feed v:收藏 q:引用`[来源](packages/tui/src/components/App.tsx#L183-L213)

### FeedConfigOverlay（Feed 切换叠加层）

按 `f` 后弹出，提供完整的 Feed 管理界面：

| 按键 | 动作 |
|------|------|
| `j` / `k` / `↑` / `↓` | 在列表项中移动光标 |
| `Enter` | 选中当前 Feed（立即切换） |
| `s` / `S` | 将当前项设为默认 Feed |
| `d` / `D` | 从列表中删除当前 Feed |
| `Esc` | 关闭叠加层 |

叠加层还展示推荐 Feed（来自 `client.getSuggestedFeeds(10)`）和「添加自定义 Feed」入口。[来源](packages/tui/src/components/App.tsx#L328-L406)

### 书签视图

独立于 Feed，但导航逻辑类似：

| 按键 | 动作 |
|------|------|
| `j` / `↓` | 光标下移 |
| `k` / `↑` | 光标上移 |
| `Enter` | 查看书签帖子（进入线程） |
| `d` | 删除当前书签 |
| `r` | 刷新书签列表 |
| `q` | 打开引用帖 |

**底部提示**：`↑↓/jk:导航 Enter:查看 d:删除 r:刷新 q:引用`[来源](packages/tui/src/components/App.tsx#L215-L233)

### 发帖/Compose 视图

发帖视图的键盘焦点委托给 `ink-text-input` 的 `TextInput`，通过 `onSubmit` 提交。全局导航键在发帖中被 **屏蔽**。[来源](packages/tui/src/components/App.tsx#L115-L173)

#### 普通输入模式

| 按键 | 动作 |
|------|------|
| `Enter` | 提交帖子（TextInput onSubmit） |
| `Esc` | **智能退出**——若有未发送文本，先弹出「是否保存草稿？」 |
| `i` / `I` | 进入媒体路径输入模式 |
| `D`（大写 D） | 打开草稿列表（`draftListOpen = true`） |

#### 媒体路径输入模式

| 按键 | 动作 |
|------|------|
| `Enter` | 验证并上传媒体文件（检查存在性、大小、数量限制） |
| `Esc` | 取消媒体输入 |

上传逻辑支持：图片自动压缩（>2MB 时用 Sharp 缩放到 2048px JPEG 82% 质量），视频限 100MB。[来源](packages/tui/src/components/App.tsx#L131-L171)

#### 草稿列表模式

| 按键 | 动作 |
|------|------|
| `j` / `k` / `↑` / `↓` | 在草稿间移动 |
| `Enter` | 加载选中草稿到编辑器 |
| `d` / `D` | 删除选中草稿 |
| `n` / `N` | 将当前文本另存为新草稿并清空编辑器 |
| `Esc` | 关闭草稿列表 |

#### 草稿保存提示

| 按键 | 动作 |
|------|------|
| `y` / `Y` | 保存草稿并返回 |
| `n` / `N` | 放弃草稿并返回 |
| `Esc` | 取消退出，继续编辑 |

**底部提示**：`Enter:发送 · Esc:取消 · i:媒体 · D:草稿`[来源](packages/app/src/i18n/locales/zh.ts#L242-L244)

---

## AI 对话视图：双面板焦点

AI 对话视图有一个特殊设计：**双焦点系统**。`focusedPanel` 状态控制键盘事件路由到主面板还是 AI 面板。

### Tab 切换：主面板 ↔ AI 面板

```
当前 focus 状态          Tab 按下后
main  ──────────────→  ai
ai    ──────────────→  main
```

当焦点在 AI 面板（`focusedPanel === 'ai'`）时，**所有字符键被全局 handler 忽略**（`if (currentView.type === 'aiChat' && focusedPanel === 'ai') return;`），仅由 AIChatView 内部处理。

### AI 面板激活时（`focusedPanel === 'ai'`）

| 按键 | 动作 | 条件 |
|------|------|------|
| `PgUp` | 上滚约 70% 可视高度 | 始终 |
| `PgDn` | 下滚约 70% 可视高度 | 始终 |
| `↑` | 上滚 3 行 | 仅 `focused === false`（非输入状态） |
| `↓` | 下滚 3 行 | 仅 `focused === false` |
| `u` / `U` | 撤销最后一组消息对 | `!loading && !focused` |
| `r` / `R` | 编辑上一条消息 | `!loading && !focused` |
| `i` / `I` | 上传图片 | `!loading && !focused` |
| `e` / `E` | 导出对话（1=JSON, 2=HTML, 3=MD） | `!loading && !focused` |
| `p` / `P` | 暂停 AI 响应 | `loading` |

**写入确认对话框**（AI 执行写操作时弹出，阻塞其他所有按键）：

| 按键 | 动作 |
|------|------|
| `y` / `Y` / `Enter` | 确认——执行写操作 |
| `n` / `N` / `Esc` | 拒绝——取消操作 |

### 聊天历史列表模式

| 按键 | 动作 |
|------|------|
| `↑` / `↓` | 在会话列表间移动 |
| `n` / `N` | 新建对话 |
| `l` / `L` | 加载选中会话 |
| `d` / `D` | 删除选中会话 |
| `Esc` | 关闭历史列表 |

**底部提示**（主面板焦点）：`a:复制 r:编辑 t:完整对话 e:导出 i:图片 p:暂停 Tab:切换面板`[来源](packages/app/src/i18n/locales/zh.ts#L247-L250)

---

## 通知视图

| 按键 | 动作 |
|------|------|
| `j` / `k` / `↑` / `↓` | 在通知列表间导航 |
| `Enter` | 查看引用帖子（若存在 `reasonSubject`） |
| `r` / `R` | 刷新通知列表 |

**底部提示**：`↑↓/jk:导航 Enter:查看帖子 R:刷新`[来源](packages/app/src/i18n/locales/zh.ts#L245-L246)

**注意**：通知视图的键盘 hnadler 单独实现在 `NotifView.tsx`，不与 App.tsx 的全局 handler 冲突。[来源](packages/tui/src/components/NotifView.tsx#L20-L20)

---

## 线程视图

线程视图的键盘 handler 注册在 `UnifiedThreadView.tsx`，在 `currentView.type === 'thread'` 时激活。

| 按键 | 动作 |
|------|------|
| `j` / `k` / `↑` / `↓` | 光标在帖文行间移动（仅高亮，不改变焦点） |
| `Enter` | 将光标行设为新的焦点帖子 |
| `h` / `H` | 回到根/主题帖 |
| `l` / `L` | 点赞光标行帖子 |
| `r` | 转发（弹出确认对话框） |
| `c` / `C` | 回复（打开带回复上下文的发帖视图） |
| `v` | 收藏/取消收藏 |
| `d` / `D` | 删除光标行帖子（仅限自己的帖子，弹出 Y/N 确认） |
| `y` | 复制 URI（输出 `@handle uri bsky.app/...` 到 stderr，显示 5 秒） |
| `f` / `F` | 翻译光标行文本（通过 AI） |

[来源](packages/tui/src/components/UnifiedThreadView.tsx#L48-L48)

---

## 鼠标滚轮支持

TUI 通过 xterm 鼠标追踪协议（`\x1b[?1000h`）实现滚轮支持，这是一个纯终端的 **原始流监听器**，独立于 Ink 的 useInput 系统。[来源](packages/tui/src/utils/mouse.ts#L3-L16)

| 事件 | 动作 | 适用视图 |
|------|------|----------|
| 滚轮上滚 | 光标上移 1 行 | Feed |
| 滚轮下滚 | 光标下移 1 行 | Feed |

实现机制：`enableMouseTracking` 向终端写入 `\x1b[?1000h`，然后监听 `process.stdin.on('data')`，通过 `parseMouseEvent` 解析鼠标转义序列。滚轮上报的 button 值为 64（上滚）和 65（下滚）。[来源](packages/tui/src/utils/mouse.ts#L18-L54)

支持环境：Windows Terminal、iTerm2、Kitty、WezTerm、tmux 3.3+。传统 cmd.exe 和 ConEmu 会静默忽略追踪写入。[来源](docs/KEYBOARD.md#mouse-scroll-feed-view-only)

---

## 快捷键冲突矩阵

以下按键在不同视图中含义不同——理解这张表可以避免操作错觉。

| Key | Feed | Thread | Bookmarks | Notifications | AI Chat | Compose |
|-----|------|--------|-----------|---------------|---------|---------|
| `t` | goHome | goHome | goHome | goHome | goHome（主焦点） | 屏蔽 |
| `a` | 启动 AI | 启动 AI | 启动 AI | 启动 AI | goHome（主焦点） | 屏蔽 |
| `c` | 发帖 | **回复**（带上下文） | 发帖 | 发帖 | 发帖 | 屏蔽 |
| `b` | 书签 | 书签 | goHome（全局） | 书签 | 书签 | 屏蔽 |
| `r` | 刷新 | **转发**（确认） | 刷新 | 刷新 | — | 屏蔽 |
| `l` | — | **点赞** | — | — | 加载会话（历史） | 屏蔽 |
| `d` | — | **删除帖文** | **删除书签** | — | 删除会话（历史） | 草稿列表 |
| `f` | **切换 Feed** | **翻译** | — | — | — | 屏蔽 |
| `i` | — | — | — | — | 上传图片 | **添加媒体** |
| `Enter` | 查看线程 | 重新聚焦 | 查看线程 | 查看帖子 | TextInput | **提交** |

[来源](docs/KEYBOARD.md#key-conflict-table)

---

## 导航系统架构总览

所有快捷键最终映射到 `NavigationController` 的三个原始操作：[Navigator 与状态管理](navigator-与状态管理.md)

```
goHome()   → stack = [{ type: 'feed' }]      // 清空栈
goTo(v)    → stack = [...stack, v]            // 压栈
goBack()   → stack = stack.slice(0, -1)       // 弹栈
```

视图系统共定义 10 种 `AppView` 类型：[来源](packages/app/src/state/navigation.ts#L1-L11)

```
feed | detail | thread | compose | profile
notifications | search | aiChat | bookmarks | components
```

---

## 推荐阅读

- [Navigator 与状态管理](navigator-与状态管理.md)——导航栈的完整设计与 AppView 类型系统
- [TUI 终端界面实现](tui-终端界面实现.md)——Ink 组件树与布局策略
- [用户界面：TUI 与 PWA](用户界面-tui-与-pwa.md)——两种界面的快捷键设计对比
- [配置指南](配置指南.md)——快捷键相关的环境变量与配置项