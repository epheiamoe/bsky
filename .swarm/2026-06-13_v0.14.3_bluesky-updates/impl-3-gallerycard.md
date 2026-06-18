---
step: 3
agent: implementer
task: Create GalleryCard.tsx — swipeable image carousel for app.bsky.embed.gallery
upstream:
  - .swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md (Task #7)
  - packages/pwa/src/components/VideoCard.tsx (border/rounding pattern)
  - packages/pwa/src/components/ImageGrid.tsx (ALT badge pattern)
  - packages/pwa/src/components/Icon.tsx (SVG icon pattern)
produced_at: 2026-06-13T16:00:00+08:00
status: completed
estimated_time: 30 min
---

## 实现摘要

创建了 `GalleryCard.tsx` — 用于 `app.bsky.embed.gallery` 嵌入的可滑动图片轮播组件。同时向所有三个语言文件添加了 i18n 键（发现键已由之前的任务添加，已移除重复项）。

## 变更清单

- [x] `packages/pwa/src/components/GalleryCard.tsx` — 新建（233 行）
- [x] `packages/app/src/i18n/locales/en.ts` — 删除了重复的 gallery 键（之前已由另一个任务添加）
- [x] `packages/app/src/i18n/locales/zh.ts` — 删除了重复的 gallery 键
- [x] `packages/app/src/i18n/locales/ja.ts` — 删除了重复的 gallery 键

## 关键决策

1. **重复键**：`gallery.*` i18n 键已存在于所有三个语言文件中（第 748-751 行 en，第 899-902 行 zh，第 758-761 行 ja），很可能来自此 swarm 中的另一个实现步骤。这些现有键的值与组件的 `t()` 调用模式匹配，因此直接移除重复项。

2. **键盘可聚焦性**：在外层容器上添加了 `tabIndex={0}` 以使其获得焦点并接收 `onKeyDown` 事件。架构文档未明确提及此项，但这是键盘无障碍操作所必需的。

3. **非空断言**：在触摸事件处理中，对 `e.touches[0]` 和 `e.changedTouches[0]` 使用了 `!` 断言，因为在 `TouchEvent` 上下文中它们始终存在且非空。

4. **切换阈值**：按规格使用 50px 切换距离，与实现 4 中的 `ImageLightboxDialog` 触摸处理模式一致。

5. **ALT 徽章**：复用了来自 `ImageGrid.tsx` 的完全相同的内联 SVG 模式，并使用 `pointer-events-none` 确保徽章不会捕获原本应传递给图片的点击事件。

## 遇到的问题

1. **重复的 i18n 键**：初始提交引入了 `gallery.*` 键，但 `tsc` 报 TS1117 错误（对象字面量中存在同名属性）。追查后发现另一个 swarm 任务已经添加了相同的键。已移除重复项，保留原有值不变。

2. **翻译差异**：ja.ts 中两个重复集的翻译不同（例如 `'画像カルーセル'` vs `'画像ギャラリー'`）。保留了与 `slideN` 的 `{current}/{total}` 模板一致的较早版本。

## 下游依赖

- 组件需要连接到 `EmbedRenderer`（Task #9）以根据 `app.bsky.embed.gallery` 类型进行渲染
- `onImageClick` 属性需要父组件实现 `ImageLightboxDialog` 的打开逻辑
- `GalleryImage` 接口应与 `extractGallery()` 工具函数的返回类型匹配（若尚未实现，该函数位于 `@bsky/app`）
- `gallery.*` i18n 键已存在于所有三个语言文件中 — 下游组件可直接使用它们
