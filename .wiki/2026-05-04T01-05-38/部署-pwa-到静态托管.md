# 部署 PWA 到静态托管

PWA（`@bsky/pwa`）是一个纯客户端应用，所有 Bluesky API 调用直接从浏览器发出，**不需要后端服务器**。这意味着你可以把构建产物丢到任意静态托管平台上，几分钟就能上线。

---

## 构建

```bash
cd packages/pwa && pnpm build
```

构建过程分为两步：TypeScript 编译（`tsc -b`）→ Vite 打包（`vite build`），最终输出到 `packages/pwa/dist/` 目录。 [来源](packages/pwa/package.json#L7-L8)

输出结构如下：

```
dist/
├── index.html
├── manifest.json
├── sw.js
├── assets/
│   ├── index-xxxxx.js
│   ├── index-xxxxx.css
│   └── ...
└── icons/
    ├── icon-64.png
    ├── icon-192.png
    └── icon-512.png
```

`dist/` 是纯静态文件，开箱即用。

---

## 部署到各平台

### Cloudflare Pages（推荐）

```bash
npx wrangler pages deploy dist --project-name ai-bsky --commit-dirty=true
```

如果网络环境限制无法使用 CLI，也可以通过 **Cloudflare Dashboard → Workers & Pages → Pages → Direct Upload**，直接拖拽 `dist/` 文件夹上传。 [来源](docs/PWA_GUIDE.md#L19-L25)

### Netlify

```bash
npx netlify deploy --dir dist --prod
```

### Vercel

```bash
npx vercel dist --prod
```

三个平台的部署逻辑完全一样：上传 `dist/` 目录并托管为静态站点。 [来源](README.md#L140-L146)

---

## 注意事项

### 不需要 `.env`

PWA 与 TUI 不同。TUI 通过 `.env` 文件读取 Bluesky 凭据和 AI API Key，而 PWA **完全不需要 `.env`**。所有凭据通过浏览器中的登录表单和设置页面输入，持久化在 `localStorage` 中。 [来源](docs/PWA_GUIDE.md#L27-L28)

关于 TUI 的环境配置，参见 [配置指南](配置指南.md)。

### SPA Fallback（所有路径指向 index.html）

PWA 使用 **Hash 路由**（URL 格式如 `#/feed`、`#/profile?actor=...`），这意味着所有请求路径本质上是单一 `index.html`。静态托管平台通常只需将根路径指向 `index.html` 即可。

- **Cloudflare Pages**：默认 `_redirects` 文件或通过仪表盘设置 SPA 模式。
- **Netlify**：在站点根目录放 `_redirects` 文件，内容为 `/* /index.html 200`。
- **Vercel**：在 `vercel.json` 中配置 `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`。

由于使用了 Hash 路由，即使不配置 SPA fallback，`#/` 后面的路径也不会发送到服务器，所以大多数情况下**直接上传即可工作**。

关于 Hash 路由的实现在 [PWA 浏览器应用实现](pwa-浏览器应用实现.md) 中有详细说明。

### Service Worker 路径范围

Service Worker 在 `main.tsx` 中以 `./sw.js` 注册，作用域为 `'./'`（相对路径）。这意味着 `sw.js` 必须与 `index.html` 同目录。构建产物中 `sw.js` 在 `dist/` 根目录，Vite 的 `base: './'` 配置确保了所有资源路径都是相对的，部署到任意子路径都不会出问题。 [来源](packages/pwa/src/main.tsx#L6-L12)

Service Worker 实现了四层缓存策略：
- **CDN 图片**（cdn.bsky.app）：缓存优先
- **Google Fonts**：缓存优先 + stale-while-revalidate
- **API 请求**（bsky.social 等）：网络优先
- **Vite 构建资源**（hash 文件名）：缓存优先 [来源](packages/pwa/public/sw.js#L1-L92)

### manifest.json 配置

PWA 可安装性依赖于 `manifest.json`，构建后会原样复制到 `dist/`。关键字段：

```json
{
  "name": "Bluesky Client",
  "short_name": "Bluesky",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#00A5E0",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "purpose": "any maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "purpose": "any maskable" }
  ]
}
```

- `display: "standalone"`：安装后以独立窗口运行，无浏览器地址栏
- `theme_color: "#00A5E0"`：Bluesky 品牌蓝，影响浏览器地址栏颜色和任务栏图标背景
- `purpose: "maskable"`：图标支持自适应遮罩，在 Android 等平台自动适配形状

`index.html` 中还设置了 `apple-mobile-web-app-capable: yes` 等 meta 标签，确保 iOS 添加到主屏幕后也能以独立模式运行。 [来源](packages/pwa/public/manifest.json#L1-L32) [来源](packages/pwa/index.html#L1-L21)

---

## 部署后验证

上线后打开浏览器检查：

1. **PWA 可安装**：地址栏右侧出现安装图标（桌面端）或"添加到主屏幕"提示（移动端）
2. **离线可用**：安装后断网，应用仍能显示缓存的 UI 壳（Service Worker 在 install 阶段已缓存 `index.html` 和 `manifest.json`）
3. **登录正常**：输入 Bluesky Handle + App Password 后能正常浏览时间线和发帖
4. **AI 功能可用**：在设置页面填入 API Key 后，AI 对话和翻译功能正常工作

---

## 下一步

- 了解 PWA 的完整功能与架构：[PWA 浏览器应用实现](pwa-浏览器应用实现.md)
- 深入 Core 层的 AT Protocol 客户端：[@bsky/core：AT Protocol 客户端](bsky-core-at-protocol-客户端.md)
- 配置 AI 能力和模型供应商：[多模型供应商与 Provider 系统](多模型供应商与-provider-系统.md)