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
import { MARKET_PREPARED_SECTIONS } from './market.read.types.js';

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
function figure(
  value: WireValidator,
  fields: Readonly<Record<string, WireValidator>> = {},
  proof = evidence,
) {
  return wireDiscriminated('state', {
    available: wireObject({ ...proof, ...fields, state: wireEnum(['available']), value }),
    'insufficient-data': wireObject({
      ...proof,
      ...fields,
      state: wireEnum(['insufficient-data']),
      value: wireNull,
    }),
  });
}
const median = figure(wireObject({ minorUnits: wireMoney, currency: wireEnum(['BRL']) }));
const liveEvidence = {
  ...evidence,
  freshness: wireObject({
    status: wireEnum(['untracked']),
    latestCollectionCompletedAt: wireNull,
    ageSeconds: wireEnum([0]),
  }),
};
const liveMedian = wireDiscriminated('state', {
  available: wireObject({
    ...liveEvidence,
    state: wireEnum(['available']),
    value: wireObject({ minorUnits: wireMoney, currency: wireEnum(['BRL']) }),
  }),
  'insufficient-data': wireObject({
    ...liveEvidence,
    state: wireEnum(['insufficient-data']),
    value: wireNull,
  }),
});
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
function validateLiveFigure(
  item: MarketEvidence & { readonly state: string },
  evaluatedAt: string,
): void {
  if (
    item.computedAt !== evaluatedAt ||
    (item.state === 'available') !== item.recordCount > 0 ||
    (item.recordCount === 0) !== (item.sources.length === 0)
  )
    invalidWire();
  let previous: string | null = null;
  for (const source of item.sources) {
    if (
      source.label !== source.id ||
      Date.parse(source.collectedAt) > Date.parse(evaluatedAt) ||
      (previous !== null && source.id <= previous)
    )
      invalidWire();
    previous = source.id;
  }
}
function validateLiveMedian(item: MarketFigure<unknown>, evaluatedAt: string): void {
  if (
    item.computedAt !== evaluatedAt ||
    (item.state === 'available') !== item.recordCount > 0 ||
    (item.recordCount === 0) !== (item.sources.length === 0) ||
    item.sources.length > item.recordCount
  )
    invalidWire();
  let previous: string | null = null;
  for (const source of item.sources) {
    if (
      source.label !== source.id ||
      Date.parse(source.collectedAt) > Date.parse(evaluatedAt) ||
      (previous !== null && source.id <= previous)
    )
      invalidWire();
    previous = source.id;
  }
}
export function parsePlaceMarketResponse(value: unknown): PlaceMarketResponse {
  const overview = (medianWire: WireValidator, allLive = false) => ({
    counts: wireObject({ properties: wireCount, activeListings: wireCount, sources: wireCount }),
    figures: wireObject({
      medianAskingPricePerSquareMeter: medianWire,
      askingPriceMovement: allLive
        ? figure(
            wireNumber(-100, Number.MAX_SAFE_INTEGER),
            { windowMonths: wireEnum([6]) },
            liveEvidence,
          )
        : movement,
      medianTimeOnMarketDays: figure(wireNumber(), {}, allLive ? liveEvidence : evidence),
      priceReductions: allLive
        ? figure(
            wireObject({ count: wireCount, percentage: wireNumber(0, 100) }),
            { windowDays: wireEnum([30]) },
            liveEvidence,
          )
        : reductions,
      listingsPerProperty: figure(wireNumber(), {}, allLive ? liveEvidence : evidence),
      recordedSalePricePerSquareMeter: allLive
        ? wireObject({ ...liveEvidence, state: wireEnum(['not-recorded']), value: wireNull })
        : sale,
    }),
    parentMedian: wireNullable(wireObject({ place: placeRefWire, median: medianWire })),
  });
  const response = parseWire<PlaceMarketResponse>(
    value,
    wireDiscriminated('basis', {
      'prepared-market-example': wireObject({ ...base, ...overview(median) }),
      'event-fed-place-figures': wireObject({
        ...base,
        basis: wireEnum(['event-fed-place-figures']),
        ...overview(liveMedian, true),
      }),
      'event-fed-figures-with-prepared-counts': wireObject({
        ...base,
        basis: wireEnum(['event-fed-figures-with-prepared-counts']),
        ...overview(liveMedian, true),
        preparedEvaluatedAt: wireDate,
        preparedSections: wireArray(wireEnum(['counts'])),
      }),
      'event-fed-median-with-prepared-sections': wireObject({
        ...base,
        basis: wireEnum(['event-fed-median-with-prepared-sections']),
        ...overview(liveMedian),
        preparedEvaluatedAt: wireDate,
        preparedSections: wireArray(wireEnum(MARKET_PREPARED_SECTIONS)),
      }),
    }),
  );
  validateBase(response);
  const live = response.basis !== 'prepared-market-example';
  const placeLive = response.basis === 'event-fed-place-figures';
  const allLive = placeLive || response.basis === 'event-fed-figures-with-prepared-counts';
  const sections = allLive ? ['counts'] : MARKET_PREPARED_SECTIONS;
  const preparedAt =
    'preparedEvaluatedAt' in response ? response.preparedEvaluatedAt : response.evaluatedAt;
  if (
    'preparedSections' in response &&
    (response.preparedSections.length !== sections.length ||
      response.preparedSections.some((section, index) => section !== sections[index]) ||
      Date.parse(preparedAt) > Date.parse(response.evaluatedAt) ||
      Date.parse(response.metadata.asOf) > Date.parse(preparedAt))
  )
    invalidWire();
  for (const [key, item] of Object.entries(response.figures)) {
    if (allLive) {
      validateLiveFigure(item, response.evaluatedAt);
      if (key === 'recordedSalePricePerSquareMeter' && item.recordCount !== 0) invalidWire();
      continue;
    }
    if (key === 'medianAskingPricePerSquareMeter' && live) {
      validateLiveMedian(item as MarketFigure<unknown>, response.evaluatedAt);
      continue;
    }
    if (key === 'recordedSalePricePerSquareMeter') {
      validateEvidence(item, preparedAt);
      if (item.recordCount !== 0) invalidWire();
    } else validateFigure(item as MarketFigure<unknown>, preparedAt);
  }
  validateParent(response.place, response.parentMedian?.place ?? null);
  if (response.parentMedian) {
    if (live) validateLiveMedian(response.parentMedian.median, response.evaluatedAt);
    else validateFigure(response.parentMedian.median, response.evaluatedAt);
  }
  if (allLive) {
    const { counts, figures } = response;
    if (
      counts.activeListings < counts.properties ||
      counts.sources > counts.activeListings ||
      (counts.properties === 0 && (counts.activeListings !== 0 || counts.sources !== 0))
    )
      invalidWire();
    const properties = figures.listingsPerProperty.recordCount;
    const listings = figures.priceReductions.recordCount;
    if (
      listings < properties ||
      (properties === 0 && listings !== 0) ||
      figures.medianTimeOnMarketDays.recordCount !== properties ||
      figures.medianAskingPricePerSquareMeter.recordCount > properties ||
      figures.askingPriceMovement.recordCount >
        figures.medianAskingPricePerSquareMeter.recordCount ||
      figures.medianAskingPricePerSquareMeter.sources.length >
        figures.medianAskingPricePerSquareMeter.recordCount ||
      figures.askingPriceMovement.sources.length > figures.askingPriceMovement.recordCount * 2 ||
      figures.medianTimeOnMarketDays.sources.length > properties ||
      figures.listingsPerProperty.sources.length > listings ||
      figures.priceReductions.sources.length > listings ||
      (figures.listingsPerProperty.state === 'available' &&
        figures.listingsPerProperty.value !== listings / properties) ||
      (figures.priceReductions.state === 'available' &&
        (figures.priceReductions.value.count > listings ||
          figures.priceReductions.value.percentage !==
            (figures.priceReductions.value.count / listings) * 100))
    )
      invalidWire();
    if (placeLive) {
      const activeSources = figures.listingsPerProperty.sources.map((source) => source.id);
      if (
        counts.properties !== properties ||
        counts.activeListings !== listings ||
        counts.sources !== activeSources.length ||
        figures.priceReductions.sources.length !== activeSources.length ||
        figures.priceReductions.sources.some(
          (source, index) => source.id !== activeSources[index],
        ) ||
        figures.medianAskingPricePerSquareMeter.sources.some(
          (source) => !activeSources.includes(source.id),
        )
      )
        invalidWire();
    }
    return response;
  }
  const { properties, activeListings, sources } = response.counts;
  const figures = response.figures;
  if (
    activeListings < properties ||
    sources > activeListings ||
    (properties === 0 && (activeListings !== 0 || sources !== 0)) ||
    (!live && figures.medianAskingPricePerSquareMeter.recordCount !== properties) ||
    (!live && figures.medianAskingPricePerSquareMeter.sources.length !== sources) ||
    (live && figures.medianTimeOnMarketDays.sources.length !== sources) ||
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
    wireDiscriminated('basis', {
      'prepared-market-example': wireObject({
        ...base,
        items: wireArray(wireObject({ place: placeRefWire, median, movement })),
      }),
      'event-fed-place-figures': wireObject({
        ...base,
        basis: wireEnum(['event-fed-place-figures']),
        items: wireArray(
          wireObject({
            place: placeRefWire,
            median: liveMedian,
            movement: figure(
              wireNumber(-100, Number.MAX_SAFE_INTEGER),
              { windowMonths: wireEnum([6]) },
              liveEvidence,
            ),
          }),
        ),
      }),
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
    if (response.basis === 'event-fed-place-figures') {
      validateLiveMedian(item.median, response.evaluatedAt);
      validateLiveFigure(item.movement, response.evaluatedAt);
      if (
        item.movement.recordCount > item.median.recordCount ||
        item.movement.sources.length > item.movement.recordCount * 2
      )
        invalidWire();
    } else {
      validateFigure(item.median, response.evaluatedAt);
      validateFigure(item.movement, response.evaluatedAt);
    }
  }
  return response;
}
export function parsePlaceMarketSeriesResponse(value: unknown): PlaceMarketSeriesResponse {
  const series = (live: boolean) =>
    wireObject({
      ...base,
      basis: wireEnum([live ? 'event-fed-place-figures' : 'prepared-market-example']),
      comparisonPlace: wireNullable(placeRefWire),
      points: wireArray(
        wireObject({
          month: wirePattern(/^\d{4}-(?:0[1-9]|1[0-2])$/),
          ...(live ? { asOf: wireDate } : {}),
          median: live ? liveMedian : median,
          parentMedian: wireNullable(live ? liveMedian : median),
        }),
      ),
    });
  const response = parseWire<PlaceMarketSeriesResponse>(
    value,
    wireDiscriminated('basis', {
      'prepared-market-example': series(false),
      'event-fed-place-figures': series(true),
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
  }
  if (response.basis === 'event-fed-place-figures') {
    const evaluation = new Date(response.evaluatedAt);
    const terminal = new Date(evaluation);
    // Normalize offsets into UTC before comparing the month.
    if (response.points[11]!.month !== evaluation.toISOString().slice(0, 7)) invalidWire();
    for (const [index, point] of response.points.entries()) {
      terminal.setTime(evaluation.getTime());
      terminal.setUTCDate(1);
      terminal.setUTCHours(0, 0, 0, 0);
      terminal.setUTCMonth(terminal.getUTCMonth() - 10 + index);
      const cutoff =
        index === 11 ? response.evaluatedAt : new Date(terminal.getTime() - 1).toISOString();
      if (point.asOf !== cutoff) invalidWire();
      for (const item of [point.median, point.parentMedian]) {
        if (!item) continue;
        validateLiveMedian(item, response.evaluatedAt);
        if (item.sources.some((source) => Date.parse(source.collectedAt) > Date.parse(point.asOf)))
          invalidWire();
      }
    }
  } else {
    for (const point of response.points) {
      validateFigure(point.median, response.evaluatedAt);
      if (point.parentMedian) validateFigure(point.parentMedian, response.evaluatedAt);
      if (point.median.computedAt.slice(0, 7) !== point.month) invalidWire();
      if (point.parentMedian && point.parentMedian.computedAt.slice(0, 7) !== point.month)
        invalidWire();
    }
  }
  return response;
}
