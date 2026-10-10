import type {
  CollectedListingLocation,
  PlaceResponse,
  PlacesResponse,
  ResolvedPropertyPlace,
} from '@rei/domain';
export const LOCATIONS_FACADE = Symbol.for('rei.LocationsFacade');
export interface LocationsFacade {
  resolveFixtureAddress(address: CollectedListingLocation): Promise<ResolvedPropertyPlace | null>;
  roots(): Promise<PlacesResponse>;
  getPlace(id: string): Promise<PlaceResponse | null>;
  children(id: string): Promise<PlacesResponse | null>;
}
