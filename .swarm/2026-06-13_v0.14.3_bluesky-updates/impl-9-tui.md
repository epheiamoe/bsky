---
step: 9
agent: implementer
task: TUI Gallery embed rendering + MAX_IMAGES update
upstream: [.swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md]
produced_at: 2026-06-13T00:00:00+08:00
status: completed
estimated_time: 1h
---

## 实现摘要

为 TUI 客户端（终端）添加了 gallery embed 的文本渲染，包括导航功能。由于终端无法显示图片，使用索引导航方式展示 gallery：
- 显示 `[Gallery: 当前/总数]` 和导航提示
- 显示当前图片的 ALT 文本和宽高比
- 提供图片 URL 的点击链接（OSC 8）
- 支持 ←/→ 方向键和 h/l 键切换图片
- 同时将 compose 中的 MAX_IMAGES 从 4 更新到 10

## 变更清单

- [x] `packages/app/src/index.ts` — 新增 `extractGallery` 导出
- [x] `packages/tui/src/components/PostItem.tsx` — 导入 extractGallery，添加 gallery 渲染逻辑
- [x] `packages/tui/src/components/PostList.tsx` — 新增 `galleryIdx` prop，传递给 postToLines
- [x] `packages/tui/src/components/App.tsx` — 添加 gallery 状态管理、键盘导航、MAX_IMAGES 10
- [ ] `packages/pwa/package.json` — 无关变更（预存在）

## 关键决策

1. **使用 ←/→ 和 h/l 而非 j/k**：feed 视图中 j/k 已用于上下导航，改用 h/l（vim 风格左右移动）和方向键
2. **galleryIdx 按 post URI 存储**：使用 `Map<string, number>` ref 在帖子间切换时保留导航位置
3. **仅渲染画廊详情（非图片列表）**：gallery embed 独立于 images embed，当 gallery 存在时不会同时渲染 images；使用 `extractGallery` 直接提取而非通过 `extractEmbeds`
4. **导航提示仅在选中时显示**：`isSelected` 为 true 时显示 `← h · l →` 提示，非选中时仅显示静态计数

## 遇到的问题

1. **`extractGallery` 未从 `@bsky/app` 导出**：该函数在 extractEmbeds.ts 中定义但未加入 index.ts barrel export。已在 index.ts 中添加导出并重新构建 app 包。

2. **i18n 参数类型**：PWA 中 `gallery.slideN` 使用数字参数（`{ current: i + 1, total: images.length }`），最初传递字符串参数。已修正为数字。

## 下游依赖

- @reviewer 需审查 TUI 的 gallery 渲染逻辑和键盘导航
- @tester 可用 gallery 帖子测试导航功能
