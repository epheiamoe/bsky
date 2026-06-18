---
title: "GalleryCard 箭头按钮在 form 内触发提交"
date: 2026-06-13
category: html
severity: high
---

## 问题

ComposePage 中 GalleryCard 的左右箭头按钮点击后触发了发帖操作。

## 根因

HTML `<button>` 元素默认 `type="submit"`。GalleryCard 的箭头按钮缺少 `type="button"`，在 `<form>` 内点击时触发表单提交。

## 教训

1. **所有非提交按钮必须显式写 `type="button"`** — 尤其是嵌入在表单内的组件
2. **GalleryCard 作为通用组件，不应假设使用上下文** — 必须自保
3. **ESLint 规则 `react/button-has-type` 可以预防此问题**
