import type { FixtureMetadata, Place, PublishedAddress } from '@rei/domain';
import type { Transaction } from '../shared/index.js';

/** Read-only Locations port. Normalized inputs are transient and never recorded. */
export interface PlaceRepository {
  registeredScopeIds(id: string): Promise<readonly string[] | null>;
  metadata(): Promise<FixtureMetadata>;
  roots(): Promise<readonly Place[]>;
  findById(id: string): Promise<Place | null>;
  children(id: string): Promise<readonly Place[]>;
  addressCandidates(
    address: PublishedAddress,
    transaction?: Transaction,
  ): Promise<readonly Place[]>;
}
