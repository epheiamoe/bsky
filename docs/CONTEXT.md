# Context Compression Recovery Guide

> 当 AI 会话上下文被压缩后，阅读本文档快速恢复工作状态。

## 必读文件（按优先级）

1. **`AGENTS.md`** — 架构原则、安全红线、命令参考
2. **`docs/CONTEXT.md`** — 本文（上下文恢复 + 关键结论 + 教训）
3. **`docs/ARCHITECTURE.md`** — 系统架构、依赖关系
4. **`docs/PACKAGES.md`** — 各包职责与文件清单
5. **`docs/HOOKS.md`** — 所有 hook 签名与返回类型
6. **`docs/KEYBOARD.md`** — TUI 完整快捷键目录
7. **`docs/AI_SYSTEM.md`** — AI 集成架构
8. **`docs/DESIGN.md`** — PWA 设计系统
9. **`docs/TODO.md`** — 功能状态
10. **`CHANGELOG.md`** — 版本历史
11. **`packages/core/src/ai/prompts.ts`** — AI 提示词集中管理
12. **`packages/core/src/at/tools.ts`** — 31 个工具定义

## 版本

**v0.2.0** — Git tag `v0.2.0`

## 项目状态

### 部署
- **GitHub**: https://github.com/epheiamoe/bsky (`master` 分支)
- **PWA 在线**: https://ai-bsky.pages.dev（Cloudflare Pages）
- **PWA 部署**: `cd packages/pwa && pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true`

### 模型 & 环境
- **默认 LLM**: `deepseek-v4-flash`
- **翻译默认**: zh（中文）
- **工具数量**: 31（24 读 + 6 写 + 1 AI）
- **思考模式**: 默认开启（`LLM_THINKING_ENABLED=true`）
- **视觉模式**: 默认关闭（`LLM_VISION_ENABLED=false`）

---

## 架构原则

```
@bsky/core → @bsky/app → @bsky/tui | @bsky/pwa
```

- 业务逻辑只写一次在 core+app 层
- TUI 和 PWA 只写渲染层
- 所有 hook 在 `@bsky/app`，UI 层仅 import
- i18n：模块级单例 store
- Ink 中 5 个 `useInput` 同时触发，每个需 guard 防止冲突
- 所有 AI 提示词集中在 `packages/core/src/ai/prompts.ts`

---

## 🔴 关键教训

### AI 自动执行写操作
**问题**：AI 在分析用户资料时自动调用 `create_post` 试图发帖。
**根因**：
1. 提示词中有"最终生成一条回复，帮助用户了解这个账号"——引导 AI 主动创作
2. 自动开始的用户消息包含"并与我互动"——进一步鼓励写操作
**修复**：
- `P_ASSISTANT_BASE` 新增 3 条硬规则：**绝对不要主动代表用户发帖/回复/点赞/转发/关注**
- `PF_PROFILE_CONTEXT` 移除"生成一条回复"
- `PF_AUTO_ANALYSIS` 移除"并与我互动"
- 写操作确认门（`requiresWrite` + `_waitForConfirmation()`）作为最后防线有效——用户点击了拒绝

**教训**：提示词中哪怕一个字（"互动"、"回复"）都可能触发 AI 的写行为。必须**明确的否定性指令**（"绝对不要"、"除非用户明确要求"）。写操作确认门是必要的但**不能依赖它来纠正提示词 bug**——正确做法是从提示词层面根除。

---

## 关键实现细节

### 1. AI 提示词系统 (`prompts.ts`)
- **集中管理**：所有 LLM 提示词在一个文件
- **P_ 前缀** = 常量字符串，**PF_ 前缀** = 参数化函数
- **新版核心规则**：
  - AI 是"用户的 Bluesky 助手"（不是独立代理）
  - 绝对不要主动代表用户执行写操作
  - 所有写操作必须用户明确要求
- **系统时间**：`PF_CURRENT_TIME()` 告诉 AI 当前日期
- **环境信息**：`PF_ENVIRONMENT()` 告知终端/浏览器
- **用户身份**：`PF_CURRENT_USER()` 告知 handle 和 displayName

### 2. BskyClient (`client.ts`)
- 双端点：`this.ky`（写操作）+ `this.publicKy`（读操作）
- JWT 自动刷新：`afterResponse` hook
- 32 个公开方法（含 deletePost、getSuggestedFeeds）

### 3. AI 助手 (`assistant.ts`)
- 流式 SSE：`sendMessageStreaming()` → yield `token | tool_call | tool_result | thinking | done`
- 思考模式：`reasoning_content` → `type: 'thinking'` → TUI `| Thinking:` 格式
- 写操作确认：`requiresWrite` → Promise gate → `_waitForConfirmation()`
- 多模态：`ContentBlock` 类型 + `_pendingImages` → `_buildMessages()` 条件提升
- `visionEnabled` 开关控制是否嵌入 base64

### 4. 工具系统 (`tools.ts`)
- 31 个工具：24 读 + 6 写 + 1 AI（view_image）
- `upload_blob` 已删除（死工具）
- `create_post` 支持 images 参数：`[{did, cid, alt}]`
- `download_image`：存到 `~/Downloads/`
- `flattenThread`：maxReplies 参数（最多 20）
- `getSuggestedFeeds`：推荐 feed
- **AI 上下文截断**：post text 全文（Bluesky 300 字上限），desc 全文（256 字上限）

### 5. UI 显示截断
- yield/intermediateSteps：不再 500 截断
- UI tool_result：不再 300 截断
- `tryJsonSummary`：智能提取关键字段

### 6. 自定义 Feed
- `following` → `getTimeline()`（不存在独立 generator）
- `discover` → `getFeed(whats-hot)`
- 自定义 → `getFeed(userUri)`
- PWA：`FeedHeader` ▾ 下拉 + `FeedConfigModal`
- TUI：`f` 键 feed 配置面板
- API 推荐：`getSuggestedFeeds`（PWA+TUI 均已接入）

### 7. TUI
- Pre-computed lines → PostList viewport
- 5 个 `useInput` 同时触发
- AI 对话流式（`stream: true`），thinking 显示
- `f` 键 feed 切换（需要 guard 防 Enter 冲突）
- `d` 键删除自己的帖子（Y/N 确认）

### 8. PWA
- `useHashRouter()` → `#/view?param=value`
- 虚拟滚动 `@tanstack/react-virtual`
- 灯箱 `createPortal(document.body)`
- Feed 下拉 `createPortal(document.body)` 修复堆叠上下文
- 链接/@handle 自动标蓝
- 用户名 15 字符截断

### 9. i18n
- zh/en/ja 三语言，单例 store
- `useI18n()` 共享实例

---

## 关键决策

| 决策 | 原因 |
|------|------|
| `messages.length` 不得在 tools init effect deps 中 | 避免 streaming 中 system 消息插入破坏 API 协议 |
| `flattenThread` `d >= 0` 守卫 | 防止祖先帖兄弟分支泄漏 |
| `flatLen` ref 替代 `flatLines.length` | 避免 Ink useInput 旧闭包 |
| 图片 CDN 替代 PDS blob 端点 | PDS 需要 JWT auth |
| 灯箱 `createPortal(document.body)` | 虚拟滚动 `transform` containing block |
| following 走 `getTimeline()` | 独立 feed generator 不存在 |
| `visionEnabled` 无启发式，纯用户配置 | 模型名推断易误判 |
| AI 写操作确认门 + 提示词硬规则 | 双重防线防止自动发帖 |
| buildSystemPrompt 所有关键信息集中注入 | 环境/时间/语言/用户/视觉模式 |

---

## 待完成

- PWA 侧边栏常驻 AI 面板
- 头像缓存（Service Worker / IndexedDB）
- List/Feed 浏览、DM 私信、视频帖
- 推送通知（Web Push API）

---

## 快速命令

```bash
# TUI
cd packages/tui && npx tsx src/cli.ts

# PWA dev
cd packages/pwa && pnpm dev

# PWA build + deploy
cd packages/pwa && pnpm build
npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true

# Tests
cd packages/core && npx vitest run --config vitest.config.ts

# Full typecheck + build
pnpm -r typecheck
pnpm -r build
```

---

## 开发规则

1. **绝不**硬编码凭证到任何提交文件
2. 新增快捷键必须查 KEYBOARD.md 全局保留表 + 冲突表
3. `.zread/wiki/` 不可删除
4. Ink 中 5 个 `useInput` 同时触发 → 每个 handler 必须有 view 守卫
5. React Portal 合成事件沿 React 树冒泡
6. 修改 AI 提示词：编辑 `prompts.ts`，rebuild 即可生效
7. 修改 AI 行为规则：先改 prompts 文件，不要依赖工具层面的 gating
