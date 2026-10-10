import {
  parseWire,
  wireArray,
  wireCount,
  wireDate,
  wireEnum,
  wireNullable,
  wireNumber,
  wireObject,
  wireSlug,
  wireString,
} from '../shared/wire.js';
import type { PlaceResponse, PlacesResponse } from './locations.read.types.js';

export const fixtureMetadataWire = wireObject({
  dataMode: wireEnum(['synthetic-stub']),
  fixtureVersion: wireString,
  asOf: wireDate,
});
export const placeRefWire = wireObject({
  id: wireSlug,
  kind: wireEnum(['country', 'state', 'city', 'zone', 'neighborhood', 'street-block']),
  name: wireObject({ en: wireString, ptBR: wireString }),
});
export const placeDetailWire = wireObject({
  id: wireSlug,
  kind: wireEnum(['country', 'state', 'city', 'zone', 'neighborhood', 'street-block']),
  name: wireObject({ en: wireString, ptBR: wireString }),
  parentId: wireNullable(wireSlug),
  breadcrumbs: wireArray(placeRefWire),
  adjacentPlaceIds: wireArray(wireSlug),
  propertyCount: wireCount,
  coordinates: wireNullable(
    wireObject({
      latitude: wireNumber(-90, 90),
      longitude: wireNumber(-180, 180),
    }),
  ),
  block: wireNullable(
    wireObject({
      streetName: wireString,
      fromNumber: wireCount,
      toNumber: wireCount,
      origin: wireEnum(['prepared-fixture']),
    }),
  ),
});
export function parsePlacesResponse(value: unknown): PlacesResponse {
  return parseWire(
    value,
    wireObject({ metadata: fixtureMetadataWire, items: wireArray(placeDetailWire) }),
  );
}
export function parsePlaceResponse(value: unknown): PlaceResponse {
  return parseWire(value, wireObject({ metadata: fixtureMetadataWire, place: placeDetailWire }));
}
