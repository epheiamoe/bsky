# Search Tool Refactor Plan

> 替代 `instant_answer`（DuckDuckGo Instant Answer API）为 `search_web`（多层回退搜索）。
> Pages Function 完全移除，零代理依赖。

## 背景

`instant_answer` 工具基于 DDG Instant Answer API，但需要 Cloudflare Pages Function 做 CORS 代理（DDG API 在浏览器 Sec-Fetch-* 头下返回空结果），且搜索能力非常有限（只返回 Wikipedia 摘要，无通用网页搜索）。

## 调研结论

### 尝试过的方案

| 方案 | 状态 | 原因 |
|------|------|------|
| DDG Instant Answer API (现状) | ❌ 淘汰 | 搜索结果太少，需要 Pages Function 代理 |
| SearXNG 公开实例 | ❌ 不可行 | 所有实例都 429 限流（含 CF 边缘节点） |
| SearXNG 自建实例 | 搁置 | 以后如需更可控的搜索可以用 |
| markdown.new | ❌ 不可行 | query 参数丢失，不适用搜索场景 |

### 最终选定方案

**三层回退链：`jina.ai Reader → DDG Lite 直连解析 → 优雅降级`**

```
PWA (浏览器)                        TUI (Node.js)
    │                                    │
    │ r.jina.ai/DDG-url                   │ r.jina.ai/DDG-url
    │ (CORS OK, 无需代理)                  │
    │                                    │
    ├── 成功 → 返回 Markdown              ├── 成功 → 返回 Markdown
    │                                    │
    └── 失败 → 优雅降级                    ├── 失败 → lite.duckduckgo.com/lite?q=...
    (无其他 CORS 兼容的 fallback)          │      HTML 解析 → Markdown
                                          │
                                          └── 失败 → 优雅降级
```

### jina.ai Reader 验证结果

| 指标 | 结果 |
|------|------|
| 端点 | `https://r.jina.ai/《url》` |
| 响应格式 | `text/plain; charset=utf-8` (Markdown) |
| CORS | ✅ `Access-Control-Allow-Origin` 回显任意 origin，包含凭据支持 |
| DDG 搜索渲染 | ✅ 11 条结果，含标题+链接+摘要 |
| 响应大小 | ~11KB（DDG 搜索页） |
| 速率限制 | 未发现限流头，测试中无限制 |

### DDG Lite 验证结果

| 指标 | 结果 |
|------|------|
| 端点 | `https://lite.duckduckgo.com/lite?q=...` |
| 响应大小 | ~23KB（比完整版 37KB 更简洁） |
| CORS | ❌ 无 CORS 头，仅限 TUI 使用 |
| 直接访问 | ✅ 200 OK，无限流 |
| 解析复杂度 | 中（无 class 属性，需按 `<tr>` 结构解析）|

### markdown.new 验证结果

| 指标 | 结果 |
|------|------|
| 端点 | `https://markdown.new/《url》` |
| 响应格式 | `text/markdown; charset=utf-8` |
| CORS | ❌ 无 CORS 头（OPTIONS 404）|
| 无 query 参数的 URL | ✅ 正常（Wikipedia 等） |
| 带 query 参数的 URL | ❌ query string 丢失，返回空结果 |
| **结论** | 不适用于搜索场景 |

## 架构变更

### 删除 Pages Function

`packages/pwa/functions/api/proxy.js` 不再需要。jina.ai 直接提供 CORS 支持。

删除项：
- `packages/pwa/functions/api/proxy.js`
- `docs/PAGES_FUNCTION.md`（整页，唯一函数是 DDG 代理）
- `DEPLOY.md` 中其他平台（PHP/Vercel/Netlify/Node.js）的 DDG 代理配置

保留 `packages/pwa/functions/` 目录结构（为未来 Pages Function 预留）。

### ddg-search 包（monorepo 内）

路径：`packages/ddg-search/`

职责：
- 从 DDG Lite 或完整 HTML 搜索页提取结果
- 解析为结构化数据（title, url, snippet）
- 输出干净 Markdown 字符串
- 纯函数，零外部依赖（最多 node-html-parser）

```typescript
// 核心 API
function searchDDG(query: string): Promise<string>
// 内部
function parseDDGLiteHTML(html: string): SearchResult[]
function parseDDGFullHTML(html: string): SearchResult[]
function formatAsMarkdown(results: SearchResult[]): string
```

### `@bsky/core` 工具改动

`packages/core/src/ai/tools.ts`：

```typescript
{
  name: 'search_web',
  description: 'Web search via DuckDuckGo (no API key needed). ' +
    'Returns web search results with titles, URLs, and snippets.',
  inputSchema: {
    query: string,        // required
    language?: string,    // optional
  },
  handler: async (params) => {
    // 1. Try jina.ai (primary, works in both PWA and TUI)
    // 2. If fails and TUI → try DDG Lite direct parse
    // 3. If all fails → return empty results
  },
}
```

### 计划：先 monorepo 后独立

1. 先在 `packages/ddg-search/` 开发
2. `@bsky/core` 通过 workspace 依赖引用
3. 成熟后提取为独立 GitHub 仓库 `epheiamoe/ddg-search`
4. `@bsky/core` 改为 npm 依赖

## 实施步骤

### Step 1: 创建 `packages/ddg-search/`

- `package.json`（workspace 配置）
- `tsconfig.json`
- `src/index.ts` — 核心搜索 + 解析
- `src/__tests__/` — 测试（使用真实 HTTP，无 mock）

### Step 2: 修改 `packages/core/src/ai/tools.ts`

- 替换 `instant_answer` 为 `search_web`
- 删除 `formatDDGResponse` 和 `DDGResponse` 接口
- 新增三层回退 handler

### Step 3: 修改 `packages/core/src/ai/prompts.ts`

- 更新工具描述（DDG 描述 → 通用搜索描述）

### Step 4: 删除 Pages Function

- 删除 `packages/pwa/functions/api/proxy.js`
- 删除 `docs/PAGES_FUNCTION.md`
- 更新 `DEPLOY.md`

### Step 5: 更新文档

- `docs/AI_SYSTEM.md` — 工具列表更新
- `docs/PACKAGES.md` — 新增 ddg-search 包描述
- `AGENTS.md` — 更新 Pages Function 部分

### Step 6: 测试与验证

- `cd packages/ddg-search && npx vitest run`
- `cd packages/core && npx vitest run`
- `pnpm -r build`
- `pnpm -r typecheck`

## 参考

- jina.ai Reader: `https://r.jina.ai/`（免费，无需 API Key）
- DDG Lite: `https://lite.duckduckgo.com/lite?q=`（简单 HTML 搜索页）
- SearXNG: `https://searx.space/data/instances.json`（限流严重，已放弃）
