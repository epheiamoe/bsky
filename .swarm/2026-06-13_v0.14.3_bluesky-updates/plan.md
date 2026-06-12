---
step: plan
agent: main (orchestrator)
task: v0.14.3 planning - Bluesky 2026 H1 feature alignment
upstream:
  - .swarm/2026-06-13_bluesky-updates/research.md
  - docs/CONTEXT.md
  - docs/TODO.md
produced_at: 2026-06-13T08:00:00Z
status: completed
---

## 编排计划

### 目标
v0.14.3：适配 Bluesky 2026 上半年新特性，重点：
1. `app.bsky.embed.gallery` 渲染 + 发帖
2. `viewExternal` 富元数据渲染
3. 图片上限从 4 提升到 10（gallery 发帖侧）
4. Chat 词表跟随（DM 兼容性）
5. 附加：翻译按钮、长文渲染、群聊支持（低优先级）

### 阶段门控

| Phase | 负责 | 产出 | 状态 |
|-------|------|------|------|
| 0: 调研 | @researcher | research.md | ✅ done |
| 1: 设计 | @architect | architecture.md | → 进行中 |
| 1: 核查 | @fact-checker | fact-check.md | → 待 @architect 完成 |
| 2: 执行 | @implementer × N | impl-*.md | ⛔ 阻塞（等用户审查） |
| 3: 审查 | @reviewer + @tester | review.md, test.md | ⛔ 阻塞 |
| 5: 合成 | main | synthesis.md | ⛔ 阻塞 |

### 关键技术决策（待 @architect 验证）

1. **gallery 是一个新 embed 类型**：`app.bsky.embed.gallery` vs 旧 `app.bsky.embed.images`
   - 1-4 张仍用 images，5+ 张用 gallery（官方行为）
   - schema maxLength: 20，客户端软限: 10
2. **gallery 渲染**：轮播组件，每张图片含 `thumbnail`/`fullsize`/`alt`/`aspectRatio`
3. **viewExternal 扩展**：新增 `source`（`viewExternalSource` 含图标/主题色）、`readingTime`、`createdAt`/`updatedAt`、`associatedRefs`/`associatedProfiles`
4. **我们不用 `@atproto/api`**，手动对接 XRPC → 无需升级包，但需手动适配新字段形状
5. **已有的 extractEmbeds 需要扩展**：新增 `extractGallery`、扩展 `ExtractExternalLink`

### 文件影响范围

```
packages/app/src/utils/extractEmbeds.ts    ← 新增 extractGallery + 扩展 ExtractExternalLink
packages/app/src/types/ (或 extractEmbeds 类型) ← ExtractGallery 接口
packages/pwa/src/components/               ← GalleryCard 轮播组件
packages/pwa/src/components/PostCard.tsx   ← gallery 渲染路径
packages/pwa/src/components/ThreadView.tsx ← gallery 渲染路径
packages/pwa/src/components/ComposePage.tsx ← 发帖支持 gallery
packages/app/src/hooks/useCompose.ts       ← buildGalleryEmbed
packages/core/src/at/client.ts             ← (可能的 XRPC 调整，若有)
packages/tui/src/components/              ← TUI gallery 渲染
packages/pwa/src/components/ExternalLinkCard.tsx ← viewExternal 富元数据
packages/app/src/i18n/locales/{en,zh,ja}.ts ← 新 i18n key
```

### 用户审查门控
用户审查 architecture.md + fact-check.md 后，确认进入 Phase 2 实施。
