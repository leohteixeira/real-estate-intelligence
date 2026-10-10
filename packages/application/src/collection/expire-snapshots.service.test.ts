import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalFailure } from '../shared/index.js';
import { ExpireSnapshots } from './expire-snapshots.service.js';
import type { SnapshotLifecycle } from './snapshot-lifecycle.port.js';
import type { SnapshotContentStore } from './raw-snapshot-store.port.js';

describe('bounded snapshot expiry', () => {
  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(0));
  afterEach(() => vi.restoreAllMocks());
  it('does not advance an unattempted peer when the caller policy exhausts its deadline before cancellation fires', async () => {
    const controller = new AbortController();
    const listExpired = vi
      .fn()
      .mockResolvedValueOnce(['real/slow'])
      .mockResolvedValueOnce(['real/healthy']);
    const remove = vi.fn(async () => {
      vi.mocked(Date.now).mockReturnValue(1000);
      throw new ExternalFailure({ kind: 'exhausted', operation: 'raw-snapshot-delete' });
    });
    const service = new ExpireSnapshots(
      { listExpired } as unknown as SnapshotLifecycle,
      { delete: remove } as unknown as SnapshotContentStore,
      { now: () => '2026-11-09T00:00:00.000Z' },
    );
    await expect(service.expire(2, controller.signal, 1000)).rejects.toMatchObject({
      kind: 'exhausted',
      operation: 'snapshot-retention.expire',
    });
    expect(controller.signal.aborted).toBe(false);
    expect(listExpired).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledExactlyOnceWith('real/slow', controller.signal, 1000);
  });
  it('never retries the same due object within one cycle', async () => {
    const signal = new AbortController().signal;
    const listExpired = vi.fn().mockResolvedValue(['real/failing']);
    const remove = vi.fn().mockRejectedValue(new Error('unavailable'));
    const service = new ExpireSnapshots(
      { listExpired } as unknown as SnapshotLifecycle,
      { delete: remove } as unknown as SnapshotContentStore,
      { now: () => '2026-11-09T00:00:00.000Z' },
    );
    await expect(service.expire(100, signal)).rejects.toMatchObject({ kind: 'exhausted' });
    expect(remove).toHaveBeenCalledExactlyOnceWith('real/failing', signal, undefined);
    expect(listExpired).toHaveBeenCalledTimes(2);
  });
  it('validates the total attempt bound and cancels before selecting any work', async () => {
    const listExpired = vi.fn();
    const service = new ExpireSnapshots(
      { listExpired } as unknown as SnapshotLifecycle,
      {} as SnapshotContentStore,
      { now: () => '2026-11-09T00:00:00.000Z' },
    );
    const controller = new AbortController();
    for (const limit of [0, 1001, 1.5])
      await expect(service.expire(limit, controller.signal)).rejects.toThrow(RangeError);
    controller.abort();
    await expect(service.expire(2, controller.signal)).rejects.toThrow();
    expect(listExpired).not.toHaveBeenCalled();
  });
  it('advances only the next candidate before a slow deletion cancels a larger batch', async () => {
    const priority = new Map([
      ['real/slow', 0],
      ['real/healthy', 0],
    ]);
    let order = 0;
    const listExpired = vi.fn(async (_now: string, limit: number) => {
      const selected = [...priority.keys()]
        .sort((a, b) => priority.get(a)! - priority.get(b)!)
        .slice(0, limit);
      for (const key of selected) priority.set(key, ++order);
      return selected;
    });
    const controller = new AbortController();
    let slow = true;
    const remove = vi.fn(async (key: string) => {
      if (key === 'real/slow' && slow) {
        slow = false;
        controller.abort();
        throw controller.signal.reason;
      }
      priority.delete(key);
    });
    const service = new ExpireSnapshots(
      { listExpired } as unknown as SnapshotLifecycle,
      { delete: remove } as unknown as SnapshotContentStore,
      { now: () => '2026-11-09T00:00:00.000Z' },
    );
    await expect(service.expire(2, controller.signal)).rejects.toThrow();
    expect(priority.get('real/healthy')).toBe(0);
    await expect(service.expire(2, new AbortController().signal)).resolves.toBe(2);
    expect(remove.mock.calls.map(([key]) => key)).toEqual([
      'real/slow',
      'real/healthy',
      'real/slow',
    ]);
    expect(listExpired.mock.calls.every(([, limit]) => limit === 1)).toBe(true);
  });
  it('uses the trusted clock and a bounded batch, preserving failed deletions for retries', async () => {
    const signal = new AbortController().signal;
    const listExpired = vi
      .fn()
      .mockResolvedValueOnce(['real/one'])
      .mockResolvedValueOnce(['real/two'])
      .mockResolvedValueOnce(['real/one'])
      .mockResolvedValueOnce(['real/two']);
    const remove = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(undefined);
    const service = new ExpireSnapshots(
      { listExpired } as unknown as SnapshotLifecycle,
      { delete: remove } as unknown as SnapshotContentStore,
      { now: () => '2026-11-09T00:00:00.000Z' },
    );
    await expect(service.expire(2, signal, 1000)).rejects.toMatchObject({
      kind: 'exhausted',
      operation: 'snapshot-retention.expire',
    });
    expect(listExpired).toHaveBeenCalledWith('2026-11-09T00:00:00.000Z', 1, signal);
    expect(remove).toHaveBeenCalledWith('real/one', signal, 1000);
    await expect(service.expire(2, signal)).resolves.toBe(2);
  });
  it('continues healthy deletions across repeated cycles while a failed first key stays due', async () => {
    const signal = new AbortController().signal;
    const due = new Set(['real/failing', 'real/healthy']);
    const confirmed = new Set<string>();
    const order = new Map<string, number>();
    let nextOrder = 0;
    const listExpired = vi.fn(async () => {
      const [key] = [...due].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
      if (key === undefined) return [];
      order.set(key, ++nextOrder);
      return [key];
    });
    let fail = true;
    const remove = vi.fn(async (key: string) => {
      if (key === 'real/failing' && fail)
        throw new Error('Private storage endpoint and credential must not escape.');
      confirmed.add(key);
      due.delete(key);
    });
    const service = new ExpireSnapshots(
      { listExpired } as unknown as SnapshotLifecycle,
      { delete: remove } as unknown as SnapshotContentStore,
      { now: () => '2026-11-09T00:00:00.000Z' },
    );
    for (let cycle = 0; cycle < 3; cycle++) {
      await expect(service.expire(2, signal, 1000)).rejects.toMatchObject({
        kind: 'exhausted',
        operation: 'snapshot-retention.expire',
        message: 'The external dependency did not recover within the retry policy.',
      });
      expect([...due]).toEqual(['real/failing']);
      expect([...confirmed]).toEqual(['real/healthy']);
    }
    expect(remove.mock.calls).toEqual([
      ['real/failing', signal, 1000],
      ['real/healthy', signal, 1000],
      ['real/failing', signal, 1000],
      ['real/failing', signal, 1000],
    ]);
    fail = false;
    await expect(service.expire(2, signal, 1000)).resolves.toBe(1);
    expect([...due]).toEqual([]);
    expect([...confirmed]).toEqual(['real/healthy', 'real/failing']);
  });
  it('stops further selected deletions when the existing cycle signal is cancelled', async () => {
    const controller = new AbortController();
    const remove = vi.fn(async () => {
      controller.abort();
      throw new Error('Deletion cancelled.');
    });
    const service = new ExpireSnapshots(
      { listExpired: async () => ['real/one', 'real/two'] } as unknown as SnapshotLifecycle,
      { delete: remove } as unknown as SnapshotContentStore,
      { now: () => '2026-11-09T00:00:00.000Z' },
    );
    await expect(service.expire(2, controller.signal, 1000)).rejects.toThrow();
    expect(remove).toHaveBeenCalledExactlyOnceWith('real/one', controller.signal, 1000);
  });
  it('does not begin deletion after cancellation', async () => {
    const controller = new AbortController();
    const remove = vi.fn();
    const service = new ExpireSnapshots(
      {
        listExpired: async () => {
          controller.abort();
          return ['real/one'];
        },
      } as unknown as SnapshotLifecycle,
      { delete: remove } as unknown as SnapshotContentStore,
      { now: () => '2026-11-09T00:00:00.000Z' },
    );
    await expect(service.expire(1, controller.signal)).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
  });
});
