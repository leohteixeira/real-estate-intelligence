import {
  decideSourceEnablement,
  CollectionRunCompleted,
  CollectionSnapshotParsed,
  StaleCollectionCheckpointError,
  hashCollectionManifest,
  parseCollectionCheckpointCursor,
  parseCollectionSourceListingId,
  type CollectedListing,
  type CollectionRunState,
  type TraceContext,
  type SourceHold,
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
import { ListingSourceAccessRefusal } from './listing-source.port.js';
import { startAdmittedRun } from './start-admitted-run.js';

const OPERATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

interface PreparedObservation {
  readonly document: RawListingDocument;
  readonly stored: StoredRawSnapshot;
  readonly listing: CollectedListing | null;
  readonly failureReason: 'parser-rejected' | null;
}

export interface CollectSourceRunResult {
  readonly status: 'completed' | 'paused';
  readonly operationKey: string;
  readonly runId: CollectionRunState['runId'];
  readonly sourceId: string;
  readonly observedCount: number;
  readonly parsedCount: number;
  readonly changedCount: number;
  readonly failedCount: number;
  readonly manifestHash: CollectionRunState['manifestHash'];
  readonly completedEventId: CollectionRunState['completedEventId'];
  readonly completedAt: string | null;
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
    status: 'completed',
    operationKey: run.operationKey,
    runId: run.runId,
    sourceId: run.sourceId,
    observedCount: run.counts.observed,
    parsedCount: run.counts.parsed,
    changedCount: run.counts.changed,
    failedCount: run.counts.failed,
    manifestHash: run.manifestHash,
    completedEventId: run.completedEventId,
    completedAt: run.completedAt,
    replayed,
  });
}

function pausedResult(run: CollectionRunState, replayed: boolean): CollectSourceRunResult {
  if (run.status !== 'paused') throw new TypeError('A durable paused run is required.');
  return Object.freeze({
    status: 'paused',
    operationKey: run.operationKey,
    runId: run.runId,
    sourceId: run.sourceId,
    observedCount: run.counts.observed,
    parsedCount: run.counts.parsed,
    changedCount: run.counts.changed,
    failedCount: run.counts.failed,
    manifestHash: null,
    completedEventId: null,
    completedAt: null,
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
    private readonly sanitizer?: SnapshotSanitizer,
  ) {}

  public async execute(
    sourceId: string,
    operationKeyInput: string,
    traceContext: TraceContext | null,
    signal: AbortSignal,
    deadlineAt?: number,
  ): Promise<CollectSourceRunResult> {
    const operationKey = validateOperationKey(operationKeyInput);
    signal.throwIfAborted();
    let run = await this.runs.loadRunByOperationKey(operationKey, signal);
    if (run && run.sourceId !== sourceId) {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });
    }
    if (run?.status === 'completed') return completedResult(run, true);
    if (run?.status === 'paused') return pausedResult(run, true);
    if (run?.status === 'failed')
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });

    const registration = await this.sources.findById(sourceId, signal);
    if (
      registration === null ||
      (!registration.enabled && registration.hold === null) ||
      !registration.permissions.collectionAllowed ||
      !['synthetic-listing', 'listing'].includes(registration.category) ||
      (registration.hold === null && !decideSourceEnablement(registration).eligible)
    ) {
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.fetch-page' });
    }

    if (!run) {
      run = await this.transactions.runInTransaction(async (transaction) => {
        return startAdmittedRun(
          transaction,
          sourceId,
          operationKey,
          this.runs,
          this.identifiers,
          this.clock,
          async () => undefined,
          signal,
        );
      }, signal);
      if (run.sourceId !== sourceId) {
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });
      }
      if (run.status === 'completed') return completedResult(run, true);
      if (run.status === 'paused') return pausedResult(run, true);
      if (run.status === 'failed')
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.run.resume' });
    }

    if (registration.hold !== null) return this.pause(run, registration.hold, signal);

    try {
      for (;;) {
        signal.throwIfAborted();
        const current = await this.sources.findById(sourceId, signal);
        if (current?.hold) return this.pause(run, current.hold, signal);
        if (!current?.enabled || !current.permissions.collectionAllowed)
          throw new ExternalFailure({
            kind: 'forbidden',
            operation: 'collection.source.fetch-page',
          });
        const expected = run.checkpoint;
        const page = await this.source.fetchPage(sourceId, expected.cursor, signal, deadlineAt);
        validatePage(page, sourceId, expected.cursor);

        const prepared: PreparedObservation[] = [];
        for (const original of page.documents) {
          signal.throwIfAborted();
          const synthetic = registration.category === 'synthetic-listing';
          if (!synthetic && !this.sanitizer)
            throw new ExternalFailure({
              kind: 'forbidden',
              operation: 'collection.snapshot.sanitize',
            });
          const sanitized = synthetic ? null : this.sanitizer!.sanitize(original);
          const document = sanitized?.document ?? original;
          const stored = await this.snapshots.store(
            {
              sourceId,
              mediaType: document.mediaType,
              synthetic,
              bytes: document.bytes,
              acquisitionId: JSON.stringify([operationKey, sourceId, document.sourceListingId]),
            },
            signal,
            deadlineAt,
          );
          signal.throwIfAborted();
          try {
            const parsedListing = await this.source.parse(document, signal);
            const listing = sanitized?.sanitizeParsed(parsedListing) ?? parsedListing;
            prepared.push({ document, stored, listing, failureReason: null });
          } catch (error) {
            if (error instanceof ExternalFailure && error.kind === 'rejected') {
              prepared.push({
                document,
                stored,
                listing: null,
                failureReason: 'parser-rejected',
              });
              continue;
            }
            throw error;
          }
        }

        try {
          const transition = await this.transactions.runInTransaction(async (transaction) => {
            await this.sources.assertCollectible(transaction, sourceId);
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
              const parsedEventId =
                item.listing === null ? null : await this.identifiers.generate(transaction);
              const priorHash =
                item.listing === null
                  ? null
                  : await this.runs.findLatestCompletedContentHash(
                      transaction,
                      sourceId,
                      locked.runId,
                      item.document.sourceListingId,
                    );
              const changed = priorHash !== null && priorHash !== item.stored.contentHash;
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
                outcome: item.listing === null ? 'failed' : 'parsed',
                changed,
                failureReason: item.failureReason,
                imageFingerprints: item.listing?.imageFingerprints ?? null,
              });
              if (item.listing !== null && parsedEventId !== null)
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
            await this.runs.appendParsedEvidence(transaction, parsedEvents);
            const completion = events.find((event) => event instanceof CollectionRunCompleted);
            if (completion) await this.runs.appendCompletedEvidence(transaction, completion);
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
        if (run.status === 'paused') return pausedResult(run, true);
      }
    } catch (error) {
      if (!(error instanceof ListingSourceAccessRefusal)) throw error;
      const held = await this.sources.holdAtomically(
        sourceId,
        { reason: error.reason, heldAt: this.clock.now() },
        signal,
      );
      if (!held?.hold) throw new Error('Source hold could not be persisted.', { cause: error });
      return this.pause(run, held.hold, signal);
    }
  }

  private async pause(run: CollectionRunState, hold: SourceHold, signal: AbortSignal) {
    const paused = await this.transactions.runInTransaction(
      (transaction) => this.runs.pause(transaction, run.runId, hold),
      signal,
    );
    return paused.status === 'completed'
      ? completedResult(paused, true)
      : pausedResult(paused, false);
  }
}
