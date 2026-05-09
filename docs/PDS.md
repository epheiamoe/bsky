# PDS 第三方服务支持

> **版本**: v0.7.0+ | 2026-05-09
> **状态**: 已实现

## 概述

支持用户登录时指定自定义 PDS（Personal Data Server）服务端，而非强制使用 `bsky.social`。自定义 PDS 在登录表单中作为可选字段，默认留空（= `bsky.social` 自动发现）。

## 架构决策

### Two-PDS 模型

登录入口 PDS（entry PDS）和用户数据 PDS（user PDS）可能不同。

```
用户交互 → LoginPage (PWA) / SetupWizard (TUI)
               │
               ├─ 填了 PDS → entryPds = 用户填写的 URL
               └─ 留空     → entryPds = 'https://bsky.social'
               │
               ▼
          POST {entryPds}/xrpc/com.atproto.server.createSession
               │
               ▼
          从 didDoc 发现用户真实 PDS
          (若 didDoc 不存在 → 通过 resolveDid 获取)
               │
               ▼
          this.ky = ky({ prefixUrl: userPds + '/xrpc' })
          this.pdsUrl = userPds
```

| 实例 | 目标 | 职责 |
|------|------|------|
| `this.ky` | `{userPds}/xrpc` | 所有写操作 + 需认证的读 + JWT 刷新 |
| `this.publicKy` | `public.api.bsky.app/xrpc` | 公开只读聚合（不变） |
| `this.chatKy` | `api.bsky.chat/xrpc` | DM 私信（不变） |

### 不变的全局服务

- **CDN**: `cdn.bsky.app` — 全局缓存，不依赖 PDS
- **视频**: `video.bsky.app` — 独立服务
- **公共 API**: `public.api.bsky.app` — 聚合所有 PDS 的数据

### 零侵入

所有 hooks、AI 工具、UI 组件对 PDS 逻辑完全无感知。PDS 路由完全封装在 `BskyClient` 和 `AuthStore` 中，接口签名不变。

## 改动清单

### 1. `@bsky/core` — 核心层

#### `types.ts`
- 新增 `DidDocument` 接口（`id`, `alsoKnownAs`, `service[]`）
- `parseAtUri()` 正则从 `did:plc:` 单格式改为通用 `did:[^:]+:[^/]+`（兼容 `did:web:`）
- `CreateSessionResponse` 不变（pdsUrl 单独存储，不污染 session 类型）

#### `client.ts`
- 构造函数接受 `{ pdsUrl?: string }` 参数
- `withRefresh` 闭包提取为实例属性，登录后重建 `this.ky` 时复用
- `login()` 改为两阶段：
  1. 用入口 PDS 的临时 ky 调用 `createSession`
  2. 从 `response.didDoc`（或 fallback `resolveDid`）提取用户真实 PDS
  3. 创建 `this.ky` 指向用户真实 PDS
- 返回 `{ session, pdsUrl }` 而非赤裸 session
- `restoreSession(session, pdsUrl)` — 重建 `this.ky`
- `_refreshSession` 使用 `this.pdsUrl` 而非硬编码 `BSKY_SERVICE`
- `downloadBlob` 使用 `this.pdsUrl` 而非 `BSKY_SERVICE`

### 2. `@bsky/app` — 业务层

#### `stores/auth.ts`
- `AuthStore` 新增 `pdsUrl: string | null`
- `login(handle, password, pdsUrl?)` — 传递 PDS URL
- `restoreSession(session, pdsUrl)` — 含 PDS URL

#### `useSessionPersistence.ts`
- `StoredSession` 新增 `pdsUrl?: string`
- 读写均含 pdsUrl 序列化

### 3. PWA — 登录 UI

#### `LoginPage.tsx`
- handle / password 之间插入 PDS 输入块：
  - text input，默认空，placeholder 显示 `bsky.social (留空自动发现)`
  - 琥珀色背景警告框：「自定义 PDS 仅适用于技术用户，如果你不知道这是什么意思，请不要修改」
- 提交时传入 `pdsUrl.trim() || undefined`

#### `App.tsx`
- `handleLogin` 签名增加 `pdsUrl?: string`

### 4. TUI

- `TuiConfig` / `AppConfig` 新增 `blueskyPds?: string`
- `.env.example` 新增 `BLUESKY_PDS`
- `cli.ts` 读取环境变量
- `App.tsx` 登录时传入
- `SetupWizard.tsx` 新增可选字段

### 5. i18n

每个语言 3 个新键：`login.pdsLabel`, `login.pdsHint`, `login.pdsWarning`

## 错误处理

| 场景 | 行为 |
|------|------|
| 无效 PDS URL | `createSession` 连接失败 → 错误提示 + 用户重试 |
| PDS 不支持 CORS（PWA） | 浏览器抛 `TypeError: Failed to fetch` → 检测后提示用户 |
| didDoc 无 atproto_pds | fallback 使用入口 PDS |
| resolveDid 失败 | fallback 使用入口 PDS |
| 自定义端点不存在（bookmark/draft） | 正常 404/501 错误，UI 正常显示 |
| 会话恢复后 PDS 不可用 | `withRefresh` 尝试刷新 → 失败 → 标记过期 → 重新登录 |

## DID Document 格式

```typescript
interface DidDocument {
  id: string;
  alsoKnownAs?: string[];
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
  // 其他可选字段省略
}
```

示例：
```json
{
  "id": "did:plc:abc123def",
  "alsoKnownAs": ["at://user.bsky.social"],
  "service": [
    {
      "id": "#atproto_pds",
      "type": "AtprotoPersonalDataServer",
      "serviceEndpoint": "https://user-pds.example.com"
    }
  ]
}
```

## 测试

位于 `packages/core/tests/client.pds.test.ts`：

- `auto-discovers PDS from didDoc` — mock createSession 返回含 didDoc → 验证 pdsUrl 正确
- `falls back to resolveDid when didDoc missing` — 模拟无 didDoc → 验证 pdsUrl 解析
- `defaults to entry PDS when all discovery fails` — 无 didDoc 且 resolveDid 失败 → 验证 fallback
- `restores session with pdsUrl` — restoreSession → 验证 this.ky prefixUrl
- `downloadBlob uses pdsUrl` — 验证 downloadBlob URL
- `refreshSession uses pdsUrl` — 验证 refresh URL
- `supports did:web: in parseAtUri` — 验证 parsing
- `custom pds url login flow` — 验证提供 pdsUrl 时的行为

## 实现顺序

1. `core/types.ts` (~5 行)
2. `core/client.ts` (~80 行)
3. `core/index.ts` (~2 行)
4. `app/stores/auth.ts` (~15 行)
5. `pwa/hooks/useSessionPersistence.ts` (~5 行)
6. i18n 键 (~9 行)
7. `pwa/components/LoginPage.tsx` (~35 行)
8. `pwa/components/App.tsx` (~3 行)
9. TUI 配置 (~30 行)
10. 构建 + 验证

## 教训

- **didDoc 可选性**: `createSession` 返回的 `didDoc` 是可选字段。不能假设它存在，必须备 fallback。
- **JWT 跨 PDS 可用**: 由用户 PDS 签发的 JWT 在用户 PDS 上可直接使用。登录入口 PDS 做 proxy 时，JWT 来自用户 PDS。
- **CORS 不可控**: 第三方 PDS 可能未配置 CORS header。PWA 浏览器中无法绕过，只能提示用户更换 PDS 或使用 TUI。
- **自定义端点不兼容**: `app.bsky.bookmark.*` 和 `app.bsky.draft.*` 是 Bluesky 自定义端点，非标准 AT Protocol，第三方 PDS 可能不支持。不影响核心功能。
