---
title: "PostPreviewCard 才是实际使用的帖子卡片组件"
date: 2026-06-13
category: architecture
severity: high
---

## 问题

新增 gallery 渲染时，修改了 `PostCard.tsx` 但时间线/资料页/搜索页仍不显示 gallery。

## 根因

项目中有两个帖子卡片组件：
- `PostCard.tsx` — 功能更全，但**几乎没有页面使用它**
- `PostPreviewCard.tsx` — FeedTimeline、ProfilePage、BookmarkPage、SearchPage、ListDetailPage、ThreadView 回复都用这个

修改 PostCard 对用户不可见。

## 教训

1. **添加新 embed 渲染时，必须同时更新 `PostPreviewCard`** — 它是实际被使用的组件
2. **PostCard 和 PostPreviewCard 应该共享渲染逻辑** — 当前是重复实现
3. **grep 消费者比假设更重要** — `grep -r "PostCard\|PostPreviewCard" packages/pwa/src/pages/` 能立刻揭示真相
