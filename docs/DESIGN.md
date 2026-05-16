---
name: Bluesky Client PWA
version: 1.0.0
description: 一个继承 Bluesky 简洁社交体验、融合 X（Twitter）AI 智能功能的 Progressive Web App 客户端。默认主题色为 Bluesky 标志性天空蓝，支持 Light / Dark 模式切换及主题色自定义。
primary-color: "#00A5E0"
base-spacing: 8px
rounded: 9999px

# 语义色板（支持 Light / Dark 两种模式）
colors:
  light:
    background: "#FFFFFF"
    surface: "#F8F9FA"
    border: "#E5E7EB"
    text-primary: "#0F172A"
    text-secondary: "#64748B"
    primary: "#00A5E0"
    primary-hover: "#0095C9"
    accent: "#1DA1F2"
  dark:
    background: "#0A0A0A"
    surface: "#121212"
    border: "#27272A"
    text-primary: "#F1F5F9"
    text-secondary: "#A3B4C0"
    primary: "#00A5E0"
    primary-hover: "#00B5F0"
    accent: "#1DA1F2"

typography:
  font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
  scale:
    h1: { size: "28px", weight: 700, line-height: 1.2 }
    h2: { size: "22px", weight: 600, line-height: 1.3 }
    body: { size: "16px", weight: 400, line-height: 1.5 }
    caption: { size: "13px", weight: 400, line-height: 1.4 }
    label: { size: "12px", weight: 500, line-height: 1.3 }

layout:
  sidebar-width: 280px
  content-max-width: 680px
  right-panel-width: 300px
  mobile-breakpoint: 768px

rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  pill: 9999px

elevation:
  shadow-sm: "0 1px 3px rgba(0,0,0,0.1)"
  shadow-md: "0 4px 6px -1px rgba(0,0,0,0.1)"
  dark-glow: "0 0 0 1px rgba(0,165,224,0.2)"
---

# Overview

**Bluesky Client PWA** 是一款以 Bluesky 极简、呼吸感设计语言为核心，融合 X 平台 AI 智能能力的跨平台社交客户端。  
视觉风格继承 Bluesky 的**清新、开放、轻盈**气质，同时保留 X 的高效信息密度。整体氛围：专业而不刻板、现代而不浮躁、温暖而不甜腻。

核心设计原则：
- **呼吸感**：大量留白 + 柔和圆角 + 微妙动效
- **一致性**：TUI 与 PWA 逻辑完全共享，UI 风格统一（PWA 为主视觉参考 Bluesky Web）
- **AI 第一**：AI 功能（智能总结、回复建议、话题洞察等）在界面中被视为一级入口，与时间线同等重要
- **可访问性**：100% 遵循 WCAG 2.1 AA 标准，支持高对比模式与动态主题切换
- **响应式**：桌面三栏（侧边栏 + 主内容 + 右面板），平板两栏，移动端底部导航 + 浮动发帖按钮

## Colors

**默认主题色**：`#00A5E0`（Bluesky 标志性天空蓝）  
支持用户在设置中切换**主题色**（提供 6-8 种预设，包括 X 蓝 #1DA1F2、紫、绿等）。

**语义角色**（Light / Dark 自动切换）：
- **Primary**：按钮、链接、AI 图标、活跃 Tab
- **Surface**：卡片、输入框背景
- **Text**：主标题 / 正文 / 次要文字
- **Border**：分割线、输入框边框
- **Accent**：点赞、转发、AI 闪光点

所有颜色均通过 CSS 变量实现（`--color-primary`），便于运行时切换。

## Typography

字体栈：**Inter**（推荐）+ 系统字体回退，保证跨平台一致性与极佳可读性。

层级（Mobile-first）：
- **H1**（28px / 700）：Feed 标题、Profile 名
- **H2**（22px / 600）：帖子标题、Modal 标题
- **Body**（16px / 400）：正文、回复
- **Caption**（13px / 400）：时间、用户名、互动数
- **Label**（12px / 500）：Tab 文字、按钮小字

行高统一 1.4-1.5，字母间距 `-0.01em`，支持中英日韩混合排版（`font-feature-settings: "ss03"`）。

## Layout & Spacing

采用 **8px** 基础网格系统（`base-spacing: 8px`）。

- **桌面布局**（≥1024px）：
  - 左侧导航栏：固定 280px（包含 时间线、通知、搜索、**AI**、发帖）
  - 主内容区：最大 880px（Feed / Profile / 搜索结果）
  - 右侧面板：300px，但可收起（趋势、AI 建议、谁在关注，这部分作为TODO，目前先留白）

- **移动端**（≤768px）：
  - 顶部 App Bar + 底部 Tab Bar（Home / Search / Notifications / AI / Post）
  - 浮动发帖按钮（FAB）固定右下角

间距尺度：
- 8px / 16px / 24px / 32px / 48px（倍数递增）

## SettingsPage Layout

设置页采用 `flex flex-col min-h-0` 布局模式，由父级 `flex-1` 控制整体高度：

```html
<div class="flex flex-col bg-background min-h-0">
  <!-- Header (sticky) -->
  <div class="sticky top-0 z-10 bg-background border-b border-border flex-shrink-0">
    <div class="flex items-center h-12 px-4 gap-3">
      <span class="text-lg font-semibold text-text-primary">Settings</span>
    </div>
    <!-- Tab bar -->
    <div class="flex px-2 overflow-x-auto scrollbar-none border-b border-border">
      <!-- tabs -->
    </div>
  </div>
  
  <!-- Content: flex-1 填充剩余空间，overflow-y-auto 内部滚动 -->
  <div class="flex-1 overflow-y-auto p-5 space-y-4 max-w-lg mx-auto w-full">
    <!-- tab content -->
  </div>
</div>
```

**关键规则**：
- **`min-h-0`**：在 flex 容器中必须显式设置，防止子元素撑开父容器超出视口（CSS flex 默认 `min-height: auto` 的陷阱）
- **父级 `flex-1` 控制高度**：SettingsPage 作为 `Layout` 的子元素，由 Layout 的 flex 布局分配剩余空间，而不是用 `h-dvh` 硬编码
- **何时用 `min-h-0` vs `h-dvh`**：
  - `min-h-0`：作为 flex 子项的页面容器（FeedTimeline、SettingsPage、Sidebar 内部滚动区），由父级 flex 分配高度
  - `h-dvh`：顶层页面根容器（ProfilePage、SearchPage、AIChatPage），需要直接占满视口高度
  - 混合模式：`h-dvh md:h-[calc(100dvh-3rem)]` — 移动端全屏，桌面端减去顶部导航栏

## Elevation & Depth

- Light 模式：柔和投影（`shadow-sm` / `shadow-md`）
- Dark 模式：内发光 + 边框高亮（`dark-glow`）
- 卡片 hover：轻微上浮 + 阴影增强
- AI 相关元素：增加微弱蓝色光晕，视觉上与普通内容区分

## Shapes

- **圆角**：默认 `pill`（9999px）用于按钮、Avatar、Tab；卡片用 `md`（8px）
- **形状语言**：圆润、亲和、无尖锐直角
- **图标**：使用 Lucide Icons 或自定义 SVG，线条粗细 1.5-2px，保持一致性

## Components

### 1. Navigation（侧边栏 / 底部 Tab）
- 图标 + 文字（桌面）/ 纯图标（移动）
- 当前页高亮：Primary 色块 + 文字加粗
- **AI** Tab 使用特殊蓝色光效 + "AI" 徽章

### 2. Feed Card（帖子）
- Avatar（圆形，带在线状态可选）
- 内容区：用户名 + Handle + 时间 + 正文（支持富文本、图片、视频）
- 互动栏：回复 / 转发 / 点赞 / 书签
- Hover / 按压反馈明显

### 3. Post Composer（发帖）
- 多行输入 + 媒体预览(TODO) + AI 润色按钮（醒目 Primary 色）

### 5. Button 变体
- Primary（实色）
- Secondary（描边）
- Ghost（透明）
- AI（带闪电图标 + 渐变）

### 6. Modal / Sheet
- 圆角 12px
- 毛玻璃背景（backdrop-filter: blur(16px)）

## WelcomeCard Pattern

登录后一次性出现的引导向导，采用 **5 步渐进式披露** 设计：

```
Step 0: Welcome + Auth (工具权限说明)
Step 1: Pronouns (代词偏好)
Step 2: Personalization (深色/色弱/视觉模式)
Step 3: AI Setup (提供商选择)
Step 4: Done (完成动画)
```

**交互设计**：
- **顶部进度条**：圆点 + 连线指示器，已完成的步骤可点击跳转回退，当前步骤高亮蓝色，未来步骤灰色
- **AnimatePresence 步骤切换**：`mode="wait"` 确保退出动画完成后再进入下一步
- **Spring 动画**：`slideVariants` 使用 `{ opacity, x }` 位移动画，切换时内容从右侧滑入、向左侧滑出
- **渐进式披露**：工具列表默认折叠，点击展开显示全部 33 个工具；Provider 卡片默认收起，点击展开分步教程

**Provider Cards 布局**：
- 6 个提供商卡片（DeepSeek / OpenAI / xAI Grok / Mistral / OpenRouter / Kimi）
- 响应式单列布局（移动端）/ 双列网格（桌面端，使用 `grid-cols-2`）
- 每张卡片：名称 + 描述 + 可展开的步骤列表 + Base URL + 外部链接

## Theme Color Sync

`theme-color` meta 标签动态同步当前主题：

```javascript
// 3 个同步入口点
const meta = document.querySelector('meta[name="theme-color"]');
if (meta) meta.setAttribute('content', isDark ? '#000000' : '#FFFFFF');
```

- **Dark 模式**：`#000000`
- **Light 模式**：`#FFFFFF`
- **触发时机**：
  1. `App.tsx` init：应用启动时根据 `config.darkMode` 初始化
  2. `Layout.tsx` effect：深色模式切换时实时更新
  3. `SettingsModal` / `SettingsPage` / `WelcomeCard` save：用户手动保存设置时同步

## Post Preview Line Count

帖子预览行数通过 **范围滑块（range slider）** 控制，支持三个独立维度：

| 维度 | 默认值 | 范围 | 用途 |
|------|--------|------|------|
| `postPreviewLines` | 10 | 4-20 | Feed/搜索/资料页主帖 |
| `quotedPreviewLines` | 8 | 2-12 | 引用帖（quoted post） |
| `threadPreviewLines` | 8 | 2-12 | ThreadView 层级帖 |

**实现模式**：
```tsx
function PreviewSlider({ label, value, onChange, min, max }) {
  return (
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="text-sm text-text-primary">{label}</label>
        <span class="text-sm text-text-secondary font-mono w-8 text-right">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} 
             onChange={e => onChange(Number(e.target.value))}
             class="w-full accent-primary" />
      <div class="flex justify-between text-[10px] text-text-secondary/50 mt-0.5">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}
```

- 实时显示当前数值（等宽字体右对齐）
- 通过 `-webkit-line-clamp` 应用到正文 `<p>` 元素
- 设置页独立保存（`savePreview` 按钮），不与其他设置混合同步

## Provider Cards

设置页和 WelcomeCard 共享的**可展开卡片组件模式**：

```tsx
<motion.div layout className="rounded-xl border border-border overflow-hidden">
  {/* Header: 始终可见 */}
  <motion.button 
    onClick={() => setExpanded(!expanded)}
    className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-primary/5"
    aria-expanded={expanded}
  >
    <div>
      <span className="text-text-primary font-medium text-sm">{name}</span>
      <span className="text-text-secondary text-xs block">{desc}</span>
    </div>
    <motion.div animate={{ rotate: expanded ? 180 : 0 }}>
      <Icon name="chevron-down" size={16} />
    </motion.div>
  </motion.button>
  
  {/* Content: AnimatePresence 展开/收起 */}
  <AnimatePresence>
    {expanded && (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden"
      >
        {/* 步骤列表 / API Key 输入 / 链接 */}
      </motion.div>
    )}
  </AnimatePresence>
</motion.div>
```

**设计特征**：
- **Hover 反馈**：`hover:bg-primary/5` 提供微妙的悬停高亮
- **动画一致性**：所有展开/收起使用统一的 `height + opacity` 组合动画，时长 0.2s
- **语义化**：`aria-expanded` 标记可访问性状态
- **应用场景**：
  - WelcomeCard Step 3：6 个 AI 提供商卡片（静态展示）
  - SettingsPage AI Tab：提供商选择卡片（含 API Key 输入）

## CVD-Friendly Palette (色弱友好调色板)

通过 CSS `.cvd` class 可选启用，将三种色觉缺陷均无法区分的颜色对替换为安全三元组：

| 语义色 | 默认 | CVD 替代 | 用途 |
|--------|------|----------|------|
| **Red（喜爱/错误）** | `#EF4444` | `#C2185B`（品红） | 喜爱按钮、错误横幅、删除操作 |
| **Green（转发/成功）** | `#22C55E` | `#00897B`（蓝绿） | 转发按钮、成功提示、连接状态 |
| **Yellow（书签/警告）** | `#EAB308` | `#E65100`（琥珀） | 书签、警告横幅、字符计数 |

### 设计原理

- **红色盲（Protanopia, ~2%）**：红色呈现为暗灰色 → 品红在蓝色调上可区分
- **绿色盲（Deuteranopia, ~6%）**：红绿不可区分 → 蓝绿 vs 品红在亮度/饱和度上分离
- **蓝黄色盲（Tritanopia, 罕见）**：黄色褪为淡粉色 → 琥珀橙色调保持可辨识

调色板通过 CSS 变量（`--cvd-r-*`、`--cvd-g-*`、`--cvd-y-*`）实现，覆盖 Tailwind 的 `text-red-*`/`text-green-*`/`text-yellow-*` 等工具类。深色模式通过 `.dark.cvd` 组合选择器处理。

### 非颜色线索（阶段 A — 始终生效）

- PostActionsRow：`aria-pressed` 属性 + 直接回复已激活计数 `font-bold`（填补直接回复无 filled 图标的空白）
- 连接状态文本标签替代纯颜色圆点
- 错误/成功横幅 `role="alert"`/"status"

## Do's and Don'ts

**Do:**
- 保持大量留白，呼吸感优先
- 所有可点击元素提供清晰 hover / active / focus 状态
- AI 功能始终使用 Primary 色高亮，让用户一眼识别
- 深色模式下文字对比度 ≥ 4.5:1
- 移动端优先设计，所有组件支持触控
- 使用 `min-h-0` 约束 flex 子元素，防止容器溢出
- 动态同步 `theme-color` meta 标签到当前主题

**Don't:**
- 不要使用过多阴影或 Neumorphism 风格（破坏 Bluesky 的极简气质）
- 不要在 Feed 中堆叠过多信息（单卡最多 3 行预览）
- 不要强制用户选择主题色（默认天空蓝，提供"跟随系统"选项）
- 不要在移动端保留桌面三栏布局
- 不要在 flex 容器中混用 `h-dvh` 和 `flex-1`（二选一，由父级控制高度）

---

**使用方式**（给 AI 提示时直接引用）：
> 请严格参考项目根目录的 DESIGN.md 生成所有 UI 组件。使用 CSS 变量实现主题切换，默认 primary 为 #00A5E0，支持 Light/Dark 自动适配。
