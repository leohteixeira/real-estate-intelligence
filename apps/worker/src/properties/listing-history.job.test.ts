import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { ReconcileListingHistory } from '@rei/application';
import { ListingHistoryJob } from './listing-history.job';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('ListingHistoryJob bounded cancellation', () => {
  it('runs the configured batch and does not overlap cycles while graceful stop cancels active work', async () => {
    vi.useFakeTimers();
    let active: AbortSignal | undefined;
    const execute = vi.fn(async (_limit: number, signal: AbortSignal) => {
      active = signal;
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      return 0;
    });
    const job = new ListingHistoryJob({ execute } as unknown as ReconcileListingHistory);
    job.start();
    job.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toBe(25);
    await job.stop();
    expect(active?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(execute).toHaveBeenCalledTimes(1);
    await job.stop();
  });
  it('records failed cycles and safely retries the next scheduled batch', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const execute = vi.fn().mockRejectedValueOnce(new Error('owned failure')).mockResolvedValue(2);
    const job = new ListingHistoryJob({ execute } as unknown as ReconcileListingHistory);
    job.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(warn).toHaveBeenCalledWith('Listing history reconciliation failed');
    expect(execute).toHaveBeenCalledTimes(2);
    await job.stop();
    await expect(job.runCycle(new AbortController().signal)).resolves.toBeUndefined();
  });
});
