import { fixtureMetadataWire, placeRefWire } from '../locations/index.js';
import {
  invalidWire,
  parseWire,
  wireArray,
  wireBoolean,
  wireCount,
  wireDate,
  wireDiscriminated,
  wireEnum,
  wireHash,
  wireMoney,
  wireNull,
  wireNullable,
  wireNumber,
  wireObject,
  wireSlug,
  wireString,
  wireUrl,
  wireUuid,
} from '../shared/wire.js';
import {
  PROPERTY_TYPES,
  type ListingResponse,
  type PropertyResponse,
  type ReductionsResponse,
  type SearchResponse,
} from './properties.read.types.js';

const nullableArea = wireNullable(wireNumber(0.01, 1000000));
const nullableRooms = wireNullable(wireNumber(0, 100, true));
const provenanceWire = wireObject({
  sourceId: wireSlug,
  sourceListingId: wireString,
  sourceUrl: wireUrl,
  runId: wireUuid,
  snapshotId: wireUuid,
  contentHash: wireHash,
  observedAt: wireDate,
});
const askingPriceWire = wireObject({
  minorUnits: wireMoney,
  currency: wireEnum(['BRL']),
  listingId: wireUuid,
  provenance: provenanceWire,
});
const summaryWire = wireObject({
  id: wireUuid,
  fixtureLabel: wireString,
  propertyType: wireEnum(PROPERTY_TYPES),
  place: placeRefWire,
  breadcrumbs: wireArray(placeRefWire),
  areaSquareMeters: nullableArea,
  bedrooms: nullableRooms,
  bathrooms: nullableRooms,
  parkingSpaces: nullableRooms,
  askingPrice: wireNullable(askingPriceWire),
  pricePerSquareMeter: wireNullable(wireMoney),
  timeOnMarketDays: wireCount,
  firstCollectedAt: wireDate,
  lastCollectedAt: wireDate,
  activeListingCount: wireCount,
  priceReduced: wireBoolean,
  returnedToMarket: wireBoolean,
  belowMedianPercent: wireNullable(wireNumber(-Number.MAX_SAFE_INTEGER)),
  neighborhoodComparison: wireNull,
});
const priceChangeWire = wireObject({
  effectiveAt: wireDate,
  previousMinorUnits: wireMoney,
  currentMinorUnits: wireMoney,
  changePercent: wireNumber(-100, Number.MAX_SAFE_INTEGER),
  provenance: provenanceWire,
});
const historyBase = { effectiveAt: wireDate, provenance: provenanceWire };
const historyWire = wireDiscriminated('type', {
  created: wireObject({ ...historyBase, type: wireEnum(['created']) }),
  'price-changed': wireObject({
    ...historyBase,
    type: wireEnum(['price-changed']),
    previousMinorUnits: wireMoney,
    currentMinorUnits: wireMoney,
  }),
  'description-changed': wireObject({
    ...historyBase,
    type: wireEnum(['description-changed']),
    beforeHash: wireHash,
    afterHash: wireHash,
  }),
  removed: wireObject({ ...historyBase, type: wireEnum(['removed']) }),
  reappeared: wireObject({ ...historyBase, type: wireEnum(['reappeared']) }),
});
const descriptionWire = wireDiscriminated('permission', {
  allowed: wireObject({
    permission: wireEnum(['allowed']),
    current: wireString,
    versions: wireArray(
      wireObject({ effectiveAt: wireDate, text: wireString, contentHash: wireHash }),
    ),
    sourceUrl: wireUrl,
  }),
  denied: wireObject({
    permission: wireEnum(['denied']),
    changedAt: wireArray(wireDate),
    sourceUrl: wireUrl,
  }),
});
const listingWire = wireObject({
  id: wireUuid,
  propertyId: wireUuid,
  fixtureLabel: wireString,
  source: wireObject({
    sourceId: wireSlug,
    sourceListingId: wireString,
    label: wireString,
    url: wireUrl,
  }),
  position: wireNumber(1, 10000, true),
  status: wireEnum(['active', 'removed']),
  propertyType: wireEnum(PROPERTY_TYPES),
  place: placeRefWire,
  publishedNeighborhood: wireString,
  street: wireString,
  areaSquareMeters: nullableArea,
  bedrooms: nullableRooms,
  bathrooms: nullableRooms,
  parkingSpaces: nullableRooms,
  features: wireArray(wireString),
  askingPriceMinorUnits: wireMoney,
  currency: wireEnum(['BRL']),
  pricePerSquareMeter: wireNullable(wireMoney),
  pricePerSquareMeterFormula: wireEnum(['askingPriceMinorUnits / areaSquareMeters']),
  provenance: provenanceWire,
  snapshot: wireObject({
    availability: wireEnum(['available', 'expired', 'unavailable']),
    collectedAt: wireDate,
    expiresAt: wireNullable(wireDate),
  }),
  collectionCount: wireCount,
  firstCollectedAt: wireDate,
  lastCollectedAt: wireDate,
  fieldEffectiveAt: wireObject({
    askingPrice: wireDate,
    description: wireDate,
    attributes: wireDate,
  }),
  description: descriptionWire,
  history: wireArray(historyWire),
  lifeline: wireArray(wireObject({ from: wireDate, to: wireNullable(wireDate) })),
});
const fieldValue = (value: unknown): void => {
  if (
    value !== null &&
    typeof value !== 'string' &&
    (typeof value !== 'number' || !Number.isFinite(value))
  )
    invalidWire();
};
const propertyWire = wireObject({
  summary: summaryWire,
  sale: wireObject({ status: wireEnum(['not-recorded']) }),
  listings: wireArray(listingWire),
  priceChanges: wireArray(priceChangeWire),
  sourceAgreement: wireArray(
    wireObject({
      field: wireEnum([
        'propertyType',
        'areaSquareMeters',
        'bedrooms',
        'bathrooms',
        'parkingSpaces',
        'neighborhood',
      ]),
      values: wireArray(wireObject({ listingId: wireUuid, sourceId: wireSlug, value: fieldValue })),
      agrees: wireBoolean,
    }),
  ),
  featureAgreement: wireArray(
    wireObject({
      feature: wireString,
      reportingCount: wireCount,
      reportingPercent: wireNumber(0, 100),
      listingIds: wireArray(wireUuid),
      sourceIds: wireArray(wireSlug),
    }),
  ),
  preparedEvidence: wireObject({
    kind: wireEnum(['prepared-fixture']),
    label: wireString,
    listingIds: wireArray(wireUuid),
    productionMatchScore: wireNull,
    illustrativeProbability: wireNumber(0, 1),
    probabilityBasis: wireEnum(['prepared-not-calibrated']),
    reasons: wireArray(
      wireDiscriminated('type', {
        'attribute-agreement': wireObject({
          type: wireEnum(['attribute-agreement']),
          field: wireEnum([
            'propertyType',
            'areaSquareMeters',
            'bedrooms',
            'bathrooms',
            'parkingSpaces',
            'street',
          ]),
          value: (value) => {
            if (value === null) invalidWire();
            fieldValue(value);
          },
          listingIds: wireArray(wireUuid),
        }),
        'shared-structured-feature': wireObject({
          type: wireEnum(['shared-structured-feature']),
          feature: wireString,
          listingIds: wireArray(wireUuid),
        }),
        'published-neighborhood-disagreement': wireObject({
          type: wireEnum(['published-neighborhood-disagreement']),
          values: wireArray(wireObject({ listingId: wireUuid, neighborhood: wireString })),
        }),
      }),
    ),
  }),
});
const page = {
  metadata: fixtureMetadataWire,
  nextCursor: wireNullable(wireString),
  totalItems: wireCount,
};
export function parseSearchResponse(value: unknown): SearchResponse {
  return parseWire(
    value,
    wireObject({
      ...page,
      items: wireArray(summaryWire),
      medianPricePerSquareMeter: wireNullable(wireMoney),
      placeCounts: wireArray(wireObject({ placeId: wireSlug, totalItems: wireCount })),
    }),
  );
}
export function parsePropertyResponse(value: unknown): PropertyResponse {
  return parseWire(value, wireObject({ metadata: fixtureMetadataWire, property: propertyWire }));
}
export function parseListingResponse(value: unknown): ListingResponse {
  return parseWire(value, wireObject({ metadata: fixtureMetadataWire, listing: listingWire }));
}
export function parseReductionsResponse(value: unknown): ReductionsResponse {
  return parseWire(
    value,
    wireObject({
      ...page,
      items: wireArray(
        wireObject({
          propertyId: wireUuid,
          listingId: wireUuid,
          place: placeRefWire,
          effectiveAt: wireDate,
          previousMinorUnits: wireMoney,
          currentMinorUnits: wireMoney,
          reductionPercent: wireNumber(0, 100),
          provenance: provenanceWire,
        }),
      ),
    }),
  );
}
