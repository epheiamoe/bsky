# 私信（DM）与聊天

私信系统是 Bluesky 社交图谱之外的另一层通信渠道，通过独立的 `chat.bsky` 命名空间 API 运行。与帖子（Feed）走 `bsky.social` 不同，所有 DM 流量路由至 `https://api.bsky.chat`。这种架构隔离意味着会话管理、消息投递和反应系统都拥有自己的一套协议和状态机。

## 对话列表：useConvoList

`useConvoList` 是一个轻量 Hook，负责获取当前用户参与的所有对话。它的核心逻辑围绕**光标分页**展开：

```
用户调用 load(false) → client.listConvos(30, cursor) → 追加到 convos[]
用户调用 load(true)      → client.listConvos(30)          → 替换 convos[]
用户调用 refresh()       → 同上（reset）
```

每一次 `load` 或 `refresh` 都会重置 `loading` 和 `error`，符合「要么全部成功，要么报错」的原子语义。`cursor` 由服务端返回，驱动无限滚动加载。如果 `reset === true` 则忽略已有 cursor，从第一页重新开始。

[来源](packages/app/src/hooks/useConvoList.ts#L10-L38)

`ConvoView` 的类型结构包含对话元数据：

| 字段 | 类型 | 含义 |
|------|------|------|
| `id` | `string` | 对话唯一标识 |
| `rev` | `string` | 服务端修订号（用于冲突检测） |
| `members` | `ProfileViewBasic[]` | 参与成员 |
| `lastMessage` | `MessageView \| DeletedMessageView \| SystemMessageView` | 最近一条消息（用于列表预览） |
| `lastReaction` | `{ message; reaction }` | 最近一条反应 |
| `muted` | `boolean` | 是否静音 |
| `status` | `'request' \| 'accepted'` | 对话状态（请求中 / 已接受） |
| `unreadCount` | `number` | 未读消息数 |
| `kind` | `'direct' \| 'group'` | 对话类型 |

[来源](packages/core/src/at/types.ts#L384-L394)

PWA 中的 `ConvoListPage` 组件将 `convo.members` 中非自己的成员头像、名称和最近消息渲染为列表项，并显示 `unreadCount` 徽章。静音的对话会带有一个铃铛图标标记。

[来源](packages/pwa/src/components/ConvoListPage.tsx#L129-L140)

## 聊天空：useChatMessages

`useChatMessages` 是 DM 功能的中枢 Hook，集成了对话加载、消息获取、发送、反应、删除、静音和已读标记。它的数据流分为两个阶段：

**阶段一：获取对话 + 消息**
```
loadConvo(conversationId, reset)
  → client.getConvoForMembers([conversationId])  → 得到 convo
  → client.getMessages(convo.id, 30)              → 得到 messages（逆序）
  → markRead()                                     → 标记已读
```

`getConvoForMembers` 实际上接收的是成员 DID 列表而非对话 ID，但 `loadConvo` 传入的 `conversationId` 被包装为单元素数组——这意味着它把对话 ID 当作成员 DID 处理。这是设计使然：首次进入对话时用成员 DID 查找或创建对话，之后用返回的 `convo.id` 加载消息。

[来源](packages/app/src/hooks/useChatMessages.ts#L17-L31)

**阶段二：分页加载旧消息**
```
loadOlder()
  → client.getMessages(convo.id, 30, cursor)
  → 将新消息插入到 messages 数组头部
```

`DMChatPage` 利用 `scrollTop < 60` 触发 `loadOlder`，实现上滚加载的无限滚动体验。加载过程中用 `loadingOlderRef` 防止重复请求。

[来源](packages/pwa/src/components/DMChatPage.tsx#L44-L52)

## chat.bsky API 调用

所有 DM API 均通过 `BskyClient` 的 `chatGet` 和 `chatPost` 私有方法路由，这两个方法分别对应 `ChatKy.get()` 和 `ChatKy.post()`，前缀 URL 为 `https://api.bsky.chat/xrpc`。全部要求 Bearer JWT 认证。

| 方法 | 端点 | HTTP | 参数 | 返回 |
|------|------|------|------|------|
| `listConvos` | `chat.bsky.convo.listConvos` | GET | `limit, cursor` | `ConvoListResponse` |
| `getConvoForMembers` | `chat.bsky.convo.getConvoForMembers` | GET | `members`（逗号分隔 DID） | `GetConvoResponse` |
| `getMessages` | `chat.bsky.convo.getMessages` | GET | `convoId, limit, cursor` | `GetMessagesResponse` |
| `sendMessage` | `chat.bsky.convo.sendMessage` | POST | `convoId, message` | `MessageView` |
| `addReaction` | `chat.bsky.convo.addReaction` | POST | `convoId, messageId, value` | `MessageView` |
| `removeReaction` | `chat.bsky.convo.removeReaction` | POST | `convoId, messageId, value` | `MessageView` |
| `updateRead` | `chat.bsky.convo.updateRead` | POST | `convoId, messageId?` | `{ convo: ConvoView }` |
| `deleteMessageForSelf` | `chat.bsky.convo.deleteMessageForSelf` | POST | `convoId, messageId` | `void` |
| `muteConvo` | `chat.bsky.convo.muteConvo` | POST | `convoId` | `{ convo: ConvoView }` |
| `unmuteConvo` | `chat.bsky.convo.unmuteConvo` | POST | `convoId` | `{ convo: ConvoView }` |

[来源](packages/core/src/at/client.ts#L668-L728)

值得注意的是 `chatKy` 实例复用了 `withRefresh` hook，也就是说 DM 调用也会触发 JWT 自动刷新——这与 BskyClient 其他端点共享同一套会话管理逻辑。详见 [认证与会话管理](认证与会话管理.md)。

[来源](packages/core/src/at/client.ts#L119-L124)

## MessageView 结构解析

`MessageView` 是私信消息的核心数据类型，与帖子（Post）的 `FeedViewPost` 有显著区别，但共享一些相似的构造理念：

```typescript
interface MessageView {
  id: string;          // 消息唯一标识
  rev: string;         // 修订号
  text: string;        // 消息文本内容
  facets?: Array<{     // 富文本标注（提及、链接、标签）
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; [k: string]: unknown }>;
  }>;
  embed?: {            // 嵌入内容（通常为引用帖子）
    $type: string;
    record: {
      uri: string;
      cid: string;
      author?: ProfileViewBasic;
      value?: { text: string };  // 被引用帖子的文本预览
    };
  };
  reactions: ReactionView[];  // 反应列表
  sender: { did: string };    // 发送者 DID
  sentAt: string;             // ISO 时间戳
}
```

[来源](packages/core/src/at/types.ts#L405-L417)

**text** 是纯文本内容，没有帖子那样的内联图片布局。**facets** 的格式与帖子中的完全相同——`byteStart`/`byteEnd` 基于 UTF-8 字节偏移，`features` 数组包含 `app.bsky.richtext.facet#mention`、`#link` 或 `#tag` 类型。

**embed** 目前只观察到 `app.bsky.embed.record` 一种类型（引用帖子）。`DMChatPage` 渲染 embed 时提取 `record.value.text` 显示在被引用消息的左侧，用一条竖线分隔。

[来源](packages/pwa/src/components/DMChatPage.tsx#L199-L203)

**reactions** 的格式为一个 `ReactionView` 数组，每个反应包含 `value`（表情符号字符串）、`sender.did` 和 `createdAt`。UI 中将同值反应归组渲染，自己的反应高亮显示。

```typescript
interface ReactionView {
  value: string;        // 表情符号文本（如 👍）
  sender: { did: string };
  createdAt: string;    // ISO 时间戳
}
```

[来源](packages/core/src/at/types.ts#L433-L437)

除 `MessageView` 外，还有两种变体：

- **DeletedMessageView**：只有 `id`, `rev`, `sender`, `sentAt`，无 `text`。用于已删除消息的占位标记。
- **SystemMessageView**：有 `id`, `rev`, `sentAt` 和 `data`（任意 JSON 对象），没有 `sender`。用于系统通知（如加入/离开对话）。

[来源](packages/core/src/at/types.ts#L419-L431)

`useChatMessages` 导出的联合类型 `AnyChatMessage` 将这三种类型合并，UI 通过 `isDeleted` 和 `'text' in msg` 做类型守卫区分。

## toggleReaction 的幂等设计

`toggleReaction` 是反应功能的核心，采用**显式幂等**设计：

```typescript
const toggleReaction = async (messageId, value, isPresent) => {
  let updated;
  if (isPresent) {
    updated = await client.removeReaction(convo.id, messageId, value);
  } else {
    updated = await client.addReaction(convo.id, messageId, value);
  }
  setMessages(prev => prev.map(m =>
    'reactions' in m && m.id === messageId ? updated : m
  ));
};
```

[来源](packages/app/src/hooks/useChatMessages.ts#L63-L78)

设计要点：

1. **调用方传递当前状态**：`isPresent` 由 UI 层通过检查 `msgReactions.some(r => r.sender.did === did && r.value === value)` 计算得出。Hook 不自行计算，保持职责分离。
2. **服务端原子操作**：`addReaction` 和 `removeReaction` 分属不同端点，不存在 200 但语义不对的模糊状态。
3. **乐观更新**：将 API 返回的完整 `MessageView` 插入到本地状态中，替换旧消息。这保证了反应的完整性和一致性——返回的 message 包含更新后的完整 reactions 列表。
4. **静默吞错**：catch 块为空，避免了因网络波动导致的界面抖动。

在 `DMChatPage` 中，点击已存在的反应会再次调用 `toggleReaction` 并传入 `hasMy === true`，触发移除；点击未添加的反应传入 `false`，触发添加。

[来源](packages/pwa/src/components/DMChatPage.tsx#L226-L240)

## mute/unmute 对话控制

对话的静音和取消静音通过两个对称的 API 端点实现，在 Hook 层面同样保持对称设计：

```typescript
const muteConvoFn = async () => {
  const res = await client.muteConvo(convo.id);
  setConvo(res.convo);    // 用服务端返回的最新 ConvoView 替换
};

const unmuteConvoFn = async () => {
  const res = await client.unmuteConvo(convo.id);
  setConvo(res.convo);
};
```

[来源](packages/app/src/hooks/useChatMessages.ts#L110-L124)

服务端返回整个 `ConvoView`（含更新后的 `muted` 字段），因此本地状态通过 `setConvo(res.convo)` 整体替换，无需手动更新布尔值。静音状态的变化也会反映在 `ConvoListPage` 的图标标记上。

`DMChatPage` 在 Header 区域用一个铃铛图标按钮控制静音：`filled={!convo.muted}`，点击时自动在 `muteConvo` 和 `unmuteConvo` 之间切换。

[来源](packages/pwa/src/components/DMChatPage.tsx#L150-L158)

## 删除消息：deleteMessage

`deleteMessage` 调用 `client.deleteMessageForSelf` 端点，这是 Bluesky 协议中的「为自己删除」操作——服务端仅移除自己的可见权限，对方仍能看到消息。

```typescript
const deleteMessage = async (messageId: string) => {
  await client.deleteMessageForSelf(convo.id, messageId);
  setMessages(prev => prev.filter(m => m.id !== messageId));
};
```

[来源](packages/app/src/hooks/useChatMessages.ts#L95-L103)

UI 层通过 `confirm(t('dm.confirmDelete'))` 获得用户确认后才执行，并用 `deleting` 状态禁用重复点击。删除后，消息从列表中直接移除（filter 掉），不保留 `DeletedMessageView` 占位。

## parsePostUri：三种 URI 格式检测

`parsePostUri` 是一个纯文本解析函数，用于在聊天输入框中检测用户粘贴的 Bluesky 帖子链接，将其转换为可嵌入的引用记录。它支持三种格式：

```
格式一：at://did:plc:xxx/app.bsky.feed.post/rkey
        → 正则 /at:\/\/(did:plc:[^\/]+)\/app\.bsky\.feed\.post\/([^\s]+)/
        → 返回 { uri, did, rkey }

格式二：at://handle.bsky.social/app.bsky.feed.post/rkey
        → 正则 /at:\/\/([^\/]+)\/app\.bsky\.feed\.post\/([^\s]+)/
        → 返回 { uri, handle, rkey }

格式三：https://bsky.app/profile/handle/post/rkey
        → 正则 /https?:\/\/bsky\.app\/profile\/([^\/]+)\/post\/([^\s?&]+)/
        → 返回 { uri: at://handle/app.bsky.feed.post/rkey, handle, rkey }
```

[来源](packages/app/src/hooks/useChatMessages.ts#L134-L153)

三个正则按顺序匹配，返回第一个成功的结果。匹配逻辑的优先级是：DID 路径 > handle 路径 > web 路径。这保证 `at://did:plc:...` 这种最精确的格式不会被后面的 handle 格式误匹配。

在 `DMChatPage` 中，`handleInputChange` 监听输入框变化，每次输入都调用 `parsePostUri` 检测。如果匹配到 URI，则触发 `resolveQuoteRecord`——通过 `client.resolveHandle`（如果是 handle 格式）和 `client.getRecord` 获取帖子的完整信息（cid、文本），最后在输入框上方显示引用预览。

[来源](packages/pwa/src/components/DMChatPage.tsx#L94-L104)

发送消息时，如果 `quotePreview` 存在，将 `{ $type: 'app.bsky.embed.record', record: { uri, cid } }` 作为 `embed` 参数传递给 `sendMessage`。

## 导航集成

DM 功能在导航状态机中有两个视图入口：[导航与状态管理](导航与状态管理.md)

- `{ type: 'dm' }`：对话列表页，渲染 `ConvoListPage`
- `{ type: 'dmChat'; conversationId: string }`：具体对话页，渲染 `DMChatPage`

从用户资料页进入 DM 的路径是：点击资料页上的私信按钮 → `client.getConvoForMembers([profile.did])` → 得到 `convo.id` → `goTo({ type: 'dmChat', conversationId: convo.id })`。

[来源](packages/pwa/src/components/ProfilePage.tsx#L274-L275)

## 推荐阅读

- [BskyClient：AT Protocol 客户端实现](bskyclient-at-protocol-客户端实现.md) — 了解 chatKy 与主 Ky 实例的路由差异和 JWT 刷新机制
- [认证与会话管理](认证与会话管理.md) — DM API 依赖的认证体系
- [React Hooks 架构与 Store 模式](react-hooks-架构与-store-模式.md) — Hook 设计模式的深层原理
- [导航与状态管理](导航与状态管理.md) — `AppView` 联合类型和两个 DM 视图的路由编排