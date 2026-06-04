import React, { useState, useEffect } from 'react';
import type { AppView } from '@bsky/app';
import { useI18n, parseBskyAppUrl, bskyUrlToAppView } from '@bsky/app';
import type { BskyClient } from '@bsky/core';
import { Icon } from './Icon.js';

interface RedirectPageProps {
  pathname: string;
  client: BskyClient | null;
  onNavigate: (view: AppView) => void;
}

export function RedirectPage({ pathname, client, onNavigate }: RedirectPageProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolvedView, setResolvedView] = useState<AppView | null>(null);

  useEffect(() => {
    async function resolve() {
      try {
        // Parse the /i/ path
        const path = pathname.slice(3); // remove /i/
        const [domain, ...segments] = path.split('/').filter(Boolean);

        if (!domain || domain !== 'bsky.app') {
          setStatus('error');
          setErrorMsg(t('redirect.unsupportedClient'));
          return;
        }

        const bskyUrl = `https://${domain}/${segments.join('/')}`;
        const info = parseBskyAppUrl(bskyUrl);

        if (!info) {
          setStatus('error');
          setErrorMsg(t('redirect.invalidUrl'));
          return;
        }

        let view = bskyUrlToAppView(info);

        if (!view) {
          setStatus('error');
          setErrorMsg(t('redirect.unsupportedPath'));
          return;
        }

        // Handle DID resolution for posts/lists/feeds with handles
        const needsResolution =
          (info.type === 'post' || info.type === 'list' || info.type === 'feed') &&
          info.handleOrDid &&
          !info.handleOrDid.startsWith('did:');

        if (needsResolution && client && info.handleOrDid) {
          try {
            const resolved = await client.resolveHandle(info.handleOrDid);
            if (resolved?.did && info.rkey) {
              const did = resolved.did;
              if (info.type === 'post') {
                const uri = `at://${did}/app.bsky.feed.post/${info.rkey}`;
                view = { type: 'thread', uri };
              } else if (info.type === 'list' && info.listRkey) {
                const uri = `at://${did}/app.bsky.graph.list/${info.listRkey}`;
                view = { type: 'listDetail', uri };
              } else if (info.type === 'feed' && info.feedRkey) {
                const uri = `at://${did}/app.bsky.feed.generator/${info.feedRkey}`;
                view = { type: 'feed', feedUri: uri };
              }
            }
          } catch {
            // Resolution failed - keep the fallback view (profile page)
          }
        }

        setResolvedView(view);
        setStatus('success');
        // Auto-navigate after a brief delay to show the user what's happening
        setTimeout(() => {
          onNavigate(view!);
        }, 500);
      } catch (e) {
        setStatus('error');
        setErrorMsg(e instanceof Error ? e.message : String(e));
      }
    }

    void resolve();
  }, [pathname, client, onNavigate, t]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-3rem)] bg-background animate-fadeIn">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-text-secondary text-sm">{t('redirect.resolving')}</p>
        <p className="text-text-secondary text-xs mt-1 max-w-md text-center px-4">{pathname}</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-3rem)] bg-background animate-fadeIn px-4">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
          <Icon name="alert-circle" size={24} className="text-red-500" />
        </div>
        <h2 className="text-text-primary font-semibold text-lg mb-2">{t('redirect.failed')}</h2>
        <p className="text-text-secondary text-sm text-center mb-4">{errorMsg}</p>
        <p className="text-text-secondary text-xs text-center max-w-md">{pathname}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-3rem)] bg-background animate-fadeIn">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-text-secondary text-sm">{t('redirect.redirecting')}</p>
      {resolvedView && (
        <p className="text-text-secondary text-xs mt-1">
          {resolvedView.type === 'profile' && `${t('link.type.profile')}: ${(resolvedView as { actor: string }).actor}`}
          {resolvedView.type === 'thread' && `${t('link.type.post')}: ${(resolvedView as { uri: string }).uri}`}
          {resolvedView.type === 'search' && `${t('link.type.search')}: ${(resolvedView as { query?: string }).query || ''}`}
          {resolvedView.type === 'feed' && `${t('link.type.feed')}`}
          {resolvedView.type === 'listDetail' && `${t('link.type.list')}`}
        </p>
      )}
    </div>
  );
}
