import { fixtureMetadataWire, placeRefWire } from '../locations/index.js';
import {
  invalidWire,
  parseWire,
  wireArray,
  wireCount,
  wireDate,
  wireDiscriminated,
  wireEnum,
  wireMoney,
  wireNull,
  wireNullable,
  wireNumber,
  wireObject,
  wirePattern,
  wireSlug,
  wireString,
  wireUrl,
  type WireValidator,
} from '../shared/wire.js';
import type {
  MarketEvidence,
  MarketFigure,
  PlaceMarketNeighboursResponse,
  PlaceMarketResponse,
  PlaceMarketSeriesResponse,
} from './market.read.types.js';
import type { PlaceRef } from '../locations/index.js';

const sourceUrl: WireValidator = (value) => {
  wireUrl(value);
  const RuntimeUrl = Reflect.get(globalThis, 'URL') as new (input: string) => { hostname: string };
  if (!new RuntimeUrl(value as string).hostname.endsWith('.invalid')) invalidWire();
};
const evidence = {
  recordCount: wireCount,
  sources: wireArray(
    wireObject({ id: wireSlug, label: wireString, url: sourceUrl, collectedAt: wireDate }),
  ),
  computedAt: wireDate,
  freshness: wireObject({
    status: wireEnum(['fresh', 'stale']),
    latestCollectionCompletedAt: wireNullable(wireDate),
    ageSeconds: wireNumber(),
  }),
};
function figure(value: WireValidator, fields: Readonly<Record<string, WireValidator>> = {}) {
  return wireDiscriminated('state', {
    available: wireObject({ ...evidence, ...fields, state: wireEnum(['available']), value }),
    'insufficient-data': wireObject({
      ...evidence,
      ...fields,
      state: wireEnum(['insufficient-data']),
      value: wireNull,
    }),
  });
}
const median = figure(wireObject({ minorUnits: wireMoney, currency: wireEnum(['BRL']) }));
const movement = figure(wireNumber(-100, Number.MAX_SAFE_INTEGER), { windowMonths: wireEnum([6]) });
const reductions = figure(wireObject({ count: wireCount, percentage: wireNumber(0, 100) }), {
  windowDays: wireEnum([30]),
});
const sale = wireObject({ ...evidence, state: wireEnum(['not-recorded']), value: wireNull });
const base = {
  metadata: fixtureMetadataWire,
  basis: wireEnum(['prepared-market-example']),
  evaluatedAt: wireDate,
  place: placeRefWire,
};
function validateEvidence(item: MarketEvidence, evaluatedAt: string): void {
  const computed = Date.parse(item.computedAt);
  const evaluated = Date.parse(evaluatedAt);
  const latest = item.freshness.latestCollectionCompletedAt;
  if (
    computed > evaluated ||
    item.freshness.ageSeconds !== (evaluated - computed) / 1000 ||
    new Set(item.sources.map((source) => source.id)).size !== item.sources.length ||
    (item.recordCount === 0) !== (item.sources.length === 0)
  )
    invalidWire();
  if (latest === null) {
    if (item.sources.length !== 0 || item.freshness.status !== 'fresh') invalidWire();
  } else {
    const completed = Date.parse(latest);
    if (
      item.sources.length === 0 ||
      completed > evaluated ||
      Math.max(...item.sources.map((source) => Date.parse(source.collectedAt))) > completed ||
      item.freshness.status !== (computed < completed ? 'stale' : 'fresh')
    )
      invalidWire();
  }
}
function validateFigure(item: MarketFigure<unknown>, evaluatedAt: string): void {
  validateEvidence(item, evaluatedAt);
  if ((item.state === 'available') !== item.recordCount > 0) invalidWire();
}
const kinds = ['country', 'state', 'city', 'zone', 'neighborhood', 'street-block'];
function validateParent(place: PlaceRef, parent: PlaceRef | null): void {
  if (place.kind === 'country') {
    if (parent !== null) invalidWire();
  } else if (
    parent === null ||
    parent.id === place.id ||
    kinds.indexOf(parent.kind) !== kinds.indexOf(place.kind) - 1
  )
    invalidWire();
}
function validateBase(response: { metadata: { asOf: string }; evaluatedAt: string }): void {
  if (Date.parse(response.metadata.asOf) > Date.parse(response.evaluatedAt)) invalidWire();
}
export function parsePlaceMarketResponse(value: unknown): PlaceMarketResponse {
  const response = parseWire<PlaceMarketResponse>(
    value,
    wireObject({
      ...base,
      counts: wireObject({ properties: wireCount, activeListings: wireCount, sources: wireCount }),
      figures: wireObject({
        medianAskingPricePerSquareMeter: median,
        askingPriceMovement: movement,
        medianTimeOnMarketDays: figure(wireNumber()),
        priceReductions: reductions,
        listingsPerProperty: figure(wireNumber()),
        recordedSalePricePerSquareMeter: sale,
      }),
      parentMedian: wireNullable(wireObject({ place: placeRefWire, median })),
    }),
  );
  validateBase(response);
  for (const [key, item] of Object.entries(response.figures)) {
    if (key === 'recordedSalePricePerSquareMeter') {
      validateEvidence(item, response.evaluatedAt);
      if (item.recordCount !== 0) invalidWire();
    } else validateFigure(item as MarketFigure<unknown>, response.evaluatedAt);
  }
  validateParent(response.place, response.parentMedian?.place ?? null);
  if (response.parentMedian) validateFigure(response.parentMedian.median, response.evaluatedAt);
  const { properties, activeListings, sources } = response.counts;
  const figures = response.figures;
  if (
    activeListings < properties ||
    sources > activeListings ||
    (properties === 0 && (activeListings !== 0 || sources !== 0)) ||
    figures.medianAskingPricePerSquareMeter.recordCount !== properties ||
    figures.medianAskingPricePerSquareMeter.sources.length !== sources ||
    figures.medianTimeOnMarketDays.recordCount !== properties ||
    figures.listingsPerProperty.recordCount !== properties ||
    figures.priceReductions.recordCount !== activeListings ||
    (figures.listingsPerProperty.state === 'available' &&
      figures.listingsPerProperty.value !== activeListings / properties) ||
    (figures.priceReductions.state === 'available' &&
      (figures.priceReductions.value.count > activeListings ||
        figures.priceReductions.value.percentage !==
          (figures.priceReductions.value.count / activeListings) * 100))
  )
    invalidWire();
  return response;
}
export function parsePlaceMarketNeighboursResponse(value: unknown): PlaceMarketNeighboursResponse {
  const response = parseWire<PlaceMarketNeighboursResponse>(
    value,
    wireObject({
      ...base,
      items: wireArray(wireObject({ place: placeRefWire, median, movement })),
    }),
  );
  validateBase(response);
  if (new Set(response.items.map((item) => item.place.id)).size !== response.items.length)
    invalidWire();
  for (const item of response.items) {
    if (
      item.place.id === response.place.id ||
      item.place.kind !== 'neighborhood' ||
      response.place.kind !== 'neighborhood'
    )
      invalidWire();
    validateFigure(item.median, response.evaluatedAt);
    validateFigure(item.movement, response.evaluatedAt);
  }
  return response;
}
export function parsePlaceMarketSeriesResponse(value: unknown): PlaceMarketSeriesResponse {
  const response = parseWire<PlaceMarketSeriesResponse>(
    value,
    wireObject({
      ...base,
      comparisonPlace: wireNullable(placeRefWire),
      points: wireArray(
        wireObject({
          month: wirePattern(/^\d{4}-(?:0[1-9]|1[0-2])$/),
          median,
          parentMedian: wireNullable(median),
        }),
      ),
    }),
  );
  validateBase(response);
  validateParent(response.place, response.comparisonPlace);
  if (response.points.length !== 12) invalidWire();
  let previous: number | null = null;
  for (const point of response.points) {
    const ordinal = Number(point.month.slice(0, 4)) * 12 + Number(point.month.slice(5, 7));
    if (previous !== null && ordinal !== previous + 1) invalidWire();
    previous = ordinal;
    if ((point.parentMedian === null) !== (response.comparisonPlace === null)) invalidWire();
    validateFigure(point.median, response.evaluatedAt);
    if (point.parentMedian) validateFigure(point.parentMedian, response.evaluatedAt);
    if (point.median.computedAt.slice(0, 7) !== point.month) invalidWire();
    if (point.parentMedian && point.parentMedian.computedAt.slice(0, 7) !== point.month)
      invalidWire();
  }
  return response;
}
