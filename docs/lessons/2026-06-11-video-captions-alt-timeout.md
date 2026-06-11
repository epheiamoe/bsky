# 视频字幕与 ALT 实现教训

## 背景
2026-06-11 实现 Bluesky 视频字幕（VTT）+ ALT + 长视频支持 + 超时优化。

## 教训

### 1. i18n 键的完整性检查必须自动化

**问题**：`compose.videoMetadataModalTitle` 键在代码中被使用，但三个 locale 文件中都不存在。由于 `LocaleMessages = Record<string, string>` 类型宽泛，TypeScript 未报错，运行时显示 `undefined`。

**根因**：i18n 键是散落在代码中的字符串字面量，没有编译时检查。

**解决方案**：
- 开发阶段：使用 grep 脚本批量检查代码中使用的键是否在 locale 文件中定义
- 未来改进：考虑引入 i18n key 的类型安全（如使用 `as const` 对象 + keyof 约束）

### 2. 边界条件要在 UI 层面强制，不能只靠提示

**问题**：字幕数量上限 20 个，最初只在 UI 上显示提示文本，但添加按钮始终可用，用户可以超过限制。

**根因**：开发者认为"用户看到提示就会遵守"，但实际上需要硬限制。

**解决方案**：
- 数量上限：按钮添加 `disabled={count >= max}` + 样式变化
- 文件大小：选择后立即检查，超限则拒绝并 alert
- 双重保险：UI 禁用 + 处理函数入口硬检查

### 3. 大文件上传的 timeout 不能固定

**问题**：ky 的默认 timeout 是 30s，对于 100MB+ 视频在慢网络上必然超时。

**解决方案**：
- `calculateUploadTimeout(fileSizeBytes)`：基于保守上传速度（256KB/s）动态计算
- 范围：60s（最小）~ 600s（最大 10 分钟）
- 同时从 ky retry 的 statusCodes 中移除 408，避免超时后重复上传大文件

### 4. 重构组件时保持向后兼容

**问题**：将 `AltTextModal` 重构为 `MediaMetadataModal` 时，接口从 `onSave(alt: string)` 变为 `onSave({ alt, captions? })`。

**处理方式**：
- 保留 `AltTextModal` 作为兼容别名导出（`export { MediaMetadataModal as AltTextModal }`）
- 这样旧代码可以继续使用 `AltTextModal`，新代码使用 `MediaMetadataModal`
- 但长期建议统一迁移到新接口

### 5. Bluesky API 的 lexicon 限制与实际限制可能不一致

**问题**：`app.bsky.embed.video` lexicon 中 `maxSize` 是 100MB，但 Bluesky 官方 App 支持 300MB。

**决策**：
- 应用层支持 300MB（跟随官方 App 的实际能力）
- 但 >100MB 时显示警告，告知用户可能的风险
- 这样既利用实际能力，又不让用户盲目踩坑

### 6. 并行开发时的文件冲突管理

**问题**：ComposePage.tsx 是一个 1372 行的大文件，多处修改容易冲突。

**处理方式**：
- 将独立修改（client.ts、AltTextModal.tsx、useCompose.ts）并行化
- 将所有 ComposePage.tsx 的修改交给一个 implementer 统一处理
- 避免多个代理同时修改同一文件

## 相关文件
- `.swarm/video-captions-alt-optimization/architecture.md`
- `.swarm/video-captions-alt-optimization/review.md`
- `packages/pwa/src/components/ComposePage.tsx`
- `packages/pwa/src/components/AltTextModal.tsx`
