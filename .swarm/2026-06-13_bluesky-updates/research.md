---
step: 1
agent: researcher
task: Research recent Bluesky & AT Protocol updates since ~May 2026
upstream: []
produced_at: 2026-06-13T06:39:00Z
status: completed
confidence: high
---

## 调研摘要

Bluesky 在 2026 年上半年发布了大量新功能：草稿（Drafts）、多账户支持、照片轮播（Photo Carousels）与高质量图片、Germ 端到端加密私信集成、长文内容（Long-form Content）、Live Now 直播标签扩展。AT Protocol 层面：新增 `app.bsky.embed.gallery` 词表、外部嵌入富元数据、Chat 词表频繁更新、IETF ATP 工作组正式获批、Permissioned Data 架构设计推进中。社交应用已迭代至 v1.124.0（2026-06-10）。

## 详细发现

### 1. 已发布的新功能（按时间线）

#### 2026 年 1 月
- **Live Now 直播标签** — 用户在 Twitch/Streamplace 直播时，Bluesky 头像自动显示 LIVE 徽章，点击跳转直播。
  - 来源：[Bluesky 2026 Predictions Blog](https://bsky.social/about/blog/01-28-2026-bluesky-2026-predictions)
- **Cashtags** — 类似 `$BTC` 的金融标签支持。
  - 来源：[SocialBee tracker](https://socialbee.com/blog/bluesky-news/)（引用 Threads 帖子）

#### 2026 年 2 月
- **草稿（Drafts）** — 用户可保存帖子草稿，延迟发送。这是长期被请求的功能。
  - 来源：[TechCrunch](https://techcrunch.com/2026/02/09/bluesky-finally-adds-drafts/), [Mashable](https://mashable.com/article/bluesky-drafts-update)
- **Germ 端到端加密私信（Beta）** — Germ Network 发布首个基于 AT Protocol 的 E2E 加密私信应用，可从 Bluesky 个人资料直接启动。
  - 来源：[TechCrunch](https://techcrunch.com/2026/02/18/a-startup-called-germ-becomes-the-first-private-messenger-that-launches-directly-from-blueskys-app/), [Germ Blog](https://www.germnetwork.com/blog/germ-dm-for-at-protocol-is-live)

#### 2026 年 3 月
- **Jay Graber 辞任 CEO**，转任 CIO（Chief Innovation Officer）；Toni Schneider 任临时 CEO。
  - 来源：[Bluesky Blog](https://bsky.social/about/blog/03-09-2026-a-new-chapter-for-bluesky)
- **$100M Series B 融资公布**（2025 年完成，由 Bain Capital Crypto 领投）
  - 来源：[Bluesky Blog](https://bsky.social/about/blog/03-19-2026-series-b)
- **Attie AI 工具** — Bluesky 推出 AI 助手 Attie，允许用户设计自定义算法和创建定制 Feed。引发争议，成为仅次于 J.D. Vance 的被封锁最多的账户。
  - 来源：[TechCrunch](https://techcrunch.com/2026/03/30/blueskys-new-ai-tool-attie-is-already-the-most-blocked-account-other-than-j-d-vance/)

#### 2026 年 4 月
- **高质量图片 + 照片轮播（初版）** — 文件大小上限翻倍至 2MB，分辨率上限提升至 4000×4000，引入照片轮播。v1.121.0。
  - 来源：[The Verge](https://www.theverge.com/tech/917211/bluesky-posts-can-now-have-higher-quality-images), [Bluesky 官方帖](https://bsky.app/profile/bsky.app/post/3mk4lzkrnk22d)
- **DDoS 攻击导致服务中断**（4 月 15-20 日），四次官方更新通报。
  - 来源：[Bluesky Blog](https://bsky.social/about/blog/04-16-2026-bluesky-service-interruption)

#### 2026 年 5 月
- **Germ E2E 加密私信正式集成** — 从 Bluesky 个人资料页可直接启动 Germ DM。
  - 来源：[SocialBee tracker](https://socialbee.com/blog/bluesky-news/)
- **WhatsApp 视频预览** — Bluesky 链接在 WhatsApp 中分享时显示视频预览。
  - 来源：[Threads 帖子](https://www.threads.com/@oncescuradu/post/DYFIPzcDNkc)
- **长文内容（Long-form Content）** — 集成 Standard.site，在 Bluesky 应用内支持博客/Newsletter 内容阅读。对标 X Articles。
  - 来源：[TechCrunch](https://techcrunch.com/2026/05/28/bluesky-embraces-long-form-content-to-counter-x-articles/)
- **多账户支持** — 用户可在 Bluesky 中添加和切换多个账户。
  - 来源：[SocialBee tracker](https://socialbee.com/blog/bluesky-news/), [Threads 帖子](https://www.threads.com/@theahmedghanem/post/DY6y-gTDuZ1)

#### 2026 年 6 月
- **照片轮播最终版** — v1.123.0（6 月 6 日）：5 张及以上图片以轮播形式并排显示，支持滑动切换，显示 "1/6" 等计数器。4 张及以下沿用列表布局。
  - 来源：[GIGAZINE](https://gigazine.net/gsc_news/en/20260610-bluesky-photo-carousel/)
- **Live Now 扩展** — 新增支持 Beehiiv、Substack、YouTube。
  - 来源：[SocialBee tracker](https://socialbee.com/blog/bluesky-news/)
- **社交应用 v1.124.0**（6 月 10 日）— 最新版本，多项修复和优化。
  - 来源：[GitHub Releases](https://github.com/bluesky-social/social-app/releases/tag/1.124.0)

---

### 2. AT Protocol 变更

#### 新词表（Lexicons）
| 词表 | 变更 | 来源 |
|------|------|------|
| `app.bsky.embed.gallery` | **新增** — 画廊嵌入类型，支持 5+ 图片轮播 | [@atproto/api v0.20.9](https://github.com/bluesky-social/atproto/blob/main/packages/api/CHANGELOG.md) |
| `app.bsky.embed.external#viewExternal` | **增强** — 添加富元数据字段（标题、描述、缩略图） | [@atproto/api v0.20.2](https://github.com/bluesky-social/atproto/blob/main/packages/api/CHANGELOG.md) |
| `app.bsky.embed.getEmbedExternalView` | **新增** — 查询外部嵌入视图的方法 | [@atproto/api v0.20.2](https://github.com/bluesky-social/atproto/blob/main/packages/api/CHANGELOG.md) |
| `app.bsky.embed.external` record | **变更** — `associatedRecords` → `associatedRefs` | [@atproto/api v0.20.2](https://github.com/bluesky-social/atproto/blob/main/packages/api/CHANGELOG.md) |
| Chat lexicons | **频繁更新** — v0.20.1 至 v0.20.14 均有 chat 词表更新 | [@atproto/api CHANGELOG](https://github.com/bluesky-social/atproto/blob/main/packages/api/CHANGELOG.md) |
| Ozone 审查 | **扩展** — 支持 `conversation` 作为报告主体类型 | [@atproto/api v0.20.7](https://github.com/bluesky-social/atproto/blob/main/packages/api/CHANGELOG.md) |

#### 破坏性变更
- **@atproto/api v0.20.0** — **BREAKING**: 不再支持 Node.js 18 和 20。最低要求 Node.js 22。Docker 镜像使用 Node.js 24。
  - 来源：[CHANGELOG](https://github.com/bluesky-social/atproto/blob/main/packages/api/CHANGELOG.md)
- **标签行为回滚** — v0.19.13 引入的账户级标签行为变更在 v0.20.8 回滚。
  - 来源：[@atproto/api v0.20.8](https://github.com/bluesky-social/atproto/blob/main/packages/api/CHANGELOG.md)

#### PDS 更新（@atproto/pds@0.5.4，2026-06-12）
- 提高 `com.atproto.sync.getRepo` 速率限制规则
- 使账户创建和删除更具韧性

#### 协议基础设施
- **Sync 1.1** — `tap` 参考实现发布（2025 年 12 月），`bsky.network` relay 升级（2026 年 1 月）
- **Lexicon 工具** — 新 `lex` CLI 工具用于词表解析和类型生成；`goat` CLI 新增词表操作功能
- **OAuth 完善** — 权限和权限集发布，SDK 支持大幅改进
- **PLC 副本** — WebSocket 支持的实时更新，参考实现发布（2026 年 2 月）
- **IETF ATP 工作组** — 2026 年 3 月下旬正式获批，将在 IETF 125 Vienna（2026 年 7 月）参会
  - 来源：[IETF Datatracker](https://datatracker.ietf.org/wg/atp/about/), [AT Protocol Spring 2026 Roadmap](https://atproto.com/blog/2026-spring-roadmap)
- **独立 PLC 组织** — 正在组建中，AtmosphereConf 上分享进展

---

### 3. 即将推出 / 预览功能

| 功能 | 状态 | 预计时间 | 来源 |
|------|------|----------|------|
| **Live Event Feeds** | 计划中 — 为体育赛事、选举等创建专用 Feed | 2026 年内 | [Roadmap](https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky) |
| **Topic Tags** | 计划中 — 帮助用户按兴趣发现帖子和组织内容 | 2026 年内 | [Roadmap](https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky) |
| **更长视频** | 计划中 — 当前限制 3 分钟，明确表示"不够" | 2026 年内 | [Roadmap](https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky) |
| **更快视频上传** | 计划中 — 改进媒体处理管线 | 时间未定 | [Roadmap](https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky) |
| **Permissioned Data** | 设计阶段 — 非公开数据的访问控制，多个团队并行实现 | 2026 年夏季 | [AT Protocol Spring Roadmap](https://atproto.com/blog/2026-spring-roadmap) |
| **PDS 账户管理** | 计划中 — 修改邮箱/密码、停用/删除账户、数据导出 | 时间未定 | [AT Protocol Spring Roadmap](https://atproto.com/blog/2026-spring-roadmap) |
| **2FA 扩展** | 计划中 — 除邮箱外的新 2FA 方法 | 时间未定 | [AT Protocol Spring Roadmap](https://atproto.com/blog/2026-spring-roadmap) |
| **协议测试套件** | 原型阶段 — 跨实现互操作测试 | 时间未定 | [AT Protocol Spring Roadmap](https://atproto.com/blog/2026-spring-roadmap) |
| **IETF 标准化** | 进行中 — ATP WG 活跃，首个 draft 已采纳 | IETF 125 (Jul 2026) | [IETF Datatracker](https://datatracker.ietf.org/wg/atp/about/) |
| **线程创建改进** | 计划中 — 更容易创建推文串 | 2026 年内 | [Roadmap](https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky) |
| **Discover Feed 改进** | 进行中 — 专门团队优化推荐质量 | 持续 | [Roadmap](https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky) |

---

### 4. 对我们客户端的相关性评估

| 功能/变更 | 相关性 | 原因 | 建议行动 |
|-----------|--------|------|----------|
| **照片轮播 (embed.gallery)** | **高** | 新嵌入类型，客户端必须支持渲染和创建。已成为官方应用 v1.123 核心功能。 | 立即实现 `app.bsky.embed.gallery` 的渲染和发布支持 |
| **外部嵌入富元数据** | **高** | `viewExternal` 新增标题/描述/缩略图字段，可大幅改善链接卡片渲染。 | 在 PWA/TUI 的链接嵌入卡片中使用新字段 |
| **Chat 词表频繁更新** | **高** | 如果客户端有私信功能，必须跟进 chat 词表变更。 | 更新 `@atproto/api` 至 0.20.14+，检查 DM 代码 |
| **草稿（Drafts）** | **中** | 官方已实现，我们的客户端也应支持。这是基本 UX 期望。 | PWA/TUI 添加草稿保存/恢复功能 |
| **多账户支持** | **中** | 官方已实现，用户期望所有客户端都支持。 | 添加多账户登录/切换功能 |
| **长文内容** | **中** | 官方集成 Standard.site，但这是通过外部嵌入实现的。客户端只需正确渲染外部链接即可。 | 确保外部链接渲染正确，考虑特殊处理 Standard.site/Substack/Ghost 链接 |
| **Live Now 标签** | **低-中** | 这是 Bluesky 专有功能，基于自定义词表。第三方客户端可实现但需理解其词表。 | 调研 `app.bsky.feed.live` 或类似词表 |
| **Germ E2E 加密私信** | **低** | 这是独立 Atmosphere 应用，通过 AT Protocol 集成。我们的客户端不需要实现 Germ，但可考虑深链接集成。[推测] | 了解 Germ 集成机制，评估是否添加"通过 Germ 私信"按钮 |
| **@atproto/api v0.20.0 破坏性变更** | **高** | Node.js 18/20 不再支持。 | 确保 CI 和生产环境使用 Node.js 22+ |
| **Node.js 24 Docker** | **中** | 官方 Docker 镜像已迁移至 Node.js 24。 | 评估我们的 Docker 镜像是否应跟进 Node.js 24 |
| **IETF 标准化** | **低（短期）** | 标准化工作正在进行，但近期不影响客户端实现。长期看可能影响协议细节。 | 关注 IETF ATP WG 进展 |
| **Permissioned Data** | **中（长期）** | 将引入非公开数据的协议支持。可能影响私信、私密帖子等功能的架构。 | 关注设计提案和实验实现，为未来适配做准备 |
| **更长视频** | **低（当前）** | 官方计划增加视频时长上限。客户端只需支持播放即可，上传限制由 PDS 控制。 | 确保视频播放器支持更长时长 |
| **Ozone 对话报告** | **低** | 仅影响审查工具，终端用户客户端无直接影响。 | 无行动 |

---

### 5. 技术选型与变更总结

#### 必须立即跟进（Breaking / High Impact）
1. **升级 `@atproto/api`** 到 0.20.14+（当前最新），以获取新的 `embed.gallery` 词表和富元数据
2. **升级 Node.js 到 22+**（v0.20.0 破坏性变更）
3. **实现 `app.bsky.embed.gallery` 渲染** — 这是官方 v1.123 的核心新功能，用户期望所有客户端都支持
4. **更新外部链接卡片渲染** — 使用 `viewExternal` 的新富元数据字段
5. **检查 Chat/DM 代码** — chat 词表频繁更新，确保兼容

#### 建议跟进（UX Enhancement）
6. 实现帖子草稿功能
7. 实现多账户支持
8. 优化图片上传（利用新的 2MB/4000×4000 限制）
9. 改进嵌入提取（利用 `getEmbedExternalView` 查询方法）

#### 可暂缓（Nice to Have）
10. Live Now 集成
11. Germ 私信深链接
12. 长文内容特殊处理

---

### 6. 风险与注意事项

- **DDoS 防护** — Bluesky 在 2026 年 4 月遭遇严重 DDoS 攻击，服务多次中断。我们的客户端应实现优雅的错误处理和重试逻辑。
- **CEO 变更** — Jay Graber 转任 CIO、Toni Schneider 任临时 CEO。产品方向可能微调但核心策略（开放协议、实时事件、生态系统）不变。[推测]
- **IETF 标准化** — AT Protocol 正在标准化过程中。某些协议细节可能在 IETF 流程中变更。建议保持 SDK 版本更新以获取最新变更。
- **Permissioned Data** — 这是 AT Protocol 最大的架构扩展，预计 2026 年夏季有重大进展。如果我们的客户端有私信或私密内容功能，应密切关注。
- **标签行为变更** — v0.19.13 的账户级标签行为变更已被回滚（v0.20.8），说明标签系统仍在调整中。客户端应测试标签过滤逻辑。
- **信息时效性** — 本报告基于 2026-06-13 可获取的公开信息。GIGAZINE、SocialBee 等第三方来源可能不完整，建议交叉验证官方发布说明。

---

### 7. 信息来源完整列表

| 来源 | URL | 类型 |
|------|-----|------|
| Bluesky 官方博客 | https://bsky.social/about/blog | 一手 |
| Bluesky 2026 Roadmap | https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky | 一手 |
| Bluesky 2026 Predictions | https://bsky.social/about/blog/01-28-2026-bluesky-2026-predictions | 一手 |
| AT Protocol Spring Roadmap | https://atproto.com/blog/2026-spring-roadmap | 一手 |
| @atproto/api CHANGELOG | https://github.com/bluesky-social/atproto/blob/main/packages/api/CHANGELOG.md | 一手 |
| atproto GitHub Releases | https://github.com/bluesky-social/atproto/releases | 一手 |
| social-app GitHub Releases | https://github.com/bluesky-social/social-app/releases | 一手 |
| IETF ATP WG | https://datatracker.ietf.org/wg/atp/about/ | 一手 |
| SocialBee Bluesky News (Jun 5) | https://socialbee.com/blog/bluesky-news/ | 二手（聚合） |
| TechCrunch Roadmap 报道 | https://techcrunch.com/2026/01/27/bluesky-teases-2026-roadmap-a-better-discover-feed-real-time-features-and-more/ | 二手 |
| TechCrunch Drafts 报道 | https://techcrunch.com/2026/02/09/bluesky-finally-adds-drafts/ | 二手 |
| TechCrunch Germ 报道 | https://techcrunch.com/2026/02/18/a-startup-called-germ-becomes-the-first-private-messenger-that-launches-directly-from-blueskys-app/ | 二手 |
| TechCrunch Long-form 报道 | https://techcrunch.com/2026/05/28/bluesky-embraces-long-form-content-to-counter-x-articles/ | 二手 |
| TechCrunch Attie AI 报道 | https://techcrunch.com/2026/03/30/blueskys-new-ai-tool-attie-is-already-the-most-blocked-account-other-than-j-d-vance/ | 二手 |
| The Verge 高质量图片 | https://www.theverge.com/tech/917211/bluesky-posts-can-now-have-higher-quality-images | 二手 |
| GIGAZINE 照片轮播 | https://gigazine.net/gsc_news/en/20260610-bluesky-photo-carousel/ | 二手 |
| Germ Network Blog | https://www.germnetwork.com/blog/germ-dm-for-at-protocol-is-live | 一手 |
| Stratcom 路线图分析 | https://stratcom.training/2026/02/05/blueskys-2026-roadmap-new-feed-tools-real-time-curation-and-app-fixes/ | 二手 |
| ContentGrip 路线图分析 | https://www.contentgrip.com/bluesky-2026-roadmap/ | 二手 |

---

## 推荐结论

**优先级最高的行动项：**
1. 升级 `@atproto/api` 到最新版本（0.20.14+）并适配 Node.js 22+
2. 实现 `app.bsky.embed.gallery`（照片轮播）的渲染和发布 — 这是官方最新核心功能
3. 利用 `viewExternal` 的富元数据改善链接卡片渲染
4. 验证 Chat/DM 功能与最新 chat 词表的兼容性

**次要优先级：**
5. 添加草稿功能（用户强需求，官方已实现）
6. 添加多账户支持

**持续关注：**
- Permissioned Data 架构进展（将影响私信和私密内容的设计）
- IETF ATP WG 标准化进程
- 视频时长限制是否放开（当前 3 分钟）

**置信度说明：** 主要来源（官方博客、GitHub Releases/CHANGELOG、IETF Datatracker）为高置信度一手信息。SocialBee、TechCrunch 等第三方聚合来源为中等置信度，已与一手来源交叉验证。
