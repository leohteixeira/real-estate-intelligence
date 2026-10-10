import { createHash } from 'node:crypto';
import {
  pricePerSquareMeter,
  type CollectionSnapshotParsed,
  type ListingDetail,
  type ListingHistory,
  type ListingProvenance,
  type PriceChange,
  type PreparedGroupingReason,
  type PropertyDetail,
  type PropertySummary,
} from '@rei/domain';
import { buildSyntheticSaoPauloReplay, SYNTHETIC_SAO_PAULO_DATASET } from '../collection/index.js';
import { syntheticBlockId, syntheticPlace, SYNTHETIC_READ_METADATA } from '../locations/index.js';

export function syntheticReadId(number: number): string {
  return `0199a3e0-0000-7000-8000-${number.toString().padStart(12, '0')}`;
}
export const SUPPLEMENTARY_PROPERTY_IDS = Object.freeze({
  deniedText: syntheticReadId(901),
  expiredSnapshot: syntheticReadId(902),
  noActiveListings: syntheticReadId(903),
});
export const SUPPLEMENTARY_LISTING_IDS = Object.freeze({
  deniedText: syntheticReadId(991),
  expiredSnapshot: syntheticReadId(992),
  noActiveListings: syntheticReadId(993),
});
function hash(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}
function provenance(event: CollectionSnapshotParsed): ListingProvenance {
  const { source, run, snapshot } = event.payload;
  return { ...source, ...run, ...snapshot };
}
function placeRef(id: string) {
  const { kind, name } = syntheticPlace(id)!;
  return { id, kind, name };
}
function projectListing(
  index: number,
  propertyId: string,
  position: number,
  canonicalPlaceId: string,
  events: readonly CollectionSnapshotParsed[],
): ListingDetail {
  const base = SYNTHETIC_SAO_PAULO_DATASET.listings[index]!;
  const observations = events.filter(
    (event) =>
      event.payload.source.sourceId === base.reference.sourceId &&
      event.payload.source.sourceListingId === base.reference.sourceListingId,
  );
  const first = observations[0]!;
  const latest = observations.at(-1)!;
  const listing = latest.payload.listing;
  const history: ListingHistory[] = [
    { type: 'created', effectiveAt: first.occurredAt, provenance: provenance(first) },
  ];
  const versions = [
    {
      effectiveAt: first.occurredAt,
      text: first.payload.listing.maskedDescription,
      contentHash: hash(first.payload.listing.maskedDescription),
    },
  ];
  const lifeline: { from: string; to: string | null }[] = [{ from: first.occurredAt, to: null }];
  let prior: CollectionSnapshotParsed | undefined;
  let active = false;
  let askingEffectiveAt = first.occurredAt;
  for (const run of SYNTHETIC_SAO_PAULO_DATASET.runs) {
    const current = observations.find((event) => event.occurredAt === run.observedAt);
    if (!current) {
      if (active && prior) {
        history.push({
          type: 'removed',
          effectiveAt: run.observedAt,
          provenance: provenance(prior),
        });
        lifeline.at(-1)!.to = run.observedAt;
      }
      active = false;
      continue;
    }
    if (!active && prior) {
      history.push({
        type: 'reappeared',
        effectiveAt: current.occurredAt,
        provenance: provenance(current),
      });
      lifeline.push({ from: current.occurredAt, to: null });
    }
    if (
      prior &&
      current.payload.listing.askingPriceMinorUnits !== prior.payload.listing.askingPriceMinorUnits
    ) {
      history.push({
        type: 'price-changed',
        effectiveAt: current.occurredAt,
        previousMinorUnits: prior.payload.listing.askingPriceMinorUnits,
        currentMinorUnits: current.payload.listing.askingPriceMinorUnits,
        provenance: provenance(current),
      });
      askingEffectiveAt = current.occurredAt;
    }
    if (
      prior &&
      current.payload.listing.maskedDescription !== prior.payload.listing.maskedDescription
    ) {
      const beforeHash = hash(prior.payload.listing.maskedDescription);
      const afterHash = hash(current.payload.listing.maskedDescription);
      history.push({
        type: 'description-changed',
        effectiveAt: current.occurredAt,
        beforeHash,
        afterHash,
        provenance: provenance(current),
      });
      versions.push({
        effectiveAt: current.occurredAt,
        text: current.payload.listing.maskedDescription,
        contentHash: afterHash,
      });
    }
    active = true;
    prior = current;
  }
  return {
    id: syntheticReadId(101 + index),
    propertyId,
    fixtureLabel: 'Authoritative synthetic monthly replay',
    source: {
      sourceId: base.reference.sourceId,
      sourceListingId: base.reference.sourceListingId,
      label: SYNTHETIC_SAO_PAULO_DATASET.sources.find(
        (source) => source.sourceId === base.reference.sourceId,
      )!.displayLabel,
      url: base.sourceUrl,
    },
    position,
    status: active ? 'active' : 'removed',
    propertyType: listing.propertyType,
    place: placeRef(canonicalPlaceId),
    publishedNeighborhood: listing.location.neighborhood,
    street: listing.location.street,
    areaSquareMeters: listing.areaSquareMeters,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    parkingSpaces: listing.parkingSpaces,
    features: [...listing.features],
    askingPriceMinorUnits: listing.askingPriceMinorUnits,
    currency: 'BRL',
    pricePerSquareMeter: pricePerSquareMeter({
      priceInCents: listing.askingPriceMinorUnits,
      areaInSquareMeters: listing.areaSquareMeters,
    }),
    pricePerSquareMeterFormula: 'askingPriceMinorUnits / areaSquareMeters',
    provenance: provenance(latest),
    snapshot: { availability: 'available', collectedAt: latest.occurredAt, expiresAt: null },
    collectionCount: observations.length,
    firstCollectedAt: first.occurredAt,
    lastCollectedAt: latest.occurredAt,
    fieldEffectiveAt: {
      askingPrice: askingEffectiveAt,
      description: versions.at(-1)!.effectiveAt,
      attributes: first.occurredAt,
    },
    description: {
      permission: 'allowed',
      current: listing.maskedDescription,
      versions,
      sourceUrl: base.sourceUrl,
    },
    history,
    lifeline,
  };
}
function propertyPrices(
  listings: readonly ListingDetail[],
  events: readonly CollectionSnapshotParsed[],
): readonly PriceChange[] {
  const changes: PriceChange[] = [];
  let previous: number | undefined;
  for (const run of SYNTHETIC_SAO_PAULO_DATASET.runs) {
    const candidates = events.filter(
      (event) =>
        event.occurredAt === run.observedAt &&
        listings.some(
          (listing) =>
            listing.source.sourceId === event.payload.source.sourceId &&
            listing.source.sourceListingId === event.payload.source.sourceListingId,
        ),
    );
    candidates.sort(
      (a, b) =>
        a.payload.listing.askingPriceMinorUnits - b.payload.listing.askingPriceMinorUnits ||
        a.payload.source.sourceListingId.localeCompare(b.payload.source.sourceListingId),
    );
    const selected = candidates[0]!;
    const price = selected.payload.listing.askingPriceMinorUnits;
    if (previous !== undefined && previous !== price)
      changes.push({
        effectiveAt: run.observedAt,
        previousMinorUnits: previous,
        currentMinorUnits: price,
        changePercent: ((price - previous) / previous) * 100,
        provenance: provenance(selected),
      });
    previous = price;
  }
  return changes;
}
export function featureAgreement(
  listings: readonly ListingDetail[],
): PropertyDetail['featureAgreement'] {
  return [...new Set(listings.flatMap((listing) => listing.features))].sort().map((feature) => {
    const reporting = listings.filter((listing) => listing.features.includes(feature));
    return {
      feature,
      reportingCount: reporting.length,
      reportingPercent: (reporting.length / listings.length) * 100,
      listingIds: reporting.map((listing) => listing.id),
      sourceIds: [...new Set(reporting.map((listing) => listing.source.sourceId))],
    };
  });
}
function preparedEvidence(
  listings: readonly ListingDetail[],
  label: string,
): PropertyDetail['preparedEvidence'] {
  const reasons: PreparedGroupingReason[] = [];
  if (listings.length > 1) {
    for (const field of [
      'propertyType',
      'areaSquareMeters',
      'bedrooms',
      'bathrooms',
      'parkingSpaces',
      'street',
    ] as const) {
      const value = listings[0]![field];
      if (value !== null && listings.every((listing) => listing[field] === value)) {
        reasons.push({
          type: 'attribute-agreement',
          field,
          value,
          listingIds: listings.map((listing) => listing.id),
        });
      }
    }
    for (const feature of featureAgreement(listings)) {
      if (feature.reportingCount > 1)
        reasons.push({
          type: 'shared-structured-feature',
          feature: feature.feature,
          listingIds: feature.listingIds,
        });
    }
    if (new Set(listings.map((listing) => listing.publishedNeighborhood)).size > 1) {
      reasons.push({
        type: 'published-neighborhood-disagreement',
        values: listings.map((listing) => ({
          listingId: listing.id,
          neighborhood: listing.publishedNeighborhood,
        })),
      });
    }
  }
  return {
    kind: 'prepared-fixture',
    label,
    listingIds: listings.map((listing) => listing.id),
    productionMatchScore: null,
    illustrativeProbability: listings.length > 1 ? 0.95 : 1,
    probabilityBasis: 'prepared-not-calibrated',
    reasons,
  };
}
export function buildSyntheticProperties(): readonly PropertyDetail[] {
  const events = buildSyntheticSaoPauloReplay().filter(
    (event): event is CollectionSnapshotParsed => event.type === 'collection.snapshot.parsed',
  );
  return SYNTHETIC_SAO_PAULO_DATASET.properties.map((property, index) => {
    const id = syntheticReadId(index + 1);
    const placeId = syntheticBlockId(property.neighborhood);
    const listings = property.listingReferences.map((reference, position) =>
      projectListing(
        SYNTHETIC_SAO_PAULO_DATASET.listings.findIndex(
          (listing) =>
            listing.reference.sourceId === reference.sourceId &&
            listing.reference.sourceListingId === reference.sourceListingId,
        ),
        id,
        position + 1,
        placeId,
        events,
      ),
    );
    const active = listings
      .filter((listing) => listing.status === 'active')
      .sort(
        (a, b) => a.askingPriceMinorUnits - b.askingPriceMinorUnits || a.id.localeCompare(b.id),
      );
    const selected = active[0]!;
    const first = listings[0]!;
    const place = syntheticPlace(placeId)!;
    const firstListedAt = Math.min(
      ...SYNTHETIC_SAO_PAULO_DATASET.listings
        .filter((base) => property.listingReferences.includes(base.reference))
        .map((base) => Date.parse(base.listing.listedAt)),
    );
    const summary: PropertySummary = {
      id,
      fixtureLabel: property.propertyLabel,
      propertyType: first.propertyType,
      place: placeRef(placeId),
      breadcrumbs: place.breadcrumbs,
      areaSquareMeters: first.areaSquareMeters,
      bedrooms: first.bedrooms,
      bathrooms: first.bathrooms,
      parkingSpaces: first.parkingSpaces,
      askingPrice: {
        minorUnits: selected.askingPriceMinorUnits,
        currency: 'BRL',
        listingId: selected.id,
        provenance: selected.provenance,
      },
      pricePerSquareMeter: selected.pricePerSquareMeter,
      timeOnMarketDays: Math.floor(
        (Date.parse(SYNTHETIC_READ_METADATA.asOf) - firstListedAt) / 86400000,
      ),
      firstCollectedAt: first.firstCollectedAt,
      lastCollectedAt: selected.lastCollectedAt,
      activeListingCount: active.length,
      priceReduced: listings.some((listing) =>
        listing.history.some(
          (entry) =>
            entry.type === 'price-changed' && entry.currentMinorUnits < entry.previousMinorUnits,
        ),
      ),
      returnedToMarket: listings.some((listing) =>
        listing.history.some((entry) => entry.type === 'reappeared'),
      ),
      belowMedianPercent: null,
      neighborhoodComparison: null,
    };
    return {
      summary,
      sale: { status: 'not-recorded' },
      listings,
      priceChanges: propertyPrices(listings, events),
      sourceAgreement: (
        [
          'propertyType',
          'areaSquareMeters',
          'bedrooms',
          'bathrooms',
          'parkingSpaces',
          'neighborhood',
        ] as const
      ).map((field) => {
        const values = listings.map((listing) => ({
          listingId: listing.id,
          sourceId: listing.source.sourceId,
          value: field === 'neighborhood' ? listing.publishedNeighborhood : listing[field],
        }));
        return { field, values, agrees: new Set(values.map((value) => value.value)).size === 1 };
      }),
      featureAgreement: featureAgreement(listings),
      preparedEvidence: preparedEvidence(
        listings,
        'Prepared grouping from fixture ground truth; probability is illustrative, unmeasured and uncalibrated',
      ),
    };
  });
}
/** Separate prepared branches never participate in authoritative search or place counts. */
export function buildSupplementaryProperties(): readonly PropertyDetail[] {
  const original = buildSyntheticProperties()[0]!;
  return (['deniedText', 'expiredSnapshot', 'noActiveListings'] as const).map((branch) => {
    const property = structuredClone(original);
    const source = property.listings.find(
      (listing) => listing.source.sourceListingId === 'BRI-BV-001',
    )!;
    const listing: ListingDetail = {
      ...source,
      id: SUPPLEMENTARY_LISTING_IDS[branch],
      propertyId: SUPPLEMENTARY_PROPERTY_IDS[branch],
      fixtureLabel: `Supplementary prepared ${branch} example`,
      ...(branch === 'deniedText'
        ? {
            description: {
              permission: 'denied' as const,
              changedAt: source.history
                .filter((entry) => entry.type === 'description-changed')
                .map((entry) => entry.effectiveAt),
              sourceUrl: source.source.url,
            },
          }
        : {}),
      ...(branch === 'expiredSnapshot'
        ? {
            snapshot: {
              availability: 'expired' as const,
              collectedAt: source.firstCollectedAt,
              expiresAt: '2025-10-31T12:00:00.000Z',
            },
            provenance: source.history[0]!.provenance,
            collectionCount: 1,
            lastCollectedAt: source.firstCollectedAt,
            fieldEffectiveAt: {
              askingPrice: source.firstCollectedAt,
              description: source.firstCollectedAt,
              attributes: source.firstCollectedAt,
            },
            description:
              source.description.permission === 'allowed'
                ? {
                    permission: 'allowed' as const,
                    current: source.description.versions[0]!.text,
                    versions: [source.description.versions[0]!],
                    sourceUrl: source.source.url,
                  }
                : source.description,
            history: [source.history[0]!],
            lifeline: [{ from: source.firstCollectedAt, to: null }],
          }
        : {}),
      ...(branch === 'noActiveListings'
        ? {
            status: 'removed' as const,
            bedrooms: null,
            lifeline: [{ from: source.firstCollectedAt, to: SYNTHETIC_READ_METADATA.asOf }],
            history: [
              ...source.history,
              {
                type: 'removed' as const,
                effectiveAt: SYNTHETIC_READ_METADATA.asOf,
                provenance: source.provenance,
              },
            ],
          }
        : {}),
    };
    const summary: PropertySummary = {
      ...property.summary,
      id: listing.propertyId,
      fixtureLabel: listing.fixtureLabel,
      bedrooms: branch === 'noActiveListings' ? null : property.summary.bedrooms,
      activeListingCount: branch === 'noActiveListings' ? 0 : 1,
      priceReduced: listing.history.some(
        (entry) =>
          entry.type === 'price-changed' && entry.currentMinorUnits < entry.previousMinorUnits,
      ),
      returnedToMarket: listing.history.some((entry) => entry.type === 'reappeared'),
      lastCollectedAt: listing.lastCollectedAt,
      askingPrice:
        branch === 'noActiveListings'
          ? null
          : {
              minorUnits: listing.askingPriceMinorUnits,
              currency: 'BRL',
              listingId: listing.id,
              provenance: listing.provenance,
            },
      pricePerSquareMeter: branch === 'noActiveListings' ? null : listing.pricePerSquareMeter,
    };
    return {
      ...property,
      summary,
      listings: [listing],
      priceChanges: listing.history
        .filter(
          (entry): entry is Extract<ListingHistory, { type: 'price-changed' }> =>
            entry.type === 'price-changed',
        )
        .map(({ effectiveAt, previousMinorUnits, currentMinorUnits, provenance }) => ({
          effectiveAt,
          previousMinorUnits,
          currentMinorUnits,
          changePercent: ((currentMinorUnits - previousMinorUnits) / previousMinorUnits) * 100,
          provenance,
        })),
      sourceAgreement: [],
      featureAgreement: featureAgreement([listing]),
      preparedEvidence: preparedEvidence([listing], listing.fixtureLabel),
    };
  });
}
