import type { Sha256Hash, UuidV7 } from '@rei/domain';
import type { Transaction } from '../shared/index.js';
import type { RawListingDocument } from './listing-source.port.js';

export const SNAPSHOT_REPARSE_REPOSITORY = Symbol.for('rei.SnapshotReparseRepository');
export interface ReparseObservation extends Omit<RawListingDocument, 'bytes'> {
  readonly snapshotId: UuidV7;
  readonly runId: UuidV7;
  readonly originalParsedEventId: UuidV7;
  readonly contentHash: Sha256Hash;
  readonly objectKey: string;
  readonly byteLength: number;
  readonly synthetic: boolean;
  /** null means unknown legacy provenance; [] means intentionally no images. */
  readonly imageFingerprints: readonly string[] | null;
}
export interface SnapshotReparseIdentity {
  readonly snapshotId: UuidV7;
  readonly parserRevision: string;
  readonly operationKey: string;
}
export interface SnapshotReparseResult extends SnapshotReparseIdentity {
  readonly eventId: UuidV7;
  readonly order: number;
  readonly replayed: boolean;
}
export interface SnapshotReparseOperation {
  readonly snapshotId: UuidV7;
  readonly parserRevision: string;
  readonly result: SnapshotReparseResult | null;
}
export interface SnapshotReparseRepository {
  findOperation(
    operationKey: string,
    signal: AbortSignal,
  ): Promise<SnapshotReparseOperation | null>;
  findObservation(snapshotId: UuidV7, signal: AbortSignal): Promise<ReparseObservation | null>;
  /** Authenticate persisted hash and length independently of the current parser. */
  verifyOriginalBytes(observation: ReparseObservation, bytes: Uint8Array): readonly string[];
  reserve(
    transaction: Transaction,
    identity: SnapshotReparseIdentity,
    observation: ReparseObservation,
    fingerprints: readonly string[],
  ): Promise<{ result: SnapshotReparseResult | null }>;
  lockForCommit(
    transaction: Transaction,
    identity: SnapshotReparseIdentity,
  ): Promise<{
    observation: ReparseObservation;
    order: number;
    result: SnapshotReparseResult | null;
  }>;
  complete(transaction: Transaction, result: SnapshotReparseResult): Promise<void>;
}
