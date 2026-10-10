import type { RequestDueCollectionRuns } from '@rei/application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionScheduleJob } from './collection-schedule.job';

describe('CollectionScheduleJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('OBJECT_STORE_ENDPOINT', 'http://localhost:9100');
    vi.stubEnv('OBJECT_STORE_REGION', 'us-east-1');
    vi.stubEnv('OBJECT_STORE_BUCKET', 'real-estate-snapshots');
    vi.stubEnv('OBJECT_STORE_ACCESS_KEY_ID', 'fixture-access-key');
    vi.stubEnv('OBJECT_STORE_SECRET_ACCESS_KEY', 'fixture-secret-key');
    vi.stubEnv('COLLECTION_SCHEDULE_INTERVAL_MS', '100');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('polls immediately, does not overlap, and aborts the active poll on stop', async () => {
    let resolve!: (value: readonly []) => void;
    const pending = new Promise<readonly []>((done) => {
      resolve = done;
    });
    const requestDueRuns = { execute: vi.fn().mockReturnValue(pending) };
    const job = new CollectionScheduleJob(requestDueRuns as unknown as RequestDueCollectionRuns);

    job.start();
    await vi.advanceTimersByTimeAsync(300);

    expect(requestDueRuns.execute).toHaveBeenCalledOnce();
    expect(requestDueRuns.execute).toHaveBeenCalledWith(10, null, expect.any(AbortSignal));
    const signal = requestDueRuns.execute.mock.calls[0]![2] as AbortSignal;
    const stopping = job.stop();
    expect(signal.aborted).toBe(true);
    resolve([]);
    await stopping;
  });

  it('runs another bounded poll after the preceding poll settles', async () => {
    const requestDueRuns = { execute: vi.fn().mockResolvedValue([]) };
    const job = new CollectionScheduleJob(requestDueRuns as unknown as RequestDueCollectionRuns);

    job.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(requestDueRuns.execute).toHaveBeenCalledTimes(2);
    await job.stop();
  });
});
