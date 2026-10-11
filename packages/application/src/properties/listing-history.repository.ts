import type {
  CollectionSnapshotCorrected,
  ListingChronologyState,
  Property,
  PropertiesEvent,
} from '@rei/domain';
import type { Transaction } from '../shared/index.js';

export const LISTING_HISTORY_REPOSITORY = Symbol.for('rei.ListingHistoryRepository');
export const DESCRIPTION_HASH = Symbol.for('rei.DescriptionHash');
export interface SourceHistoryWork {
  readonly sourceId: string;
  readonly after: { readonly startedAt: string; readonly runId: string } | null;
  readonly listingCursor: string | null;
}
export interface ListingHistoryRepository {
  retainCreation(transaction: Transaction, event: PropertiesEvent): Promise<void>;
  enqueue(transaction: Transaction, sourceId: string): Promise<void>;
  nextSources(limit: number, signal: AbortSignal): Promise<readonly SourceHistoryWork[]>;
  listingIdentities(
    transaction: Transaction,
    sourceId: string,
    observed: readonly string[],
    after: string | null,
    limit: number,
  ): Promise<readonly string[]>;
  progress(
    work: SourceHistoryWork,
    cursor: string | null,
    completed: { readonly startedAt: string; readonly runId: string } | null,
    signal: AbortSignal,
  ): Promise<void>;
  load(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
  ): Promise<{ readonly property: Property; readonly state: ListingChronologyState | null } | null>;
  appliedRun(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
    runId: string,
  ): Promise<boolean>;
  markRun(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
    runId: string,
    disposition?: 'applied' | 'rejected',
  ): Promise<void>;
  save(
    transaction: Transaction,
    property: Property,
    state: ListingChronologyState,
    events: readonly PropertiesEvent[],
  ): Promise<void>;
  pendingCorrections(
    sourceId: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<readonly CollectionSnapshotCorrected[]>;
  pendingOriginalIdentities(
    sourceId: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<readonly string[]>;
  originalEffects(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
  ): Promise<readonly string[]>;
  markOriginal(transaction: Transaction, eventId: string): Promise<void>;
  rotateOriginalIdentity(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
  ): Promise<void>;
  correctionDisposition(
    transaction: Transaction,
    eventId: string,
  ): Promise<'applied' | 'rejected' | null>;
  markCorrection(
    transaction: Transaction,
    eventId: string,
    disposition?: 'applied' | 'rejected',
  ): Promise<void>;
}
