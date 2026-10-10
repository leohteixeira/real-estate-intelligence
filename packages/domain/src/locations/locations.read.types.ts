export interface PlaceRef {
  readonly id: string;
  readonly kind: 'country' | 'state' | 'city' | 'zone' | 'neighborhood' | 'street-block';
  readonly name: { readonly en: string; readonly ptBR: string };
}
export interface PlaceDetail extends PlaceRef {
  readonly parentId: string | null;
  readonly breadcrumbs: readonly PlaceRef[];
  readonly adjacentPlaceIds: readonly string[];
  readonly propertyCount: number;
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | null;
  readonly block: {
    readonly streetName: string;
    readonly fromNumber: number;
    readonly toNumber: number;
    readonly origin: 'prepared-fixture';
  } | null;
}
export interface FixtureMetadata {
  readonly dataMode: 'synthetic-stub';
  readonly fixtureVersion: string;
  readonly asOf: string;
}
export interface PlacesResponse {
  readonly metadata: FixtureMetadata;
  readonly items: readonly PlaceDetail[];
}
export interface PlaceResponse {
  readonly metadata: FixtureMetadata;
  readonly place: PlaceDetail;
}
