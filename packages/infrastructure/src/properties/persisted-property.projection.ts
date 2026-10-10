import { createHash } from 'node:crypto';
import {
  pricePerSquareMeter,
  type ListingDetail,
  type Property,
  type PropertyResponse,
} from '@rei/domain';

/** The metadata clock and all effective dates refer to the original observation. */
export function projectInitialProperty(property: Property, textAllowed: boolean): PropertyResponse {
  const initial = property.initial.payload.listing;
  const { provenance } = property;
  const observedAt = provenance.observedAt;
  const label = 'Persisted initial synthetic observation; history and matching pending';
  const calculatedPrice = pricePerSquareMeter({
    priceInCents: initial.askingPriceMinorUnits,
    areaInSquareMeters: initial.areaSquareMeters,
  });
  const price =
    Number.isSafeInteger(calculatedPrice) && calculatedPrice > 0 ? calculatedPrice : null;
  const listing: ListingDetail = {
    id: property.listingId,
    propertyId: property.propertyId,
    fixtureLabel: label,
    source: {
      sourceId: provenance.sourceId,
      sourceListingId: provenance.sourceListingId,
      label: 'Owned synthetic source',
      url: provenance.sourceUrl,
    },
    position: 1,
    status: 'active',
    propertyType: initial.propertyType,
    place: property.resolved.place,
    publishedNeighborhood: initial.location.neighborhood,
    street: initial.location.street,
    areaSquareMeters: initial.areaSquareMeters,
    bedrooms: initial.bedrooms,
    bathrooms: initial.bathrooms,
    parkingSpaces: initial.parkingSpaces,
    features: initial.features,
    askingPriceMinorUnits: initial.askingPriceMinorUnits,
    currency: 'BRL',
    pricePerSquareMeter: price,
    pricePerSquareMeterFormula: 'askingPriceMinorUnits / areaSquareMeters',
    provenance,
    snapshot: { availability: 'available', collectedAt: observedAt, expiresAt: null },
    collectionCount: 1,
    firstCollectedAt: observedAt,
    lastCollectedAt: observedAt,
    fieldEffectiveAt: { askingPrice: observedAt, description: observedAt, attributes: observedAt },
    description: textAllowed
      ? {
          permission: 'allowed',
          current: initial.maskedDescription,
          versions: [
            {
              effectiveAt: observedAt,
              text: initial.maskedDescription,
              contentHash: `sha256:${createHash('sha256').update(initial.maskedDescription).digest('hex')}`,
            },
          ],
          sourceUrl: provenance.sourceUrl,
        }
      : { permission: 'denied', changedAt: [], sourceUrl: provenance.sourceUrl },
    history: [{ type: 'created', effectiveAt: observedAt, provenance }],
    lifeline: [{ from: observedAt, to: null }],
  };
  return structuredClone({
    metadata: {
      dataMode: 'synthetic-stub',
      fixtureVersion: 'persisted-initial-synthetic-v1',
      asOf: observedAt,
    },
    property: {
      summary: {
        id: property.propertyId,
        fixtureLabel: label,
        propertyType: initial.propertyType,
        place: property.resolved.place,
        breadcrumbs: property.resolved.breadcrumbs,
        areaSquareMeters: initial.areaSquareMeters,
        bedrooms: initial.bedrooms,
        bathrooms: initial.bathrooms,
        parkingSpaces: initial.parkingSpaces,
        askingPrice: {
          minorUnits: initial.askingPriceMinorUnits,
          currency: 'BRL',
          listingId: property.listingId,
          provenance,
        },
        pricePerSquareMeter: price,
        timeOnMarketDays: Math.max(
          0,
          Math.floor((Date.parse(observedAt) - Date.parse(initial.listedAt)) / 86_400_000),
        ),
        firstCollectedAt: observedAt,
        lastCollectedAt: observedAt,
        activeListingCount: 1,
        priceReduced: false,
        returnedToMarket: false,
        belowMedianPercent: null,
        neighborhoodComparison: null,
      },
      sale: { status: 'not-recorded' },
      listings: [listing],
      priceChanges: [],
      sourceAgreement: [],
      featureAgreement: initial.features.map((feature) => ({
        feature,
        reportingCount: 1,
        reportingPercent: 100,
        listingIds: [property.listingId],
        sourceIds: [provenance.sourceId],
      })),
      preparedEvidence: {
        kind: 'prepared-fixture',
        label: 'Illustrative single-listing baseline; no production matching or calibration',
        listingIds: [property.listingId],
        productionMatchScore: null,
        illustrativeProbability: 0,
        probabilityBasis: 'prepared-not-calibrated',
        reasons: [],
      },
    },
  });
}
