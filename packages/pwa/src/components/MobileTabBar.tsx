import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n } from '@bsky/app';
import type { AppView } from '@bsky/app';
import { Icon } from './Icon.js';

interface MobileTabBarProps {
  currentView: AppView;
  handle?: string | null;
  goTo: (v: AppView, replace?: boolean) => void;
  hidden?: boolean;
}

const TABS: { icon: string; type: AppView['type']; labelKey: string; getView: (handle?: string | null) => AppView }[] = [
  { icon: 'home', type: 'feed', labelKey: 'nav.feed', getView: () => ({ type: 'feed' as const }) },
  { icon: 'compass', type: 'search', labelKey: 'nav.search', getView: () => ({ type: 'search' as const }) },
  { icon: 'astroid-as-AI-Button', type: 'aiChat', labelKey: 'nav.aiChat', getView: () => ({ type: 'aiChat' as const }) },
  { icon: 'at-sign', type: 'profile', labelKey: 'nav.profile', getView: (handle) => handle ? ({ type: 'profile' as const, actor: handle }) : ({ type: 'profile' as const, actor: '' }) },
];

export function MobileTabBar({ currentView, handle, goTo, hidden }: MobileTabBarProps) {
  const { t } = useI18n();

  return (
    <nav className={`h-14 flex items-center justify-around border-t border-border bg-background px-2 transition-transform duration-300 ease-out ${hidden ? 'translate-y-full' : ''}`} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label={t('a11y.mainNav')}>
      {TABS.map((tab) => {
        const isActive = tab.type === 'profile'
          ? currentView.type === 'profile' && currentView.actor === handle
          : currentView.type === tab.type;
        return (
          <button
            key={tab.type}
            onClick={() => goTo(tab.getView(handle), true)}
            className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1 rounded-lg transition-colors min-w-0 ${
              isActive
                ? 'text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={t(tab.labelKey)}
          >
            <Icon name={tab.icon} size={22} />
            <div className="w-5 h-0.5 flex items-center justify-center" aria-hidden="true">
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    exit={{ scaleX: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="w-full h-0.5 bg-primary rounded-full"
                  />
                )}
              </AnimatePresence>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
