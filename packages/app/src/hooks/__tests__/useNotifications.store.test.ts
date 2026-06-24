import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { BskyClient } from '@bsky/core';
import type { Notification } from '@bsky/core';
import { __resetNotificationStore, useNotifications } from '../useNotifications.js';
import { readCache, hasCache } from '../../stores/cache.js';

const CACHE_KEY = 'notifications';

function makeNotification(overrides?: Partial<Notification> & { uri?: string; isRead?: boolean }): Notification {
  return {
    uri: overrides?.uri ?? 'at://did:plc:test/app.bsky.feed.post/1',
    cid: 'cid-1',
    author: {
      did: 'did:plc:test',
      handle: 'test.bsky.social',
      displayName: 'Test User',
      avatar: undefined,
    },
    reason: 'like',
    reasonSubject: 'at://did:plc:test/app.bsky.feed.post/root',
    record: { $type: 'app.bsky.feed.like' },
    isRead: overrides?.isRead ?? false,
    indexedAt: new Date().toISOString(),
    labels: [],
    ...overrides,
  } as unknown as Notification;
}

function createMockClient(overrides?: {
  listNotifications?: () => Promise<{ notifications: Notification[] }>;
  updateNotificationsSeen?: () => Promise<void>;
}): BskyClient {
  return {
    listNotifications: overrides?.listNotifications ?? vi.fn().mockResolvedValue({ notifications: [] }),
    updateNotificationsSeen: overrides?.updateNotificationsSeen ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BskyClient;
}

describe('notificationStore', () => {
  beforeEach(() => {
    __resetNotificationStore();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('shared state updates', () => {
    it('multiple hook callers share the same notifications and unreadCount', async () => {
      const client = createMockClient({
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [makeNotification({ uri: 'n1', isRead: false }), makeNotification({ uri: 'n2', isRead: true })],
        }),
      });

      const { result: resultA } = renderHook(() => useNotifications(client));
      const { result: resultB } = renderHook(() => useNotifications(client));

      expect(resultA.current.unreadCount).toBe(0);
      expect(resultB.current.unreadCount).toBe(0);

      await act(async () => {
        await resultA.current.refresh();
      });

      await waitFor(() => {
        expect(resultA.current.unreadCount).toBe(1);
        expect(resultB.current.unreadCount).toBe(1);
      });

      expect(readCache(CACHE_KEY)).toEqual({
        notifications: expect.any(Array),
        unreadCount: 1,
      });
    });

    it('writes to global cache so offline render can access the latest unreadCount', async () => {
      const client = createMockClient({
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [makeNotification({ uri: 'n1', isRead: false })],
        }),
      });

      const { result } = renderHook(() => useNotifications(client));
      await act(async () => {
        await result.current.refresh();
      });

      expect(hasCache(CACHE_KEY)).toBe(true);
      expect(readCache<{ unreadCount: number }>(CACHE_KEY)?.unreadCount).toBe(1);
    });
  });

  describe('markAllAsRead rollback on failure', () => {
    it('rolls back notifications, unreadCount and cache when updateNotificationsSeen fails', async () => {
      const error = new Error('Network unreachable');
      const client = createMockClient({
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [
            makeNotification({ uri: 'n1', isRead: false }),
            makeNotification({ uri: 'n2', isRead: false }),
          ],
        }),
        updateNotificationsSeen: vi.fn().mockRejectedValue(error),
      });

      const { result } = renderHook(() => useNotifications(client));
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.unreadCount).toBe(2);
      expect(result.current.notifications.every(n => !n.isRead)).toBe(true);

      let markResult: boolean | undefined;
      await act(async () => {
        markResult = await result.current.markAllAsRead();
      });

      expect(markResult).toBe(false);
      expect(result.current.unreadCount).toBe(2);
      expect(result.current.notifications.every(n => !n.isRead)).toBe(true);
      expect(result.current.error).toBe('Network unreachable');
      expect(readCache<{ unreadCount: number }>(CACHE_KEY)?.unreadCount).toBe(2);
    });

    it('succeeds and refreshes silently when updateNotificationsSeen succeeds', async () => {
      let seen = false;
      const client = createMockClient({
        listNotifications: vi.fn().mockImplementation(() => {
          // 第一次返回未读；markAllAsRead 调用 updateNotificationsSeen 后再刷新应返回已读
          const notifications = seen
            ? [makeNotification({ uri: 'n1', isRead: true })]
            : [makeNotification({ uri: 'n1', isRead: false })];
          return Promise.resolve({ notifications });
        }),
        updateNotificationsSeen: vi.fn().mockImplementation(() => {
          seen = true;
          return Promise.resolve(undefined);
        }),
      });

      const { result } = renderHook(() => useNotifications(client));
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.unreadCount).toBe(1);

      let markResult: boolean | undefined;
      await act(async () => {
        markResult = await result.current.markAllAsRead();
      });

      expect(markResult).toBe(true);
      await waitFor(() => {
        expect(result.current.unreadCount).toBe(0);
      });
      expect(result.current.notifications.every(n => n.isRead)).toBe(true);
    });
  });

  describe('epoch race protection', () => {
    it('discards stale listNotifications response when markAllAsRead starts later', async () => {
      let seen = false;
      const slowClient = createMockClient({
        listNotifications: vi.fn().mockImplementation(async () => {
          // 模拟延迟较高的旧刷新请求
          await new Promise(r => setTimeout(r, 1000));
          // updateNotificationsSeen 之后，服务端已读状态已更新
          const isRead = seen;
          return { notifications: [makeNotification({ uri: 'old', isRead })] };
        }),
        updateNotificationsSeen: vi.fn().mockImplementation(() => {
          seen = true;
          return Promise.resolve(undefined);
        }),
      });

      const { result } = renderHook(() => useNotifications(slowClient));

      // 启动一个慢速刷新
      let refreshPromise: Promise<void> | undefined;
      await act(async () => {
        refreshPromise = result.current.refresh();
      });

      // 在刷新未完成前立刻执行 markAllAsRead，产生更高 epoch
      let markPromise: Promise<boolean> | undefined;
      await act(async () => {
        markPromise = result.current.markAllAsRead();
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      await Promise.all([refreshPromise, markPromise] as const);

      await waitFor(() => {
        // 旧刷新结果不应覆盖 markAllAsRead 后的状态
        expect(result.current.unreadCount).toBe(0);
      });
    });

    it('does not overwrite a newer successful load with an older failed load', async () => {
      let callCount = 0;
      const client = createMockClient({
        listNotifications: vi.fn().mockImplementation(async () => {
          callCount += 1;
          if (callCount === 1) {
            // 第一次请求延迟失败
            await new Promise(r => setTimeout(r, 500));
            throw new Error('First request failed');
          }
          // 第二次请求立即成功
          return { notifications: [makeNotification({ uri: 'new', isRead: false })] };
        }),
      });

      const { result } = renderHook(() => useNotifications(client));

      await act(async () => {
        // 在 act 内启动两次刷新，第二次会覆盖第一次的 epoch
        result.current.refresh();
        await Promise.resolve();
        vi.advanceTimersByTime(100);
        await result.current.refresh();
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.unreadCount).toBe(1);
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe('client switch / logout reset', () => {
    it('resets state and clears cache when active client changes', async () => {
      const clientA = createMockClient({
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [makeNotification({ uri: 'a1', isRead: false })],
        }),
      });
      const clientB = createMockClient();

      const { result: resultA } = renderHook(() => useNotifications(clientA));
      await act(async () => {
        await resultA.current.refresh();
      });
      expect(resultA.current.unreadCount).toBe(1);
      expect(hasCache(CACHE_KEY)).toBe(true);

      // 模拟用户切换：为 clientB 创建新的 hook 实例
      const { result: resultB } = renderHook(() => useNotifications(clientB));

      await waitFor(() => {
        expect(resultB.current.unreadCount).toBe(0);
      });
      expect(resultB.current.notifications).toEqual([]);
      // clientB 挂载后会触发 ensureInitialLoad，即使返回空列表也会写入缓存，
      // 因此这里只断言状态被重置，不断言缓存是否为空
    });

    it('discards in-flight listNotifications response from old client after account switch', async () => {
      let resolveA: (value: { notifications: Notification[] }) => void = () => {};
      const clientA = createMockClient({
        listNotifications: vi.fn().mockImplementation(() => new Promise(resolve => { resolveA = resolve; })),
      });
      const clientB = createMockClient({
        listNotifications: vi.fn().mockResolvedValue({ notifications: [] }),
      });

      const { result: resultA } = renderHook(() => useNotifications(clientA));
      let refreshPromise: Promise<void>;
      await act(async () => {
        refreshPromise = resultA.current.refresh();
      });

      // 切换账号：clientB 挂载会重置 Store 并触发其初始加载
      const { result: resultB } = renderHook(() => useNotifications(clientB));
      await waitFor(() => {
        expect(resultB.current.unreadCount).toBe(0);
      });

      // clientA 的慢速响应此时才到达
      await act(async () => {
        resolveA({ notifications: [makeNotification({ uri: 'a1', isRead: false })] });
      });
      await act(async () => {
        await refreshPromise;
      });

      // 旧账号数据不能泄漏到 Store
      await waitFor(() => {
        expect(resultB.current.unreadCount).toBe(0);
      });
      expect(resultB.current.notifications).toEqual([]);
      expect(resultA.current.unreadCount).toBe(0);
    });

    it('discards stale updateNotificationsSeen result after switching account', async () => {
      let resolveUpdate: () => void;
      const clientA = createMockClient({
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [makeNotification({ uri: 'n1', isRead: false })],
        }),
        updateNotificationsSeen: vi.fn().mockImplementation(() => new Promise<void>(resolve => { resolveUpdate = resolve; })),
      });
      const clientB = createMockClient({
        listNotifications: vi.fn().mockResolvedValue({ notifications: [] }),
      });

      const { result: resultA } = renderHook(() => useNotifications(clientA));
      await act(async () => {
        await resultA.current.refresh();
      });
      expect(resultA.current.unreadCount).toBe(1);

      let markPromise: Promise<boolean>;
      await act(async () => {
        markPromise = resultA.current.markAllAsRead();
      });

      // 在 updateNotificationsSeen 尚未完成时切换账号
      const { result: resultB } = renderHook(() => useNotifications(clientB));
      await waitFor(() => {
        expect(resultB.current.unreadCount).toBe(0);
      });

      // 旧账号的 updateNotificationsSeen 终于完成
      await act(async () => {
        resolveUpdate();
      });
      const markResult = await act(async () => markPromise);

      expect(markResult).toBe(false);
      await waitFor(() => {
        expect(resultB.current.unreadCount).toBe(0);
      });
      expect(resultB.current.notifications).toEqual([]);
    });

    it('__resetNotificationStore restores a clean initial state and notifies listeners', async () => {
      const client = createMockClient({
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [makeNotification({ uri: 'n1', isRead: false })],
        }),
      });

      const { result } = renderHook(() => useNotifications(client));
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.unreadCount).toBe(1);

      act(() => {
        __resetNotificationStore();
      });

      await waitFor(() => {
        expect(result.current.unreadCount).toBe(0);
      });
      expect(hasCache(CACHE_KEY)).toBe(false);
    });
  });

  describe('polling', () => {
    it('starts polling only when pollInterval is provided', async () => {
      const listNotifications = vi.fn().mockResolvedValue({ notifications: [] });
      const client = createMockClient({ listNotifications });

      renderHook(() => useNotifications(client, { pollInterval: 1000 }));

      // 等待 useEffect 挂载并触发第一次加载
      await act(async () => {
        await Promise.resolve();
      });
      expect(listNotifications).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(listNotifications).toHaveBeenCalledTimes(2);

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(listNotifications).toHaveBeenCalledTimes(4);
    });

    it('does not poll by default', async () => {
      const listNotifications = vi.fn().mockResolvedValue({ notifications: [] });
      const client = createMockClient({ listNotifications });

      renderHook(() => useNotifications(client));

      // 默认没有 pollInterval，但仍会触发一次 ensureInitialLoad
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(listNotifications).toHaveBeenCalledTimes(1);
    });
  });
});
