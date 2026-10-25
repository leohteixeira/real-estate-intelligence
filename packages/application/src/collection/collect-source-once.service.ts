import { prepareImageFingerprints } from './prepare-image-fingerprints.js';
import {
  decideSourceEnablement,
  CollectionRunCompleted,
  CollectionSnapshotParsed,
  CollectionSnapshotAcquired,
  DomainValidationError,
  hashCollectionManifest,
  parseCollectionSourceListingId,
  type TraceContext,
  type CollectionRunState,
} from '@rei/domain';
import type { SnapshotSanitizer } from './snapshot-sanitizer.port.js';

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
import { ListingSourceAccessRefusal, type ListingSource } from './listing-source.port.js';
import type { RawSnapshotStore } from './raw-snapshot-store.port.js';
import type { SourceRegisterRepository } from './source-register.repository.js';
import { startAdmittedRun } from './start-admitted-run.js';

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
/** Executes one explicitly requested source collection without scheduling or implicit retries. */
export class CollectSourceOnce {
  public constructor(
    private readonly source: ListingSource,
    private readonly snapshots: RawSnapshotStore,
    private readonly sources: SourceRegisterRepository,
    private readonly runs: CollectionRunRepository,
    private readonly transactions: TransactionRunner,
    private readonly identifiers: UuidV7Generator,
    private readonly clock: Clock,
    private readonly outbox: OutboxAppendPort,
    private readonly sanitizer?: SnapshotSanitizer,
    private readonly terminalCleanupTimeoutMs = 5_000,
  ) {}

  public async execute(
    sourceId: string,
    operationKeyInput: string,
    traceContext: TraceContext | null,
    signal: AbortSignal,
    deadlineAt?: number,
  ): Promise<CollectionExecutionResult> {
    const operationKey = validateOperationKey(operationKeyInput);
    signal.throwIfAborted();

    const existingRun = await this.runs.loadRunByOperationKey(operationKey, signal);
    if (existingRun && (existingRun.sourceId !== sourceId || existingRun.status !== 'running')) {
      return this.completedReplay(existingRun, sourceId, operationKey, signal);
    }

    const registration = await this.sources.findById(sourceId, signal);
    if (
      registration === null ||
      !registration.enabled ||
      !registration.permissions.collectionAllowed ||
      !['synthetic-listing', 'listing'].includes(registration.category) ||
      !decideSourceEnablement(registration).eligible
    ) {
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.fetch' });
    }

    signal.throwIfAborted();
    const run = await this.transactions.runInTransaction(async (transaction) => {
      const boundary = await startAdmittedRun(
        transaction,
        sourceId,
        operationKey,
        this.runs,
        this.identifiers,
        this.clock,
        () => this.sources.assertCollectible(transaction, sourceId),
        signal,
      );
      if (boundary.status === 'completed') return boundary;
      if (
        boundary.sourceId !== sourceId ||
        boundary.status !== 'running' ||
        boundary.checkpoint.ordinal !== 0
      )
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });
      return boundary;
    }, signal);
    if (run.status === 'completed') {
      return this.completedReplay(run, sourceId, operationKey, signal);
    }
    try {
      const startedAt = run.startedAt;
      const page = await this.source.fetchPage(sourceId, null, signal, deadlineAt);
      if (!page.exhausted || page.documents.length !== 1) {
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch' });
      }
      const original = page.documents[0]!;
      const synthetic = registration.category === 'synthetic-listing';
      if (!synthetic && !this.sanitizer)
        throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.snapshot.sanitize' });
      const sanitized = synthetic ? null : this.sanitizer!.sanitize(original);
      const document = sanitized?.document ?? original;
      if (document.sourceId !== registration.sourceId) {
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch' });
      }
      let manifestHash: ReturnType<typeof hashCollectionManifest>;
      try {
        const sourceListingId = parseCollectionSourceListingId(document.sourceListingId);
        manifestHash = hashCollectionManifest([sourceListingId]);
      } catch {
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch' });
      }

      signal.throwIfAborted();
      const stored = await this.snapshots.store(
        {
          sourceId,
          mediaType: document.mediaType,
          synthetic,
          acquisitionId: JSON.stringify([operationKey, sourceId, document.sourceListingId]),
          bytes: document.bytes,
        },
        signal,
        deadlineAt,
      );

      signal.throwIfAborted();
      const parsedListing = await this.source.parse(document, signal);
      const trusted = sanitized?.sanitizeParsed(parsedListing) ?? parsedListing;
      const listing = await prepareImageFingerprints(
        this.source,
        this.sources,
        original,
        trusted,
        synthetic,
        signal,
        deadlineAt,
      );
      signal.throwIfAborted();

      return await this.transactions.runInTransaction(async (transaction) => {
        await this.sources.assertCollectible(transaction, sourceId);
        signal.throwIfAborted();
        const runId = run.runId;
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
          imageFingerprints: listing.imageFingerprints,
        };

        const persisted = await this.runs.persistCompleted(transaction, persistence);
        if (persisted.result.sourceId !== sourceId) {
          throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });
        }
        if (!persisted.created) return Object.freeze({ ...persisted.result, replayed: true });

        const parsed = new (
          listing.imageFingerprints.length === 0 ||
            listing.imageFingerprints.some((item) => item.startsWith('dhash64-v1:'))
            ? CollectionSnapshotAcquired
            : CollectionSnapshotParsed
        )({
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
        await this.runs.appendParsedEvidence(transaction, [parsed]);
        await this.runs.appendCompletedEvidence(transaction, completed);
        await this.outbox.append(transaction, [parsed, completed]);
        return persisted.result;
      }, signal);
    } catch (error) {
      if (error instanceof ListingSourceAccessRefusal) {
        const held = await this.sources.holdAtomically(
          sourceId,
          { reason: error.reason, heldAt: this.clock.now() },
          signal,
        );
        if (!held?.hold) throw new Error('Source hold could not be persisted.', { cause: error });
        await this.transactions.runInTransaction(
          (transaction) => this.runs.pause(transaction, run.runId, held.hold!),
          signal,
        );
      }
      // AbortSignal.any preserves the first cause. Deadline exhaustion is recoverable even
      // when an adapter sanitizes that abort to ExternalFailure.cancelled.
      const timedOut =
        signal.aborted && signal.reason instanceof Error && signal.reason.name === 'TimeoutError';
      if (
        !timedOut &&
        (signal.aborted ||
          error instanceof DomainValidationError ||
          (error instanceof ExternalFailure && ['rejected', 'cancelled'].includes(error.kind)))
      ) {
        // An aborted request cannot cancel its own durable terminal cleanup.
        const cleanupSignal = AbortSignal.timeout(this.terminalCleanupTimeoutMs);
        await this.transactions.runInTransaction(
          (transaction) => this.runs.fail(transaction, run.runId),
          cleanupSignal,
        );
      }
      throw error;
    }
  }

  private async completedReplay(
    run: CollectionRunState,
    sourceId: string,
    operationKey: string,
    signal: AbortSignal,
  ): Promise<CollectionExecutionResult> {
    if (
      run.sourceId !== sourceId ||
      run.status !== 'completed' ||
      run.counts.observed !== 1 ||
      run.counts.parsed !== 1
    )
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });
    const replay = await this.runs.findByOperationKey(operationKey, signal);
    if (!replay || replay.sourceId !== sourceId || replay.runId !== run.runId)
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });
    return Object.freeze({ ...replay, replayed: true });
  }
}
