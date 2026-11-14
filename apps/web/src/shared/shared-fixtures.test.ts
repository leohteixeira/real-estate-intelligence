import type { MarketEvidence, PropertySummary } from '@rei/contracts';
import { expect, it } from 'vitest';

export const evidence: MarketEvidence = {
  recordCount: 1,
  sources: [
    {
      id: 'synthetic',
      label: 'Synthetic source',
      url: 'https://synthetic.invalid',
      collectedAt: '2026-10-12T12:00:00Z',
    },
  ],
  computedAt: '2026-10-12T12:00:00Z',
  freshness: {
    status: 'fresh',
    latestCollectionCompletedAt: '2026-10-12T12:00:00Z',
    ageSeconds: 0,
  },
};
export const property: PropertySummary = {
  id: 'component-property',
  fixtureLabel: 'Never an address',
  propertyType: 'apartment',
  place: {
    id: 'block',
    kind: 'street-block',
    name: { ptBR: 'Rua Bela — 1200–1298', en: 'Rua Bela — block 1200–1298' },
  },
  breadcrumbs: [],
  areaSquareMeters: 66,
  bedrooms: 2,
  bathrooms: 1,
  parkingSpaces: null,
  askingPrice: {
    minorUnits: 62800000,
    currency: 'BRL',
    listingId: 'listing',
    provenance: {
      sourceId: 'synthetic',
      sourceListingId: 'listing',
      sourceUrl: 'https://synthetic.invalid',
      runId: 'run',
      snapshotId: 'snapshot',
      contentHash: 'hash',
      observedAt: evidence.computedAt,
    },
  },
  pricePerSquareMeter: 951515,
  timeOnMarketDays: 90,
  firstCollectedAt: evidence.computedAt,
  lastCollectedAt: evidence.computedAt,
  activeListingCount: 2,
  priceReduced: false,
  returnedToMarket: false,
  belowMedianPercent: 3.1,
  neighborhoodComparison: null,
};
it('keeps component fixture prices in contract minor units', () =>
  expect(property.pricePerSquareMeter).toBe(951515));
