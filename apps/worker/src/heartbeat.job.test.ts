import type { DatabaseAvailabilityProbe } from '@rei/application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HeartbeatJob } from './heartbeat.job';

describe('HeartbeatJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('DATABASE_URL', 'postgres://app:app@localhost:5434/app');
    vi.stubEnv('RABBITMQ_URL', 'amqp://app:app@localhost:5672/app');
    vi.stubEnv('WORKER_INTERVAL_MS', '1000');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('runs immediately and stops scheduling heartbeats', async () => {
    const probe: DatabaseAvailabilityProbe = {
      isAvailable: vi.fn().mockResolvedValue(true),
    };
    const job = new HeartbeatJob(probe);

    job.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(probe.isAvailable).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(probe.isAvailable).toHaveBeenCalledTimes(2);

    job.stop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(probe.isAvailable).toHaveBeenCalledTimes(2);
  });
});
