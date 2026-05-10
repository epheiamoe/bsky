# USER ISSUES
> 新问题会添加到末尾。修复后请标记为 ✅ 并注明修复时间。

## ✅ #1 TUI 重复发帖
**修复于 2026-04-29**: compose 视图的 Enter 键被 TextInput.onSubmit 和全局 useInput 双重处理。移除了全局 handler 中的 compose Enter 处理，仅保留 TextInput 的 onSubmit。

## ✅ #2 TUI 无法选中复制文本
**说明**: 鼠标跟踪 (`enableMouseTracking`) 仅在 raw mode 可用时启用。在非 raw mode 终端中（如 cmd.exe），鼠标不会拦截文本选择。在 raw mode 终端中（Windows Terminal），Ctrl+Shift+C 仍可复制选中文本。

## ✅ #3 TUI 通知无法交互
**修复于 2026-04-29**: 
- 添加 ↑↓/jk 光标导航
- Enter 跳转到对应帖子
- 选中项蓝色高亮
- R 键刷新通知
- 显示 "↳ 按 Enter 查看帖子" 预览行

## ✅ #4 TUI 搜索
**说明**: 搜索栏需要 raw mode 终端（Windows Terminal / iTerm2）才能交互输入。已在文档中注明。

## ⬜ #5 PWA 翻译按钮对纯图片帖子的处理
**修复于 2026-04-29**: 当帖子无文字时禁用翻译按钮。

## ⬜ #6 PWA 翻译状态在切换帖子时未清除
**修复于 2026-04-29**: 使用 useEffect 监听 focused.uri 变化，自动清除翻译结果。

## ✅ #7 PWA 时间线滚动位置丢失
**修复于 2026-05-10** · **版本**: v0.10.4  
**根因**: FeedTimeline 的 `useVirtualizer` 在组件卸载时完全销毁（所有测量缓存丢失）。重新挂载后全部回退到 `ESTIMATED_POST_HEIGHT=120px`，实测 ~170px 的偏差累积 40+ 帖后偏移 ~2000px。  
**修复**: 保持 FeedTimeline 始终挂载（`display:none` 隐藏而非条件卸载），保留 virtualizer 状态和 DOM scrollTop。
