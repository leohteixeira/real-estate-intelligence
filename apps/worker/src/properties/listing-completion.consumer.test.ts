import {
  ConsumeListingCompletion,
  type EventHandler,
  type EventSubscriber,
} from '@rei/application';
import { describe, expect, it, vi } from 'vitest';
import { ListingCompletionConsumer } from './listing-completion.consumer';

describe('ListingCompletionConsumer durable acknowledgment', () => {
  it('registers the stable completion subscription and waits for transactional acceptance', async () => {
    let handler!: EventHandler;
    const subscriber: EventSubscriber = {
      subscribe: vi.fn(async (_subscription, registered) => {
        handler = registered;
      }),
    };
    let committed!: () => void;
    const execute = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          committed = resolve;
        }),
    );
    await new ListingCompletionConsumer(subscriber, {
      execute,
    } as unknown as ConsumeListingCompletion).start();
    expect(subscriber.subscribe).toHaveBeenCalledWith(
      { consumerName: 'properties.completed-run', eventTypes: ['collection.run.completed'] },
      expect.any(Function),
    );
    const signal = new AbortController().signal;
    const wire = {
      eventId: 'owned-wire',
      aggregateId: 'owned-wire',
      type: 'collection.run.completed',
      version: 1,
      occurredAt: '',
      traceContext: null,
      payload: {},
    };
    let acknowledged = false;
    const delivery = handler(wire, { signal, deadlineAt: Date.now() + 1000 }).then(() => {
      acknowledged = true;
    });
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    expect(execute).toHaveBeenCalledWith(wire, signal);
    committed();
    await delivery;
    expect(acknowledged).toBe(true);
    execute.mockRejectedValueOnce(new Error('Owned rejected completion.'));
    await expect(handler(wire, { signal, deadlineAt: Date.now() + 1000 })).rejects.toThrow(
      'Owned rejected completion.',
    );
  });
});
