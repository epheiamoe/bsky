# 🦋 Bluesky Client — 部署指南

> 面向部署者。想自己架设这个 AI 增强的 Bluesky 客户端的看这里。
> 如果你只是使用，直接打开 [ai-bsky.pages.dev](https://ai-bsky.pages.dev) 即可。

## 概述

这是一个**纯前端**应用。没有后端服务器，没有数据库。只需把静态文件部署到任何 Web 服务器。

唯一需要服务端支持的地方：**DuckDuckGo Instant Answer API 代理**（一个 HTTP 文件/函数），因为 DuckDuckGo 会拦截浏览器直接请求。

你可以选择下方任一部署方式。推荐 **Cloudflare Pages**（零配置，免费）。

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
npx wrangler pages deploy dist --project-name ai-bsky --branch=production
```

> Cloudflare 会自动发现 `functions/` 目录，DDG 代理无需额外配置。

### 两步部署（预览 + 上线）

```bash
# Step 1: 部署到预览（不影响线上）
npx wrangler pages deploy dist --project-name ai-bsky --branch=staging
# → 会生成一个 preview URL，用于测试

# Step 2: 确认无误后部署到生产
npx wrangler pages deploy dist --project-name ai-bsky --branch=production
# → 更新 ai-bsky.pages.dev
```

---

## 方案二：VPS + PHP（最省事的自建方式）

如果你有 VPS 且装了 PHP/PHP-FPM，这是最简单的自建方案。

### 步骤

```bash
# 1. 构建前端
git clone https://github.com/epheiamoe/bsky.git
cd bsky
pnpm install
pnpm -r build

# 2. 把静态文件丢到你的 Web 目录
cp -r packages/pwa/dist/* /var/www/bsky/

# 3. 把 PHP 代理也丢进去
cp packages/pwa/api/proxy.php /var/www/bsky/api/proxy.php

# 4. 配置 Web 服务器（如果使用 Apache，无需额外配置）
#    Nginx 需添加 URL 重写（见下方）
```

### Nginx 配置

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/bsky;
    index index.html;

    # 静态文件
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # PHP 代理
    location /api/proxy.php {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # SPA 路由（所有非文件请求返回 index.html）
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Apache 配置

如果使用 Apache，确保启用 `mod_rewrite`：

```apache
DocumentRoot /var/www/bsky
<Directory /var/www/bsky>
    AllowOverride All
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ /index.html [L]
</Directory>
```

### 验证

访问 `https://your-domain.com` → 应该看到 Bluesky 客户端。
访问 `https://your-domain.com/api/proxy.php?url=...` → 测试代理是否工作。

---

## 方案三：VPS + Node.js

如果你已有 Node.js 环境。

### 步骤

```bash
# 1. 克隆并构建
git clone https://github.com/epheiamoe/bsky.git
cd bsky
pnpm install
pnpm -r build

# 2. 部署静态文件
cp -r packages/pwa/dist/* /var/www/bsky/

# 3. 启动代理服务器
node packages/pwa/scripts/proxy-server.mjs
# 默认监听 8788 端口，通过 /api/proxy?url=... 访问

# 4. 生产环境建议用 PM2
npm install -g pm2
pm2 start packages/pwa/scripts/proxy-server.mjs --name bsky-proxy
pm2 save
```

### Nginx 反向代理

```nginx
location /api/proxy {
    proxy_pass http://127.0.0.1:8788;
    proxy_set_header Host $host;
}
```

---

## 方案四：Vercel

```bash
# 1. 构建
pnpm install
pnpm -r build

# 2. 将 packages/pwa 部署到 Vercel
cd packages/pwa
npx vercel --prod
```

Vercel 会自动发现根目录的 `api/` 目录，DDG 代理自动生效。

---

## 方案五：Netlify

```bash
# 1. 构建
pnpm install
pnpm -r build

# 2. 将 packages/pwa 部署到 Netlify
cd packages/pwa
npx netlify deploy --prod --dir=dist
```

需要新建 `netlify/functions/proxy.js` 和 `netlify.toml`（已随项目提供）。Netlify 会自动部署函数。

---

## 各平台 DDG 代理对照表

| 平台 | 代理文件 | 访问路径 |
|------|---------|---------|
| Cloudflare Pages | `functions/api/proxy.js` | `/api/proxy` |
| VPS（PHP） | `api/proxy.php` | `/api/proxy.php` |
| VPS（Node.js） | `scripts/proxy-server.mjs` | `/api/proxy` |
| Vercel | `api/proxy.js` | `/api/proxy` |
| Netlify | `netlify/functions/proxy.js` | `/.netlify/functions/proxy` |
| 本地开发 | Vite proxy → `scripts/proxy-server.mjs` | `/api/proxy` |

所有平台代理行为一致：接收 `?url=` 参数，校验域名白名单（仅 `api.duckduckgo.com`），服务端发起 fetch，返回结果。

---

## 关于 DuckDuckGo 代理的必要性

DuckDuckGo Instant Answer API 会检测浏览器特有的 `Sec-Fetch-*` 请求头，如果识别到请求来自浏览器环境，会返回**字段值全空**的 JSON。因此需要服务端转发——代理文件在服务器上发起请求，不在浏览器环境内。

详见 `docs/DDG_INSTANT_ANSWER_DEBUG.md`。

---

## 问题排查

| 问题 | 可能原因 |
|------|---------|
| `instant_answer` 返回空 | DDG 代理未正确部署或路径不对 |
| `search_wikipedia` 正常但 `instant_answer` 不行 | 仅 DDG 需要代理，Wikipedia 原生 CORS |
| 登录失败 | 需要有效的 Bluesky 账号 + App Password |
| AI 对话不回复 | 需要配置 LLM API Key（DeepSeek / OpenAI / 其他） |

---

*有问题请提 [Issues](https://github.com/epheiamoe/bsky/issues)*
