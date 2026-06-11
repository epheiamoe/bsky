---
step: 5
agent: orchestrator
task: video-captions-alt-optimization
produced_at: 2026-06-11
status: completed
---

# 合成报告：视频字幕+ALT+长视频+超时优化

## 执行摘要

成功实现了 Bluesky 客户端的视频字幕（VTT）、ALT 文本、长视频支持（300MB）和上传超时优化。所有修改通过类型检查，已原子提交到 git。

## 修改文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/core/src/at/client.ts` | 修改 | `uploadBlob` 支持 `timeoutMs?`；新增 `calculateUploadTimeout`；移除 408 重试 |
| `packages/pwa/src/components/AltTextModal.tsx` | 重构 | `AltTextModal` → `MediaMetadataModal`，支持图片/视频双模式，VTT 字幕管理 |
| `packages/app/src/hooks/useCompose.ts` | 修改 | `ComposeMedia` 扩展 `captions?`/`aspectRatio?`；新增 `buildVideoEmbed` 辅助函数 |
| `packages/pwa/src/components/ComposePage.tsx` | 修改 | `LocalVideo` 扩展；动态超时上传；字幕 blob 上传；300MB 上限+警告；视频元数据按钮 |
| `packages/app/src/i18n/locales/en.ts` | 修改 | 13 个新键 |
| `packages/app/src/i18n/locales/zh.ts` | 修改 | 13 个新键 |
| `packages/app/src/i18n/locales/ja.ts` | 修改 | 13 个新键 |
| `docs/hooks/compose.md` | 修改 | 更新 ComposeMedia 接口文档 |
| `docs/ARCHITECTURE.md` | 修改 | 补充 uploadBlob 超时说明 |
| `docs/PWA_GUIDE.md` | 修改 | 更新 ComposePage 功能描述 |

## Git 提交历史

```
b1c0046 docs: update compose/media docs for video captions, alt, dynamic timeout
ea95944 feat(i18n+compose): video captions, alt, large file support, dynamic timeout
e995a15 fix: add missing i18n key + enforce caption limit (20) in UI
89fb082 refactor(pwa): AltTextModal → MediaMetadataModal with video caption support
c532a9b feat(core): extend uploadBlob with optional timeout + dynamic timeout calc
```

## 验收标准对照

| # | 验收项 | 状态 |
|---|--------|------|
| 1 | 用户可为视频添加 ALT 文本（最长 10000 字符） | ✅ |
| 2 | 用户可为视频添加最多 20 个 VTT 字幕文件 | ✅ |
| 3 | 视频预览区域显示"字幕及替代文本"按钮 | ✅ |
| 4 | MAX_VIDEO_SIZE 提升至 300MB，>100MB 时显示风险警告 | ✅ |
| 5 | 视频上传使用动态计算的 timeout（基于文件大小） | ✅ |
| 6 | 超时错误提示明确告知用户是网络/文件大小问题 | ✅ |
| 7 | 所有新 UI 字符串已添加到 en/zh/ja | ✅ |
| 8 | 图片 ALT 功能保持 100% 向后兼容 | ✅ |
| 9 | 无内存泄漏 | ✅（blob URL 在 unmount/remove 时释放） |

## 已知限制

1. **VTT 编码**：当前直接原样上传，不处理非 UTF-8 编码转换（MVP 豁免，已标注技术债）
2. **Video Service 预处理**：当前使用简单 uploadBlob 方法，未实现 Bluesky 推荐的 video.bsky.app 预处理流程（预留了扩展接口）
3. **宽高比检测**：依赖浏览器 video 元素 loadedmetadata 事件，极端情况下可能失败（此时 aspectRatio 为 undefined，不影响发布）
4. **Lexicon 100MB 限制**：实际支持 300MB，但 Bluesky 官方 lexicon 标注 100MB。>100MB 视频上传可能被某些实例拒绝（已添加用户警告）

## 风险评估

- **低风险**：所有修改都在现有架构内扩展，未引入新的依赖
- **向后兼容**：图片 ALT 功能未改变，旧帖子不受影响
- **回退策略**：如需快速禁用字幕功能，可在 ComposePage 中隐藏"字幕及替代文本"按钮并跳过字幕上传逻辑

## 下一步建议

1. 在生产环境测试大视频（>100MB）上传，确认服务端实际限制
2. 考虑实现 Bluesky Video Service 预处理（app.bsky.video.uploadVideo）以获得更好的上传体验
3. 添加字幕语言下拉选择（常用语言）替代自由文本输入

## 相关文档

- 设计文档：`.swarm/video-captions-alt-optimization/architecture.md`
- 审查报告：`.swarm/video-captions-alt-optimization/review.md`
- 实现摘要：`.swarm/video-captions-alt-optimization/impl-*.md`
