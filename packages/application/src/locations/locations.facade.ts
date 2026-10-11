import type {
  CollectedListingLocation,
  PlaceResponse,
  PlacesResponse,
  ResolvedPropertyPlace,
  PublishedAddress,
} from '@rei/domain';
import type { Transaction } from '../shared/index.js';
export const LOCATIONS_FACADE = Symbol.for('rei.LocationsFacade');
export interface LocationsFacade {
  registeredScopeIds(id: string): Promise<readonly string[] | null>;
  resolvePublishedAddress(address: PublishedAddress): Promise<ResolvedPropertyPlace | null>;
  resolveFixtureAddress(
    address: CollectedListingLocation,
    transaction?: Transaction,
  ): Promise<ResolvedPropertyPlace | null>;
  roots(): Promise<PlacesResponse>;
  getPlace(id: string): Promise<PlaceResponse | null>;
  children(id: string): Promise<PlacesResponse | null>;
}
