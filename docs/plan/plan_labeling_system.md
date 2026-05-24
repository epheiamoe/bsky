# Plan: Bluesky Labeling / Moderation System (v0.15.0)

> **Status**: Ready for implementation
> **Scope**: Full labeling consumption + self-labeling + reporting, PWA + TUI
> **Estimated Duration**: 14-19 days

## 用户明确要求汇总

### 设置架构
1. **独立「审核和标记」设置页面** — 顶部导航栏新增入口
2. **通用设置区**：「成人内容」「性暗示」「非色情裸露」「敏感/写实媒体」
   - 这些默认关联 `@moderation.bsky.app`
   - 但配置是**全局行为偏好**（hide/warn/ignore），不是绑定到特定提供商
3. **提供商标签页**：每个第三方标签提供商独立配置页
   - 各提供商配置**完全独立**，互不影响
   - 示例：官方关闭「成人内容」→ 不显示；但第三方开启 → 仍显示
4. **@moderation.bsky.app 全标签支持**：不硬编码标签列表，实时查询 `app.bsky.labeler.service/self`

### 帖子交互
5. **Info 按钮**：每个「隐藏/警告/徽章」UI 元素旁提供 `[!]` info 按钮
   - 点击后显示：标签值、标签提供商名称/DID、标签描述
6. **举报按钮**：仅显示在**帖子详情页**（ThreadView）
   - PWA：UI 按钮
   - TUI：快捷键触发

### 欢迎页面
7. **新增最后一步**：「审核和标记偏好」设置页面

### AI / MCP
8. **暂不实现**：AI 工具和 MCP 不需要标签功能
9. **TODO 记录**：计划提供 `check_post_labels` 工具（查询帖子是否存在来自特定提供商的标签）

## 设置数据模型

```typescript
// --- 全局行为偏好（对应官方 moderationPrefs.contentLabels）---
interface ContentLabelPreference {
  label: string;           // 标签值，如 'porn', 'sexual', 'nudity', 'graphic-media'
  visibility: 'hide' | 'warn' | 'ignore';
}

// --- 标签提供商配置 ---
interface LabelerConfig {
  did: string;             // 标签提供商 DID
  name: string;            // 从服务记录拉取
  description?: string;
  avatar?: string;
  labels: LabelValueDefinition[];  // 从服务记录拉取
  // 每个标签的独立配置（覆盖全局行为偏好）
  labelPrefs: Record<string, 'hide' | 'warn' | 'ignore'>;
  isActive: boolean;       // 是否启用此提供商
}

// --- 完整审核配置 ---
interface ModerationConfig {
  // 全局行为偏好（官方标准标签）
  contentLabels: ContentLabelPreference[];
  adultContentEnabled: boolean;
  
  // 标签提供商列表
  labelers: LabelerConfig[];
  
  // 默认启用的官方标签提供商
  defaultLabelerDid: 'did:plc:ar7c4by46qjdydhdevvrndac';
}
```

### 配置合并逻辑（核心规则）

```typescript
function resolveModeration(
  labels: Label[],           // 帖子上的所有标签
  config: ModerationConfig   // 用户配置
): ModerationDecision {
  // 1. 按提供商分组标签
  // 2. 对每个标签，查找对应提供商的配置
  //    - 如果该提供商的 labelPrefs 中有此标签 → 使用提供商配置
  //    - 否则 → 使用全局 contentLabels 配置（如果是标准标签）
  //    - 否则 → 使用标签定义中的 defaultSetting
  // 3. 取所有标签中最严格的动作（hide > warn > blurMedia > showBadge > none）
}
```

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer                                               │
│  PWA: SettingsPage ├─ "审核和标记" Tab                  │
│       ├─ 通用设置（成人/性暗示/裸露/写实媒体）          │
│       ├─ @moderation.bsky.app 标签列表（动态）          │
│       └─ 第三方提供商标签页                             │
│  PWA: ThreadView ├─ 举报按钮                            │
│  PWA: PostCard ├─ ModerationOverlay + [i] info btn      │
│  PWA: WelcomeWizard ├─ Step N: 审核偏好                 │
│  TUI: Settings (,) ├─ "Moderation" Tab                  │
│  TUI: ThreadView ├─ Report shortcut                     │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  @bsky/app                                              │
│  ├─ useModerationConfig() → localStorage read/write     │
│  ├─ useLabelerConfig(did) → fetch + cache service rec   │
│  ├─ useModeration(subject) → query labels + decide      │
│  ├─ useReport() → createModerationReport                │
│  └─ TimelineStore ├─ batch label query on load          │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  @bsky/core                                             │
│  ├─ BskyClient                                          │
│  │  ├─ queryLabels(uriPatterns, sources?, limit?)       │
│  │  ├─ getLabelerServices(dids[])                       │
│  │  ├─ getPreferences() / putPreferences()              │
│  │  ├─ createModerationReport(params)                   │
│  │  └─ createPost() ├─ with labels[] support            │
│  ├─ types.ts ├─ Label, LabelValueDefinition, etc.       │
│  ├─ moderation.ts (NEW)                                 │
│  │  ├─ ModerationDecision class                         │
│  │  ├─ resolveModeration(labels, config) → Decision     │
│  │  ├─ LabelCache (batch + TTL)                         │
│  │  └─ DEFAULT_MODERATION_CONFIG                        │
│  └─ prompts.ts (TODO comment)                           │
└─────────────────────────────────────────────────────────┘
```

## Phase 1: Core 基础设施 (Day 1-3)

### 1.1 扩展类型定义 (`packages/core/src/at/types.ts`)

```typescript
// ── Labeling (com.atproto.label / app.bsky.labeler) types ──

export interface Label {
  ver?: number;
  src: string;           // DID of the labeler
  uri: string;           // AT URI of the labeled subject
  cid?: string;
  val: string;           // Label value (e.g., 'porn', 'spam')
  neg?: boolean;         // Negation flag (retracts previous label)
  cts: string;           // Created timestamp
  exp?: string;          // Expiration timestamp
  sig?: unknown;         // Signature
}

export interface LabelValueDefinition {
  identifier: string;    // Label value string
  severity: 'inform' | 'alert' | 'none';
  blurs: 'content' | 'media' | 'none';
  defaultSetting: 'ignore' | 'warn' | 'hide';
  adultOnly: boolean;
  locales: Array<{
    lang: string;
    name: string;
    description: string;
  }>;
}

export interface LabelerPolicies {
  labelValues: string[];
  labelValueDefinitions: LabelValueDefinition[];
}

export interface LabelerServiceRecord {
  $type: 'app.bsky.labeler.service';
  policies: LabelerPolicies;
  subjectTypes?: string[];
  subjectCollections?: string[];
  createdAt: string;
}

export interface LabelerView {
  uri: string;
  cid: string;
  creator: ProfileViewBasic;
  likeCount?: number;
  viewer?: { like?: string };
  indexedAt: string;
  // Additional fields from service record
  policies?: LabelerPolicies;
}

// Extend existing types
export interface PostView {
  // ...existing fields...
  labels?: Label[];
}

export interface ProfileViewBasic {
  // ...existing fields...
  labels?: Label[];
}

// Moderation preferences (from app.bsky.actor.defs)
export interface ContentLabelPref {
  label: string;
  visibility: 'hide' | 'warn' | 'ignore';
}

export interface ModerationPrefs {
  adultContentEnabled: boolean;
  labels: ContentLabelPref[];
  labelers: Array<{
    did: string;
    labels: ContentLabelPref[];
  }>;
}
```

### 1.2 BskyClient API 扩展 (`packages/core/src/at/client.ts`)

```typescript
// Add new methods to BskyClient:

/**
 * Query labels matching URI patterns.
 * Supports batch queries with wildcard suffix.
 */
async queryLabels(params: {
  uriPatterns: string[];
  sources?: string[];
  limit?: number;
  cursor?: string;
}): Promise<{ labels: Label[]; cursor?: string }>;

/**
 * Get labeler service information.
 */
async getLabelerServices(dids: string[]): Promise<LabelerView[]>;

/**
 * Get user's moderation preferences (from app.bsky.actor.getPreferences).
 */
async getPreferences(): Promise<{ preferences: unknown[] }>;

/**
 * Update user's moderation preferences.
 */
async putPreferences(preferences: unknown[]): Promise<void>;

/**
 * Create a moderation report.
 */
async createModerationReport(params: {
  reasonType: string;
  reason?: string;
  subject: { did?: string; uri?: string; cid?: string };
  reportedBy?: string;
}): Promise<{ id: number; report: unknown }>;
```

### 1.3 审核决策引擎 (`packages/core/src/moderation.ts` NEW FILE)

```typescript
export type ModerationAction = 'hide' | 'warn' | 'blurMedia' | 'showBadge' | 'none';

export interface ModerationDecision {
  action: ModerationAction;
  /** Labels that contributed to this decision, grouped by labeler */
  sources: Array<{
    labelerDid: string;
    labelerName?: string;
    labels: Array<{
      val: string;
      name: string;
      description: string;
      severity: string;
      blurs: string;
    }>;
  }>;
  /** Human-readable warning text (localized) */
  warningText?: string;
  /** Badges to display */
  badges: string[];
}

export interface ModerationConfig {
  adultContentEnabled: boolean;
  contentLabels: ContentLabelPref[];
  labelers: LabelerConfig[];
}

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  adultContentEnabled: false,
  contentLabels: [
    { label: 'porn', visibility: 'warn' },
    { label: 'sexual', visibility: 'warn' },
    { label: 'nudity', visibility: 'warn' },
    { label: 'graphic-media', visibility: 'warn' },
  ],
  labelers: [],
};

/**
 * Resolve moderation decision for a subject based on its labels and user config.
 * 
 * Logic:
 * 1. Group labels by labeler DID
 * 2. For each label, resolve visibility preference:
 *    a. Check labeler's labelPrefs[label.val]
 *    b. Fall back to global contentLabels[label.val]
 *    c. Fall back to label definition's defaultSetting
 * 3. Determine action from visibility + label definition
 *    - hide → 'hide'
 *    - warn + blurs=content → 'warn'
 *    - warn + blurs=media → 'blurMedia'
 *    - warn + blurs=none + severity≠none → 'showBadge'
 *    - ignore → 'none'
 * 4. Combine: most restrictive action wins
 * 5. Collect all contributing labels into sources
 */
export function resolveModeration(
  labels: Label[],
  config: ModerationConfig,
  labelDefinitions: Map<string, LabelValueDefinition[]>
): ModerationDecision;
```

### 1.4 标签缓存 (`packages/core/src/moderation-cache.ts` NEW FILE)

```typescript
export class LabelCache {
  private cache = new Map<string, { labels: Label[]; expiry: number }>();
  private pending = new Map<string, Promise<Label[]>>();
  private ttlMs = 5 * 60 * 1000; // 5 minutes
  
  /** Query labels for multiple URIs, batching into single API call */
  async queryLabelsBatch(
    client: BskyClient,
    uris: string[],
    labelerDids: string[]
  ): Promise<Map<string, Label[]>>;
  
  /** Clear expired entries */
  prune(): void;
}
```

## Phase 2: App 层 (Day 4-6)

### 2.1 配置管理 (`packages/app/src/hooks/useModerationConfig.ts` NEW)

```typescript
export function useModerationConfig() {
  const [config, setConfig] = useState<ModerationConfig>(DEFAULT_MODERATION_CONFIG);
  
  // Load from localStorage (PWA) / JSON file (TUI)
  // Save on change
  // Provide update functions for specific sections
  
  return {
    config,
    setContentLabelVisibility: (label: string, visibility: 'hide' | 'warn' | 'ignore') => void;
    addLabeler: (did: string) => Promise<void>;
    removeLabeler: (did: string) => void;
    updateLabelerPref: (did: string, label: string, visibility: 'hide' | 'warn' | 'ignore') => void;
    setAdultContentEnabled: (enabled: boolean) => void;
  };
}
```

### 2.2 标签提供商信息 (`packages/app/src/hooks/useLabelerInfo.ts` NEW)

```typescript
export function useLabelerInfo(did: string) {
  const [info, setInfo] = useState<LabelerView | null>(null);
  const [policies, setPolicies] = useState<LabelerPolicies | null>(null);
  
  useEffect(() => {
    // Fetch app.bsky.labeler.getServices
    // Fetch app.bsky.labeler.service/self record via getRecord
  }, [did]);
  
  return { info, policies, isLoading };
}
```

### 2.3 帖子审核 Hook (`packages/app/src/hooks/useModeration.ts` NEW)

```typescript
export function useModeration(subject: { uri: string; labels?: Label[] }) {
  const { config } = useModerationConfig();
  const [decision, setDecision] = useState<ModerationDecision | null>(null);
  const labelCache = useRef(new LabelCache()).current;
  
  useEffect(() => {
    // If labels already present (from AppView), use them
    // Otherwise, query via LabelCache
    // Resolve decision
  }, [subject, config]);
  
  return decision;
}
```

### 2.4 Timeline Store 集成

在 `packages/app/src/stores/timeline.ts` 中：
- 加载时间线后，批量查询帖子标签
- 应用审核过滤（hide 的帖子从列表移除或标记）

## Phase 3: PWA UI (Day 7-11)

### 3.1 设置页面路由和入口

```typescript
// Add to navigation or settings
{ type: 'settings', tab: 'moderation' }
```

### 3.2 SettingsPage 新增「审核和标记」Tab

组件结构：
```tsx
<ModerationSettingsPage>
  <GeneralSettingsSection>
    <AdultContentToggle />
    <ContentLabelTable 
      labels={['porn', 'sexual', 'nudity', 'graphic-media']}
      config={config.contentLabels}
      onChange={setContentLabelVisibility}
    />
  </GeneralSettingsSection>
  
  <OfficialLabelerSection>
    <LabelerCard 
      did="did:plc:ar7c4by46qjdydhdevvrndac"
      isDefault={true}
    />
    <DynamicLabelList 
      policies={officialPolicies}
      prefs={config.labelers.find(l => l.did === OFFICIAL_DID)?.labelPrefs}
    />
  </OfficialLabelerSection>
  
  <ThirdPartyLabelersSection>
    <AddLabelerInput onAdd={addLabeler} />
    {config.labelers.filter(l => l.did !== OFFICIAL_DID).map(labeler => (
      <LabelerConfigTab key={labeler.did} labeler={labeler} />
    ))}
  </ThirdPartyLabelersSection>
</ModerationSettingsPage>
```

### 3.3 PostCard 审核集成

```tsx
function PostCard({ post, ... }) {
  const decision = useModeration({ uri: post.uri, labels: post.labels });
  
  if (decision?.action === 'hide') {
    return <HiddenPostCard post={post} decision={decision} />;
  }
  
  return (
    <PostCardContainer>
      {decision?.badges.length > 0 && <BadgeRow badges={decision.badges} sources={decision.sources} />}
      {decision?.action === 'warn' && <WarningOverlay text={decision.warningText} sources={decision.sources} />}
      <PostContent blurred={decision?.action === 'blurMedia'} />
    </PostCardContainer>
  );
}

// Info button component
function ModerationInfoButton({ sources }: { sources: ModerationDecision['sources'] }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  return (
    <button 
      onClick={() => setShowTooltip(!showTooltip)}
      aria-label="查看标签来源信息"
    >
      <Icon name="info" size={14} />
      {showTooltip && <LabelSourceTooltip sources={sources} />}
    </button>
  );
}
```

### 3.4 ThreadView 举报按钮

```tsx
// In ThreadView component
{post && (
  <PostActionsRow post={post} client={client} goTo={goTo}>
    <ReportButton 
      post={post} 
      client={client}
      onReport={(reasonType, reason) => createModerationReport({...})}
    />
  </PostActionsRow>
)}
```

### 3.5 欢迎页面新增步骤

在 `WelcomeWizard` 最后一步（或倒数第二步）添加：
```tsx
<WelcomeStep title="审核和标记偏好">
  <p>选择你希望如何处理标记内容。</p>
  <ModerationQuickConfig 
    config={config}
    onChange={setConfig}
  />
</WelcomeStep>
```

## Phase 4: TUI UI (Day 12-14)

### 4.1 设置界面

在快速设置 (`,`) 中新增 "Moderation" Tab：
- 成人内容开关：`[x] Enable adult content`
- 标准标签配置表：4 行 × 3 列（hide/warn/ignore）
- 标签提供商列表：DID + 名称
- 添加提供商：输入 DID 确认

### 4.2 帖子渲染

```
[HIDDEN] Content hidden by labeler: @moderation.bsky.app [i]
Press Enter to show anyway

or

[WARN: Adult Content] [i: from @mod.bsky.app]
This post may contain adult content.
Press Enter to show

or

[Badge: Bot] [i: from @mod.bsky.app]
Post content here...
```

### 4.3 举报快捷键

在 ThreadView 中：
- `R` 键（Report）— 打开举报对话框
- 选择标签提供商 → 选择原因类型 → 输入可选描述 → 确认

## Phase 5: 自标记 + 举报完善 (Day 15-16)

### 5.1 发帖时自标记

在 ComposePage / TUI 发帖界面添加：
```tsx
<SelfLabelSelector 
  selected={selectedLabels}
  onChange={setSelectedLabels}
  options={['porn', 'sexual', 'nudity', 'graphic-media', '!no-unauthenticated']}
/>
```

### 5.2 举报对话框完整实现

PWA：
```tsx
<ReportDialog 
  subject={post}
  onSubmit={async (providerDid, reasonType, reason) => {
    await client.createModerationReport({
      reasonType,
      reason,
      subject: { uri: post.uri, cid: post.cid },
    });
  }}
/>
```

TUI：
- 快捷键触发 wizard
- Ink 组件：选择提供商 → 选择原因 → 输入描述 → 确认

## Phase 6: 文档与收尾 (Day 17-19)

### 6.1 测试
- [ ] `resolveModeration` 单元测试：边界情况（多个标签、多个提供商、配置冲突）
- [ ] `LabelCache` 测试：批量查询、TTL 过期、去重
- [ ] PWA 设置页 E2E 测试
- [ ] TUI 设置页交互测试

### 6.2 文档
- [ ] `docs/LABELING.md` — 完整架构文档
- [ ] `docs/TODO.md` — 更新功能状态
- [ ] `CHANGELOG.md` — v0.15.0 条目

### 6.3 AI Tools TODO
在 `packages/core/src/ai/tools.ts` 和 `docs/TODO.md` 中添加：
```
- [ ] `check_post_labels` AI tool: Query labels on a post from specific labelers
```

## 关键实现细节

### 官方标签提供商 DID
`did:plc:ar7c4by46qjdydhdevvrndac` — @moderation.bsky.app

### HTTP 头策略
虽然采用直接查询，但**仍然**在 `publicKy` 请求中附加：
```
atproto-accept-labelers: did:plc:ar7c4by46qjdydhdevvrndac;redact
```
这样 AppView 会在响应中自动水合 labels，减少额外 API 调用。

### 批量查询优化
时间线加载时：
1. 如果 AppView 已返回 labels → 直接使用
2. 否则收集前 50 个帖子的 URI → 一次 `queryLabels` 调用
3. 滚动加载时重复步骤 2

### i18n 要求
所有新增 UI 字符串必须在 `en.ts`, `zh.ts`, `ja.ts` 中添加：
- `moderation.title`
- `moderation.adultContent`
- `moderation.hide`
- `moderation.warn`
- `moderation.ignore`
- `moderation.labeler.from`
- `moderation.report.title`
- `moderation.report.reason`
- ...etc

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| queryLabels API 调用过多 | 批量查询（50-250 URI/次）+ LabelCache TTL 5min |
| 标签提供商 DID 错误 | 添加时验证 DID 格式 + fetch 服务记录确认 |
| 配置冲突（官方 vs 第三方）| 明确规则：各提供商独立评估，取最严格结果 |
| 官方标签列表变化 | 不硬编码，启动时动态拉取服务记录 |
| TUI 显示空间不足 | 极简模式：隐藏完全折叠，警告单行提示 |

## 提交计划

1. `feat(core): add labeling types and BskyClient API methods`
2. `feat(core): implement ModerationDecision engine and LabelCache`
3. `feat(app): add moderation hooks and config management`
4. `feat(pwa): add moderation settings page with labeler management`
5. `feat(pwa): integrate moderation into PostCard and ThreadView`
6. `feat(pwa): add report button and welcome step`
7. `feat(tui): add moderation settings and post rendering`
8. `feat(tui): add report shortcut`
9. `feat(core): support self-labels in createPost`
10. `docs: add LABELING.md and update TODO`

---

*Plan created: 2026-05-24*
*Ready for implementation*
