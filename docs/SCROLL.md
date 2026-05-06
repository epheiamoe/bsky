# Scroll & Virtualization — 规范与实现状态

> 2026-05-06 · 公开文档

## 虚拟滚动

### 技术选型

PWA 使用 `@tanstack/react-virtual`（`useVirtualizer`）。TUI 使用 Ink 内置渲染，不需要虚拟滚动。

### 实现规范

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

const ESTIMATED_ITEM_HEIGHT = 120;

// 1. 固定高度的滚动容器
const scrollRef = useRef<HTMLDivElement>(null);

// 2. 虚拟器
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => ESTIMATED_ITEM_HEIGHT,
  overscan: 5,
});

// 3. 渲染
<div ref={scrollRef} className="h-[calc(100vh-3rem)] overflow-y-auto">
  <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
    {virtualizer.getVirtualItems().map(vi => {
      const item = items[vi.index]!;
      return (
        <div
          key={vi.key}
          data-index={vi.index}
          ref={virtualizer.measureElement}
          style={{ position: 'absolute', top: 0, transform: `translateY(${vi.start}px)`, width: '100%' }}
        >
          {/* item content */}
        </div>
      );
    })}
  </div>
</div>
```

### 页面适配状态

| 页面 | 虚拟滚动 | 实现方式 | 状态 |
|------|---------|---------|------|
| FeedTimeline | ✅ | `useVirtualizer` + container ref | ✅ |
| ProfilePage | ✅ | `useVirtualizer` + container ref | ✅ |
| BookmarkPage | ✅ | `useVirtualizer` + container ref | ✅ v0.5.1 |
| SearchPage | ⬜ | — | 待适配 |
| NotifsPage | ⬜ | — | 低优先级 |
| DMChatPage | ⬜ | — | 纯文本，暂不需要 |
| DraftsPage | ⬜ | — | 条目太少 |
| ConvoListPage | ⬜ | — | 条目轻量 |

---

## 滚动位置恢复

### 关键教训：必须使用像素值，不能用索引

**错误做法**（已在 FeedTimeline 中修复）：

```tsx
// ❌ 索引恢复 — 虚拟器在 ResizeObserver 触发前使用估算高度
virtualizer.scrollToIndex(N, { align: 'start' });
// 导致偏移 5-6 帖（估算 120px vs 实际 ~170px）
```

**正确做法**：

```tsx
// ✅ 像素值恢复 — 直接设置 scrollTop，虚拟器自然处理
scrollRef.current.scrollTop = savedScrollTop;
```

### 实现规范

使用 `useScrollRestore` hook，传入**容器 ref**（不是 `null`）：

```tsx
useScrollRestore('page-key', scrollRef, !loading && items.length > 0);
```

`useScrollRestore` 结构：
- **模块级 Map** 存储像素值，跨页面切换持久
- **on unmount** 保存当前 `scrollRef.current.scrollTop`
- **on mount** 当 `ready` 为 true 时恢复 `scrollRef.current.scrollTop = saved`
- **key** 用于区分不同页面的滚动位置

### 页面缓存状态

| 页面 | 位置恢复 | Key | Ref 类型 | 状态 |
|------|---------|-----|---------|------|
| FeedTimeline | ✅ 像素 | `feedScrollTopRef` (App.tsx ref) | container ref | ✅ v0.5.1 修复 |
| ProfilePage | ✅ 像素 | `profile-${actor}` | container ref | ✅ |
| BookmarkPage | ✅ 像素 | `bookmarks` | container ref | ✅ v0.5.1 |
| SearchPage | ✅ 像素 | `search-${query}` | `null` (window) | ✅ |
| NotifsPage | ⬜ | — | — | 待添加 |
| ThreadView | ⬜ | — | — | 不需要（逐次加载） |
| DM Chat | ⬜ | — | — | 部分保留（auto-scroll底部） |

### DMChatPage auto-scroll 规则

```tsx
// ✅ 只在用户处于消息底部时自动滚动
const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
if (isNearBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
```

用户向上翻看历史消息时，新消息到达**不会**将其拉回底部。

---

## 草稿：媒体不保存

### 设计原则

BLuesky 草稿**只保存文本**，不保存媒体（图片/视频）。这是正确的设计，不是 bug。

**理由**：
1. Twitter/X 草稿也不保存媒体
2. 媒体文件过大（视频可达 100MB），超出 AT Protocol 草稿存储限制
3. 草稿跨设备同步时，媒体传输成本高昂且用户期望不一致
4. ALT 文本在发帖时才最终确定，草稿阶段的 ALT 信息不完整

**实现**：`toDraftData()` 只序列化 `posts: [{ text }]`，不包含 `ComposeMedia[]`。

---
