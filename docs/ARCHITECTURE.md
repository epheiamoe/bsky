# Architecture Overview

## Layered Monorepo

```
bsky/
├── packages/
│   ├── core/        ← Layer 0: Zero UI dependencies. Pure TypeScript.
│   ├── app/         ← Layer 1: State management. React hooks (PWA-ready).
│   └── tui/         ← Layer 2: Terminal UI. Ink/React rendering only.
├── contracts/       ← Shared JSON Schemas, system prompts, AT endpoint lists
└── docs/            ← Documentation (this directory)
```

## Dependency Flow

```
┌──────────┐
│  @bsky/  │  纯 TypeScript, 零 UI 依赖
│  core     │  • BskyClient (AT Protocol HTTP)
│          │  • AIAssistant (OpenAI-compatible tool calling)
│          │  • 31 Bluesky 工具定义 + 执行
└────┬─────┘
     │ import
┌────▼─────┐
│  @bsky/  │  React hooks + 纯状态 store（PWA 可直接复用）
│  app      │  • useAuth / useTimeline / usePostDetail / useThread
│          │  • useNavigation (栈式导航状态机)
│          │  • useAIChat / useChatHistory / useTranslation
│          │  • ChatStorage 接口 (TUI: FileChatStorage, PWA: IndexedDB)
└────┬─────┘
     │ import
┌────▼─────┐
│  @bsky/  │  Ink/React 终端渲染 (PWA 不需要)
│  tui      │  • App.tsx: 视图路由器 + 集中式键盘分发
│          │  • 视图组件: FeedView/PostDetail/ThreadView/AIChatView/etc
│          │  • 布局: Sidebar + PostList + PostItem
└──────────┘
```

## Key Design Decisions

1. **Core 层零 UI 依赖**: `@bsky/core` 不 import React、Ink、DOM。任何框架都可以用它。
2. **App 层 = PWA 接口层**: `@bsky/app` 的 hooks 和 stores 是 PWA 和 TUI 的共享层。PWA 只需要 import hooks，写自己的 `<div>` 渲染。
3. **Store + Subscribe 模式**: Stores 是纯对象，通过 `_notify()` + `subscribe()` 通知 React hooks 更新。不依赖 Redux/Zustand。
4. **单一键盘处理源**: TUI 的 `App.tsx` 使用 Ink 的 `useInput` 作为唯一的键盘处理器，按 `currentView.type` 路由到各视图动作。
5. **ChatStorage 接口**: 聊天持久化通过接口抽象，TUI 用 JSON 文件，PWA 可实现 IndexedDB。

## View Navigation

```
feed ──Enter──▶ detail ──R──▶ compose (replyTo=uri)
  ▲               │  ▲         │  └──submit──▶ feed (refresh)
  │──Esc──────────┘  │──Esc────┘
  │                  │
  │                  ──H──▶ thread (展开对话树)
  │                           ▲  │
  │─────────────────Esc───────┘  │
  │                              │
  │                              ──Enter──▶ detail (重新聚焦某条回复)
  │                                            ▲  │
  │──────────────────────────Esc───────────────┘  │
  │
  ──a──▶ aiChat
           ▲  │
           │──Esc (2次)──▶ feed
           │
           Tab: 切换聚焦 (AI面板 ↔ 主面板)
```
