import { describe, expect, it, vi } from 'vitest';
import {
  ConsumeMarketCompletion,
  MARKET_COMPLETION_CONSUMER,
  Transaction,
  type EventHandler,
  type EventSubscriber,
} from '@rei/application';
import { MarketCompletionConsumer } from './market-completion.consumer';
import { COLLECTION_RUN_COMPLETED_TYPE } from '@rei/domain';

class Scope extends Transaction {
  public constructor() {
    super();
  }
}
describe('MarketCompletionConsumer', () => {
  it('subscribes the strict completion type and waits for application commit', async () => {
    let handler!: EventHandler;
    const subscriber: EventSubscriber = {
      subscribe: vi.fn(async (_subscription, registered) => {
        handler = registered;
      }),
    };
    const service = new ConsumeMarketCompletion(
      { complete: async () => undefined },
      { runInTransaction: (work) => work(new Scope()) },
      { record: async () => true },
    );
    let commit!: () => void;
    const execute = vi.spyOn(service, 'execute').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          commit = resolve;
        }),
    );
    await new MarketCompletionConsumer(subscriber, service).start();
    expect(subscriber.subscribe).toHaveBeenCalledWith(
      { consumerName: MARKET_COMPLETION_CONSUMER, eventTypes: [COLLECTION_RUN_COMPLETED_TYPE] },
      expect.any(Function),
    );
    const wire = {
      eventId: 'id',
      type: 'properties.listing.created',
      version: 1,
      aggregateId: 'id',
      occurredAt: '',
      traceContext: null,
      payload: {},
    };
    const controller = new AbortController();
    let resolved = false;
    const delivered = handler(wire, {
      signal: controller.signal,
      deadlineAt: Date.now() + 1000,
    }).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(execute).toHaveBeenCalledWith(wire, controller.signal);
    commit();
    await delivered;
    expect(resolved).toBe(true);
    execute.mockRejectedValueOnce(new Error('Projection failed'));
    await expect(handler(wire, { signal: controller.signal, deadlineAt: 1 })).rejects.toThrow(
      'Projection failed',
    );
  });
});
