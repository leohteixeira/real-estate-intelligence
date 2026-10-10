import {
  COLLECTION_SNAPSHOT_PARSED_TYPE,
  CollectionSnapshotCorrected,
  Property,
  parseCollectionEvent,
  isOwnedSyntheticSourceId,
} from '@rei/domain';
import type { CollectionFacade } from '../collection/index.js';
import type { LocationsFacade } from '../locations/index.js';
import {
  ExternalFailure,
  type Inbox,
  type OutboxAppendPort,
  type TransactionRunner,
  type UuidV7Generator,
} from '../shared/index.js';
import type { PropertyRepository } from './property.repository.js';

export const PARSED_LISTING_CONSUMER = 'properties.parsed-listing';

/** Acknowledgement belongs to transport only after this transaction resolves. */
export class ConsumeParsedListing {
  public constructor(
    private readonly collection: Pick<CollectionFacade, 'verifyParsedEvent'>,
    private readonly locations: Pick<LocationsFacade, 'resolveFixtureAddress'>,
    private readonly repository: PropertyRepository,
    private readonly transactions: TransactionRunner,
    private readonly inbox: Inbox,
    private readonly outbox: OutboxAppendPort,
    private readonly identifiers: UuidV7Generator,
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
      const resolved = await this.locations.resolveFixtureAddress(
        event.payload.listing.location,
        transaction,
      );
      if (!resolved)
        throw new ExternalFailure({ kind: 'rejected', operation: 'properties.parsed-listing' });
      if (!(await this.inbox.record(transaction, PARSED_LISTING_CONSUMER, event.eventId))) return;
      const { sourceId, sourceListingId } = event.payload.source;
      await this.repository.lockSourceIdentity(transaction, sourceId, sourceListingId);
      if (await this.repository.hasFact(transaction, event.eventId)) return;
      const existing = await this.repository.findSourceIdentity(
        transaction,
        sourceId,
        sourceListingId,
      );
      if (event instanceof CollectionSnapshotCorrected || existing) {
        await this.repository.appendFact(
          transaction,
          event,
          event instanceof CollectionSnapshotCorrected ? 'pending-correction' : 'pending-history',
        );
      } else {
        const propertyId = await this.identifiers.generate(transaction);
        const listingId = await this.identifiers.generate(transaction);
        const property = new Property(propertyId, listingId, event, resolved);
        await this.repository.appendFact(transaction, event, 'initial');
        await this.repository.create(transaction, property);
        const creation = property.creationEvent(await this.identifiers.generate(transaction));
        await this.outbox.append(transaction, [
          {
            ...creation,
            payload: {
              ...creation.payload,
              listing: {
                ...creation.payload.listing,
                provenance: { ...creation.payload.listing.provenance },
              },
            },
          },
        ]);
      }
      signal.throwIfAborted();
    }, signal);
  }
}
