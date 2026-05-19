# Navigation State Machine

**File**: `packages/app/src/state/navigation.ts`
**Hook**: `packages/app/src/hooks/useNavigation.ts`

## AppView Union Type

```typescript
type AppView =
  | { type: 'feed' }
  | { type: 'detail'; uri: string }
  | { type: 'thread'; uri: string }
  | { type: 'compose'; replyTo?: string; initialText?: string }
  | { type: 'profile'; actor: string }
  | { type: 'notifications' }
  | { type: 'search'; query?: string }
  | { type: 'aiChat'; session?: string }
  | { type: 'lists' }
  | { type: 'listDetail'; uri: string }
  | { type: 'dmList' }
  | { type: 'dmChat'; convoId: string }
  | { type: 'atplay' }
  | { type: 'atplaySocialCircle' }
  | { type: 'components' }
  | { type: 'about' }
  | { type: 'bookmarks' }
  | { type: 'drafts' }
  | { type: 'settings' };
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
  │               ▲  │
  │               └──Esc──▶ goBack()
  │
  ──l─────────▶ lists ──Enter──▶ listDetail (uri)
  │                ▲                │
  │                └────────────────┘
  │
  ──d─────────▶ dmList ──Enter──▶ dmChat (convoId)
  │               ▲                 │
  │               └─────────────────┘
  │
  ──b─────────▶ bookmarks
  │               │
  │               └──Esc──▶ goBack()
  │
  ──S─────────▶ settings
  │               │
  │               └──Esc──▶ goBack()
  │
  ──?─────────▶ about
                  │
                  └──Esc──▶ goBack()

atplay ──Enter──▶ atplaySocialCircle
  │
  └──Esc──▶ goBack()

drafts ──Esc──▶ goBack()

components ──Esc──▶ goBack()
```

## Keyboard Shortcuts by View

| View | Keys |
|------|------|
| `feed` | ↑↓/jk: 导航, Enter: 详情, m: 更多, r: 刷新 |
| `thread` | ↑↓/jk: 移动, Enter: 聚焦, h: 回到主题帖, R: 回复, l: 赞, r: 转发 |
| `compose` | Enter: 发送 |
| `aiChat` | Tab: 切换聚焦, Esc(1): 去聚焦, Esc(2): 返回 |
| `lists` | ↑↓/jk: 导航, Enter: 详情, c: 创建 |
| `listDetail` | ↑↓/jk: 导航, m: 成员, Esc: 返回 |
| `dmList` | ↑↓/jk: 导航, Enter: 打开对话 |
| `dmChat` | ↑↓/jk: 滚动, Enter: 发送, e: 反应, Esc: 返回列表 |
| `atplay` | Enter: 选择实验 |
| `atplaySocialCircle` | Tab: 切换字段, Enter: 分析, Esc: 返回 |
| `components` | ↑↓: 排序, Space: 启用/禁用 |
| `bookmarks` | ↑↓/jk: 导航, Enter: 详情, d: 删除 |
| `drafts` | ↑↓/jk: 导航, Enter: 编辑, d: 删除, s: 同步 |
| `settings` | Tab: 切换字段, Esc: 返回 |
| `about` | Esc: 返回 |
| `profile` | ↑↓/jk: 导航, f: 关注, m: 私信, Esc: 返回 |
| `notifications` | ↑↓/jk: 导航, Enter: 详情, r: 刷新 |
| `search` | Tab: 切换标签, Enter: 搜索, Esc: 返回 |

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
