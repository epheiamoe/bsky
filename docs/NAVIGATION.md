# Navigation State Machine

**File**: `packages/app/src/state/navigation.ts`
**Hook**: `packages/app/src/hooks/useNavigation.ts`

## AppView Union Type

```typescript
type AppView =
  | { type: 'feed' }
  | { type: 'detail'; uri: string }
  | { type: 'thread'; uri: string }
  | { type: 'compose'; replyTo?: string }
  | { type: 'profile'; actor: string }
  | { type: 'notifications' }
  | { type: 'search'; query?: string }
  | { type: 'aiChat'; contextUri?: string };
```

## Stack-Based Navigation

Navigation uses a push/pop stack:
- `goTo(view)` → pushes onto stack
- `goBack()` → pops stack (if depth > 1)
- `goHome()` → resets to `[{ type: 'feed' }]`
- `canGoBack` → true when stack.length > 1

## State Transition Diagram

```
feed ──Enter──▶ thread ──R/c──▶ compose (replyTo=uri)
  ▲               │  ▲           │  └──submit──▶ goHome() → feed
  │──Esc──────────┘  │──Esc──────┘
  │                  │
  │                  ──Enter──▶ thread (refocus on selected reply)
  │                              ▲  │
  │─────────────────Esc──────────┘  │
  │
  ──a/Ctrl+G──▶ aiChat
                  ▲  │
                  └──Esc──▶ goBack()
```

## Keyboard Shortcuts by View

| View | Keys |
|------|------|
| `feed` | ↑↓/jk: 导航, Enter: 详情, m: 更多, r: 刷新 |
| `thread` | ↑↓/jk: 移动, Enter: 聚焦, h: 回到主题帖, R: 回复, l: 赞, r: 转发 |
| `compose` | Enter: 发送 |
| `aiChat` | Tab: 切换聚焦, Esc(1): 去聚焦, Esc(2): 返回 |

## React Hook Usage

```typescript
import { useNavigation } from '@bsky/app';

function MyComponent() {
  const { currentView, canGoBack, goTo, goBack, goHome } = useNavigation();

  // Navigate to detail
  goTo({ type: 'detail', uri: 'at://did:plc:xxx/app.bsky.feed.post/yyy' });

  // Navigate to compose with reply context
  goTo({ type: 'compose', replyTo: postUri });

  // Go back
  goBack();
}
```

PWA uses the exact same `useNavigation()` hook. Just renders `<div>` instead of `<Box>`.
