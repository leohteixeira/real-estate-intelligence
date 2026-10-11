import { createHash } from 'node:crypto';
import {
  pricePerSquareMeter,
  type ListingDetail,
  type Property,
  type PropertyResponse,
} from '@rei/domain';

/** The metadata clock and all effective dates refer to the original observation. */
export function projectInitialProperty(property: Property, textAllowed: boolean): PropertyResponse {
  const initial = property.normalized;
  const { provenance } = property;
  const observedAt = provenance.observedAt;
  const label = 'Persisted initial synthetic observation; history and matching pending';
  const calculatedPrice = pricePerSquareMeter({
    priceInCents: initial.askingPriceMinorUnits.value,
    areaInSquareMeters: initial.areaSquareMeters.value,
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
    propertyType: initial.propertyType.value,
    place: property.resolved.place,
    publishedNeighborhood: initial.location.neighborhood.value,
    street: initial.location.street.value,
    areaSquareMeters: initial.areaSquareMeters.value,
    bedrooms: initial.bedrooms.value,
    bathrooms: initial.bathrooms.value,
    parkingSpaces: initial.parkingSpaces.value,
    features: initial.features.map((feature) => feature.value),
    askingPriceMinorUnits: initial.askingPriceMinorUnits.value,
    currency: initial.currency.value,
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
          current: initial.maskedDescription.value,
          versions: [
            {
              effectiveAt: observedAt,
              text: initial.maskedDescription.value,
              contentHash: `sha256:${createHash('sha256').update(initial.maskedDescription.value).digest('hex')}`,
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
        propertyType: initial.propertyType.value,
        place: property.resolved.place,
        breadcrumbs: property.resolved.breadcrumbs,
        areaSquareMeters: initial.areaSquareMeters.value,
        bedrooms: initial.bedrooms.value,
        bathrooms: initial.bathrooms.value,
        parkingSpaces: initial.parkingSpaces.value,
        askingPrice: {
          minorUnits: initial.askingPriceMinorUnits.value,
          currency: initial.currency.value,
          listingId: property.listingId,
          provenance,
        },
        pricePerSquareMeter: price,
        timeOnMarketDays: Math.max(
          0,
          Math.floor((Date.parse(observedAt) - Date.parse(initial.listedAt.value)) / 86_400_000),
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
        feature: feature.value,
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
