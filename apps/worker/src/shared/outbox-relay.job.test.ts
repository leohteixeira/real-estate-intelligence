import type { EventPublisher, OutboxRelayPort, OutboxRow } from '@rei/application';
import type { UuidV7 } from '@rei/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OutboxRelayJob } from './outbox-relay.job';

const event: OutboxRow = {
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779219' as UuidV7,
  type: 'audit.trace.requested',
  version: 1,
  aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220' as UuidV7,
  occurredAt: '2026-10-10T12:30:00.000Z',
  traceContext: null,
  payload: {},
  publishedAt: null,
};

describe('OutboxRelayJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('DATABASE_URL', 'postgres://app:app@localhost:5434/app');
    vi.stubEnv('RABBITMQ_URL', 'amqp://app:app@localhost:5672/app');
    vi.stubEnv('OUTBOX_RELAY_INTERVAL_MS', '100');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('marks a row published only after publishing resolves', async () => {
    const outbox: OutboxRelayPort = {
      claimPending: vi.fn().mockResolvedValue([event]),
      markPublished: vi.fn(),
    };
    const publisher: EventPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const job = new OutboxRelayJob(outbox, publisher);

    job.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(publisher.publish).toHaveBeenCalledOnce();
    expect(outbox.markPublished).toHaveBeenCalledWith(event.eventId);
    await job.stop();
  });

  it('leaves the row pending when publisher confirmation fails', async () => {
    const outbox: OutboxRelayPort = {
      claimPending: vi.fn().mockResolvedValue([event]),
      markPublished: vi.fn(),
    };
    const publisher: EventPublisher = {
      publish: vi.fn().mockRejectedValue(new Error('broker unavailable')),
    };
    const job = new OutboxRelayJob(outbox, publisher);

    job.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(outbox.markPublished).not.toHaveBeenCalled();
    await job.stop();
  });
});
