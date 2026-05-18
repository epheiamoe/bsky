# API & Network Lessons

> External API usage, network requests, endpoint behavior, and CORS
>
> Part of the [Lessons Learned](../LESSONS.md) collection.

---

## Lesson 9: ky Retry — Explicit statusCodes

**Category**: API/Network

**Root Cause**: 虽然 ky 默认配置了重试逻辑（`retry: { limit: 2, statusCodes: [408, 413, 429, 500, 502, 503, 504] }`），但项目中没有显式传 `retry` 配置，ky 可能因为版本差异或内部逻辑不使用默认值。实际上看到 504 时没有重试日志。

**Fix**: 显式传入 retry 配置到所有 ky 实例：
```typescript
ky.create({
  retry: { limit: 1, statusCodes: [408, 413, 429, 500, 502, 503, 504] },
  ...
});
```

**Lesson Learned**: 网络库的重试行为不应依赖默认值——显式声明所需的 retry 状态码和次数。

---

---

## Lesson 13: AppView Dedup vs PDS Raw — `getList` vs `listRecords`

**Category**: API/Network

**Root Cause**: `app.bsky.graph.getList` 是 AppView 水合视图，Lexicon 规格明确规定会**去重 `(subject, list)` 对**。PDS 有两条记录，但 `getList` 只返回一条。`remove_from_list` 使用 `getList` + `find()` → 删除一条后，AppView 可能已标记为"不在列表" → 第二条残留无法删除。

**Fix**: 改用 `com.atproto.repo.listRecords`（PDS 层，不去重）查找所有匹配记录：
```typescript
// ❌ AppView 去重 → 只找到一条
const res = await client.getList(listUri);
const item = res.items.find(i => i.subject.did === subject);

// ✅ PDS 层不去重 → 找到全部重复
const all = await client.listRecords(did, 'app.bsky.graph.listitem');
const matches = all.records.filter(r => r.value.subject === subject && r.value.list === listUri);
for (const m of matches) await client.removeListItem(m.uri);
```

**Lesson Learned**: AppView（`app.bsky.graph.*`）提供水合视图（有去重、排序等），PDS（`com.atproto.repo.*`）提供原始数据。需要完整数据（特别是处理重复/脏数据）时，必须使用 PDS 层 API。

---

---

## Lesson 20: `searchActors` — Auth Endpoint 503, Public Endpoint 200

**Category**: API/Network

**Root Cause**: `searchActors` 使用 `this.session ? this.ky : this.publicKy` 模式。当已登录时走 authenticated endpoint → 503。其他公共读端点（`getLikes`、`getList` 等）使用同一模式但可行——唯独 `searchActors` 在 bsky.social 上不可用。

**Fix**: `searchActors` 统一使用 `this.publicKy`（不需要鉴权）：
```typescript
// ❌ session ? ky : publicKy — ky fails with 503
// ✅ always use publicKy — works on public.api.bsky.app
return this.publicKy.get('app.bsky.actor.searchActors', { searchParams });
```

**Lesson Learned**: 不是所有公共端点都能通过 PDS 代理（`bsky.social`）正常访问。遇到 503 时先测试 `public.api.bsky.app` 是否可用——如果可用，说明端点是纯公共读，不需要走 PDS 代理。

---

---

## Lesson 46: DuckDuckGo Sec-Fetch Detection — Browser vs CLI

**Category**: API/Network

**Root Cause**: DuckDuckGo Instant Answer API (`api.duckduckgo.com`) 使用 `Sec-Fetch-*` 系列请求头（`Sec-Fetch-Mode`, `Sec-Fetch-Site`, `Sec-Fetch-Dest`）做客户端指纹识别。当检测到这些浏览器专属头存在时，故意返回**字段值全空**的 JSON 响应（反爬/防前端直调）。这些头由浏览器自动附加且无法通过 JavaScript 删除或修改（forbidden headers）。

```
浏览器 fetch → 自动附加 Sec-Fetch-* → DDG API → HTTP 200, 全空字段
curl/Node.js → 无 Sec-Fetch-*      → DDG API → 完整数据
```

**Fix**: 在 `packages/pwa/functions/api/proxy.js` 创建 Cloudflare Pages Function，在服务端执行 fetch，附加 CORS 响应头返回给浏览器。

**Lesson Learned**: 遇到 curl 正常、浏览器异常的 API 调用，优先怀疑 `Sec-Fetch-*` 头。解决方案是服务端代理（Serverless Function > CORS proxy > JSONP）。

---

---

## Lesson 47: Wikipedia API — Search Endpoint Does Not Exist

**Category**: API/Network

**Root Cause**: Wikipedia REST API 的 `/api/rest_v1/search/title` 端点**不存在**（返回 404）。正确的搜索端点是 MediaWiki API 的 `w/api.php?action=opensearch`，但需要加 `&origin=*` 参数才能返回 CORS 头。

**Fix**: 完全绕过搜索步骤，直接调 `page/summary/{query}` — Wikipedia 自动处理重定向和模糊匹配：
- `page/summary/Bluesky%20social%20network` → 返回 "Bluesky" 的正确数据和 extract
- 不存在的查询（如 "xyzxyzxyz"）返回 404

**Lesson Learned**: 写 Wikipedia 集成时先查 REST API 文档确认端点是否存在。`page/summary` 是直接可用的知识摘要端点，自带 CORS。

---

---

## Lesson 48: `w/api.php` CORS Requirement

**Category**: API/Network

**Root Cause**: MediaWiki API 要求 URL 中显式包含 `&origin=*` 参数才会返回 `Access-Control-Allow-Origin: *`。仅靠 `Origin` 请求头是不够的。

```
https://en.wikipedia.org/w/api.php?action=opensearch&search=Bluesky&origin=*
// ↑ origin=* 是必需的
```

**Fix**: 任何使用 MediaWiki API 的浏览器端调用都必须附带 `&origin=*` 参数。`page/summary` REST API 则原生支持 CORS，无需额外参数。

**Lesson Learned**: 任何使用 MediaWiki API 的浏览器端调用都必须附带 `&origin=*` 参数。`page/summary` REST API 则原生支持 CORS，无需额外参数。

---