import { PROPERTY_SORTS, PROPERTY_TYPES, TIME_ON_MARKET_BANDS } from '@rei/contracts';
import type { SearchQuery } from '@rei/contracts';
import { isPlaceId } from '../places/place-client';
import type { Locale } from '../places/locale';

export const filterGroups = [
  { id: 'type', keys: ['propertyType'] },
  { id: 'asking', keys: ['minAskingPrice', 'maxAskingPrice'] },
  { id: 'perMeter', keys: ['minPricePerSquareMeter', 'maxPricePerSquareMeter'] },
  { id: 'area', keys: ['minArea', 'maxArea'] },
  { id: 'bedrooms', keys: ['minBedrooms'] },
  { id: 'bathrooms', keys: ['minBathrooms'] },
  { id: 'parking', keys: ['minParkingSpaces'] },
  { id: 'time', keys: ['timeOnMarket'] },
  { id: 'reduced', keys: ['priceReduced'] },
  { id: 'returned', keys: ['returnedToMarket'] },
  { id: 'multiple', keys: ['multipleListings'] },
] as const satisfies readonly {
  readonly id: string;
  readonly keys: readonly (keyof SearchQuery)[];
}[];
export type FilterGroupId = (typeof filterGroups)[number]['id'];
export const rangeKeys = [
  'minAskingPrice',
  'maxAskingPrice',
  'minPricePerSquareMeter',
  'maxPricePerSquareMeter',
  'minArea',
  'maxArea',
] as const;
export const booleanKeys = ['priceReduced', 'returnedToMarket', 'multipleListings'] as const;
const numericKeys = [...rangeKeys, 'minBedrooms', 'minBathrooms', 'minParkingSpaces', 'pageSize'];
const allowed = [...filterGroups.flatMap((group) => [...group.keys]), 'sort', 'pageSize'];
export type SearchState =
  | { readonly valid: true; readonly query: SearchQuery; readonly filters: boolean }
  | { readonly valid: false };

/** Validates public URL syntax and units; matching and calculations stay on the server. */
export function parseSearchState(placeId: string, search: string): SearchState {
  if (!isPlaceId(placeId)) return { valid: false };
  const parameters = new URLSearchParams(search);
  const values: Record<string, string | number | boolean> = { placeId };
  let filters = false;
  const seen = new Set<string>();
  for (const [key, raw] of parameters) {
    if (seen.has(key)) return { valid: false };
    seen.add(key);
    if (key === 'view') {
      if (raw !== 'filters') return { valid: false };
      filters = true;
      continue;
    }
    if (!allowed.includes(key)) return { valid: false };
    if (booleanKeys.some((item) => item === key)) {
      if (raw !== 'true' && raw !== 'false') return { valid: false };
      values[key] = raw === 'true';
    } else if (numericKeys.includes(key)) {
      if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) return { valid: false };
      const area = key === 'minArea' || key === 'maxArea';
      const [whole = '0', fraction = ''] = raw.split('.');
      const number = Number(raw);
      const max =
        key === 'pageSize'
          ? 20
          : area
            ? 1000000
            : key.startsWith('minB') || key === 'minParkingSpaces'
              ? 100
              : Number.MAX_SAFE_INTEGER;
      if (
        !Number.isFinite(number) ||
        number < (key === 'pageSize' ? 1 : area ? 0.01 : 0) ||
        number > max ||
        (!area && (!Number.isSafeInteger(number) || /[1-9]/.test(fraction))) ||
        (!area && BigInt(whole) > BigInt(max)) ||
        (area && whole === '1000000' && /[1-9]/.test(fraction))
      )
        return { valid: false };
      values[key] = number;
    } else {
      const choices =
        key === 'sort'
          ? PROPERTY_SORTS
          : key === 'propertyType'
            ? PROPERTY_TYPES
            : TIME_ON_MARKET_BANDS;
      if (!choices.some((choice) => choice === raw)) return { valid: false };
      values[key] = raw;
    }
  }
  const query = values as SearchQuery;
  for (const [min, max] of [
    [query.minAskingPrice, query.maxAskingPrice],
    [query.minPricePerSquareMeter, query.maxPricePerSquareMeter],
    [query.minArea, query.maxArea],
  ])
    if (min !== undefined && max !== undefined && min > max) return { valid: false };
  return { valid: true, query, filters };
}

export function queryParameters(query: SearchQuery): URLSearchParams {
  return new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, String(value)]),
  );
}
export function searchHref(query: SearchQuery, filters = false): string {
  const { placeId, ...inputs } = query;
  delete inputs.cursor;
  const parameters = queryParameters(inputs);
  if (filters) parameters.set('view', 'filters');
  return `/search/${placeId}${parameters.size ? `?${parameters}` : ''}`;
}
export function activeGroups(query: SearchQuery) {
  return filterGroups.filter((group) => group.keys.some((key) => query[key] !== undefined));
}
export function removeGroup(query: SearchQuery, id: FilterGroupId): SearchQuery {
  const result = { ...query };
  delete result.cursor;
  for (const key of filterGroups.find((group) => group.id === id)!.keys) delete result[key];
  return result;
}
export interface SearchDraft {
  readonly base: SearchQuery;
  readonly placeId: string;
  readonly propertyType: string;
  readonly minAskingPrice: string;
  readonly maxAskingPrice: string;
  readonly minPricePerSquareMeter: string;
  readonly maxPricePerSquareMeter: string;
  readonly minArea: string;
  readonly maxArea: string;
  readonly minBedrooms: string;
  readonly minBathrooms: string;
  readonly minParkingSpaces: string;
  readonly timeOnMarket: string;
  readonly priceReduced: string;
  readonly returnedToMarket: string;
  readonly multipleListings: string;
}
export function toDraft(query: SearchQuery, locale: Locale): SearchDraft {
  const numberLocale = locale === 'en' ? 'en-US' : locale;
  const numbers = Object.fromEntries(
    rangeKeys.map((key) => {
      const value = query[key];
      const cents = value === undefined ? 0n : BigInt(Math.trunc(value)) % 100n;
      return [
        key,
        value === undefined
          ? ''
          : key.includes('Area')
            ? new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 20 }).format(value)
            : `${new Intl.NumberFormat(numberLocale).format(BigInt(value) / 100n)}${cents === 0n ? '' : `${locale === 'en' ? '.' : ','}${String(cents).padStart(2, '0')}`}`,
      ];
    }),
  ) as Pick<SearchDraft, (typeof rangeKeys)[number]>;
  return {
    base: query,
    placeId: query.placeId!,
    propertyType: query.propertyType ?? '',
    ...numbers,
    minBedrooms: String(query.minBedrooms ?? ''),
    minBathrooms: String(query.minBathrooms ?? ''),
    minParkingSpaces: String(query.minParkingSpaces ?? ''),
    timeOnMarket: query.timeOnMarket ?? '',
    priceReduced: query.priceReduced === undefined ? '' : String(query.priceReduced),
    returnedToMarket: query.returnedToMarket === undefined ? '' : String(query.returnedToMarket),
    multipleListings: query.multipleListings === undefined ? '' : String(query.multipleListings),
  };
}
function localizedNumber(raw: string, locale: Locale, money: boolean): string | null {
  const text = raw.trim();
  const decimal = locale === 'en' ? '.' : ',';
  const grouping = locale === 'en' ? ',' : '.';
  const escapedGrouping = grouping === '.' ? '\\.' : ',';
  const escapedDecimal = decimal === '.' ? '\\.' : ',';
  if (
    !new RegExp(
      `^(?:0|[1-9]\\d*|[1-9]\\d{0,2}(?:${escapedGrouping}\\d{3})+)(?:${escapedDecimal}\\d${money ? '{1,2}' : '+'})?$`,
    ).test(text)
  )
    return null;
  const normalized = text.split(grouping).join('').replace(decimal, '.');
  if (!money) return normalized;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? String(minor) : null;
}
export function draftQuery(
  draft: SearchDraft,
  locale: Locale,
): { readonly valid: true; readonly query: SearchQuery } | { readonly valid: false } {
  const parameters = new URLSearchParams();
  for (const group of filterGroups) {
    for (const key of group.keys) {
      const raw = draft[key];
      if (raw === '') continue;
      const value = rangeKeys.some((range) => range === key)
        ? localizedNumber(raw, locale, !key.includes('Area'))
        : raw;
      if (value === null) return { valid: false };
      parameters.set(key, value);
    }
  }
  if (draft.base.sort !== undefined) parameters.set('sort', draft.base.sort);
  if (draft.base.pageSize !== undefined) parameters.set('pageSize', String(draft.base.pageSize));
  const parsed = parseSearchState(draft.placeId, parameters.toString());
  return parsed.valid ? { valid: true, query: parsed.query } : parsed;
}
