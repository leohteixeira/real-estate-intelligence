import type { Sha256Hash } from '@rei/domain';
import type { Transaction } from '../shared/index.js';

export const SNAPSHOT_LIFECYCLE = Symbol.for('rei.SnapshotLifecycle');
export const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export interface SnapshotGeneration {
  readonly acquisitionScope: string;
  readonly sourceId: string;
  readonly sourceListingId?: string;
  readonly suppressed?: boolean;
  readonly objectKey: string;
  readonly contentHash: Sha256Hash;
  readonly byteLength: number;
  readonly mediaType: 'application/json';
  readonly keyId: string;
  readonly collectedAt: string;
  readonly expiresAt: string;
  readonly deleted: boolean;
  readonly available: boolean;
}

/** Durable reservations precede uploads, including uploads that never produce observations. */
export interface SnapshotLifecycle {
  withSyntheticUpload?<T>(
    input: {
      readonly objectKey: string;
      readonly sourceId: string;
      readonly sourceListingId: string;
    },
    signal: AbortSignal,
    work: () => Promise<T>,
  ): Promise<T>;
  deleteSynthetic?(
    objectKey: string,
    signal: AbortSignal,
    work: () => Promise<void>,
    nextReconciliationAt: string,
  ): Promise<void>;
  reserve(
    input: Omit<SnapshotGeneration, 'expiresAt' | 'deleted' | 'available'>,
    signal: AbortSignal,
  ): Promise<SnapshotGeneration>;
  withGeneration<T>(
    objectKey: string,
    signal: AbortSignal,
    work: (generation: SnapshotGeneration, transaction: Transaction) => Promise<T>,
  ): Promise<T>;
  listExpired(now: string, limit: number, signal: AbortSignal): Promise<readonly string[]>;
  /** Confirm idempotent deletion and durably schedule the next late-write reconciliation. */
  markDeleted(
    transaction: Transaction,
    objectKey: string,
    nextReconciliationAt: string,
  ): Promise<void>;
  markAvailable(transaction: Transaction, objectKey: string): Promise<void>;
}

export interface SnapshotRetention {
  expire(limit: number, signal: AbortSignal, deadlineAt?: number): Promise<number>;
}
