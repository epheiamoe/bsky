---
step: 4
agent: implementer
task: ExternalLinkCard.tsx — rich link card component with viewExternal metadata
upstream:
  - .swarm/2026-06-13_v0.14.3_bluesky-updates/architecture.md (Task #8, lines ~504-535)
  - packages/app/src/i18n/locales/en.ts (existing external.* keys)
  - packages/app/src/i18n/locales/zh.ts
  - packages/app/src/i18n/locales/ja.ts
  - packages/pwa/src/components/BskyLinkCard.tsx (delegation pattern)
  - packages/pwa/src/components/PostCard.tsx (existing inline `<a>` pattern)
produced_at: 2026-06-13T10:15:00Z
status: completed
estimated_time: ~1.5h
---

## 实现摘要

创建了 `packages/pwa/src/components/ExternalLinkCard.tsx`，一个富外部链接卡片组件，支持 viewExternal 增强元数据（源发布者图标/主题颜色、阅读时间、缩略图、时间戳）。

## 变更清单

- [x] `packages/pwa/src/components/ExternalLinkCard.tsx` — 新建，约 210 行
- [x] `packages/app/src/i18n/locales/en.ts` — i18n 键已由先前实施者添加（无需修改）
- [x] `packages/app/src/i18n/locales/zh.ts` — 同上
- [x] `packages/app/src/i18n/locales/ja.ts` — 同上

## 关键决策

### 1. 自包含 Props 类型（避免循环依赖）
架构文档指定 `link: ExtractExternalLink`，但组件自身定义了内联属性类型，而非从 `@bsky/app` 导入 `ExtractExternalLink`。这样避免了当消费组件（如 `PostCard`）同时使用本组件和 `extractEmbeds` 时可能产生的循环依赖。组件的属性类型是 `ExtractExternalLink` 的语法子集——所有增强字段为可选。

### 2. bsky.app URL 委托给 BskyLinkCard
当 `isBskyAppUrl(link.uri)` 为 true 且提供 `onOpenInternal` 时，组件渲染 `BskyLinkCard`（已有组件，提供选择模态框）。这复用了现有的应用内导航模式。当未提供 `onOpenInternal` 时，bsky.app URL 渲染为普通外部卡片（在新标签页打开）。

### 3. colorRGBToString 内联为本地工具
此纯函数在组件文件中定义为模块级工具，而非从 `@bsky/app` 导入。保持与 `@bsky/app` 类型定义的解耦，且该函数极为简单（3 行）。

### 4. 基于 Intl.RelativeTimeFormat 的相对时间
组件使用 `Intl.RelativeTimeFormat`（支持 second/minute/hour/day/week 单位）实现区域感知的相对时间格式化，超过一周的时间戳回退为短日期格式。不再使用 `packages/pwa/src/utils/format.ts` 中的 `formatTime`，因为该函数硬编码了中文。

### 5. 主题色：内联样式优于 Tailwind
当存在 source.theme 时，通过内联 `style` 属性设置 `backgroundColor` 和 `borderColor`，因为 Tailwind 无法处理动态 RGB 值。当存在前景色时，文本颜色也通过内联样式应用。非主题卡片使用标准的 Tailwind 颜色变量。

### 6. i18n 参数名对齐
现有 i18n 键使用 `{minutes}` 作为 `external.readingTime` 的参数名，`{source}` 作为 `external.bySource` 的参数名。组件通过 `t('external.readingTime', { minutes: String(readingTime) })` 传入。注意：由于 `t()` 期望 `Record<string, string | number>` 类型，而 `readingTime` 是 `number`，因此使用 `String()` 转换，但 `number` 类型实际上也在签名中——这里是为了清晰起见。

## 组件布局逻辑

```
┌─ isBskyAppUrl? ──→ BskyLinkCard（选择模态框）
│
├─ source 存在？
│   └─ 源信息头部：[图标 16px] + 源名称
│
├─ 缩略图 存在？
│   └─ [缩略图 80×80] + 内容 flex 行
│   └─ 否则：纯内容
│
├─ 内容：
│   ├─ 标题（半粗体，line-clamp-2）
│   └─ 描述（次要颜色，line-clamp-2）
│
└─ 底部信息：
    ├─ "X min read"（如果提供了 readingTime）
    ├─ · 分隔符
    ├─ 相对时间（如果提供了 createdAt/updatedAt）
    └─ URI（截断显示）
```

## 样式系统

| 元素 | 非主题 | 有主题 |
|------|--------|--------|
| 卡片 | `border border-border` | `style={{ backgroundColor, borderColor }}` |
| 标题 | `text-text-primary` | 内联 `color: foregroundRGB` |
| 描述 | `text-text-secondary` | 内联前景色 + 70% 透明度 |
| 底部文本 | `var(--color-text-muted)` | 内联前景色 + 70% 透明度 |
| 悬停 | `hover:bg-surface` | 无（主题色已是背景色） |

## 无障碍

- 卡片为 `<a>` 标签，`target="_blank" rel="noopener noreferrer"`
- `aria-label` 包含标题 + 阅读时间 + 源名称（屏幕阅读器友好）
- 缩略图标记为 `aria-hidden="true"`（纯装饰性）
- 源图标标记为 `aria-hidden="true"`（源名称已提供文字信息）
- 点击 `e.stopPropagation()` 防止触发父级帖子卡片导航

## 下游依赖

- **Task #9 (PostCard 集成)**：`PostCard.tsx` 需将内联 `<a>` 标签（第 237-248 行）替换为 `<ExternalLinkCard link={externalLink} onOpenInternal={...} />`
- **Task #3 (extractExternalLink 增强)**：需在 `@bsky/app` 中填充 `thumb`、`createdAt`、`updatedAt`、`readingTime`、`source` 字段，才能使本组件的 rich 变体生效。父组件已经可以传入增强的 `link` 数据——未提供的字段仅导致优雅降级。
- **PostPreviewCard.tsx 和 ThreadView.tsx** 有类似的 bsky.app 分支和内联 `<a>` 标签，如有需要可进行相同迁移。
