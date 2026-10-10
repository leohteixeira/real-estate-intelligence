import { Logger } from '@nestjs/common';
import type { InboxRetentionPort, OutboxRetentionPort } from '@rei/application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeliveryRetentionJob } from './delivery-retention.job';

function abortingOperation(signal: AbortSignal): Promise<number> {
  return new Promise((_resolve, reject) => {
    const abort = (): void => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

describe('DeliveryRetentionJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('DATABASE_URL', 'postgres://app:app@localhost:5434/app');
    vi.stubEnv('RABBITMQ_URL', 'amqp://app:app@localhost:5672/app');
    vi.stubEnv('DELIVERY_RETENTION_INTERVAL_MS', '100');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('attempts both bounded stores when one fails and never overlaps a cycle', async () => {
    let resolveInbox: ((value: number) => void) | undefined;
    const outbox: OutboxRetentionPort = {
      prunePublished: vi.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const inbox: InboxRetentionPort = {
      pruneConsumed: vi
        .fn()
        .mockImplementationOnce(() => new Promise<number>((resolve) => (resolveInbox = resolve)))
        .mockResolvedValue(0),
    };
    const job = new DeliveryRetentionJob(outbox, inbox);

    job.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(outbox.prunePublished).toHaveBeenCalledOnce();
    expect(inbox.pruneConsumed).toHaveBeenCalledOnce();

    resolveInbox!(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(outbox.prunePublished).toHaveBeenCalledTimes(2);
    await job.stop();
  });

  it('passes one cycle signal to both stores and aborts active maintenance on stop', async () => {
    const outbox: OutboxRetentionPort = {
      prunePublished: vi.fn((_r, _b, s) => abortingOperation(s)),
    };
    const inbox: InboxRetentionPort = { pruneConsumed: vi.fn((_r, _b, s) => abortingOperation(s)) };
    const job = new DeliveryRetentionJob(outbox, inbox);

    job.start();
    await vi.advanceTimersByTimeAsync(0);
    const outboxSignal = vi.mocked(outbox.prunePublished).mock.calls[0]?.[2];
    const inboxSignal = vi.mocked(inbox.pruneConsumed).mock.calls[0]?.[2];
    expect(outboxSignal).toBe(inboxSignal);

    await job.stop();
    expect(outboxSignal?.aborted).toBe(true);
  });

  it('keeps an earlier store failure classified as failed when shutdown cancels its sibling', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const outbox: OutboxRetentionPort = {
      prunePublished: vi.fn().mockRejectedValue(new Error('query failed')),
    };
    const inbox: InboxRetentionPort = { pruneConsumed: vi.fn((_r, _b, s) => abortingOperation(s)) };
    const job = new DeliveryRetentionJob(outbox, inbox);

    job.start();
    await vi.advanceTimersByTimeAsync(0);
    await job.stop();

    expect(warn).toHaveBeenCalledWith('outbox retention failed (Error)');
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('inbox retention failed'));
  });
});
