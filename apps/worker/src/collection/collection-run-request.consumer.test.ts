import {
  type ConsumeCollectionRunRequest,
  type EventHandler,
  type EventSubscriber,
} from '@rei/application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionRunLimiter } from './collection-run-limiter';
import { CollectionRunRequestConsumer } from './collection-run-request.consumer';

const request = {
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
  type: 'collection.run.requested',
  version: 1,
  aggregateId: '0199c8f2-2394-7ba0-8f9e-286378779219',
  occurredAt: '2026-10-10T12:30:00.000Z',
  traceContext: null,
  payload: {
    sourceId: 'synthetic-portal-aurora',
    scheduledFor: '2026-10-10T12:30:00.000Z',
    operationKey: 'collection:synthetic-portal-aurora:2026-10-10T12:30:00.000Z',
  },
} as const;

function fixture() {
  let handler: EventHandler | undefined;
  const subscriber: EventSubscriber = {
    subscribe: vi.fn(async (_subscription, registered) => {
      handler = registered;
    }),
  };
  const service = { execute: vi.fn().mockResolvedValue({}) };
  const limiter = {
    run: vi.fn(async (_sourceId: string, _signal: AbortSignal, work: () => Promise<unknown>) =>
      work(),
    ),
  };
  return {
    consumer: new CollectionRunRequestConsumer(
      subscriber,
      service as unknown as ConsumeCollectionRunRequest,
      limiter as unknown as CollectionRunLimiter,
    ),
    subscriber,
    service,
    limiter,
    handler: () => handler,
  };
}

describe('CollectionRunRequestConsumer', () => {
  beforeEach(() => {
    vi.stubEnv('OBJECT_STORE_ENDPOINT', 'http://localhost:9100');
    vi.stubEnv('OBJECT_STORE_REGION', 'us-east-1');
    vi.stubEnv('OBJECT_STORE_BUCKET', 'real-estate-snapshots');
    vi.stubEnv('OBJECT_STORE_ACCESS_KEY_ID', 'fixture-access-key');
    vi.stubEnv('OBJECT_STORE_SECRET_ACCESS_KEY', 'fixture-secret-key');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('subscribes the stable scheduled-run consumer and executes under the source limiter', async () => {
    const context = fixture();
    await context.consumer.start();
    const deliveryController = new AbortController();
    const deadlineAt = Date.now() + 1_000;

    await context.handler()!(request, {
      signal: deliveryController.signal,
      deadlineAt,
    });

    expect(context.subscriber.subscribe).toHaveBeenCalledWith(
      {
        consumerName: 'collection.scheduled-run',
        eventTypes: ['collection.run.requested'],
      },
      expect.any(Function),
    );
    expect(context.limiter.run).toHaveBeenCalledWith(
      request.payload.sourceId,
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(context.service.execute).toHaveBeenCalledWith(
      request,
      expect.any(AbortSignal),
      deadlineAt,
    );
    const signal = context.service.execute.mock.calls[0]![1] as AbortSignal;
    deliveryController.abort(new Error('worker stopping'));
    expect(signal.aborted).toBe(true);
  });

  it('rejects an invalid command before acquiring a collection permit', async () => {
    const context = fixture();
    await context.consumer.start();

    await expect(
      context.handler()!(
        { ...request, payload: {} },
        {
          signal: new AbortController().signal,
          deadlineAt: Date.now() + 120_000,
        },
      ),
    ).rejects.toThrow();
    expect(context.limiter.run).not.toHaveBeenCalled();
    expect(context.service.execute).not.toHaveBeenCalled();
  });
});
