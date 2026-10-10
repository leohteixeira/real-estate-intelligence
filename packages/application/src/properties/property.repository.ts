import type {
  CollectionSnapshotParsed,
  CollectionSnapshotCorrected,
  Property,
  UuidV7,
} from '@rei/domain';
import type { Transaction } from '../shared/index.js';

export type ParsedListingFact = CollectionSnapshotParsed | CollectionSnapshotCorrected;
export type IncomingFactDisposition = 'initial' | 'pending-history' | 'pending-correction';
export const PROPERTY_REPOSITORY = Symbol.for('rei.PropertyRepository');

export interface PropertyRepository {
  /** Serializes all observations of one stable source identity through transaction commit. */
  lockSourceIdentity(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
  ): Promise<void>;
  hasFact(transaction: Transaction, eventId: UuidV7): Promise<boolean>;
  findSourceIdentity(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
  ): Promise<UuidV7 | null>;
  appendFact(
    transaction: Transaction,
    event: ParsedListingFact,
    disposition: IncomingFactDisposition,
  ): Promise<void>;
  create(transaction: Transaction, property: Property): Promise<void>;
}
