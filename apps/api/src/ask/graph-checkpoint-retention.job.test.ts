import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { GraphCheckpointRetentionJob } from './graph-checkpoint-retention.job';
describe('bounded checkpoint retention lifecycle', () => {
  afterEach(() => vi.useRealTimers());
  it('starts once, prevents overlap, cancels and drains shutdown', async () => {
    vi.useFakeTimers();
    let stop: () => void = () => {};
    let operationSignal: AbortSignal | undefined;
    const prune = vi.fn().mockImplementation(async (_limit: number, signal: AbortSignal) => {
      operationSignal = signal;
      await new Promise<void>((resolve) => {
        stop = resolve;
        signal.addEventListener('abort', resolve.bind(undefined, undefined), { once: true });
      });
      return 0;
    });
    const job = new GraphCheckpointRetentionJob({ execute: vi.fn(), prune });
    job.onApplicationBootstrap();
    job.start();
    expect(prune).toHaveBeenCalledOnce();
    expect(prune.mock.calls[0]![0]).toBe(50);
    await vi.advanceTimersByTimeAsync(1000);
    expect(prune).toHaveBeenCalledOnce();
    const shutdown = job.beforeApplicationShutdown();
    expect(operationSignal?.aborted).toBe(true);
    stop();
    await shutdown;
    await vi.advanceTimersByTimeAsync(60000);
    expect(prune).toHaveBeenCalledOnce();
  });
  it('recovers after sanitized failures and enforces the five-second operation deadline', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const prune = vi
      .fn()
      .mockRejectedValueOnce(new Error('private database details'))
      .mockImplementation(async (_limit: number, signal: AbortSignal) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
        return 0;
      });
    const job = new GraphCheckpointRetentionJob({ execute: vi.fn(), prune });
    job.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith('Ask checkpoint retention failed.');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
    await vi.advanceTimersByTimeAsync(60000);
    expect(prune).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(prune.mock.calls[1]![1].aborted).toBe(true);
    await job.stop();
    warn.mockRestore();
  });
});
