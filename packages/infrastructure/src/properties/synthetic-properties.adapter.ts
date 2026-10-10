import { createHash } from 'node:crypto';
import type { PropertiesFacade } from '@rei/application';
import {
  DomainValidationError,
  PROPERTY_SORTS,
  PROPERTY_TYPES,
  TIME_ON_MARKET_BANDS,
  type ListingResponse,
  type PageQuery,
  type PropertyResponse,
  type PropertySummary,
  type ReductionsResponse,
  type SearchQuery,
  type SearchResponse,
} from '@rei/domain';
import {
  placeContains,
  registeredSyntheticPlace,
  syntheticPlaces,
  SYNTHETIC_READ_METADATA,
} from '../locations/index.js';
import {
  buildSupplementaryProperties,
  buildSyntheticProperties,
} from './synthetic-properties.projection.js';

function fail(): never {
  throw new DomainValidationError('Invalid read query.', 'query');
}
export function validateReadQuery(query: SearchQuery, search = true): void {
  const allowed = search
    ? [
        'placeId',
        'propertyType',
        'minAskingPrice',
        'maxAskingPrice',
        'minPricePerSquareMeter',
        'maxPricePerSquareMeter',
        'minArea',
        'maxArea',
        'minBedrooms',
        'minBathrooms',
        'minParkingSpaces',
        'timeOnMarket',
        'priceReduced',
        'returnedToMarket',
        'multipleListings',
        'sort',
        'pageSize',
        'cursor',
      ]
    : ['pageSize', 'cursor'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) fail();
  for (const [key, value] of Object.entries(query)) {
    if (['priceReduced', 'returnedToMarket', 'multipleListings'].includes(key)) {
      if (typeof value !== 'boolean') fail();
    } else if (['placeId', 'cursor', 'propertyType', 'sort', 'timeOnMarket'].includes(key)) {
      if (typeof value !== 'string' || value.length === 0 || value.length > 2048) fail();
    } else {
      const area = key === 'minArea' || key === 'maxArea';
      const max =
        key === 'pageSize'
          ? 20
          : area
            ? 1000000
            : key.startsWith('minB') || key === 'minParkingSpaces'
              ? 100
              : Number.MAX_SAFE_INTEGER;
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < (key === 'pageSize' ? 1 : area ? 0.01 : 0) ||
        value > max ||
        (!area && !Number.isSafeInteger(value))
      )
        fail();
    }
  }
  if (
    (query.propertyType && !PROPERTY_TYPES.includes(query.propertyType)) ||
    (query.sort && !PROPERTY_SORTS.includes(query.sort)) ||
    (query.timeOnMarket && !TIME_ON_MARKET_BANDS.includes(query.timeOnMarket)) ||
    (query.placeId && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(query.placeId))
  )
    fail();
  for (const [min, max] of [
    [query.minAskingPrice, query.maxAskingPrice],
    [query.minPricePerSquareMeter, query.maxPricePerSquareMeter],
    [query.minArea, query.maxArea],
  ])
    if (min !== undefined && max !== undefined && min > max) fail();
}
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}
function inRange(value: number | null, min: number | undefined, max: number | undefined): boolean {
  return (
    (min === undefined && max === undefined) ||
    (value !== null && (min === undefined || value >= min) && (max === undefined || value <= max))
  );
}
function matches(property: PropertySummary, query: SearchQuery): boolean {
  const days = property.timeOnMarketDays;
  const time = query.timeOnMarket;
  return (
    placeContains(query.placeId ?? 'sao-paulo', property.place.id) &&
    (!query.propertyType || property.propertyType === query.propertyType) &&
    inRange(property.askingPrice?.minorUnits ?? null, query.minAskingPrice, query.maxAskingPrice) &&
    inRange(
      property.pricePerSquareMeter,
      query.minPricePerSquareMeter,
      query.maxPricePerSquareMeter,
    ) &&
    inRange(property.areaSquareMeters, query.minArea, query.maxArea) &&
    inRange(property.bedrooms, query.minBedrooms, undefined) &&
    inRange(property.bathrooms, query.minBathrooms, undefined) &&
    inRange(property.parkingSpaces, query.minParkingSpaces, undefined) &&
    (!time ||
      (time === 'up-to-30'
        ? days <= 30
        : time === '31-to-90'
          ? days >= 31 && days <= 90
          : time === 'over-90'
            ? days > 90
            : days > 180)) &&
    (query.priceReduced === undefined || property.priceReduced === query.priceReduced) &&
    (query.returnedToMarket === undefined ||
      property.returnedToMarket === query.returnedToMarket) &&
    (query.multipleListings === undefined ||
      property.activeListingCount > 1 === query.multipleListings)
  );
}
function scopeHash(scope: object): string {
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex');
}
function page<T>(
  items: readonly T[],
  query: PageQuery,
  scope: object,
): { items: readonly T[]; nextCursor: string | null; totalItems: number } {
  const size = query.pageSize ?? 20;
  const hash = scopeHash(scope);
  let offset = 0;
  if (query.cursor !== undefined) {
    if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) fail();
    try {
      const bytes = Buffer.from(query.cursor, 'base64url');
      if (bytes.toString('base64url') !== query.cursor) fail();
      const cursor = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
      if (
        typeof cursor !== 'object' ||
        cursor === null ||
        Object.keys(cursor).sort().join(',') !== 'offset,scope' ||
        cursor.scope !== hash ||
        typeof cursor.offset !== 'number' ||
        !Number.isSafeInteger(cursor.offset) ||
        cursor.offset < 1 ||
        cursor.offset >= items.length ||
        cursor.offset % size !== 0
      )
        fail();
      offset = cursor.offset;
    } catch {
      fail();
    }
  }
  const end = offset + size;
  return {
    items: items.slice(offset, end),
    nextCursor:
      end < items.length
        ? Buffer.from(JSON.stringify({ scope: hash, offset: end })).toString('base64url')
        : null,
    totalItems: items.length,
  };
}
export class SyntheticPropertiesAdapter implements PropertiesFacade {
  private readonly properties = buildSyntheticProperties();
  private readonly supplementary = buildSupplementaryProperties();
  public async search(query: SearchQuery): Promise<SearchResponse> {
    validateReadQuery(query);
    const normalized = Object.fromEntries(
      Object.entries({
        ...query,
        placeId: query.placeId ?? 'sao-paulo',
        sort: query.sort ?? 'furthest-below-median',
        pageSize: query.pageSize ?? 20,
      })
        .filter(([key]) => key !== 'cursor')
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    const matching = this.properties
      .map((property) => property.summary)
      .filter((property) => matches(property, query));
    const ownMedian = median(
      matching.flatMap((property) =>
        property.pricePerSquareMeter === null ? [] : [property.pricePerSquareMeter],
      ),
    );
    const items = matching.map((property) => ({
      ...property,
      belowMedianPercent:
        ownMedian === null || property.pricePerSquareMeter === null
          ? null
          : ((ownMedian - property.pricePerSquareMeter) / ownMedian) * 100,
    }));
    const sort = query.sort ?? 'furthest-below-median';
    items.sort(
      (a, b) =>
        (sort === 'furthest-below-median'
          ? (b.belowMedianPercent ?? -Infinity) - (a.belowMedianPercent ?? -Infinity)
          : sort === 'lowest-price-per-square-meter'
            ? (a.pricePerSquareMeter ?? Infinity) - (b.pricePerSquareMeter ?? Infinity)
            : sort === 'longest-on-market'
              ? b.timeOnMarketDays - a.timeOnMarketDays
              : b.firstCollectedAt.localeCompare(a.firstCollectedAt)) || a.id.localeCompare(b.id),
    );
    return structuredClone({
      metadata: SYNTHETIC_READ_METADATA,
      ...page(items, query, { endpoint: 'properties', query: normalized }),
      medianPricePerSquareMeter: ownMedian,
      placeCounts: syntheticPlaces().map((place) => ({
        placeId: place.id,
        totalItems: matching.filter((property) => placeContains(place.id, property.place.id))
          .length,
      })),
    });
  }
  public async getProperty(id: string): Promise<PropertyResponse | null> {
    const property = [...this.properties, ...this.supplementary].find(
      (property) => property.summary.id === id,
    );
    return property ? structuredClone({ metadata: SYNTHETIC_READ_METADATA, property }) : null;
  }
  public async getListing(id: string): Promise<ListingResponse | null> {
    const listing = [...this.properties, ...this.supplementary]
      .flatMap((property) => property.listings)
      .find((listing) => listing.id === id);
    return listing ? structuredClone({ metadata: SYNTHETIC_READ_METADATA, listing }) : null;
  }
  public async largestReductions(
    placeId: string,
    query: PageQuery,
  ): Promise<ReductionsResponse | null> {
    validateReadQuery(query, false);
    if (!registeredSyntheticPlace(placeId)) return null;
    const items = this.properties
      .filter((property) => placeContains(placeId, property.summary.place.id))
      .flatMap((property) => {
        const change = property.priceChanges
          .filter(
            (entry) =>
              entry.effectiveAt <= SYNTHETIC_READ_METADATA.asOf &&
              entry.currentMinorUnits < entry.previousMinorUnits,
          )
          .at(-1);
        const listing =
          change &&
          property.listings.find(
            (entry) =>
              entry.source.sourceId === change.provenance.sourceId &&
              entry.source.sourceListingId === change.provenance.sourceListingId,
          );
        return change && listing
          ? [
              {
                propertyId: property.summary.id,
                listingId: listing.id,
                place: property.summary.place,
                effectiveAt: change.effectiveAt,
                previousMinorUnits: change.previousMinorUnits,
                currentMinorUnits: change.currentMinorUnits,
                reductionPercent: -change.changePercent,
                provenance: change.provenance,
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          b.reductionPercent - a.reductionPercent || a.propertyId.localeCompare(b.propertyId),
      );
    return structuredClone({
      metadata: SYNTHETIC_READ_METADATA,
      ...page(items, query, { endpoint: 'reductions', placeId, pageSize: query.pageSize ?? 20 }),
    });
  }
}
