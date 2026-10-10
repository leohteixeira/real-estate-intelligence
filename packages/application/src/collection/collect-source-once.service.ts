import { createHash } from 'node:crypto';

import {
  CollectionRunCompleted,
  CollectionSnapshotParsed,
  parseSha256Hash,
  type Sha256Hash,
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
  CollectionExecutionResult,
  CollectionRunRepository,
  PersistCompletedCollectionInput,
} from './collection-run.repository.js';
import type { ListingSource } from './listing-source.port.js';
import type { RawSnapshotStore } from './raw-snapshot-store.port.js';

const OPERATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function validateOperationKey(value: string): string {
  if (!OPERATION_KEY_PATTERN.test(value)) {
    throw new TypeError(
      'operationKey must contain 1-200 safe identifier characters and start with a letter or digit.',
    );
  }
  return value;
}

/**
 * Hashes the UTF-8 bytes of a JSON array sorted by ECMAScript UTF-16 code-unit order.
 * JSON escaping and array boundaries make the source-listing ID manifest unambiguous.
 */
function hashSourceListingIdManifest(sourceListingIds: readonly string[]): Sha256Hash {
  const canonicalManifest = JSON.stringify([...sourceListingIds].sort());
  const digest = createHash('sha256').update(canonicalManifest, 'utf8').digest('hex');
  return parseSha256Hash(`sha256:${digest}`, 'manifestHash');
}

/** Executes one explicitly requested source collection without scheduling or implicit retries. */
export class CollectSourceOnce {
  public constructor(
    private readonly source: ListingSource,
    private readonly snapshots: RawSnapshotStore,
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
  ): Promise<CollectionExecutionResult> {
    const operationKey = validateOperationKey(operationKeyInput);
    signal.throwIfAborted();

    const replay = await this.runs.findByOperationKey(operationKey, signal);
    if (replay) return Object.freeze({ ...replay, replayed: true });

    const registration = await this.runs.findSource(sourceId, signal);
    if (
      registration === null ||
      !registration.enabled ||
      !registration.collectionAllowed ||
      !registration.synthetic
    ) {
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.fetch' });
    }

    signal.throwIfAborted();
    const startedAt = this.clock.now();
    const document = await this.source.fetch(sourceId, signal);
    if (document.sourceId !== registration.sourceId) {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch' });
    }

    signal.throwIfAborted();
    const stored = await this.snapshots.store(
      {
        sourceId,
        mediaType: document.mediaType,
        synthetic: true,
        bytes: document.bytes,
      },
      signal,
    );

    signal.throwIfAborted();
    const listing = await this.source.parse(document, signal);
    signal.throwIfAborted();
    const manifestHash = hashSourceListingIdManifest([document.sourceListingId]);

    return this.transactions.runInTransaction(async (transaction) => {
      signal.throwIfAborted();
      const runId = await this.identifiers.generate(transaction);
      const snapshotId = await this.identifiers.generate(transaction);
      const parsedEventId = await this.identifiers.generate(transaction);
      const completedEventId = await this.identifiers.generate(transaction);
      const completedAt = this.clock.now();

      const persistence: PersistCompletedCollectionInput = {
        operationKey,
        runId,
        snapshotId,
        parsedEventId,
        completedEventId,
        sourceId,
        sourceListingId: document.sourceListingId,
        sourceUrl: document.sourceUrl,
        observedAt: document.observedAt,
        startedAt,
        completedAt,
        contentHash: stored.contentHash,
        objectKey: stored.objectKey,
        byteLength: stored.byteLength,
        mediaType: stored.mediaType,
        manifestHash,
      };

      const persisted = await this.runs.persistCompleted(transaction, persistence);
      if (!persisted.created) return Object.freeze({ ...persisted.result, replayed: true });

      const parsed = new CollectionSnapshotParsed({
        eventId: parsedEventId,
        aggregateId: snapshotId,
        occurredAt: completedAt,
        traceContext,
        payload: {
          run: { runId },
          snapshot: { snapshotId, contentHash: stored.contentHash },
          source: {
            sourceId,
            sourceListingId: document.sourceListingId,
            sourceUrl: document.sourceUrl,
            observedAt: document.observedAt,
          },
          listing,
        },
      });
      const completed = new CollectionRunCompleted({
        eventId: completedEventId,
        aggregateId: runId,
        occurredAt: completedAt,
        traceContext,
        payload: {
          sourceId,
          observedCount: 1,
          parsedCount: 1,
          suppressedCount: 0,
          failedCount: 0,
          manifestHash,
        },
      });
      await this.outbox.append(transaction, [parsed, completed]);
      return persisted.result;
    }, signal);
  }
}
