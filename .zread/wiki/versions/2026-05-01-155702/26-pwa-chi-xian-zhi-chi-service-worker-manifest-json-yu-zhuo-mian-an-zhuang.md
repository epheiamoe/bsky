本页深入分析 `@bsky/pwa` 的离线支持架构，涵盖 **Service Worker 缓存策略**、**Web App Manifest 配置**、**桌面/移动端安装机制** 以及 **离线降级行为**。该 PWA 未使用 Workbox 或 Vite PWA 插件，采用手动管理的 Service Worker 实现，在完全控制缓存逻辑的同时保持极小的体积（sw.js 仅 80 行）。

---

## 一、架构总览

PWA 离线支持的三个核心支柱——**Service Worker**（拦截网络请求并管理缓存）、**Manifest**（定义安装元数据）和 **注册入口**（在应用启动时激活 SW）——共同构成了完整的离线体验。

```mermaid
graph TD
    subgraph "用户操作"
        A[浏览器访问 /] --> B{index.html 加载}
        B --> C[main.tsx 执行]
    end

    subgraph "SW 注册流程"
        C --> D[navigator.serviceWorker.register]
        D --> E[sw.js 下载 & 解析]
        E --> F{Install Event}
        F --> G[缓存: index.html, manifest.json, ./]
        G --> H[self.skipWaiting 激活]
        H --> I{Activate Event}
        I --> J[清理旧缓存]
        J --> K[self.clients.claim 接管页面]
    end

    subgraph "运行时请求拦截"
        L[用户请求] --> M{SW Fetch Event}
        M --> N{请求目标?}
        N -->|静态资源<br>cacheFirst| O[命中缓存?]
        O -->|是| P[返回缓存]
        O -->|否| Q[网络请求 → 缓存响应]
        Q --> R[返回响应]
        N -->|API 请求<br>networkFirst| S[网络可用?]
        S -->|是| T[网络响应 → 缓存]
        T --> U[返回响应]
        S -->|否| V[返回缓存 / 503 JSON]
    end

    subgraph "安装提示触发"
        B --> W{Manifest 满足条件?}
        W -->|display: standalone<br>icons: 192+512<br>SW 注册成功| X[浏览器触发 beforeinstallprompt]
        X --> Y[用户点击"安装"]
        Y --> Z[桌面/主屏快捷方式]
    end

    style D fill:#e1f5fe
    style E fill:#e1f5fe
    style F fill:#fff3e0
    style I fill:#fff3e0
    style M fill:#f3e5f5
    style W fill:#e8f5e9
```

**分层职责**：Service Worker 专注于离线缓存与请求路由，Manifest 负责安装元数据与展示模式，`index.html` 的 `<link rel="manifest">` 和 Apple 专用 meta 标签桥接浏览器与 PWA 功能。

Sources: [sw.js](packages/pwa/public/sw.js#L1-L80), [manifest.json](packages/pwa/public/manifest.json#L1-L31), [main.tsx](packages/pwa/src/main.tsx#L7-L15), [index.html](packages/pwa/index.html#L1-L24)

---

## 二、Service Worker：双策略缓存引擎

Service Worker 采用**手动编写、无外部依赖**的方式（80 行源代码），核心设计为两种缓存策略的差异化路由。

### 2.1 生命周期钩子

**Install 阶段**在 SW 首次安装时触发，将关键入口资源预缓存：

```javascript
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();  // 跳过 waiting 阶段，立即激活
});
```

`STATIC_ASSETS` 包含 `'./'`、`'./index.html'` 和 `'./manifest.json'`——这三者构成 PWA 的**最小离线骨架**。注意 `catch(() => {})` 的存在：如果某个资源缓存失败（例如网络不可用），不会阻塞整个安装流程。`self.skipWaiting()` 确保新版本的 SW 立即接管，而非等待所有页面关闭。

**Activate 阶段**清理旧版本缓存并接管客户端：

```javascript
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();  // 立即控制所有同源客户端
});
```

缓存命名空间 `bsky-v2` 的设计支持未来升级：当版本号变更时（例如 `bsky-v3`），旧缓存会被自动清除。`self.clients.claim()` 确保当前已打开的页面也立即受 SW 控制。

Sources: [sw.js](packages/pwa/public/sw.js#L10-L23)

### 2.2 请求拦截与策略路由

Fetch 事件是 SW 的核心，根据请求目标动态选择策略：

| 请求类型 | 匹配条件 | 策略 | 行为 |
|---------|---------|------|------|
| **静态资源** | 非 API 域名 | Cache-First | 优先返回缓存，未命中则网络请求并缓存 |
| **Bluesky API** | `bsky.social` / `public.api.bsky.app` | Network-First | 优先网络请求，失败时回退缓存 |
| **AI API** | `api.deepseek.com` 或含 `api.` 的域名 | Network-First | 同上 |
| **其他** | 未匹配以上规则 | Cache-First | 同上 |

**Cache-First 实现**：

```javascript
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;           // 缓存命中 → 直接返回
  try {
    const response = await fetch(request);
    if (response.ok) {                 // 仅缓存成功响应
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });  // 完全离线 → 503
  }
}
```

关键设计细节：仅缓存 `response.ok`（状态码 200-299）的响应，避免缓存错误页面。使用 `response.clone()` 因为 Response 对象只能被消费一次。

**Network-First 实现**：

```javascript
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());  // 网络成功 → 同时缓存
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Network offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });  // 网络失败 → 回退缓存 / 503 JSON
  }
}
```

API 请求采用 Network-First 的原因：Bluesky 的 feed、thread、profile 数据需要实时性，用户期望看到最新内容而非陈旧缓存。离线时的 503 JSON 响应确保 React 代码能通过 `response.ok` 检查感知到网络异常，进而展示 UI 层面的离线提示。

### 2.3 API 域名匹配规则

请求路由的判断基于 `url.hostname`，匹配逻辑依次为：

1. **精确匹配** Bluesky API：`bsky.social`（PDS 端点）、`public.api.bsky.app`（公共 API 端点）
2. **精确匹配** AI API：`api.deepseek.com`
3. **模式匹配**：`url.hostname.includes('api.')` —— 捕获其他潜在 API 域名

这种三层匹配策略覆盖了当前所有已知 API 端点，同时 `includes('api.')` 的宽匹配为未来 AI 服务商切换（如 OpenAI、Anthropic）提供了兼容性。

Sources: [sw.js](packages/pwa/public/sw.js#L24-L80)

---

## 三、Web App Manifest：安装元数据规范

`manifest.json` 是 PWA 可安装性的关键文件，定义了应用在用户设备上的"原生"表现。

### 3.1 核心配置

| 字段 | 值 | 作用与设计意图 |
|------|-----|-------------|
| `name` | `Bluesky Client` | 完整应用名称，安装后显示在启动器/桌面 |
| `short_name` | `Bluesky` | 主屏有限空间下的短名称 |
| `display` | `standalone` | **无浏览器 chrome 的全屏模式**——这是 PWA 体验的本质 |
| `start_url` | `./` | 相对路径，确保从任何子目录打开时正确解析 |
| `background_color` | `#FFFFFF` | 应用启动时的闪屏背景色（白色） |
| `theme_color` | `#00A5E0` | 状态栏、任务切换器中的主题色（Bluesky 蓝色） |
| `orientation` | `any` | 不限制方向，桌面和移动端皆可 |
| `categories` | `["social", "utilities"]` | 应用商店分类标签 |

`display: standalone` 是最关键的声明：它移除浏览器地址栏、标签页和导航按钮，给予应用完整的屏幕空间，同时配合 `theme_color` 在系统级（状态栏、任务切换卡）提供品牌一致性。

### 3.2 应用图标体系

```json
"icons": [
  {
    "src": "icons/icon-64.png",
    "sizes": "64x64",
    "type": "image/png"
  },
  {
    "src": "icons/icon-192.png",
    "sizes": "192x192",
    "type": "image/png",
    "purpose": "any maskable"
  },
  {
    "src": "icons/icon-512.png",
    "sizes": "512x512",
    "type": "image/png",
    "purpose": "any maskable"
  }
]
```

图标设计遵循三个尺寸层级：

- **64×64**：浏览器标签页 favicon 和书签图标
- **192×192**：Android/iOS 主屏图标的最小推荐尺寸，带 `maskable` 声明允许系统裁剪为自适应形状（圆形、圆角矩形等）
- **512×512**：应用启动闪屏和高质量安装图标，同样标记为 `maskable`

`purpose: "any maskable"` 是 Chrome 95+ 推荐的做法：`any` 允许浏览器按原样使用，`maskable` 则告知浏览器图标有安全边距（padding 区），可以安全地裁剪为系统要求的形状而不会切掉重要内容。

Sources: [manifest.json](packages/pwa/public/manifest.json#L1-L31), [public/icons](packages/pwa/public/icons#L1-L5)

---

## 四、iOS/Apple 专用元标签

`index.html` 中包含了 iOS Safari 的专有 meta 和 link 标签，确保在 Apple 生态中也能获得 PWA 体验：

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Bluesky" />
<link rel="apple-touch-icon" href="./icons/icon-192.png" />
```

| 标签 | 作用 |
|------|------|
| `apple-mobile-web-app-capable` | 启用 iOS 全屏模式（类似于 `display: standalone`，但仅 iOS 识别） |
| `apple-mobile-web-app-status-bar-style` | 状态栏样式为 `black-translucent`，内容扩展到状态栏区域 |
| `apple-mobile-web-app-title` | iOS "添加到主屏"时显示的短名称（覆盖 `short_name`） |
| `apple-touch-icon` | iOS 主屏图标文件 |

这些标签使得 PWA 在 iOS 设备上通过 Safari 的「共享 → 添加到主屏」安装后，获得与 Android 类似的独立应用体验。注意 iOS 不支持完整的 Service Worker 离线缓存策略，但 `apple-mobile-web-app-capable` 至少提供了全屏独立运行的能力。

Sources: [index.html](packages/pwa/index.html#L1-L24)

---

## 五、桌面安装流程

PWA 的桌面安装由浏览器原生机制驱动，依赖于 Manifest 和 Service Worker 的合规性。

### 5.1 安装触发条件

浏览器会在以下条件全部满足时触发 `beforeinstallprompt` 事件：

1. **Manifest 有效**：包含 `short_name`、`icons`（至少 192×192 和 512×512）、`display: standalone`
2. **Service Worker 已注册**：SW 文件可访问且注册成功
3. **HTTPS 协议**：PWA 必须通过 HTTPS 提供（或 localhost 开发环境）
4. **用户互动信号**：浏览器检测到用户对应用有持续兴趣

当前项目满足条件 1-3：Manifest 配置完整（上述分析已验证），SW 注册成功（`main.tsx` 第 10 行），且部署到 Cloudflare Pages 提供 HTTPS（参见 [PWA 快速启动：PWA 浏览器客户端安装与部署](3-kuai-su-qi-dong-pwa-liu-lan-qi-ke-hu-duan-an-zhuang-yu-bu-shu)）。

### 5.2 注册入口代码

```typescript
// main.tsx — 应用启动时立即注册 SW
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(
      (reg) => console.log('[PWA] SW registered:', reg.scope),
      (err) => console.warn('[PWA] SW registration failed:', err),
    );
  });
}
```

设计要点：`window.addEventListener('load', ...)` 延迟注册到页面完全加载后，避免 SW 下载与解析阻塞首屏渲染。`scope: './'` 将 SW 控制范围限定在当前目录及子目录，确保不会拦截不受控制的路径。注册失败仅输出 console.warn 而非抛出异常——SW 不是应用功能的硬依赖，没有 SW 应用仍然可以正常运行（只是失去离线能力）。

Sources: [main.tsx](packages/pwa/src/main.tsx#L7-L15)

---

## 六、离线行为与降级策略

了解各文件在在线/离线状态下的行为差异：

| 资源 | 在线行为 | 离线行为 | 用户体验影响 |
|------|---------|---------|------------|
| `index.html` | 缓存优先（首次从网络加载） | 从缓存返回 | 应用完全可打开 |
| `manifest.json` | 缓存优先 | 从缓存返回 | 安装元数据不变 |
| React bundle (JS/CSS) | Vite 构建产物，缓存优先 | 从缓存返回 | UI 完整可用 |
| `icons/*.png` | 缓存优先 | 从缓存返回 | 图标正常显示 |
| Bluesky API 请求 | 网络优先，同步缓存 | 返回 503 JSON | Feed/帖子/个人页 → 加载失败显示错误 |
| DeepSeek AI API 请求 | 网络优先，同步缓存 | 返回 503 JSON | AI 对话 → 显示"网络离线"提示 |
| 外部字体 (Google Fonts) | 网络请求（未缓存） | 不可用 | 回退到系统字体 |

### 6.1 离线时的 UI 反应

当用户在网络不可用时浏览已缓存页面：

```typescript
// useAIChat 中的网络错误处理
try {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    // 这里 response.status === 503 来自 SW 的 networkFirst 降级
    throw new NetworkError('Network offline');
  }
} catch (error) {
  // 展示离线提示，保留聊天上下文
  setError(t('ai.networkError'));
}
```

React 组件通过 `fetch` 响应中的 status 503 感知离线状态，从而在 UI 层展示适当的提示信息。应用的核心导航和已加载数据仍然可用——用户仍可以浏览之前加载的帖子（如果 React 状态中保留），但无法获取新数据。

Sources: [sw.js](packages/pwa/public/sw.js#L43-L80), [AI chat system docs](12-aiassistant-duo-lun-gong-ju-diao-yong-yin-qing-yu-sse-liu-shi-shu-chu)

---

## 七、构建与部署注意事项

### 7.1 Vite 构建配置

```typescript
// vite.config.ts — 关键配置
export default defineConfig({
  base: './',           // 相对路径——必须！否则部署到子路径时资源 404
  build: {
    outDir: 'dist',
    assetsDir: 'assets', // 静态资源统一目录
  },
});
```

`base: './'` 是 PWA 部署的关键：它确保所有资源路径（JS、CSS、图片）使用相对路径而非绝对路径。这样无论部署到 Cloudflare Pages 的根域名还是子路径，资源都能正确加载。如果没有此配置，`manifest.json` 和 `sw.js` 中的 `./` 路径可能因部署路径不同而解析错误。

### 7.2 Service Worker 文件位置

Service Worker 文件放在 `public/` 目录下，Vite 构建时会将其原样复制到 `dist/` 根目录。这是关键要求：SW 的 `scope: './'` 意味着它只能控制**同目录及子目录**的文件。如果 SW 文件嵌套在子目录中（如 `dist/js/sw.js`），则无法拦截根路径下的请求。

```
dist/
├── assets/            # Vite 打包的 JS/CSS
│   ├── index-xxxx.js
│   └── index-xxxx.css
├── icons/             # 静态图标
│   ├── icon-64.png
│   ├── icon-192.png
│   └── icon-512.png
├── index.html         # 入口 HTML
├── manifest.json      # 安装元数据
└── sw.js              # Service Worker — 必须在根目录
```

注意：`sw.js` 是纯手工编写的静态文件，不参与 Vite 的模块打包流程。这意味着 SW 中不能使用 ES Module 语法（`import`/`export`），也不能引用除 `public/` 目录外的资源。

Sources: [vite.config.ts](packages/pwa/vite.config.ts#L1-L24), [public directory structure](packages/pwa/public)

---

## 八、当前限制与未来优化路径

| 当前实现 | 限制 | 优化方向 |
|---------|------|---------|
| 手动 SW 管理 | 未使用 Vite PWA 插件，构建时不会自动注入资源哈希 | 引入 `vite-plugin-pwa` 实现 SW 自动生成与资源预缓存清单 |
| 缓存策略固定 | Cache-First 静态资源一旦缓存，用户看不到更新直到新版本 SW 激活 | 实现"Stale-While-Revalidate"策略：立即返回缓存，后台更新 |
| 无离线数据 | API 离线仅返回 503，用户无法浏览之前加载的内容 | 将 IndexedDB 中的聊天历史和帖子数据纳入离线缓存策略 |
| 无安装提示 | 未监听 `beforeinstallprompt` 事件，缺少自定义安装按钮 | 添加"安装到桌面"按钮，调用 `deferredPrompt.prompt()` |
| 图标占用空间异常 | 三个 PNG 图标文件极小（~500 bytes），可能是占位符 | 替换为实际设计的 SVG 或高分辨率 PNG 图标 |
| 无更新通知 | SW 更新静默执行，用户无法感知新版本可用 | 实现 `updatefound` 事件监听 + 用户提示"有新版本可用" |

Sources: [sw.js](packages/pwa/public/sw.js#L1-L80), [manifest.json](packages/pwa/public/manifest.json#L1-L31), [main.tsx](packages/pwa/src/main.tsx#L7-L15)

---

## 相关文档导航

- **上层架构**：[PWA 迁移指南：从 TUI 到 Web 的渲染层替换策略](6-pwa-qian-yi-zhi-nan-cong-tui-dao-web-de-xuan-ran-ceng-ti-huan-ce-lue) — 理解 PWA 在整个项目中的定位与 TUI 的架构差异
- **路由系统**：[Hash 路由系统：useHashRouter 与基于 URL hash 的 SPA 导航](25-hash-lu-you-xi-tong-usehashrouter-yu-ji-yu-url-hash-de-spa-dao-hang) — SW 拦截的请求如何与前端路由协同
- **部署指南**：[快速启动：PWA 浏览器客户端安装与部署](3-kuai-su-qi-dong-pwa-liu-lan-qi-ke-hu-duan-an-zhuang-yu-bu-shu) — 生产环境中 SW 和 Manifest 的正确部署步骤
- **数据持久化**：[PWA IndexedDB 实现：浏览器端聊天历史持久化](28-pwa-indexeddb-shi-xian-liu-lan-qi-duan-liao-tian-li-shi-chi-jiu-hua) — 离线数据的本地存储方案
- **组件全景**：[PWA 组件全景：页面组件、钩子与服务层清单](24-pwa-zu-jian-quan-jing-ye-mian-zu-jian-gou-zi-yu-fu-wu-ceng-qing-dan) — 涵盖所有 PWA 组件的完整索引