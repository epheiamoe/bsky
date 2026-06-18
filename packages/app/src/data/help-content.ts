/**
 * Self-contained help center content with inline i18n.
 *
 * Each entry contains all text in EN/ZH/JA — no scattered i18n keys.
 * The `getContent()` helper in helpCenter.ts extracts the right language.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface HelpTip {
  icon: string;
  en: string;
  zh: string;
  ja: string;
}

export interface HelpEntry {
  id: string;
  category: 'navigation' | 'media' | 'ai' | 'shortcuts' | 'settings' | 'social' | 'advanced';
  icon: string;
  platforms: Array<'pwa' | 'tui'>;
  keywords: string[];
  related?: string[];

  // Content — inline, not i18n keys
  title: { en: string; zh: string; ja: string };
  summary: { en: string; zh: string; ja: string };
  detail: { en: string; zh: string; ja: string }; // supports markdown
  tips: HelpTip[];
}

// ── Data ──────────────────────────────────────────────────────────────

export const HELP_ENTRIES: HelpEntry[] = [
  // ════════════════════════════════════════════════════════════════════
  // NAVIGATION
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'clipboard-paste',
    category: 'navigation',
    icon: 'clipboard-paste',
    platforms: ['pwa'],
    keywords: ['clipboard', 'paste', 'go', 'url', 'link', 'navigate', 'address bar', '剪贴板', '粘贴'],
    related: ['url-compatibility'],
    title: {
      en: 'Clipboard Paste',
      zh: '剪贴板粘贴',
      ja: 'クリップボード貼り付け',
    },
    summary: {
      en: 'Copy a Bluesky link and jump directly to it with one tap',
      zh: '复制 Bluesky 链接，一键跳转到对应帖子或主页',
      ja: 'Blueskyのリンクをコピーしてワンタップでジャンプ',
    },
    detail: {
      en: `The address bar has a **Paste & Go** button. Copy any bsky.app link (or a link from a supported third-party client like deer.social), then tap the button to navigate directly.

**How to use:**
1. Copy a link (e.g. from a shared post)
2. Tap the clipboard icon in the top bar
3. The app navigates to the post, profile, or feed automatically

**Supported link formats:**
- bsky.app URLs
- at:// protocol URIs
- Third-party client URLs (deer.social, tokimeki.blue, etc.)`,
      zh: `地址栏有一个**「粘贴并跳转」**按钮。复制任意 bsky.app 链接（或 deer.social 等第三方客户端链接），点击按钮即可直接跳转。

**使用方法：**
1. 复制链接（例如从分享的帖子中）
2. 点击顶栏的剪贴板图标
3. 应用自动导航到帖子、主页或动态

**支持的链接格式：**
- bsky.app URL
- at:// 协议 URI
- 第三方客户端 URL（deer.social、tokimeki.blue 等）`,
      ja: `アドレスバーに**「貼り付け＆移動」**ボタンがあります。bsky.app のリンク（deer.social などサードパーティクライアントのリンク）をコピーしてタップするだけで直接移動できます。

**使い方：**
1. リンクをコピー（共有投稿からなど）
2. トップバーのクリップボードアイコンをタップ
3. 投稿、プロフィール、フィードに自動移動

**対応リンク形式：**
- bsky.app URL
- at:// プロトコル URI
- サードパーティクライアント URL（deer.social、tokimeki.blue など）`,
    },
    tips: [
      { icon: 'copy', en: 'Copy any Bluesky link from any app', zh: '从任意应用复制 Bluesky 链接', ja: '任意のアプリからBlueskyリンクをコピー' },
      { icon: 'mouse-pointer-click', en: 'One tap to navigate — no typing needed', zh: '一键跳转，无需手动输入', ja: 'ワンタップで移動——入力不要' },
      { icon: 'globe', en: 'Works with third-party client links too', zh: '也支持第三方客户端链接', ja: 'サードパーティクライアントのリンクにも対応' },
    ],
  },

  {
    id: 'url-compatibility',
    category: 'navigation',
    icon: 'at-sign',
    platforms: ['pwa', 'tui'],
    keywords: ['url', 'at-uri', 'at://', 'bluesky://', 'deer.social', 'tokimeki', 'ouranos', 'deck.blue', 'third-party', 'normalize', 'redirect', '兼容'],
    related: ['clipboard-paste', 'third-party-clients'],
    title: {
      en: 'URL Compatibility',
      zh: 'URL 兼容性',
      ja: 'URL 互換性',
    },
    summary: {
      en: 'Supports multiple Bluesky URL formats and third-party client links',
      zh: '支持多种 Bluesky URL 格式和第三方客户端链接',
      ja: '複数のBluesky URL形式とサードパーティリンクに対応',
    },
    detail: {
      en: `This client understands multiple URL formats and automatically normalizes them to AT Protocol format.

**Supported formats:**
- \`bsky.app\` URLs (standard Bluesky web links)
- \`at://\` protocol URIs (native AT Protocol addressing)
- \`/i/\` internal redirect links
- Third-party client URLs: deer.social, tokimeki.blue, ouranos, deck.blue, graysky

Just paste any supported URL into the address bar — the app handles the rest.`,
      zh: `本客户端支持多种 URL 格式，并自动标准化为 AT Protocol 格式。

**支持的格式：**
- \`bsky.app\` URL（标准 Bluesky 网页链接）
- \`at://\` 协议 URI（AT Protocol 原生寻址）
- \`/i/\` 内部重定向链接
- 第三方客户端 URL：deer.social、tokimeki.blue、ouranos、deck.blue、graysky

只需将支持的 URL 粘贴到地址栏——应用会自动处理。`,
      ja: `このクライアントは複数のURL形式を理解し、自動的にAT Protocol形式に正規化します。

**対応形式：**
- \`bsky.app\` URL（標準Bluesky Webリンク）
- \`at://\` プロトコル URI（AT Protocolネイティブアドレッシング）
- \`/i/\` 内部リダイレクトリンク
- サードパーティクライアント URL：deer.social、tokimeki.blue、ouranos、deck.blue、graysky

対応URLをアドレスバーに貼り付けるだけ——アプリが自動で処理します。`,
    },
    tips: [
      { icon: 'link', en: 'Paste any Bluesky URL format into the address bar', zh: '在地址栏粘贴任意 Bluesky URL 格式', ja: '任意のBluesky URL形式をアドレスバーに貼り付け' },
      { icon: 'globe', en: 'Third-party client links work seamlessly', zh: '第三方客户端链接可无缝使用', ja: 'サードパーティリンクもシームレスに動作' },
      { icon: 'at-sign', en: 'AT URIs (at://...) are natively supported', zh: 'AT URI (at://...) 原生支持', ja: 'AT URI (at://...) にネイティブ対応' },
    ],
  },

  {
    id: 'third-party-clients',
    category: 'navigation',
    icon: 'globe',
    platforms: ['pwa', 'tui'],
    keywords: ['deer.social', 'tokimeki', 'tokimeki.blue', 'ouranos', 'useouranos', 'deck.blue', 'graysky', 'third-party', 'client', '第三方', '客户端'],
    related: ['url-compatibility'],
    title: {
      en: 'Third-Party Clients',
      zh: '第三方客户端',
      ja: 'サードパーティクライアント',
    },
    summary: {
      en: 'Open links from other Bluesky clients directly in this app',
      zh: '直接在本应用中打开其他 Bluesky 客户端的链接',
      ja: '他のBlueskyクライアントのリンクを直接開ける',
    },
    detail: {
      en: `Links from popular third-party Bluesky clients are automatically detected and converted to work in this app.

**Supported clients:**
- deer.social
- tokimeki.blue
- ouranos (useouranos.app)
- deck.blue
- graysky

When you paste or click a link from any of these clients, the app normalizes it to AT Protocol format and navigates directly — no need to open the original client.`,
      zh: `来自 popular 第三方 Bluesky 客户端的链接会自动检测并转换，直接在本应用中打开。

**支持的客户端：**
- deer.social
- tokimeki.blue
- ouranos (useouranos.app)
- deck.blue
- graysky

粘贴或点击这些客户端的链接时，应用会自动标准化为 AT Protocol 格式并直接导航——无需打开原客户端。`,
      ja: `人気のサードパーティBlueskyクライアントのリンクが自動検出・変換され、このアプリで動作します。

**対応クライアント：**
- deer.social
- tokimeki.blue
- ouranos (useouranos.app)
- deck.blue
- graysky

これらのクライアントのリンクを貼り付けたりクリックしたりすると、アプリがAT Protocol形式に正規化して直接移動——元のクライアントを開く必要はありません。`,
    },
    tips: [
      { icon: 'link', en: 'Links from third-party clients open in-app by default', zh: '第三方客户端链接默认在应用内打开', ja: 'サードパーティリンクはアプリ内でデフォルトで開く' },
      { icon: 'clipboard-paste', en: 'Paste any client link to navigate to it', zh: '粘贴任意客户端链接即可导航', ja: '任意のクライアントリンクを貼り付けて移動' },
      { icon: 'at-sign', en: 'AT Protocol URIs work across all clients', zh: 'AT Protocol URI 跨客户端通用', ja: 'AT Protocol URI は全クライアントで動作' },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // MEDIA
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'gallery-embed',
    category: 'media',
    icon: 'image',
    platforms: ['pwa', 'tui'],
    keywords: ['gallery', 'image', 'photo', 'carousel', 'swipe', '10', 'embed', '图片', '轮播', '相册'],
    related: ['rich-embeds'],
    title: {
      en: 'Image Gallery',
      zh: '图片画廊',
      ja: '画像ギャラリー',
    },
    summary: {
      en: 'Multi-image posts display as an interactive carousel',
      zh: '多图帖子以可交互轮播方式展示',
      ja: '複数画像の投稿をインタラクティブなカルーセルで表示',
    },
    detail: {
      en: `Posts with multiple images are shown as a swipeable gallery with navigation controls.

**Features:**
- Swipe or use arrow keys to browse images
- Click any image to view it full-size
- Supports up to 10 images per post
- Smooth transitions between images

In the TUI, images are displayed as numbered references with alt text descriptions.`,
      zh: `包含多张图片的帖子以可滑动画廊形式展示，配有导航控件。

**功能：**
- 滑动或使用方向键浏览图片
- 点击任意图片可查看原图
- 每个帖子最多支持 10 张图片
- 图片间切换流畅

在终端界面中，图片以编号引用和 alt 文本描述显示。`,
      ja: `複数画像の投稿はスワイプ可能なギャラリーとして表示され、ナビゲーションコントロール付き。

**機能：**
- スワイプまたは矢印キーで画像を閲覧
- 任意の画像をクリックでフルサイズ表示
- 投稿あたり最大10枚対応
- スムーズな画像切り替え

TUIでは画像は番号付き参照とaltテキスト説明で表示されます。`,
    },
    tips: [
      { icon: 'mouse-pointer-click', en: 'Swipe or use arrow keys to browse images', zh: '滑动或使用方向键浏览图片', ja: 'スワイプまたは矢印キーで画像を閲覧' },
      { icon: 'keyboard', en: 'Click an image to view full-size', zh: '点击图片查看原图', ja: 'クリックでフルサイズ表示' },
      { icon: 'image', en: 'Up to 10 images per post', zh: '每个帖子最多 10 张图片', ja: '投稿あたり最大10枚' },
    ],
  },

  {
    id: 'rich-embeds',
    category: 'media',
    icon: 'file-image',
    platforms: ['pwa'],
    keywords: ['embed', 'quote', 'quote-post', 'link-preview', 'link-card', 'external', 'og-card', '引用', '预览', '链接卡片'],
    related: ['gallery-embed', 'video-embed'],
    title: {
      en: 'Rich Embeds',
      zh: '富媒体嵌入',
      ja: 'リッチ埋め込み',
    },
    summary: {
      en: 'Quoted posts and links render as preview cards',
      zh: '引用帖子和链接以预览卡片形式呈现',
      ja: '引用投稿とリンクをプレビューカードで表示',
    },
    detail: {
      en: `Quoted posts and external links are rendered as rich preview cards in the PWA.

**Quoted posts:**
- Display as inline cards with author info and preview text
- Tap to navigate to the quoted post

**External links:**
- Show rich previews with title, description, and thumbnail
- Tap to open the link

**Note:** In the TUI, embeds are shown as plain text references.`,
      zh: `引用帖子和外部链接在 PWA 中以富预览卡片形式呈现。

**引用帖子：**
- 以内联卡片展示，包含作者信息和预览文本
- 点击可跳转到被引用的帖子

**外部链接：**
- 显示富预览，含标题、描述和缩略图
- 点击可打开链接

**注意：** 在终端界面中，嵌入内容以纯文本引用显示。`,
      ja: `引用投稿と外部リンクはPWAではリッチプレビューカードとして表示されます。

**引用投稿：**
- 著者情報とプレビューテキスト付きのインラインカードとして表示
- タップで引用投稿に移動

**外部リンク：**
- タイトル、説明、サムネイル付きのリッチプレビューを表示
- タップでリンクを開く

**注意：** TUIでは埋め込みはプレーンテキスト参照として表示されます。`,
    },
    tips: [
      { icon: 'link', en: 'Quoted posts show inline with preview text', zh: '引用帖子以内联卡片形式显示', ja: '引用投稿はインラインカードで表示' },
      { icon: 'message-circle', en: 'External links display rich link cards', zh: '外部链接显示富链接卡片', ja: '外部リンクはリッチリンクカードを表示' },
      { icon: 'image', en: 'All embeds support keyboard navigation', zh: '所有嵌入内容支持键盘导航', ja: 'すべての埋め込みはキーボード対応' },
    ],
  },

  {
    id: 'video-embed',
    category: 'media',
    icon: 'video',
    platforms: ['pwa'],
    keywords: ['video', 'playback', 'stream', 'mp4', 'hls', '视频', '播放'],
    related: ['rich-embeds'],
    title: {
      en: 'Video Playback',
      zh: '视频播放',
      ja: '動画再生',
    },
    summary: {
      en: 'Inline video player for embedded videos',
      zh: '内联视频播放器',
      ja: 'インライン動画プレイヤー',
    },
    detail: {
      en: `Videos embedded in posts play directly inline in the feed using the browser's native video player.

**How it works:**
- Videos play automatically when scrolled into view
- Uses the browser's built-in video controls (play/pause, volume, timeline)
- Supports HLS adaptive streaming for smooth playback
- No custom controls or fullscreen mode — relies on the browser

**Note:** Video playback is PWA-only. In the TUI, video posts show a text reference.`,
      zh: `帖子中嵌入的视频使用浏览器原生视频播放器在动态中直接内联播放。

**工作方式：**
- 滚动到可视区域时自动播放
- 使用浏览器内置视频控件（播放/暂停、音量、时间线）
- 支持 HLS 自适应流媒体，播放流畅
- 无自定义控件或全屏模式——依赖浏览器

**注意：** 视频播放仅在 PWA 中可用。在终端界面中，视频帖子显示为文本引用。`,
      ja: `投稿に埋め込まれた動画は、ブラウザのネイティブ動画プレイヤーを使ってフィード内で直接インライン再生されます。

**仕組み：**
- ビューにスクロールすると自動再生
- ブラウザの組み込み動画コントロールを使用（再生/一時停止、音量、タイムライン）
- HLSアダプティブストリーミング対応でスムーズな再生
- カスタムコントロールやフルスクリーンモードなし——ブラウザに依存

**注意：** 動画再生はPWAのみ。TUIでは動画投稿はテキスト参照として表示されます。`,
    },
    tips: [
      { icon: 'video', en: 'Videos play inline using browser controls', zh: '视频使用浏览器控件内联播放', ja: 'ブラウザコントロールでインライン再生' },
      { icon: 'music', en: 'Supports HLS adaptive streaming', zh: '支持 HLS 自适应流媒体', ja: 'HLSアダプティブストリーミング対応' },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // AI
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'ai-chat',
    category: 'ai',
    icon: 'astroid-as-AI-Button',
    platforms: ['pwa', 'tui'],
    keywords: ['ai', 'chat', 'assistant', 'llm', 'search', 'profile', 'tool', 'agent', '人工智能', '助手', '对话'],
    related: ['ai-polish', 'ai-translate', 'ai-sandbox', 'ai-api-keys'],
    title: {
      en: 'AI Chat',
      zh: 'AI 对话',
      ja: 'AI チャット',
    },
    summary: {
      en: 'Chat with AI to search, analyze, and manage your Bluesky experience',
      zh: '与 AI 对话，搜索、分析和管理你的 Bluesky 体验',
      ja: 'AIと会話してBlueskyを検索・分析・管理',
    },
    detail: {
      en: `Open AI Chat to search posts, view profiles, translate content, or get insights about your Bluesky experience.

**What the AI can do:**
- Search posts by keyword or topic
- View and analyze user profiles
- Translate content between languages
- Polish and improve your draft posts
- Run Python code for data analysis (PWA)

**How to use:**
- Type your question or request naturally
- Use \`@handle\` to reference specific users
- All write actions (posting, liking, etc.) require your confirmation
- Configure your API key in Settings → AI`,
      zh: `打开 AI 对话可搜索帖子、查看资料、翻译内容或获取分析。

**AI 可以做什么：**
- 按关键词或话题搜索帖子
- 查看和分析用户资料
- 在不同语言间翻译内容
- 润色和改进草稿帖子
- 运行 Python 代码进行数据分析（PWA）

**使用方法：**
- 自然地输入你的问题或请求
- 使用 \`@handle\` 引用特定用户
- 所有写操作（发帖、点赞等）需要你确认
- 在设置 → AI 中配置 API 密钥`,
      ja: `AIチャットを開くと投稿の検索、プロフィール閲覧、コンテンツの翻訳、Bluesky体験のインサイト取得ができます。

**AIにできること：**
- キーワードやトピックで投稿を検索
- ユーザープロフィールを閲覧・分析
- コンテンツを多言語間で翻訳
- 下書き投稿を推敲・改善
- Pythonコードでデータ分析（PWA）

**使い方：**
- 質問やリクエストを自然に入力
- \`@handle\` で特定ユーザーを参照
- すべての書き込み操作（投稿、いいねなど）は確認が必要
- 設定 → AI でAPIキーを設定`,
    },
    tips: [
      { icon: 'search', en: 'Ask AI to search posts or view profiles', zh: '让 AI 搜索帖子或查看资料', ja: 'AIに投稿の検索やプロフィール閲覧を依頼' },
      { icon: 'at-sign', en: 'Use @handle to reference specific users', zh: '使用 @handle 引用特定用户', ja: '@handle で特定ユーザーを参照' },
      { icon: 'hash', en: 'Use /view in supported pages for context', zh: '在支持的页面使用 /view 获取上下文', ja: '対応ページで /view でコンテキスト取得' },
      { icon: 'settings', en: 'Configure API key in Settings → AI', zh: '在设置 → AI 中配置 API 密钥', ja: '設定 → AI で API キーを設定' },
    ],
  },

  {
    id: 'ai-polish',
    category: 'ai',
    icon: 'sparkles',
    platforms: ['pwa', 'tui'],
    keywords: ['polish', 'draft', 'writing', 'improve', 'rewrite', '润色', '草稿', '写作', '优化'],
    related: ['ai-chat', 'drafts'],
    title: {
      en: 'Draft Polish',
      zh: '草稿润色',
      ja: '下書き推敲',
    },
    summary: {
      en: 'AI-powered writing improvement for your posts',
      zh: 'AI 驱动的帖子写作改进',
      ja: 'AIによる投稿文章の改善',
    },
    detail: {
      en: `Use AI to polish and improve your draft posts before publishing.

**What it does:**
- Improves clarity, tone, and readability
- Fixes grammar and spelling
- Can adjust style: more concise, formal, humorous, etc.
- The polished version replaces your draft with one click

**How to use:**
1. Start composing a post
2. Use the polish action (AI sparkle icon)
3. Optionally request specific style changes
4. Review and accept the polished version`,
      zh: `使用 AI 在发布前润色和改进草稿帖子。

**功能：**
- 改善清晰度、语气和可读性
- 修正语法和拼写
- 可调整风格：更精简、更正式、更幽默等
- 润色后一键替换草稿

**使用方法：**
1. 开始撰写帖子
2. 使用润色操作（AI 闪光图标）
3. 可选择指定具体的风格要求
4. 审阅并接受润色后的版本`,
      ja: `AIを使って下書き投稿を公開前に推敲・改善します。

**機能：**
- 明瞭さ、トーン、可読性を改善
- 文法とスペルを修正
- スタイル調整可能：より簡潔に、より正式に、ユーモアを加えるなど
- ワンクリックで下書きを置き換え

**使い方：**
1. 投稿の作成を開始
2. 推敲アクション（AIスパークルアイコン）を使用
3. 必要に応じて具体的なスタイル変更をリクエスト
4. 推敲済みバージョンを確認して承認`,
    },
    tips: [
      { icon: 'sparkles', en: 'AI improves clarity, tone, and grammar', zh: 'AI 改善清晰度、语气和语法', ja: 'AIが明瞭さ、トーン、文法を改善' },
      { icon: 'type', en: 'Request specific style changes', zh: '可指定具体的风格要求', ja: '具体的なスタイル変更をリクエスト' },
      { icon: 'copy', en: 'One-click replacement of your draft', zh: '一键替换草稿', ja: 'ワンクリックで下書きを置換' },
    ],
  },

  {
    id: 'ai-translate',
    category: 'ai',
    icon: 'globe',
    platforms: ['pwa', 'tui'],
    keywords: ['translate', 'translation', 'language', 'multilingual', 'i18n', '翻译', '语言', '多语言'],
    related: ['ai-chat'],
    title: {
      en: 'AI Translation',
      zh: 'AI 翻译',
      ja: 'AI 翻訳',
    },
    summary: {
      en: 'Translate posts and content with AI',
      zh: '使用 AI 翻译帖子和内容',
      ja: 'AIで投稿やコンテンツを翻訳',
    },
    detail: {
      en: `Translate any post or text content using AI. The translation respects context and nuance better than traditional machine translation.

**Features:**
- Translate posts from any language
- Preserves tone and context
- Copy translated text with one click
- Set your target language in Settings → General`,
      zh: `使用 AI 翻译任意帖子或文本内容。翻译比传统机器翻译更尊重语境和细微差别。

**功能：**
- 翻译任意语言的帖子
- 保留语气和语境
- 一键复制翻译文本
- 在设置 → 通用中设定目标语言`,
      ja: `AIを使って任意の投稿やテキストコンテンツを翻訳。従来の機械翻訳よりも文脈やニュアンスを尊重した翻訳ができます。

**機能：**
- 任意の言語の投稿を翻訳
- トーンとコンテキストを保持
- ワンクリックで翻訳テキストをコピー
- 設定 → 一般で目標言語を設定`,
    },
    tips: [
      { icon: 'globe', en: 'Translate posts from any language', zh: '翻译任意语言的帖子', ja: '任意の言語の投稿を翻訳' },
      { icon: 'copy', en: 'Copy translated text with one click', zh: '一键复制翻译文本', ja: 'ワンクリックで翻訳テキストをコピー' },
      { icon: 'keyboard', en: 'Set target language in Settings', zh: '在设置中设定目标语言', ja: '設定で目標言語を設定' },
    ],
  },

  {
    id: 'ai-sandbox',
    category: 'ai',
    icon: 'flask-conical',
    platforms: ['pwa', 'tui'],
    keywords: ['python', 'sandbox', 'pyodide', 'wasm', 'code', 'execute', 'data', 'analysis', 'plot', '沙箱', '代码执行', '数据分析'],
    related: ['ai-chat'],
    title: {
      en: 'Python Sandbox',
      zh: 'Python 沙箱',
      ja: 'Python サンドボックス',
    },
    summary: {
      en: 'Run Python code directly for data analysis',
      zh: '直接运行 Python 代码进行数据分析',
      ja: 'Pythonコードを直接実行してデータ分析',
    },
    detail: {
      en: `The AI sandbox runs Python code in an isolated environment for data analysis and computation.

**PWA (browser):** Uses Pyodide (WebAssembly) — runs entirely in your browser, no server needed. Supports pandas, numpy, matplotlib, and more.

**TUI (terminal):** Uses your system Python — install packages locally for full library support.

**What you can do:**
- Analyze Bluesky data (posts, interactions, trends)
- Create charts and visualizations
- Process and transform data
- Run statistical analyses

Just ask the AI to analyze something — it will write and execute the code for you.`,
      zh: `AI 沙箱在隔离环境中运行 Python 代码，用于数据分析和计算。

**PWA（浏览器）：** 使用 Pyodide（WebAssembly）——完全在浏览器中运行，无需服务器。支持 pandas、numpy、matplotlib 等。

**TUI（终端）：** 使用系统 Python——本地安装包以获得完整的库支持。

**可以做什么：**
- 分析 Bluesky 数据（帖子、互动、趋势）
- 创建图表和可视化
- 处理和转换数据
- 运行统计分析

只需让 AI 分析某些内容——它会为你编写并执行代码。`,
      ja: `AIサンドボックスは隔離された環境でPythonコードを実行し、データ分析と計算を行います。

**PWA（ブラウザ）：** Pyodide（WebAssembly）を使用——ブラウザ内で完全に実行、サーバー不要。pandas、numpy、matplotlibなどに対応。

**TUI（ターミナル）：** システムPythonを使用——ローカルにパッケージをインストールして完全なライブラリサポートを取得。

**できること：**
- Blueskyデータの分析（投稿、インタラクション、トレンド）
- チャートやビジュアリゼーションの作成
- データの処理と変換
- 統計分析の実行

AIに分析を依頼するだけ——コードを書いて実行してくれます。`,
    },
    tips: [
      { icon: 'flask-conical', en: 'Ask AI to analyze data or create charts', zh: '让 AI 分析数据或创建图表', ja: 'AIにデータ分析やチャート作成を依頼' },
      { icon: 'search', en: 'Search and process post data with code', zh: '使用代码搜索和处理帖子数据', ja: 'コードで投稿データを検索・処理' },
      { icon: 'table', en: 'Results display as tables and charts', zh: '结果以表格和图表形式展示', ja: '結果をテーブルやチャートで表示' },
    ],
  },

  {
    id: 'ai-api-keys',
    category: 'ai',
    icon: 'key',
    platforms: ['pwa', 'tui'],
    keywords: ['api', 'key', 'api-key', 'openai', 'deepseek', 'xai', 'grok', 'mistral', 'kimi', 'moonshot', 'openrouter', 'provider', 'llm', '密钥', '配置'],
    related: ['ai-chat'],
    title: {
      en: 'API Keys',
      zh: 'API 密钥',
      ja: 'API キー',
    },
    summary: {
      en: 'Configure AI provider API keys for intelligent features',
      zh: '配置 AI 提供商 API 密钥以启用智能功能',
      ja: 'AIプロバイダーのAPIキーを設定してAI機能を有効化',
    },
    detail: {
      en: `Add your own API key from a supported provider to enable AI features. Your key stays in your browser — requests go directly to the provider.

**Supported providers:**
- **DeepSeek** — [Get key](https://platform.deepseek.com/api_keys)
- **Mistral** — [Get key](https://console.mistral.ai/api-keys/)
- **OpenAI** — [Get key](https://platform.openai.com/api-keys)
- **xAI (Grok)** — [Get key](https://console.x.ai/)
- **Kimi (CN)** — [Get key](https://platform.moonshot.cn/console/api-keys)
- **Kimi (Overseas)** — [Get key](https://api.moonshot.ai/console/api-keys)
- **OpenRouter** — [Get key](https://openrouter.ai/keys)

**How to add:**
1. Get an API key from one of the providers above
2. Go to Settings → AI
3. Paste your key and save`,
      zh: `添加来自支持的提供商的 API 密钥以启用 AI 功能。密钥保存在浏览器本地——请求直接发送到提供商。

**支持的提供商：**
- **DeepSeek** — [获取密钥](https://platform.deepseek.com/api_keys)
- **Mistral** — [获取密钥](https://console.mistral.ai/api-keys/)
- **OpenAI** — [获取密钥](https://platform.openai.com/api-keys)
- **xAI (Grok)** — [获取密钥](https://console.x.ai/)
- **Kimi (国内)** — [获取密钥](https://platform.moonshot.cn/console/api-keys)
- **Kimi (海外)** — [获取密钥](https://api.moonshot.ai/console/api-keys)
- **OpenRouter** — [获取密钥](https://openrouter.ai/keys)

**添加方法：**
1. 从上述提供商获取 API 密钥
2. 前往设置 → AI
3. 粘贴密钥并保存`,
      ja: `対応プロバイダーのAPIキーを追加してAI機能を有効化。キーはブラウザ内に保存——リクエストはプロバイダーに直接送信されます。

**対応プロバイダー：**
- **DeepSeek** — [キー取得](https://platform.deepseek.com/api_keys)
- **Mistral** — [キー取得](https://console.mistral.ai/api-keys/)
- **OpenAI** — [キー取得](https://platform.openai.com/api-keys)
- **xAI (Grok)** — [キー取得](https://console.x.ai/)
- **Kimi (中国国内)** — [キー取得](https://platform.moonshot.cn/console/api-keys)
- **Kimi (海外)** — [キー取得](https://api.moonshot.ai/console/api-keys)
- **OpenRouter** — [キー取得](https://openrouter.ai/keys)

**追加方法：**
1. 上記プロバイダーからAPIキーを取得
2. 設定 → AI に移動
3. キーを貼り付けて保存`,
    },
    tips: [
      { icon: 'settings', en: 'Add API key in Settings → AI', zh: '在设置 → AI 中添加 API 密钥', ja: '設定 → AI で API キーを追加' },
      { icon: 'shield', en: 'Your key is stored locally in the browser', zh: '密钥仅保存在浏览器本地', ja: 'キーはブラウザ内にローカル保存' },
      { icon: 'zap', en: 'Supports 7 providers including DeepSeek, OpenAI, and more', zh: '支持 7 个提供商，包括 DeepSeek、OpenAI 等', ja: 'DeepSeek、OpenAIなど7プロバイダーに対応' },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // SHORTCUTS
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'keyboard-shortcuts',
    category: 'shortcuts',
    icon: 'keyboard',
    platforms: ['tui'],
    keywords: ['keyboard', 'shortcut', 'hotkey', 'j', 'k', 'enter', 'escape', '快捷键', '键盘', '操作'],
    related: ['slash-commands'],
    title: {
      en: 'Keyboard Shortcuts',
      zh: '键盘快捷键',
      ja: 'キーボードショートカット',
    },
    summary: {
      en: 'Navigate the TUI entirely with keyboard shortcuts',
      zh: '使用键盘快捷键操作整个终端界面',
      ja: 'キーボードショートカットでTUI全体を操作',
    },
    detail: {
      en: `The TUI is designed for keyboard-first navigation. Press **?** at any time to see all available shortcuts.

**Navigation:**
- \`j\` / \`k\` — Move down / up
- \`Enter\` — Open selected item
- \`Esc\` — Go back
- \`Tab\` — Jump to next section

**Actions:**
- \`V\` — Bookmark (save) a post
- \`Q\` — Quote a post
- \`F\` — Open feed configuration
- \`N\` — Compose new post
- \`/\` — Focus search
- \`?\` — Show help

**Note:** These shortcuts are TUI-specific. The PWA uses standard browser interactions (click, tap, keyboard navigation).`,
      zh: `终端界面专为键盘优先导航设计。随时按 **?** 可查看所有可用快捷键。

**导航：**
- \`j\` / \`k\` — 向下 / 向上移动
- \`Enter\` — 打开选中项
- \`Esc\` — 返回
- \`Tab\` — 跳转到下一分区

**操作：**
- \`V\` — 收藏帖子
- \`Q\` — 引用帖子
- \`F\` — 打开动态配置
- \`N\` — 撰写新帖子
- \`/\` — 聚焦搜索
- \`?\` — 显示帮助

**注意：** 这些快捷键仅适用于终端界面。PWA 使用标准浏览器交互（点击、触摸、键盘导航）。`,
      ja: `TUIはキーボードファーストのナビゲーション向けに設計されています。いつでも **?** を押して利用可能なショートカットを確認できます。

**ナビゲーション：**
- \`j\` / \`k\` — 下へ / 上へ移動
- \`Enter\` — 選択項目を開く
- \`Esc\` — 戻る
- \`Tab\` — 次のセクションにジャンプ

**アクション：**
- \`V\` — 投稿をブックマーク
- \`Q\` — 投稿を引用
- \`F\` — フィード設定を開く
- \`N\` — 新規投稿を作成
- \`/\` — 検索にフォーカス
- \`?\` — ヘルプを表示

**注意：** これらのショートカットはTUI固有です。PWAは標準のブラウザインタラクション（クリック、タップ、キーボードナビゲーション）を使用します。`,
    },
    tips: [
      { icon: 'keyboard', en: 'Press ? to view all shortcuts at any time', zh: '随时按 ? 查看所有快捷键', ja: 'いつでも?ですべてのショートカットを表示' },
      { icon: 'search', en: '/ to focus the search bar', zh: '/ 聚焦搜索栏', ja: '/ で検索バーにフォーカス' },
      { icon: 'bookmark', en: 'V to bookmark, Q to quote a post', zh: 'V 收藏帖子，Q 引用帖子', ja: 'V でブックマーク、Q で引用' },
      { icon: 'message-circle', en: 'N to compose, F for feed config', zh: 'N 撰写新帖，F 打开动态配置', ja: 'N で新規投稿、F でフィード設定' },
    ],
  },

  {
    id: 'slash-commands',
    category: 'shortcuts',
    icon: 'hash',
    platforms: ['pwa'],
    keywords: ['slash', 'command', '/view', 'ai', 'chat', 'context', '命令', '斜杠'],
    related: ['keyboard-shortcuts', 'ai-chat'],
    title: {
      en: 'Slash Commands',
      zh: '斜杠命令',
      ja: 'スラッシュコマンド',
    },
    summary: {
      en: 'Quick commands for AI chat navigation',
      zh: 'AI 对话中的快捷命令',
      ja: 'AIチャットのクイックコマンド',
    },
    detail: {
      en: `Use slash commands in the AI chat for quick context loading and navigation.

**Available commands:**
- \`/view {uri}\` — Load a specific post or profile by AT URI or bsky.app URL into the conversation context

**How to use:**
1. Open AI Chat
2. Type a slash command
3. The command executes and loads context into the conversation

**Note:** Slash commands are PWA-specific. In the TUI, use the AI chat naturally — the AI can access the same information through its tools.`,
      zh: `在 AI 对话中使用斜杠命令快速加载上下文和导航。

**可用命令：**
- \`/view {uri}\` — 通过 AT URI 或 bsky.app URL 将特定帖子或资料加载到对话上下文中

**使用方法：**
1. 打开 AI 对话
2. 输入斜杠命令
3. 命令执行并将上下文加载到对话中

**注意：** 斜杠命令仅在 PWA 中可用。在终端界面中，自然地使用 AI 对话——AI 可以通过其工具访问相同的信息。`,
      ja: `AIチャットでスラッシュコマンドを使って素早くコンテキストを読み込み・ナビゲート。

**利用可能なコマンド：**
- \`/view {uri}\` — AT URIまたはbsky.app URLで特定の投稿やプロフィールを会話コンテキストに読み込み

**使い方：**
1. AIチャットを開く
2. スラッシュコマンドを入力
3. コマンドが実行され、コンテキストが会話に読み込まれる

**注意：** スラッシュコマンドはPWA固有です。TUIでは自然にAIチャットを使用——AIはツールを通じて同じ情報にアクセスできます。`,
    },
    tips: [
      { icon: 'hash', en: 'Type / in AI chat to see available commands', zh: '在 AI 对话中输入 / 查看可用命令', ja: 'AIチャットで / を入力して利用可能なコマンドを表示' },
      { icon: 'search', en: '/view loads a post or profile into context', zh: '/view 将帖子或资料加载到上下文', ja: '/view で投稿やプロフィールをコンテキストに読み込み' },
      { icon: 'at-sign', en: 'Works with AT URIs and bsky.app URLs', zh: '支持 AT URI 和 bsky.app URL', ja: 'AT URIとbsky.app URLに対応' },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'moderation-settings',
    category: 'settings',
    icon: 'shield',
    platforms: ['pwa', 'tui'],
    keywords: ['moderation', 'label', 'labeler', 'filter', 'block', 'mute', 'content', '安全', '审核', '标签', '过滤'],
    related: ['color-blind-mode'],
    title: {
      en: 'Moderation',
      zh: '内容审核',
      ja: 'モデレーション',
    },
    summary: {
      en: 'Customize content filtering and labeling preferences',
      zh: '自定义内容过滤和标签偏好',
      ja: 'コンテンツフィルタリングとラベル設定をカスタマイズ',
    },
    detail: {
      en: `Control how labeled content is displayed and filtered across the app.

**What you can configure:**
- Content visibility for adult, sexual, and graphic content
- Third-party labelers for additional moderation
- Mute and block lists
- Settings sync to your account for cross-device use

**How to configure:**
Go to Settings → Moderation to adjust content filters and add labelers.`,
      zh: `控制标签内容在应用中的显示和过滤方式。

**可配置项：**
- 成人、色情和图形内容的可见性
- 第三方标签器以获取更多审核功能
- 静音和屏蔽列表
- 设置同步到你的账户，跨设备使用

**配置方法：**
前往设置 → 调整内容过滤器和添加标签器。`,
      ja: `ラベル付きコンテンツの表示方法とフィルタリングを制御。

**設定可能な項目：**
- アダルト、性的、グラフィックコンテンツの可視性
- 追加のモデレーション用サードパーティラベラー
- ミュートおよびブロックリスト
- アカウントに設定を同期してクロスデバイス使用

**設定方法：**
設定 → モデレーションに移動してコンテンツフィルターを調整し、ラベラーを追加。`,
    },
    tips: [
      { icon: 'shield', en: 'Set content visibility in Settings → Moderation', zh: '在设置 → 内容审核中设置内容可见性', ja: '設定 → モデレーションでコンテンツの可視性を設定' },
      { icon: 'settings', en: 'Add third-party labelers for more filters', zh: '添加第三方标签器获取更多过滤选项', ja: 'サードパーティラベラーでフィルターを追加' },
      { icon: 'bell', en: 'Sync settings to server for cross-device use', zh: '同步设置到服务器以跨设备使用', ja: 'サーバーに設定を同期してクロスデバイス使用' },
    ],
  },

  {
    id: 'color-blind-mode',
    category: 'settings',
    icon: 'palette',
    platforms: ['pwa'],
    keywords: ['color', 'blind', 'cvd', 'protanopia', 'deuteranopia', 'tritanopia', 'accessibility', 'palette', '色弱', '色盲', '无障碍', '调色板'],
    related: ['moderation-settings'],
    title: {
      en: 'Color Vision Deficiency',
      zh: '色觉辅助模式',
      ja: '色覚サポートモード',
    },
    summary: {
      en: 'Accessible color palette for color vision differences',
      zh: '为色觉差异提供的无障碍调色板',
      ja: '色覚の違いに対応するアクセシブルなカラーパレット',
    },
    detail: {
      en: `Enable the CVD-friendly palette to make the interface more accessible for users with color vision deficiency.

**What changes:**
- Red maps to magenta for better distinguishability
- Green maps to teal
- Yellow maps to amber
- All color-coded UI elements use the adjusted palette

**How to enable:**
Go to Settings → General and toggle the color vision deficiency mode.`,
      zh: `启用色觉辅助调色板，为色觉差异用户提供更友好的界面。

**变化内容：**
- 红色映射为洋红色，更易区分
- 绿色映射为青色
- 黄色映射为琥珀色
- 所有颜色编码的 UI 元素使用调整后的调色板

**启用方法：**
前往设置 → 通用，切换色觉辅助模式。`,
      ja: `CVD対応パレットを有効にして、色覚に違いがあるユーザーにもアクセシブルなインターフェースを提供。

**変更内容：**
- 赤はマゼンタにマッピング（区別しやすく）
- 緑はティールにマッピング
- 黄はアンバーにマッピング
- すべてのカラーコード付きUI要素が調整済みパレットを使用

**有効化方法：**
設定 → 一般に移動して色覚サポートモードを切り替え。`,
    },
    tips: [
      { icon: 'palette', en: 'Enable in Settings → General', zh: '在设置 → 通用中启用', ja: '設定 → 一般で有効化' },
      { icon: 'settings', en: 'Affects all color-coded UI elements', zh: '影响所有颜色编码的 UI 元素', ja: 'すべてのカラーコード付きUI要素に影響' },
      { icon: 'eye', en: 'Improves contrast for common CVD types', zh: '改善常见色觉差异类型的对比度', ja: '一般的なCVDタイプのコントラストを改善' },
    ],
  },

  {
    id: 'widgets',
    category: 'settings',
    icon: 'layout-grid',
    platforms: ['pwa'],
    keywords: ['widget', 'sidebar', 'panel', 'customize', 'component', 'suggested', 'trends', '组件', '侧边栏', '自定义'],
    related: ['moderation-settings'],
    title: {
      en: 'Widgets',
      zh: '小部件',
      ja: 'ウィジェット',
    },
    summary: {
      en: 'Customize the sidebar with useful widget panels',
      zh: '使用小部件面板自定义侧边栏',
      ja: 'ウィジェットパネルでサイドバーをカスタマイズ',
    },
    detail: {
      en: `The right sidebar offers widget panels that you can toggle on/off to personalize your experience.

**Available widgets:**
- Trending topics
- Suggested follows
- Profile preview
- AI quick actions

**How to customize:**
Go to Settings → Display to toggle individual widgets. Widgets adapt to the current view — some widgets only appear on specific pages.`,
      zh: `右侧面板提供可切换的小部件，帮助你个性化使用体验。

**可用小部件：**
- 热门话题
- 推荐关注
- 个人资料预览
- AI 快捷操作

**自定义方法：**
前往设置 → 显示，切换各个小部件。小部件会适应当前视图——部分小部件仅在特定页面显示。`,
      ja: `右サイドバーにはパーソナライズできるウィジェットパネルがあります。

**利用可能なウィジェット：**
- トレンドトピック
- おすすめフォロー
- プロフィールプレビュー
- AIクイックアクション

**カスタマイズ方法：**
設定 → 表示に移動して個別のウィジェットを切り替え。ウィジェットは現在のビューに適応——特定のページでのみ表示されるウィジェットもあります。`,
    },
    tips: [
      { icon: 'layout-grid', en: 'Toggle widgets in Settings → Display', zh: '在设置 → 显示中切换小部件', ja: '設定 → 表示でウィジェットを切り替え' },
      { icon: 'settings', en: 'Widgets adapt to the current view', zh: '小部件适应当前视图', ja: 'ウィジェットは現在のビューに適応' },
      { icon: 'mouse-pointer-click', en: 'Click widget headers to collapse/expand', zh: '点击小部件标题可折叠/展开', ja: 'ウィジェットヘッダーをクリックで折りたたみ/展開' },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // SOCIAL
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'at-play',
    category: 'social',
    icon: 'users',
    platforms: ['pwa'],
    keywords: ['social', 'circle', 'at-play', 'graph', 'interaction', 'network', 'mermaid', '分析', '社交圈', '互动'],
    related: ['lists-management'],
    title: {
      en: 'Social Circle',
      zh: '社交圈分析',
      ja: 'ソーシャルサークル',
    },
    summary: {
      en: 'Visualize your Bluesky interaction patterns as a social graph',
      zh: '将你的 Bluesky 互动模式可视化为社交图谱',
      ja: 'Blueskyのインタラクションパターンをソーシャルグラフとして可視化',
    },
    detail: {
      en: `Analyze your Bluesky interactions to discover your core social circle and network patterns.

**What it shows:**
- Who you interact with most (likes, reposts, replies)
- Mutual connections and relationship strength
- Social graph visualization as an interactive diagram

**How to use:**
1. Open AT Play from the sidebar or navigation
2. Enter any handle to analyze (or use your own)
3. Explore the interactive social graph
4. Share your results to Bluesky`,
      zh: `分析你的 Bluesky 互动，发现你的核心社交圈和网络模式。

**显示内容：**
- 你互动最多的人（点赞、转发、回复）
- 共同关注和关系强度
- 社交图谱可视化为交互式图表

**使用方法：**
1. 从侧边栏或导航打开 AT Play
2. 输入要分析的账号（或使用你自己的）
3. 探索交互式社交图谱
4. 将结果分享到 Bluesky`,
      ja: `Blueskyのインタラクションを分析し、コアソーシャルサークルとネットワークパターンを発見。

**表示内容：**
- 最もインタラクションが多い人（いいね、リポスト、返信）
- 相互接続と関係の強さ
- インタラクティブな図としてのソーシャルグラフ可視化

**使い方：**
1. サイドバーまたはナビゲーションからAT Playを開く
2. 分析するハンドルを入力（または自分のものを使用）
3. インタラクティブなソーシャルグラフを探索
4. 結果をBlueskyに共有`,
    },
    tips: [
      { icon: 'users', en: 'Enter any handle to analyze their social circle', zh: '输入任意账号分析其社交圈', ja: '任意のハンドルでソーシャルサークルを分析' },
      { icon: 'search', en: 'Discover who you interact with most', zh: '发现你互动最多的人', ja: '最もインタラクションが多い人を発見' },
      { icon: 'repeat', en: 'Share your social circle to Bluesky', zh: '将社交圈分享到 Bluesky', ja: 'ソーシャルサークルをBlueskyに共有' },
    ],
  },

  {
    id: 'lists-management',
    category: 'social',
    icon: 'list',
    platforms: ['pwa', 'tui'],
    keywords: ['list', 'mute', 'block', 'curate', 'moderation', 'subscribe', '列表', '屏蔽', '静音', '订阅'],
    related: ['at-play', 'moderation-settings'],
    title: {
      en: 'Lists',
      zh: '列表管理',
      ja: 'リスト管理',
    },
    summary: {
      en: 'Create and manage user lists for curation and moderation',
      zh: '创建和管理用于策展和审核的用户列表',
      ja: 'キュレーションとモデレーション用のユーザーリストを作成・管理',
    },
    detail: {
      en: `Create and manage lists to organize your Bluesky experience.

**Types of lists:**
- **Curated lists** — Organize users for content discovery feeds
- **Moderation lists** — Mute or block multiple users at once

**What you can do:**
- Create, edit, and delete lists
- Add or remove members
- Subscribe to lists from other users
- Use lists as feed sources
- Lists sync across devices`,
      zh: `创建和管理列表，组织你的 Bluesky 体验。

**列表类型：**
- **策展列表** — 组织用户以创建内容发现动态
- **审核列表** — 一次性静音或屏蔽多个用户

**可执行操作：**
- 创建、编辑和删除列表
- 添加或移除成员
- 订阅其他用户的列表
- 将列表用作动态来源
- 列表跨设备同步`,
      ja: `リストを作成・管理してBluesky体験を整理。

**リストの種類：**
- **キュレーションリスト** — コンテンツ発見フィード用にユーザーを整理
- **モデレーションリスト** — 複数のユーザーを一括ミュート/ブロック

**できること：**
- リストの作成、編集、削除
- メンバーの追加・削除
- 他のユーザーのリストをサブスクライブ
- リストをフィードソースとして使用
- リストはクロスデバイスで同期`,
    },
    tips: [
      { icon: 'list', en: 'Create curated or moderation lists', zh: '创建策展或审核列表', ja: 'キュレーションまたはモデレーションリストを作成' },
      { icon: 'shield', en: 'Use moderation lists to mute or block users', zh: '使用审核列表静音或屏蔽用户', ja: 'モデレーションリストでユーザーをミュート/ブロック' },
      { icon: 'users', en: 'Subscribe to lists from other users', zh: '订阅其他用户的列表', ja: '他のユーザーのリストをサブスクライブ' },
    ],
  },

  {
    id: 'drafts',
    category: 'social',
    icon: 'bookmark',
    platforms: ['pwa', 'tui'],
    keywords: ['draft', 'save', 'compose', 'post', 'thread', '草稿', '保存', '发帖', '帖子串'],
    related: ['ai-polish'],
    title: {
      en: 'Drafts',
      zh: '草稿',
      ja: '下書き',
    },
    summary: {
      en: 'Save and manage post drafts for later publishing',
      zh: '保存和管理帖子草稿，稍后发布',
      ja: '投稿の下書きを保存して後で公開',
    },
    detail: {
      en: `Save your work-in-progress posts as drafts to finish later.

**What is saved:**
- Post text content
- Reply-to reference (if replying)
- Quote reference (if quoting)

**What is NOT saved:**
- Attached images or video
- Thread gate settings

**How to use:**
1. Start composing a post
2. Save as draft instead of posting
3. Return later to finish and publish
4. AI polish integrates directly with drafts`,
      zh: `将正在撰写的帖子保存为草稿，稍后完成。

**保存内容：**
- 帖子文本内容
- 回复引用（如果是回复）
- 引用引用（如果是引用）

**不保存内容：**
- 附加的图片或视频
- 帖子门控设置

**使用方法：**
1. 开始撰写帖子
2. 保存为草稿而非直接发布
3. 稍后返回完成并发布
4. AI 润色可直接与草稿集成`,
      ja: `作成中の投稿を下書きとして保存し、後で仕上げます。

**保存される内容：**
- 投稿テキスト
- 返信先参照（返信の場合）
- 引用参照（引用の場合）

**保存されない内容：**
- 添付画像または動画
- スレッドゲート設定

**使い方：**
1. 投稿の作成を開始
2. 投稿せずに下書きとして保存
3. 後に戻って完成・公開
4. AI推敲は下書きと直接統合`,
    },
    tips: [
      { icon: 'bookmark', en: 'Save drafts while composing', zh: '撰写时保存草稿', ja: '作成中に下書きを保存' },
      { icon: 'copy', en: 'Only text and references are saved — images are not persisted', zh: '仅保存文本和引用——图片不会持久化', ja: 'テキストと参照のみ保存——画像は永続化されない' },
      { icon: 'bell', en: 'AI polish works directly with drafts', zh: 'AI 润色可直接与草稿配合使用', ja: 'AI推敲は下書きと直接連携' },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // ADVANCED
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'at-protocol',
    category: 'advanced',
    icon: 'at-sign',
    platforms: ['pwa', 'tui'],
    keywords: ['at-protocol', 'at://', 'pds', 'did', 'repository', 'lexicon', 'nsid', '协议', '分布式'],
    related: ['mcp-server', 'dual-platform'],
    title: {
      en: 'AT Protocol',
      zh: 'AT Protocol',
      ja: 'AT Protocol',
    },
    summary: {
      en: 'The decentralized social networking protocol behind Bluesky',
      zh: 'Bluesky 背后的去中心化社交网络协议',
      ja: 'Blueskyを支える分散型ソーシャルネットワーキングプロトコル',
    },
    detail: {
      en: `AT Protocol is the open, decentralized protocol that powers Bluesky.

**Key concepts:**
- **DID** — Decentralized identifiers for users
- **AT URI** — \`at://did:plc:xxx/app.bsky.feed.post/yyy\` format for addressing content
- **PDS** — Personal Data Servers that store your data
- **Lexicon** — Schema definitions for data types

This client fully supports the AT Protocol specification, including all standard API endpoints and data formats.`,
      zh: `AT Protocol 是驱动 Bluesky 的开放去中心化协议。

**核心概念：**
- **DID** — 用户的去中心化标识符
- **AT URI** — \`at://did:plc:xxx/app.bsky.feed.post/yyy\` 格式的内容寻址
- **PDS** — 存储你数据的个人数据服务器
- **Lexicon** — 数据类型的模式定义

本客户端完全支持 AT Protocol 规范，包括所有标准 API 端点和数据格式。`,
      ja: `AT ProtocolはBlueskyを支えるオープンな分散型プロトコル。

**主要概念：**
- **DID** — ユーザーの分散型識別子
- **AT URI** — \`at://did:plc:xxx/app.bsky.feed.post/yyy\` 形式のコンテンツアドレッシング
- **PDS** — データを保存するパーソナルデータサーバー
- **Lexicon** — データ型のスキーマ定義

このクライアントはAT Protocol仕様を完全にサポートし、すべての標準APIエンドポイントとデータ形式に対応。`,
    },
    tips: [
      { icon: 'at-sign', en: 'AT URIs (at://...) identify all content', zh: 'AT URI (at://...) 标识所有内容', ja: 'AT URI (at://...) がすべてのコンテンツを識別' },
      { icon: 'link', en: 'Links use the AT Protocol addressing scheme', zh: '链接使用 AT Protocol 寻址方案', ja: 'リンクはAT Protocolアドレッシングスキームを使用' },
      { icon: 'globe', en: 'Data is stored on your chosen PDS', zh: '数据存储在你选择的 PDS 上', ja: 'データは選択したPDSに保存' },
    ],
  },

  {
    id: 'mcp-server',
    category: 'advanced',
    icon: 'zap',
    platforms: ['pwa', 'tui'],
    keywords: ['mcp', 'server', 'model-context-protocol', 'tool', 'ai', 'integration', 'npx', '服务', '集成'],
    related: ['at-protocol', 'ai-chat'],
    title: {
      en: 'MCP Server',
      zh: 'MCP 服务器',
      ja: 'MCP サーバー',
    },
    summary: {
      en: 'Model Context Protocol server for AI tool integration',
      zh: '用于 AI 工具集成的 Model Context Protocol 服务器',
      ja: 'AIツール統合のためのModel Context Protocolサーバー',
    },
    detail: {
      en: `The MCP server exposes Bluesky tools to any MCP-compatible AI client, giving AI assistants access to search, profiles, feeds, and more.

**What it provides:**
- 35 tools for reading and writing Bluesky data
- Search posts, view profiles, manage feeds
- Create posts, like, repost, follow
- List management and moderation

**How to use:**
\`\`\`
npx @epheiamoe/bsky-mcp
\`\`\`

Configure this command in your MCP client (Claude Desktop, Cursor, etc.) to give it Bluesky access.`,
      zh: `MCP 服务器将 Bluesky 工具暴露给任何兼容 MCP 的 AI 客户端，让 AI 助手可以访问搜索、资料、动态等。

**提供的功能：**
- 35 个用于读写 Bluesky 数据的工具
- 搜索帖子、查看资料、管理动态
- 创建帖子、点赞、转发、关注
- 列表管理和审核

**使用方法：**
\`\`\`
npx @epheiamoe/bsky-mcp
\`\`\`

在你的 MCP 客户端（Claude Desktop、Cursor 等）中配置此命令，即可赋予其 Bluesky 访问能力。`,
      ja: `MCPサーバーはBlueskyツールをMCP対応のAIクライアントに公開し、AIアシスタントが検索、プロフィール、フィードなどにアクセスできるようにします。

**提供内容：**
- Blueskyデータの読み書き用35ツール
- 投稿検索、プロフィール閲覧、フィード管理
- 投稿作成、いいね、リポスト、フォロー
- リスト管理とモデレーション

**使い方：**
\`\`\`
npx @epheiamoe/bsky-mcp
\`\`\`

MCPクライアント（Claude Desktop、Cursorなど）でこのコマンドを設定して、Blueskyアクセスを付与。`,
    },
    tips: [
      { icon: 'zap', en: 'Run with npx @epheiamoe/bsky-mcp', zh: '使用 npx @epheiamoe/bsky-mcp 运行', ja: 'npx @epheiamoe/bsky-mcp で実行' },
      { icon: 'settings', en: 'Configure in your MCP client settings', zh: '在 MCP 客户端设置中配置', ja: 'MCPクライアント設定で構成' },
      { icon: 'astroid-as-AI-Button', en: 'Works with Claude Desktop, Cursor, and more', zh: '兼容 Claude Desktop、Cursor 等', ja: 'Claude Desktop、Cursorなどに対応' },
    ],
  },

  {
    id: 'dual-platform',
    category: 'advanced',
    icon: 'monitor',
    platforms: ['pwa', 'tui'],
    keywords: ['pwa', 'tui', 'terminal', 'browser', 'platform', 'dual', 'web', 'cli', '终端', '浏览器', '双平台'],
    related: ['at-protocol'],
    title: {
      en: 'Dual Platform',
      zh: '双平台',
      ja: 'デュアルプラットフォーム',
    },
    summary: {
      en: 'Same features available in both browser and terminal',
      zh: '浏览器和终端中提供相同功能',
      ja: 'ブラウザとターミナルの両方で同じ機能を利用可能',
    },
    detail: {
      en: `This client runs as both a PWA (Progressive Web App) in the browser and a TUI (Terminal User Interface) in the terminal.

**PWA (browser):**
- Full visual experience with rich media
- Mouse/touch + keyboard interaction
- Widget panels and sidebar

**TUI (terminal):**
- Keyboard-driven interface
- Lightweight and fast
- Works over SSH

Both share the same core logic and features — your data, settings, and AI sessions work across both platforms.`,
      zh: `本客户端同时以 PWA（渐进式 Web 应用）在浏览器中运行，以及 TUI（终端用户界面）在终端中运行。

**PWA（浏览器）：**
- 完整的视觉体验和富媒体
- 鼠标/触摸 + 键盘交互
- 小部件面板和侧边栏

**TUI（终端）：**
- 键盘驱动界面
- 轻量且快速
- 支持 SSH 连接

两者共享相同的核心逻辑和功能——你的数据、设置和 AI 会话在两个平台间通用。`,
      ja: `このクライアントはブラウザでPWA（Progressive Web App）として、ターミナルでTUI（Terminal User Interface）として動作します。

**PWA（ブラウザ）：**
- リッチメディアのフルビジュアル体験
- マウス/タッチ + キーボードインタラクション
- ウィジェットパネルとサイドバー

**TUI（ターミナル）：**
- キーボード駆動インターフェース
- 軽量で高速
- SSH経由で動作

両方同じコアロジックと機能を共有——データ、設定、AIセッションは両プラットフォーム間で動作。`,
    },
    tips: [
      { icon: 'monitor', en: 'PWA: full visual experience in the browser', zh: 'PWA：浏览器中的完整视觉体验', ja: 'PWA：ブラウザでのフルビジュアル体験' },
      { icon: 'terminal', en: 'TUI: keyboard-driven terminal interface', zh: 'TUI：键盘驱动的终端界面', ja: 'TUI：キーボード駆動ターミナルインターフェース' },
      { icon: 'settings', en: 'Settings sync between platforms', zh: '设置在平台间同步', ja: '設定はプラットフォーム間で同期' },
    ],
  },
];
