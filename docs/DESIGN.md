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

字体栈：**Inter**（推荐） + 系统字体回退，保证跨平台一致性与极佳可读性。

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
  - 主内容区：最大 680px（Feed / Profile / 搜索结果）
  - 右侧面板：300px（趋势、AI 建议、谁在关注）

- **移动端**（≤768px）：
  - 顶部 App Bar + 底部 Tab Bar（Home / Search / Notifications / AI / Post）
  - 浮动发帖按钮（FAB）固定右下角

间距尺度：
- 8px / 16px / 24px / 32px / 48px（倍数递增）

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
- **AI** Tab 使用特殊蓝色光效 + “AI” 徽章

### 2. Feed Card（帖子）
- Avatar（圆形，带在线状态可选）
- 内容区：用户名 + Handle + 时间 + 正文（支持富文本、图片、视频）
- 互动栏：回复 / 转发 / 点赞 / 书签 / **AI 回复建议**（单独蓝色按钮）
- Hover / 按压反馈明显

### 3. Post Composer（发帖）
- 多行输入 + 媒体预览 + AI 润色按钮（醒目 Primary 色）

### 4. AI 专属组件
- **AI 浮窗** / **侧边 AI Panel**：半透明玻璃态（backdrop-blur）
- **AI 回复建议卡**：蓝色渐变边框 + “由 AI 生成” 水印
- **AI 总结**：Feed 顶部一键按钮，展开卡片式总结

### 5. Button 变体
- Primary（实色）
- Secondary（描边）
- Ghost（透明）
- AI（带闪电图标 + 渐变）

### 6. Modal / Sheet
- 圆角 12px
- 毛玻璃背景（backdrop-filter: blur(16px)）

## Do's and Don'ts

**Do:**
- 保持大量留白，呼吸感优先
- 所有可点击元素提供清晰 hover / active / focus 状态
- AI 功能始终使用 Primary 色高亮，让用户一眼识别
- 深色模式下文字对比度 ≥ 4.5:1
- 移动端优先设计，所有组件支持触控

**Don't:**
- 不要使用过多阴影或 Neumorphism 风格（破坏 Bluesky 的极简气质）
- 不要在 Feed 中堆叠过多信息（单卡最多 3 行预览）
- 不要强制用户选择主题色（默认天空蓝，提供“跟随系统”选项）
- 不要在移动端保留桌面三栏布局

---

**使用方式**（给 AI 提示时直接引用）：
> 请严格参考项目根目录的 DESIGN.md 生成所有 UI 组件。使用 CSS 变量实现主题切换，默认 primary 为 #00A5E0，支持 Light/Dark 自动适配。

依菲雅，这个 DESIGN.md 已完整、可直接复制到项目根目录。  
它同时覆盖了你 TUI 中已实现的功能（时间线、通知、搜索、AI、发帖），但视觉完全对齐 Bluesky Web 的现代风格。

需要我立刻帮你：
- 生成配套的 `tailwind.config.js` / CSS 变量文件？
- 补充具体组件的 Figma 描述或代码示例？
- 或者调整成更偏 X 黑色的暗黑主题？

随时说，我继续迭代！🚀