import { describe, expect, it } from 'vitest';
import type { ListingFact } from '../properties/index.js';
import { monthlyAskingPriceSeries } from './monthly-asking-price-series.js';
import type { MarketStateEvidence } from './remaining-place-figures.js';
const now = '2024-03-15T12:34:56.789Z';
function state(
  revision: number,
  at: string,
  changes: Partial<ListingFact> = {},
): MarketStateEvidence {
  return {
    revision,
    listing: {
      listingId: 'a',
      propertyId: 'one',
      sourceId: 'source-a',
      sourceListingId: 'a',
      placeId: 'child',
      propertyType: 'apartment',
      status: 'active',
      currency: 'BRL',
      askingPriceMinorUnits: 10001,
      areaSquareMeters: 10,
      effectiveAt: at,
      provenance: {
        sourceId: 'source-a',
        sourceListingId: 'a',
        sourceUrl: 'https://source.invalid/a',
        observedAt: at,
        runId: 'run',
        snapshotId: 'snapshot',
        contentHash: `sha256:${'a'.repeat(64)}`,
      },
      ...changes,
    },
  };
}
const calculate = (history: readonly MarketStateEvidence[], at = now) =>
  monthlyAskingPriceSeries(history, ['child'], ['child', 'sibling'], at);
describe('D-097 monthly asking price populations', () => {
  it('returns twelve ascending UTC months across year rollover, leap February and partial current month', () => {
    const points = calculate([]);
    expect(points.map(({ month }) => month)).toEqual([
      '2023-04',
      '2023-05',
      '2023-06',
      '2023-07',
      '2023-08',
      '2023-09',
      '2023-10',
      '2023-11',
      '2023-12',
      '2024-01',
      '2024-02',
      '2024-03',
    ]);
    expect(points[0]!.asOf).toBe('2023-04-30T23:59:59.999Z');
    expect(points[10]!.asOf).toBe('2024-02-29T23:59:59.999Z');
    expect(points[11]!.asOf).toBe(now);
    for (const point of points)
      expect(point.median).toMatchObject({
        value: null,
        state: 'insufficient-data',
        recordCount: 0,
        sources: [],
        computedAt: now,
        freshness: { status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 0 },
      });
    expect(monthlyAskingPriceSeries([], [], null, now).every((p) => p.parentMedian === null)).toBe(
      true,
    );
    expect(calculate([], '2025-03-01T00:00:00.000Z')[10]!.asOf).toBe('2025-02-28T23:59:59.999Z');
  });
  it('selects highest eligible revisions independently by month, including removal, reappearance and delayed observations', () => {
    const exact = '2024-01-31T23:59:59.999Z';
    const late = state(5, exact, { askingPriceMinorUnits: 90000 });
    const history = [
      {
        ...late,
        listing: {
          ...late.listing,
          provenance: { ...late.listing.provenance, observedAt: '2024-02-01T00:00:00.000Z' },
        },
      },
      state(4, '2024-01-01T00:00:00.000Z', { askingPriceMinorUnits: 20000 }),
      state(3, exact),
      state(6, '2024-02-29T23:59:59.999Z', { status: 'removed' }),
      state(7, now, { askingPriceMinorUnits: 30000 }),
      state(8, '2024-03-15T12:34:56.790Z', { askingPriceMinorUnits: 40000 }),
    ];
    const points = calculate(history);
    expect(points[8]!.median.value).toBeNull();
    expect(points[9]!.median.value?.minorUnits).toBe(2000);
    expect(points[9]!.median.sources[0]!.collectedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(points[10]!.median.value).toBeNull();
    expect(points[11]!.median.value?.minorUnits).toBe(3000);
    expect(calculate([...history].reverse())).toEqual(points);
    expect(calculate([state(1, exact)])[9]!.median.value?.minorUnits).toBe(1000);
  });
  it('requires effective and observed times independently at the inclusive closed-month cutoff', () => {
    const cutoff = '2024-02-29T23:59:59.999Z';
    const after = '2024-03-01T00:00:00.000Z';
    const eligible = state(1, cutoff);
    const futureEffective = state(2, after, {
      askingPriceMinorUnits: 20000,
      provenance: { ...eligible.listing.provenance, observedAt: cutoff },
    });
    const futureObservation = state(3, cutoff, {
      askingPriceMinorUnits: 30000,
      provenance: { ...eligible.listing.provenance, observedAt: after },
    });
    const points = calculate([futureObservation, futureEffective, eligible]);
    expect(points[10]!.median.value?.minorUnits).toBe(1000);
    expect(points[10]!.median.sources[0]!.collectedAt).toBe(cutoff);
    expect(points[11]!.median.value?.minorUnits).toBe(3000);
  });
  it('uses global minima before geography/area, counts each current property once, and computes parent independently', () => {
    const at = '2023-04-01T00:00:00.000Z';
    const history = [
      state(1, at),
      state(1, at, { listingId: 'b', askingPriceMinorUnits: 20000 }),
      state(1, at, {
        listingId: 'c',
        propertyId: 'two',
        placeId: 'sibling',
        askingPriceMinorUnits: 30000,
      }),
      state(1, at, { listingId: 'd', propertyId: 'three', areaSquareMeters: null }),
      state(1, at, { listingId: 'e', propertyId: 'three', askingPriceMinorUnits: 10001 }),
      state(1, at, {
        listingId: 'f',
        propertyId: 'four',
        placeId: 'outside',
        askingPriceMinorUnits: 5000,
      }),
      state(1, at, { listingId: 'g', propertyId: 'four', askingPriceMinorUnits: 60000 }),
      state(1, now, { listingId: 'h', propertyId: 'new', askingPriceMinorUnits: 50000 }),
    ];
    const points = calculate(history);
    expect(points[0]!.median).toMatchObject({ recordCount: 1, value: { minorUnits: 1000 } });
    expect(points[0]!.parentMedian).toMatchObject({ recordCount: 2, value: { minorUnits: 2000 } });
    expect(points[11]!.median).toMatchObject({ recordCount: 2, value: { minorUnits: 3000 } });
    expect(points[11]!.parentMedian).toMatchObject({ recordCount: 3, value: { minorUnits: 3000 } });
    expect(history[0]!.listing.askingPriceMinorUnits).toBe(10001);
  });
  it('preserves selected-source evidence, safe centavo even rounding and detached results', () => {
    const a = state(1, '2023-04-01T00:00:00.000Z');
    const b = state(1, '2023-04-02T00:00:00.000Z', {
      listingId: 'b',
      propertyId: 'two',
      askingPriceMinorUnits: 10010,
    });
    const points = calculate([a, b]);
    expect(points[0]!.median.value?.minorUnits).toBe(1001);
    expect(points[0]!.median.sources[0]!.url).toBe('https://source.invalid/a');
    // Mutating one response cannot alter retained facts or another month's evidence.
    Reflect.set(points[0]!.median.sources[0]!, 'url', 'mutated');
    expect(calculate([a, b])[0]!.median.sources[0]!.url).toBe('https://source.invalid/a');
    expect(points[1]!.median.sources[0]!.url).toBe('https://source.invalid/a');
  });
  it('fails closed on invalid timestamps, retained revisions, money and area', () => {
    expect(() => calculate([], 'invalid')).toThrow();
    for (const revision of [0, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => calculate([state(revision, now)])).toThrow('revision');
    for (const changes of [
      { effectiveAt: 'bad' },
      { askingPriceMinorUnits: 0 },
      { askingPriceMinorUnits: Number.MAX_SAFE_INTEGER + 1 },
      { areaSquareMeters: 0 },
    ])
      expect(() => calculate([state(1, now, changes)])).toThrow();
    const bad = state(1, now);
    expect(() =>
      calculate([
        {
          ...bad,
          listing: { ...bad.listing, provenance: { ...bad.listing.provenance, observedAt: 'bad' } },
        },
      ]),
    ).toThrow();
  });
});

it('anchors month rollover to evaluation while retaining actual earlier calculation start', () => {
  const computedAt = '2026-09-30T23:59:59.500Z';
  const evaluatedAt = '2026-10-01T00:00:00.500Z';
  const points = monthlyAskingPriceSeries(
    [state(1, computedAt)],
    ['child'],
    null,
    evaluatedAt,
    computedAt,
  );
  expect(points[0]!.month).toBe('2025-11');
  expect(points.at(-1)!.month).toBe('2026-10');
  expect(points.at(-1)!.asOf).toBe(evaluatedAt);
  expect(points.at(-1)!.median.value?.minorUnits).toBe(1000);
  for (const point of points) {
    expect(point.median.computedAt).toBe(computedAt);
    expect(point.median.freshness.ageSeconds).toBe(1);
  }
  expect(() => monthlyAskingPriceSeries([], [], null, computedAt, evaluatedAt)).toThrow();
});
