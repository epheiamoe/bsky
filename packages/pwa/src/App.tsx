import React, { useState, useEffect, useCallback } from 'react';
import { useNavigation, useAuth, useNotifications, useBookmarks } from '@bsky/app';
import type { AppView } from '@bsky/app';

export function App() {
  const { currentView } = useNavigation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0A]">
      <p className="text-text-secondary text-lg">
        🦋 Bluesky PWA — 正在构建…
      </p>
    </div>
  );
}
