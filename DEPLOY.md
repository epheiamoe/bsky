# 🦋 Bluesky Client — 部署指南

> 面向部署者。想自己架设这个 AI 增强的 Bluesky 客户端的看这里。
> 如果你只是使用，直接打开 [ai-bsky.pages.dev](https://ai-bsky.pages.dev) 即可。

## 概述

这是一个**纯前端**应用。没有后端服务器，没有数据库。只需把静态文件部署到任何 Web 服务器。

PWA 搜索功能的主路径基于 jina.ai Reader（免费，零配置）。可选 fallback（DuckDuckGo Lite 搜索）仅 Cloudflare Pages 支持——其他平台部署时搜索 fallback 自动不可用，不影响其他功能。

推荐 **Cloudflare Pages**（零配置，免费）。

---

## 方案一：Cloudflare Pages（推荐）

无需搭建服务器，完全免费。

### 步骤

```bash
# 1. 克隆并构建
git clone https://github.com/epheiamoe/bsky.git
cd bsky
pnpm install
pnpm -r build

# 2. 部署到 Cloudflare Pages
cd packages/pwa
npx wrangler pages deploy dist --project-name ai-bsky --branch=master
```

> Cloudflare 会自动发现 `functions/` 目录，DDG 搜索 fallback 代理自动生效。
> 没部署 fallback 代理时，PWA 搜索仅使用 jina.ai 主路径，功能正常。

### 两步部署（预览 + 上线）

```bash
# Step 1: 部署到预览（不影响线上）
npx wrangler pages deploy dist --project-name ai-bsky --branch=staging
# → 会生成一个 preview URL，用于测试

# Step 2: 确认无误后部署到生产（--branch=master 更新 production 环境）
npx wrangler pages deploy dist --project-name ai-bsky --branch=master
# → 更新 ai-bsky.pages.dev
```

---

## 方案二：VPS + PHP

### 步骤

```bash
# 1. 构建
git clone https://github.com/epheiamoe/bsky.git
cd bsky
pnpm install
pnpm -r build

# 2. 静态文件
cp -r packages/pwa/dist/* /var/www/bsky/

# 3. PHP 搜索代理
cp packages/pwa/api/search.php /var/www/bsky/api/search.php
```

### Nginx 配置

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/bsky;
    index index.html;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/search.php {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Apache 确保启用 `mod_rewrite` 和 SPA 路由。

---

## 方案三：VPS + Node.js

```bash
# 1. 构建
pnpm install && pnpm -r build

# 2. 静态文件
cp -r packages/pwa/dist/* /var/www/bsky/

# 3. 启动搜索代理
node packages/pwa/scripts/search-server.mjs

# 4. 生产用 PM2
npm install -g pm2
pm2 start packages/pwa/scripts/search-server.mjs --name bsky-search-proxy
pm2 save
```

### Nginx 反向代理

```nginx
location /api/search {
    proxy_pass http://127.0.0.1:8788;
    proxy_set_header Host $host;
}
```

---

## 方案四：Vercel

```bash
pnpm install && pnpm -r build
cd packages/pwa
npx vercel --prod
```

Vercel 会自动发现 `api/search.js`。

---

## 方案五：Netlify

```bash
pnpm install && pnpm -r build
cd packages/pwa
npx netlify deploy --prod --dir=dist
```

`packages/pwa/netlify/functions/search.js` 已随项目提供。Netlify 会自动部署函数。

---

## 各平台搜索代理对照表

| 平台 | 代理文件 | 访问路径 |
|------|---------|---------|
| Cloudflare Pages | `functions/api/search.js` | `/api/search` |
| VPS（PHP） | `api/search.php` | `/api/search.php` |
| VPS（Node.js） | `scripts/search-server.mjs` | `/api/search` |
| Vercel | `api/search.js` | `/api/search` |
| Netlify | `netlify/functions/search.js` | `/.netlify/functions/search` |
| 本地开发 | Vite proxy → `scripts/search-server.mjs` | `/api/search` |

所有代理行为一致：接收 `?q=` 参数，服务端 fetch `lite.duckduckgo.com/lite?q=...`，返回 HTML + CORS 头。目标域名硬编码在服务端，无法被滥用。

---

## 搜索架构参考

| 路径 | 用途 | 需要服务端？ |
|------|------|:---:|
| jina.ai Reader (`r.jina.ai`) | 网页抓取 + DDG 搜索渲染（主路径） | ❌ 浏览器直连，零配置 |
| `/api/search` (各平台) | DDG Lite 搜索 fallback | ⚠️ 可选，部署对应的 proxy 文件即可 |
| `fetch_web_markdown` 工具 | AI 读取单个网页 | ❌ 直接调用 jina.ai |

不部署搜索代理时，PWA 仅 jina.ai 主路径可用，fallback 自动退化（不影响其他功能）。

---

## 问题排查

| 问题 | 可能原因 |
|------|---------|
| 搜索失败 | jina.ai 不可达（网络问题），或 fallback 代理未部署 |
| 登录失败 | 需要有效的 Bluesky 账号 + App Password |
| AI 对话不回复 | 需要配置 LLM API Key（DeepSeek / OpenAI / 其他） |
| `search_web_ddg` 返回空 | 网络问题，重试或换查询词 |

---

*有问题请提 [Issues](https://github.com/epheiamoe/bsky/issues)*
