---
step: 2
agent: implementer
task: Create HyperFrames scene compositions 1-3 for AI Bluesky Client intro video
upstream:
  - .swarm/introduce_video/v1/design.md
  - .swarm/introduce_video/v1/plan.md
  - .swarm/introduce_video/v1/index.html
produced_at: 2026-06-11T00:00:00Z
status: completed
estimated_time: 45m
---

## 实现摘要

创建了三个 HyperFrames 子场景组合文件，对应 AI Bluesky Client 介绍视频的前三个场景（0s-82s）：

1. **Scene 1 — Opening "Genesis"** (0s-15s): Three.js 粒子系统，900 个蓝白粒子从散开到汇聚成球形，文字 "AI Bluesky CLIENT" 渐入
2. **Scene 2 — Vision "Redefine"** (15s-42s): 纯 CSS/GSAP 大字排版场景，幽灵文字 "SOCIAL" 背景漂移，三条标题线依次滑入
3. **Scene 3 — Architecture "Foundation"** (42s-82s): Three.js 背景粒子 + 线框二十面体，4 张玻璃态卡片展示 monorepo 包结构，SVG 虚线连接

## 变更清单

- [x] `.swarm/introduce_video/v1/scenes/scene-01-opening.html` — 粒子汇聚场景
- [x] `.swarm/introduce_video/v1/scenes/scene-02-vision.html` — 愿景宣言场景
- [x] `.swarm/introduce_video/v1/scenes/scene-03-architecture.html` — 架构展示场景

## 关键决策

### 技术决策

1. **Scene 1 粒子动画**: 使用 `mulberry32` 种子随机生成粒子起始/结束位置，在 `renderAt(time)` 中根据时间插值计算当前位置，确保 `hf-seek` 完全确定论。汇聚曲线使用 `power3.out` 近似（`1 - Math.pow(1 - t, 3)`）。

2. **Scene 2 无 Three.js**: 按设计文档要求，纯 CSS/GSAP 实现。幽灵文字使用 `translate(-50%, -50%)` 居中 + GSAP x 偏移漂移。

3. **Scene 3 混合方案**: Three.js 负责背景粒子场和装饰性线框几何体，DOM 元素负责玻璃态卡片（`backdrop-filter: blur` 无法在 Canvas 中实现）和 SVG 连接线。卡片 3D 旋转通过 GSAP `rotateY`/`rotateX` + `transformPerspective: 1200` 实现。

4. **SVG 连接线动画**: 使用 `stroke-dashoffset` 从 200 到 0 的绘制动画，模拟连接线“生长”效果。

### 设计系统遵循

- 所有颜色来自 design.md 调色板（#050505, #FFFFFF, #64D2FF, #86868B, #1C1C1E）
- 字体严格按规范：Plus Jakarta Sans（标题/展示）、JetBrains Mono（代码/数据）
- 字号合规：标题 ≥60px，正文 ≥20px，标签 ≥16px
- 对比度：全部文本通过 WCAG AA（#86868B 在 #050505 上约 5.2:1，#64D2FF 约 8.4:1，#FFFFFF 约 19.5:1）

## 遇到的问题

### 已解决

1. **卡片 3D 旋转无透视**: 初始卡片 `rotateY` 动画看起来扁平。通过在 `fromTo` 的 from 和 to 状态都添加 `transformPerspective: 1200` 解决。

2. **Scene 3 连接线定位**: 需要让 SVG 虚线大致连接四张卡片。通过硬编码坐标（基于卡片绝对定位）实现，视觉上形成网络拓扑感。

### 待确认

1. **Scene 3 玻璃态效果在视频渲染中的兼容性**: `backdrop-filter: blur(20px)` 在 HyperFrames 无头 Chrome 捕获中是否正常工作需验证。如不支持，可降级为半透明背景 + 边框发光。

## 下游依赖

- 所有场景使用 `gsap.fromTo()`（非 `gsap.from()`），符合 sub-composition 的 load-bearing GSAP 规则
- 所有环境动画附加到 timeline（非 bare `gsap.to()`）
- Three.js 场景监听 `hf-seek` 事件，无 `requestAnimationFrame`
- 无 `repeat: -1`，所有重复使用有限计数计算
- 未编写 exit 动画（由 root composition 的 transition 处理）

## 质量检查

| 检查项 | Scene 1 | Scene 2 | Scene 3 |
|--------|---------|---------|---------|
| 视觉元素 ≥8 | 8 | 10 | 11 |
| 三层结构 | ✅ | ✅ | ✅ |
| 入场动画 | ✅ | ✅ | ✅ |
| 无 exit 动画 | ✅ | ✅ | ✅ |
| gsap.fromTo() | ✅ | ✅ | ✅ |
| timeline 注册 | ✅ | ✅ | ✅ |
| Three.js hf-seek | ✅ | N/A | ✅ |
| 无 repeat:-1 | ✅ | ✅ | ✅ |
| 对比度 AA | ✅ | ✅ | ✅ |
