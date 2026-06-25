import React, { useCallback } from 'react';
import type { ProfileViewBasic } from '@bsky/core';

interface NotifActorStackProps {
  actors: ProfileViewBasic[];
  max?: number;
  className?: string;
  onActorClick?: (actor: ProfileViewBasic) => void;
  onRemainingClick?: () => void;
}

function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

function actorLabel(actor: ProfileViewBasic): string {
  return actor.displayName || actor.handle;
}

export function NotifActorStack({
  actors,
  max = 3,
  className,
  onActorClick,
  onRemainingClick,
}: NotifActorStackProps) {
  const visible = actors.slice(0, max);
  const remaining = Math.max(0, actors.length - max);

  const handleActorClick = useCallback(
    (actor: ProfileViewBasic) => (e: React.MouseEvent) => {
      e.stopPropagation();
      onActorClick?.(actor);
    },
    [onActorClick],
  );

  const handleRemainingClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemainingClick?.();
    },
    [onRemainingClick],
  );

  return (
    <div className={`flex -space-x-2 rtl:space-x-reverse shrink-0 ${className ?? ''}`}>
      {visible.map((actor, idx) => (
        <button
          key={`${actor.did ?? actor.handle}-${idx}`}
          type="button"
          onClick={handleActorClick(actor)}
          aria-label={actorLabel(actor)}
          title={actorLabel(actor)}
          className="w-8 h-8 rounded-full border-2 border-background overflow-hidden bg-primary text-white flex items-center justify-center text-xs font-bold hover:brightness-110 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background"
        >
          {actor.avatar ? (
            <img src={actor.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span aria-hidden="true">{avatarLetter(actor.displayName || actor.handle)}</span>
          )}
        </button>
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={handleRemainingClick}
          aria-label={`+${remaining}`}
          title={`+${remaining}`}
          className="w-8 h-8 rounded-full border-2 border-background bg-surface text-text-primary flex items-center justify-center text-xs font-medium hover:bg-surface/80 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background"
        >
          +{remaining}
        </button>
      )}
    </div>
  );
}
