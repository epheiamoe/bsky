# Authentication & Session Lessons

> JWT, sessions, auth hooks, and credential management
>
> Part of the [Lessons Learned](../LESSONS.md) collection.

---

## Lesson 53: PDS Blob Download Needs `this.ky` (JWT Auto-Refresh)

**Category**: Auth/Session

**Root Cause**: `BskyClient.downloadBlob()` 使用原始 `ky.get(url, { headers: this.getAuthHeaders() })` — 不经过 `this.ky`（带 `withRefresh` hook 的 `ky.create` 实例）。从 localStorage 恢复的 session JWT 可能已过期，`downloadBlob` 直接失败返回 400 ExpiredToken，无自动刷新。

**Fix**: `downloadBlob` 改用 `this.ky.get('com.atproto.sync.getBlob', { searchParams })`。`this.ky` 的 `afterResponse` hook 在 401/400 上触发 `withRefresh` → 刷新 JWT → 重试请求。与所有其他 XRPC 调用共享同一路径。

**Lesson Learned**:
1. 所有认证请求必须通过 `this.ky` — 不可用原始 `ky.get()` 手动加 auth header
2. CDN（`cdn.bsky.app`）对 `<img>` 可用，但不支持 `fetch()` CORS

---

---

## Lesson 55: beforeRequest Hook Centralizes Auth

**Category**: Auth/Session

**Root Cause**: 42 个方法各自手动调用 `headers: this.getAuthHeaders()`。`downloadBlob` 切换到 `this.ky` 时遗漏该行 → 所有 blob 请求无认证头 → PDS 返回 400。

**Fix**: 为所有 `this.ky` 和 `this.chatKy` 实例新增 `beforeRequest` 钩子（`_authHook`）——当 `this.session` 存在时自动注入 `Authorization: Bearer <jwt>`。4 个 `ky.create` 调用点均已注册。未来无需任何方法手动传递认证头。

**Lesson Learned**:
1. 集中化的 beforeRequest hook 比 42 个手动 auth 调用更安全——单点控制，不会遗漏。与现有的 `afterResponse`（`_withRefresh`）钩子形成对称架构：beforeRequest 注入 JWT，afterResponse 刷新 JWT
2. `ky.extend()` 保留钩子——`downloadBlob` 的 bsky.social 回退使用 `this.ky.extend({ prefixUrl: ... })` 创建临时实例，继承 `_authHook` 和 `_withRefresh`
3. `this.session` 可能为 null——`_authHook` 仅在 session 存在时注入，`getAuthHeaders()` 返回 `{}` 而非抛出异常。登录时的竞态条件（旧代码在 `login()` 完成前调用 `getAuthHeaders()`）现已消除

---