# Context Compression Recovery Guide

> 当 AI 会话上下文被压缩后，阅读本文档快速恢复工作状态。

## 必读文件（按优先级）

1. **`AGENTS.md`** — 架构原则、安全红线、命令参考
2. **`docs/CONTEXT.md`** — 本文（上下文恢复）
3. **`docs/ARCHITECTURE.md`** — 系统架构、依赖关系、关键决策
4. **`docs/PACKAGES.md`** — 各包职责与文件清单
5. **`docs/HOOKS.md`** — 所有 hook 签名与返回类型
6. **`docs/DESIGN.md`** — PWA 设计系统（色板、字体、间距）
7. **`docs/PWA_GUIDE.md`** — PWA 部署与架构
8. **`docs/KEYBOARD.md`** — TUI 快捷键映射
9. **`docs/AI_SYSTEM.md`** — AI 集成架构
10. **`docs/TODO.md`** — 功能状态（TUI/PWA 进度）
11. **`docs/USER_ISSUSES.md`** — 已修复的用户问题记录

## 项目当前状态

### 部署
- **GitHub**: https://github.com/epheiamoe/bsky (`master` 分支)
- **PWA 在线**: https://ai-bsky.pages.dev
- **部署命令**: `cd packages/pwa && pnpm build && npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true`
- **审核**: Git 历史已审计，无机密泄露

### 模型
- **AI 模型**: `deepseek-v4-flash`（替代即将废弃的 deepseek-chat）
- **17 处**全部替换完成

## 关键结论

### 架构原则
- `@bsky/core` → `@bsky/app` → `@bsky/tui | @bsky/pwa`
- **业务逻辑只写一次**在 core+app 层，TUI 和 PWA 只写渲染层
- 新增功能：core API → app hook/utility → tui 界面 + pwa 界面

### 实现细节（10 条）
1. **BskyClient**: 双端点（`this.ky`=bsky.social PDS, `this.publicKy`=public.api.bsky.app AppView）
2. **JWT 自动刷新**: ky.afterResponse hook → raw fetch refreshSession → 200ms 延迟防 TLS 争用 → 透明重试
3. **AI 流式**: sendMessageStreaming() SSE 解析 → yield tokens; preserve reasoning_content
4. **翻译双模式**: simple(纯文本) / json(source_lang+translated); 最多 3 次重试 800ms/1600ms/2400ms
5. **PWA 路由**: useHashRouter() — pushState+popstate, `#/view?param=value`
6. **PWA 时间线**: useTimeline 在 App.tsx 层持有，虚拟滚动 (@tanstack/react-virtual)，IntersectionObserver 自动加载
7. **图片 CDN**: `bsky.social/xrpc/com.atproto.sync.getBlob?did=...&cid=...` (302 跳转)
8. **ChatStorage**: TUI=FileChatStorage(JSON), PWA=IndexedDBChatStorage(IndexedDB)
9. **媒体上传**: compose via ComposeImage[] — PWA: 文件选择器+预览, TUI: `i` 键→路径输入+Enter 上传（最多 4 张, 1MB/张）
10. **Tailwind**: `var(--color-*)` CSS 变量, `@apply` 不支持透明度修饰符 — 用 color-mix() 替代
11. **Node stubs**: Vite alias 映射 os/fs/path 到空实现
12. **侧边栏**: PWA 统一侧边栏(含👤我), 窄屏用 ☰ 汉堡菜单
13. **Markdown**: PWA=react-markdown+remark-gfm+rehype-highlight, TUI=自研 parser→Ink Text

### 当前问题
- 无已知问题

### 最近完成的工作
- ✅ 虚拟滚动 + 自动加载时间线
- ✅ 媒体上传（TUI/PWA）
- ✅ 翻译状态隔离（切换帖子清除）+ 纯图片帖禁用翻译
- ✅ 通知交互（↑↓/jk 导航, Enter 查看帖子）
- ✅ 模型迁移 deepseek-chat → deepseek-v4-flash
- ✅ 部署到 Cloudflare Pages (ai-bsky.pages.dev)
- ✅ GitHub 推送 + 安全审计

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

# Full typecheck
pnpm -r typecheck
pnpm -r build
```

## 环境
- `.env` (gitignored): BLUESKY_HANDLE, BLUESKY_APP_PASSWORD, LLM_API_KEY
- `.env.example` (committed): 模板
- PWA: 无 .env — 凭证通过登录表单+localStorage
- AI key: PWA 通过设置页(⚙️)配置, 持久化到 localStorage
