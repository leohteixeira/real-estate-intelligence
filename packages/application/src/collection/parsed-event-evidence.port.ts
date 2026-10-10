import type { CollectionSnapshotParsed, CollectionSnapshotCorrected } from '@rei/domain';
import type { Transaction } from '../shared/index.js';

export type ParsedCollectionEvent = CollectionSnapshotParsed | CollectionSnapshotCorrected;
/** Collection-owned, privacy-allowlisted publication evidence; independent of outbox retention. */
export interface ParsedEventEvidence {
  appendParsedEvidence(
    transaction: Transaction,
    events: readonly ParsedCollectionEvent[],
  ): Promise<void>;
}
