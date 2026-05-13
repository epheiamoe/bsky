# PWA 设计系统

本项目 PWA 客户端的视觉语言继承 Bluesky 的**清新、开放、轻盈**气质，同时融合 X/Twitter 的高效信息密度，最终呈现为一份在 `docs/DESIGN.md` 中集中声明的设计规范。所有实现均以此为唯一权威来源。

[来源](docs/DESIGN.md#L1-L7)

---

## 1. 语义色板：Light/Dark 双模式

设计系统定义 6 个语义颜色角色，通过 CSS 自定义属性实现运行时主题切换。Light 和 Dark 模式共享相同的 `--color-primary`（`#00A5E0`），但 surface/border/text 等环境色在深色背景下整体压暗，确保可读性与沉浸感。

| CSS 变量 | Light 值 | Dark 值 | 语义角色 |
|---|---|---|---|
| `--color-primary` | `#00A5E0` | `#00A5E0` | 按钮、链接、AI 图标、活跃 Tab |
| `--color-primary-hover` | `#0095C9` | `#00B5F0` | Primary 按钮悬停 |
| `--color-surface` | `#F8F9FA` | `#121212` | 卡片、输入框背景 |
| `--color-border` | `#E5E7EB` | `#27272A` | 分割线、输入框边框 |
| `--color-text-primary` | `#0F172A` | `#F1F5F9` | 主标题、正文 |
| `--color-text-secondary` | `#64748B` | `#A3B4C0` | 次要文字、时间戳 |

主题切换通过 Tailwind `darkMode: 'class'` 策略实现：切换 `document.documentElement.classList.toggle('dark')` 即可触发 `.dark` 块中的变量覆盖。

```css
/* 等效于实际 index.css 中的声明 */
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

[来源](packages/pwa/src/index.css#L5-L21)

Tailwind 配置将这些 CSS 变量注册为语义色彩类，使组件中可直接使用 `bg-primary`、`text-text-secondary`、`border-border` 等原子类。

```ts
// tailwind.config.ts 语义映射
colors: {
  primary: {
    DEFAULT: 'var(--color-primary)',
    hover: 'var(--color-primary-hover)',
  },
  surface: 'var(--color-surface)',
  border: 'var(--color-border)',
  'text-primary': 'var(--color-text-primary)',
  'text-secondary': 'var(--color-text-secondary)',
}
```

[来源](packages/pwa/tailwind.config.ts#L7-L16)

---

## 2. Typography: Inter 字体栈与 5 级排版比例

字体栈主选 **Inter**（`font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`），作为 Tailwind `fontFamily.sans` 的默认值全局生效。

[来源](packages/pwa/tailwind.config.ts#L17-L19)

5 级排版比例（Mobile-first）：

| 层级 | 字号 | 字重 | 行高 | 使用场景 |
|---|---|---|---|---|
| **H1** | 28px | 700 | 1.2 | Feed 标题、Profile 名称 |
| **H2** | 22px | 600 | 1.3 | Modal 标题、帖子标题 |
| **Body** | 16px | 400 | 1.5 | 正文、回复内容 |
| **Caption** | 13px | 400 | 1.4 | 时间、用户名、互动数 |
| **Label** | 12px | 500 | 1.3 | Tab 文字、按钮小字 |

全局字母间距设为 `-0.01em`，配合 `font-feature-settings: "ss03"` 优化中英日韩混合排版的可读性。深色模式下，文字对比度要求 ≥ 4.5:1（符合 WCAG 2.1 AA）。

[来源](docs/DESIGN.md#L31-L37)

---

## 3. 布局网格：8px 基础网格与三栏响应式

**8px 基础网格**（`base-spacing: 8px`）是全线间距的基准单位：内边距、外边距、间隙均沿 `8 / 16 / 24 / 32 / 48` 这条步长链递增。

三栏布局结构（桌面 ≥1024px）：

| 区域 | 宽度 | 内容 |
|---|---|---|
| 左侧导航栏 | 280px (w-sidebar) | 时间线/通知/搜索/AI/发帖 |
| 主内容区 | max 880px (max-w-content) | Feed / Profile / 搜索结果 |
| 右侧面板 | 390px (w-right-panel) | Widget 面板（趋势/AI 建议等） |

移动端（≤768px）切换为顶部 App Bar + 底部 Tab Bar 布局，侧边栏变为全屏覆盖式抽屉，右侧面板隐藏。

```tsx
// Layout.tsx 中的三栏结构
<aside className="hidden md:flex flex-col w-sidebar ...">     {/* 左栏 */}
  <Sidebar ... />
</aside>
<main className="flex-1 max-w-content mx-auto ...">            {/* 主内容 */}
  {children}
</main>
<aside className="hidden lg:flex flex-col w-right-panel ...">  {/* 右栏 */}
  <WidgetPanel ... />
</aside>
```

[来源](packages/pwa/src/components/Layout.tsx#L249-L268)

---

## 4. 组件视觉规范

### 4.1 按钮变体

系统中存在四类按钮，通过 className 组合区分：

| 变体 | 基础样式 | 悬停状态 | 典型场景 |
|---|---|---|---|
| **Primary** | `bg-primary text-white` | `hover:bg-primary-hover` | 提交、保存、登录 |
| **Secondary** | `border border-border` | `hover:bg-surface` | 取消、次要操作 |
| **Ghost** | `text-text-secondary` | `hover:text-text-primary` | 工具栏图标按钮 |
| **AI** | `bg-primary/10 text-primary border-primary` | — | AI 高亮入口 |

所有可点击元素附加 `btn-press` 按压反馈动画（`:active { transform: scale(0.95) }`），持续 75ms。

```tsx
// Primary 按钮示例
<button className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium disabled:opacity-50 transition-colors">
  {t('settings.saveAI')}
</button>

// Ghost 按钮示例（侧边栏）
<button className="text-text-secondary hover:text-text-primary transition-colors p-1">
  <Icon name="settings" size={18} />
</button>
```

[来源](packages/pwa/src/components/SettingsModal.tsx#L307-L311) | [来源](packages/pwa/src/components/Layout.tsx#L188-L193) | [来源](packages/pwa/src/index.css#L160-L161)

### 4.2 Post Card（帖子卡片）

帖子的视觉结构遵循固定层序：

1. **头像**（圆形，`rounded-full`，40×40px）
2. **元信息行**：显示名 + @handle + 时间，使用 `text-text-secondary caption` 级别
3. **正文**：`text-text-primary body`，最大 3 行截断（`line-clamp-3`）
4. **媒体**：图片网格（最大 4 张）、视频缩略图、外部链接卡片
5. **操作栏**：`PostActionsRow`——回复 / 转发(含引用弹窗) / 点赞 / 书签 / AI 分析

```tsx
// PostActionsRow 操作栏布局
<div className="flex items-center gap-3 text-text-secondary text-xs mt-1">
  {/* 回复 */}
  <button className="hover:text-primary transition-colors flex items-center gap-0.5 btn-press">
    <Icon name="corner-down-right" size={14} />{replyCount}
  </button>
  {/* 点赞 */}
  <button className={`hover:text-red-500 transition-colors btn-press ${isLiked ? 'text-red-500' : ''}`}>
    <Icon name="heart" size={14} />{likeCount}
  </button>
  {/* AI 分析 */}
  <button className="hover:text-purple-500 transition-colors btn-press">
    <Icon name="astroid-as-AI-Button" size={14} />
  </button>
</div>
```

卡片悬停状态：轻微上浮 + 阴影增强（`hover:shadow-sm` 或 `hover:border-primary`）。深色模式下，卡片 hover 时边框高亮（`hover:border-white/10`）。

[来源](packages/pwa/src/components/PostActionsRow.tsx#L45-L81) | [来源](packages/pwa/src/components/FeedTimeline.tsx#L30-L41)

### 4.3 Modal / Sheet

以 `SettingsModal` 为例，Modal 的核心视觉规范：

- 遮罩层：`bg-black/40 backdrop-blur-sm`（半透明黑底 + 毛玻璃）
- 容器：`rounded-xl shadow-xl border border-border`（12px 圆角 + 阴影 + 边框）
- 最大高度：`max-h-[80vh]`，内容溢出时内部滚动
- 标题栏：`border-b border-border` 分隔，`text-lg font-semibold`
- Tab 切换：`border-b-2 border-primary` 活跃指示器

```tsx
// Modal 骨架
<div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
  <div className="relative bg-white dark:bg-[#121212] rounded-xl shadow-xl border border-border w-full max-w-md max-h-[80vh] flex flex-col">
    {children}
  </div>
</div>
```

[来源](packages/pwa/src/components/SettingsModal.tsx#L143-L145)

### 4.4 Navigation（侧边栏 / 底部 Tab）

侧边栏 Tab 的活跃态使用 **左边框高亮 + 半透明底色** 双重标识：

```tsx
`className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left w-full border-l-2 ${
  isActive
    ? 'bg-primary/10 text-primary font-semibold border-primary'
    : 'text-text-secondary hover:bg-surface border-transparent'
}`}
```

未激活 Tab：`text-text-secondary` + 悬停时 `hover:bg-surface`。
徽章（未读数）：`bg-primary text-white rounded-full`。

[来源](packages/pwa/src/components/Sidebar.tsx#L50-L54)

---

## 5. AI 功能元素的特殊蓝色光晕标识

设计系统为 AI 相关功能赋予独立的视觉语言，使其在界面中可以被用户**一眼识别**。

- **侧边栏 AI Tab**：与普通 Tab 相同的活跃态规范，但图标使用独特的 `astroid-as-AI-Button` SVG（AI 小行星图标）。
- **帖子操作栏 AI 按钮**：使用同一图标，悬停变紫色（`hover:text-purple-500`）。
- **AI Thinking 卡片**：使用紫色脑形图标（`text-purple-400`），边框在展开时变为 `border-purple-500/30`，配合 `bg-white/[0.03]` 微亮底。
- **Elevation 规范**：`docs/DESIGN.md` 明确要求 AI 相关元素增加"微弱蓝色光晕"——在深色模式下通过 `dark-glow`（`0 0 0 1px rgba(0,165,224,0.2)`）实现；Light 模式下则通过半透明 primary 底色（如 `bg-primary/10`）达成区隔。

```tsx
// AI Thinking 组件的紫色标识
<svg className="shrink-0 text-purple-400" ... />
<span className="font-medium text-purple-400">AI 思考中...</span>
```

[来源](packages/pwa/src/components/ai/ThinkingCard.tsx#L25-L27)

---

## 6. 圆角系统与阴影层级

### 圆角尺度

| 名称 | 值 | 用途 |
|---|---|---|
| `rounded-none` | 0px | — |
| `rounded-sm` | 4px | 极小元素 |
| `rounded-lg` / `rounded-md` | 8px / 6px | 卡片、输入框 |
| `rounded-xl` | 12px | Modal 容器 |
| `rounded-full`（pill） | 9999px | 按钮、Avatar、Tab、徽章 |

### 阴影与深度

| 模式 | 阴影定义 | 用途 |
|---|---|---|
| Light | `shadow-sm` / `shadow-md` | 卡片、Modal |
| Dark | 内发光 + 边框高亮 | 避免深色背景上阴影不可见 |
| AI 元素 | `0 0 0 1px rgba(0,165,224,0.2)` | 蓝色光晕标识 |

[来源](docs/DESIGN.md#L45-L55)

---

## 7. Do's and Don'ts

**Do:**
- 保持大量留白，呼吸感优先
- 所有可点击元素提供清晰的 hover / active / focus 三态反馈
- AI 功能始终使用 Primary 色或紫色高亮，让用户一眼识别
- 深色模式下文字对比度 ≥ 4.5:1
- 移动端优先设计，所有组件支持触控

**Don't:**
- 不要使用过多阴影或 Neumorphism 风格（破坏 Bluesky 的极简气质）
- 不要在 Feed 中堆叠过多信息——单卡最多 3 行预览（`line-clamp-3`）
- 不要强制用户选择主题色——默认天空蓝，提供"跟随系统"选项
- 不要在移动端保留桌面三栏布局

[来源](docs/DESIGN.md#L152-L165)

---

## 下一步

- 查看组件在 [PWA 核心组件详解](pwa-核心组件详解.md) 中的完整实现，了解 PostCard、FeedTimeline、ThreadView 等如何运用本设计系统
- 了解 [虚拟滚动与滚动恢复](虚拟滚动与滚动恢复.md) 如何与 Feed 卡片列表协同
- 探索 [Widget 组件系统](widget-组件系统.md) 中右侧面板的 Widget 渲染规则
- 回顾 [PWA 应用架构](pwa-应用架构.md) 的构建工具链与主题切换机制