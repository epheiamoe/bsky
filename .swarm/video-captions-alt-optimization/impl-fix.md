---
step: fix
agent: implementer
task: Fix review issues for video captions/alt optimization
upstream:
  - .swarm/video-captions-alt-optimization/review.md
produced_at: 2026-06-11T20:41:00+08:00
status: completed
estimated_time: 15m
---

## 实现摘要

按审查报告修复了两个问题：

1. **补全 i18n 键** — 在 `en.ts`/`zh.ts`/`ja.ts` 中新增 `compose.videoMetadataModalTitle`，放置于已有的 `compose.videoAltPlaceholder` 之前，保持视频相关文案聚合。
2. **强制字幕数量上限** — 在 `AltTextModal.tsx` 中新增 `maxCaptions = 20` 常量与 `atMaxCaptions` 状态，当已添加字幕数达到上限时：
   - “添加字幕”按钮置为 `disabled`；
   - 按钮样式切换为灰色、不可点击（`opacity-50 cursor-not-allowed`）；
   - `handleFileSelect` 入口处增加硬上限兜底，防止文件输入被程序化触发时仍添加字幕。

## 变更清单

- [x] `packages/app/src/i18n/locales/en.ts`：新增 `'compose.videoMetadataModalTitle': 'Subtitles & Alt Text'`
- [x] `packages/app/src/i18n/locales/zh.ts`：新增 `'compose.videoMetadataModalTitle': '字幕及替代文本'`
- [x] `packages/app/src/i18n/locales/ja.ts`：新增 `'compose.videoMetadataModalTitle': '字幕と代替テキスト'`
- [x] `packages/pwa/src/components/AltTextModal.tsx`：
  - 新增 `maxCaptions`/`atMaxCaptions` 变量
  - 给“添加字幕”按钮增加 `disabled` 与条件样式
  - 在 `handleFileSelect` 中加入上限兜底判断

## 关键决策

- 选择**禁用按钮 + 灰色样式**的方案，而非隐藏添加区域。这样用户在达到上限时仍能看见已禁用的添加入口，并通过现有的 `compose.maxCaptions` 文案了解限制，避免界面突然变化造成困惑。
- 上限值提取为局部常量 `maxCaptions = 20`，与提示文案中的 `20` 保持一致，未来若需调整可只改一处。

## 遇到的问题

无。TypeScript 类型检查（`tsc --noEmit`）在 `packages/app` 与 `packages/pwa` 均通过。

## 下游依赖

- 无需进一步修改。`AltTextModal` 的 props 与保存逻辑未变，调用方不受影响。
- 建议 @reviewer 再次确认按钮在达到 20 条字幕时的视觉状态与可访问性表现。
