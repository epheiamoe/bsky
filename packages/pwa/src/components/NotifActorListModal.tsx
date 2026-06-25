import React, { useCallback } from 'react';
import type { ProfileViewBasic } from '@bsky/core';
import type { AppView } from '@bsky/app';
import { useI18n } from '@bsky/app';
import { Modal } from './Modal.js';

interface NotifActorListModalProps {
  open: boolean;
  onClose: () => void;
  actors: ProfileViewBasic[];
  goTo: (v: AppView) => void;
}

export function NotifActorListModal({ open, onClose, actors, goTo }: NotifActorListModalProps) {
  const { t } = useI18n();

  const handleActorClick = useCallback(
    (actor: ProfileViewBasic) => {
      onClose();
      if (actor.handle) {
        goTo({ type: 'profile', actor: actor.handle });
      }
    },
    [onClose, goTo],
  );

  return (
    <Modal open={open} onClose={onClose} titleId="notif-actor-list-title">
      <div className="px-4 py-3 max-h-[70vh] overflow-y-auto">
        <h2 id="notif-actor-list-title" className="text-base font-semibold text-text-primary mb-3">
          {t('notifications.actorListTitle')}
        </h2>
        <div role="list" className="space-y-1">
          {actors.map((actor, idx) => (
            <button
              key={`${actor.did ?? actor.handle}-${idx}`}
              type="button"
              role="listitem"
              onClick={() => handleActorClick(actor)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-primary text-white flex items-center justify-center font-bold">
                {actor.avatar ? (
                  <img src={actor.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span aria-hidden="true">{(actor.displayName || actor.handle).charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-text-primary font-medium truncate">
                  {actor.displayName || actor.handle}
                </p>
                <p className="text-text-secondary text-sm truncate">@{actor.handle}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
