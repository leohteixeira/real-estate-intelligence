import { parsePropertyResponse } from '@rei/contracts';
import type { ListingDetail, PropertyResponse, PreparedGroupingReason } from '@rei/contracts';
import { expect, it } from 'vitest';
import { propertyFixture, propertyId, provenance } from '../places/overview-fixtures.test';
import { bela } from '../places/place-fixtures.test';

const first = '2025-10-01T12:00:00.000Z';
const january = '2026-01-01T12:00:00.000Z';
const july = '2026-07-01T12:00:00.000Z';
const id = (number: number) => `0199a3e0-0000-7000-8000-${String(number).padStart(12, '0')}`;
const listings: ListingDetail[] = ['Aurora', 'Brisa', 'Cobalto'].map((label, index) => ({
  id: id(101 + index),
  propertyId,
  fixtureLabel: 'Isolated parsed Property regression fixture',
  source: {
    sourceId: label.toLowerCase(),
    sourceListingId: `fixture-${index}`,
    label,
    url: 'https://synthetic.invalid/listing',
  },
  position: index + 1,
  status: 'active',
  propertyType: 'apartment',
  place: propertyFixture.property.summary.place,
  publishedNeighborhood: index === 2 ? 'Consolação' : 'Bela Vista',
  street: 'Rua Cenário Um',
  areaSquareMeters: 82,
  bedrooms: 3,
  bathrooms: 2,
  parkingSpaces: 1,
  features: ['balcony', 'elevator'],
  askingPriceMinorUnits: 78000000,
  currency: 'BRL',
  pricePerSquareMeter: 951220,
  pricePerSquareMeterFormula: 'askingPriceMinorUnits / areaSquareMeters',
  provenance: {
    ...provenance,
    sourceId: label.toLowerCase(),
    sourceListingId: `fixture-${index}`,
    snapshotId: id(401 + index),
  },
  snapshot: { availability: 'available', collectedAt: provenance.observedAt, expiresAt: null },
  collectionCount: 12,
  firstCollectedAt: first,
  lastCollectedAt: provenance.observedAt,
  fieldEffectiveAt: { askingPrice: july, description: january, attributes: first },
  description: {
    permission: 'allowed',
    current: '<script>safe visible text</script>',
    versions: [
      {
        effectiveAt: first,
        text: 'First allowed description',
        contentHash: provenance.contentHash,
      },
    ],
    sourceUrl: provenance.sourceUrl,
  },
  history: [
    { type: 'created', effectiveAt: first, provenance },
    {
      type: 'price-changed',
      effectiveAt: january,
      previousMinorUnits: 84000000,
      currentMinorUnits: 80000000,
      provenance,
    },
    {
      type: 'description-changed',
      effectiveAt: january,
      beforeHash: provenance.contentHash,
      afterHash: `sha256:${'b'.repeat(64)}`,
      provenance,
    },
    {
      type: 'price-changed',
      effectiveAt: july,
      previousMinorUnits: 80000000,
      currentMinorUnits: 78000000,
      provenance,
    },
  ],
  lifeline: [{ from: first, to: null }],
}));
const listingIds = listings.map((listing) => listing.id);
const reasons: PreparedGroupingReason[] = (
  ['propertyType', 'areaSquareMeters', 'bedrooms', 'bathrooms', 'parkingSpaces', 'street'] as const
).map((field) => ({ type: 'attribute-agreement', field, value: listings[0]![field]!, listingIds }));
reasons.push(
  ...['balcony', 'elevator'].map((feature) => ({
    type: 'shared-structured-feature' as const,
    feature,
    listingIds,
  })),
  {
    type: 'published-neighborhood-disagreement',
    values: listings.map((listing) => ({
      listingId: listing.id,
      neighborhood: listing.publishedNeighborhood,
    })),
  },
);
export function propertyDetailFixture(): PropertyResponse {
  return parsePropertyResponse({
    ...propertyFixture,
    property: {
      ...propertyFixture.property,
      summary: {
        ...propertyFixture.property.summary,
        place: {
          ...propertyFixture.property.summary.place,
          name: { ptBR: 'Rua Cenário Um', en: 'Never translate' },
        },
        breadcrumbs: bela.breadcrumbs.concat({ id: bela.id, kind: bela.kind, name: bela.name }),
        areaSquareMeters: 82,
        bedrooms: 3,
        bathrooms: 2,
        parkingSpaces: 1,
        askingPrice: {
          minorUnits: 78000000,
          currency: 'BRL',
          listingId: listings[0]!.id,
          provenance: listings[0]!.provenance,
        },
        pricePerSquareMeter: 951220,
        activeListingCount: 3,
        firstCollectedAt: first,
        belowMedianPercent: null,
      },
      listings,
      priceChanges: [
        {
          effectiveAt: january,
          previousMinorUnits: 84000000,
          currentMinorUnits: 80000000,
          changePercent: -4.76190476,
          provenance: listings[0]!.provenance,
        },
        {
          effectiveAt: july,
          previousMinorUnits: 80000000,
          currentMinorUnits: 78000000,
          changePercent: -2.5,
          provenance: listings[0]!.provenance,
        },
      ],
      sourceAgreement: (
        [
          'propertyType',
          'areaSquareMeters',
          'bedrooms',
          'bathrooms',
          'parkingSpaces',
          'neighborhood',
        ] as const
      ).map((field) => ({
        field,
        agrees: field !== 'neighborhood',
        values: listings.map((listing) => ({
          listingId: listing.id,
          sourceId: listing.source.sourceId,
          value: field === 'neighborhood' ? listing.publishedNeighborhood : listing[field],
        })),
      })),
      featureAgreement: ['balcony', 'elevator'].map((feature) => ({
        feature,
        reportingCount: 3,
        reportingPercent: 100,
        listingIds,
        sourceIds: listings.map((listing) => listing.source.sourceId),
      })),
      preparedEvidence: {
        ...propertyFixture.property.preparedEvidence,
        listingIds,
        illustrativeProbability: 0.95,
        reasons,
      },
    },
  });
}
it('parses the full isolated three-listing regression fixture', () => {
  expect(propertyDetailFixture().property.preparedEvidence.reasons).toHaveLength(9);
});
