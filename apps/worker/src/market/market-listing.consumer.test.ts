import { describe, expect, it, vi } from 'vitest';
import {
  ConsumeMarketListing,
  MARKET_LISTING_CONSUMER,
  MARKET_LISTING_EVENT_TYPES,
  Transaction,
  type EventHandler,
  type EventSubscriber,
} from '@rei/application';
import { MarketListingConsumer } from './market-listing.consumer';

class Scope extends Transaction {
  public constructor() {
    super();
  }
}
describe('MarketListingConsumer', () => {
  it('subscribes all eight public types and waits for application commit', async () => {
    let handler!: EventHandler;
    const subscriber: EventSubscriber = {
      subscribe: vi.fn(async (_subscription, registered) => {
        handler = registered;
      }),
    };
    const service = new ConsumeMarketListing(
      { project: async () => undefined },
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
    await new MarketListingConsumer(subscriber, service).start();
    expect(MARKET_LISTING_EVENT_TYPES).toHaveLength(8);
    expect(subscriber.subscribe).toHaveBeenCalledWith(
      { consumerName: MARKET_LISTING_CONSUMER, eventTypes: MARKET_LISTING_EVENT_TYPES },
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
