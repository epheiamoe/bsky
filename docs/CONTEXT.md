# Context Compression Recovery Guide

> 当 AI 会话上下文被压缩后，阅读本文档快速恢复工作状态。

## 必读文件（按优先级）

1. **`AGENTS.md`** — 架构原则、安全红线、命令参考
2. **`docs/CONTEXT.md`** — 本文（上下文恢复 + 关键结论 + 教训）
3. **`docs/ARCHITECTURE.md`** — 系统架构
4. **`docs/PACKAGES.md`** — 各包职责与文件清单
5. **`docs/HOOKS.md`** — 所有 hook 签名
6. **`docs/KEYBOARD.md`** — TUI 快捷键
7. **`CHANGELOG.md`** — 版本历史
8. **`packages/core/src/ai/prompts.ts`** — AI 提示词
9. **`packages/core/src/at/tools.ts`** — 31 个工具定义

## 版本

**v0.2.0** — Git tag `v0.2.0`

## 项目状态

- **PWA 在线**: https://ai-bsky.pages.dev
- **GitHub**: https://github.com/epheiamoe/bsky
- **PWA 部署**: `cd packages/pwa && pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true`
- **默认 LLM**: `deepseek-v4-flash`，翻译默认 zh

## 🔴 关键教训

### 1. AI 自动发帖
**根因**：提示词有"生成一条回复"、"并与我互动"。
**修复**：`P_ASSISTANT_BASE` 3 条硬规则 + `PF_PROFILE_CONTEXT` 移除回复指令 + `PF_AUTO_ANALYSIS` 移除互动。
**教训**：提示词一个字都可能触发写行为。必须鲜明的否定性指令。确认门是最后防线。

### 2. `edit()` 不回滚对话
**修复前**：仅复制文本到输入框。
**修复后**：`edit()` = `assistant.loadMessages(keep)` 撤销 + 返回文本预填。

### 3. Following feed 可被删除
**修复**：`removeFeed()` 检查 `uri === BUILTIN_FEEDS.following` 则 no-op。

### 4. @handle 链接 401
**根因**：`linkifyText` 中 `encodeURIComponent('@handle')` → `%40handle` → 用户未找到。
**修复**：先 `slice(1)` 去 @ 再编码。

### 5. 默认 feed 未生效
**根因**：PWA `App.tsx` 启动时不读 `getFeedConfig().defaultFeedUri`。
**修复**：feed 视图无 feedUri 时 fallback 到 `defaultFeedUri`。TUI 加 `s` 键设默认。

### 6. 搜索只支持帖子
**修复**：`useSearch` 重构为 4 标签（热门/最新/用户/动态源），PWA+TUI 均已适配。

---

## 快速命令

```bash
cd packages/tui && npx tsx src/cli.ts           # TUI
cd packages/pwa && pnpm dev                     # PWA dev
cd packages/pwa && pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true
pnpm -r typecheck && pnpm -r build
cd packages/core && npx vitest run --config vitest.config.ts
```

## 开发规则

1. 绝不硬编码凭证到提交文件
2. 新增快捷键必须查 KEYBOARD.md 冲突表
3. Ink 中 5 个 `useInput` 同时触发 → 每个需 guard
4. React Portal 合成事件沿 React 树冒泡
5. 改 AI 行为：编辑 `prompts.ts` → rebuild
