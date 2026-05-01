PWA 端的设计系统以 **CSS 自定义属性（CSS Custom Properties）** 为核心，通过 Tailwind CSS 配置层将语义化颜色变量映射为可直接使用的工具类（utility classes）。这种"定义一次，全局消费"的模式，使得主题切换（亮色/暗色）、品牌色统一维护、以及组件层面的零认知引用成为可能。整个设计系统由三层构成：变量定义层（`index.css`）、配置映射层（`tailwind.config.ts`）、组件消费层（`*.tsx`）。

Sources: [index.css](packages/pwa/src/index.css#L1-L121), [tailwind.config.ts](packages/pwa/src/tailwind.config.ts#L1-L31)

## 语义色板：变量定义与双主题映射

所有颜色值在 `:root` 和 `.dark` 选择器中以 CSS 自定义属性声明，Tailwind 配置层再将这些变量绑定为语义化的颜色名。这样做的好处是：一，品牌色只在一个地方定义；二，Tailwind 类名无需感知具体色值；三，暗色模式的切换只需在 `<html>` 上增删 `dark` class。

```css
:root {
  --color-primary: #00A5E0;
  --color-primary-hover: #0095C9;
  --color-surface: #F8F9FA;
  --color-border: #E5E7EB;
  --color-text-primary: #0F172A;
  --color-text-secondary: #64748B;
}

.dark {
  --color-primary: #00A5E0;
  --color-primary-hover: #00B5F0;
  --color-surface: #121212;
  --color-border: #27272A;
  --color-text-primary: #F1F5F9;
  --color-text-secondary: #A3B4C0;
}
```

Sources: [index.css](packages/pwa/src/index.css#L503-L512)

| CSS 变量 | 亮色模式值 | 暗色模式值 | 语义用途 |
|---|---|---|---|
| `--color-primary` | `#00A5E0` | `#00A5E0`（不变） | 品牌色：按钮、链接、激活态 |
| `--color-primary-hover` | `#0095C9` | `#00B5F0` | 品牌悬停态：按钮 hover、链接 hover |
| `--color-surface` | `#F8F9FA` | `#121212` | 表面色：卡片背景、侧栏背景 |
| `--color-border` | `#E5E7EB` | `#27272A` | 边框色：分割线、卡片边框、输入框边框 |
| `--color-text-primary` | `#0F172A` | `#F1F5F9` | 主文字色：标题、正文 |
| `--color-text-secondary` | `#64748B` | `#A3B4C0` | 次要文字色：时间戳、辅助信息、占位符 |

值得注意的设计决策是品牌色 `--color-primary` 在亮暗模式下保持相同的 `#00A5E0` 蓝色。这与许多设计系统在暗色模式下变亮品牌色的做法不同——Bluesky PWA 选择保持品牌标识的一致性，只在悬停态（hover）上做区分：暗色模式下 `--color-primary-hover` 从 `#0095C9` 变为更亮的 `#00B5F0`，以在深色背景上提供足够的视觉反馈。

Sources: [index.css](packages/pwa/src/index.css#L503-L512)

## Tailwind CSS 变量映射：将 CSS 变量转化为工具类

`tailwind.config.ts` 中的 `theme.extend.colors` 块将 CSS 变量注册为 Tailwind 的颜色工具类：

```typescript
colors: {
  primary: {
    DEFAULT: 'var(--color-primary)',
    hover: 'var(--color-primary-hover)',
  },
  surface: 'var(--color-surface)',
  border: 'var(--color-border)',
  'text-primary': 'var(--color-text-primary)',
  'text-secondary': 'var(--color-text-secondary)',
},
```

Sources: [tailwind.config.ts](packages/pwa/src/tailwind.config.ts#L503-L517)

这六个映射产生的 Tailwind 类名及对应的 CSS 输出如下：

| Tailwind 类名 | 生成的 CSS | 典型使用场景 |
|---|---|---|
| `bg-primary` | `background-color: var(--color-primary)` | 按钮背景、激活状态指示条 |
| `bg-primary/10` | `background-color: color-mix(in srgb, var(--color-primary) 10%, transparent)` | 半透明品牌色背景、选中态高亮 |
| `hover:bg-primary-hover` | `hover: background-color: var(--color-primary-hover)` | 按钮悬停 |
| `text-primary` | `color: var(--color-primary)` | 品牌色文字、链接 |
| `text-text-primary` | `color: var(--color-text-primary)` | 主文字 |
| `text-text-secondary` | `color: var(--color-text-secondary)` | 次要文字 |
| `bg-surface` | `background-color: var(--color-surface)` | 卡片、侧栏背景 |
| `border-border` | `border-color: var(--color-border)` | 所有边框 |
| `hover:bg-surface` | `hover: background-color: var(--color-surface)` | 列表项悬停效果 |

由于 Tailwind 的 `DEFAULT` 和 `hover` 是嵌套的命名空间，组件中既可以写 `bg-primary`（取 DEFAULT），也可以写 `hover:bg-primary-hover`（取 hover 层）。这种命名模式允许在同一个颜色族下扩展更多状态（如 `active`、`disabled`），而不破坏现有代码。

## 组件中的实际使用模式

### 模式一：纯 Tailwind 类名（最常见）

> 见于 `Layout.tsx`、`Sidebar.tsx`、`PostCard.tsx`

```tsx
// Layout.tsx — 全局面板布局
<div className="min-h-screen bg-white dark:bg-[#0A0A0A] text-text-primary font-sans">
<header className="... bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">

// Sidebar.tsx — 导航项激活态
<button className={`... ${
  isActive
    ? 'bg-primary/10 text-primary font-semibold border-primary'
    : 'text-text-secondary hover:bg-surface border-transparent'
}`}>
```

Sources: [Layout.tsx](packages/pwa/src/components/Layout.tsx#L503-L515), [Sidebar.tsx](packages/pwa/src/components/Sidebar.tsx#L503-L510)

### 模式二：暗色模式使用硬编码色值（备选）

> 见于 `App.tsx`、`AIChatPage.tsx`

在某些需要深黑色背景的场景中，组件直接使用 `dark:bg-[#0A0A0A]`（比 `--color-surface: #121212` 更深），因为设计变量中没有定义独立的"页面背景色"。这种硬编码属于设计系统的"逃逸口"（escape hatch），暗示未来可以将 `#0A0A0A` 提炼为一个新的 CSS 变量如 `--color-bg-page`。

```tsx
// App.tsx — 加载页面使用独立深色
<div className="flex items-center justify-center min-h-screen bg-white dark:bg-[#0A0A0A]">

// AIChatPage.tsx — 聊天面板背景
<div className="flex h-[calc(100dvh-3rem)] bg-white dark:bg-[#0A0A0A] font-sans">
```

Sources: [App.tsx](packages/pwa/src/App.tsx#L503-L505), [AIChatPage.tsx](packages/pwa/src/AIChatPage.tsx#L503-L505)

### 模式三：半透明色与混合色（CSS color-mix）

在现代浏览器支持的 `color-mix()` 函数上，设计系统实现了"无额外变量"的透明度效果：

```css
.markdown-body code {
  background-color: color-mix(in srgb, var(--color-border) 50%, transparent);
}
.markdown-body blockquote {
  border-left: 2px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
}
```

这种方式无需为每个颜色预定义 `--color-primary-30` 等透明度变量，而是按需混合，保持了设计系统的精简性。

Sources: [index.css](packages/pwa/src/index.css#L503-L512)

## 字体体系与排版层次

### 字体族定义

```typescript
fontFamily: {
  sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
},
```

Sources: [tailwind.config.ts](packages/pwa/src/tailwind.config.ts#L503-L505)

此字体堆栈遵循"渐进增强"原则：首选 Inter 字体（现代无衬线体，数字产品中广泛使用），回退到系统原生字体。`font-sans` 类被应用在 `Layout.tsx` 的最外层容器上，全局生效。

### 字体大小策略

PWA 端**没有定义自定义的字体比例（type scale）**，而是完全依赖 Tailwind 内置的字体大小工具类（`text-xs`、`text-sm`、`text-base`、`text-lg`、`text-2xl` 等）。实际使用中的字体大小分布如下：

| 层级 | Tailwind 类 | 实际 rem (px) | 使用场景 |
|---|---|---|---|
| 极小 | `text-xs` | 0.75rem (12px) | 时间戳、次要标签、状态信息 |
| 小号 | `text-sm` | 0.875rem (14px) | 正文、按钮文字、导航项、次要标题 |
| 基础 | `text-base` | 1rem (16px) | 页面标题、聊天标题 |
| 大号 | `text-lg` | 1.125rem (18px) | 页面主标题、Feed 顶栏标题 |
| 特大 | `text-2xl` | 1.5rem (24px) | 登录页主标题 |

对于 Markdown 渲染的内容，`index.css` 中 `.markdown-body` 类定义了独立的排版层次：

```css
.markdown-body h1 { font-size: 1.125rem; font-weight: 700; }
.markdown-body h2 { font-size: 1rem; font-weight: 600; }
.markdown-body h3 { font-size: 0.875rem; font-weight: 600; }
.markdown-body p  { /* line-height: 1.625, word-break */ }
.markdown-body code { font-size: 0.875rem; }
.markdown-body pre { font-size: 0.875rem; }
```

Sources: [index.css](packages/pwa/src/index.css#L503-L512)

这种设计选择意味着 Markdown 渲染的标题大小是内部一致的（h1=body text、h2=0.875rem、h3=0.75rem），与组件级别的字体比例系统保持独立，避免了两套排版体系之间的冲突。

## 布局尺寸变量与内容约束

`tailwind.config.ts` 中定义了三个布局尺寸变量：

```typescript
maxWidth: { content: '880px' },
spacing: {
  sidebar: '280px',
  'right-panel': '300px',
},
```

Sources: [tailwind.config.ts](packages/pwa/src/tailwind.config.ts#L503-L507)

这三个变量在组件中的使用模式形成了 PWA 端的三栏式布局骨架：

- **`max-w-content`** (880px)：主内容区域的最大宽度，居中显示在 `mx-auto` 容器中。用于 Feed 时间线、Thread 视图、Compose 页面等主要内容区。
- **`w-sidebar`** (280px)：左侧导航栏宽度，桌面端固定显示，移动端作为抽屉式侧栏（通过 overlay + translate-x 切换）。
- **`w-right-panel`** (300px)：右侧 AI 建议面板宽度，仅在 `lg` 断点以上显示（`hidden lg:flex`）。

```tsx
// Layout.tsx — 三栏布局结构
<div className="flex">
  <aside className="hidden md:flex flex-col w-sidebar ...">  {/* 左侧导航 */}
    <Sidebar ... />
  </aside>
  <main className="flex-1 max-w-content mx-auto w-full min-h-[calc(100vh-3rem)]">
    {children}                                         {/* 主内容区 */}
  </main>
  <aside className="hidden lg:flex flex-col w-right-panel ...">  {/* 右侧面板 */}
    ...
  </aside>
</div>
```

Sources: [Layout.tsx](packages/pwa/src/components/Layout.tsx#L503-L512)

## 暗色模式切换机制

暗色模式的切换完全基于 CSS class 策略（`darkMode: 'class'`），不依赖用户的系统偏好（`prefers-color-scheme`）。这意味着：

1. **初始状态**：从 `localStorage` 读取 `AppConfig.darkMode` 值，在 `App.tsx` 挂载时决定是否添加 `dark` class。
2. **切换方式**：用户点击顶栏的 🌙/☀️ 按钮，调用 `document.documentElement.classList.toggle('dark', dark)`。
3. **持久化**：暗色模式设置与其他配置一起保存到 `localStorage` 的 `bsky_app_config` key 中。
4. **生效范围**：所有 Tailwind 的 `dark:` 前缀类（如 `dark:bg-[#0A0A0A]`、`dark:bg-red-900/20`）以及 CSS 中 `.dark` 选择器下的变量覆盖。

```typescript
// App.tsx — 初始化
useEffect(() => {
  document.documentElement.classList.toggle('dark', getAppConfig().darkMode);
}, []);

// Layout.tsx — 切换
const toggleDark = useCallback(() => setDark((d) => !d), []);
```

Sources: [App.tsx](packages/pwa/src/App.tsx#L503-L505), [Layout.tsx](packages/pwa/src/Layout.tsx#L503-L505)

## Markdown  body 样式系统

`.markdown-body` 类为 AI 聊天回复、帖子详情等内容提供了完整的富文本渲染样式。该样式系统与设计系统的 CSS 变量深度集成，所有颜色都引用语义变量而非硬编码值：

| CSS 属性 | 使用的变量 | 视觉效果 |
|---|---|---|
| `code` 背景 | `color-mix(in srgb, var(--color-border) 50%, transparent)` | 半透明灰底，自适应暗色 |
| `pre` 背景 | `color-mix(in srgb, var(--color-border) 30%, transparent)` | 代码块背景，更淡 |
| `blockquote` 左边框 | `color-mix(in srgb, var(--color-primary) 30%, transparent)` | 品牌色半透明引号线 |
| `a` 颜色 | `var(--color-primary)` | 品牌色链接 |
| `th` 背景 | `var(--color-surface)` | 表格表头背景 |

这种设计意味着当未来修改主题颜色时，Markdown 样式会自动适应，无需额外维护。

Sources: [index.css](packages/pwa/src/index.css#L503-L512)

## 设计系统的演进空间

从现有代码中可以识别出几个值得未来优化的方向：

1. **缺失的页面背景变量**：`dark:bg-[#0A0A0A]` 在 5 个组件中重复出现（App.tsx、Layout.tsx、AIChatPage.tsx、ThreadView.tsx、ComposePage.tsx），建议提炼为 `--color-bg-page` 变量。
2. **字体比例系统**：目前没有统一的 type scale 变量，如果未来需要精确控制排版比例（如 1.25 倍率递增），可以在 `theme.extend.fontSize` 中定义自定义比例。
3. **状态颜色体系**：目前只有品牌色（primary）一组语义色，未来可以添加 `success`、`warning`、`error`、`info` 四组状态色，用于通知、错误提示等场景。
4. **动效与过渡时间**：代码中大量出现 `transition-colors` 但未定义统一的过渡时长变量，可以在 `theme.extend.transitionDuration` 中标准化。

Sources: [Layout.tsx](packages/pwa/src/components/Layout.tsx#L503-L515), [AIChatPage.tsx](packages/pwa/src/AIChatPage.tsx#L503-L505), [App.tsx](packages/pwa/src/App.tsx#L503-L505)

---

**设计原则回顾**：PWA 端的设计系统遵循"最小变量集 + Tailwind 配置映射 + 组件零耦合"的架构模式。六个 CSS 变量支撑起整个应用的亮暗双主题，通过 Tailwind 的工具类系统消除了组件对具体色值的依赖。这种设计在维护性（一处修改，全局生效）和开发体验（写类名而非写 CSS）之间取得了良好的平衡。建议后续开发者在添加新的 UI 组件时，优先使用 `text-text-primary`、`bg-surface`、`border-border` 等语义类名，而非硬编码颜色值。

如果你对设计系统的某个具体方面（如 Markdown 样式、布局响应式策略、或主题切换的交互细节）有深入兴趣，可以参考 `[设计系统：语义色板、字体比例与 Tailwind CSS 变量](25-she-ji-xi-tong-yu-yi-se-ban-zi-ti-bi-li-yu-tailwind-css-bian-liang)` 的源代码实现，或对比 `[PWA 浏览器环境：无需 .env，登录即用](4-pwa-liu-lan-qi-huan-jing-wu-xu-env-deng-lu-ji-yong)` 了解配置持久化机制。