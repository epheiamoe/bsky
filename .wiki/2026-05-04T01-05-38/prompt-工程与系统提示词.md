所有 LLM 面向的文本集中管理在 `packages/core/src/ai/prompts.ts` 中，这是整个 AI 提示词的**单一事实源**（Single Source of Truth）。任何 AI 行为的调整只需编辑这个文件后重新构建，无需散落在各处修改。[来源](packages/core/src/ai/prompts.ts#L1-L8)

---

## 命名约定：`P_` vs `PF_`

文件开头的注释明确了命名规则：

| 前缀 | 类型 | 示例 | 行为 |
|------|------|------|------|
| `P_` | **常量字符串** | `P_ASSISTANT_BASE` | 编译期确定，运行时不可变 |
| `PF_` | **参数化函数** | `PF_CURRENT_USER(name, handle)` | 运行时接受参数，返回动态拼装的字符串 |

这一划分遵循了"静态规则 vs 动态上下文"的分离原则。常量承载不可变的行为约束，函数注入每轮对话特有的环境信息。[来源](packages/core/src/ai/prompts.ts#L10-L16)

---

## 提示片段全景

在 `packages/app/src/hooks/useAIChat.ts` 的 `buildSystemPrompt` 中，所有片段按固定顺序拼接成一个完整的 system prompt：

```
P_ASSISTANT_BASE
+ PF_CURRENT_USER
+ PF_PROFILE_CONTEXT / PF_POST_CONTEXT（二选一）
+ PF_ENVIRONMENT
+ PF_LOCALE_HINT
+ PF_CURRENT_TIME
+ PF_VISION_HINT
+ P_CONCISE
```

[来源](packages/app/src/hooks/useAIChat.ts#L65-L87)

以下逐一解析每个片段的设计意图。

---

### 1. `P_ASSISTANT_BASE`——身份与铁律

这是整个提示系统的基石，包含三部分：

**身份声明**：定义助手是"用户的 Bluesky 助手"，负责浏览和分析内容。告知 LLM 支持高级搜索语法（`from:`、`to:`、`mentions:`、`since:`、`until:`、`lang:`、`has:image` 等 Lucene 运算符），以及可通过 `download_image` 保存图片到本地。

**媒体处理指南**：说明图片以 `pendingImageIndex` 索引引用；视频在上下文中标记为 `[视频]`，提醒 LLM 不要对视频帖子调用 `extract_images_from_post` 或 `view_image`。

**『3 条铁律』**——这是最关键的约束层：

> 1. 绝对不要主动代表用户发帖、回复、点赞、转发或关注任何人。所有写操作（`create_post`、`like`、`repost`、`follow`）必须由用户**明确要求**后才执行。
> 2. 汇总资料时直接输出分析结果，不要附加"我帮你发条帖子吧"之类的建议。
> 3. 如果用户要求你发帖，你才通过 `create_post` 工具执行，否则永远不要。

这三条规则是 AI 行为安全的基石。TUI 和 PWA 两个前端都依赖这组提示来约束 LLM，配合 [AI 助手系统](ai-助手与工具调用系统.md) 中的**写入确认门控机制**（Write Confirmation Gate），形成双重保险：提示层禁止主动写操作，执行层拦截未确认的写工具调用。[来源](packages/core/src/ai/prompts.ts#L31-L64)

---

### 2. `PF_CURRENT_USER`——你是谁

```typescript
PF_CURRENT_USER("张三", "zhang3")
// → "当前用户: 张三 (@zhang3)。"
```

在每轮对话开头注入当前用户的身份标识。如果只有 display name 则省略 `@handle` 后缀。这让 LLM 在分析"我"的时间线、资料时，知道从谁的视角出发。[来源](packages/core/src/ai/prompts.ts#L66-L74)

---

### 3. `PF_PROFILE_CONTEXT`——你在看谁的主页

当用户从某个用户主页打开 AI 对话时触发。指令 LLM 依次：

1. 调用 `get_author_feed` 获取该用户的近期帖子
2. 通过 `search_posts from:当前用户 to:目标用户` 查找互动历史
3. 概括至少 3 个要点，在响应末尾引用至少一则贴文
4. **仅分析，不要代表用户发帖或互动**

注意 `currentUserHandle` 是可选参数——若未传入则跳过互动搜索。[来源](packages/core/src/ai/prompts.ts#L76-L90)

---

### 4. `PF_POST_CONTEXT`——你在看哪条帖子

```typescript
PF_POST_CONTEXT("at://did:plc:xxx/app.bsky.feed.post/yyy")
// → "用户正在查看帖子 at://did:plc:xxx/app.bsky.feed.post/yyy，如果需要请用工具获取上下文。"
```

与 `PF_PROFILE_CONTEXT` 互斥（二选一），当用户从帖子/线程页打开 AI 对话时使用。[来源](packages/core/src/ai/prompts.ts#L92-L97)

---

### 5. `PF_ENVIRONMENT`——你在哪运行

根据运行环境自适应调整输出格式：

| 环境 | 行为 |
|------|------|
| `tui`（终端） | 纯文本输出，每行 ≤80 字符，支持 OSC 8 超链接但不支持图片 |
| `pwa`（浏览器） | 支持图片、Markdown 格式和超链接 |

这让 LLM 知道如何调整回复的排版密度。两种环境的实现细节见 [TUI 终端界面实现](tui-终端界面实现.md) 和 [PWA 网页应用实现](pwa-网页应用实现.md)。[来源](packages/core/src/ai/prompts.ts#L100-L105)

---

### 6. `PF_LOCALE_HINT`——用什么语言回复

```typescript
PF_LOCALE_HINT("zh")
// → "用户界面语言: zh，请优先用该语言回复。"
```

与 [国际化 i18n 系统](国际化-i18n-系统设计.md) 联动，LLM 会根据用户当前界面语言选择回复语言。[来源](packages/core/src/ai/prompts.ts#L108-L110)

---

### 7. `PF_CURRENT_TIME`——现在几点

```typescript
// 假设当前 UTC 时间 2025-01-15 08:30:00，星期三
// → "当前时间: 2025-01-15 08:30:00 (UTC+0)，星期三。"
```

在每次构建 system prompt 时取系统时钟生成，而非缓存复用的常量。这对涉及时间敏感查询（"最近 3 天"、"今天的帖子"）至关重要。注意时区固定为 UTC+0。[来源](packages/core/src/ai/prompts.ts#L119-L125)

---

### 8. `PF_VISION_HINT`——视觉模式开关

**开启时**：告知 LLM 可以使用 `view_image` 查看图片、`download_image` 保存图片。

**关闭时**：给出更长的说明——如果 LLM 自身支持视觉（如 GPT-4V、Claude Vision、DeepSeek VL），可提醒用户在 TUI 设置页或 PWA 中开启视觉模式；如果不支持视觉则不要建议，避免浪费上下文。[来源](packages/core/src/ai/prompts.ts#L128-L143)

视觉模式的前端实现及与思考模式的关系，详见 [流式输出与思考模式](流式输出与思考模式.md)。

---

### 9. `P_CONCISE`——收尾简洁

```typescript
export const P_CONCISE = '回答简练。';
```

在所有片段之后拼装，作为对 LLM 输出长度的全局约束。来源 `packages/core/src/ai/prompts.ts#L113`。

---

## 自动分析消息：`PF_AUTO_ANALYSIS`

当用户从个人主页进入 AI 对话（`contextProfile` 非空）且对话消息为空时，`useAIChat` 的 `useEffect` 会在 500ms 延迟后自动发送：

```typescript
send(PF_AUTO_ANALYSIS(displayName));
// → "请分析 @displayName 的主页，概括他们的近期动态。"
```

`autoStartedRef` 确保仅触发一次，避免重复请求。这是 PF_PROFILE_CONTEXT 的配套机制：系统提示告诉 LLM"用户在查看某人的主页"，自动消息则直接触发分析行为。[来源](packages/app/src/hooks/useAIChat.ts#L345-L350)

---

## 引导问题：`P_GUIDING_QUESTIONS`

```typescript
export const P_GUIDING_QUESTIONS: string[] = [
  '总结这个讨论',
  '解释这个讨论',
  '分析帖子情绪',
];
```

这是一个只读字符串数组，**不注入到 system prompt 中**，而是被 `useAIChat` 提取到 React state，渲染为 UI 中的快捷提问按钮。用户在对话初始、切换上下文或聊天加载完成时，会看到这三个预设问题可一键点击发送。

这些引导问题在以下时刻被设置：
1. 初次带 `contextPost` 进入对话时
2. 从存储恢复聊天记录但消息为空时
3. 用户切换到新的帖子上下文时

[来源](packages/app/src/hooks/useAIChat.ts#L107-L182)

---

## 翻译与润色提示词

`prompts.ts` 中还包含两组独立提示词，它们不走 `buildSystemPrompt` 的拼装流程，而是由 AIAssistant 中的 `translateText` 和 `singleTurnAI` 直接传入：

| 提示词 | 用途 | 调用者 |
|--------|------|--------|
| `PF_TRANSLATE_SIMPLE` | 纯文本翻译 | `translateText()` |
| `PF_TRANSLATE_JSON` | JSON 结构化翻译（含源语言检测） | `translateText()` |
| `P_POLISH_SYSTEM` | 润色系统提示 | `singleTurnAI()` |
| `PF_POLISH_USER` | 润色用户提示模板 | `singleTurnAI()` |

翻译系统的完整设计见 [翻译与润色功能](翻译与润色功能.md)。[来源](packages/core/src/ai/prompts.ts#L145-L175)

---

## 架构价值

`prompts.ts` 的设计体现了两个关键决策：

1. **集中化管理**——所有 LLM 面向的文本统一在单个文件中，而非分散在各处。任何提示修改只需改文件、等构建，无需追踪调用链。这在多供应商（DeepSeek、Mistral 等）场景下尤为重要，见 [多模型供应商与 Provider 系统](项目结构与包依赖.md)（注：此处如有专门页面应链接）。

2. **运行时组装的拼装模型**——`buildSystemPrompt` 在每次需要时动态调用 `PF_*` 函数，确保时间、环境、用户标识等都反映最新状态。常量与函数的划分让静态规则只编译一次，动态数据每次重新生成。[来源](packages/app/src/hooks/useAIChat.ts#L65-L87)

---

## 延伸阅读

- [AI 助手与工具调用系统](ai-助手与工具调用系统.md) —— AIAssistant 类是如何消费这些提示词并管理多轮对话与 31 个工具的
- [流式输出与思考模式](流式输出与思考模式.md) —— 视觉模式与思考模式的完整实现
- [翻译与润色功能](翻译与润色功能.md) —— 翻译提示词的具体消费流程
- [TUI 终端界面实现](tui-终端界面实现.md) —— `tui` 环境的输出渲染约束
- [PWA 网页应用实现](pwa-网页应用实现.md) —— `pwa` 环境的输出渲染约束