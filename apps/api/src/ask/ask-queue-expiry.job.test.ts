import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { AskQueueExpiryJob } from './ask-queue-expiry.job';

describe('bounded API-owned queue expiry', () => {
  afterEach(() => vi.useRealTimers());
  it('bounds each cycle, prevents overlap, cancels and drains shutdown', async () => {
    vi.useFakeTimers();
    let operationSignal: AbortSignal | undefined;
    const expireQueued = vi.fn().mockImplementation(async (_limit: number, signal: AbortSignal) => {
      operationSignal = signal;
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      return 0;
    });
    const job = new AskQueueExpiryJob({ expireQueued });
    job.onApplicationBootstrap();
    job.start();
    expect(expireQueued).toHaveBeenCalledOnce();
    expect(expireQueued.mock.calls[0]![0]).toBe(100);
    await vi.advanceTimersByTimeAsync(1000);
    expect(expireQueued).toHaveBeenCalledOnce();
    await job.beforeApplicationShutdown();
    expect(operationSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(6000);
    expect(expireQueued).toHaveBeenCalledOnce();
  });
  it('recovers after sanitized failures and cancels the five-second deadline', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const expireQueued = vi
      .fn()
      .mockRejectedValueOnce(new Error('private SQL payload'))
      .mockImplementation(async (_limit: number, signal: AbortSignal) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
        return 0;
      });
    try {
      const job = new AskQueueExpiryJob({ expireQueued });
      job.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(warn).toHaveBeenCalledWith('Ask queue expiry failed.');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
      await vi.advanceTimersByTimeAsync(1000);
      expect(expireQueued).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(expireQueued.mock.calls[1]![1].aborted).toBe(true);
      await job.stop();
    } finally {
      warn.mockRestore();
    }
  });
});
