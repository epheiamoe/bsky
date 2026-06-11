# Bluesky Video Service 预处理管道实现教训

## 背景
2026-06-12 实现 Bluesky Video Service 预处理管道，替代简单的 uploadBlob 方案。

## 教训

### 1. 第三方服务的错误处理需要分层

**问题**：最初实现使用 catch-all 回退，导致 413（文件过大）和 429（限流）也回退到 uploadBlob，掩盖了真正的错误。

**解决方案**：
- 明确区分"可回退错误"和"不可回退错误"
- 413/429/用户取消 → 直接抛出，不回退
- 其他所有错误（5xx、网络错误、处理失败、超时）→ 回退到 uploadBlob

### 2. AbortController 和事件监听器的生命周期管理

**问题**：`signal?.addEventListener('abort', handler)` 注册了监听器但忘记在 finally 中移除，导致每次上传泄漏一个闭包。

**解决方案**：
```typescript
const abortHandler = () => controller.abort();
signal?.addEventListener('abort', abortHandler);
try {
  // ... fetch ...
} finally {
  signal?.removeEventListener('abort', abortHandler);
}
```

### 3. 重试策略需要区分错误类型

**问题**：最初上传失败后立即回退，没有重试。但实际上网络抖动或服务端 5xx 是暂时的，应该重试。

**解决方案**：
- 5xx / 网络错误：重试 2 次
- 413 / 429：不重试，直接失败
- 使用 `for` 循环 + `continue` 实现重试，避免递归

### 4. 预留接口 vs 实际实现

**问题**：用户要求"分片上传"，但 Bluesky Video Service API 目前不支持。

**决策**：
- 在 `VideoUploadOptions` 中保留 `chunkSize` 参数
- 当前实现忽略该参数，使用单文件上传
- 接口层面支持分片，未来只需替换底层实现
- 明确告知用户当前限制

### 5. 轮询需要绑定 AbortSignal

**问题**：`_pollVideoJobStatus` 的 `fetch` 调用未绑定 AbortSignal，用户取消后当前正在进行的请求仍会完成。

**解决方案**：
```typescript
const controller = new AbortController();
const abortHandler = () => controller.abort();
signal?.addEventListener('abort', abortHandler);
try {
  const res = await fetch(url, { signal: controller.signal });
} finally {
  signal?.removeEventListener('abort', abortHandler);
}
```

### 6. 渐进式功能交付

**问题**：设计文档中包含了手动模式（disableAutoFallback + VideoProcessingError + 重试/跳过按钮），但实现时为了快速交付 MVP，阉割了这部分。

**反思**：
- 设计阶段应该明确区分 MVP 和 v2 功能
- 手动模式可以作为 v2 增强，不影响核心功能
- 在设计文档中标注"MVP 豁免"避免审查时的期望落差

## 相关文件
- `.swarm/video-service-pipeline/architecture.md`
- `.swarm/video-service-pipeline/review.md`
- `packages/core/src/at/client.ts`
- `packages/pwa/src/components/ComposePage.tsx`
