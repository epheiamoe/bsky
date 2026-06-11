# 视频上传兜底陷阱 / Video Upload Fallback Trap

## 现象

用户上传的视频在 AI bsky 中显示 **帖子未找到**，在 bsky.app 中显示 **无法找到视频**。同一条帖子的公共 AppView 可以正常返回，但实际发布的视频 embed 引用的是未经 Bluesky Video Service 预处理的原始 MP4 blob。

## 根因

`BskyClient.uploadVideo()` 在 Video Service 预处理失败时，**无条件回退**到 `uploadBlob()`，并将 `processed: false` 返回给调用方。ComposePage 虽然会打一条 `console.warn`，但仍继续发帖。结果：

- 帖子记录里的 `app.bsky.embed.video` 引用的是 raw blob。
- `video.bsky.app/watch/{did}/{cid}/playlist.m3u8` 返回 404。
- bsky.app 无法播放，AI bsky 的认证 PDS 路径可能因 raw video embed 代理异常而显示“帖子未找到”。

此外，服务端返回的 `uploadVideo` / `getJobStatus` 响应形状经常是**扁平**的 `AppBskyVideoDefs.JobStatus`，而不是 lexicon 规定的 `{ jobStatus: ... }`。旧代码只解析包裹结构，导致本来成功的响应被误判为失败，进一步触发兜底。

## 教训

### 1. 不要轻易兜底到 uploadBlob

直接 `uploadBlob` 上传的视频依赖 firehose 触发事后处理。官方文档承认这会“短暂缺失”，但多个社区报告和本次实测证明 raw blob 可能**长期不被处理**（>12 小时仍 404）。

**正确做法**：
- 默认**不兜底**。
- 仅当调用方显式设置 `allowFallback: true` 且错误被分类为**可恢复**（5xx、网络错误、超时）时才兜底。
- 兜底结果必须携带 `fallbackReason`，UI 必须明确告知用户“播放可能异常”。

### 2. 响应形状要兼容

服务端实际返回可能是：

```json
{ "jobId": "...", "state": "JOB_STATE_CREATED" }
```

或 409 already_exists：

```json
{
  "did": "...",
  "error": "already_exists",
  "jobId": "...",
  "state": "JOB_STATE_COMPLETED",
  "blob": { "$type": "blob", "ref": { "$link": "..." }, ... }
}
```

客户端应同时兼容 `{ jobStatus }` 和扁平结构，并以 `blob` 存在性作为成功依据，而不是只看 `state === 'COMPLETED'`。

### 3. 错误分类要清晰

| 类型 | 例子 | 是否可兜底 |
|------|------|-----------|
| 客户端错误 | 400 坏视频、401/403 鉴权、413 过大、429 限流、用户取消 | 否 |
| 可恢复错误 | 5xx、网络错误、超时 | 是（需显式允许） |
| 未知错误 | 未识别状态码 | 否（保守处理） |

用 `VideoServiceError { code, recoverable, status }` 包装，调用方根据 `recoverable` 决定弹窗还是直接报错。

### 4. name 参数要唯一

直接传用户原始文件名容易导致 `already_exists` 冲突。应生成类似 `{timestamp}-{random}-{safeFileName}` 的唯一名称，同时保留扩展名。

### 5. 播放器要对未处理视频做占位

如果 API 解析结果没有 `playlist`，不要构造 `video.bsky.app` 播放列表 URL 去请求 404。`VideoCard` 应渲染明确的“处理中/暂不可用”占位图，避免 HLS 加载失败状态。

## 相关文件

- `packages/core/src/at/client.ts` — `uploadVideo`、错误分类、轮询、describeServer fallback
- `packages/core/src/at/types.ts` — `VideoUploadOptions`、`VideoUploadResult`、`VideoServiceError`
- `packages/app/src/utils/extractEmbeds.ts` — `extractVideo` 新增 `processing` 标志
- `packages/pwa/src/components/VideoCard.tsx` — 未处理视频占位渲染
- `packages/pwa/src/components/ComposePage.tsx` — 重试/跳过/取消弹窗、唯一名称生成
