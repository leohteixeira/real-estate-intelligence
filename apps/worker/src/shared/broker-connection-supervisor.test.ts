import type { RabbitMqEventBroker } from '@rei/infrastructure';
import { Logger } from '@nestjs/common';
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
    vi.restoreAllMocks();
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
    supervisor.start();
    await vi.advanceTimersByTimeAsync(0);

    await supervisor.stop();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(start).toHaveBeenCalledOnce();
  });

  it('logs a non-Error reconnect failure without exposing its value', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const start = vi.fn().mockRejectedValue('secret broker failure');
    const supervisor = new BrokerConnectionSupervisor({ start } as unknown as RabbitMqEventBroker);

    supervisor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(warn).toHaveBeenCalledWith('RabbitMQ connection attempt failed (Error)');
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('secret broker failure'));
    await supervisor.stop();
  });

  it('cancels a hanging reconnect before shutdown continues', async () => {
    let reconnectSignal: AbortSignal | undefined;
    const start = vi.fn(
      async (signal?: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          reconnectSignal = signal;
          signal?.addEventListener(
            'abort',
            () => reject(signal.reason instanceof Error ? signal.reason : new Error('aborted')),
            { once: true },
          );
        }),
    );
    const supervisor = new BrokerConnectionSupervisor({ start } as unknown as RabbitMqEventBroker);

    supervisor.start();
    await vi.advanceTimersByTimeAsync(0);

    await expect(supervisor.stop()).resolves.toBeUndefined();
    expect(reconnectSignal?.aborted).toBe(true);
    expect(start).toHaveBeenCalledOnce();
  });
});
