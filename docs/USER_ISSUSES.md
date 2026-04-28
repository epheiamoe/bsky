# USER ISSUSES
**在这里，我会记录我遇到的不严重但影响体验的问题，请你查看，修复对应ISSUSE 后请标记，类似github 那样。你可以在认为需要的时候查看它，提示：检查这个文件的末尾即可，因为新问题会显示在末尾。**

#1 使用TUI 发帖遇到重复发帖的问题，一个帖子发了两遍

#2 TUI 无法选中复制文本，可能是因为我们已经监听了鼠标操作，但无法选中并复制文本很不方便，请优化。

#3 TUI 通知功能
```
🔔 通知 (21 条) Esc 返回 R 刷新
○ gigadevice.bsky.social 赞了你的帖子 · 2026/4/29 01:23:09
○ gigadevice.bsky.social 赞了你的帖子 · 2026/4/29 01:23:07
○ imoliviaaaaa.bsky.social 关注了你 · 2026/4/29 00:43:15
○ umbra114.bsky.social 关注了你 · 2026/4/28 22:02:34
○ flameliu222.bsky.social 关注了你 · 2026/4/27 23:21:45
○ frankshiki73.bsky.social 赞了你的帖子 · 2026/4/27 19:26:21
○ frankshiki73.bsky.social 回复了你 · 2026/4/27 19:26:10
```
目前无法选中通知。无法预览点赞的是什么帖子（显示前20个子即可，多余的...）或者回复了什么，无法选中后直接enter 跳转到对应帖子。
期望效果：
```
🔔 通知 (21 条) Esc 返回 R 刷新
○ gigadevice.bsky.social 赞了你的帖子 · 2026/4/29 01:23:0
  `测试帖子123`
○ gigadevice.bsky.social 赞了你的帖子 · 2026/4/29 01:23:07
  `测试帖子123`
○ imoliviaaaaa.bsky.social 关注了你 · 2026/4/29 00:43:15
○ umbra114.bsky.social 关注了你 · 2026/4/28 22:02:34
○ flameliu222.bsky.social 关注了你 · 2026/4/27 23:21:45
○ frankshiki73.bsky.social 赞了你的帖子 · 2026/4/27 19:26:21
  `测试帖子123`
○ frankshiki73.bsky.social 回复了你 · 2026/4/27 19:26:10
  `我们进行了功能测试...`
  ⮡ `很好的功能`
```

#4 TUI搜索功能不可用
```
🔍 搜索 Esc 返回
搜索功能：请使用命令行 test 进行搜索。TUI 搜索栏需要 raw mode。
```