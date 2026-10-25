import type { Sha256Hash } from '@rei/domain';

import type { ExternalFailure } from '../shared/index.js';

export const RAW_SNAPSHOT_STORE = Symbol.for('rei.RawSnapshotStore');

export interface StoreRawSnapshotInput {
  readonly sourceId: string;
  readonly mediaType: 'application/json';
  readonly synthetic: boolean;
  /** Stable operation/source/listing identity; required for a real acquisition. */
  readonly acquisitionId?: string;
  /** Required for new real acquisitions; explicit ownership precedes external upload. */
  readonly sourceListingId?: string;
  readonly bytes: Uint8Array;
}

export interface StoredRawSnapshot {
  readonly contentHash: Sha256Hash;
  readonly objectKey: string;
  readonly byteLength: number;
  readonly mediaType: 'application/json';
}

/** Stores exact source bytes under an immutable, content-addressed key. */
export interface RawSnapshotStore {
  store(
    input: StoreRawSnapshotInput,
    signal: AbortSignal,
    deadlineAt?: number,
  ): Promise<StoredRawSnapshot>;
}

export interface SnapshotContentStore extends RawSnapshotStore {
  read(objectKey: string, signal: AbortSignal, deadlineAt?: number): Promise<Uint8Array>;
  delete(objectKey: string, signal: AbortSignal, deadlineAt?: number): Promise<void>;
}

/** Documents the closed failure type adapters are required to use. */
export type RawSnapshotStoreFailure = ExternalFailure;
