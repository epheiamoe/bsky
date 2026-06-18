---
step: 2
agent: implementer
task: video-captions-alt-optimization — 网络层优化
upstream:
  - .swarm/video-captions-alt-optimization/architecture.md
  - packages/core/src/at/client.ts
produced_at: 2026-06-11T14:30:00+08:00
status: completed
estimated_time: 15min
---

## 实现摘要

根据设计文档"网络层变更"章节，完成了 `packages/core/src/at/client.ts` 的三项修改：

1. **扩展 `uploadBlob` 方法**：新增可选 `options?: { timeoutMs?: number }` 参数，未传入时保持默认 30s 不变（向后兼容）。
2. **新增 `calculateUploadTimeout` 静态方法**：基于保守上传速率 256 KB/s 计算合理超时，范围 60s–600s。
3. **调整 `this.ky` retry 配置**：从 `statusCodes` 中移除 `408`，避免大文件在慢网络下被无意义地重复上传。

## 变更清单

### `packages/core/src/at/client.ts`

- **第 654–678 行**：`uploadBlob` 扩展 + `calculateUploadTimeout` 新增
  - `uploadBlob` 签名从 `(data, mimeType)` 扩展为 `(data, mimeType, options?)`
  - 单次调用级 `timeout` 覆盖：`timeout: options?.timeoutMs ?? 30000`
  - 新增 `static calculateUploadTimeout(fileSizeBytes: number): number`

- **第 158 行**：构造函数中 `this.ky` 的 retry `statusCodes` 移除 `408`
  - 修改前：`[408, 413, 429, 500, 502, 503, 504]`
  - 修改后：`[413, 429, 500, 502, 503, 504]`

- **第 243 行**：`login()` 方法中重新创建 `this.ky` 时同样移除 `408`

- **第 724 行**：`restoreSession()` 方法中重新创建 `this.ky` 时同样移除 `408`

## 关键决策

- **仅修改 `this.ky`**：`publicKy` 和 `chatKy` 的 retry 配置未改动，因为它们不用于大文件上传；且 `entryKy`（login 专用）也未改动。
- **`static` 而非实例方法**：使 `ComposePage` 等调用方可以在**不上传**的情况下预计算 timeout，避免不必要的实例依赖。
- **保守速率 256 KB/s**：基于 2 Mbps 的保守估计，覆盖了绝大多数移动/弱网场景；最小 60s 避免了小文件过度等待，最大 600s 防止无限等待。

## 遇到的问题

- `pnpm -r typecheck` 全局检查时，`packages/pwa` 报 `AltTextModal` 类型不匹配错误（`Type '(alt: string) => void' is not assignable...`）。此错误与本次修改无关，是其他实现环节（UI 模态框重构）需要处理的问题。`packages/core` 自身类型检查通过。

## 下游依赖

- `ComposePage.tsx` 可在视频上传前调用 `BskyClient.calculateUploadTimeout(vid.data.length)` 获取动态 timeout
- 调用 `client.uploadBlob(vid.data, vid.mimeType, { timeoutMs: calculatedTimeout })` 传入自定义超时
- 建议下游在超时错误提示中使用 `t('compose.uploadTimeout')` i18n 键（已在设计文档中定义）

## 验证命令

```bash
cd packages/core && npx tsc --noEmit   # 通过
```

## Git 提交

```bash
git add packages/core/src/at/client.ts
git commit -m "feat(core): extend uploadBlob with optional timeout + dynamic timeout calc

- uploadBlob now accepts options?: { timeoutMs?: number }
- Add static calculateUploadTimeout(fileSizeBytes) for video uploads
- Remove 408 from ky retry statusCodes to avoid re-uploading large files on slow networks"
```

提交哈希：`c532a9b`
