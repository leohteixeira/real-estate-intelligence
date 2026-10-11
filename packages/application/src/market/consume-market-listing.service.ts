import {
  parsePropertiesEvent,
  parsePropertiesEventV2,
  PropertiesEventV2,
  type PropertiesEvent,
} from '@rei/domain';
import { ExternalFailure, type Inbox, type TransactionRunner } from '../shared/index.js';
import {
  MARKET_LISTING_EVENT_TYPES,
  type MarketPriceFactsProjectionPort,
  type MarketPriceFactsEvent,
} from './market-price-facts.port.js';

export const MARKET_LISTING_CONSUMER = 'market.listing-price-facts';
function isAcceptedEvent(
  event: PropertiesEvent | PropertiesEventV2,
): event is MarketPriceFactsEvent {
  return (
    event instanceof PropertiesEventV2 ||
    (event.type.startsWith('properties.listing.') &&
      MARKET_LISTING_EVENT_TYPES.some((type) => type === event.type))
  );
}
export class ConsumeMarketListing {
  public constructor(
    private readonly facts: MarketPriceFactsProjectionPort,
    private readonly transactions: TransactionRunner,
    private readonly inbox: Inbox,
  ) {}
  public async execute(untrusted: unknown, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const event =
      typeof untrusted === 'object' &&
      untrusted !== null &&
      'version' in untrusted &&
      untrusted.version === 2
        ? parsePropertiesEventV2(untrusted)
        : parsePropertiesEvent(untrusted);
    if (!isAcceptedEvent(event))
      throw new ExternalFailure({ kind: 'rejected', operation: MARKET_LISTING_CONSUMER });
    await this.transactions.runInTransaction(async (transaction) => {
      await this.facts.project(transaction, event);
      signal.throwIfAborted();
      await this.inbox.record(transaction, MARKET_LISTING_CONSUMER, event.eventId);
      signal.throwIfAborted();
    }, signal);
  }
}
