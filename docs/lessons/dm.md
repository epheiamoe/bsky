# DM & Messaging Lessons

> Direct messages, conversations, reactions, and chat features
>
> Part of the [Lessons Learned](../LESSONS.md) collection.

---

## Lesson 19: `markConvoRead` — Optimistic Clear Unread Badge

**Category**: DM/Messaging

**Root Cause**: `markRead()`（`chat.bsky.convo.updateRead`）只更新服务端状态。客户端 `useConvoList.convos` 数组中的 `unreadCount` 保持旧值，直到 `silentPoll`（30s 间隔）拉回最新数据。`App.tsx` 的 `dmCount` 和 `Sidebar` 的标记均依赖此数据。

**Fix**: `useConvoList` 中新增 `markConvoRead(convoId)` 模块级函数：
```typescript
// Module-level setter — called by DMChatPage after markRead
let _clearUnread: ((convoId: string) => void) | null = null;
export function markConvoRead(convoId: string): void {
  _clearUnread?.(convoId);
}

// 在 hook 内部注册
useEffect(() => {
  _clearUnread = (id: string) => {
    setConvos(prev => prev.map(c =>
      c.id === id ? { ...c, unreadCount: 0 } : c
    ));
  };
  return () => { _clearUnread = null; };
}, []);
```

`DMChatPage` mount 时：`loadConvo().then(() => { markRead(); markConvoRead(convoId); })`。

**Lesson Learned**: 服务端状态变更必须同步反映到客户端——乐观更新是必需的，不能等到下一轮轮询。模块级函数（而非 prop drilling）适合在不同组件树分支间传递状态变更。

---