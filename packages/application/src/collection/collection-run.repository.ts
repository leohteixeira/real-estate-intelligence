import type { CollectionRunState, Sha256Hash, UuidV7, SourceHold } from '@rei/domain';

import type { Transaction } from '../shared/index.js';

export const COLLECTION_RUN_REPOSITORY = Symbol.for('rei.CollectionRunRepository');

export interface CollectionExecutionResult {
  readonly operationKey: string;
  /** The permanent owner of the globally unique operation key. */
  readonly sourceId: string;
  readonly runId: UuidV7;
  readonly snapshotId: UuidV7;
  readonly parsedEventId: UuidV7;
  readonly completedEventId: UuidV7;
  readonly contentHash: Sha256Hash;
  readonly objectKey: string;
  readonly replayed: boolean;
}

export interface PersistCompletedCollectionInput {
  readonly operationKey: string;
  readonly runId: UuidV7;
  readonly snapshotId: UuidV7;
  readonly parsedEventId: UuidV7;
  readonly completedEventId: UuidV7;
  readonly sourceId: string;
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly contentHash: Sha256Hash;
  readonly objectKey: string;
  readonly byteLength: number;
  readonly mediaType: 'application/json';
  readonly manifestHash: Sha256Hash;
}

export interface PersistCompletedCollectionResult {
  readonly created: boolean;
  readonly result: CollectionExecutionResult;
}

export interface StartCollectionRunInput {
  readonly operationKey: string;
  readonly runId: UuidV7;
  readonly sourceId: string;
  readonly startedAt: string;
}

export interface PersistedCollectionObservation {
  readonly snapshotId: UuidV7;
  readonly parsedEventId: UuidV7 | null;
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly contentHash: Sha256Hash;
  readonly objectKey: string;
  readonly outcome: 'parsed' | 'failed';
  readonly changed: boolean;
  readonly failureReason: string | null;
}

export interface CommitCollectionObservationInput extends PersistedCollectionObservation {
  readonly byteLength: number;
  readonly mediaType: 'application/json';
}

export interface CommitCollectionPageInput {
  readonly runId: UuidV7;
  readonly expectedOrdinal: number;
  readonly expectedCursor: string | null;
  readonly nextCursor: string | null;
  readonly checkpointedAt: string;
  readonly observations: readonly CommitCollectionObservationInput[];
  readonly exhausted: boolean;
  readonly completedAt: string | null;
  readonly manifestHash: Sha256Hash | null;
  readonly completedEventId: UuidV7 | null;
}

export interface CommitCollectionPageResult {
  readonly committed: boolean;
  readonly run: CollectionRunState;
}

export interface CollectionRunRepository {
  pause(transaction: Transaction, runId: UuidV7, hold: SourceHold): Promise<CollectionRunState>;
  resume(transaction: Transaction, runId: UuidV7): Promise<CollectionRunState>;
  findByOperationKey(
    operationKey: string,
    signal?: AbortSignal,
  ): Promise<CollectionExecutionResult | null>;
  persistCompleted(
    transaction: Transaction,
    input: PersistCompletedCollectionInput,
  ): Promise<PersistCompletedCollectionResult>;
  loadRunByOperationKey(
    operationKey: string,
    signal?: AbortSignal,
  ): Promise<CollectionRunState | null>;
  startOrLoad(
    transaction: Transaction,
    input: StartCollectionRunInput,
  ): Promise<CollectionRunState>;
  listObservations(
    transaction: Transaction,
    runId: UuidV7,
  ): Promise<readonly PersistedCollectionObservation[]>;
  findLatestCompletedContentHash(
    transaction: Transaction,
    sourceId: string,
    beforeRunId: UuidV7,
    sourceListingId: string,
  ): Promise<Sha256Hash | null>;
  lockRunForPage(
    transaction: Transaction,
    runId: UuidV7,
    expectedOrdinal: number,
    expectedCursor: string | null,
  ): Promise<CollectionRunState>;
  commitPage(
    transaction: Transaction,
    input: CommitCollectionPageInput,
  ): Promise<CommitCollectionPageResult>;
}
