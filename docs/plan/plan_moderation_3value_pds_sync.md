# Plan: Moderation System Fix — 3-Value + PDS Sync + Copy Fix

## Date: 2026-05-25
## Branch: feature/moderation-ui-redesign-v15
## Status: Core + PDS Sync Implemented, Pending Pronouns Sync & UI Polish

---

## Critical Decisions (方案A: 跟随官方)

### 1. Badge vs Warn 的真相
**badge 不是用户选项。** 由标签定义决定：
- `blurs=none` → warn 显示徽章（如 impersonation）
- `blurs=content` → warn 显示覆盖层（如 adult content）
- `blurs=media` → warn 只模糊媒体

### 2. PDS API 限制
```typescript
contentLabelPref.visibility: 'show' | 'warn' | 'hide'  // 3值，无 badge
labelersPref: [{did}]  // 无 per-labeler 偏好
profile.pronouns: string  // 支持
```

### 3. 同步策略
- **标准标签**: PDS 存 `show/warn/hide`（3值）
- **per-labeler 偏好**: 仅本地存储（PDS 不支持）
- **代词**: 仅 sync `custom` 值到 `profile.pronouns`
- **缓存**: 登录时拉取一次，存 localStorage。AI 对话不拉取。

### 4. 用户偏好 vs 渲染表现
| 用户设置 | PDS 存储 | 实际表现（由 blurs 决定） |
|---------|---------|------------------------|
| show | show | 正常显示 |
| warn | warn | blurs=none→徽章, blurs=content→覆盖层, blurs=media→媒体模糊 |
| hide | hide | 完全隐藏 |

---

## Changes Required

### A. Core Layer (packages/core/)

**A1. 恢复为3值系统**
- `ContentLabelPref.visibility`: `'show' | 'badge' | 'warn' | 'hide'` → `'show' | 'warn' | 'hide'`
- `LabelerConfig.labelPrefs`: 同样恢复
- `resolveModeration()`: 移除 badge 分支，badge→warn 映射

**A2. 标签定义 defaultSetting**
- `LabelValueDefinition.defaultSetting`: 保持 `'show' | 'badge' | 'warn' | 'hide'`（标签定义可以有 badge）
- `BUILTIN_LABEL_DEFINITIONS`: 恢复原来的 defaultSetting（porn=hide, sexual=warn, nudity=warn, graphic-media=warn）
- `DEFAULT_MODERATION_CONFIG`: 恢复 `ignore` → `show`（因为 PDS 没有 ignore）

**A3. resolveModeration 逻辑**
```
visibility='show' → action='none'
visibility='warn' → 
  blurs=content → contentAction='warn'
  blurs=media → mediaAction='blur'
  blurs=none → contentAction='warn'（但只显示徽章）
  severity≠none → contentAction='warn'（兜底）
visibility='hide' → contentAction='hide'
```

### B. App Layer (packages/app/)

**B1. useModerationConfig 恢复**
- 移除 badge 值支持
- 迁移：badge→warn（本地缓存已存的 badge 转为 warn）

**B2. usePostModeration hook**
- 已完成，保持（用于 ThreadView focused post）

**B3. i18n**
- 移除 `moderation.badge` 键
- 恢复 `moderation.ignore`（zh: 忽略/显示, en: Ignore/Show）

### C. PWA Layer (packages/pwa/)

**C1. 文案修复**
- `packages/app/src/i18n/locales/zh.ts:698`
- `'启用人内容显示'` → `'启用成人内容显示'`

**C2. UI 统一为卡片式**
- 官方审核提供商（OfficialLabelerPanel）改为卡片式按钮
- 和「内容过滤器」区域样式一致

**C3. ModerationSettingsTab 恢复3值**
- 按钮改为3个：显示 / 警告 / 隐藏
- 移除 badge 按钮

**C4. WelcomeCard 恢复3值**
- 同样改为3个 radio/按钮

**C5. BadgeRow 互斥逻辑**
- 已完成：只在 `contentAction === 'none'` 时显示
- 但 BadgeRow 应该只在 `blurs=none` 的标签 warn 时显示

### D. PDS 同步（Phase 2）

**D1. Core API 方法**
- `BskyClient.getProfileRecord()` → 获取 raw profile record（含 pronouns）
- `BskyClient.putProfileRecord()` → 更新 profile record（含 pronouns）
- `BskyClient.getModerationPrefs()` → 从 preferences 提取 moderation 设置
- `BskyClient.putModerationPrefs()` → 写入 moderation 设置到 preferences

**D2. 代词同步**
- 设置页加载时：getProfileRecord → 提取 pronouns → 写入 localStorage
- 用户修改时：putProfileRecord({ pronouns }) → 成功后更新 localStorage
- AI 对话只读 localStorage

**D3. 审核设置同步**
- 设置页加载时：getModerationPrefs → 合并到本地 config
- 用户修改时：putModerationPrefs → 标准标签同步到 PDS，per-labeler 仅本地

---

## Implementation Order

### ✅ Step 1: Core 层恢复3值
1. `packages/core/src/at/types.ts` — ContentLabelPref 恢复3值 ✅
2. `packages/core/src/moderation.ts` — resolveModeration 移除 badge 分支 ✅
3. `packages/core/src/moderation.ts` — DEFAULT_MODERATION_CONFIG 恢复 ✅

### ✅ Step 2: App 层恢复
4. `packages/app/src/hooks/usePostsWithModeration.ts` — 保留 usePostModeration（ThreadView focused post 需要）✅
5. `packages/app/src/index.ts` — 保留 usePostModeration export ✅
6. `packages/app/src/i18n/locales/*.ts` — 移除 badge 键，恢复 ignore ✅

### ✅ Step 3: PWA 文案 + UI
7. `packages/app/src/i18n/locales/zh.ts` — 修复 "人内容" 文案 ✅
8. `packages/pwa/src/components/ModerationSettingsTab.tsx` — 恢复3值按钮 ✅
9. `packages/pwa/src/components/WelcomeCard.tsx` — 恢复3值 ✅

### ✅ Step 4: BadgeRow 修复
10. `packages/core/src/moderation.ts` — BadgeRow 只在 blurs=none 时显示 ✅
11. `packages/pwa/src/components/PostPreviewCard.tsx` — 互斥逻辑 ✅
12. `packages/pwa/src/components/ThreadView.tsx` — 互斥逻辑 ✅

### ✅ Step 5: PDS 同步（Core API）
13. `packages/core/src/at/client.ts` — 新增 getProfileRecord/putProfileRecord ✅
14. `packages/core/src/at/client.ts` — 新增 getModerationPrefs/putModerationPrefs ✅

### ✅ Step 6: PDS 同步（App Hook + UI）
15. `packages/pwa/src/hooks/useModerationConfig.ts` — 添加 syncFromPDS/saveToPDS ✅
16. `packages/pwa/src/components/ModerationSettingsTab.tsx` — 自动拉取 + 手动同步按钮 + 状态显示 ✅
17. `packages/pwa/src/App.tsx` + `SettingsPage.tsx` — 传递 sync props ✅
18. `packages/app/src/i18n/locales/*.ts` — 新增 sync 相关 i18n 键 ✅

### ⏳ Step 7: 代词同步（Pending）
19. `packages/pwa/src/hooks/useAppConfig.ts` — 添加代词 PDS 同步
20. `packages/pwa/src/components/SettingsPage.tsx` — 代词从 PDS 读取，保存时写入

### ✅ Step 8: 验证
21. `pnpm -r typecheck` ✅
22. `cd packages/pwa && pnpm build && deploy` ✅

---

## PDS Sync Implementation Details

### Auto-pull on mount
- `ModerationSettingsTab` 使用 `useEffect` + `useRef` 确保 mount 时只自动拉取一次
- 需要 `client`（已登录）才会触发
- 拉取成功后更新本地 config（保留 per-labeler prefs）

### Manual sync buttons
- **同步到服务器** (`saveToPDS`): 将当前本地配置写入 PDS
- **从服务器拉取** (`syncFromPDS`): 从 PDS 读取并合并到本地
- 状态显示: 同步中 spinner / 成功时间戳 / 错误提示

### Merge strategy (`syncFromPDS`)
```
PDS adultContentEnabled → overwrite local
PDS contentLabels → overwrite local (merge by label name)
PDS labelerDIDs → add missing ones (don't remove local-only)
Local per-labeler labelPrefs → preserved
Local labeler failureBehavior → preserved
```

### SyncState persistence
- Stored in `localStorage` (`bsky_moderation_sync`)
- Fields: `status`, `lastSyncedAt`, `error`
- Survives page reloads

---

## Migration Notes

### 用户配置迁移
- 本地已存的 `badge` 值 → 自动转为 `warn`
- 已存的 `ignore` 值 → 自动转为 `show`

### PDS ↔ 本地映射
```
PDS 'show' ←→ 本地 'show'
PDS 'warn' ←→ 本地 'warn'
PDS 'hide' ←→ 本地 'hide'
```

### 标签定义 defaultSetting
- 标签定义仍然有4值（包括 badge）
- badge 作为 defaultSetting 意味着：未设置时默认 warn，但因为 blurs=none，实际显示徽章

---

## Key Files

| File | Action |
|------|--------|
| `packages/core/src/at/types.ts` | 恢复 ContentLabelPref 为3值 |
| `packages/core/src/moderation.ts` | 移除 badge action，恢复 DEFAULT |
| `packages/app/src/hooks/usePostsWithModeration.ts` | 评估 usePostModeration 是否保留 |
| `packages/app/src/index.ts` | 移除 usePostModeration export |
| `packages/app/src/i18n/locales/zh.ts` | 修复文案，移除 badge |
| `packages/app/src/i18n/locales/en.ts` | 移除 badge |
| `packages/app/src/i18n/locales/ja.ts` | 移除 badge |
| `packages/pwa/src/components/ModerationSettingsTab.tsx` | 恢复3值 UI |
| `packages/pwa/src/components/WelcomeCard.tsx` | 恢复3值 UI |
| `packages/pwa/src/components/PostPreviewCard.tsx` | BadgeRow 修复 |
| `packages/pwa/src/components/ThreadView.tsx` | BadgeRow 修复 |
| `packages/core/src/at/client.ts` | 新增 PDS API 方法 |
| `packages/app/src/hooks/useModerationConfig.ts` | PDS 同步逻辑 |
| `packages/pwa/src/hooks/useAppConfig.ts` | 代词 PDS 同步 |

---

## Open Questions

1. usePostModeration hook 是否保留？ThreadView focused post 是否走 usePostsWithModeration？
   → 保留，因为 focused post 不在 flatLines 中

2. OfficialLabelerPanel 的 radio 表格是否改为卡片式？
   → 是，和内容过滤器一致

3. PDS 拉取失败时的 fallback 策略？
   → 使用本地缓存，显示"无法同步"提示

---

*Created: 2026-05-25*
*Last updated: 2026-05-25*
