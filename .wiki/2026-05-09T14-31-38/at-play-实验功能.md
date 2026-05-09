现在我对所有关键文件有了完整的理解。以下是更新的页面：

# AT Play — 实验功能

> AT Play 是 Bluesky 客户端中的实验性功能实验室。它采用与主应用相同的三层架构：core → app → PWA，TUI 支持规划在未来版本中实现。

## 架构

AT Play 遵循整个项目统一的 **core → app → PWA** 分层架构：

- **`packages/core`**（无 UI 依赖）：为社交圈分析新增两个 API 方法（`getActorLikes`、`getRelationships`）及其响应类型。方法通过 `BskyClient` 类公开，使用 `ky` 实例路由到 AT Protocol 端点。
- **`packages/app`**（纯 React Hooks + 类型）：纯函数 `generateSocialGraphMermaid()`、`buildSocialCircleShareText()` 和 React Hook `useSocialCircle()`。所有类型（`SocialCircleOptions`、`SocialCircleResult`、`InteractorInfo` 等）都通过 `packages/app/src/index.ts` 导出。三个语言文件中共约 35 个 i18n 键（zh/en/ja）。
- **`packages/pwa`**（React DOM + Tailwind）：`AtPlayPage`（实验列表页）和 `AtPlaySocialCircle`（社交圈分析 UI）。注册 `#/atplay` 和 `#/atplay/social-circle` 哈希路由，通过 Sidebar 中的 flask-conical.svg 图标访问。

[来源](packages/core/src/at/client.ts#L750-L776)、[来源](packages/core/src/at/types.ts#L461-L476)、[来源](packages/app/src/index.ts#L37-L39)、[来源](packages/pwa/src/components/Sidebar.tsx#L27)

### 入口点

| 路由 | 页面 | 用途 |
|-------|------|---------|
| `#/atplay` | `AtPlayPage` | 列出所有实验的着陆页 |
| `#/atplay/social-circle` | `AtPlaySocialCircle` | 社交圈分析详情 |

### 导航流程

```
Sidebar (🧪 AT Play)  →  #/atplay (experiment list)  →  #/atplay/social-circle (analysis)
```

着陆页 (`AtPlayPage`) 显示副标题"基于 AT Protocol 的实验性功能"和一个实验卡片列表。每张卡片有图标、名称、描述，点击可导航。当前只有一个实验（社交圈），新实验通过 `EXPERIMENTS` 数组注册。

[来源](packages/pwa/src/components/AtPlayPage.tsx#L13-L21)、[来源](packages/pwa/src/hooks/useHashRouter.ts#L137-L140)

## 数据管线：社交圈分析

### 完整流水线

```
User enters handle
  ↓
resolveHandle → DID
  ↓
getFollows + getFollowers (build mutual set)
  ↓
getAuthorFeed(DID, N=30~100, filter=posts_no_replies)
  ↓
Filter out reposts (reason.$type !== reasonRepost)
  ↓
Filter to posts with likeCount>0 || repostCount>0
  ↓
For each: getLikes + getRepostedBy (limit 100)
  ↓
Resolve reply authors: top 5 by replyCount via getPostThread(depth=1)
  ↓
Aggregate incoming actors → weighted map
  ↓
getActorLikes(DID, 50) → outgoing likes
  ↓
Merge outgoing into map
  ↓
getRelationships(DID, [top 30 DIDs]) → mutual detection
  ↓
Layer classification: core(top 5) / extended(next 10) / potential(mutual+low)
  ↓
generateSocialGraphMermaid() → Mermaid graph code
  ↓
Render: summary cards + layer tables + Mermaid diagram
```

管线有六个阶段，通过 `SocialCircleProgress` 跟踪——旧文档中为五个阶段，现已增加独立的 `outgoing` 阶段：

```typescript
interface SocialCircleProgress {
  phase: 'identity' | 'posts' | 'interactions' | 'outgoing' | 'graph' | 'done';
  current: number;
  total: number;
}
```

[来源](packages/app/src/hooks/useSocialCircle.ts#L46-L50)

### 使用的 API 方法

| 方法 | 端点 | 用途 |
|--------|----------|---------|
| `resolveHandle` | `com.atproto.identity.resolveHandle` | Handle → DID |
| `getProfile` | `app.bsky.actor.getProfile` | 用户显示信息 |
| `getAuthorFeed` | `app.bsky.feed.getAuthorFeed` | 用户近期帖子 |
| `getFollows` | `app.bsky.graph.getFollows` | 用户关注的人 |
| `getFollowers` | `app.bsky.graph.getFollowers` | 关注用户的人 |
| `getLikes` | `app.bsky.feed.getLikes` | 谁赞了每篇帖子 |
| `getRepostedBy` | `app.bsky.feed.getRepostedBy` | 谁转发了每篇帖子 |
| `getRelationships` | `app.bsky.graph.getRelationships` | 批量互关检测 |
| `getActorLikes` | `app.bsky.feed.getActorLikes` | 传出点赞（用户赞了谁） |
| `getPostThread` | `app.bsky.feed.getPostThread` | 解析回复作者（depth=1） |

[来源](packages/core/src/at/client.ts#L166-L176)、[来源](packages/core/src/at/client.ts#L750-L776)

### 权重计算

权重常量导出供未来 AI 工具复用：

```typescript
export const INTERACTION_WEIGHTS = { like: 1.5, repost: 2.0, reply: 3.0 }
```

传入权重 = `likes × 1.5 + reposts × 2.0 + replies × 3.0`。传出权重使用相同的乘数，通过 `outgoingLikeCount`、`outgoingRepostCount`、`outgoingReplyCount` 计算。总分 = 传入 + 传出。

[来源](packages/app/src/hooks/useSocialCircle.ts#L61-L65)、[来源](packages/app/src/hooks/useSocialCircle.ts#L117-L135)

### 三层分类

| 层 | 大小 | 选择条件 | Mermaid 颜色 |
|-------|------|-----------------|---------------|
| **核心圈** | 前 5 | 按 `totalWeight` 排序 | 蓝色 (`#3b82f6`) |
| **扩展圈** | 接下来 10 | 排名 6–15 | 绿色 (`#10b981`) |
| **潜在连接** | 最多 5 | 互关 + 低权重（不在核心/扩展中） | 琥珀色 (`#f59e0b`) |

核心圈成员之间绘制双向边，边粗细基于相对权重。

[来源](packages/app/src/hooks/useSocialCircle.ts#L396-L401)、[来源](packages/app/src/hooks/useSocialCircle.ts#L160-L206)

### hooks/useSocialCircle.ts

#### 纯函数（无 React 依赖）

```typescript
export function generateSocialGraphMermaid(
  userHandle: string,
  core: InteractorInfo[],
  extended: InteractorInfo[],
  potential: InteractorInfo[],
): string
```
返回 `graph TD` Mermaid 代码字符串，包含节点样式和边缘。

```typescript
export function buildSocialCircleShareText(
  result: SocialCircleResult,
  locale: string,
): string
```
返回本地化分享文本（zh/en/ja），包含摘要统计和双向分析描述。

[来源](packages/app/src/hooks/useSocialCircle.ts#L160-L246)

#### 类型

```typescript
interface SocialCircleOptions {
  handle: string;
  maxPosts?: number;  // 默认 50，范围 30-100
}

interface SocialCircleSummary {
  totalInteractions: number;
  uniqueInteractors: number;
  mutualFollows: number;
  coreCircleCount: number;
  extendedCircleCount: number;
  postsAnalyzed: number;
}

interface SocialCircleResult {
  summary: SocialCircleSummary;
  core: InteractorInfo[];
  extended: InteractorInfo[];
  potential: InteractorInfo[];
  mermaidCode: string;
}

interface InteractorInfo {
  did: string; handle: string; displayName?: string; avatar?: string;
  totalWeight: number; incomingWeight: number; outgoingWeight: number;
  likeCount: number; repostCount: number; replyCount: number;
  outgoingLikeCount: number; outgoingRepostCount: number; outgoingReplyCount: number;
  isMutual: boolean;
}
```

`InteractorInfo` 现包含 `outgoingRepostCount` 和 `outgoingReplyCount` 字段（当前始终为 0，为未来传出跟踪预留）。

[来源](packages/app/src/hooks/useSocialCircle.ts#L6-L50)

#### Hook

```typescript
function useSocialCircle(client: BskyClient | null): {
  state: SocialCircleState;   // { status, progress, result, error }
  analyze: (options: SocialCircleOptions) => Promise<void>;
  reset: () => void;
}
```

[来源](packages/app/src/hooks/useSocialCircle.ts#L250-L446)

### PWA UI 组件

#### AtPlaySocialCircle

**布局**：
1. **头部**：返回按钮 + "社交圈"标题
2. **输入表单**：Bluesky Handle 输入框（默认预填当前登录用户），分析按钮
3. **选项面板**：可折叠，含帖子数量范围滑块（30-100）
4. **进度条**：六阶段分析过程中动态显示
5. **结果**：
   - 摘要网格（6 个统计卡片，3×2 布局）
   - 核心圈（前 5 互动者，含权重条 + 互关徽章）
   - 扩展圈（接下来 10）
   - 潜在连接（低互动的互关者）
   - 社交图谱（Mermaid 渲染交互式图表）
   - 数据来源限制说明
   - 分享到 Bluesky 按钮

**关键实现细节**：
- Mermaid 渲染通过 `import('mermaid')` 动态导入（不打包进主包）
- 唯一渲染 ID 通过 `useRef` + 模块级计数器 (`sg-{counter}`)
- 三个独立的 JSX 分支处理错误/加载/渲染状态
- 分享到 Bluesky 使用 `goTo({ type: 'compose', initialText: '...' })`

[来源](packages/pwa/src/components/AtPlaySocialCircle.tsx#L13-L61)、[来源](packages/pwa/src/components/AtPlaySocialCircle.tsx#L125-L356)

### Compose 预填充 API（可复用）

任何页面都可以预填充 compose 文本框：

```typescript
goTo({ type: 'compose', initialText: 'Your pre-filled text here' })
```

工作原理：
1. `AppView` 联合类型中的 `compose` 分支接受 `initialText?: string` 参数——[来源](packages/app/src/state/navigation.ts#L5)
2. `ComposePage` 在挂载时检测 `initialText` 属性并调用 `loadFromDraft()`
3. 仅应用一次（由 `initialTextAppliedRef` 守卫，忽略后续更新）
4. 不影响 `draftId` 加载（若 `draftId` 已设置则跳过）

```typescript
// ComposePage 中的守卫机制
const initialTextAppliedRef = useRef(false);
useEffect(() => {
  if (initialText && !initialTextAppliedRef.current && !draftId) {
    loadFromDraft([{ text: initialText }]);
    initialTextAppliedRef.current = true;
  }
}, [initialText, draftId, loadFromDraft]);
```

[来源](packages/pwa/src/components/ComposePage.tsx#L77-L84)

**未来增强**：在文本旁添加可选的图片/视频预填充。

### 分享到 Bluesky

结果底部的分享按钮生成本地化文本。目前截图内容如下：

```
我在 ai-bsky.pages.dev 分析了我的双向社交圈

📊 分析了 50 篇帖文
👥 发现 12 位互动者，5 位互关
💜 核心圈 5 人

双向分析：别人对我的赞/转发/回复 + 我对别人的赞

ai-bsky.pages.dev
```

点击导航至 `{ type: 'compose', initialText: shareText }`。

[来源](packages/app/src/hooks/useSocialCircle.ts#L212-L246)

### Mermaid 渲染（PWA）

- 库：`mermaid`（动态导入，单独 chunk）
- 配置：`{ startOnLoad: false, theme: 'base', securityLevel: 'loose' }`
- 渲染 ID：每次挂载唯一（`sg-{counter}`），避免重复 ID 错误
- 输出：通过 `dangerouslySetInnerHTML` 的内联 SVG
- 错误回退：在 `<pre>` 块中显示原始 mermaid 代码

[来源](packages/pwa/src/components/AtPlaySocialCircle.tsx#L15-L61)

## 添加新实验的流程

1. **路由解析**：在 `packages/pwa/src/hooks/useHashRouter.ts` 的 `parseHash()` 中添加 case，并在 `encodeView()` 中添加相应编码
2. **AppView 类型**：在 `packages/app/src/state/navigation.ts` 的 `AppView` 联合类型中添加新类型
3. **渲染分发**：在 `packages/pwa/src/App.tsx` 的 `renderView()` switch 中添加 case
4. **创建页面组件**：在 `packages/pwa/src/components/` 中创建页面组件
5. **i18n 键**：在所有三个语言文件（en/ja/zh）中添加翻译键
6. **注册实验**：在 `AtPlayPage.tsx` 的 `EXPERIMENTS` 数组中添加条目
7. **API 方法**：若需要新的 AT Protocol 端点，在 `packages/core/src/at/client.ts` 中添加

[来源](packages/pwa/src/hooks/useHashRouter.ts#L137-L140)、[来源](packages/app/src/state/navigation.ts#L18-L19)、[来源](packages/pwa/src/App.tsx#L349-L352)、[来源](packages/pwa/src/components/AtPlayPage.tsx#L13-L21)

## 当前局限

- **传出跟踪仅限点赞**：当前只通过 `getActorLikes()` 跟踪传出点赞。`InteractorInfo` 中的 `outgoingRepostCount` 和 `outgoingReplyCount` 字段已定义但始终为 0。传出转发和回复的跟踪规划在 v1.x 中实现。
- **50 篇帖子的默认窗口**：可通过滑块调整（30-100）。数值越大耗时越长，但能发现更多互动者。
- **尚无 AI 工具**：纯计算实现。`generateSocialGraphMermaid()` 和 `INTERACTION_WEIGHTS` 已导出供未来 AI 工具使用。
- **仅 PWA**：尚无 TUI 实现。AT Play 是 PWA 独占功能。
- **渲染的 Mermaid 图表未包含在分享中**：目前仅文本分享。SVG 图片分享待实现。

[来源](packages/app/src/hooks/useSocialCircle.ts#L24-L26)、[来源](packages/app/src/hooks/useSocialCircle.ts#L358-L368)

## 未来计划

### v0.8.x — AI 集成
- 使用导出的纯函数添加 `social_circle` AI 工具
- AI 从图表数据生成自然语言洞察
- 将 `/atplay` 上下文注入 AI Chat

### v0.9.x — 热门灵感
- 全局 Bluesky 趋势（`getTrends`）
- 用户历史最佳帖子（按参与度）
- AI 内容策略分析

### v1.x — 增强分析
- 传出转发 + 回复跟踪（目前仅限点赞）
- 交互式图表（可点击节点 → 个人资料）
- 将社交圈导出为图片/PDF
- 分享帖子中嵌入 SVG 图片
- TUI 支持