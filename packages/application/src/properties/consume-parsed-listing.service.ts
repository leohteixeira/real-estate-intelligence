import {
  COLLECTION_SNAPSHOT_PARSED_TYPE,
  CollectionSnapshotCorrected,
  parseCollectionEvent,
  isOwnedSyntheticSourceId,
  NormalizedListing,
} from '@rei/domain';
import type { CollectionFacade } from '../collection/index.js';
import type { LocationsFacade } from '../locations/index.js';
import { ExternalFailure, type Inbox, type TransactionRunner } from '../shared/index.js';
import type { PropertyRepository } from './property.repository.js';
import type { ListingHistoryRepository } from './listing-history.repository.js';

export const PARSED_LISTING_CONSUMER = 'properties.parsed-listing';

/** Acknowledgement belongs to transport only after this transaction resolves. */
export class ConsumeParsedListing {
  public constructor(
    private readonly collection: Pick<CollectionFacade, 'verifyParsedEvent'>,
    private readonly locations: Pick<LocationsFacade, 'resolveFixtureAddress'>,
    private readonly repository: PropertyRepository,
    private readonly transactions: TransactionRunner,
    private readonly inbox: Inbox,
    private readonly history: Pick<ListingHistoryRepository, 'enqueue'>,
  ) {}
  public async execute(untrusted: unknown, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const event = parseCollectionEvent(untrusted);
    if (
      event.type !== COLLECTION_SNAPSHOT_PARSED_TYPE ||
      !isOwnedSyntheticSourceId(event.payload.source.sourceId)
    )
      throw new ExternalFailure({ kind: 'rejected', operation: 'properties.parsed-listing' });
    await this.transactions.runInTransaction(async (transaction) => {
      if (!(await this.collection.verifyParsedEvent(transaction, event)))
        throw new ExternalFailure({ kind: 'rejected', operation: 'properties.parsed-listing' });
      signal.throwIfAborted();
      // Authenticated corrections are durable work; their business refusal is scoped during
      // reconciliation, so an invalid correction cannot discard its valid original acquisition.
      if (!(event instanceof CollectionSnapshotCorrected)) {
        const resolved = await this.locations.resolveFixtureAddress(
          event.payload.listing.location,
          transaction,
        );
        if (!resolved)
          throw new ExternalFailure({ kind: 'rejected', operation: 'properties.parsed-listing' });
        new NormalizedListing(event);
      }
      if (!(await this.inbox.record(transaction, PARSED_LISTING_CONSUMER, event.eventId))) return;
      const { sourceId, sourceListingId } = event.payload.source;
      await this.history.enqueue(transaction, sourceId);
      await this.repository.lockSourceIdentity(transaction, sourceId, sourceListingId);
      if (await this.repository.hasFact(transaction, event.eventId)) return;
      await this.repository.appendFact(
        transaction,
        event,
        event instanceof CollectionSnapshotCorrected ? 'pending-correction' : 'pending-history',
      );
      signal.throwIfAborted();
    }, signal);
  }
}
