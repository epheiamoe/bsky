---
title: "Gallery embed $type 字段缺失导致静默失败"
date: 2026-06-13
category: compose
severity: critical
---

## 问题

`app.bsky.embed.gallery` 发帖静默失败 — API 接受了请求但帖子不可见。

## 根因

`buildGalleryEmbed()` 生成的 gallery items 缺少 `$type: 'app.bsky.embed.gallery#image'` 字段。PDS 的 `createRecord` 不验证嵌入结构（只存储 JSON），所以不报错。但 AppView 解析时因缺少 `$type` 无法识别 item 类型，导致帖子不被索引。

## 教训

1. **AT Protocol 记录中的 `$type` 是 union 类型的判别字段** — 缺少它，解析器无法确定 item 类型
2. **PDS 不等于验证器** — `createRecord` 接受任意 JSON 结构，不代表格式正确
3. **必须对照官方 lexicon JSON 验证生成的记录结构** — 不能只看 TypeScript 类型
4. **查看官方客户端源码是终极验证手段** — `bluesky-social/social-app` 的 `src/lib/api/index.ts` 中 `resolveMedia()` 函数

## 正确格式

```javascript
{
  $type: 'app.bsky.embed.gallery',
  items: [{
    $type: 'app.bsky.embed.gallery#image',  // ← 必须！
    image: { $type: 'blob', ref: { $link }, mimeType, size },
    alt: "...",
    aspectRatio: { width: 1920, height: 1080 }  // ← gallery 中必填
  }]
}
```

## 相关 lexicon

- `app.bsky.embed.gallery` — items 为 union 类型 (`refs: ["#image"]`)
- `app.bsky.embed.gallery#image` — image (blob) + alt (string) + aspectRatio (required)
- 对比 `app.bsky.embed.images#image` — aspectRatio 是 optional
