import type { CollectionRunCompleted, EnabledSourceView, Sha256Hash, UuidV7 } from '@rei/domain';
import type { Transaction } from '../shared/index.js';
import type { ParsedCollectionEvent } from './parsed-event-evidence.port.js';

export const COLLECTION_FACADE = Symbol.for('rei.CollectionFacade');

/** Permissions are deliberately independent and default to false in adapters. */
export interface CollectionSourcePermissions {
  readonly sourceId: string;
  readonly collectionAllowed: boolean;
  readonly imageFetchingAllowed: boolean;
  readonly listingTextDisplayAllowed: boolean;
}

export interface CollectionRunCounts {
  readonly observed: number;
  readonly parsed: number;
  readonly changed: number;
  readonly suppressed: number;
  readonly failed: number;
}

/** Bounded summary plus the manifest used by reconciliation consumers. */
export interface CollectionRunView {
  readonly runId: UuidV7;
  readonly sourceId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly counts: CollectionRunCounts;
  readonly observedSourceListingIds: readonly string[];
  readonly manifestHash: Sha256Hash;
}

/** Original acquisition identity supplied by the consumer; never an object location. */
export interface CollectionSnapshotProvenance {
  readonly sourceId: string;
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly contentHash: string;
  readonly observedAt: string;
}

export interface CollectionSnapshotMetadata {
  readonly availability: 'available' | 'expired' | 'unavailable';
  readonly collectedAt: string;
  readonly expiresAt: string | null;
}

/** Consumer-owned read boundary for collection facts that do not belong in events. */
export interface CollectionFacade {
  /** Verifies the full canonical publication and its still-current original authority. */
  verifyParsedEvent(transaction: Transaction, event: ParsedCollectionEvent): Promise<boolean>;
  getSourcePermissions(sourceId: string): Promise<CollectionSourcePermissions>;
  getRun(runId: string): Promise<CollectionRunView | null>;
  getSnapshotHash(snapshotId: string): Promise<Sha256Hash | null>;
  /** Durable confirmed reference only; absent or mismatched evidence is unavailable. */
  getSnapshotMetadata(expected: CollectionSnapshotProvenance): Promise<CollectionSnapshotMetadata>;
  listEnabledSources(signal?: AbortSignal): Promise<readonly EnabledSourceView[]>;
}

export interface CanonicalCompletedRun extends CollectionRunView {
  readonly event: CollectionRunCompleted;
}

/** Only Collection authenticates chronology and complete observation manifests. */
export interface CollectionHistoryFacade extends CollectionFacade {
  /** Original-publication authority does not imply complete-manifest or absence authority. */
  getLegacyListingFacts(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
    excludedEventIds: readonly string[],
    limit: number,
  ): Promise<readonly ParsedCollectionEvent[]>;
  verifyCompletedEvent(transaction: Transaction, event: CollectionRunCompleted): Promise<boolean>;
  nextCompletedRun(
    transaction: Transaction,
    sourceId: string,
    after: { readonly startedAt: string; readonly runId: string } | null,
  ): Promise<CanonicalCompletedRun | null>;
  getRunListingFacts(
    transaction: Transaction,
    runId: string,
    sourceListingId: string,
  ): Promise<readonly ParsedCollectionEvent[]>;
  getSnapshotCorrections(
    transaction: Transaction,
    snapshotId: string,
  ): Promise<readonly ParsedCollectionEvent[]>;
}
