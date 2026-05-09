以下是根据当前代码（截至最新提交 `bb8e92d`）全面更新的 TUI 键盘快捷键参考页面。

---

# TUI 键盘快捷键完全参考

> **重要**：新增快捷键后，必须同步更新本文档。参见本文末流程规范。

## 键盘架构：11 个 `useInput` 注册点

Ink 的 `useInput` 按注册顺序依次触发每个 handler。每个 handler 必须使用条件守卫避免冲突。以下是当前所有注册点：

| Handler | 文件 | 活跃条件 |
|---------|------|---------|
| App（主） | `packages/tui/src/components/App.tsx:217` | **始终活跃**。处理 Tab、Esc、全局导航、Feed、Bookmarks、Lists、ListDetail、DM、Compose |
| FeedConfigOverlay | `packages/tui/src/components/App.tsx:920` | 当 `showFeedConfig === true` |
| UnifiedThreadView | `packages/tui/src/components/UnifiedThreadView.tsx:68` | 当 `currentView.type === 'thread'` |
| AIChatView（聊天） | `packages/tui/src/components/AIChatView.tsx:169` | 当 `!showHistory` |
| AIChatView（历史） | `packages/tui/src/components/AIChatView.tsx:254` | 当 `showHistory` |
| NotifView | `packages/tui/src/components/NotifView.tsx:20` | 当 `currentView.type === 'notifications'` |
| ProfileView | `packages/tui/src/components/ProfileView.tsx:49` | 当 `currentView.type === 'profile'` |
| SearchView | `packages/tui/src/components/SearchView.tsx:54` | 当 `currentView.type === 'search'` |
| SettingsView | `packages/tui/src/components/SettingsView.tsx:108` | 当 `showSettings === true` |
| DMChatView | `packages/tui/src/components/DMChatView.tsx:35` | 当 `currentView.type === 'dmChat'` |
| SetupWizard | `packages/tui/src/components/SetupWizard.tsx:104` | 首次运行向导 |

此外，App.tsx 中有 `process.stdin.on('data')` 用于**鼠标滚动追踪**。[来源](packages/tui/src/components/App.tsx#L597-L614)

---

## 全局键（所有视图）

在 App.tsx:217 按以下顺序处理。每匹配一项立即 return。

| 键 | 动作 | 上下文 |
|-----|--------|---------|
| `Tab` | 切换 `focusedPanel` 在 `'main'` / `'ai'` 之间；Compose：轮换帖索引 | aiChat + compose |
| `Esc` | 见下表 | 随视图变化 |
| `,`（逗号） | 打开设置视图 | 全局 |
| `?` | 打开关于页面 | 全局 |

### Esc 行为按视图

| 视图 | 第一次 Esc | 第二次 Esc |
|------|-----------|------------|
| aiChat + focusedPanel === 'ai' | 取消 AI 聚焦 → `focusedPanel = 'main'` | `goBack()` |
| compose + imagePathInput !== null | 取消图片输入 | `goBack()` |
| compose + 无图片输入 | `goBack()` | — |
| compose + draftListOpen | 关闭草稿列表 | — |
| compose + draftSavePrompt | 取消保存提示 | — |
| compose + polishPhase === 'req' | 取消润色 | — |
| compose + polishPhase === 'result' | 取消结果 | — |
| compose + altReqActive | 跳过 ALT → 保存媒体 | — |
| feed / about | 无操作 | — |
| 其他（thread, profile, notifications, search, bookmarks, dm, dmChat, lists, listDetail） | `goBack()` | — |

### Ctrl+G

| 键 | 动作 | 范围 |
|-----|--------|-------|
| `Ctrl+G` | `goTo({ type: 'aiChat', sessionId, contextPost: threadUri })` | 全部视图。threadUri 仅在 Thread 视图中设置。 |

### 全局导航快捷键

在所有**非 Compose 视图**中触发，当之前条件均未命中时。

| 键 | 动作 | 说明 |
|-----|--------|-------------|
| `t` | `goHome()` | 时间线 |
| `n` | `goTo({ type: 'notifications' })` | 通知 |
| `p` | `goTo({ type: 'profile', actor: handle })` | 个人主页（自己的） |
| `s` | `goTo({ type: 'search' })` | 搜索 |
| `a` | `goTo({ type: 'aiChat', sessionId, contextPost })` | AI 聊天 |
| `c` | `goTo({ type: 'compose' })` | 发帖（无回复上下文） |
| `b` | `goTo({ type: 'bookmarks' })` | 书签 |
| `L` | `goTo({ type: 'lists' })` | 列表 |
| `m` | `goTo({ type: 'dm' })` | 私信（Feed 视图中 `m` 用于加载更多） |
| `?` | `goTo({ type: 'about' })` | 关于页面 |

[来源](packages/tui/src/components/App.tsx#L289-L498)

### 全局键保留规则

以下键在**所有视图中永久保留**，不得用于视图特定操作：

| 键 | 原因 |
|-----|--------|
| `t`, `n`, `p`, `s`, `a`, `c`, `b`, `m`, `L`, `?` | 全局导航（`m` 有守卫：Feed 中用于加载更多） |
| `Esc` | 通用返回 |
| `Tab` | AI 聚焦切换 / 标签切换 |
| `Ctrl+G` | AI 聊天启动器 |
| `,`（逗号） | 设置 |

**新增视图特定快捷键时，从以下键中选择**：`f`, `z`, `x`, `w`, `u`, `o`, `g`, `q`, `e`, `d`（除 Bookmarks 外）、`l`（除 Thread/AI-history 外）、`h`（除 Thread 外）、`y`（除 Thread 外）、`i`（除 Compose 外）、`v`（除 Feed/Bookmarks/Thread/Search 外）、`r`（除 Feed/Thread/Bookmarks/Notifications/AI Chat 外）。注意：`m` 保留给 DM + Feed load more；`s` 已被导航 + 设置中的保存占用；`p` 已被导航 + AI 暂停 + Profile 的关注列表占用。

---

## Feed 视图

| 键 | 动作 |
|-----|--------|
| `j` / `↓` | 光标下移 |
| `k` / `↑` | 光标上移 |
| `PgUp` | 上翻一页（5 条帖） |
| `PgDn` | 下翻一页（5 条帖） |
| `Enter` | 查看选中帖的 Thread |
| `m` | 加载更多 |
| `r` | 重新加载 |
| `f` | 切换/配置 Feed（jk 导航，Enter 选择，d 删除） |
| `v` | 切换书签（选中帖） |
| `q` | 打开引用帖（当帖有引用 embed） |
| 鼠标滚轮上 | 光标上移 1 |
| 鼠标滚轮下 | 光标下移 1 |

[来源](packages/tui/src/components/App.tsx#L501-L516)

---

## Thread 视图

> **警告**：全局键 `t`, `a`, `c`, `b`, `p`, `n`, `s`, `m`, `?` 在 Thread 视图中**同样生效**。

### 导航

| 键 | 动作 |
|-----|--------|
| `j` / `↓` | 光标下移（高亮，不改变聚焦帖） |
| `k` / `↑` | 光标上移 |
| `Enter` | 将光标行设为新焦点帖（完全重新聚焦） |
| `Enter`（截断行） | 展开更多回复 |
| `h` / `H` | 回到根帖/主题帖 |

### 光标行操作

| 键 | 动作 |
|-----|--------|
| `l` / `L` | 点赞（已点赞则无操作） |
| `r` | 转发（打开确认对话框） |
| `c` / `C` | 回复（打开 Compose 带回复上下文） |
| `v` | 切换书签 |
| `d` / `D` | 删除光标帖（仅自己的帖）— [Y/N] 确认 |
| `y` | 复制 URI — 向 stderr 输出 `@handle uri bsky.app/...`（显示 5 秒） |
| `f` / `F` | AI 翻译光标行文本 |
| `u` / `U` | 关注/取消关注焦点帖作者 |
| `g` / `G` | 跳转到焦点帖作者的个人主页 |

### 转发确认对话框（打开时）

| 键 | 动作 |
|-----|--------|
| `Enter` / `r` / `R` | 第一阶段：进入确认；第二阶段：确认转发 |
| `q` / `Q` | 引用转发（打开 Compose） |
| `y` / `Y` | 确认转发（第二阶段） |
| `n` / `N` | 取消（第一或第二阶段） |
| `Esc` | 取消对话框 |

### 删除确认对话框（打开时）

| 键 | 动作 |
|-----|--------|
| `y` / `Y` | 确认删除 |
| `n` / `N` / `Esc` | 取消 |

[来源](packages/tui/src/components/UnifiedThreadView.tsx#L68-L155)

---

## 书签视图

| 键 | 动作 |
|-----|--------|
| `j` / `↓` | 光标下移 |
| `k` / `↑` | 光标上移 |
| `Enter` | 查看书签帖的 Thread |
| `d` | 删除书签 |
| `r` | 刷新书签列表 |
| `q` | 打开引用帖的 Thread |

[来源](packages/tui/src/components/App.tsx#L519-L533)

---

## 列表视图

**全局快捷键**：`L`（大写，区别于 Thread 中的 `l`=点赞）

| 键 | 动作 |
|-----|--------|
| `j` / `↓` | 光标下移 |
| `k` / `↑` | 光标上移 |
| `Enter` | 打开选中列表（详情视图） |
| `d` | 删除列表 |
| `r` | 刷新列表 |
| `c` | 创建新列表（输入名称后 Enter） |
| `e` | 编辑列表名称 |

**列表详情视图**：

| 键 | 动作 |
|-----|--------|
| `Tab` | 切换"帖子"/"成员"标签 |
| `j` / `↓` | 光标下移 |
| `k` / `↑` | 光标上移 |
| `Enter` | 查看帖子或用户主页 |
| `r` | 刷新 |
| `e` | 编辑列表名称 |

[来源](packages/tui/src/components/App.tsx#L536-L571)

---

## DM 视图

**DM 列表**：

| 键 | 动作 |
|-----|--------|
| `j` / `↓` | 光标下移 |
| `k` / `↑` | 光标上移 |
| `Enter` | 打开选中对话 |
| `r` | 刷新对话列表 |

**DM 聊天**：

| 键 | 动作 |
|-----|--------|
| `Esc` | 返回 DM 列表 |
| `Enter` | 发送消息 |
| `e` | 表情反应模式（输入编号 1-N 选择表情） |
| 数字 `1`–`N` | 选择对应表情（反应模式下） |

[来源](packages/tui/src/components/DMChatView.tsx#L35-L56)

---

## 通知视图

| 键 | 动作 |
|-----|--------|
| `j` / `↓` | 光标下移 |
| `k` / `↑` | 光标上移 |
| `Enter` | 查看引用帖（如果有 `reasonSubject`） |
| `r` / `R` | 刷新通知 |

[来源](packages/tui/src/components/NotifView.tsx#L20-L32)

---

## 个人主页视图

> **更新**：此视图现在有自己的键盘 handler（旧文档称"无键盘 handler"已过时）。

| 键 | 动作 |
|-----|--------|
| `Esc` | 返回 |
| `Tab` / `←` / `→` | 切换"帖子"/"回复"标签 |
| `j` / `↓` | 光标下移 |
| `k` / `↑` | 光标上移 |
| `Enter` | 查看选中帖的 Thread |
| `a` / `A` | 用个人主页上下文打开 AI 聊天 |
| `f` / `F` | 翻译个人简介（AI） |
| `u` / `U` | 关注/取消关注 |
| `m` | 加载更多帖子 |
| `p` | 查看关注列表 |
| `P` | 查看粉丝列表 |

**关注/粉丝列表打开时**：

| 键 | 动作 |
|-----|--------|
| `Esc` | 关闭列表 |
| `j` / `↓` | 光标下移 |
| `k` / `↑` | 光标上移 |
| `Enter` | 查看选中用户的主页 |
| `m` | 加载更多 |

[来源](packages/tui/src/components/ProfileView.tsx#L49-L97)

---

## 搜索视图

> **更新**：此视图现在有自己的键盘 handler（旧文档称"无键盘 handler"已过时）。

| 键 | 动作 |
|-----|--------|
| `Esc` | 返回 |
| `Tab` | 切换标签（热门/最新/用户/动态源） |
| `Enter` | 执行搜索（输入非空时）；或查看选中项 |
| `j` / `↓` | 光标下移 |
| `k` / `↑` | 光标上移 |
| `v` / `V` | 查看动态源（动态源标签） |
| `s` / `S` | 订阅动态源（动态源标签） |

[来源](packages/tui/src/components/SearchView.tsx#L54-L89)

---

## 设置视图

| 键 | 动作 |
|-----|--------|
| `Esc` | 关闭设置 |
| `Tab` | 切换标签（模型/场景/语言/Keys） |
| `s` / `S` | 保存并退出 |
| `↑` / `↓` | 光标导航 |
| `Enter` | 选中/编辑当前项 |
| `←` / `→` | 语言标签下切换选项 |

[来源](packages/tui/src/components/SettingsView.tsx#L108-L213)

---

## Compose 视图

键盘处理由 App.tsx 主 handler 中的 `currentView.type === 'compose'` 分支接管。全局快捷键在此被阻止。

### 普通文本模式

| 键 | 动作 |
|-----|--------|
| `Enter` | 提交帖子 |
| `Esc` | 返回（如有内容则提示保存草稿） |
| `i` / `I` | 进入媒体路径输入模式（图片或视频，最多 4 图/1 视频） |
| `D` | 打开草稿列表（保存/加载/删除/同步） |
| `P` | 新增帖子到线程 |
| `X` | 从线程移除当前帖子 |
| `f` / `F` | 润色：进入润色需求输入模式（帖子非空时） |

### 媒体路径输入模式

| 键 | 动作 |
|-----|--------|
| `Enter` | 验证 + 上传媒体，然后进入 ALT 文本输入 |
| `Esc` | 取消媒体输入 |
| 其他键 | 输入媒体路径 |

### ALT 文本输入模式

| 键 | 动作 |
|-----|--------|
| `Enter` | 确认 ALT 文本 → 保存媒体 |
| `Esc` | 跳过 ALT → 保存媒体（空 ALT） |

### 润色需求输入模式

| 键 | 动作 |
|-----|--------|
| `Enter` | 提交需求 → AI 润色调用 |
| `Esc` | 取消润色 |

### 润色结果模式

| 键 | 动作 |
|-----|--------|
| `R` | 用润色结果替换当前帖子文本 |
| `C` | 复制结果到剪贴板（stderr） |
| `Esc` | 关闭结果 |

### 草稿保存提示（打开时）

| 键 | 动作 |
|-----|--------|
| `Y` | 保存草稿 + 返回 |
| `N` | 不保存直接返回 |
| `Esc` | 取消返回 |

### 草稿列表（打开时）

| 键 | 动作 |
|-----|--------|
| `Esc` | 关闭草稿列表 |
| `j` / `J` / `↓` | 光标下移 |
| `k` / `K` / `↑` | 光标上移 |
| `Enter` | 加载选中草稿 |
| `d` / `D` | 删除选中草稿 |
| `n` / `N` | 新建草稿（保存当前后清空） |
| `s` / `S` | 同步草稿 |

[来源](packages/tui/src/components/App.tsx#L298-L483)

---

## AI Chat 视图

### 聊天活跃时（非历史模式）

| 键 | 动作 | 条件 |
|-----|--------|-----------|
| `PgUp` | 上滚 ~70% 可视高度 | 总是 |
| `PgDn` | 下滚 ~70% 可视高度 | 总是 |
| `↑` | 上滚 3 行 | 仅当 `focused === false`（不在输入中） |
| `↓` | 下滚 3 行 | 仅当 `focused === false` |
| `a` / `A` | 复制助手消息（Enter 后输入编号） | 当 `!loading` 且 `!focused` |
| `r` / `R` | 编辑用户消息（Enter 后输入编号） | 当 `!loading` 且 `!focused` |
| `t` / `T` | 复制全部对话文本到剪贴板 | 当 `!loading` 且 `!focused` |
| `e` / `E` | 导出对话（1=JSON, 2=HTML, 3=MD） | 当 `!loading` 且 `!focused` |
| `i` / `I` | 上传图片（输入文件路径后 Enter） | 当 `!loading` 且 `!focused` |
| `p` / `P` | 暂停/停止 AI 回复 | 当 `loading` |

**写入确认对话框**（打开时阻止所有其他键）：

| 键 | 动作 |
|-----|--------|
| `y` / `Y` / `Enter` | 确认 — 执行写操作 |
| `n` / `N` / `Esc` | 拒绝 — 取消操作 |

当 `focused === true`（Tab 切换到 AI 面板），箭头键传递给 TextInput。

**注意**：当 `focusedPanel === 'main'` 时，键 `a` 和 `t` 导航到 Feed（覆盖全局含义）。

### 聊天历史模式

| 键 | 动作 |
|-----|--------|
| `Esc` | 返回 |
| `↑` | 列表上移 |
| `↓` | 列表下移 |
| `n` / `N` | 新建聊天 |
| `l` / `L` | 加载选中对话 |
| `d` / `D` | 删除选中对话 |

[来源](packages/tui/src/components/AIChatView.tsx#L169-L273)

---

## 首次运行向导（SetupWizard）

| 键 | 动作 |
|-----|--------|
| `Tab` / `↓` | 下一个字段/选项 |
| `↑` | 上一个字段/选项 |
| `←` / `→` | 语言选择（locale 步骤） |
| `Enter` | 提交当前字段/确认选择 |
| `Esc` / `Tab` | 跳过场景配置 |

[来源](packages/tui/src/components/SetupWizard.tsx#L104-L144)

---

## 鼠标滚动（仅 Feed 视图）

启用 ANSI 鼠标追踪（`\x1b[?1000h`），在支持的终端上生效（Windows Terminal, iTerm2, Kitty, WezTerm, tmux 3.3+）。

| 事件 | 动作 |
|-------|--------|
| 滚轮上 | Feed 光标上移 1 |
| 滚轮下 | Feed 光标下移 1 |

不支持：ConEmu, 传统 cmd.exe（无害 — 追踪写入被忽略）。[来源](packages/tui/src/components/App.tsx#L597-L614)

---

## 键冲突表

视图中含义**不同**的键：

| 键 | Feed | Thread | Bookmarks | Notifications | AI Chat | Compose | Profile | Search | DM Chat |
|-----|------|--------|-----------|---------------|---------|---------|---------|--------|---------|
| `t` | goHome | goHome | goHome | goHome | feed (main-focus) | 阻止 | goHome | goHome | goHome |
| `a` | goTo AI | goTo AI | goTo AI | goTo AI | feed (main-focus) | 阻止 | AI chat ctx | goTo AI | goTo AI |
| `c` | goTo compose | reply (冲突*) | goTo compose | goTo compose | goTo compose | 阻止 | goTo compose | goTo compose | goTo compose |
| `b` | goTo bm | goTo bm | goTo bm (全局) | goTo bm | goTo bm | 阻止 | goTo bm | goTo bm | goTo bm |
| `r` | refresh | repost dialog | refresh | refresh notifs | edit msg（pick） | 阻止 | — | — | — |
| `l` | — | like | — | — | load conv（hist） | 阻止 | — | — | — |
| `d` | — | delete post | delete bm | — | delete conv（hist） | 阻止 | — | — | — |
| `h` | — | go to root | — | — | — | 阻止 | — | — | — |
| `y` | — | yank URI | — | — | — | 阻止 | — | — | — |
| `f` | switch feed | translate | — | — | — | 阻止 | translate bio | — | — |
| `i` | — | — | — | — | upload image | add media | — | — | — |
| `u` | — | follow/unfocus | — | — | — | 阻止 | follow/unfollow | — | — |
| `g` | — | go profile | — | — | — | 阻止 | — | — | — |
| `v` | toggle bm | toggle bm | — | — | — | 阻止 | — | view feed | — |
| `m` | load more | load more（DM） | DM | DM | DM | 阻止 | load more | — | — |
| `s` | settings | settings | settings | settings | settings | 阻止 | — | subscribe feed | — |
| `e` | — | — | — | — | export | — | — | — | react mode |
| `p` | settings(a) | goTo(a) | goTo(a) | goTo(a) | pause/stop | 阻止 | follow list | — | — |
| `?` | about | about | about | about | about | 阻止 | about | about | about |
| `,` | settings | settings | settings | settings | settings | 阻止 | settings | settings | settings |
| `Enter` | view thread | refocus post | view thread | view post | TextInput/Tool confirm | submit | view thread | search/view | send |

\\* `c` 在 Thread 中有守卫：全局 handler 当 `currentView.type === 'thread'` 时跳过，只有 Thread 本地 `c`（带 replyTo）触发。[来源](packages/tui/src/components/App.tsx#L494)

---

## 新增快捷键流程规范

1. **检查** [全局键保留规则](#全局键保留规则) 表 — 不要重用保留键
2. **检查** [冲突表](#键冲突表) — 避免已有的视图特定含义
3. **选择键**：从可用池中挑选（参见保留规则末尾的推荐键列表）
4. **添加 `useInput` / switch case** 到对应组件
5. **更新 footer hint**：在 i18n locale 文件（`keys.*`）中添加对应键提示字符串
6. **更新此文档**

如果新增的快捷键与其他视图在同一按键上产生冲突，必须在冲突表中添加新行，并标记守卫机制。参见 `AGENTS.md` 的强制审查步骤。