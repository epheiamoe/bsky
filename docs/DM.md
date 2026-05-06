# DM 私信 — 架构与教训

> 2026-05-06 · 公开文档（不含任何个人信息）

## 概述

Bluesky DMs 使用 `chat.bsky.convo.*` HTTP 端点，由独立的聊天服务 (`api.bsky.chat`) 提供。与 `app.bsky.*` 端点不同，聊天 API 不完全通过 PDS 代理。

## API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `chat.bsky.convo.listConvos` | GET | 分页列出会话 |
| `chat.bsky.convo.getConvoForMembers` | GET | 按成员 DID 获取或创建 1:1 会话 |
| `chat.bsky.convo.getMessages` | GET | 游标分页获取消息 |
| `chat.bsky.convo.sendMessage` | POST | 发送文字消息 |
| `chat.bsky.convo.sendMessageBatch` | POST | 批量发送 |
| `chat.bsky.convo.addReaction` | POST | 添加 emoji 反应（幂等） |
| `chat.bsky.convo.removeReaction` | POST | 移除 emoji 反应 |
| `chat.bsky.convo.updateRead` | POST | 标记已读 |
| `chat.bsky.convo.getLog` | GET | 轮询事件日志 |
| `chat.bsky.convo.muteConvo` | POST | 静音会话 |

## 鉴权

### 错误路径（已验证不可用）

| 方案 | 端点 | 结果 |
|------|------|------|
| `getServiceAuth` → service JWT | `bsky.social/xrpc/com.atproto.server.getServiceAuth` | **501** — 该 PDS 版本未实现 |
| Session JWT + `xrpc-service-proxy` | `bsky.social/xrpc/chat.bsky.convo.*` | **501** — PDS 不支持聊天代理 |
| Session JWT + `xrpc-service-proxy` | 用户 PDS（`*.host.bsky.network`） | **501** — 同上 |

### 正确路径

```
POST https://api.bsky.chat/xrpc/chat.bsky.convo.sendMessage
Authorization: Bearer {sessionJWT}

GET https://api.bsky.chat/xrpc/chat.bsky.convo.listConvos?limit=30
Authorization: Bearer {sessionJWT}
```

- **主机**：`https://api.bsky.chat/xrpc`
- **鉴权**：Session JWT（`accessJwt`），与 app.bsky.* 共用同一个 token
- **不需要**：`getServiceAuth`、`xrpc-service-proxy` header、PDS 代理

## 数据模型

### 消息结构
```
MessageView {
  id, rev, text, sender: { did },
  sentAt, reactions: ReactionView[],
  embed?: { $type: 'app.bsky.embed.record#view', record: { uri, cid, author, value } }
}
```

### 反应结构
```
ReactionView { value: string (1 emoji grapheme), sender: { did }, createdAt }
```

### 会话结构
```
ConvoView {
  id, rev, members: ProfileViewBasic[],
  lastMessage?, muted, unreadCount,
  status: 'request' | 'accepted',
  kind: 'direct' | 'group'
}
```

### 消息输入
```
MessageInput {
  text (max 1000 graphemes),
  facets?, embed?: { $type: 'app.bsky.embed.record', record: { uri, cid } }
}
```

### 限制
- 反应值：1 个 grapheme（即 1 个 emoji）
- 消息文本：最大 10000 字节 / 1000 graphemes
- 引用 embed：仅支持 `app.bsky.embed.record`

## 代码实现

### 架构（遵循项目层次）

```
@bsky/core → BskyClient: chatKy (https://api.bsky.chat/xrpc)
             + chatGet() / chatPost()
             + listConvos / getConvoForMembers / getMessages
             + sendMessage / addReaction / removeReaction
             + updateRead

@bsky/app  → useConvoList (load/refresh)
             useChatMessages (loadConvo/loadOlder/sendMessage/toggleReaction)
             parsePostUri (AT URI / bsky.app URL → embed)

@bsky/pwa  → ConvoListPage + DMChatPage
@bsky/tui  → DMListView + DMChatView
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `packages/core/src/at/client.ts` | `chatKy` 实例 + 7 个聊天方法 |
| `packages/core/src/at/types.ts` | `ConvoView`, `MessageView`, `ReactionView` 等 |
| `packages/app/src/hooks/useConvoList.ts` | 会话列表状态管理 |
| `packages/app/src/hooks/useChatMessages.ts` | 消息收发 + 反应切换 + URI 解析 |
| `packages/pwa/src/components/ConvoListPage.tsx` | PWA 会话列表 |
| `packages/pwa/src/components/DMChatPage.tsx` | PWA 对话视图（气泡 + 反应 + 引用） |

## 关键教训

### 1. Chat API 直连，不经过 PDS 代理
**现象**：`bsky.social/xrpc/chat.bsky.convo.*` 返回 501（Not Implemented）。
**根因**：聊天服务由 `api.bsky.chat` 独立托管。Session JWT 被聊天服务直接信任（JWT `aud` 指向 PDS，但跨服务信任成立）。
**修复**：`BskyClient.chatKy` 指向 `https://api.bsky.chat/xrpc`，用 `this.getAuthHeaders()` 鉴权。

### 2. `getServiceAuth` 不可用
**现象**：`com.atproto.server.getServiceAuth` 返回 501。
**根因**：该端点较新，部分 PDS 版本尚未实现。即使实现，返回的 service JWT 也仅用于安全上下文分离，实际 `api.bsky.chat` 同时接受 session JWT。
**措施**：直接使用 session JWT，绕开 service auth。

### 3. 反应按钮必须始终可见
**现象**：零反应的消息无法添加反应。
**根因**：`msgReactions.length > 0` 条件包裹了整个反应栏（含 emoji 选择器入口）。
**修复**：反应 badge 仍按数量条件渲染，但添加按钮独立渲染，始终可见。

### 4. 引用帖通过 URI 粘贴
**实现**：`parsePostUri()` 检测 `at://` 或 `bsky.app/profile/*/post/*` URL → 调用 `client.getRecord()` 获取 cid → 构建 `app.bsky.embed.record` embed。
**注意**：需处理 `did:plc:*` vs `handle` 格式的 URI。

### 5. 测试规范
- 使用备用测试账号发送测试消息，不要影响真实联系人
- 测试完成后清理残留反应和消息
- 见 `AGENTS.local.md` 获取具体测试命令

## 已知限制

| 限制 | 状态 |
|------|------|
| `getServiceAuth` 不可用（PDS 501） | 已绕开，用 session JWT |
| 无事件轮询（`getLog`） | 未实现，手动刷新 |
| Group conversation | API 标注 unstable，未实现 |
| 消息删除 | 未实现 |
| WebSocket 实时推送 | 不适用（HTTP API） |
