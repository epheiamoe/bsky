# Context Compression Recovery Guide

> 当 AI 会话上下文被压缩后，阅读本文档快速恢复工作状态。

## 必读文件（按优先级）

1. **`docs/ARCHITECTURE.md`** — 系统架构、依赖关系、关键决策
2. **`docs/PACKAGES.md`** — 各包职责与文件清单
3. **`docs/TODO.md`** — 功能状态（TUI/PWA 进度）
4. **`docs/DESIGN.md`** — PWA 设计系统（色板、字体、间距）
5. **`docs/PWA_GUIDE.md`** — PWA 快速启动与部署指南
6. **`docs/HOOKS.md`** — 所有 hook 签名与返回类型
7. **`docs/KEYBOARD.md`** — TUI 快捷键映射
8. **`docs/AI_SYSTEM.md`** — AI 集成架构
9. **`docs/CHAT_STORAGE.md`** — 聊天存储接口
10. **`docs/USER_ISSUSES.md`** — 已修复的用户问题记录

## 关键结论

### 架构原则
- `@bsky/core` → `@bsky/app` → `@bsky/tui | @bsky/pwa`
- **业务逻辑只写一次**在 core+app 层，TUI 和 PWA 只写渲染层
- 新增功能流程：core API → app hook → tui 界面 + pwa 界面

### 关键实现细节
1. **BskyClient**: 双端点（`this.ky` = bsky.social PDS, `this.publicKy` = public.api.bsky.app AppView）
2. **JWT 自动刷新**: ky.afterResponse hook 拦截 ExpiredToken → raw fetch refreshSession → 透明重试
3. **AI 流式**: sendMessageStreaming() 解析 SSE → yield tokens；preserve reasoning_content
4. **翻译双模式**: simple（纯文本）/ json（source_lang + translated）；最多 3 次重试，指数退避
5. **PWA 路由**: useHashRouter() — history.pushState + popstate, hash 格式 `#/view?param=value`
6. **PWA 时间线**: useTimeline 在 App.tsx 层持有（跨导航持久化），虚拟滚动 via @tanstack/react-virtual
7. **图片 CDN**: `bsky.social/xrpc/com.atproto.sync.getBlob?did=...&cid=...`（302 跳转，浏览器自动跟随）
8. **ChatStorage**: TUI 用 FileChatStorage（JSON 文件），PWA 用 IndexedDBChatStorage（IndexedDB）
9. **Tailwind CSS 变量**: 使用 `var(--color-*)` 自定义色板，`@apply` 不支持 CSS 变量透明度 `/50`
10. **Node 模块 stub**: PWA 用 Vite alias 将 `os/fs/path` 映射到空实现（FileChatStorage 在浏览器中永不被调用）

### 当前问题
- 无

### 上次进行中的工作
- 虚拟滚动 + 自动加载时间线 ✅ 已完成
- 媒体上传（TUI: 文件路径输入 / PWA: 文件选择器） ✅ 已完成

## 快速命令

```bash
# TUI
cd packages/tui && npx tsx src/cli.ts

# PWA dev
cd packages/pwa && pnpm dev

# PWA build
cd packages/pwa && pnpm build    # 产出 dist/

# Tests
cd packages/core && npx vitest run --config vitest.config.ts

# Full typecheck
pnpm -r typecheck
```

## 环境要求
- `.env` 文件（TUI 用，PWA 不用）：BLUESKY_HANDLE, BLUESKY_APP_PASSWORD, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
- PWA 凭证通过登录表单 + localStorage 管理
- AI API key 通过 PWA 设置页配置
