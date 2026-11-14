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
  /** `parameters` names the URL parameters that were refused; an invalid place names none. */
  | { readonly valid: false; readonly parameters: readonly string[] };

function validNumber(key: string, raw: string): boolean {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) return false;
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
  return !(
    !Number.isFinite(number) ||
    number < (key === 'pageSize' ? 1 : area ? 0.01 : 0) ||
    number > max ||
    (!area && (!Number.isSafeInteger(number) || /[1-9]/.test(fraction))) ||
    (!area && BigInt(whole) > BigInt(max)) ||
    (area && whole === '1000000' && /[1-9]/.test(fraction))
  );
}

/** Validates public URL syntax and units; matching and calculations stay on the server. */
export function parseSearchState(placeId: string, search: string): SearchState {
  if (!isPlaceId(placeId)) return { valid: false, parameters: [] };
  const parameters = new URLSearchParams(search);
  const values: Record<string, string | number | boolean> = { placeId };
  let filters = false;
  const seen = new Set<string>();
  const refused = new Set<string>();
  for (const [key, raw] of parameters) {
    if (seen.has(key)) {
      refused.add(key);
      continue;
    }
    seen.add(key);
    if (key === 'view') {
      if (raw === 'filters') filters = true;
      else refused.add(key);
    } else if (!allowed.includes(key)) refused.add(key);
    else if (booleanKeys.some((item) => item === key)) {
      if (raw === 'true' || raw === 'false') values[key] = raw === 'true';
      else refused.add(key);
    } else if (numericKeys.includes(key)) {
      if (validNumber(key, raw)) values[key] = Number(raw);
      else refused.add(key);
    } else {
      const choices =
        key === 'sort'
          ? PROPERTY_SORTS
          : key === 'propertyType'
            ? PROPERTY_TYPES
            : TIME_ON_MARKET_BANDS;
      if (choices.some((choice) => choice === raw)) values[key] = raw;
      else refused.add(key);
    }
  }
  const query = values as SearchQuery;
  for (const [min, max] of [
    ['minAskingPrice', 'maxAskingPrice'],
    ['minPricePerSquareMeter', 'maxPricePerSquareMeter'],
    ['minArea', 'maxArea'],
  ] as const) {
    const [low, high] = [query[min], query[max]];
    if (low !== undefined && high !== undefined && low > high) refused.add(min).add(max);
  }
  return refused.size
    ? { valid: false, parameters: [...refused] }
    : { valid: true, query, filters };
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
export type DraftState =
  | { readonly valid: true; readonly query: SearchQuery }
  /** `fields` are the range inputs that are not acceptable numbers on their own. */
  | { readonly valid: false; readonly fields: readonly (typeof rangeKeys)[number][] };
export function draftQuery(draft: SearchDraft, locale: Locale): DraftState {
  const parameters = new URLSearchParams();
  const fields: (typeof rangeKeys)[number][] = [];
  for (const group of filterGroups) {
    for (const key of group.keys) {
      const raw = draft[key];
      if (raw === '') continue;
      const range = rangeKeys.find((item) => item === key);
      const value = range ? localizedNumber(raw, locale, !key.includes('Area')) : raw;
      if (range && (value === null || !validNumber(key, value))) fields.push(range);
      else parameters.set(key, value!);
    }
  }
  if (fields.length) return { valid: false, fields };
  if (draft.base.sort !== undefined) parameters.set('sort', draft.base.sort);
  if (draft.base.pageSize !== undefined) parameters.set('pageSize', String(draft.base.pageSize));
  const parsed = parseSearchState(draft.placeId, parameters.toString());
  return parsed.valid ? { valid: true, query: parsed.query } : { valid: false, fields: [] };
}
