import { useSyncExternalStore, useEffect, useCallback } from 'react';
import { BskyClient } from '@bsky/core';
import type { Notification } from '@bsky/core';
import { readCache, writeCache, hasCache, clearCache } from '../stores/cache';

const CACHE_KEY = 'notifications';

interface NotifCache {
  notifications: Notification[];
  unreadCount: number;
}

export interface UseNotificationsOptions {
  /** 自动轮询间隔（ms）。默认不轮询。 */
  pollInterval?: number;
  /** 是否使用服务端未读数接口（P2）。默认 false。 */
  useServerCount?: boolean;
}

interface NotificationState {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  error: string | null;
  epoch: number;
}

function getInitialState(): NotificationState {
  const cached = readCache<NotifCache>(CACHE_KEY);
  return {
    notifications: cached?.notifications ?? [],
    loading: false,
    unreadCount: cached?.unreadCount ?? 0,
    error: null,
    epoch: 0,
  };
}

function countUnread(notifications: Notification[]): number {
  return notifications.filter(n => !n.isRead).length;
}

function createNotificationStore() {
  let state = getInitialState();
  let currentClient: BskyClient | null = null;
  let initialLoadDone = false;
  const listeners = new Set<() => void>();

  const getSnapshot = (): NotificationState => state;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const emit = () => {
    listeners.forEach(listener => listener());
  };

  const setState = (next: Partial<NotificationState>) => {
    state = { ...state, ...next };
    emit();
  };

  const setClient = (client: BskyClient | null) => {
    if (client !== currentClient) {
      currentClient = client;
      initialLoadDone = false;
      // 用户切换或登出时清空状态与全局缓存，避免跨账号泄漏通知数据
      resetState();
    }
  };

  const ensureInitialLoad = (client: BskyClient | null) => {
    if (!client || initialLoadDone) return;
    initialLoadDone = true;
    void load(client, hasCache(CACHE_KEY));
  };

  const applyLoadResult = (epoch: number, notifications: Notification[], unread: number) => {
    // 丢弃被 markAllAsRead 等更高 epoch 操作覆盖的过期响应
    if (epoch < state.epoch) return;
    writeCache(CACHE_KEY, { notifications, unreadCount: unread });
    state = { ...state, notifications, unreadCount: unread, loading: false, error: null, epoch };
    emit();
  };

  const resetState = () => {
    clearCache(CACHE_KEY);
    state = getInitialState();
    emit();
  };

  async function load(client: BskyClient | null, silent = false, retried = false): Promise<void> {
    if (!client) return;
    const epoch = ++state.epoch;
    if (!silent) {
      state = { ...state, loading: true, error: null };
      emit();
    } else {
      state = { ...state, error: null };
      emit();
    }

    try {
      const res = await client.listNotifications(30);
      const notifs = res.notifications as Notification[];
      const unread = countUnread(notifs);
      applyLoadResult(epoch, notifs, unread);
    } catch (e) {
      if (!retried) {
        await new Promise(r => setTimeout(r, 1500));
        return load(client, silent, true);
      }
      // 只在当前 epoch 仍是最新时暴露错误，避免过期失败覆盖成功状态
      if (epoch >= state.epoch) {
        state = { ...state, error: e instanceof Error ? e.message : String(e), loading: false, epoch };
        emit();
      }
    }
  }

  const markAllAsRead = async (client: BskyClient | null): Promise<boolean> => {
    if (!client) return false;

    const epoch = ++state.epoch;
    const snapshotNotifications = state.notifications;
    const snapshotUnread = state.unreadCount;
    const snapshotCache = readCache<NotifCache>(CACHE_KEY);

    // 乐观更新：本地全部标为已读
    const optimisticNotifications = snapshotNotifications.map(n => ({ ...n, isRead: true }));
    writeCache(CACHE_KEY, { notifications: optimisticNotifications, unreadCount: 0 });
    state = {
      ...state,
      notifications: optimisticNotifications,
      unreadCount: 0,
      error: null,
      epoch,
    };
    emit();

    try {
      await client.updateNotificationsSeen();
      // 成功后静默刷新，确保服务端与本地一致
      await load(client, true);
      return true;
    } catch (e) {
      // 失败回滚到操作前的状态与缓存
      if (snapshotCache) {
        writeCache(CACHE_KEY, snapshotCache);
      } else {
        writeCache(CACHE_KEY, { notifications: snapshotNotifications, unreadCount: snapshotUnread });
      }
      // 只有当前 epoch 未被覆盖时才回滚状态，避免过期的失败响应覆盖后续新操作
      if (state.epoch === epoch) {
        state = {
          ...state,
          notifications: snapshotNotifications,
          unreadCount: snapshotUnread,
          error: e instanceof Error ? e.message : String(e),
        };
        emit();
      }
      return false;
    }
  };

  return {
    subscribe,
    getSnapshot,
    setClient,
    resetState,
    ensureInitialLoad,
    load,
    markAllAsRead,
  };
}

const notificationStore = createNotificationStore();

export function useNotifications(client: BskyClient | null, options?: UseNotificationsOptions) {
  const state = useSyncExternalStore(notificationStore.subscribe, notificationStore.getSnapshot);

  const refresh = useCallback(
    (silent?: boolean) => notificationStore.load(client, !!silent),
    [client],
  );

  const markAllAsRead = useCallback(
    () => notificationStore.markAllAsRead(client),
    [client],
  );

  // 初始化：client 变化时只触发一次加载，多个 hook 实例共享结果
  useEffect(() => {
    notificationStore.setClient(client);
    notificationStore.ensureInitialLoad(client);
  }, [client]);

  // 可选轮询：默认关闭，保持向后兼容
  useEffect(() => {
    const pollInterval = options?.pollInterval;
    if (!client || !pollInterval || pollInterval <= 0) return;

    const id = setInterval(() => {
      notificationStore.load(client, true);
    }, pollInterval);

    return () => clearInterval(id);
  }, [client, options?.pollInterval]);

  return {
    notifications: state.notifications,
    loading: state.loading,
    unreadCount: state.unreadCount,
    error: state.error,
    refresh,
    markAllAsRead,
  };
}

/** 测试辅助：重置模块级 Store */
export function __resetNotificationStore(): void {
  notificationStore.setClient(null);
  notificationStore.resetState();
}
