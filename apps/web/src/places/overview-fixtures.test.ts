import type {
  PlaceDetail,
  PlaceMarketNeighboursResponse,
  PlaceMarketSeriesResponse,
  PropertyResponse,
  ReductionsResponse,
} from '@rei/contracts';
import { expect, it } from 'vitest';
import {
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketSeriesResponse,
  parsePropertyResponse,
} from '@rei/contracts';
import { bela, metadata, marketFixture, pinheiros, placesFixture } from './place-fixtures.test';
import { property } from '../shared/shared-fixtures.test';
const evidence = {
  recordCount: 1,
  sources: [
    {
      id: 'synthetic',
      label: 'Synthetic source',
      url: 'https://synthetic.invalid',
      collectedAt: metadata.asOf,
    },
  ],
  computedAt: metadata.asOf,
  freshness: {
    status: 'fresh' as const,
    latestCollectionCompletedAt: metadata.asOf,
    ageSeconds: 0,
  },
};
function ref(place: PlaceDetail) {
  return { id: place.id, kind: place.kind, name: place.name };
}

export function neighboursFixture(place = bela): PlaceMarketNeighboursResponse {
  return {
    metadata,
    basis: 'prepared-market-example',
    evaluatedAt: metadata.asOf,
    place: ref(place),
    items:
      place.id === bela.id
        ? [
            {
              place: ref(pinheiros),
              median: {
                ...evidence,
                state: 'available',
                value: { minorUnits: 1250000, currency: 'BRL' },
              },
              movement: { ...evidence, windowMonths: 6, state: 'available', value: 0 },
            },
          ]
        : [],
  };
}
export function seriesFixture(place = bela): PlaceMarketSeriesResponse {
  return {
    metadata: { ...metadata, asOf: '2025-11-01T00:00:00.000Z' },
    basis: 'prepared-market-example',
    evaluatedAt: metadata.asOf,
    place: ref(place),
    comparisonPlace: place.kind === 'country' ? null : place.breadcrumbs.at(-1)!,
    points: Array.from({ length: 12 }, (_, index) => {
      const month = new Date(Date.UTC(2025, 10 + index, 1)).toISOString().slice(0, 7);
      const computedAt = `${month}-01T00:00:00.000Z`;
      const pointEvidence = {
        ...evidence,
        computedAt,
        sources: evidence.sources.map((source) => ({ ...source, collectedAt: computedAt })),
        freshness: {
          status: 'fresh' as const,
          latestCollectionCompletedAt: computedAt,
          ageSeconds: (Date.parse(metadata.asOf) - Date.parse(computedAt)) / 1000,
        },
      };
      const median =
        index === 5
          ? {
              ...pointEvidence,
              recordCount: 0,
              sources: [],
              freshness: { ...pointEvidence.freshness, latestCollectionCompletedAt: null },
              state: 'insufficient-data' as const,
              value: null,
            }
          : {
              ...pointEvidence,
              state: 'available' as const,
              value: { minorUnits: 900000 + index * 1000, currency: 'BRL' as const },
            };
      return {
        month,
        median,
        parentMedian:
          place.kind === 'country'
            ? null
            : {
                ...pointEvidence,
                state: 'available' as const,
                value: { minorUnits: 800000, currency: 'BRL' as const },
              },
      };
    }),
  };
}
export const propertyId = '0199322b-2dc0-7000-8000-000000000001';
export const listingId = '0199322b-2dc0-7000-8000-000000000002';
export const provenance = {
  sourceId: 'synthetic-data',
  sourceListingId: 'owned-listing',
  sourceUrl: 'https://synthetic.invalid/listing',
  runId: propertyId,
  snapshotId: listingId,
  contentHash: `sha256:${'a'.repeat(64)}`,
  observedAt: metadata.asOf,
};
export const reductionsFixture: ReductionsResponse = {
  metadata,
  nextCursor: null,
  totalItems: 1,
  items: [
    {
      propertyId,
      listingId,
      place: ref(bela),
      effectiveAt: metadata.asOf,
      previousMinorUnits: 70000000,
      currentMinorUnits: 62800000,
      reductionPercent: 10.285714,
      provenance,
    },
  ],
};
export const propertyFixture: PropertyResponse = {
  metadata,
  property: {
    summary: {
      ...property,
      id: propertyId,
      breadcrumbs: [ref(bela)],
      askingPrice: { minorUnits: 62800000, currency: 'BRL', listingId, provenance },
      firstCollectedAt: metadata.asOf,
      lastCollectedAt: metadata.asOf,
    },
    sale: { status: 'not-recorded' },
    listings: [],
    priceChanges: [],
    sourceAgreement: [],
    featureAgreement: [],
    preparedEvidence: {
      kind: 'prepared-fixture',
      label: 'Owned fixture',
      listingIds: [],
      productionMatchScore: null,
      illustrativeProbability: 1,
      probabilityBasis: 'prepared-not-calibrated',
      reasons: [],
    },
  },
};
export function overviewFixture(
  path: string,
  place: PlaceDetail = path.includes(pinheiros.id) ? pinheiros : bela,
): unknown {
  const collection = placesFixture(path);
  if (collection) return collection;
  if (path === `/api/v1/places/${place.id}/market`)
    return marketFixture(place, place.id === bela.id);
  if (path === `/api/v1/places/${place.id}/market/neighbours`) return neighboursFixture(place);
  if (path === `/api/v1/places/${place.id}/market/monthly-series`) return seriesFixture(place);
  if (path === `/api/v1/places/${place.id}/largest-reductions?pageSize=3`)
    return { metadata, items: [], nextCursor: null, totalItems: 0 };
  if (path === `/api/v1/properties/${propertyId}`) return propertyFixture;
  if (path === `/api/v1/places/${place.id}`) return { metadata, place };
  throw new Error(`Unowned fixture path: ${path}`);
}
it('keeps the monthly series at twelve points with a real gap', () =>
  expect(seriesFixture().points).toHaveLength(12));
it('passes public validation for every ancillary positive fixture', () => {
  expect(parsePlaceMarketNeighboursResponse(neighboursFixture())).toEqual(neighboursFixture());
  expect(parsePlaceMarketSeriesResponse(seriesFixture())).toEqual(seriesFixture());
  expect(parsePropertyResponse(propertyFixture)).toEqual(propertyFixture);
});
