import type { Sha256Hash, UuidV7 } from '@rei/domain';

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

/** Consumer-owned read boundary for collection facts that do not belong in events. */
export interface CollectionFacade {
  getSourcePermissions(sourceId: string): Promise<CollectionSourcePermissions>;
  getRun(runId: string): Promise<CollectionRunView | null>;
  getSnapshotHash(snapshotId: string): Promise<Sha256Hash | null>;
}
