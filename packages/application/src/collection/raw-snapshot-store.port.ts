import type { Sha256Hash } from '@rei/domain';

import type { ExternalFailure } from '../shared/index.js';

export const RAW_SNAPSHOT_STORE = Symbol.for('rei.RawSnapshotStore');

export interface StoreRawSnapshotInput {
  readonly sourceId: string;
  readonly mediaType: 'application/json';
  readonly synthetic: true;
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

/** Documents the closed failure type adapters are required to use. */
export type RawSnapshotStoreFailure = ExternalFailure;
