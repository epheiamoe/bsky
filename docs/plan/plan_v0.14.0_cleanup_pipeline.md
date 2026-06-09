# Plan: v0.14.0 Final Cleanup — Remove `useModerationPipeline` Dead Code

> **Date**: 2026-06-09
> **Status**: Completed
> **Decision**: 删除 `useModerationPipeline` 相关死代码，保留 `useModerationBatch` 作为标准方案

---

## 背景

经过 v0.14.0 代码审查确认：

1. `useModerationPipeline` hook 已完整实现（517 行），但**从未被任何组件使用**
2. `LoadingSafetyBanner` 和 `BlockedLoadingScreen` 组件已创建，但**从未被 import**
3. 所有 6 个列表组件使用 `useModerationBatch`，其"先显示再标记"策略效果已达成
4. `useModerationBatch` 实际上与 `useModerationPipeline` 定义在同一个文件中（`useModerationPipeline.ts`）

## 决策

**删除死代码**。理由：
- Pipeline 的 block 策略会阻塞内容显示，影响 feed 体验
- 当前 `useModerationBatch` + `LabelerFailureBanner/Toast` 已满足"失败不静默"的核心安全目标
- 保留死代码增加维护负担、构建体积和认知负载
- 如果未来需要严格的 block 策略，可以从 git 历史恢复

## 清理范围

### 1. 代码删除

| 文件/符号 | 操作 | 说明 |
|-----------|------|------|
| `packages/app/src/hooks/useModerationPipeline.ts` | 重命名为 `useModeration.ts` | 文件实际只暴露 `useModerationBatch` 和 `resolveModerationBatch` |
| `useModerationPipeline` 函数 | 删除 | 死代码 |
| `PipelineState` / `PipelineStrategy` / `PipelinePhase` / `FailedLabelerInfo` 类型 | 删除 | 仅 Pipeline 使用 |
| `packages/pwa/src/components/LoadingSafetyBanner.tsx` | 删除 | 死代码 |
| `packages/pwa/src/components/BlockedLoadingScreen.tsx` | 删除 | 死代码 |

### 2. 导入更新

- `packages/app/src/index.ts` — 更新 export source 从 `useModerationPipeline.js` 到 `useModeration.js`
- `packages/app/src/hooks/usePostsWithModeration.ts` — 移除对 `useModerationPipeline` 的 re-export
- 所有 import `useModerationPipeline` 的地方 — 移除或更新

### 3. 文档更新

- `docs/CONTEXT.md` — 将 "useModerationPipeline 死代码" 状态更新为 "已清理"
- `docs/lessons/2026-06-v0.14.0-final-review.md` — 更新 P3 状态
- `docs/LABELING.md` — 更新 hook 文件路径
- `docs/hooks/index.md` — 更新路径
- `docs/plan/plan_labeling_completion.md` — 更新 P3 为 "采用 useModerationBatch，删除 Pipeline 死代码"

### 4. i18n

- 检查 `LoadingSafetyBanner` / `BlockedLoadingScreen` 使用的 i18n keys
- 如果只有这两个组件使用，删除对应 keys
- 如果还有其他地方使用，保留

## 执行步骤

1. ✅ **子代理 A**: 删除/重命名代码文件，更新所有 import/export
2. ✅ **子代理 B**: 更新所有文档引用
3. ✅ **验证**: `pnpm -r typecheck`
4. ✅ **提交**: `cleanup: remove useModerationPipeline dead code`
5. ✅ **构建 + 部署生产**

## 回滚方案

如果需要恢复 Pipeline：
- 从 git 历史恢复 `useModerationPipeline.ts`
- 从 git 历史恢复 `LoadingSafetyBanner.tsx` / `BlockedLoadingScreen.tsx`
- 参考 plan_labeling_completion.md 的原始设计重新集成

---

*计划创建: 2026-06-09*
