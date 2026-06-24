import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderHook, waitFor } from '@testing-library/react';
import { useConvoList, markConvoRead, __resetConvoStore } from '../useConvoList.js';
import type { BskyClient, ConvoView } from '@bsky/core';

function makeConvo(id: string, unreadCount: number): ConvoView {
  return {
    id,
    rev: `rev-${id}`,
    members: [],
    muted: false,
    status: 'accepted',
    unreadCount,
    kind: 'direct',
  };
}

function makeClient(convos: ConvoView[]): BskyClient {
  return {
    listConvos: vi.fn().mockResolvedValue({ convos, cursor: undefined }),
  } as unknown as BskyClient;
}

describe('ConvoUnreadStore', () => {
  beforeEach(() => {
    __resetConvoStore();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('markConvoRead overlay forces unreadCount to 0', async () => {
    const client = makeClient([makeConvo('c1', 5)]);
    const { result } = renderHook(() => useConvoList(client));

    await waitFor(() => expect(result.current.convos).toHaveLength(1));
    expect(result.current.convos[0]?.unreadCount).toBe(5);

    act(() => markConvoRead('c1'));

    expect(result.current.convos[0]?.unreadCount).toBe(0);
  });

  it('TTL expiration restores server unreadCount', async () => {
    const client = makeClient([makeConvo('c1', 3)]);
    const { result } = renderHook(() => useConvoList(client));

    await waitFor(() => expect(result.current.convos).toHaveLength(1));

    act(() => markConvoRead('c1'));
    expect(result.current.convos[0]?.unreadCount).toBe(0);

    // The next refresh would otherwise come from silentPoll every 30s; simulate it
    // by advancing past the 60s TTL and issuing an explicit refresh.
    act(() => vi.advanceTimersByTime(61_000));
    await act(async () => { await result.current.refresh(); });

    expect(result.current.convos[0]?.unreadCount).toBe(3);
  });

  it('multiple hook instances share overlay state', async () => {
    const client = makeClient([makeConvo('c1', 7), makeConvo('c2', 2)]);
    const a = renderHook(() => useConvoList(client));
    const b = renderHook(() => useConvoList(client));

    await waitFor(() => expect(a.result.current.convos).toHaveLength(2));
    await waitFor(() => expect(b.result.current.convos).toHaveLength(2));

    act(() => markConvoRead('c1'));

    expect(a.result.current.convos.find(c => c.id === 'c1')?.unreadCount).toBe(0);
    expect(b.result.current.convos.find(c => c.id === 'c1')?.unreadCount).toBe(0);
    expect(a.result.current.convos.find(c => c.id === 'c2')?.unreadCount).toBe(2);
    expect(b.result.current.convos.find(c => c.id === 'c2')?.unreadCount).toBe(2);
  });

  it('initial load is shared across instances (only one listConvos call)', async () => {
    const convos = [makeConvo('c1', 1), makeConvo('c2', 2)];
    const listConvos = vi.fn().mockResolvedValue({ convos, cursor: undefined });
    const client = { listConvos } as unknown as BskyClient;

    const a = renderHook(() => useConvoList(client));
    const b = renderHook(() => useConvoList(client));

    await waitFor(() => expect(a.result.current.convos).toHaveLength(2));
    await waitFor(() => expect(b.result.current.convos).toHaveLength(2));

    expect(listConvos).toHaveBeenCalledTimes(1);
  });

  it('changing client resets state and triggers a fresh initial load', async () => {
    const firstClient = makeClient([makeConvo('c1', 1)]);
    const secondClient = makeClient([makeConvo('c2', 2)]);

    const { result, rerender } = renderHook(
      ({ client }) => useConvoList(client),
      { initialProps: { client: firstClient } },
    );

    await waitFor(() => expect(result.current.convos).toHaveLength(1));
    expect(result.current.convos[0]?.id).toBe('c1');

    rerender({ client: secondClient });

    await waitFor(() => expect(result.current.convos).toHaveLength(1));
    expect(result.current.convos[0]?.id).toBe('c2');
  });

  it('markConvoRead before initial load still reduces badge once list arrives', async () => {
    let resolveList: (value: { convos: ConvoView[]; cursor?: string }) => void = () => {};
    const listConvos = vi.fn().mockImplementation(() => new Promise<{ convos: ConvoView[]; cursor?: string }>(r => { resolveList = r; }));
    const client = { listConvos } as unknown as BskyClient;

    const { result } = renderHook(() => useConvoList(client));

    // Mark read before the initial fetch resolves.
    act(() => markConvoRead('c1'));

    await act(async () => {
      resolveList({ convos: [makeConvo('c1', 4)] });
      await new Promise(r => setTimeout(r, 0));
    });

    expect(result.current.convos[0]?.unreadCount).toBe(0);
  });
});
