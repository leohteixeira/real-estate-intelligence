import {
  CollectionListingSuppressed,
  PropertiesListingSuppressed,
  parseCollectionEvent,
  isSerializableEventPayload,
} from '@rei/domain';
import type {
  ListingSuppressionAuthority,
  ListingSuppressionEventAuthority,
} from '../collection/index.js';
import {
  ExternalFailure,
  type Inbox,
  type TransactionRunner,
  type OutboxAppendPort,
  type UuidV7Generator,
} from '../shared/index.js';
import type { PropertySuppressionRepository } from './listing-suppression.repository.js';
export const LISTING_SUPPRESSION_CONSUMER = 'properties.listing-suppression';
/** The broker acknowledges only after erasure, receipt and publication commit together. */
export class ConsumeListingSuppression {
  public constructor(
    private readonly authority: ListingSuppressionAuthority & ListingSuppressionEventAuthority,
    private readonly repository: PropertySuppressionRepository,
    private readonly transactions: TransactionRunner,
    private readonly inbox: Inbox,
    private readonly outbox: OutboxAppendPort,
    private readonly identifiers: UuidV7Generator,
  ) {}
  public async execute(untrusted: unknown, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const event = parseCollectionEvent(untrusted);
    if (!(event instanceof CollectionListingSuppressed))
      throw new ExternalFailure({ kind: 'rejected', operation: LISTING_SUPPRESSION_CONSUMER });
    await this.transactions.runInTransaction(async (transaction) => {
      if (
        !(await this.authority.lockAndCheck(transaction, event.payload)) ||
        !(await this.authority.verifySuppressionEvent(transaction, event))
      )
        throw new ExternalFailure({ kind: 'rejected', operation: LISTING_SUPPRESSION_CONSUMER });
      if (!(await this.inbox.record(transaction, LISTING_SUPPRESSION_CONSUMER, event.eventId)))
        return;
      const payload = await this.repository.erase(transaction, event, signal);
      if (!payload) return;
      const change = new PropertiesListingSuppressed({
        eventId: await this.identifiers.generate(transaction),
        aggregateId: payload.listingId ?? event.aggregateId,
        occurredAt: event.occurredAt,
        traceContext: event.traceContext,
        payload,
      });
      const serializable: unknown = JSON.parse(JSON.stringify(change.payload));
      if (!isSerializableEventPayload(serializable))
        throw new TypeError('Invalid suppression payload.');
      await this.outbox.append(transaction, [{ ...change, payload: serializable }]);
      signal.throwIfAborted();
    }, signal);
  }
}
