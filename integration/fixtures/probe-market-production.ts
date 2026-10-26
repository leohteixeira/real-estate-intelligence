import { writeFile } from 'node:fs/promises';
import {
  parsePlaceMarketResponse,
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketSeriesResponse,
} from '../../packages/contracts/dist/index.js';
import { requestHttp } from '../support/http.ts';
const base =
  'https://leohteixeira.com/real-estate-intelligence/api/v1/places/sao-paulo-bela-vista/market';
const output = process.argv[2];
if (!output) throw new Error('Supply an evidence JSON output path.');
const startedAt = new Date().toISOString();
const captures: { path: string; observedAt: string; body: unknown }[] = [];
for (const suffix of ['', '/neighbours', '/monthly-series']) {
  const response = await requestHttp(base + suffix);
  if (response.status !== 200) throw new Error(`HTTP ${response.status}: ${suffix}`);
  captures.push({
    path: base + suffix,
    observedAt: new Date().toISOString(),
    body: await response.json(),
  });
}
const overview = parsePlaceMarketResponse(captures[0]!.body);
const neighbours = parsePlaceMarketNeighboursResponse(captures[1]!.body);
const series = parsePlaceMarketSeriesResponse(captures[2]!.body);
await writeFile(output, JSON.stringify({ startedAt, captures }, null, 2));
if ([overview, neighbours, series].some((r) => r.basis !== 'event-fed-place-figures'))
  throw new Error('Prepared fallback.');
if (
  JSON.stringify(overview.counts) !==
  JSON.stringify({ properties: 1, activeListings: 3, sources: 3 })
)
  throw new Error('Incorrect population.');
const f = overview.figures;
if (
  f.medianAskingPricePerSquareMeter.value?.minorUnits !== Math.round(78_000_000 / 82) ||
  f.askingPriceMovement.value !== (951220 / 975610 - 1) * 100 ||
  f.priceReductions.value?.count !== 0 ||
  f.priceReductions.value.percentage !== 0 ||
  f.listingsPerProperty.value !== 3 ||
  f.recordedSalePricePerSquareMeter.state !== 'not-recorded'
)
  throw new Error('Incorrect figures.');
const expectedDays =
  (Date.parse(overview.evaluatedAt) - Date.parse('2025-10-01T12:00:00.000Z')) / 86400000;
if (Math.abs((f.medianTimeOnMarketDays.value ?? -1) - expectedDays) > 1e-10)
  throw new Error('Incorrect observed duration.');
if (
  overview.parentMedian?.place.id !== 'sao-paulo-centro' ||
  overview.parentMedian.median.value?.minorUnits !== 951220
)
  throw new Error('Incorrect actual parent.');
const expectedSources = [
  'synthetic-portal-aurora',
  'synthetic-portal-brisa',
  'synthetic-portal-cobalto',
];
for (const name of [
  'medianAskingPricePerSquareMeter',
  'askingPriceMovement',
  'medianTimeOnMarketDays',
  'priceReductions',
  'listingsPerProperty',
  'recordedSalePricePerSquareMeter',
] as const) {
  const figure = f[name];
  const expectedCount =
    name === 'recordedSalePricePerSquareMeter' ? 0 : name === 'priceReductions' ? 3 : 1;
  const ids =
    name === 'recordedSalePricePerSquareMeter'
      ? []
      : ['priceReductions', 'listingsPerProperty'].includes(name)
        ? expectedSources
        : [expectedSources[0]];
  if (
    figure.recordCount !== expectedCount ||
    JSON.stringify(figure.sources.map((s) => s.id)) !== JSON.stringify(ids)
  )
    throw new Error(`Incorrect count/sources: ${name}`);
  if (
    Date.parse(figure.computedAt) < Date.parse(startedAt) ||
    Date.parse(figure.computedAt) > Date.parse(overview.evaluatedAt)
  )
    throw new Error('Computation outside actual request.');
  if (
    figure.freshness.ageSeconds !==
    (Date.parse(overview.evaluatedAt) - Date.parse(figure.computedAt)) / 1000
  )
    throw new Error('Incorrect calculation age.');
  if (figure.freshness.status !== (expectedCount ? 'fresh' : 'untracked'))
    throw new Error('Incorrect completion freshness.');
}
const neighbour = neighbours.items[0];
if (
  neighbours.items.length !== 1 ||
  neighbour?.place.id !== 'sao-paulo-vila-mariana' ||
  neighbour.median.value?.minorUnits !== Math.round(124_000_000 / 135) ||
  neighbour.movement.value !== 0 ||
  neighbour.median.recordCount !== 1 ||
  neighbour.movement.recordCount !== 1 ||
  [neighbour.median, neighbour.movement].some(
    (v) => v.sources.map((s) => s.id).join(',') !== 'synthetic-portal-cobalto',
  )
)
  throw new Error('Incorrect registered neighbour/evidence.');
if (
  series.basis !== 'event-fed-place-figures' ||
  series.comparisonPlace?.id !== 'sao-paulo-centro' ||
  series.points.length !== 12
)
  throw new Error('Incorrect live series.');
for (const [index, point] of series.points.entries()) {
  const month = new Date(Date.UTC(2025, 10 + index, 1)).toISOString().slice(0, 7);
  const cutoff =
    index === 11 ? series.evaluatedAt : new Date(Date.UTC(2025, 11 + index, 1) - 1).toISOString();
  const expected = index < 2 ? 1000000 : index < 8 ? 975610 : 951220;
  const observation =
    index < 2
      ? '2025-10-01T12:00:00.000Z'
      : index < 8
        ? '2026-01-01T12:00:00.000Z'
        : '2026-07-01T12:00:00.000Z';
  if (point.month !== month || point.asOf !== cutoff || !point.parentMedian)
    throw new Error('Incorrect monthly cutoff/parent.');
  for (const median of [point.median, point.parentMedian]) {
    if (
      median.value?.minorUnits !== expected ||
      median.recordCount !== 1 ||
      median.sources.length !== 1 ||
      median.sources[0]?.id !== 'synthetic-portal-aurora' ||
      median.sources[0].collectedAt !== observation ||
      Date.parse(median.computedAt) < Date.parse(startedAt) ||
      Date.parse(median.computedAt) > Date.parse(series.evaluatedAt) ||
      median.freshness.status !== 'fresh'
    )
      throw new Error(`Incorrect monthly amount/evidence: ${month}`);
  }
}
await writeFile(
  output,
  JSON.stringify(
    {
      result: 'passed',
      deliveredSource: 'b570a09427bea39ea03d4dda93c7dc0e0c502899',
      startedAt,
      completedAt: new Date().toISOString(),
      captures,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    result: 'passed',
    reads: captures.length,
    points: series.points.length,
    output,
  }),
);
