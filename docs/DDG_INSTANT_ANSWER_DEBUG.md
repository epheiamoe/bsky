# DuckDuckGo Instant Answer API: Browser Fetch 返回空字段的根因分析与解决方案

> 通用知识文档。记录了 DuckDuckGo Instant Answer API 对浏览器端 `fetch()` 请求返回空数据的完整分析过程和最终解决方案。
> 适用于：前端开发者、PWA 开发、API 集成、反爬机制研究。

---

## 问题现象

从 **浏览器**（PWA / 任意前端页面）调用 DuckDuckGo Instant Answer API：

```
GET https://api.duckduckgo.com/?q=Bluesky&format=json&no_html=1
```

返回结果：

```json
{
  "Heading": "",
  "Abstract": "",
  "AbstractSource": "",
  "AbstractURL": "",
  "Answer": "",
  "Results": [],
  "RelatedTopics": [],
  "Infobox": {},
  "Type": ""
}
```

**HTTP 200，JSON 结构完整，但所有字段值为空/空串**。

而同样的 URL 从 **curl / Node.js / PowerShell** 调用，返回完整数据：

```json
{
  "Heading": "Bluesky",
  "Abstract": "Bluesky is an American microblogging social media service...",
  "AbstractSource": "Wikipedia",
  "AbstractURL": "https://en.wikipedia.org/wiki/Bluesky",
  "Results": [{ "Text": "Official site - Bluesky", "FirstURL": "https://bsky.app/" }],
  "RelatedTopics": [/*...*/],
  "Infobox": { "content": [/*...*/] }
}
```

同一台机器、同一网络、同一 URL，仅因调用方不同（浏览器 vs CLI）而结果迥异。

---

## 排查过程（时间线）

### 阶段 1：排除 CORS

**假设**：跨域请求被浏览器安全策略拦截。

**验证**：
- 检查响应头：`Access-Control-Allow-Origin: *` ✅ （API 确实返回 CORS 头）
- `fetch()` 请求正常返回 HTTP 200（非网络错误）
- 结论：不是 CORS 问题。

### 阶段 2：排除 User-Agent

**假设**：DuckDuckGo 通过 User-Agent 检测浏览器。

**验证**：
- 从 CLI 分别测试不同 User-Agent：Chrome 125、Edge 131、Safari 18.2、`Mozilla/5.0`、`curl/8.0`、无 UA
- **所有 UA 均返回完整数据** ✅
- 结论：不是 User-Agent 问题。

### 阶段 3：排除 OPTIONS 预检（Preflight）

**假设**：浏览器发送 OPTIONS 预检请求，API 未正确处理导致后续 GET 失败。

**验证**：
- `fetch()` 调用为简单 GET 请求（无自定义非简单头），不触发预检
- 手动发送 OPTIONS → 返回 `405 Not Allowed`，但浏览器实际上不会发送预检
- 结论：不是预检问题。（注意：若浏览器因扩展或有 `Sec-Fetch-*` 以外的非简单头触发预检，405 会导致 CORS 失败，但现象是 "Failed to fetch" 而非空字段）

### 阶段 4：排除 JSONP 方案

**假设**：DuckDuckGo 支持 `&callback=` 参数的 JSONP，`<script>` 标签不经过 `fetch()` API，可绕过限制。

**验证**：
- 从 CLI 测试 `&callback=test123` → 返回 `test123({"Abstract":"Bluesky is...", ...})`，**完整数据** ✅
- 从浏览器创建 `<script>` 标签加载同一 URL → **返回空字段** ❌
- 结论：JSONP 在 CLI 可用，但在浏览器端同样被封锁。`<script>` 标签加载仍然携带 `Sec-Fetch-Dest: script` 头，DDG 同样检测到并返回空数据。

### 阶段 5：排除 Referer / Cookie / Accept 头

**假设**：浏览器发送的 Referer、Cookie、Accept 等头触发了限制。

**验证**：
- 从 CLI 分别测试：
  - Referer: `http://localhost:8080/` ✅ 正常
  - Referer: `https://ai-bsky.pages.dev/` ✅ 正常
  - Cookie: 从 duckduckgo.com 获取 cookie 后发送 ✅ 正常（且无 cookie 被设置）
  - Accept: `*/*` ✅ 正常
  - Accept: `text/html,application/xhtml+xml,...` ✅ 正常
  - Accept-Language: `zh-CN,zh;q=0.9,en;q=0.8` ✅ 正常
- 结论：这些头均非触发条件。

### 阶段 6：彻底测试所有请求头组合

**验证**：
- 同时设置 `User-Agent` + `Accept-Language` + `Accept` → 从 CLI 所有组合均正常 ✅
- 使用 `.NET HttpClient`（无额外默认头）→ 正常 ✅
- 使用 `Invoke-WebRequest`（PowerShell，自带默认头）→ 正常 ✅
- **从 CLI 始终无法复现浏览器端的空字段问题**

### 阶段 7：浏览器端直测（关键突破）

**验证**：在本地创建 HTML 文件，通过 Python HTTP Server 从浏览器直接调用 DDG API。

**结果**：
- 浏览器 `fetch()` → `Failed to fetch`（CORS 错误——从 `localhost` 到 `api.duckduckgo.com`）
- 浏览器 `<script>`（JSONP）→ HTTP 200，**所有字段为空** ❌

**关键发现**：浏览器发出请求时携带了 CLI 无法伪造的 `Sec-Fetch-*` 系列请求头。

### 阶段 8：根因确认（Grok 辅助分析）

**根因**：**DuckDuckGo Instant Answer API 检测 `Sec-Fetch-*` 请求头来做客户端指纹识别**。

这些请求头由浏览器**自动附加**到所有 HTTP 请求，且无法通过 JavaScript 删除或修改（它们是 forbidden headers）：

| 请求头 | `fetch()` 发送的值 | `<script>` 标签发送的值 |
|--------|-------------------|----------------------|
| `Sec-Fetch-Mode` | `cors` | `no-cors` |
| `Sec-Fetch-Dest` | `empty` | `script` |
| `Sec-Fetch-Site` | `cross-site` | `cross-site` |

当 DDG API 检测到任意 `Sec-Fetch-*` 头存在时，即判定请求来自**浏览器环境**（而非服务端/CLI），有策略地返回**字段值全空**的 JSON 响应。这是一种反滥用/反前端刮取措施。

curl、Node.js、PowerShell 等非浏览器客户端默认**完全不发送** `Sec-Fetch-*` 头，因此被 DDG 视为合法非浏览器客户端，返回完整数据。

---

## 尝试过的解决方案

| 方案 | 结果 | 原因 |
|------|------|------|
| 直接 `fetch()` | ❌ | 浏览器自动附加 `Sec-Fetch-*` |
| JSONP (`<script>` + callback) | ❌ | `<script>` 标签仍带 `Sec-Fetch-Dest: script` |
| 第三方 CORS 代理（corsproxy.io） | ❌ | 从 CLI 正常，从用户浏览器仍返回空（网络环境差异） |
| 第三方 CORS 代理（allorigins.win） | ❌ | 超时/500 错误 |
| r.jina.ai 代理 | ❌ | DDG API 的 `application/x-javascript` 内容类型被 Jina 拒绝（422） |
| 修改请求头（UA/Accept/Referer） | ❌ | 浏览器中这些头被限制或不影响 `Sec-Fetch-*` |
| Cloudflare Pages Function（**最终方案**） | ✅ | 服务端 fetch 无 `Sec-Fetch-*` 头 |

---

## 最终解决方案

### 架构

创建一个 Cloudflare Pages Function（Serverless Function）作为代理：

```
浏览器 fetch → Cloudflare Pages Function `/api/proxy`
             → 服务端 fetch DDG API（无 Sec-Fetch-* 头）
             → DDG 返回完整数据
             → 函数附加 CORS 头 ← 返回浏览器
```

### 核心代码

```javascript
// functions/api/proxy.js (Cloudflare Pages Function)
export async function onRequest(context) {
  const { request } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const url = new URL(request.url).searchParams.get('url');
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'bsky-client/0.9.0' },
  });

  const body = await resp.text();
  return new Response(body, {
    status: resp.status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': resp.headers.get('Content-Type') || 'application/json',
    },
  });
}
```

### 前端调用

```javascript
// 在浏览器中调用 DDG API 的正确方式：
const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
const proxyUrl = `/api/proxy?url=${encodeURIComponent(ddgUrl)}`;
const res = await fetch(proxyUrl);
const data = await res.json();
// data 包含 Heading, Abstract, Results, RelatedTopics, Infobox 等完整字段
```

### 备选方案：使用 Wikipedia API（无需代理）

如果需求只是获取结构化知识摘要（而非 DDG 特有的 Infobox），可以直接使用 Wikipedia REST API，它**原生支持 CORS**，无需任何代理：

```
https://en.wikipedia.org/api/rest_v1/page/summary/Bluesky
```

返回包含 `title`、`description`、`extract`、`thumbnail`、`content_urls` 的完整 JSON，且自带 `Access-Control-Allow-Origin: *`。

---

## 关键教训

1. **`Sec-Fetch-*` 头是浏览器 vs 服务端行为差异的首要怀疑对象**。当 curl 正常而浏览器异常的 API 调用出现时，优先检查 `Sec-Fetch-*` 差异。
2. **JSONP 不等于万能方案**。`<script>` 标签虽绕过 `fetch()` API，但仍然携带 `Sec-Fetch-Dest: script`。
3. **第三方 CORS 代理不可靠**。代理可用性、速率限制、以及最终用户网络环境都可能影响。
4. **Serverless Function 方案最可靠**。在边缘节点执行服务端 fetch，完全脱离浏览器指纹头，且与前端在同一域名下（无跨域问题）。
5. **Wikipedia API 是可靠的知识替代源**。`page/summary` 端点提供结构化摘要，CORS 友好，维护成本低。

---

## 附录：快速判断方法

在怀疑 `Sec-Fetch-*` 头问题时，用以下方法快速验证：

```bash
# 在浏览器 DevTools → Network 面板检查请求头
# 观察是否有 Sec-Fetch-Mode / Sec-Fetch-Dest / Sec-Fetch-Site

# 从 CLI 模拟浏览器请求（不带 Sec-Fetch-* 头，仅其他浏览器常见头）
curl -s "https://api.duckduckgo.com/?q=test&format=json" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
  -H "Accept-Language: zh-CN,zh;q=0.9,en;q=0.8" \
  -H "Referer: https://example.com/" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('Has data:', bool(d.get('Abstract')))"
  
# 如果 CLI 返回 true 但浏览器返回空 → 100% 是 Sec-Fetch-* 问题
```

---

*参见：Cloudflare Pages Function 实现文档: `docs/PAGES_FUNCTION.md`*
