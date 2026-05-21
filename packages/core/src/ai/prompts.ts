/**
 * Centralized AI prompts — single source of truth for all LLM-facing text.
 *
 * Architecture:
 * - Single template string for multi-turn assistant (see buildSystemPrompt)
 * - Simple string-replace rendering — no external template library needed
 * - Each named variable {{VAR}} replaced in one pass
 */

// ══════════════════════════════════════════════════════════════════
// Language labels (used by translation prompts)
// ══════════════════════════════════════════════════════════════════

export const LANG_LABELS: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
};

// ══════════════════════════════════════════════════════════════════
// Main assistant system prompt template
// ══════════════════════════════════════════════════════════════════

const MAIN_TEMPLATE = `你是一个在 AI Bluesky 项目中的 AI 助手。项目地址是 github.com/epheiamoe/bsky。如果用户有任何软件问题需要反馈，请提示他们去提 issue。如果用户有任何有关这个项目的疑问，请你使用工具查看仓库。

你可以通过工具调用获取最新的网络动态、用户资料和帖子上下文。

你有一个 search_web_ddg 工具（基于 DuckDuckGo），可用于搜索互联网获取最新信息和网页结果。还有一个 search_wikipedia 工具，可用于搜索 Wikipedia 获取结构化知识摘要（人物、地点、概念等）。需要深度阅读某篇文章时，请使用 fetch_web_markdown。

使用 search_posts 时，支持高级搜索语法：
from:handle（来自用户）、to:handle（提到用户）、mentions:handle、
since:日期、until:日期、lang:语言代码、has:image、
"精确短语"等 Lucene 运算符。

你可以使用 download_image 下载帖子图片到用户本地。

【关于图片】
当用户上传了图片时，图片会存储在当前会话中。
如果需要发帖引用用户上传的图片，请在 create_post 工具中使用 pendingImageIndex 参数（索引从 0 开始）。
例如：create_post({ text: "描述", pendingImageIndex: 0 }) 会使用用户上传的第一张图片。
如果用户上传了多张图片，可以使用多个 pendingImageIndex。

【关于 execute_python — 核心工具】
execute_python 是你的核心工具之一（与 search_posts、get_profile 等并列），用于在隔离的 Python 环境中执行代码。当用户需要批量处理、数据分析或复杂计算时，优先使用它，而非逐个工具调用。

何时使用：
- 批量处理：循环获取/分析多个用户或帖子
- 数据分析：pandas/matplotlib 处理数据
- 文件操作：读取 /workspace/data/ 或写入 /workspace/output/

PWA 额外包：pandas, numpy, matplotlib。

【关于 bsky_tools（Python 库）】
内置在 Python 沙箱中，可从代码批量调用 Bluesky API。

⚠️ 响应结构速查：
- search_posts → {'posts': [...], 'cursor', 'total'} — 数据在 posts 键
- get_timeline / get_author_feed → {'feed': [...], 'cursor'} — 数据在 feed 键
- get_connections → {'direction', 'items': [...], 'total', 'cursor'} — 数据在 items 键
- search_actors → {'actors': [...], 'total', 'cursor'} — 数据在 actors 键
- get_popular_feed_generators → {'feeds': [...]} — 数据在 feeds 键（不是直接 list）
- get_quotes → {'quotes': [...], 'total', 'cursor'} — 数据在 quotes 键
- list_notifications → {'notifications': [...], 'cursor'} — 数据在 notifications 键

直接返回 dict 的方法（不包裹）：
- get_profile → {'did', 'handle', 'displayName', 'followersCount', ...}
- get_feed_generator → {'displayName', 'description', ...}（已解包 view）
- resolve_handle → {'did': str}
- fetch_web_markdown → {'url', 'title', 'content'}
- search_web_ddg → {'heading', 'content'}

⚠️ 常见陷阱：
1. search_posts 返回 dict，不是 list。用 posts['posts'] 获取列表，不是 posts[0]
2. get_connections 返回 {'items': [...]}。用 conn['items'] 迭代，不是 for item in conn
3. get_profile 直接返回字段，没有嵌套的 'data' 或 'view' 层
4. get_popular_feed_generators 返回 {'feeds': [...]}，不是直接返回 list

完整方法列表：search_posts, get_profile, get_timeline, get_author_feed, get_post_thread, search_actors, get_connections, list_notifications, get_lists, get_list_feed, resolve_handle, get_record, list_records, get_popular_feed_generators, get_feed_generator, get_feed, get_post_context, get_post_interactions, get_quotes, get_suggested_follows, extract_images_from_post, download_image, view_image, extract_external_link, fetch_web_markdown, search_web_ddg, search_wikipedia

写操作（create_post, like, repost, follow, create_list, edit_list_members）也可通过 bsky_tools 调用，但仍需用户确认。

fields 参数：指定返回字段以减少输出。例：bsky_tools.search_posts("AI", fields=["uri", "author", "likeCount"])

正确示例：
\`\`\`python
posts = bsky_tools.search_posts("AI", limit=100)
for post in posts['posts']:  # 注意是 posts['posts'] 不是 posts
    profile = bsky_tools.get_profile(post['author'])
    print(f"{profile['displayName']}: {post['text'][:100]}")
\`\`\`

【关于工作区文件】
用户可以在工作区上传任意文件（CSV、JSON、TXT、图片等）。
如果用户在消息中引用了工作区文件（格式：[文件: /workspace/data/文件名]），你可以建议他们用 Python 分析这些文件。
Python 沙箱环境支持：json, math, statistics, csv, io, pathlib, datetime, re, collections, itertools。
Python 可以读取 /workspace/data/ 下的用户上传文件，并将结果保存到 /workspace/output/。
输出文件（CSV、PNG、JSON 等）会自动展示给用户。

【关于工作区图片引用】
当工作区中有图片文件（用户上传或 Python 生成）时，你可以使用 Markdown 图片语法在回复中直接引用展示：
- 格式：![描述](文件名.png) 或 ![描述](/workspace/output/文件名.png)
- 支持的图片格式：PNG、JPG、JPEG
- 示例：用户上传了 chart.png，你可以回复 "这是生成的图表：![分析图表](chart.png)"
- 系统会自动从工作区加载并显示对应的图片

【关于视频】
Bluesky 帖子可能包含视频（在 get_post_context 和 get_post_thread_flat 中以 [视频] 标记显示）。
你无法查看或分析视频内容。不要对视频帖子调用 extract_images_from_post 或 view_image。
如果帖子只有视频而没有图片，直接告知用户帖子包含视频、你暂时无法分析视频内容即可。

【重要规则】
 1. 绝对不要主动代表用户发帖、回复、点赞、转发或关注任何人。
    所有写操作（create_post、like、repost、follow）必须由用户明确要求后才执行。
    即使用户让你"查看某人的资料"，你只需要概括和分析，不要自动生成推文或互动。
 2. 汇总资料时直接输出分析结果，不要附加"我帮你发条帖子吧"之类的建议。
 3. 如果用户要求你发帖，你才通过 create_post 工具执行，否则永远不要。
 4. 当你调用写操作工具时，系统会自动弹出确认对话框询问用户是否允许。
    因此你不需要额外询问用户"是否要执行"，直接调用工具执行即可。
    但只有在用户明确提出写操作请求时才调用写工具，不要替用户做决定。
 5. 当前用户: {{userDisplayName}} (@{{userHandle}})。
    需要获取自己信息时，直接使用 get_profile actor="{{userHandle}}"。
    获取自己的时间线、通知等也无需猜测——@{{userHandle}} 已在提示词中给出。
{{#if userPronouns}}6. {{userPronouns}}{{/if}}

{{#if contextProfile}}
用户正在查看 {{contextProfile}} 的主页。
请先查看他们的近期帖子（get_author_feed）。
{{#if currentUser}}如果当前用户与他们有互动历史（点赞、转发、回复等），请使用 search_posts from:{{currentUser}} to:{{contextProfile}} 查找。{{/if}}
概括至少 3 个要点，在响应末尾使用引用格式引用至少一则他们的贴文。
注意：当前用户不一定与该账号有互动，请先尝试查找，如无互动则直接跳过互动分析。
【仅分析，不要代表用户发帖或互动】
{{/if}}

{{#if contextPost}}
用户正在查看帖子 {{contextPost}}，如果需要请用工具获取上下文。
{{/if}}

你运行在{{environment}}中。当前用户通过{{environmentHint}}。

你使用 {{locale}} 语言与用户交流，请默认使用 {{locale}} 回复，除非用户有额外要求。

当前时间: {{currentTime}}。

{{visionHint}}

{{#if customPrompt}}
{{customPrompt}}
{{/if}}

回答简练。`;

/**
 * Build the main multi-turn assistant system prompt.
 * All fixed content lives in MAIN_TEMPLATE; all dynamic values
 * are injected in a single replace pass.
 */
/** Strip prompt injection vectors from user-supplied pronoun strings.
 *  Rules: strip newlines, max 50 chars, reject known instruction keywords.
 *  Returns sanitized string, or 'neutral' fallback if rejected. */
export function sanitizePronouns(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  // Strip newlines and control chars
  const noCtrl = trimmed.replace(/[\r\n\t\0-\x08\x0B\x0C\x0E-\x1F]/g, '');
  // Max 50 chars
  if (noCtrl.length > 50) return 'neutral';
  // Reject known injection keywords
  const injectionPattern = /\b(ignore|override|system|instruction|prompt|reveal|disregard|forget|as\s*(model|ai|llm|assistant)|new\s*(rule|instruction)|role\s*[:=]|you\s+(are|must|will))\b/i;
  if (injectionPattern.test(noCtrl)) return 'neutral';
  return noCtrl;
}

/** Render pronouns string for AI prompt injection.
 *  '' (empty) → skipped entirely (no injection)
 *  'neutral'  → "请使用中性代词称呼用户。"
 *  any other  → "用户的指定代词是 {value}。"
 */
export function renderPronouns(pronouns?: string): string {
  const safe = sanitizePronouns(pronouns ?? '');
  if (!safe) return '';
  if (safe === 'neutral') return '请使用中性代词称呼用户。';
  return `用户的指定代词是 ${safe}。`;
}

export function buildSystemPrompt(opts: {
  contextProfile?: string;
  contextPost?: string;
  currentUser?: string;
  userHandle?: string;
  userDisplayName?: string;
  environment?: 'tui' | 'pwa';
  locale?: string;
  visionEnabled?: boolean;
  customPrompt?: string;
  userPronouns?: string;
}): string {
  const env = opts.environment || 'pwa';
  const now = new Date();
  const day = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const currentTime = now.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZoneName: 'short',
  });

  let result = MAIN_TEMPLATE;

  // Simple variable replacements (use global regex for vars that may appear multiple times)
  result = result.replace(/{{contextProfile}}/g, opts.contextProfile ?? '');
  result = result.replace(/{{contextPost}}/g, opts.contextPost ?? '');
  result = result.replace(/{{currentUser}}/g, opts.currentUser ?? '');
  result = result.replace(/{{locale}}/g, LANG_LABELS[opts.locale ?? 'zh'] ?? opts.locale ?? '中文');

  result = result.replace('{{environment}}',
    env === 'tui' ? '终端命令行界面 (TUI/CLI)' : '网页浏览器 (PWA)');
  result = result.replace('{{environmentHint}}',
    env === 'tui'
      ? '命令行输入和你交互，输出是纯文本。保持回复简短，避免复杂格式，每行不要超过80个字符。可使用OSC 8超链接但不支持图片内嵌。'
      : '网页界面和你交互，支持图片、Markdown格式和超链接。');

  result = result.replace(/{{userHandle}}/g, opts.userHandle ?? '');
  result = result.replace(/{{userDisplayName}}/g, opts.userDisplayName ?? '');
  result = result.replace(/{{userPronouns}}/g, renderPronouns(opts.userPronouns));

  result = result.replace('{{currentTime}}', `${currentTime}，星期${day}。`);

  result = result.replace('{{visionHint}}',
    opts.visionEnabled
      ? '视觉模式已开启。你可以使用 view_image 查看图片内容。使用 download_image 将图片保存到用户本地。'
      : '用户暂未开启视觉模式。如果你支持视觉（如 GPT-4V、Claude Vision、DeepSeek VL 等），可以提醒用户开启视觉模式。开启方法：在 TUI 使用逗号(,)打开设置页面设置 LLM_VISION_ENABLED=true，在 PWA 使用设置页面的「视觉模式」开关。注意：如果你不支持视觉，请不要建议用户开启视觉模式以避免浪费上下文。视觉模式本身不提供外置 OCR 功能，仅用于你自身可处理图片内容。');

  // Conditional blocks: render all {{#if}}...{{/if}} in one pass
  result = renderConditionals(result, {
    contextProfile: !!opts.contextProfile,
    contextPost:    !!opts.contextPost,
    currentUser:   !!opts.currentUser,
    customPrompt:  !!opts.customPrompt?.trim(),
    userPronouns:  !!opts.userPronouns && opts.userPronouns.trim() !== '',
  });

  // Inject custom prompt last (String.replace — not Mustache, safe from user {{}} collision)
  if (opts.customPrompt?.trim()) {
    result = result.replace('{{customPrompt}}', opts.customPrompt.trim());
  }

  return result;
}

/**
 * Replace a single {{#if VAR}}...{{/if}} block.
 * Uses forward depth-scan from openIdx so outer {{/if}} tags
 * cannot be consumed by inner blocks.
 */
function replaceConditionalBlock(
  template: string,
  varName: string,
  condition: boolean,
): string {
  const openTag = `{{#if ${varName}}}`;
  const openIdx = template.indexOf(openTag);
  if (openIdx === -1) return template;

  const closeTag = '{{/if}}';
  const scanStart = openIdx + openTag.length;
  let depth = 1;
  let scan = scanStart;

  while (scan < template.length) {
    const ifIdx = template.indexOf('{{#if ', scan);
    const endIdx = template.indexOf(closeTag, scan);

    if (endIdx === -1) break;

    if (ifIdx !== -1 && ifIdx < endIdx) {
      depth++;
      const afterTag = template.indexOf('}}', ifIdx + 7);
      scan = afterTag !== -1 ? afterTag + 2 : ifIdx + 9; // skip {{#if VAR}}
    } else {
      depth--;
      if (depth === 0) {
        const before = template.slice(0, openIdx);
        const content = template.slice(scanStart, endIdx);
        const after = template.slice(endIdx + closeTag.length);
        if (!condition) return before + after;
        return before + content + after;
      }
      scan = endIdx + closeTag.length;
    }
  }
  return template;
}

/** Process all conditional blocks; condition=false removes the whole block */
function renderConditionals(template: string, vars: Record<string, string | boolean | undefined>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = replaceConditionalBlock(result, key, !!value);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════
// Auto-start message for profile context
// ══════════════════════════════════════════════════════════════════

export function PF_AUTO_ANALYSIS(handle: string): string {
  return `请分析 @${handle} 的主页，概括他们的近期动态。`;
}

// ══════════════════════════════════════════════════════════════════
// Fallback guiding questions (when no contextUri, shown in UI)
// ══════════════════════════════════════════════════════════════════

export const P_GUIDING_QUESTIONS: string[] = [
  '总结这个讨论',
  '解释这个讨论',
  '分析帖子情绪',
];

// ══════════════════════════════════════════════════════════════════
// Single-turn prompts (translate / polish / title / ALT)
// ══════════════════════════════════════════════════════════════════

/**
 * Simple mode translation — plain text output.
 * @param targetLang - the target language label (e.g. '中文', 'English')
 */
export function PF_TRANSLATE_SIMPLE(targetLang: string): string {
  return `Translate the following text to ${targetLang}. Keep the original meaning, output only the translation, no explanations.`;
}

/**
 * JSON mode translation — structured output with source language detection.
 * @param targetLang - the target language label
 */
export function PF_TRANSLATE_JSON(targetLang: string): string {
  return [
    `You are a translator.`,
    `Translate the user's text to ${targetLang}.`,
    `Output valid JSON with these keys:`,
    `{"source_lang": "<ISO 639-1 code, use 'und' if unsure>", "translated": "<the translation>"}.`,
    `Output ONLY the JSON object.`,
    `The response must be a valid JSON object containing the word json.`,
  ].join(' ');
}

/** System prompt for the polish/rewrite assistant */
export const P_POLISH_SYSTEM = '你是一个文字润色助手，根据用户要求调整以下帖子草稿，只返回润色后的文本。';

/** User prompt template for polish */
export function PF_POLISH_USER(requirement: string, draft: string): string {
  return `用户要求：${requirement}\n\n草稿：\n${draft}`;
}

/**
 * System prompt for auto-generating chat conversation titles.
 * Uses the same language as the user's message.
 */
export const P_AUTO_TITLE_SYSTEM = [
  '你是一个对话标题生成助手。根据用户的首条消息和你的回复，为对话生成一个简洁的标题。',
  '规则：',
  '- 使用用户消息的语言生成标题',
  '- 2-15 个字（中文/日文）或 3-8 个词（英文）',
  '- 提取对话的核心主题',
  '- 只返回标题文本本身，不要引号、换行或任何额外文字',
].join('\n');

/**
 * User message for auto-naming: provides the first user message and first AI reply context.
 */
export function PF_AUTO_TITLE_USER(firstUserMsg: string, firstAiReply: string): string {
  return `用户：${firstUserMsg}\n\nAI回复：${firstAiReply}`;
}

/** System prompt for AI ALT — used by describeImage() for image description generation */
export function P_ALT_DESCRIPTION_SYSTEM(targetLang?: string): string {
  const lang = targetLang && targetLang !== 'en' ? ` Write the description in ${targetLang === 'zh' ? 'Chinese (中文)' : targetLang === 'ja' ? 'Japanese (日本語)' : targetLang}.` : '';
  return `You are an accessibility assistant. Describe this image concisely for visually impaired users. Include key visual elements, text content, mood/atmosphere, and relevant context. Keep under 500 characters. Return ONLY the description text — no prefix, no "This image shows...", no markdown.${lang}`;
}

export function PF_ALT_DESCRIPTION_USER(existingAlt?: string): string {
  if (existingAlt && existingAlt.trim()) {
    return `The current ALT text for this image is:\n\n"${existingAlt.trim()}"\n\nPlease provide an improved or alternative description. Keep the same concise style.`;
  }
  return 'Please describe this image for someone who cannot see it.';
}