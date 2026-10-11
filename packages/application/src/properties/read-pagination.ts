import { createHash } from 'node:crypto';
import {
  DomainValidationError,
  PROPERTY_SORTS,
  PROPERTY_TYPES,
  TIME_ON_MARKET_BANDS,
  type PageQuery,
  type SearchQuery,
} from '@rei/domain';

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
function scopeHash(scope: object): string {
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex');
}
export function pageReadItems<T>(
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
