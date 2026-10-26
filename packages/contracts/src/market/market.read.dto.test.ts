import { describe, expect, it } from 'vitest';
import {
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketResponse,
  parsePlaceMarketSeriesResponse,
} from './market.read.dto.js';
import { MARKET_PREPARED_SECTIONS } from './market.read.types.js';

const evaluatedAt = '2026-10-01T12:00:00.000Z';
const country = { id: 'brazil', kind: 'country', name: { en: 'Brazil', ptBR: 'Brasil' } };
const neighborhood = {
  id: 'sao-paulo-bela-vista',
  kind: 'neighborhood',
  name: { en: 'Bela Vista', ptBR: 'Bela Vista' },
};
function evidence(computedAt = evaluatedAt, records = 1) {
  return {
    recordCount: records,
    sources: records
      ? [
          {
            id: 'synthetic-source',
            label: 'Synthetic source',
            url: 'https://source.invalid',
            collectedAt: computedAt,
          },
        ]
      : [],
    computedAt,
    freshness: {
      status: 'fresh',
      latestCollectionCompletedAt: records ? computedAt : null,
      ageSeconds: (Date.parse(evaluatedAt) - Date.parse(computedAt)) / 1000,
    },
  };
}
function figure(value: unknown, computedAt = evaluatedAt, records = 1) {
  return {
    ...evidence(computedAt, records),
    state: records ? 'available' : 'insufficient-data',
    value,
  };
}
function overview() {
  return {
    metadata: {
      dataMode: 'synthetic-stub',
      fixtureVersion: 'synthetic-sao-paulo-v1',
      asOf: evaluatedAt,
    },
    basis: 'prepared-market-example',
    evaluatedAt,
    place: country,
    counts: { properties: 1, activeListings: 2, sources: 1 },
    figures: {
      medianAskingPricePerSquareMeter: figure({ minorUnits: 1000000, currency: 'BRL' }),
      askingPriceMovement: { ...figure(0), windowMonths: 6 },
      medianTimeOnMarketDays: figure(0),
      priceReductions: { ...figure({ count: 0, percentage: 0 }, evaluatedAt, 2), windowDays: 30 },
      listingsPerProperty: figure(2),
      recordedSalePricePerSquareMeter: {
        ...evidence(evaluatedAt, 0),
        state: 'not-recorded',
        value: null,
      },
    },
    parentMedian: null,
  };
}
function series() {
  const { metadata, basis, evaluatedAt, place } = overview();
  return {
    metadata,
    basis,
    evaluatedAt,
    place,
    comparisonPlace: null,
    points: Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2025, 10 + index, 1, 12)).toISOString();
      return {
        month: date.slice(0, 7),
        median: figure({ minorUnits: 1000000, currency: 'BRL' }, date),
        parentMedian: null,
      };
    }),
  };
}
function changed(input: unknown, path: string, value: unknown, remove = false) {
  const result = structuredClone(input) as Record<string, unknown>;
  const keys = path.split('.');
  let object = result;
  for (const key of keys.slice(0, -1)) object = object[key] as Record<string, unknown>;
  if (remove) delete object[keys.at(-1)!];
  else object[keys.at(-1)!] = value;
  return result;
}
describe('strict prepared Market wire contracts', () => {
  function live() {
    const original = overview();
    const now = '2026-10-11T12:00:00.000Z';
    return {
      ...original,
      basis: 'event-fed-median-with-prepared-sections',
      evaluatedAt: now,
      preparedEvaluatedAt: evaluatedAt,
      preparedSections: MARKET_PREPARED_SECTIONS,
      figures: {
        ...original.figures,
        medianAskingPricePerSquareMeter: {
          ...figure({ minorUnits: 1500, currency: 'BRL' }, now, 2),
          sources: [
            {
              id: 'synthetic-source',
              label: 'synthetic-source',
              url: 'https://source.invalid/selected',
              collectedAt: evaluatedAt,
            },
          ],
          freshness: { status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 0 },
        },
      },
    };
  }
  function liveFigures() {
    const response = live();
    return {
      ...response,
      basis: 'event-fed-figures-with-prepared-counts',
      preparedSections: ['counts'],
      counts: { properties: 7, activeListings: 10, sources: 3 },
      figures: Object.fromEntries(
        Object.entries({
          ...response.figures,
          medianAskingPricePerSquareMeter: {
            ...response.figures.medianAskingPricePerSquareMeter,
            recordCount: 1,
          },
        }).map(([key, value]) => [
          key,
          {
            ...value,
            computedAt: response.evaluatedAt,
            sources: value.sources.map((source) => ({ ...source, label: source.id })),
            freshness: { status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 0 },
          },
        ]),
      ),
    };
  }
  it('accepts all live figures with independent prepared counts and zero reductions', () => {
    expect(parsePlaceMarketResponse(liveFigures()).counts.properties).toBe(7);
    const paired = changed(liveFigures(), 'figures.askingPriceMovement.sources', [
      {
        id: 'older-source',
        label: 'older-source',
        url: 'https://old.invalid',
        collectedAt: evaluatedAt,
      },
      {
        id: 'synthetic-source',
        label: 'synthetic-source',
        url: 'https://source.invalid',
        collectedAt: evaluatedAt,
      },
    ]);
    expect(parsePlaceMarketResponse(paired).figures.askingPriceMovement.recordCount).toBe(1);
  });
  it.each([
    ['preparedSections', []],
    ['preparedSections', ['counts', 'counts']],
    ['preparedSections', MARKET_PREPARED_SECTIONS],
    ['preparedEvaluatedAt', '2027-01-01T00:00:00.000Z'],
    ['figures.askingPriceMovement.computedAt', evaluatedAt],
    ['figures.askingPriceMovement.sources.0.label', 'Prepared'],
    ['figures.askingPriceMovement.sources.0.collectedAt', '2027-01-01T00:00:00.000Z'],
    ['figures.askingPriceMovement.sources', []],
    ['figures.medianTimeOnMarketDays.freshness.status', 'fresh'],
    ['figures.priceReductions.value.percentage', 50],
    ['figures.priceReductions.value.count', 3],
    ['figures.listingsPerProperty.value', 1],
    ['figures.medianTimeOnMarketDays.recordCount', 2],
    ['figures.recordedSalePricePerSquareMeter.recordCount', 1],
    ['counts.activeListings', 1],
  ])('rejects contradictory live-figures response %s', (path, value) => {
    expect(() => parsePlaceMarketResponse(changed(liveFigures(), path, value))).toThrow(TypeError);
  });
  it('separates real population/computation from independently evaluated prepared sections', () => {
    const parsed = parsePlaceMarketResponse(live());
    expect(parsed.figures.medianAskingPricePerSquareMeter.recordCount).toBe(2);
    expect(parsed.counts.properties).toBe(1);
    expect(parsed.figures.askingPriceMovement.freshness.ageSeconds).toBe(0);
    const empty = changed(
      changed(
        changed(
          changed(live(), 'figures.medianAskingPricePerSquareMeter.recordCount', 0),
          'figures.medianAskingPricePerSquareMeter.sources',
          [],
        ),
        'figures.medianAskingPricePerSquareMeter.state',
        'insufficient-data',
      ),
      'figures.medianAskingPricePerSquareMeter.value',
      null,
    );
    expect(
      parsePlaceMarketResponse(empty).figures.medianAskingPricePerSquareMeter.value,
    ).toBeNull();
  });
  it.each([
    ['preparedSections', ['counts']],
    ['preparedSections', [...MARKET_PREPARED_SECTIONS, 'counts']],
    ['preparedSections', [...MARKET_PREPARED_SECTIONS].reverse()],
    ['preparedSections', ['counts', 'figures.medianAskingPricePerSquareMeter']],
    ['preparedEvaluatedAt', '2026-10-12T12:00:00.000Z'],
    ['figures.askingPriceMovement.freshness.ageSeconds', 864000],
    ['figures.askingPriceMovement.freshness.status', 'untracked'],
    ['figures.medianAskingPricePerSquareMeter.computedAt', evaluatedAt],
    ['figures.medianAskingPricePerSquareMeter.freshness.status', 'fresh'],
    ['figures.medianAskingPricePerSquareMeter.freshness.latestCollectionCompletedAt', evaluatedAt],
    ['figures.medianAskingPricePerSquareMeter.freshness.ageSeconds', 1],
    ['figures.medianAskingPricePerSquareMeter.sources.0.label', 'prepared label'],
    ['figures.medianAskingPricePerSquareMeter.sources.0.collectedAt', '2026-10-12T12:00:00.000Z'],
    ['figures.medianAskingPricePerSquareMeter.value.minorUnits', 0],
    ['counts.sources', 0],
  ])('rejects staged contradiction %s', (path, value) => {
    expect(() => parsePlaceMarketResponse(changed(live(), path, value))).toThrow(TypeError);
  });
  it('requires both staged declarations and preserves strict parent provenance', () => {
    for (const key of ['preparedSections', 'preparedEvaluatedAt'])
      expect(() => parsePlaceMarketResponse(changed(live(), key, null, true))).toThrow();
    const original = live();
    const child = {
      ...original,
      place: { id: 'state', kind: 'state', name: { en: 'State', ptBR: 'State' } },
      parentMedian: { place: country, median: original.figures.medianAskingPricePerSquareMeter },
    };
    expect(parsePlaceMarketResponse(child).parentMedian?.median.recordCount).toBe(2);
    expect(() =>
      parsePlaceMarketResponse(changed(child, 'parentMedian.median.freshness.status', 'fresh')),
    ).toThrow();
  });
  it('validates the parsed synthetic hostname rather than a raw authority suffix', () => {
    const realHostUrl = 'https://real.example\\synthetic.invalid';
    expect(new URL(realHostUrl).hostname).toBe('real.example');
    expect(() =>
      parsePlaceMarketResponse(
        changed(overview(), 'figures.askingPriceMovement.sources.0.url', realHostUrl),
      ),
    ).toThrow(TypeError);
    for (const url of ['https://source.invalid', 'http://portal.source.invalid/path?sample=1']) {
      const response = parsePlaceMarketResponse(
        changed(overview(), 'figures.askingPriceMovement.sources.0.url', url),
      );
      expect(response.figures.askingPriceMovement.sources[0]!.url).toBe(url);
    }
  });
  it('accepts fresh, zero-valued and explicitly unrecorded figures', () => {
    const response = parsePlaceMarketResponse(overview());
    expect(response.figures.askingPriceMovement.value).toBe(0);
    expect(response.figures.priceReductions.value).toEqual({ count: 0, percentage: 0 });
    expect(response.figures.recordedSalePricePerSquareMeter.value).toBeNull();
    expect(parsePlaceMarketSeriesResponse(series()).points).toHaveLength(12);
    expect(
      parsePlaceMarketNeighboursResponse({
        metadata: response.metadata,
        basis: response.basis,
        evaluatedAt,
        place: country,
        items: [],
      }).items,
    ).toEqual([]);
  });
  it('accepts stale only when a later declared source completion precedes evaluation', () => {
    let input: unknown = changed(overview(), 'evaluatedAt', '2026-10-01T12:00:02.000Z');
    const original = overview();
    for (const key of Object.keys(original.figures))
      input = changed(input, `figures.${key}.freshness.ageSeconds`, 2);
    input = changed(
      input,
      'figures.askingPriceMovement.sources.0.collectedAt',
      '2026-10-01T12:00:01.000Z',
    );
    input = changed(
      input,
      'figures.askingPriceMovement.freshness.latestCollectionCompletedAt',
      '2026-10-01T12:00:01.000Z',
    );
    input = changed(input, 'figures.askingPriceMovement.freshness.status', 'stale');
    expect(parsePlaceMarketResponse(input).figures.askingPriceMovement.freshness.status).toBe(
      'stale',
    );
  });
  it('allows observations collected before completion and rejects observations after it', () => {
    const input = changed(
      overview(),
      'figures.askingPriceMovement.sources.0.collectedAt',
      '2026-10-01T11:59:59.000Z',
    );
    expect(parsePlaceMarketResponse(input).figures.askingPriceMovement.freshness.status).toBe(
      'fresh',
    );
    expect(() =>
      parsePlaceMarketResponse(
        changed(
          input,
          'figures.askingPriceMovement.sources.0.collectedAt',
          '2026-10-01T12:00:01.000Z',
        ),
      ),
    ).toThrow(TypeError);
    const recorded = changed(overview(), 'figures.recordedSalePricePerSquareMeter', {
      ...evidence(),
      state: 'not-recorded',
      value: null,
    });
    expect(() => parsePlaceMarketResponse(recorded)).toThrow(TypeError);
  });
  it('accepts existing empty scopes with explicit parent comparison and twelve unavailable points', () => {
    const input = overview();
    let empty: unknown = {
      ...input,
      place: { ...neighborhood, kind: 'street-block', id: 'empty-block' },
      counts: { properties: 0, activeListings: 0, sources: 0 },
      parentMedian: { place: neighborhood, median: input.figures.medianAskingPricePerSquareMeter },
    };
    for (const key of Object.keys(input.figures)) {
      empty = changed(empty, `figures.${key}.value`, null);
      empty = changed(empty, `figures.${key}.recordCount`, 0);
      empty = changed(empty, `figures.${key}.sources`, []);
      empty = changed(empty, `figures.${key}.freshness.latestCollectionCompletedAt`, null);
      if (key !== 'recordedSalePricePerSquareMeter')
        empty = changed(empty, `figures.${key}.state`, 'insufficient-data');
    }
    expect(parsePlaceMarketResponse(empty).counts.properties).toBe(0);
    const chart = series();
    expect(
      parsePlaceMarketSeriesResponse({
        ...chart,
        place: { ...neighborhood, kind: 'street-block', id: 'empty-block' },
        comparisonPlace: neighborhood,
        points: chart.points.map((point) => ({
          ...point,
          median: figure(null, point.median.computedAt, 0),
          parentMedian: point.median,
        })),
      }).points.every((point) => point.median.value === null),
    ).toBe(true);
  });
  it.each([
    ['private', true],
    ['basis', 'persisted-market'],
    ['metadata.extra', true],
    ['counts.properties', Number.MAX_SAFE_INTEGER + 1],
    ['counts.activeListings', 0],
    ['counts.sources', 2],
    ['figures.medianAskingPricePerSquareMeter.value.minorUnits', 1.1],
    ['figures.medianAskingPricePerSquareMeter.value.currency', 'USD'],
    ['figures.medianTimeOnMarketDays.value', -1],
    ['figures.askingPriceMovement.value', NaN],
    ['figures.askingPriceMovement.windowMonths', 12],
    ['figures.priceReductions.windowDays', 60],
    ['figures.priceReductions.value.percentage', 101],
    ['figures.priceReductions.value.count', 3],
    ['figures.listingsPerProperty.value', 3],
    ['figures.recordedSalePricePerSquareMeter.value', { minorUnits: 0, currency: 'BRL' }],
    ['figures.recordedSalePricePerSquareMeter.recordCount', 1],
    ['figures.askingPriceMovement.state', 'insufficient-data'],
    ['figures.askingPriceMovement.sources.0.url', 'https://source.com'],
    ['figures.askingPriceMovement.sources.0.url', 'https://secret@source.invalid'],
    ['figures.askingPriceMovement.sources.0.url', 'broken'],
    ['figures.askingPriceMovement.sources.0.collectedAt', '2026-02-30T12:00:00.000Z'],
    ['figures.askingPriceMovement.sources', [evidence().sources[0], evidence().sources[0]]],
    ['figures.askingPriceMovement.computedAt', '2026-10-02T12:00:00.000Z'],
    ['figures.askingPriceMovement.freshness.status', 'stale'],
    ['figures.askingPriceMovement.freshness.ageSeconds', 1],
    ['figures.askingPriceMovement.freshness.ageSeconds', -1],
    ['figures.askingPriceMovement.freshness.latestCollectionCompletedAt', null],
    [
      'figures.askingPriceMovement.freshness.latestCollectionCompletedAt',
      '2026-10-02T12:00:00.000Z',
    ],
    ['figures.askingPriceMovement.sources', []],
    ['figures.askingPriceMovement.recordCount', 0],
    ['metadata.asOf', '2026-10-02T12:00:00.000Z'],
    [
      'parentMedian',
      { place: country, median: overview().figures.medianAskingPricePerSquareMeter },
    ],
  ])('rejects malformed overview %s', (path, value) => {
    expect(() => parsePlaceMarketResponse(changed(overview(), path, value))).toThrow(TypeError);
  });
  it('rejects missing fields recursively', () => {
    for (const path of [
      'place',
      'figures.askingPriceMovement.value',
      'figures.priceReductions.freshness.ageSeconds',
    ])
      expect(() => parsePlaceMarketResponse(changed(overview(), path, null, true))).toThrow(
        TypeError,
      );
  });
  it.each([
    ['points', []],
    ['points.0.month', '2025-13'],
    ['points.1.month', '2025-11'],
    ['points.1.month', '2026-01'],
    ['points.0.extra', true],
    ['points.0.parentMedian', overview().figures.medianAskingPricePerSquareMeter],
    ['comparisonPlace', country],
    ['points.0.median.computedAt', evaluatedAt],
  ])('rejects malformed series %s', (path, value) => {
    expect(() => parsePlaceMarketSeriesResponse(changed(series(), path, value))).toThrow(TypeError);
  });
  it('validates parent kinds, neighbor identity and evidence', () => {
    const response = overview();
    const item = {
      place: { ...neighborhood, id: 'sao-paulo-vila-mariana' },
      median: response.figures.medianAskingPricePerSquareMeter,
      movement: response.figures.askingPriceMovement,
    };
    const neighbors = {
      metadata: response.metadata,
      basis: response.basis,
      evaluatedAt,
      place: neighborhood,
      items: [item],
    };
    expect(parsePlaceMarketNeighboursResponse(neighbors).items).toHaveLength(1);
    for (const input of [
      changed(neighbors, 'items', [item, item]),
      changed(neighbors, 'items.0.place.id', neighborhood.id),
      changed(neighbors, 'items.0.place.kind', 'city'),
      changed(neighbors, 'items.0.median.value.currency', 'USD'),
    ])
      expect(() => parsePlaceMarketNeighboursResponse(input)).toThrow(TypeError);
    expect(() => parsePlaceMarketResponse({ ...response, place: neighborhood })).toThrow(TypeError);
    expect(() =>
      parsePlaceMarketResponse({
        ...response,
        place: neighborhood,
        parentMedian: { place: country, median: item.median },
      }),
    ).toThrow(TypeError);
  });
});
