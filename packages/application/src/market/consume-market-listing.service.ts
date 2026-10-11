import { parsePropertiesEvent, type PropertiesEvent } from '@rei/domain';
import { ExternalFailure, type Inbox, type TransactionRunner } from '../shared/index.js';
import {
  MARKET_LISTING_EVENT_TYPES,
  type MarketListingEvent,
  type MarketPriceFactsProjectionPort,
} from './market-price-facts.port.js';

export const MARKET_LISTING_CONSUMER = 'market.listing-price-facts';
function isListingEvent(event: PropertiesEvent): event is MarketListingEvent {
  return MARKET_LISTING_EVENT_TYPES.some((type) => type === event.type);
}
export class ConsumeMarketListing {
  public constructor(
    private readonly facts: MarketPriceFactsProjectionPort,
    private readonly transactions: TransactionRunner,
    private readonly inbox: Inbox,
  ) {}
  public async execute(untrusted: unknown, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const event = parsePropertiesEvent(untrusted);
    if (!isListingEvent(event))
      throw new ExternalFailure({ kind: 'rejected', operation: MARKET_LISTING_CONSUMER });
    await this.transactions.runInTransaction(async (transaction) => {
      await this.facts.project(transaction, event);
      signal.throwIfAborted();
      await this.inbox.record(transaction, MARKET_LISTING_CONSUMER, event.eventId);
      signal.throwIfAborted();
    }, signal);
  }
}
