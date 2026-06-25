import React from 'react';
import type { ProfileViewBasic } from '@bsky/core';

interface NotifActorStackProps {
  actors: ProfileViewBasic[];
  max?: number;
}

function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function NotifActorStack({ actors, max = 3 }: NotifActorStackProps) {
  const visible = actors.slice(0, max);
  const remaining = Math.max(0, actors.length - max);

  return (
    <div
      className="flex -space-x-2 rtl:space-x-reverse shrink-0"
      aria-hidden="true"
    >
      {visible.map((actor, idx) => (
        <div
          key={`${actor.did ?? actor.handle}-${idx}`}
          className="w-8 h-8 rounded-full border-2 border-background overflow-hidden bg-primary text-white flex items-center justify-center text-xs font-bold"
        >
          {actor.avatar ? (
            <img src={actor.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span aria-hidden="true">{avatarLetter(actor.displayName || actor.handle)}</span>
          )}
        </div>
      ))}
      {remaining > 0 && (
        <div className="w-8 h-8 rounded-full border-2 border-background bg-surface text-text-primary flex items-center justify-center text-xs font-medium">
          +{remaining}
        </div>
      )}
    </div>
  );
}
