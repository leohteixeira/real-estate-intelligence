import type { RabbitMqEventBroker } from '@rei/infrastructure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrokerConnectionSupervisor } from './broker-connection-supervisor';

describe('BrokerConnectionSupervisor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('DATABASE_URL', 'postgres://app:app@localhost:5434/app');
    vi.stubEnv('RABBITMQ_URL', 'amqp://app:app@localhost:5672/app');
    vi.stubEnv('RABBITMQ_RECONNECT_INTERVAL_MS', '100');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('makes one bounded connection attempt per tick and never overlaps attempts', async () => {
    let settle: (() => void) | undefined;
    const start = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const supervisor = new BrokerConnectionSupervisor({ start } as unknown as RabbitMqEventBroker);

    supervisor.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(start).toHaveBeenCalledOnce();

    settle!();
    await vi.advanceTimersByTimeAsync(100);
    expect(start).toHaveBeenCalledTimes(2);
    settle!();
    await supervisor.stop();
  });

  it('stops scheduling before shutdown continues', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const supervisor = new BrokerConnectionSupervisor({ start } as unknown as RabbitMqEventBroker);
    supervisor.start();
    await vi.advanceTimersByTimeAsync(0);

    await supervisor.stop();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(start).toHaveBeenCalledOnce();
  });
});
