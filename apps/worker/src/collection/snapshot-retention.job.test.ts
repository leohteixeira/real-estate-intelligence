import { Logger } from '@nestjs/common';
import {
  ExpireSnapshots,
  type SnapshotRetention,
  type SnapshotContentStore,
} from '@rei/application';
import { InMemorySnapshotLifecycle } from '@rei/infrastructure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SnapshotRetentionJob } from './snapshot-retention.job';
import { ResilientRawSnapshotStore } from './resilient-raw-snapshot-store';

vi.mock('../config', () => ({
  readScheduledCollectionConfig: () => ({
    snapshotRetentionIntervalMs: 100,
    snapshotRetentionCycleTimeoutMs: 500,
    snapshotRetentionBatchSize: 10,
  }),
}));

describe('worker snapshot retention lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it('starts immediately, never overlaps and awaits active maintenance on shutdown', async () => {
    let resolve!: (value: number) => void;
    const retention: SnapshotRetention = {
      expire: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<number>((done) => {
              resolve = done;
            }),
        )
        .mockResolvedValue(0),
    };
    const job = new SnapshotRetentionJob(retention);
    job.start();
    job.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(retention.expire).toHaveBeenCalledOnce();
    expect(vi.mocked(retention.expire).mock.calls[0]?.[0]).toBe(10);
    resolve(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(retention.expire).toHaveBeenCalledTimes(2);
    await job.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(retention.expire).toHaveBeenCalledTimes(2);
  });
  it('reaches healthy peers at a fixed clock after a slow deletion consumes a larger cycle', async () => {
    const lifecycle = new InMemorySnapshotLifecycle();
    const collectedAt = '2026-10-10T00:00:00.000Z';
    const now = '2026-11-09T00:00:00.000Z';
    const objects = new Set(['real/one-slow', 'real/two-healthy', 'real/three-healthy']);
    for (const objectKey of objects)
      await lifecycle.reserve(
        {
          objectKey,
          acquisitionScope: objectKey,
          sourceId: 'fixture',
          contentHash: `sha256:${'a'.repeat(64)}`,
          byteLength: 1,
          mediaType: 'application/json',
          keyId: 'fixture',
          collectedAt,
        },
        new AbortController().signal,
      );
    const selected = vi.spyOn(lifecycle, 'listExpired');
    let slow = true;
    const remove = vi.fn(async (objectKey: string, signal: AbortSignal) => {
      if (objectKey === 'real/one-slow' && slow)
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      await lifecycle.withGeneration(objectKey, signal, async (_generation, transaction) => {
        objects.delete(objectKey);
        await lifecycle.markDeleted(transaction, objectKey, '2026-11-09T00:00:00.100Z');
      });
    });
    const store = { store: vi.fn(), read: vi.fn(), delete: remove } as SnapshotContentStore;
    const job = new SnapshotRetentionJob(
      new ExpireSnapshots(lifecycle, new ResilientRawSnapshotStore(store), { now: () => now }),
    );
    const first = job.runCycle(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(500);
    await first;
    expect(remove.mock.calls.map(([key]) => key)).toEqual(['real/one-slow']);
    expect(selected).toHaveBeenCalledTimes(1);
    expect(objects.size).toBe(3);
    const second = job.runCycle(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(500);
    await second;
    expect(remove.mock.calls.map(([key]) => key)).toEqual([
      'real/one-slow',
      'real/three-healthy',
      'real/two-healthy',
      'real/one-slow',
    ]);
    expect(objects).toEqual(new Set(['real/one-slow']));
    expect(lifecycle.generations.get('real/one-slow')).toMatchObject({
      collectedAt,
      expiresAt: now,
      deleted: false,
      available: false,
    });
    expect(selected.mock.calls.every(([, limit]) => limit === 1)).toBe(true);
    slow = false;
    await job.runCycle(new AbortController().signal);
    expect(objects.size).toBe(0);
    expect(remove).toHaveBeenCalledTimes(5);
  });
  it.each(['stop', 'timeout'])(
    'propagates cycle cancellation for %s without reporting a successful deletion',
    async (method) => {
      let attempt: AbortSignal | undefined;
      const expire = vi.fn(
        (_limit: number, signal: AbortSignal) =>
          new Promise<number>((_resolve, reject) => {
            attempt = signal;
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          }),
      );
      const job = new SnapshotRetentionJob({ expire });
      job.start();
      await vi.advanceTimersByTimeAsync(method === 'timeout' ? 500 : 0);
      await job.stop();
      expect(attempt?.aborted).toBe(true);
    },
  );
  it('emits only categorical failure telemetry and tolerates already-aborted cycles', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const job = new SnapshotRetentionJob({
      expire: vi.fn().mockRejectedValue(new Error('private credential and payload')),
    });
    await job.runCycle(new AbortController().signal);
    expect(warn).toHaveBeenCalledExactlyOnceWith('Snapshot retention failed');
    const controller = new AbortController();
    controller.abort();
    await job.runCycle(controller.signal);
    expect(warn).toHaveBeenCalledOnce();
  });
});
