import { useState, useCallback } from 'react';
import type { BskyClient } from '@bsky/core';

// ── Pure data types (reusable by AI tools in future) ──

export interface SocialCircleOptions {
  handle: string;
  /** Default 50 */
  maxPosts?: number;
}

export interface InteractorInfo {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  totalWeight: number;
  incomingWeight: number;
  outgoingWeight: number;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  outgoingLikeCount: number;
  outgoingRepostCount: number;
  outgoingReplyCount: number;
  isMutual: boolean;
}

export interface SocialCircleSummary {
  totalInteractions: number;
  uniqueInteractors: number;
  mutualFollows: number;
  coreCircleCount: number;
  extendedCircleCount: number;
  postsAnalyzed: number;
}

export interface SocialCircleResult {
  summary: SocialCircleSummary;
  core: InteractorInfo[];
  extended: InteractorInfo[];
  potential: InteractorInfo[];
  mermaidCode: string;
}

export interface SocialCircleProgress {
  phase: 'identity' | 'posts' | 'interactions' | 'outgoing' | 'graph' | 'done';
  current: number;
  total: number;
}

export interface SocialCircleState {
  status: 'idle' | 'loading' | 'done' | 'error';
  progress: SocialCircleProgress;
  result: SocialCircleResult | null;
  error: string | null;
}

// ── Weight constants (exported for AI tool reuse) ──

export const INTERACTION_WEIGHTS = {
  like: 1.5,
  repost: 2.0,
  reply: 3.0,
} as const;

const CORE_CIRCLE_SIZE = 5;
const EXTENDED_CIRCLE_SIZE = 10;
const MAX_REPLY_RESOLVE = 5;

// ── Pure functions ──

interface RawInteraction {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  likes: number;
  reposts: number;
  replies: number;
  outgoingLikes: number;
  outgoingReposts: number;
  outgoingReplies: number;
}

function aggregateInteractions(
  actors: Map<string, RawInteraction>,
  items: Array<{ did: string; handle: string; displayName?: string; avatar?: string }>,
  type: 'like' | 'repost' | 'reply' | 'outgoingLike' | 'outgoingRepost' | 'outgoingReply',
): void {
  for (const item of items) {
    const existing = actors.get(item.did);
    if (existing) {
      if (type === 'like') existing.likes++;
      else if (type === 'repost') existing.reposts++;
      else if (type === 'reply') existing.replies++;
      else if (type === 'outgoingLike') existing.outgoingLikes++;
      else if (type === 'outgoingRepost') existing.outgoingReposts++;
      else if (type === 'outgoingReply') existing.outgoingReplies++;
    } else {
      actors.set(item.did, {
        did: item.did,
        handle: item.handle,
        displayName: item.displayName,
        avatar: item.avatar,
        likes: type === 'like' ? 1 : 0,
        reposts: type === 'repost' ? 1 : 0,
        replies: type === 'reply' ? 1 : 0,
        outgoingLikes: type === 'outgoingLike' ? 1 : 0,
        outgoingReposts: type === 'outgoingRepost' ? 1 : 0,
        outgoingReplies: type === 'outgoingReply' ? 1 : 0,
      });
    }
  }
}

function computeIncomingWeight(raw: RawInteraction): number {
  return (
    raw.likes * INTERACTION_WEIGHTS.like +
    raw.reposts * INTERACTION_WEIGHTS.repost +
    raw.replies * INTERACTION_WEIGHTS.reply
  );
}

function computeOutgoingWeight(raw: RawInteraction): number {
  return (
    raw.outgoingLikes * INTERACTION_WEIGHTS.like +
    raw.outgoingReposts * INTERACTION_WEIGHTS.repost +
    raw.outgoingReplies * INTERACTION_WEIGHTS.reply
  );
}

function computeWeight(raw: RawInteraction): number {
  return computeIncomingWeight(raw) + computeOutgoingWeight(raw);
}

function toInteractorInfo(raw: RawInteraction, isMutual: boolean): InteractorInfo {
  return {
    did: raw.did,
    handle: raw.handle,
    displayName: raw.displayName,
    avatar: raw.avatar,
    totalWeight: computeWeight(raw),
    incomingWeight: computeIncomingWeight(raw),
    outgoingWeight: computeOutgoingWeight(raw),
    likeCount: raw.likes,
    repostCount: raw.reposts,
    replyCount: raw.replies,
    outgoingLikeCount: raw.outgoingLikes,
    outgoingRepostCount: raw.outgoingReposts,
    outgoingReplyCount: raw.outgoingReplies,
    isMutual,
  };
}

/**
 * Build Mermaid graph code from interactor layers.
 * Pure function — no React dependency. Reusable by AI tools.
 */
export function generateSocialGraphMermaid(
  userHandle: string,
  core: InteractorInfo[],
  extended: InteractorInfo[],
  potential: InteractorInfo[],
): string {
  const lines: string[] = ['graph TD'];
  const safeHandle = userHandle.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`  ${safeHandle}(("@${userHandle}"))`);
  lines.push(`  class ${safeHandle} selfNode;`);

  const allNodes = [...core, ...extended, ...potential];
  const nodeIds = new Map<string, string>();

  for (const info of allNodes) {
    const id = `u${nodeIds.size}`;
    nodeIds.set(info.did, id);
    const label = info.displayName
      ? `"${info.displayName.replace(/"/g, '#quot;')}\\n@${info.handle}"`
      : `"@${info.handle}"`;
    const shape = info.isMutual ? `(${label})` : `[${label}]`;
    const layerClass = core.includes(info) ? 'coreNode' : extended.includes(info) ? 'extNode' : 'potNode';
    lines.push(`  ${id}${shape}`);
    lines.push(`  class ${id} ${layerClass};`);
  }

  // Edges (core only to avoid clutter)
  let maxWeight = 1;
  for (const info of core) {
    if (info.totalWeight > maxWeight) maxWeight = info.totalWeight;
  }
  for (const info of core) {
    const thickness = Math.max(1, Math.round((info.totalWeight / maxWeight) * 4));
    const id = nodeIds.get(info.did)!;
    lines.push(`  ${safeHandle} <-->|"${info.totalWeight.toFixed(0)}"| ${id}`);
  }

  // Styling
  lines.push('');
  lines.push('  classDef selfNode fill:#8b5cf6,stroke:#6d28d9,color:white;');
  lines.push('  classDef coreNode fill:#3b82f6,stroke:#1d4ed8,color:white;');
  lines.push('  classDef extNode fill:#10b981,stroke:#047857,color:white;');
  lines.push('  classDef potNode fill:#f59e0b,stroke:#d97706,color:white;');

  return lines.join('\n');
}

/**
 * Build shareable text for Bluesky post from social circle results.
 * Pure function — reusable by AI tools and UI components.
 */
export function buildSocialCircleShareText(result: SocialCircleResult, locale: string): string {
  const i = (zh: string, en: string, ja: string) => {
    if (locale.startsWith('zh')) return zh;
    if (locale.startsWith('ja')) return ja;
    return en;
  };

  return [
    i('我在 ai-bsky.pages.dev 分析了我的双向社交圈', 'I analyzed my social circle on ai-bsky.pages.dev', 'ai-bsky.pages.dev でソーシャルサークルを分析しました'),
    '',
    i(
      `📊 分析了 ${result.summary.postsAnalyzed} 篇帖文`,
      `📊 Analyzed ${result.summary.postsAnalyzed} posts`,
      `📊 ${result.summary.postsAnalyzed} 件の投稿を分析`,
    ),
    i(
      `👥 发现 ${result.summary.uniqueInteractors} 位互动者，${result.summary.mutualFollows} 位互关`,
      `👥 Found ${result.summary.uniqueInteractors} interactors, ${result.summary.mutualFollows} mutual`,
      `👥 ${result.summary.uniqueInteractors} 人のインタラクター、${result.summary.mutualFollows} 人が相互`,
    ),
    i(
      `💜 核心圈 ${result.summary.coreCircleCount} 人`,
      `💜 Core circle: ${result.summary.coreCircleCount}`,
      `💜 コアサークル: ${result.summary.coreCircleCount} 人`,
    ),
    '',
    i(
      '双向分析：别人对我的赞/转发/回复 + 我对别人的赞',
      'Bidirectional: likes/reposts/replies I received + likes I gave',
      '双方向分析：他者からのいいね/リポスト/返信 + 私からのいいね',
    ),
    '',
    'ai-bsky.pages.dev',
  ].join('\n');
}

// ── Hook ──

export function useSocialCircle(client: BskyClient | null) {
  const [state, setState] = useState<SocialCircleState>({
    status: 'idle',
    progress: { phase: 'identity', current: 0, total: 0 },
    result: null,
    error: null,
  });

  const updateProgress = useCallback((p: Partial<SocialCircleProgress>) => {
    setState(s => ({ ...s, progress: { ...s.progress, ...p } }));
  }, []);

  const analyze = useCallback(async (options: SocialCircleOptions) => {
    if (!client) return;
    const maxPosts = options.maxPosts ?? 50;

    setState(s => ({ ...s, status: 'loading', error: null, result: null }));

    try {
      // ── Phase 1: Identity ──
      updateProgress({ phase: 'identity', current: 0, total: 1 });
      const resolved = await client.resolveHandle(options.handle);
      const actorDid = resolved.did;
      updateProgress({ current: 1 });

      // ── Phase 2: Fetch follows + followers for mutual checking ──
      const [followsRes, followersRes] = await Promise.all([
        client.getFollows(actorDid, 100),
        client.getFollowers(actorDid, 100),
      ]);
      const followingDids = new Set(followsRes.follows.map(f => f.did));
      const followerDids = new Set(followersRes.followers.map(f => f.did));
      const mutualSet = new Set([...followingDids].filter(d => followerDids.has(d)));

      // ── Phase 3: Fetch author feed ──
      updateProgress({ phase: 'posts', current: 0, total: 1 });
      const feedRes = await client.getAuthorFeed(actorDid, maxPosts, undefined, 'posts_no_replies');
      const posts = feedRes.feed.filter(f => !f.reason || (f.reason as { $type?: string }).$type !== 'app.bsky.feed.defs#reasonRepost');
      const actualCount = Math.min(posts.length, maxPosts);
      updateProgress({ current: 1 });

      // ── Phase 4: Fetch incoming interactions (likes + reposts) ──
      const postsToAnalyze = posts.slice(0, actualCount).filter(
        p => (p.post.likeCount ?? 0) > 0 || (p.post.repostCount ?? 0) > 0,
      );
      const totalPosts = postsToAnalyze.length;
      updateProgress({ phase: 'interactions', current: 0, total: totalPosts + (MAX_REPLY_RESOLVE > 0 ? 1 : 0) });

      const actorsMap = new Map<string, RawInteraction>();

      for (let i = 0; i < postsToAnalyze.length; i++) {
        const post = postsToAnalyze[i]!;
        const postUri = post.post.uri;

        try {
          if ((post.post.likeCount ?? 0) > 0) {
            const likes = await client.getLikes(postUri, 100);
            aggregateInteractions(actorsMap,
              likes.likes.map(l => ({ did: l.actor.did, handle: l.actor.handle, displayName: l.actor.displayName, avatar: l.actor.avatar })),
              'like',
            );
          }
        } catch { /* skip */ }

        try {
          if ((post.post.repostCount ?? 0) > 0) {
            const reposts = await client.getRepostedBy(postUri, 100);
            aggregateInteractions(actorsMap,
              reposts.repostedBy.map(r => ({ did: r.did, handle: r.handle, displayName: r.displayName, avatar: r.avatar })),
              'repost',
            );
          }
        } catch { /* skip */ }

        updateProgress({ current: i + 1 });
      }

      // ── Phase 4b: Resolve reply authors (top N by replyCount) ──
      const postsByReplies = [...posts.slice(0, actualCount)]
        .sort((a, b) => (b.post.replyCount ?? 0) - (a.post.replyCount ?? 0))
        .filter(p => (p.post.replyCount ?? 0) > 0)
        .slice(0, MAX_REPLY_RESOLVE);

      if (postsByReplies.length > 0) {
        updateProgress({ current: totalPosts + 1, total: totalPosts + 1 });
        const threadCalls = postsByReplies.map(p =>
          client.getPostThread(p.post.uri, 1).catch(() => null)
        );
        const threads = await Promise.all(threadCalls);
        for (const threadRes of threads) {
          if (!threadRes) continue;
          const thread = threadRes.thread as any;
          if (!thread || thread.$type === 'app.bsky.feed.defs#notFoundPost') continue;
          const replies: any[] = thread.replies || [];
          for (const reply of replies) {
            if (reply.$type === 'app.bsky.feed.defs#notFoundPost') continue;
            const author = reply.post?.author;
            if (author) {
              aggregateInteractions(actorsMap,
                [{ did: author.did, handle: author.handle, displayName: author.displayName, avatar: author.avatar }],
                'reply',
              );
            }
          }
        }
      }

      // ── Phase 5: Fetch outgoing likes ──
      updateProgress({ phase: 'outgoing', current: 0, total: 1 });
      try {
        const actorLikes = await client.getActorLikes(actorDid, 50);
        for (const item of (actorLikes.feed || [])) {
          const author = item.post.author;
          aggregateInteractions(actorsMap,
            [{ did: author.did, handle: author.handle, displayName: author.displayName, avatar: author.avatar }],
            'outgoingLike',
          );
        }
      } catch { /* skip outgoing likes */ }
      updateProgress({ current: 1 });

      // ── Phase 6: Build graph & classify layers ──
      updateProgress({ phase: 'graph', current: 0, total: actorsMap.size });

      const allInteractors: InteractorInfo[] = [];
      const sortedRaw = [...actorsMap.entries()]
        .sort((a, b) => computeWeight(b[1]) - computeWeight(a[1]));

      const topDids = sortedRaw.slice(0, 30).map(([did]) => did);
      const relationshipMap = new Map<string, boolean>();

      try {
        if (topDids.length > 0) {
          const relRes = await client.getRelationships(actorDid, topDids);
          for (const rel of relRes.relationships) {
            relationshipMap.set(rel.did, !!(rel.following && rel.followedBy));
          }
        }
      } catch { /* skip */ }

      for (const [, raw] of sortedRaw) {
        const isMutual = relationshipMap.get(raw.did) ?? mutualSet.has(raw.did);
        allInteractors.push(toInteractorInfo(raw, isMutual));
      }

      const sorted = [...allInteractors].sort((a, b) => b.totalWeight - a.totalWeight);
      const core = sorted.slice(0, CORE_CIRCLE_SIZE);
      const extended = sorted.slice(CORE_CIRCLE_SIZE, CORE_CIRCLE_SIZE + EXTENDED_CIRCLE_SIZE);
      const potential = sorted
        .filter(info => !core.includes(info) && !extended.includes(info) && info.isMutual && info.totalWeight > 0)
        .slice(0, 5);

      const userProfile = await client.getProfile(actorDid).catch(() => null);
      const userHandle = userProfile?.handle ?? options.handle;

      const mermaidCode = generateSocialGraphMermaid(userHandle, core, extended, potential);

      const totalInteractions = allInteractors.reduce(
        (sum, i) => sum + i.likeCount + i.repostCount + i.replyCount + i.outgoingLikeCount + i.outgoingRepostCount + i.outgoingReplyCount,
        0,
      );

      const result: SocialCircleResult = {
        summary: {
          totalInteractions,
          uniqueInteractors: allInteractors.length,
          mutualFollows: allInteractors.filter(i => i.isMutual).length,
          coreCircleCount: core.length,
          extendedCircleCount: extended.length,
          postsAnalyzed: actualCount,
        },
        core,
        extended,
        potential,
        mermaidCode,
      };

      updateProgress({ phase: 'done', current: actorsMap.size, total: actorsMap.size });
      setState(s => ({ ...s, status: 'done', result, progress: { phase: 'done', current: actorsMap.size, total: actorsMap.size } }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, status: 'error', error: message }));
    }
  }, [client, updateProgress]);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      progress: { phase: 'identity', current: 0, total: 0 },
      result: null,
      error: null,
    });
  }, []);

  return { state, analyze, reset };
}
