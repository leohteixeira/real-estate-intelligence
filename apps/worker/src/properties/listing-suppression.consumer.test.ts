import {
  ConsumeListingSuppression,
  type EventHandler,
  type EventSubscriber,
} from '@rei/application';
import { describe, expect, it, vi } from 'vitest';
import { ListingSuppressionConsumer } from './listing-suppression.consumer';

describe('ListingSuppressionConsumer', () => {
  it('registers the stable durable queue and waits for application commit before resolution', async () => {
    let handler!: EventHandler;
    const subscriber: EventSubscriber = {
      subscribe: vi.fn(async (_subscription, registered) => {
        handler = registered;
      }),
    };
    let commit!: () => void;
    const execute = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          commit = resolve;
        }),
    );
    const consumer = new ListingSuppressionConsumer(subscriber, {
      execute,
    } as unknown as ConsumeListingSuppression);
    await consumer.start();
    expect(subscriber.subscribe).toHaveBeenCalledWith(
      {
        consumerName: 'properties.listing-suppression',
        eventTypes: ['collection.listing.suppressed'],
      },
      expect.any(Function),
    );
    const controller = new AbortController();
    const wire = {
      eventId: 'wire',
      type: 'collection.listing.suppressed',
      version: 1,
      aggregateId: 'wire',
      occurredAt: '',
      traceContext: null,
      payload: {},
    };
    let resolved = false;
    const delivery = handler(wire, {
      signal: controller.signal,
      deadlineAt: Date.now() + 1000,
    }).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(execute).toHaveBeenCalledWith(wire, controller.signal);
    commit();
    await delivery;
    expect(resolved).toBe(true);
    execute.mockRejectedValueOnce(new Error('Malformed input.'));
    await expect(handler(wire, { signal: controller.signal, deadlineAt: 1 })).rejects.toThrow(
      'Malformed input.',
    );
    controller.abort(new Error('Delivery cancelled.'));
    execute.mockImplementationOnce(async (_wire, signal) => {
      signal.throwIfAborted();
    });
    await expect(handler(wire, { signal: controller.signal, deadlineAt: 1 })).rejects.toThrow(
      'Delivery cancelled.',
    );
  });
});
