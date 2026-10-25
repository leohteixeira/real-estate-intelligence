import {
  CollectionListingSuppressed,
  parseCollectionSourceListingId,
  type TraceContext,
} from '@rei/domain';
import {
  ExternalFailure,
  type Clock,
  type OutboxAppendPort,
  type TransactionRunner,
  type UuidV7Generator,
} from '../shared/index.js';
import { validateSourceId } from './enable-source.service.js';
import type {
  ListingIdentity,
  ListingSuppression,
  ListingSuppressionRepository,
  CollectedCopyErasure,
} from './listing-suppression.port.js';
import type { SourceRegisterRepository } from './source-register.repository.js';

/** Suppression commits first. A failed deletion leaves the same command resumable. */
export class RemoveListing {
  public constructor(
    private readonly suppression: ListingSuppressionRepository,
    private readonly sources: SourceRegisterRepository,
    private readonly snapshots: {
      delete(key: string, signal: AbortSignal, deadlineAt?: number): Promise<void>;
    },
    private readonly copies: readonly CollectedCopyErasure[],
    private readonly transactions: TransactionRunner,
    private readonly identifiers: UuidV7Generator,
    private readonly clock: Clock,
    private readonly outbox: OutboxAppendPort,
  ) {}
  public async execute(
    sourceId: string,
    sourceListingId: string,
    traceContext: TraceContext | null,
    signal: AbortSignal,
    deadlineAt?: number,
  ): Promise<ListingSuppression> {
    const identity: ListingIdentity = {
      sourceId: validateSourceId(sourceId),
      sourceListingId: parseCollectionSourceListingId(sourceListingId),
    };
    signal.throwIfAborted();
    const source = await this.sources.findById(sourceId, signal);
    if (!source || !['listing', 'synthetic-listing'].includes(source.category))
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.listing.remove' });
    const record = await this.transactions.runInTransaction(async (transaction) => {
      const result = await this.suppression.record(transaction, {
        ...identity,
        suppressionId: await this.identifiers.generate(transaction),
        eventId: await this.identifiers.generate(transaction),
        suppressedAt: this.clock.now(),
        completed: false,
      });
      if (result.created)
        await this.outbox.append(transaction, [
          new CollectionListingSuppressed({
            eventId: result.suppression.eventId,
            aggregateId: result.suppression.suppressionId,
            occurredAt: result.suppression.suppressedAt,
            traceContext,
            payload: identity,
          }),
        ]);
      return result.suppression;
    }, signal);
    if (record.completed) return record;
    for (const key of await this.suppression.listObjectKeys(identity, signal)) {
      signal.throwIfAborted();
      await this.snapshots.delete(key, signal, deadlineAt);
    }
    await this.transactions.runInTransaction(async (transaction) => {
      await this.suppression.lockAndCheck(transaction, identity);
      for (const owner of this.copies) await owner.eraseListingCopies(transaction, identity);
      await this.suppression.eraseCollectedData(transaction, identity);
      signal.throwIfAborted();
      await this.suppression.complete(transaction, identity);
    }, signal);
    return { ...record, completed: true };
  }
}
