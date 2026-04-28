# Terminology & Naming Conventions

## Thread / Discussion Terms

| Term (中文) | Term (English) | Definition |
|-------------|----------------|------------|
| **主题帖** | Theme Post | The original post of a discussion thread. Has no reply target (no `reply` field in record). The root of the discussion tree. |
| **回复** | Reply | A post that has a reply target. Has a `reply.parent` field pointing to another post. |
| **当前帖子** | Current Post / Focused Post | The post the user is currently viewing/interacting with. Highlighted in UI. |
| **讨论串** | Discussion Chain | The complete chain from the focused post back to the theme post. Includes the focused post itself. |
| **讨论源** | Discussion Source | The discussion chain EXCLUDING the focused post. Used to show context above the focused post. |

**Avoid these terms** (have problematic connotations):
- ❌ "父帖/母帖" (parent post) — paternalistic/maternalistic
- ❌ "子帖" (child post) — patronizing
- ✅ "主题帖" (theme post) — neutral
- ✅ "回复" (reply) — standard Bluesky terminology
- ✅ "讨论串/讨论源" — descriptive and neutral

## UI Element Names

| Term | Description |
|------|-------------|
| **时间线** | Feed view — shows posts from followed accounts |
| **讨论** | Unified thread view — shows theme post + current post + replies |
| **通知** | Notifications view |
| **资料** | Profile view |
| **搜索** | Search view |
| **发帖** | Compose view |
| **AI 对话** | AI chat view |

## Code Naming

| Concept | Variable/Type Name |
|---------|-------------------|
| Focused post cursor | `focusedIndex` |
| Theme post URI | `themeUri` |
| Current focused post | `focused`, `focusedLine` |
| Post tree flattening | `flatLines: FlatLine[]` |
| Post depth in tree | `FlatLine.depth` (0 = theme, negative = discussion source, positive = reply) |
| Reply indicator | `↳` (arrow pointing to reply target) |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Focus on selected post (makes it the current post) |
| `↑/↓` or `j/k` | Move cursor up/down through posts |
| `h` | Go back to the theme post |
| `R` | Reply to focused post (opens compose) |
| `l` | Like focused post |
| `r` | Repost focused post (with confirmation) |
| `c` | Comment/Reply alternative |
| `Esc` | Go back to previous view |

## File Naming

| File | Purpose |
|------|---------|
| `UnifiedThreadView.tsx` | Combined detail + thread view (replaces old PostDetail and ThreadView) |
| `PostItem.tsx` | Single post card (used in feed and other lists) |
| `PostList.tsx` | Scrollable list of PostItems |
| `Sidebar.tsx` | Navigation sidebar |
| `AIChatView.tsx` | AI chat panel with history |
