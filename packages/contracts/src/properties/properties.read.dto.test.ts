import { describe, expect, it } from 'vitest';
import {
  parseListingResponse,
  parsePropertyResponse,
  parseReductionsResponse,
  parseSearchResponse,
} from './properties.read.dto.js';
import type {
  ListingResponse,
  PropertyResponse,
  ReductionsResponse,
  SearchResponse,
} from './properties.read.types.js';

const id = '0199a3e0-0000-7000-8000-000000000001';
const date = '2026-10-01T12:00:00.000Z';
const metadata = { dataMode: 'synthetic-stub' as const, fixtureVersion: 'fixture-v1', asOf: date };
const place = {
  id: 'sao-paulo',
  kind: 'city' as const,
  name: { en: 'São Paulo', ptBR: 'São Paulo' },
};
const provenance = {
  sourceId: 'synthetic-data',
  sourceListingId: 'fixture-1',
  sourceUrl: 'https://fixture.invalid/one',
  runId: id,
  snapshotId: id,
  contentHash: `sha256:${'a'.repeat(64)}`,
  observedAt: date,
};
const summary = {
  id,
  fixtureLabel: 'Fixture',
  propertyType: 'apartment' as const,
  place,
  breadcrumbs: [place],
  areaSquareMeters: 82,
  bedrooms: 2,
  bathrooms: 2,
  parkingSpaces: 1,
  askingPrice: { minorUnits: 82000000, currency: 'BRL' as const, listingId: id, provenance },
  pricePerSquareMeter: 1000000,
  timeOnMarketDays: 365,
  firstCollectedAt: date,
  lastCollectedAt: date,
  activeListingCount: 1,
  priceReduced: true,
  returnedToMarket: false,
  belowMedianPercent: 1,
  neighborhoodComparison: null,
};
const listing: ListingResponse = {
  metadata,
  listing: {
    id,
    propertyId: id,
    fixtureLabel: 'Fixture',
    source: {
      sourceId: 'synthetic-data',
      sourceListingId: 'fixture-1',
      label: 'Synthetic',
      url: provenance.sourceUrl,
    },
    position: 1,
    status: 'active',
    propertyType: 'apartment',
    place,
    publishedNeighborhood: 'Fixture',
    street: 'Fixture Street',
    areaSquareMeters: 82,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    features: ['balcony'],
    askingPriceMinorUnits: 82000000,
    currency: 'BRL',
    pricePerSquareMeter: 1000000,
    pricePerSquareMeterFormula: 'askingPriceMinorUnits / areaSquareMeters',
    provenance,
    snapshot: { availability: 'available', collectedAt: date, expiresAt: null },
    collectionCount: 13,
    firstCollectedAt: date,
    lastCollectedAt: date,
    fieldEffectiveAt: { askingPrice: date, description: date, attributes: date },
    description: {
      permission: 'allowed',
      current: 'Synthetic text',
      versions: [
        { effectiveAt: date, text: 'Synthetic text', contentHash: provenance.contentHash },
      ],
      sourceUrl: provenance.sourceUrl,
    },
    history: [
      { type: 'created', effectiveAt: date, provenance },
      {
        type: 'price-changed',
        effectiveAt: date,
        previousMinorUnits: 83000000,
        currentMinorUnits: 82000000,
        provenance,
      },
      {
        type: 'description-changed',
        effectiveAt: date,
        beforeHash: provenance.contentHash,
        afterHash: `sha256:${'b'.repeat(64)}`,
        provenance,
      },
      { type: 'removed', effectiveAt: date, provenance },
      { type: 'reappeared', effectiveAt: date, provenance },
    ],
    lifeline: [{ from: date, to: null }],
  },
};
const search: SearchResponse = {
  metadata,
  items: [summary],
  totalItems: 1,
  nextCursor: null,
  medianPricePerSquareMeter: 1000000,
  placeCounts: [{ placeId: place.id, totalItems: 1 }],
};
const property: PropertyResponse = {
  metadata,
  property: {
    summary,
    sale: { status: 'not-recorded' },
    listings: [listing.listing],
    priceChanges: [
      {
        effectiveAt: date,
        previousMinorUnits: 83000000,
        currentMinorUnits: 82000000,
        changePercent: -100 / 83,
        provenance,
      },
    ],
    sourceAgreement: [
      {
        field: 'bedrooms',
        values: [{ listingId: id, sourceId: 'synthetic-data', value: 2 }],
        agrees: true,
      },
    ],
    featureAgreement: [
      {
        feature: 'balcony',
        reportingCount: 1,
        reportingPercent: 100,
        listingIds: [id],
        sourceIds: ['synthetic-data'],
      },
    ],
    preparedEvidence: {
      kind: 'prepared-fixture',
      label: 'Prepared',
      listingIds: [id],
      productionMatchScore: null,
      illustrativeProbability: 0.95,
      probabilityBasis: 'prepared-not-calibrated',
      reasons: [
        {
          type: 'attribute-agreement',
          field: 'propertyType',
          value: 'apartment',
          listingIds: [id],
        },
        { type: 'shared-structured-feature', feature: 'balcony', listingIds: [id] },
        {
          type: 'published-neighborhood-disagreement',
          values: [{ listingId: id, neighborhood: 'Fixture' }],
        },
      ],
    },
  },
};
const reductions: ReductionsResponse = {
  metadata,
  items: [
    {
      propertyId: id,
      listingId: id,
      place,
      effectiveAt: date,
      previousMinorUnits: 83000000,
      currentMinorUnits: 82000000,
      reductionPercent: 1.2,
      provenance,
    },
  ],
  nextCursor: null,
  totalItems: 1,
};

describe('properties closed wire contracts', () => {
  it('validates signed percentages, illustrative evidence and feature reporting without accepting private fields', () => {
    for (const changePercent of [-2.5, 3, 0]) {
      expect(
        parsePropertyResponse({
          ...property,
          property: {
            ...property.property,
            priceChanges: [{ ...property.property.priceChanges[0], changePercent }],
          },
        }),
      ).toBeDefined();
    }
    for (const changePercent of [NaN, Infinity, -101, '2.5']) {
      expect(() =>
        parsePropertyResponse({
          ...property,
          property: {
            ...property.property,
            priceChanges: [{ ...property.property.priceChanges[0], changePercent }],
          },
        }),
      ).toThrow();
    }
    for (const patch of [
      { illustrativeProbability: -0.1 },
      { illustrativeProbability: 1.1 },
      { illustrativeProbability: NaN },
      { probabilityBasis: 'calibrated' },
      { productionMatchScore: 0.95 },
      { reasons: [{ type: 'image-similarity', fingerprint: 'private' }] },
      {
        reasons: [
          { type: 'attribute-agreement', field: 'description', value: 'private', listingIds: [id] },
        ],
      },
      {
        reasons: [
          { type: 'attribute-agreement', field: 'bedrooms', value: null, listingIds: [id] },
        ],
      },
      {
        reasons: [
          { type: 'attribute-agreement', field: 'bedrooms', value: Infinity, listingIds: [id] },
        ],
      },
    ])
      expect(() =>
        parsePropertyResponse({
          ...property,
          property: {
            ...property.property,
            preparedEvidence: { ...property.property.preparedEvidence, ...patch },
          },
        }),
      ).toThrow();
    for (const patch of [
      { reportingCount: 0.5 },
      { reportingCount: -1 },
      { reportingPercent: 101 },
      { reportingPercent: -1 },
      { listingIds: ['bad'] },
      { sourceIds: ['BAD'] },
      { absent: true },
    ]) {
      expect(() =>
        parsePropertyResponse({
          ...property,
          property: {
            ...property.property,
            featureAgreement: [{ ...property.property.featureAgreement[0], ...patch }],
          },
        }),
      ).toThrow();
    }
  });
  it('round trips all responses and history variants as plain JSON', () => {
    for (const [parser, fixture] of [
      [parseSearchResponse, search],
      [parsePropertyResponse, property],
      [parseListingResponse, listing],
      [parseReductionsResponse, reductions],
    ] as const)
      expect(parser(JSON.parse(JSON.stringify(fixture)))).toEqual(fixture);
    const denied = {
      ...listing,
      listing: {
        ...listing.listing,
        description: { permission: 'denied', changedAt: [date], sourceUrl: provenance.sourceUrl },
        snapshot: { availability: 'expired', collectedAt: date, expiresAt: date },
      },
    };
    expect(parseListingResponse(denied)).toEqual(denied);
    expect(() =>
      parseListingResponse({
        ...denied,
        listing: {
          ...denied.listing,
          description: { ...denied.listing.description, current: 'LEAK' },
        },
      }),
    ).toThrow();
    expect(
      parseSearchResponse({ ...search, items: [], medianPricePerSquareMeter: null, totalItems: 0 }),
    ).toBeDefined();
    expect(
      parsePropertyResponse({
        ...property,
        property: {
          ...property.property,
          summary: {
            ...summary,
            areaSquareMeters: null,
            bedrooms: null,
            askingPrice: null,
            pricePerSquareMeter: null,
            belowMedianPercent: null,
          },
        },
      }),
    ).toBeDefined();
  });
  it('rejects missing and extra fields at every nested object boundary', () => {
    function mutations(
      value: unknown,
      path: (string | number)[] = [],
    ): { path: (string | number)[]; value: unknown }[] {
      if (Array.isArray(value))
        return value.flatMap((item, index) => mutations(item, [...path, index]));
      if (typeof value !== 'object' || value === null) return [];
      const object = value as Record<string, unknown>;
      return [
        { path, value: { ...object, unexpected: 'forbidden' } },
        ...Object.keys(object).map((key) => {
          const missing = { ...object };
          delete missing[key];
          return { path, value: missing };
        }),
        ...Object.entries(object).flatMap(([key, child]) => mutations(child, [...path, key])),
      ];
    }
    for (const [parser, fixture] of [
      [parseSearchResponse, search],
      [parsePropertyResponse, property],
      [parseListingResponse, listing],
      [parseReductionsResponse, reductions],
    ] as const) {
      for (const mutation of mutations(fixture)) {
        const copy = structuredClone(fixture);
        if (!mutation.path.length) {
          expect(() => parser(mutation.value)).toThrow();
          continue;
        }
        let parent = copy as unknown as Record<string | number, unknown>;
        for (const segment of mutation.path.slice(0, -1))
          parent = parent[segment] as Record<string | number, unknown>;
        parent[mutation.path.at(-1)!] = mutation.value;
        expect(() => parser(copy)).toThrow();
      }
    }
  });
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100'])(
    'rejects invalid wire money %s',
    (value) => {
      expect(() =>
        parseSearchResponse({
          ...search,
          items: [{ ...summary, askingPrice: { ...summary.askingPrice, minorUnits: value } }],
        }),
      ).toThrow();
    },
  );
  it.each([null, [], 'text', 1, new Date(), { metadata }])(
    'rejects malformed top level %s',
    (value) => {
      expect(() => parseSearchResponse(value)).toThrow();
    },
  );
  it('rejects malformed IDs, dates, enums, booleans, hashes, URLs and numbers', () => {
    for (const patch of [
      { id: 'not-an-id' },
      { firstCollectedAt: '2026-02-30T12:00:00.000Z' },
      { propertyType: 'boat' },
      { priceReduced: 'true' },
      { activeListingCount: 0.5 },
      { areaSquareMeters: 0 },
      { timeOnMarketDays: -1 },
      { neighborhoodComparison: 1 },
    ])
      expect(() => parseSearchResponse({ ...search, items: [{ ...summary, ...patch }] })).toThrow();
    for (const patch of [
      { sourceUrl: 'file:///one' },
      { sourceUrl: 'https://user:password@fixture.invalid' },
      { sourceUrl: 'malformed' },
      { contentHash: 'bad' },
      { sourceId: 'UPPER' },
      { observedAt: 'bad' },
    ])
      expect(() =>
        parseListingResponse({
          ...listing,
          listing: { ...listing.listing, provenance: { ...provenance, ...patch } },
        }),
      ).toThrow();
    expect(() =>
      parseListingResponse({
        ...listing,
        listing: { ...listing.listing, description: { permission: 'unknown' } },
      }),
    ).toThrow();
    expect(() =>
      parseListingResponse({
        ...listing,
        listing: { ...listing.listing, history: [{ type: 'unknown' }] },
      }),
    ).toThrow();
    expect(() =>
      parsePropertyResponse({
        ...property,
        property: {
          ...property.property,
          sourceAgreement: [
            {
              ...property.property.sourceAgreement[0],
              values: [{ listingId: id, sourceId: 'synthetic-data', value: {} }],
            },
          ],
        },
      }),
    ).toThrow();
  });
});
