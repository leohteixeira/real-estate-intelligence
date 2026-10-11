import { createHash } from 'node:crypto';
import {
  pricePerSquareMeter,
  NormalizedListing,
  unionListingLifelines,
  type ListingChronologyState,
  type ListingDetail,
  type Property,
  type PropertyResponse,
} from '@rei/domain';

/** The metadata clock and all effective dates refer to the original observation. */
export function projectInitialProperty(
  property: Property,
  textAllowed: boolean,
  state: ListingChronologyState | null = null,
): PropertyResponse {
  const latest = state?.acquisitions.at(-1);
  const initial = latest
    ? new NormalizedListing(latest.corrected ?? latest.original)
    : property.normalized;
  const provenance = initial.provenance;
  const resolved = latest?.resolved ?? property.resolved;
  const observedAt = provenance.observedAt;
  const firstCollectedAt = state?.acquisitions[0]?.original.payload.source.observedAt ?? observedAt;
  const label = state
    ? 'Persisted synthetic listing history; matching pending'
    : 'Persisted initial synthetic observation; history and matching pending';
  const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
  const dated = state?.acquisitions.map(
    (item) => new NormalizedListing(item.corrected ?? item.original),
  ) ?? [initial];
  const versions: { effectiveAt: string; text: string; contentHash: string }[] = [];
  let priceEffectiveAt = firstCollectedAt,
    attributesEffectiveAt = firstCollectedAt;
  for (const [index, value] of dated.entries()) {
    const prior = dated[index - 1];
    if (!prior || value.maskedDescription.value !== prior.maskedDescription.value)
      versions.push({
        effectiveAt: value.provenance.observedAt,
        text: value.maskedDescription.value,
        contentHash: hash(value.maskedDescription.value),
      });
    if (!prior || value.askingPriceMinorUnits.value !== prior.askingPriceMinorUnits.value)
      priceEffectiveAt = value.provenance.observedAt;
    const attributes = (item: NormalizedListing) =>
      JSON.stringify([
        item.propertyType.value,
        item.areaSquareMeters.value,
        item.bedrooms.value,
        item.bathrooms.value,
        item.parkingSpaces.value,
        item.features.map((feature) => feature.value),
        [
          item.location.city.value,
          item.location.neighborhood.value,
          item.location.street.value,
          item.location.stateCode.value,
        ],
      ]);
    if (!prior || attributes(value) !== attributes(prior))
      attributesEffectiveAt = value.provenance.observedAt;
  }
  const history = state?.history ?? [
    { type: 'created' as const, effectiveAt: observedAt, provenance },
  ];
  const lifeline = unionListingLifelines(state?.lifeline ?? [{ from: observedAt, to: null }]);
  const status = state?.status ?? 'active';
  const asOf = [
    ...history.map((entry) => entry.effectiveAt),
    ...dated.map((value) => value.provenance.observedAt),
  ].reduce(
    (latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest),
    observedAt,
  );
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
    status,
    propertyType: initial.propertyType.value,
    place: resolved.place,
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
    collectionCount: dated.length,
    firstCollectedAt,
    lastCollectedAt: observedAt,
    fieldEffectiveAt: {
      askingPrice: priceEffectiveAt,
      description: versions.at(-1)!.effectiveAt,
      attributes: attributesEffectiveAt,
    },
    description: textAllowed
      ? {
          permission: 'allowed',
          current: initial.maskedDescription.value,
          versions,
          sourceUrl: provenance.sourceUrl,
        }
      : {
          permission: 'denied',
          changedAt: versions.slice(1).map((version) => version.effectiveAt),
          sourceUrl: provenance.sourceUrl,
        },
    history,
    lifeline,
  };
  return structuredClone({
    metadata: {
      dataMode: 'synthetic-stub',
      fixtureVersion: state ? 'persisted-synthetic-history-v1' : 'persisted-initial-synthetic-v1',
      asOf,
    },
    property: {
      summary: {
        id: property.propertyId,
        fixtureLabel: label,
        propertyType: initial.propertyType.value,
        place: resolved.place,
        breadcrumbs: resolved.breadcrumbs,
        areaSquareMeters: initial.areaSquareMeters.value,
        bedrooms: initial.bedrooms.value,
        bathrooms: initial.bathrooms.value,
        parkingSpaces: initial.parkingSpaces.value,
        askingPrice:
          status === 'removed'
            ? null
            : {
                minorUnits: initial.askingPriceMinorUnits.value,
                currency: initial.currency.value,
                listingId: property.listingId,
                provenance,
              },
        pricePerSquareMeter: status === 'removed' ? null : price,
        timeOnMarketDays: Math.max(
          0,
          state
            ? Math.floor(
                lifeline.reduce(
                  (total, interval) =>
                    total +
                    Math.max(0, Date.parse(interval.to ?? asOf) - Date.parse(interval.from)),
                  0,
                ) / 86_400_000,
              )
            : Math.floor(
                (Date.parse(observedAt) - Date.parse(initial.listedAt.value)) / 86_400_000,
              ),
        ),
        firstCollectedAt,
        lastCollectedAt: observedAt,
        activeListingCount: status === 'active' ? 1 : 0,
        priceReduced: history.some(
          (entry) =>
            entry.type === 'price-changed' && entry.currentMinorUnits < entry.previousMinorUnits,
        ),
        returnedToMarket: history.some((entry) => entry.type === 'reappeared'),
        belowMedianPercent: null,
        neighborhoodComparison: null,
      },
      sale: { status: 'not-recorded' },
      listings: [listing],
      priceChanges: history
        .filter((entry) => entry.type === 'price-changed')
        .map((entry) => ({
          effectiveAt: entry.effectiveAt,
          previousMinorUnits: entry.previousMinorUnits,
          currentMinorUnits: entry.currentMinorUnits,
          provenance: entry.provenance,
          changePercent:
            ((entry.currentMinorUnits - entry.previousMinorUnits) / entry.previousMinorUnits) * 100,
        })),
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
