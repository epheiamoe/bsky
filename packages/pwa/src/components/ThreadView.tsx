import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useThread, useBookmarks, useTranslation, useI18n, setFocusedProfileActor, useModerationBatch, usePostModeration, isBskyAppUrl } from '@bsky/app';
import type { AppView } from '@bsky/app';
import { LabelerFailureBanner } from './LabelerFailureBanner.js';
import { LabelerFailureToast } from './LabelerFailureToast.js';
import type { BskyClient, AIConfig, PostView, ThreadgateRule, ModerationDecision } from '@bsky/core';
import { describeImage } from '@bsky/core';
import { PostPreviewCard } from './PostPreviewCard.js';
import { PostActionsRow } from './PostActionsRow.js';
import { Icon } from './Icon.js';
import { ReportButton } from './ReportButton.js';
import { truncateName, linkifyText } from './PostPreviewCard.js';
import { ImageGrid } from './ImageGrid.js';
import { VideoCard } from './VideoCard.js';
import { HiddenBanner } from './HiddenBanner.js';
import { ModerationLabelBar } from './ModerationLabelBar.js';
import { BskyLinkCard } from './BskyLinkCard.js';
import { formatTime, getPostUrl } from '../utils/format.js';
import { getThreadgateDisplayKey } from '@bsky/app';
import { useModerationConfig } from '../hooks/useModerationConfig.js';
import { Modal } from './Modal.js';
import { ThreadgateEditor } from './ThreadgateEditor.js';
import { NotFoundCard } from './NotFoundCard.js';
import { LabelDetailModal } from './LabelDetailModal.js';
import { ThreadgateDetailModal } from './ThreadgateDetailModal.js';

interface ThreadViewProps {
  client: BskyClient;
  uri: string;
  goBack: () => void;
  goTo: (v: AppView) => void;
  aiConfig: AIConfig;
  targetLang: string;
  translateMode: 'simple' | 'json';
  translateConfig?: AIConfig;
  imageDescConfig?: AIConfig;
  imageDescLang?: string;
  singleImageFill?: boolean;
  threadPreviewLines?: number;
  quotedPostPreviewLines?: number;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function ThreadView({ client, uri, goBack, goTo, aiConfig, targetLang, translateMode, translateConfig, imageDescConfig, imageDescLang, singleImageFill, threadPreviewLines = 8, quotedPostPreviewLines = 8 }: ThreadViewProps) {
  const {
    flatLines,
    loading,
    error,
    focused,
    threadgate,
    likePost,
    repostPost,
    isLiked,
    isReposted,
    expandReplies,
    getPostView,
  } = useThread(client, uri);
  const { t } = useI18n();
  const { config } = useModerationConfig();
  const { decisions, failedLabelers } = useModerationBatch(flatLines, config, client);
  const [showInfo, setShowInfo] = useState(false);
  const [showThreadgateEditor, setShowThreadgateEditor] = useState(false);
  const [showThreadgateDetail, setShowThreadgateDetail] = useState(false);

  const { isBookmarked, toggleBookmark } = useBookmarks(client);
  const { translate, loading: translating } = useTranslation(
    translateConfig?.apiKey || aiConfig.apiKey,
    translateConfig?.baseUrl || aiConfig.baseUrl,
    translateConfig?.model || aiConfig.model,
    targetLang as 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es',
    translateMode,
  );

  const [translationResult, setTranslationResult] = useState<{ translated: string; sourceLang?: string } | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followUri, setFollowUri] = useState<string | undefined>();
  const [focusedContentRevealed, setFocusedContentRevealed] = useState(false);
  const [focusedMediaRevealed, setFocusedMediaRevealed] = useState(false);
  const [showFocusedBadgeModal, setShowFocusedBadgeModal] = useState(false);
  const [showFocusedWarnModal, setShowFocusedWarnModal] = useState(false);

  // Clear translation when focused post changes
  useEffect(() => {
    setTranslationResult(null);
  }, [focused?.uri]);

  // Fetch follow status when focused post changes
  useEffect(() => {
    if (!client || !focused?.handle) { setIsFollowing(false); setFocusedProfileActor(null); return; }
    setFocusedProfileActor(focused.handle);
    client.getProfile(focused.handle).then(p => {
      setIsFollowing(!!p.viewer?.following);
      setFollowUri(p.viewer?.following);
    }).catch(() => { setIsFollowing(false); });
  }, [client, focused?.handle]);

  const handleFollow = useCallback(() => {
    if (!client || !focused) return;
    if (isFollowing && followUri) {
      client.unfollow(followUri).then(() => { setIsFollowing(false); setFollowUri(undefined); }).catch(() => {});
    } else {
      client.getProfile(focused.handle).then(p => { client.follow(p.did).then(r => { setIsFollowing(true); setFollowUri(r.uri); }).catch(() => {}); }).catch(() => {});
    }
  }, [client, focused, isFollowing, followUri]);

  const hasText = (focused?.text?.trim().length ?? 0) > 0;

  const handleTranslate = useCallback(async () => {
    if (!focused || translating || !hasText) return;
    if (translationResult) { setTranslationResult(null); return; }
    try {
      const result = await translate(
        focused.text,
        targetLang as 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es',
      );
      setTranslationResult(result);
    } catch { /* ignore */ }
  }, [focused, translating, translationResult, translate, targetLang]);

  const { parentLines, replyLines } = useMemo(() => {
    const parents: typeof flatLines = [];
    const replies: typeof flatLines = [];
    const maxDepth = (focused?.depth ?? 0) + 1;

    for (const line of flatLines) {
      if (line.depth < 0) parents.push(line);
      else if (line.depth > 0 && line.depth <= maxDepth && line.uri !== focused?.uri) replies.push(line);
    }

    parents.sort((a, b) => a.depth - b.depth);
    replies.sort(
      (a, b) =>
        new Date(a.indexedAt).getTime() - new Date(b.indexedAt).getTime(),
    );

    return { parentLines: parents, replyLines: replies };
  }, [flatLines]);

  const isTheme = focused?.isRoot && focused?.depth === 0;
  const focusedTitle = isTheme ? t('thread.rootPost') : t('thread.currentPost');
  const { decision: focusedModeration } = usePostModeration(
    focused ? { uri: focused.uri, labels: (focused as any).labels, record: (focused as any).record } : null,
    config,
    client
  );
  const showFocusedContentHidden = focusedModeration.contentAction === 'hide' && !focusedContentRevealed;
  const isFocusedContentBlurred = focusedModeration.contentAction === 'warn' && !focusedContentRevealed;
  const isFocusedMediaBlurred = focusedModeration.mediaAction === 'blur' && !focusedMediaRevealed;

  if (loading) return <Spinner />;

  const bannerFailures = failedLabelers.filter(f => f.behavior === 'banner' || f.behavior === 'block');

  return (
    <div className="min-h-[100dvh] bg-background animate-fadeIn">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-border">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">{t('nav.back')}</span>
          </button>
          <h1 className="text-lg font-semibold text-text-primary">{t('thread.title')}</h1>
        </div>
      </header>
      <LabelerFailureBanner failedLabelers={bannerFailures} />
      <LabelerFailureToast failedLabelers={failedLabelers} />

      <div className="max-w-content mx-auto py-6 space-y-2">
        {/* ── 讨论源 (parent chain) ── */}
        {parentLines.length > 0 && (
          <section className="px-4 space-y-1">
            <p className="text-xs text-text-secondary font-medium pl-4">── {t('thread.discussionSource')} ──</p>
            {parentLines.map((line) => (
              <div key={line.uri || line.rkey}>
                <div
                  onClick={() => goTo({ type: 'thread', uri: line.uri })}
                  className="mx-2 px-3 py-2 rounded-xl border border-border bg-surface/20 opacity-60 hover:opacity-100 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-text-primary">
                      {truncateName(line.displayName)}
                    </span>
                    <span className="text-xs text-text-secondary">
                      @{line.handle}
                    </span>
                    <span className="text-xs text-text-secondary">·</span>
                    <span className="text-xs text-text-secondary">
                      {formatTime(line.indexedAt)}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap" style={{ WebkitLineClamp: threadPreviewLines }}>
                    {line.text}
                  </p>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── 主题帖 / 当前帖子 ── */}
        {focused && (
          <article className="mx-2 px-4 py-3 rounded-xl border border-border bg-surface/30 overflow-hidden">
            <p className="text-xs text-text-secondary font-medium mb-2">── {focusedTitle} ──</p>
            {showFocusedContentHidden ? (
              <HiddenBanner
                decision={focusedModeration!}
                onShow={() => setFocusedContentRevealed(true)}
              />
            ) : (
              <>
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-full bg-primary flex-shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity mt-0.5"
                    onClick={(e) => { e.stopPropagation(); goTo({ type: 'profile', actor: focused.handle }); }}
                  >
                    {focused.authorAvatar ? (
                      <img src={focused.authorAvatar} alt={focused.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-white font-bold text-sm">
                        {focused.displayName?.charAt(0) || '?'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-text-primary truncate">
                        {truncateName(focused.displayName)}
                      </span>
                      <button
                        onClick={handleFollow}
                        className={`ml-auto text-xs px-3 py-1 rounded-full font-medium transition-colors shrink-0 ${
                          isFollowing
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100'
                            : 'bg-primary text-white hover:bg-primary-hover'
                        }`}
                      >
                        {isFollowing ? t('profile.unfollow') : t('profile.follow')}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                      <span>@{focused.handle}</span>
                      <span>·</span>
                      <span>{formatTime(focused.indexedAt)}</span>
                    </div>
                    {/* Badge row for focused post */}
                    {focusedModeration && focusedModeration.contentAction === 'none' && focusedModeration.badges.length > 0 && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowFocusedBadgeModal(true); }}
                          className="flex items-center gap-1 mt-1 max-w-full overflow-hidden"
                        >
                          <div className="flex items-center gap-1 overflow-hidden">
                            {focusedModeration.sources.map((source: ModerationDecision['sources'][number]) =>
                              source.labels.map((label: ModerationDecision['sources'][number]['labels'][number]) => (
                                <span
                                  key={`${source.labelerDid}-${label.val}`}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shrink-0 whitespace-nowrap"
                                >
                                  @{source.labelerName || source.labelerDid}/{label.name || label.val}
                                </span>
                              ))
                            )}
                          </div>
                        </button>
                        {showFocusedBadgeModal && (
                          <LabelDetailModal sources={focusedModeration.sources} onClose={() => setShowFocusedBadgeModal(false)} />
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Content-level moderation banner — between header and content */}
                {focusedModeration.contentAction === 'warn' && (
                  <ModerationLabelBar
                    decision={focusedModeration}
                    isRevealed={focusedContentRevealed}
                    onToggle={() => setFocusedContentRevealed(!focusedContentRevealed)}
                  />
                )}

                <div className={`${isFocusedContentBlurred ? 'blur-2xl brightness-50 transition-all duration-300 pointer-events-none select-none' : ''}`}>
                  <p className="text-lg text-text-primary leading-relaxed whitespace-pre-wrap break-words">
                    {linkifyText(focused.text)}
                  </p>
                  {focused.quotedPost && (
                    <div
                      className="mt-3 border border-border rounded-xl p-3 bg-surface hover:bg-surface/80 hover:border-primary/30 transition-colors cursor-pointer"
                      onClick={() => goTo({ type: 'thread', uri: focused.quotedPost!.uri })}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {focused.quotedPost.authorAvatar && (
                          <img src={focused.quotedPost.authorAvatar} className="w-4 h-4 rounded-full" alt="" />
                        )}
                        <span className="text-xs font-semibold text-text-primary">{focused.quotedPost.displayName}</span>
                        <span className="text-xs text-text-secondary">@{focused.quotedPost.handle}</span>
                      </div>
                      <p className="text-sm text-text-primary break-words" style={{ WebkitLineClamp: quotedPostPreviewLines }}>{linkifyText(focused.quotedPost.text)}</p>
                      {focused.quotedPost.imageDetails && focused.quotedPost.imageDetails.length > 0 && (
                        <div className="mt-1 flex gap-1">
                          {focused.quotedPost.imageDetails.slice(0, 2).map((d: { url: string; alt: string }, idx: number) => (
                            <img key={idx} src={d.url} className="w-16 h-16 object-cover rounded-md" alt={d.alt || ''} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {translating && <p className="text-text-secondary text-sm mt-1"><Icon name="languages" size={18} /> {t('action.translating')}</p>}
                  {translationResult && !translating && (
                    <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <p className="text-xs text-primary font-medium mb-1">
                        <Icon name="languages" size={18} /> {t('action.translate')} ({targetLang})
                        {translationResult.sourceLang && (
                          <span className="text-text-secondary ml-2">{t('thread.sourceLang')}: {translationResult.sourceLang}</span>
                        )}
                      </p>
                      <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">{translationResult.translated}</p>
                    </div>
                  )}

                  {/* Media-level moderation banner — between text and media */}
                  {focusedModeration.mediaAction === 'blur' && focusedModeration.contentAction === 'none' && (
                    <ModerationLabelBar
                      decision={focusedModeration}
                      isRevealed={focusedMediaRevealed}
                      onToggle={() => setFocusedMediaRevealed(!focusedMediaRevealed)}
                    />
                  )}

                  {focused.imageDetails?.length > 0 && (
                    <div className={`overflow-hidden rounded-lg ${isFocusedMediaBlurred ? 'blur-2xl brightness-50 transition-all duration-300 pointer-events-none' : ''}`}>
                      <ImageGrid
                        images={focused.imageDetails.map((d: { url: string; alt: string }) => ({ url: d.url, alt: d.alt }))}
                        imageDescCallback={imageDescConfig && client ? async (index, cdnUrl, alt) => {
                          const m = cdnUrl.match(/\/plain\/([^/]+)\/([^@]+)/);
                          if (!m) throw new Error('Could not parse image URL');
                          return describeImage(imageDescConfig, () => client.downloadBlob(decodeURIComponent(m[1]!), decodeURIComponent(m[2]!)), alt, targetLang);
                        }                 : undefined}
                        singleImageFill={singleImageFill}
                      />
                    </div>
                  )}
                  {focused.hasVideo && focused.videoThumbnailUrl && focused.videoPlaylistUrl && (
                    <div className={`overflow-hidden rounded-lg ${isFocusedMediaBlurred ? 'blur-2xl brightness-50 transition-all duration-300 pointer-events-none' : ''}`}>
                      <VideoCard
                        thumbnailUrl={focused.videoThumbnailUrl}
                        playlistUrl={focused.videoPlaylistUrl}
                        alt={focused.videoAlt}
                        aspectRatio={focused.videoAspectRatio}
                      />
                    </div>
                  )}
                  {focused.externalLink && (isBskyAppUrl(focused.externalLink.uri) ? (
                    <BskyLinkCard url={focused.externalLink.uri} onOpenInternal={(view) => goTo(view)} />
                  ) : (
                    <a href={focused.externalLink.uri} target="_blank" rel="noopener noreferrer"
                      className="mt-2 block border border-border rounded-lg p-3 hover:bg-surface transition-colors no-underline"
                    >
                      <p className="text-text-primary text-sm font-medium line-clamp-1">{focused.externalLink.title || focused.externalLink.uri}</p>
                      {focused.externalLink.description && <p className="text-text-secondary text-xs mt-0.5 line-clamp-2">{focused.externalLink.description}</p>}
                      <p className="text-primary text-xs mt-1 truncate">{focused.externalLink.uri}</p>
                    </a>
                  ))}
                </div>
                {/* Threadgate restriction badge */}
                {threadgate && threadgate.rules !== undefined && (
                  <button 
                    onClick={() => setShowThreadgateDetail(true)}
                    className="mt-3 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-1.5 flex items-center gap-1.5 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
                  >
                    <Icon name="corner-down-right" size={12} />
                    {t(getThreadgateDisplayKey(threadgate.rules, threadgate.listInfo))}
                  </button>
                )}
                {/* Unified action row + extras */}
                <div className="flex items-center gap-3 text-sm text-text-secondary mt-3">
                  <PostActionsRow client={client} goTo={goTo} post={focused} showBookmark isBookmarked={isBookmarked} onBookmark={toggleBookmark} />
                  {hasText && <button onClick={handleTranslate} className="hover:text-blue-500 transition-colors" aria-label={t('action.translate')}><Icon name="languages" size={18} /></button>}
                  <button onClick={() => { const url = getPostUrl(focused.handle, focused.rkey); navigator.clipboard.writeText(url).catch(() => {}); }} className="hover:text-blue-500 transition-colors" aria-label={t('action.copy')}><Icon name="copy" size={18} /></button>
                  <button onClick={() => setShowInfo(true)} className="hover:text-blue-500 transition-colors" title={t('post.info')} aria-label={t('post.info')}><Icon name="badge-info" size={18} /></button>
                  <ReportButton client={client} post={focused} />
                  {focused.handle === client.getHandle() && (
                    <>
                      <button onClick={() => setShowThreadgateEditor(true)} className="hover:text-yellow-500 transition-colors" title={t('thread.changeReplyRestriction')} aria-label={t('thread.changeReplyRestriction')} aria-expanded={showThreadgateEditor}><Icon name="message-square-off" size={18} /></button>
                      <button onClick={() => client.deletePost(focused.uri)} className="hover:text-red-500 transition-colors" aria-label={t('action.delete')}><Icon name="trash-2" size={18} /></button>
                    </>
                  )}
                </div>
              </>
            )}
          </article>
        )}

        {/* ── 回复 ── */}
        {replyLines.length > 0 && (
          <section className="px-4 space-y-1">
            <p className="text-xs text-text-secondary font-medium pl-4">── {t('thread.replies')} ({replyLines.length}) ──</p>
            {replyLines.map((line) => {
              if (line.isTruncation) {
                return (
                  <div key={line.text} className="flex justify-center py-3">
                    <button
                      onClick={expandReplies}
                      className="text-sm text-primary hover:text-primary-hover cursor-pointer transition-colors"
                    >
                      {line.text.replace('（', '').replace('）', '')}
                    </button>
                  </div>
                );
              }
              const decision = decisions.get(line.uri) ?? null;
              return (
                <div
                  key={line.uri || line.rkey}
                  style={{ marginLeft: Math.min((line.depth - 1) * 20, 60) }}
                >
                  <PostPreviewCard
                    line={line}
                    onClick={line.uri ? () => goTo({ type: 'thread', uri: line.uri }) : undefined}
                    goTo={goTo}
                    imageDescConfig={imageDescConfig}
                    imageDescLang={imageDescLang}
                    singleImageFill={singleImageFill}
                    client={client}
                    previewLines={threadPreviewLines}
                    quotedPreviewLines={quotedPostPreviewLines}
                    moderationDecision={decision}
                  >
                    <PostActionsRow client={client} goTo={goTo} post={line} showBookmark isBookmarked={isBookmarked} onBookmark={toggleBookmark} />
                  </PostPreviewCard>
                </div>
              );
            })}
          </section>
        )}

        {!loading && flatLines.length === 0 && (
          error ? (
            <NotFoundCard uri={uri} goBack={goBack} />
          ) : (
            <div className="text-center py-16 text-text-secondary">
              <Icon name="inbox" size={48} className="mx-auto mb-3" />
              <p>{t('thread.loadFailed')}</p>
            </div>
          )
        )}
      </div>
      {showInfo && focused && getPostView?.(focused.uri) && (
        <PostInfoModal open={showInfo} post={getPostView!(focused.uri)!} onClose={() => setShowInfo(false)} />
      )}
      {showThreadgateEditor && focused && (
        <ThreadgateEditor
          client={client}
          postUri={focused.uri}
          currentRules={threadgate?.rules ?? null}
          listInfo={threadgate?.listInfo}
          onClose={() => setShowThreadgateEditor(false)}
          onSaved={() => { setShowThreadgateEditor(false); window.location.reload(); }}
        />
      )}
      {showThreadgateDetail && threadgate && (
        <ThreadgateDetailModal
          open={showThreadgateDetail}
          rules={threadgate.rules}
          listInfo={threadgate.listInfo}
          allowQuote={threadgate.allowQuote ?? true}
          onClose={() => setShowThreadgateDetail(false)}
        />
      )}
    </div>
  );
}

function PostInfoModal({ open, post, onClose }: { open: boolean; post: PostView; onClose: () => void }) {
  const { t } = useI18n();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 1500);
    } catch { /* fallback */ }
  };

  const record = post.record as any;
  const reply = record.reply as { root: { uri: string }; parent: { uri: string } } | undefined;
  const viewer = post.viewer as { like?: string; repost?: string } | undefined;
  const embedTypes: string[] = [];
  const apiEmbed = (post as any).embed as { $type?: string; images?: unknown[] } | undefined;
  if (apiEmbed?.$type?.includes('images')) embedTypes.push(`images ×${(apiEmbed.images || []).length}`);
  else if (apiEmbed?.$type?.includes('video')) embedTypes.push('video');
  else if (apiEmbed?.$type?.includes('external')) embedTypes.push('link');
  else if (apiEmbed?.$type?.includes('record')) embedTypes.push('quote');

  return (
    <Modal open={open} onClose={onClose}>
      <div className="max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">{t('post.info')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors p-0.5" aria-label={t('a11y.close')}><Icon name="x" size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">AT URI</span>
              <button onClick={() => copy('uri', post.uri)} className="text-xs text-primary hover:text-primary-hover transition-colors flex items-center gap-1">
                {copiedField === 'uri' ? <><Icon name="badge-check" size={12} />{t('common.copied')}</> : <><Icon name="copy" size={12} />{t('common.copy')}</>}
              </button>
            </div>
            <div className="rounded-lg border border-border bg-surface p-2.5"><code className="text-xs text-text-primary font-mono break-all">{post.uri}</code></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">CID</span>
              <button onClick={() => copy('cid', post.cid)} className="text-xs text-primary hover:text-primary-hover transition-colors flex items-center gap-1">
                {copiedField === 'cid' ? <><Icon name="badge-check" size={12} />{t('common.copied')}</> : <><Icon name="copy" size={12} />{t('common.copy')}</>}
              </button>
            </div>
            <div className="rounded-lg border border-border bg-surface p-2.5"><code className="text-xs text-text-primary font-mono break-all">{post.cid}</code></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('post.openInBsky')}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => copy('bskyUrl', `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`)} className="text-xs text-primary hover:text-primary-hover transition-colors flex items-center gap-1">
                  {copiedField === 'bskyUrl' ? <><Icon name="badge-check" size={12} />{t('common.copied')}</> : <><Icon name="copy" size={12} />{t('common.copy')}</>}
                </button>
                <a href={`https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:text-primary-hover transition-colors flex items-center gap-1">
                  <Icon name="corner-down-right" size={12} />{t('action.open')}
                </a>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-2.5"><code className="text-xs text-text-primary font-mono break-all">{`https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`}</code></div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('post.timestamps')}</span>
            <div className="text-sm text-text-primary">
              <span className="text-text-secondary">{t('post.createdAt')}:</span> {record.createdAt ? record.createdAt.replace('T', ' ').replace(/\..+/, '') : '—'}
              <br />
              <span className="text-text-secondary">{t('post.indexedAt')}:</span> {post.indexedAt ? post.indexedAt.replace('T', ' ').replace(/\..+/, '') : '—'}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('post.stats')}</span>
            <p className="text-sm text-text-primary flex items-center gap-2">
              <Icon name="heart" size={14} />{post.likeCount ?? 0}
              <Icon name="repeat" size={14} />{post.repostCount ?? 0}
              <Icon name="message-square" size={14} />{post.replyCount ?? 0}
            </p>
          </div>
          {viewer && (
            <div className="space-y-1">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('post.viewer')}</span>
              <p className="text-sm text-text-primary flex items-center gap-2">
                {t('post.liked')}: {viewer.like ? <Icon name="badge-check" size={14} /> : '—'}
                {'  '}{t('post.reposted')}: {viewer.repost ? <Icon name="repeat" size={14} /> : '—'}
              </p>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors">
            {t('action.done')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
