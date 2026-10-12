import type { PlaceDetail, PlaceMarketResponse, PlaceRef } from '@rei/contracts';
import { MARKET_PREPARED_SECTIONS } from '@rei/contracts';
import { expect, it } from 'vitest';

export const metadata = {
  dataMode: 'synthetic-stub',
  fixtureVersion: 'test-v1',
  asOf: '2026-10-12T12:00:00.000Z',
} as const;
function ref(place: PlaceRef): PlaceRef {
  return { id: place.id, kind: place.kind, name: place.name };
}
export const brasil: PlaceDetail = {
  id: 'brasil',
  kind: 'country',
  name: { en: 'Brazil', ptBR: 'Brasil' },
  parentId: null,
  breadcrumbs: [],
  adjacentPlaceIds: [],
  propertyCount: 2000,
  coordinates: null,
  block: null,
};
const state: PlaceDetail = {
  ...brasil,
  id: 'sao-paulo-state',
  kind: 'state',
  name: { en: 'São Paulo', ptBR: 'São Paulo' },
  parentId: brasil.id,
  breadcrumbs: [ref(brasil)],
};
const city: PlaceDetail = {
  ...state,
  id: 'sao-paulo',
  kind: 'city',
  parentId: state.id,
  breadcrumbs: [brasil, state].map(ref),
};
const centro: PlaceDetail = {
  ...city,
  id: 'sao-paulo-centro',
  kind: 'zone',
  name: { en: 'Central zone', ptBR: 'Centro' },
  parentId: city.id,
  breadcrumbs: [brasil, state, city].map(ref),
};
const oeste: PlaceDetail = {
  ...centro,
  id: 'sao-paulo-oeste',
  name: { en: 'West zone', ptBR: 'Oeste' },
};
export const bela: PlaceDetail = {
  id: 'sao-paulo-bela-vista',
  kind: 'neighborhood',
  name: { en: 'Bela Vista', ptBR: 'Bela Vista' },
  parentId: 'sao-paulo-centro',
  breadcrumbs: [brasil, state, city, centro].map(ref),
  adjacentPlaceIds: [],
  propertyCount: 2000,
  coordinates: null,
  block: null,
};
export const pinheiros: PlaceDetail = {
  ...bela,
  id: 'sao-paulo-pinheiros',
  name: { en: 'Pinheiros', ptBR: 'Pinheiros' },
  parentId: oeste.id,
  breadcrumbs: [brasil, state, city, oeste].map(ref),
};
export function placesFixture(path: string) {
  const collections: Record<string, readonly PlaceDetail[]> = {
    '/api/v1/places': [brasil],
    '/api/v1/places/brasil/children': [state],
    '/api/v1/places/sao-paulo-state/children': [city],
    '/api/v1/places/sao-paulo/children': [centro, oeste],
    '/api/v1/places/sao-paulo-centro/children': [bela],
    '/api/v1/places/sao-paulo-oeste/children': [pinheiros],
  };
  return collections[path] ? { metadata, items: collections[path] } : undefined;
}
const evidence = {
  recordCount: 1,
  sources: [
    {
      id: 'synthetic-data',
      label: 'synthetic-data',
      url: 'https://synthetic.invalid',
      collectedAt: metadata.asOf,
    },
  ],
  computedAt: metadata.asOf,
  freshness: { status: 'fresh', latestCollectionCompletedAt: metadata.asOf, ageSeconds: 0 },
} as const;
export function marketFixture(place = bela, available = true): PlaceMarketResponse {
  const preparedEvidence = {
    ...evidence,
    recordCount: 0,
    sources: [],
    freshness: { status: 'fresh', latestCollectionCompletedAt: null, ageSeconds: 0 },
  } as const;
  const empty = { ...preparedEvidence, state: 'insufficient-data', value: null } as const;
  const prepared = {
    ...evidence,
    recordCount: 2000,
    sources: Array.from({ length: 5 }, (_, index) => ({
      ...evidence.sources[0],
      id: `prepared-${index}`,
      label: `prepared-${index}`,
    })),
    state: 'available',
  } as const;
  const liveEvidence = {
    ...evidence,
    recordCount: available ? 1 : 0,
    sources: available ? evidence.sources : [],
    freshness: { status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 0 },
  } as const;
  return {
    metadata,
    basis: 'event-fed-median-with-prepared-sections',
    preparedSections: MARKET_PREPARED_SECTIONS,
    preparedEvaluatedAt: metadata.asOf,
    evaluatedAt: metadata.asOf,
    place: { id: place.id, kind: place.kind, name: place.name },
    counts: { properties: 2000, activeListings: 2500, sources: 5 },
    parentMedian: {
      place: place.breadcrumbs.at(-1)!,
      median: {
        ...liveEvidence,
        state: 'insufficient-data',
        value: null,
        recordCount: 0,
        sources: [],
      },
    },
    figures: {
      medianAskingPricePerSquareMeter: available
        ? { ...liveEvidence, state: 'available', value: { minorUnits: 951515, currency: 'BRL' } }
        : { ...liveEvidence, state: 'insufficient-data', value: null },
      askingPriceMovement: { ...empty, windowMonths: 6 },
      medianTimeOnMarketDays: { ...prepared, value: 90 },
      priceReductions: {
        ...prepared,
        recordCount: 2500,
        windowDays: 30,
        value: { count: 0, percentage: 0 },
      },
      listingsPerProperty: { ...prepared, value: 1.25 },
      recordedSalePricePerSquareMeter: { ...preparedEvidence, state: 'not-recorded', value: null },
    },
  };
}
it('uses different prepared and contributing sample counts', () => {
  expect(marketFixture().counts.properties).not.toBe(
    marketFixture().figures.medianAskingPricePerSquareMeter.recordCount,
  );
});
