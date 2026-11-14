import { createHash } from 'node:crypto';
import {
  pricePerSquareMeter,
  NormalizedListing,
  unionListingLifelines,
  type ListingChronologyState,
  type ListingDetail,
  type Property,
  type PropertyResponse,
  type PropertySummary,
  type PriceChange,
} from '@rei/domain';

/** The metadata clock and all effective dates refer to the original observation. */
export function projectInitialProperty(
  property: Property,
  textAllowed: boolean,
  state: ListingChronologyState | null = null,
  snapshot?: ListingDetail['snapshot'],
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
      // The facade replaces this with the registered attribution of the source.
      label: provenance.sourceId,
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
    snapshot: snapshot ?? { availability: 'unavailable', collectedAt: observedAt, expiresAt: null },
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
          changedAt: [
            ...new Set([
              ...versions.slice(1).map((version) => version.effectiveAt),
              ...history
                .filter((entry) => entry.type === 'description-changed')
                .map((entry) => entry.effectiveAt),
            ]),
          ].sort((a, b) => Date.parse(a) - Date.parse(b)),
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

/** Shared current grouped summary for detail and snapshot search. Members retain stable source order. */
export function projectCurrentPropertySummary(
  propertyId: string,
  members: readonly PropertyResponse[],
  priceChanges: readonly PriceChange[],
): { summary: PropertySummary; asOf: string } {
  const first = members[0]!;
  const listings = members.flatMap((member) => member.property.listings);
  const active = listings
    .filter((listing) => listing.status === 'active')
    .sort((a, b) => a.askingPriceMinorUnits - b.askingPriceMinorUnits || (a.id < b.id ? -1 : 1));
  const selected = active[0];
  const firstCollectedAt = listings.map((listing) => listing.firstCollectedAt).sort()[0]!;
  const lastCollectedAt = listings
    .map((listing) => listing.lastCollectedAt)
    .sort()
    .at(-1)!;
  const asOf = members
    .map((member) => member.metadata.asOf)
    .sort()
    .at(-1)!;
  const lifeline = unionListingLifelines(listings.flatMap((listing) => listing.lifeline));
  const sharedValue = (
    field: 'propertyType' | 'areaSquareMeters' | 'bedrooms' | 'bathrooms' | 'parkingSpaces',
  ) =>
    listings.every((listing) => listing[field] === listings[0]![field])
      ? listings[0]![field]
      : null;
  return {
    summary: {
      ...first.property.summary,
      id: propertyId,
      fixtureLabel: 'Persisted synthetic property; deterministic identity rules',
      areaSquareMeters: sharedValue('areaSquareMeters') as number | null,
      bedrooms: sharedValue('bedrooms') as number | null,
      bathrooms: sharedValue('bathrooms') as number | null,
      parkingSpaces: sharedValue('parkingSpaces') as number | null,
      askingPrice: selected
        ? {
            minorUnits: selected.askingPriceMinorUnits,
            currency: 'BRL',
            listingId: selected.id,
            provenance: selected.provenance,
          }
        : null,
      pricePerSquareMeter: selected?.pricePerSquareMeter ?? null,
      firstCollectedAt,
      lastCollectedAt,
      activeListingCount: active.length,
      timeOnMarketDays: Math.floor(
        lifeline.reduce(
          (total, interval) =>
            total + Math.max(0, Date.parse(interval.to ?? asOf) - Date.parse(interval.from)),
          0,
        ) / 86400000,
      ),
      priceReduced: priceChanges.some(
        (change) => change.currentMinorUnits < change.previousMinorUnits,
      ),
      returnedToMarket: listings.some((listing) =>
        listing.history.some((entry) => entry.type === 'reappeared'),
      ),
    },
    asOf,
  };
}
