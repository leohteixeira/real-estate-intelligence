import type { PlaceResponse, PlacesResponse } from '@rei/domain';
export const LOCATIONS_FACADE = Symbol.for('rei.LocationsFacade');
export interface LocationsFacade {
  roots(): Promise<PlacesResponse>;
  getPlace(id: string): Promise<PlaceResponse | null>;
  children(id: string): Promise<PlacesResponse | null>;
}
