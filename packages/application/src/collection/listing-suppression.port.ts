import type { UuidV7 } from '@rei/domain';
import type { Transaction } from '../shared/index.js';

export interface ListingIdentity {
  readonly sourceId: string;
  readonly sourceListingId: string;
}
export interface ListingSuppression extends ListingIdentity {
  readonly suppressionId: UuidV7;
  readonly eventId: UuidV7;
  readonly suppressedAt: string;
  readonly completed: boolean;
}
/** Permanent authority; lock identity before any transaction that can publish collected facts. */
export interface ListingSuppressionAuthority {
  isSuppressed(identity: ListingIdentity, signal: AbortSignal): Promise<boolean>;
  lockAndCheck(transaction: Transaction, identity: ListingIdentity): Promise<boolean>;
}
export interface ListingSuppressionEventAuthority {
  verifySuppressionEvent(
    transaction: Transaction,
    event: import('@rei/domain').CollectionListingSuppressed,
  ): Promise<boolean>;
}
export interface ListingSuppressionRepository extends ListingSuppressionAuthority {
  record(
    transaction: Transaction,
    input: ListingSuppression,
  ): Promise<{ suppression: ListingSuppression; created: boolean }>;
  listObjectKeys(identity: ListingIdentity, signal: AbortSignal): Promise<readonly string[]>;
  eraseCollectedData(transaction: Transaction, identity: ListingIdentity): Promise<void>;
  complete(transaction: Transaction, identity: ListingIdentity): Promise<void>;
}
/** Each owner erases only its own retained copies. */
export interface CollectedCopyErasure {
  eraseListingCopies(transaction: Transaction, identity: ListingIdentity): Promise<void>;
}
export type ListingAdmission = (identity: ListingIdentity, signal: AbortSignal) => Promise<boolean>;
export const LISTING_SUPPRESSION = Symbol.for('rei.ListingSuppression');
