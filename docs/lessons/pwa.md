# PWA & Service Worker Lessons

> Progressive Web App features, service workers, and caching
>
> Part of the [Lessons Learned](../LESSONS.md) collection.

---

## Lesson 65: Cache API Only Supports GET

**Category**: PWA / Service Worker

**Root Cause**: Service Worker's `networkFirst` strategy called `cache.put(request, response)` for all requests, but the Cache API only supports GET requests. POST requests threw `TypeError: Failed to execute 'put' on 'Cache': Request method 'POST' is unsupported`.

**Context**:
- Service Worker caches API responses for offline support
- Bluesky API uses POST for most read operations (XRPC convention)
- `networkFirst` strategy: fetch → if OK → cache.put → return response
- `cache.put()` unconditionally called for all successful responses

**Solution**: Add method check before caching:
```javascript
async function networkFirst(request) {
  const response = await fetch(request);
  if (response.ok && request.method === 'GET') {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
```

**Lesson Learned**:
1. **Cache API is GET-only** — POST/PUT/DELETE cannot be cached via Cache API
2. **Always check request.method before cache.put()** — prevents runtime errors
3. **Service Worker errors are silent** — they appear in console but don't break functionality
4. **Different strategies for different methods** — GET = cacheable, POST = network-only

---

# Quick Reference by Category

## AI/Prompting
- [Lesson 2](#lesson-2-tool_call_id-loss-on-three-paths) — tool_call_id 存储↔API 转换风险
- [Lesson 3](#lesson-3-double-formatting-tryjsonsummary-vs-formattoolresult) — 格式化层不能重复
- [Lesson 17](#lesson-17-ai-card-data-retention-mapmessages) — 字段映射必须双向完整
- [Lesson 18](#lesson-18-buildtooldescription-for-write-tools) — write 工具必须加确认描述

## Authentication/Session
- [Lesson 53](#lesson-53-blob-download-ky-instance) — 认证请求必须走 this.ky
- [Lesson 55](#lesson-55-beforerequest-auth-hook) — 集中化 auth hook 比手动调用安全

## UI/UX
- [Lesson 1](#lesson-1-widget-sorting-index-mismatch) — 过滤列表索引映射
- [Lesson 4](#lesson-4-svg-icons-must-be-hardcoded) — SVG 必须硬编码
- [Lesson 5](#lesson-5-widget-system-unified-header-bar) — WidgetPanel 统一 header
- [Lesson 6](#lesson-6-ai-card-animation-must-use-css-transition) — CSS transition 条件
- [Lesson 7](#lesson-7-streaming-scroll-requires-requestanimationframe) — RAF 滚动
- [Lesson 8](#lesson-8-mobile-keyboard-visualviewport) — visualViewport 键盘适配
- [Lesson 12](#lesson-12-i18n-interpolation-braces) — i18n 单大括号
- [Lesson 14](#lesson-14-widget-temporary-disable-snapshot) — 临时状态保存-恢复
- [Lesson 16](#lesson-16-widget-header-buttons-module-refs) — Module ref 运行时 context
- [Lesson 52](#lesson-52-cvd-friendly-palette) — CVD 双重编码 + CSS 变量
- [Lesson 54](#lesson-54-react-portal-event-bubbling) — Portal 事件沿 Fiber 冒泡
- [Lesson 64](#lesson-64-event-propagation-in-nested-ui) — 嵌套组件按钮阻止事件冒泡

## API/Network
- [Lesson 9](#lesson-9-ky-retry-must-explicit-statuscodes) — ky retry 显式配置
- [Lesson 13](#lesson-13-appview-dedup-vs-pds-raw) — AppView vs PDS 去重
- [Lesson 20](#lesson-20-searchactors-public-endpoint) — 公共端点可能不走 PDS
- [Lesson 46](#lesson-46-duckduckgo-sec-fetch-detection) — Sec-Fetch 浏览器指纹
- [Lesson 47](#lesson-47-wikipedia-api-endpoint) — Wikipedia REST 端点确认
- [Lesson 48](#lesson-48-mediawiki-api-cors) — MediaWiki origin=* 参数

## Scroll/Virtualization
- [Lesson 7](#lesson-7-streaming-scroll-requires-requestanimationframe) — 流式 RAF 滚动

## Storage/Persistence
- [Lesson 10](#lesson-10-component-persistence-needs-callback) — Module-level 持久化回调
- [Lesson 11](#lesson-11-array-vs-set-for-ordered-state) — 有序状态用数组
- [Lesson 49](#lesson-49-chatstorage-factory-pattern) — ChatStorage 工厂模式
- [Lesson 50](#lesson-50-autosave-race-condition) — autoSave 竞态条件
- [Lesson 51](#lesson-51-autosave-write-queue) — 写队列串行化

## DM/Messaging
- [Lesson 19](#lesson-19-markconvoread-optimistic) — 乐观清除未读标记

## Performance
- [Lesson 15](#lesson-15-build-order-commit-before-build) — Commit 在 build 之前
- [Lesson 56](#lesson-56-429-rate-limit-retry) — 429 指数退避

## Worker/WebAssembly
- [Lesson 57](#lesson-57-web-worker-module-vs-classic) — Module Worker 加载 UMD 脚本有风险
- [Lesson 58](#lesson-58-pyodide-api-call-sequencing) — WASM 加载完成 ≠ API 就绪
- [Lesson 59](#lesson-59-binary-data-handling-in-workers) — apply() 有参数上限，大文件分块
- [Lesson 61](#lesson-61-vite-worker-import-over-blob-url) — Vite `?worker` 导入避免模板字符串转义问题
- [Lesson 62](#lesson-62-micropip-package-installation-batches) — 第三方包分批次安装，失败不阻塞
- [Lesson 63](#lesson-63-matplotlib-fonts-in-wasm) — WASM 环境无系统字体，需手动加载字体文件

## UI/UX (continued)
- [Lesson 64](#lesson-64-event-propagation-in-nested-ui) — 嵌套组件中的按钮必须阻止事件冒泡

## PWA/Service Worker
- [Lesson 65](#lesson-65-cache-api-only-supports-get) — Cache API 只支持 GET 请求，POST 会抛异常

## Development Process
- [Lesson 60](#lesson-60-incremental-feature-addition) — Sandbox 环境逐个添加功能

---

> 完整项目上下文、版本历史、功能状态见 `docs/CONTEXT.md`。
> Lessons 21-45 见 `docs/CONTEXT.md`「关键教训」章节。

---