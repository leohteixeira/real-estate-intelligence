import type { PropertySummary, SearchQuery } from '@rei/domain';

export function median(values: readonly number[]): number | null {
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
export function matchesPropertySearch(
  property: PropertySummary,
  query: SearchQuery,
  contains: (placeId: string) => boolean,
): boolean {
  const days = property.timeOnMarketDays;
  const time = query.timeOnMarket;
  return (
    contains(property.place.id) &&
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

export function normalizePropertySearchQuery(query: SearchQuery): object {
  return Object.fromEntries(
    Object.entries({
      ...query,
      placeId: query.placeId ?? 'sao-paulo',
      sort: query.sort ?? 'furthest-below-median',
      pageSize: query.pageSize ?? 20,
    })
      .filter(([key]) => key !== 'cursor')
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function searchProperties(
  summaries: readonly PropertySummary[],
  query: SearchQuery,
  contains: (placeId: string) => boolean,
): {
  matching: readonly PropertySummary[];
  items: readonly PropertySummary[];
  ownMedian: number | null;
} {
  const matching = summaries.filter((property) => matchesPropertySearch(property, query, contains));
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
  return { matching, items, ownMedian };
}
