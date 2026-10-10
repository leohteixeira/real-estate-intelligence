import {
  CollectionRunCompleted,
  CollectionSnapshotParsed,
  StaleCollectionCheckpointError,
  hashCollectionManifest,
  parseCollectionCheckpointCursor,
  parseCollectionSourceListingId,
  type CollectedListing,
  type CollectionRunState,
  type TraceContext,
} from '@rei/domain';

import type {
  Clock,
  OutboxAppendPort,
  TransactionRunner,
  UuidV7Generator,
} from '../shared/index.js';
import { ExternalFailure } from '../shared/index.js';
import type {
  CollectionRunRepository,
  CommitCollectionObservationInput,
} from './collection-run.repository.js';
import type {
  ListingSource,
  ListingSourcePage,
  RawListingDocument,
} from './listing-source.port.js';
import type { RawSnapshotStore, StoredRawSnapshot } from './raw-snapshot-store.port.js';
import type { SourceRegisterRepository } from './source-register.repository.js';

const OPERATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

interface PreparedObservation {
  readonly document: RawListingDocument;
  readonly stored: StoredRawSnapshot;
  readonly listing: CollectedListing;
}

export interface CollectSourceRunResult {
  readonly operationKey: string;
  readonly runId: CollectionRunState['runId'];
  readonly sourceId: string;
  readonly observedCount: number;
  readonly parsedCount: number;
  readonly manifestHash: NonNullable<CollectionRunState['manifestHash']>;
  readonly completedEventId: NonNullable<CollectionRunState['completedEventId']>;
  readonly completedAt: string;
  readonly replayed: boolean;
}

function validateOperationKey(value: string): string {
  if (!OPERATION_KEY_PATTERN.test(value)) {
    throw new TypeError(
      'operationKey must contain 1-200 safe identifier characters and start with a letter or digit.',
    );
  }
  return value;
}

function completedResult(run: CollectionRunState, replayed: boolean): CollectSourceRunResult {
  if (
    run.status !== 'completed' ||
    run.manifestHash === null ||
    run.completedEventId === null ||
    run.completedAt === null
  ) {
    throw new TypeError('A running collection run cannot be returned as a completed result.');
  }
  return Object.freeze({
    operationKey: run.operationKey,
    runId: run.runId,
    sourceId: run.sourceId,
    observedCount: run.counts.observed,
    parsedCount: run.counts.parsed,
    manifestHash: run.manifestHash,
    completedEventId: run.completedEventId,
    completedAt: run.completedAt,
    replayed,
  });
}

function validatePage(
  page: ListingSourcePage,
  sourceId: string,
  consumedCursor: string | null,
): void {
  try {
    parseCollectionCheckpointCursor(page.nextCursor);
  } catch {
    throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch-page' });
  }
  if (!page.exhausted && page.documents.length === 0) {
    throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch-page' });
  }
  if (!page.exhausted && page.nextCursor === consumedCursor) {
    throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch-page' });
  }
  const identities = new Set<string>();
  for (const document of page.documents) {
    let sourceListingId: string;
    try {
      sourceListingId = parseCollectionSourceListingId(document.sourceListingId);
    } catch {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch-page' });
    }
    if (document.sourceId !== sourceId || identities.has(sourceListingId)) {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch-page' });
    }
    identities.add(sourceListingId);
  }
}

/** Runs an explicitly requested source sequentially, resuming only from committed checkpoints. */
export class CollectSourceRun {
  public constructor(
    private readonly source: ListingSource,
    private readonly snapshots: RawSnapshotStore,
    private readonly sources: SourceRegisterRepository,
    private readonly runs: CollectionRunRepository,
    private readonly transactions: TransactionRunner,
    private readonly identifiers: UuidV7Generator,
    private readonly clock: Clock,
    private readonly outbox: OutboxAppendPort,
  ) {}

  public async execute(
    sourceId: string,
    operationKeyInput: string,
    traceContext: TraceContext | null,
    signal: AbortSignal,
  ): Promise<CollectSourceRunResult> {
    const operationKey = validateOperationKey(operationKeyInput);
    signal.throwIfAborted();
    let run = await this.runs.loadRunByOperationKey(operationKey, signal);
    if (run && run.sourceId !== sourceId) {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });
    }
    if (run?.status === 'completed') return completedResult(run, true);

    const registration = await this.sources.findById(sourceId, signal);
    if (
      registration === null ||
      !registration.enabled ||
      !registration.permissions.collectionAllowed ||
      registration.category !== 'synthetic-listing'
    ) {
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.fetch-page' });
    }

    if (!run) {
      const startedAt = this.clock.now();
      run = await this.transactions.runInTransaction(async (transaction) => {
        const runId = await this.identifiers.generate(transaction);
        return this.runs.startOrLoad(transaction, { operationKey, runId, sourceId, startedAt });
      }, signal);
      if (run.sourceId !== sourceId) {
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });
      }
      if (run.status === 'completed') return completedResult(run, true);
    }

    for (;;) {
      signal.throwIfAborted();
      const expected = run.checkpoint;
      const page = await this.source.fetchPage(sourceId, expected.cursor, signal);
      validatePage(page, sourceId, expected.cursor);

      const prepared: PreparedObservation[] = [];
      for (const document of page.documents) {
        signal.throwIfAborted();
        const stored = await this.snapshots.store(
          { sourceId, mediaType: document.mediaType, synthetic: true, bytes: document.bytes },
          signal,
        );
        signal.throwIfAborted();
        const listing = await this.source.parse(document, signal);
        prepared.push({ document, stored, listing });
      }

      try {
        const transition = await this.transactions.runInTransaction(async (transaction) => {
          const locked = await this.runs.lockRunForPage(
            transaction,
            run!.runId,
            expected.ordinal,
            expected.cursor,
          );
          if (locked.status === 'completed') return { run: locked, committed: false };

          const prefix = await this.runs.listObservations(transaction, locked.runId);
          const prefixByIdentity = new Map(prefix.map((item) => [item.sourceListingId, item]));
          for (const item of prepared) {
            const existing = prefixByIdentity.get(item.document.sourceListingId);
            if (
              existing &&
              (existing.contentHash !== item.stored.contentHash ||
                existing.sourceUrl !== item.document.sourceUrl ||
                existing.observedAt !== item.document.observedAt)
            ) {
              throw new ExternalFailure({
                kind: 'rejected',
                operation: 'collection.run.commit-page',
              });
            }
            if (existing) {
              throw new ExternalFailure({
                kind: 'rejected',
                operation: 'collection.run.commit-page',
              });
            }
          }

          const observations: CommitCollectionObservationInput[] = [];
          const parsedEvents: CollectionSnapshotParsed[] = [];
          const occurredAt = this.clock.now();
          for (const item of prepared) {
            const snapshotId = await this.identifiers.generate(transaction);
            const parsedEventId = await this.identifiers.generate(transaction);
            observations.push({
              snapshotId,
              parsedEventId,
              sourceListingId: item.document.sourceListingId,
              sourceUrl: item.document.sourceUrl,
              observedAt: item.document.observedAt,
              contentHash: item.stored.contentHash,
              objectKey: item.stored.objectKey,
              byteLength: item.stored.byteLength,
              mediaType: item.stored.mediaType,
            });
            parsedEvents.push(
              new CollectionSnapshotParsed({
                eventId: parsedEventId,
                aggregateId: snapshotId,
                occurredAt,
                traceContext,
                payload: {
                  run: { runId: locked.runId },
                  snapshot: { snapshotId, contentHash: item.stored.contentHash },
                  source: {
                    sourceId,
                    sourceListingId: item.document.sourceListingId,
                    sourceUrl: item.document.sourceUrl,
                    observedAt: item.document.observedAt,
                  },
                  listing: item.listing,
                },
              }),
            );
          }

          const completedAt = page.exhausted ? occurredAt : null;
          const manifestHash = page.exhausted
            ? hashCollectionManifest([
                ...prefix.map(({ sourceListingId }) => sourceListingId),
                ...observations.map(({ sourceListingId }) => sourceListingId),
              ])
            : null;
          const completedEventId = page.exhausted
            ? await this.identifiers.generate(transaction)
            : null;
          const committed = await this.runs.commitPage(transaction, {
            runId: locked.runId,
            expectedOrdinal: expected.ordinal,
            expectedCursor: expected.cursor,
            nextCursor: page.nextCursor,
            checkpointedAt: occurredAt,
            observations,
            exhausted: page.exhausted,
            completedAt,
            manifestHash,
            completedEventId,
          });
          if (!committed.committed) return committed;

          const events: (CollectionSnapshotParsed | CollectionRunCompleted)[] = [...parsedEvents];
          if (page.exhausted) {
            events.push(
              new CollectionRunCompleted({
                eventId: completedEventId!,
                aggregateId: locked.runId,
                occurredAt: completedAt!,
                traceContext,
                payload: {
                  sourceId,
                  observedCount: committed.run.counts.observed,
                  parsedCount: committed.run.counts.parsed,
                  suppressedCount: committed.run.counts.suppressed,
                  failedCount: committed.run.counts.failed,
                  manifestHash: manifestHash!,
                },
              }),
            );
          }
          await this.outbox.append(transaction, events);
          return committed;
        }, signal);
        run = transition.run;
      } catch (error) {
        if (!(error instanceof StaleCollectionCheckpointError)) throw error;
        const winner = await this.runs.loadRunByOperationKey(operationKey, signal);
        if (!winner) {
          throw new Error('The winning collection checkpoint could not be reloaded.', {
            cause: error,
          });
        }
        run = winner;
      }

      if (run.status === 'completed') return completedResult(run, false);
    }
  }
}
