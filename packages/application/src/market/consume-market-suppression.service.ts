import {
  CollectionListingSuppressed,
  parseCollectionEvent,
  parsePropertiesListingSuppressed,
  PROPERTIES_LISTING_SUPPRESSED_TYPE,
} from '@rei/domain';
import type {
  ListingSuppressionAuthority,
  ListingSuppressionEventAuthority,
} from '../collection/index.js';
import { ExternalFailure, type Inbox, type TransactionRunner } from '../shared/index.js';
import type { MarketSuppressionPort } from './market-suppression.port.js';
export const MARKET_SUPPRESSION_CONSUMER = 'market.listing-suppression';
export class ConsumeMarketSuppression {
  public constructor(
    private readonly authority: ListingSuppressionAuthority & ListingSuppressionEventAuthority,
    private readonly facts: MarketSuppressionPort,
    private readonly transactions: TransactionRunner,
    private readonly inbox: Inbox,
  ) {}
  public async execute(untrusted: unknown, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const event =
      typeof untrusted === 'object' &&
      untrusted !== null &&
      'type' in untrusted &&
      untrusted.type === PROPERTIES_LISTING_SUPPRESSED_TYPE
        ? parsePropertiesListingSuppressed(untrusted)
        : parseCollectionEvent(untrusted);
    if (
      !(event instanceof CollectionListingSuppressed) &&
      event.type !== PROPERTIES_LISTING_SUPPRESSED_TYPE
    )
      throw new ExternalFailure({ kind: 'rejected', operation: MARKET_SUPPRESSION_CONSUMER });
    const cause =
      event instanceof CollectionListingSuppressed
        ? event
        : new CollectionListingSuppressed({
            eventId: event.payload.causeEventId,
            aggregateId: event.payload.suppressionId,
            occurredAt: event.occurredAt,
            traceContext: null,
            payload: {
              sourceId: event.payload.sourceId,
              sourceListingId: event.payload.sourceListingId,
            },
          });
    await this.transactions.runInTransaction(async (transaction) => {
      if (
        !(await this.authority.lockAndCheck(transaction, cause.payload)) ||
        !(await this.authority.verifySuppressionEvent(transaction, cause))
      )
        throw new ExternalFailure({ kind: 'rejected', operation: MARKET_SUPPRESSION_CONSUMER });
      await this.facts.erase(transaction, event);
      signal.throwIfAborted();
      await this.inbox.record(transaction, MARKET_SUPPRESSION_CONSUMER, event.eventId);
      signal.throwIfAborted();
    }, signal);
  }
}
