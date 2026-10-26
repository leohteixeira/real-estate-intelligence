import { describe, expect, it, vi } from 'vitest';
import {
  ConsumeMarketSuppression,
  MARKET_SUPPRESSION_CONSUMER,
  Transaction,
  type EventHandler,
  type EventSubscriber,
} from '@rei/application';
import { MarketSuppressionConsumer } from './market-suppression.consumer';
import {
  COLLECTION_LISTING_SUPPRESSED_TYPE,
  PROPERTIES_LISTING_SUPPRESSED_TYPE,
} from '@rei/domain';

class Scope extends Transaction {
  public constructor() {
    super();
  }
}
describe('MarketSuppressionConsumer', () => {
  it('subscribes the strict completion type and waits for application commit', async () => {
    let handler!: EventHandler;
    const subscriber: EventSubscriber = {
      subscribe: vi.fn(async (_subscription, registered) => {
        handler = registered;
      }),
    };
    const service = new ConsumeMarketSuppression(
      {
        lockAndCheck: async () => true,
        verifySuppressionEvent: async () => true,
        isSuppressed: async () => true,
      },
      { erase: async () => undefined },
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
    await new MarketSuppressionConsumer(subscriber, service).start();
    expect(subscriber.subscribe).toHaveBeenCalledWith(
      {
        consumerName: MARKET_SUPPRESSION_CONSUMER,
        eventTypes: [COLLECTION_LISTING_SUPPRESSED_TYPE, PROPERTIES_LISTING_SUPPRESSED_TYPE],
      },
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
