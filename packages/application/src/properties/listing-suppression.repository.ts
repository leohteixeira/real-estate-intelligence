import type { CollectionListingSuppressed, PropertiesListingSuppressedPayload } from '@rei/domain';
import type { Transaction } from '../shared/index.js';
/** Owns minimal receipts and Properties evidence; Collection remains the permanent authority. */
export interface PropertySuppressionRepository {
  erase(
    transaction: Transaction,
    event: CollectionListingSuppressed,
    signal: AbortSignal,
  ): Promise<PropertiesListingSuppressedPayload | null>;
}
/** Platform owns deletion of retained Properties publications containing the erased identity. */
export interface PropertiesPublicationErasure {
  erasePropertiesListingCopies(
    transaction: Transaction,
    identity: {
      readonly sourceId: string;
      readonly sourceListingId: string;
      readonly listingId: string | null;
    },
  ): Promise<void>;
}
