# AGENTS.md — AI Agent & Developer Guide

> Read this before working on the project. Reference `AGENTS.local.md` for machine-specific notes (gitignored, never pushed).

## Context Recovery

> **会话上下文被压缩后，按此顺序恢复**：
> 1. `docs/CONTEXT.md` — 版本号、项目状态、关键架构、开发规则
> 2. `docs/ARCHITECTURE.md` — 系统架构、依赖流、TUI/PWA 差异、关键决策
> 3. `docs/LESSONS.md` — 历次会话详细教训（69 课分类索引）
> 4. `docs/TODO.md` — 功能完成状态对照表

---

## 必读文档索引

| 场景 | 文档 | 说明 |
|------|------|------|
| **首次接触 / 上下文恢复** | `docs/CONTEXT.md` | 版本、项目状态、快速命令、开发规则、架构模式 |
| **系统架构** | `docs/ARCHITECTURE.md` | Monorepo 结构、依赖流、TUI/PWA 差异、关键决策 |
| **文件清单** | `docs/PACKAGES.md` | 各包完整文件列表 |
| **Hook 签名** | `docs/hooks/index.md` | 所有 hook 分类索引、store 模式 |
| **AI 系统** | `docs/ai/index.md` | ApiAdapter 模式、7 个 Provider、33 个工具、流式 SSE |
| **MCP 服务器** | `docs/MCP.md` | MCP 实现记录、测试路径、npm 发布 |
| **DM 私信** | `docs/DM.md` | API/鉴权/模型/教训 |
| **虚拟滚动** | `docs/SCROLL.md` | 虚拟滚动 + 滚动恢复规范（必须用像素值） |
| **TUI 快捷键** | `docs/KEYBOARD.md` | 全局/视图快捷键、冲突表、预留键 |
| **PWA 设计系统** | `docs/DESIGN.md` | 颜色、字体、组件规范 |
| **PWA 架构** | `docs/PWA_GUIDE.md` | 组件映射、部署、Pages Functions |
| **AT Play** | `docs/ATPLAY.md` | 社交圈分析数据管线/API/组件 |
| **第三方 PDS** | `docs/PDS.md` | PDS 发现管线、CORS 处理 |
| **Python 沙箱** | `docs/PYTHON_SANDBOX_STATUS.md` | Pyodide WASM、工作区、Phase 1-14 状态 |
| **下一阶段计划** | `docs/PHASE14_PLAN.md` | AI Batch AT Tool Calls（bluesky_tools Python 库）完整技术方案 |
| **用户问题** | `docs/USER_ISSUSES.md` | 已知 & 已解决问题日志 |
| **术语** | `docs/TERMINOLOGY.md` | 主题帖/回复/讨论串等命名规范 |
| **TUI 工具** | `docs/TUI_UTILS.md` | CJK 文本换行、鼠标追踪 |
| **功能状态** | `docs/TODO.md` | TUI/PWA 功能完成对照表 |
| **教训索引** | `docs/LESSONS.md` | 69 课分类索引 → `docs/lessons/*.md` |
| **归档文档** | `docs/archive/` | 历史文档、旧版教训 (21-45) |

---

## Critical Safety Rules

- **NEVER** hardcode credentials, handles, DIDs, API keys, or JWTs in ANY committed file
- **NEVER** write local file paths in committed files
- **NEVER** add a UI string without i18n keys in **ALL 3 locales** (`en.ts`, `zh.ts`, `ja.ts`)
- The ONLY place for local secrets is `.env` (gitignored) and `AGENTS.local.md` (gitignored)
- **ALWAYS commit atomically** — each commit is one logical change. Stage specific files with `git add <path>`; never `git add -A` blindly
- Test files MUST use `process.env.VARIABLE_NAME` — never hardcoded values

## Quick Start

```bash
pnpm install
pnpm -r build          # build all packages

# TUI
cd packages/tui && npx tsx src/cli.ts

# PWA dev
cd packages/pwa && pnpm dev     # http://localhost:5173

# PWA deploy (staging → test → production)
cd packages/pwa && pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --branch=staging
# [test] && npx wrangler pages deploy dist --project-name ai-bsky --branch=production

# Tests (real API calls, no mocks)
cd packages/core && npx vitest run --config vitest.config.ts

# TypeScript check all packages
pnpm -r typecheck
```

## Architecture

```
@bsky/core ──→ @bsky/app ──→ @bsky/tui (terminal)
   │                      └─→ @bsky/pwa (browser)
   │
   └── @epheiamoe/bsky-mcp (npm: MCP server)
```

**Golden rule**: Business logic lives ONCE in `core` + `app`. TUI, PWA, and MCP only write render/transport layers.

### Adding a new feature
1. `@bsky/core` — add API method to `BskyClient` if needed
2. `@bsky/app` — create hook or pure utility
3. `@bsky/tui` — render with Ink (Text/Box components)
4. `@bsky/pwa` — render with React DOM + Tailwind

## Development Rules (Quick Reference)

1. **i18n**: ALL user-visible strings via `t('key')`. Template: `{n}` (single braces). Add to `en.ts`/`zh.ts`/`ja.ts`
2. **Keyboard**: New shortcuts MUST check `docs/KEYBOARD.md` conflict tables. Ink fires ALL `useInput` callbacks — guards must be view-specific
3. **Quoted posts**: ALWAYS read from `(post as any).embed` (API-resolved `#view`), NEVER `post.record.embed`
4. **Icons**: PWA → `<Icon name="...">` (SVG, `packages/pwa/src/icons/`). TUI → emoji
5. **Embed extraction**: Use `@bsky/app` shared utils (`extractImages`, `extractVideo`, `extractExternalLink`, `extractQuotedPost`). NEVER inline
6. **Scroll restore**: MUST use pixel values (`scrollTop`), never indices (`scrollToIndex`)
7. **AI tools**: New `requiresWrite` tool MUST add `buildToolDescription` case
8. **Commit → Build → Deploy**: Commit before build for correct `__COMMIT_HASH__`
9. **PDS**: `chatKy` direct to `api.bsky.chat` + session JWT. No PDS proxy (returns 501)
10. **Widget**: `WidgetPanel` provides header; widget provides content only. All `toggleWidget()` calls persist via `_onWidgetToggle` → `saveAppConfig()`
11. **Version bumping**: When a change requires a version bump, check `packages/pwa/package.json` and the current version in `docs/CONTEXT.md`. If the next version is uncertain — especially for cross-feature releases — **ask the user** before bumping. After bumping, immediately update version references in `README.md`, `README.zh.md`, `CHANGELOG.md`, and `docs/CONTEXT.md`.
12. **Documentation**: When changes affect documented behavior, update relevant docs immediately:
    - Code changes that alter hook signatures → update `docs/hooks/`
    - New/modified AI tools → update `docs/ai/tools.md`
    - New providers or adapter changes → update `docs/ai/providers.md` or `docs/ai/adapter.md`
    - Architecture changes → update `docs/ARCHITECTURE.md`
    - If a doc is actively changing, add `[WIP]` or `[v0.X.0+]` at the top
    - Outdated docs that are superseded should be moved to `docs/archive/`

## AI Guidance

Built-in AI-readable docs at `/llm.txt`, `/README.md`, `/CHANGELOG.md` (copied to `dist/` during build).

---

## Detailed References (按需查阅)

以下详细内容已移至独立文档，避免增加上下文负担：

| 主题 | 文档 | 内容 |
|------|------|------|
| BskyClient 双 ky 实例、JWT 刷新、PDS 发现 | `docs/ARCHITECTURE.md` | `this.ky` (writes) + `this.publicKy` (reads), `withRefresh` 并发锁 |
| PWA 路由 | `docs/ARCHITECTURE.md` | `useHashRouter()` — `history.pushState` + `popstate`, `#/view?param=value` |
| 虚拟滚动 | `docs/SCROLL.md` | `@tanstack/react-virtual` + `useVirtualizedList()` + 像素值恢复 |
| 图片 CDN | `docs/ARCHITECTURE.md` | `cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}@{ext}` |
| Tailwind + CSS 变量 | `docs/DESIGN.md` | `var(--color-primary)`, `--color-background`, CVD palette (`.cvd`) |
| WCAG 合规 | `docs/ARCHITECTURE.md` | `aria-pressed`, `role="alert"/"status"`, `htmlFor`/`id`, skip-link |
| AI ALT 图像描述 | `docs/ai/features.md` | `describeImage()`, `_altCache`, `imageDescLang` |
| ChatStorage 工厂 | `docs/ARCHITECTURE.md` | `setChatStorageFactory()` + `IndexedDBChatStorage` (PWA) / `FileChatStorage` (TUI) |
| PostActionsRow | `docs/ARCHITECTURE.md` | 共享组件，覆盖所有视图 |
| 模块级状态 | `docs/ARCHITECTURE.md` | `usePostActions`, `useActiveFeed`, `useScrollRestore`, `widgetStore` |
| AI Sessions | `docs/ai/index.md` | `#/ai?session=uuid`, `ChatRecord.context`, `/view` 命令 |
| Lists Feature | `docs/ARCHITECTURE.md` | v0.6.0, 15 methods, CRUD + mute/unmute/block |
| Widget System | `docs/ARCHITECTURE.md` | v0.5.3+, 6 widgets, header bar, persistence |
| AT Play | `docs/ATPLAY.md` | v0.7.0+, Social Circle, Mermaid, pure functions |

---

*For context compression recovery, start with `docs/CONTEXT.md`.*
