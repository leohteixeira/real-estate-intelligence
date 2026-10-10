import type { Sha256Hash, UuidV7 } from '@rei/domain';

import type { Transaction } from '../shared/index.js';

export const COLLECTION_RUN_REPOSITORY = Symbol.for('rei.CollectionRunRepository');

export interface CollectionSourceRegistration {
  readonly sourceId: string;
  readonly enabled: boolean;
  readonly collectionAllowed: boolean;
  readonly synthetic: boolean;
}

export interface CollectionExecutionResult {
  readonly operationKey: string;
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

export interface CollectionRunRepository {
  findByOperationKey(
    operationKey: string,
    signal?: AbortSignal,
  ): Promise<CollectionExecutionResult | null>;
  findSource(sourceId: string, signal?: AbortSignal): Promise<CollectionSourceRegistration | null>;
  persistCompleted(
    transaction: Transaction,
    input: PersistCompletedCollectionInput,
  ): Promise<PersistCompletedCollectionResult>;
}
