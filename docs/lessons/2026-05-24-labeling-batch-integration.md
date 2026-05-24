# 教训：标记系统 UI 修复与批量集成陷阱

## 日期: 2026-05-24
## 版本: v0.15.0
## 分类: UI/UX, 架构, 测试

---

## 1. 问题概述

v0.15.0 标记系统在发布后遇到多个 UI 和集成问题，最终导致一个**关键架构缺陷**被发现：审核决策引擎完整运作，但从未被任何列表组件调用。

---

## 2. 修复的问题

### 2.1 SettingsPage 无法滚动

**现象**: 设置页面内容超出视口但无法滚动。

**根因**: 
```css
/* 错误 */
min-h-0  /* 没有固定高度，overflow-y-auto 不工作 */

/* 正确 */
h-dvh md:h-[calc(100dvh-3rem)]  /* 固定高度 */
```

**教训**: `overflow-y-auto` 必须配合**固定高度**才能工作。`min-h-0` 在 flex 容器中有时有效，但不可靠。

### 2.2 添加标签服务"静默成功"

**现象**: 用户添加标签服务后无任何反馈，不知道是否成功。

**根因**: 没有状态反馈机制。

**修复**: 添加 `feedback` 状态（成功/错误横幅），3 秒后自动清除。错误场景包括：
- 已添加
- 不是标签服务
- 解析失败
- 服务获取失败

**教训**: 所有用户操作必须有**即时视觉反馈**，特别是网络请求。

### 2.3 推荐标签服务过滤错误

**现象**: 推荐列表显示已添加的服务。

**根因**: 
```typescript
// 错误 — 按显示名称过滤
!subscribedDids.has(labeler.name)  

// 正确 — 按 handle/DID 过滤
!subscribedHandles.has(labeler.handle)
```

**教训**: 过滤条件必须与**唯一标识符**（handle/DID）匹配，而非可变的显示名称。

### 2.4 表格滚动劫持

**现象**: 鼠标滚轮在表格区域无法滚动页面。

**根因**: `overflow-hidden` 创建滚动容器拦截 wheel 事件。

**修复**: `overflow-hidden` → `overflow-clip`

**教训**: 
- `overflow-hidden` = 创建 BFC + 可能拦截滚动
- `overflow-clip` = 仅裁剪内容，不创建滚动容器
- 需要 border-radius 但不希望滚动拦截时，**永远使用 `overflow-clip`**

---

## 3. 关键架构缺陷

### 3.1 问题: moderationDecision 从未传递给 PostCard

**发现**: 代码审查发现 `PostCard` 的 `moderationDecision` prop 始终为 `undefined`。

**影响范围**:
- FeedTimeline
- BookmarkPage
- ProfilePage
- SearchPage
- ListDetailPage
- ThreadView

**根本原因**: 
1. `useModeration()` hook 存在但**无人使用**
2. `resolveModerationBatch()` 存在但**无人调用**
3. `PostCard` 设计为接收 `moderationDecision`，但所有父组件都**未传递**

**后果**: 
- 隐藏/警告/徽章 UI **完全不可见**
- 标签系统后端工作正常，前端呈现为零
- 用户看到的帖子**完全不受标签系统影响**

### 3.2 为什么漏掉

**开发阶段**: 
- 先实现决策引擎（core）
- 再实现 UI 组件（overlay + PostCard prop）
- **缺少最后一步**: 将引擎接入列表渲染管道

**测试盲点**:
- 单元测试覆盖了 `resolveModeration()`
- 没有端到端测试验证 PostCard 是否接收决策
- 没有视觉回归测试

---

## 4. 修复方案

### 4.1 方案 A: 列表级批量处理（选定）

```typescript
// 在每个列表组件中
const decisions = useModerationBatch(posts, config, client);

// 渲染时传递
posts.map((post, i) => (
  <PostCard 
    post={post} 
    moderationDecision={decisions[i]}  // ← 新增
  />
))
```

**优点**:
- 批量查询标签（≤250 URI/次）
- 单次计算所有决策
- 与现有 `PostCard` 接口兼容

**实现步骤**:
1. 创建 `useModerationBatch(posts, config, client)` hook
2. 在 6 个列表组件中调用
3. 传递 `moderationDecision` 给 `PostCard`
4. TUI 中同样处理

### 4.2 方案 B: PostCard 自管理（否决）

让 `PostCard` 内部调用 `useModeration(post)`。

**否决原因**:
- N+1 查询问题（每个 PostCard 独立查标签）
- 性能极差（虚拟滚动列表可能渲染 100+ 卡片）
- 违背批量查询设计

---

## 5. 开发流程改进

### 5.1 必须新增的检查清单

对于任何"接受 prop 但 prop 由外部提供"的组件：

- [ ] 所有使用方是否传递了该 prop？
- [ ] 如果没有，是否有默认值或降级方案？
- [ ] 是否有类型检查/编译时保障？

### 5.2 架构验证点

对于任何"引擎 + UI"功能：

1. ✅ 引擎实现
2. ✅ UI 组件实现
3. ⚠️ **引擎与 UI 的连接**（最容易遗漏）
4. ✅ 端到端验证

### 5.3 测试策略

- **集成测试**: 验证列表组件 → PostCard → ModerationOverlay 数据流
- **视觉测试**: 至少一个被标记帖子的截图（隐藏/警告/徽章状态）
- **Storybook/Playground**: 隔离测试 ModerationOverlay 各种状态

---

## 6. 相关文件

| 文件 | 说明 |
|------|------|
| `packages/app/src/hooks/useModeration.ts` | useModeration + resolveModerationBatch |
| `packages/pwa/src/components/PostCard.tsx` | 接受 moderationDecision，当前无调用方 |
| `packages/pwa/src/components/FeedTimeline.tsx` | 需要集成 batch moderation |
| `packages/pwa/src/components/BookmarkPage.tsx` | 需要集成 batch moderation |
| `packages/pwa/src/components/ProfilePage.tsx` | 需要集成 batch moderation |
| `packages/pwa/src/components/SearchPage.tsx` | 需要集成 batch moderation |
| `packages/pwa/src/components/ListDetailPage.tsx` | 需要集成 batch moderation |
| `packages/pwa/src/components/ThreadView.tsx` | 需要集成 batch moderation |

---

## 7. 提交记录

- `TBD` — 文档更新（本次）
- `TBD` — 列表级批量审核集成

---

*记录者: Claude Code*
*关联: docs/LABELING.md, docs/TODO.md*
