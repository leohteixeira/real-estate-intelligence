import { describe, expect, it } from 'vitest';
import type { ListingFact } from '../properties/index.js';
import { askingPriceMedian } from './asking-price-median.js';

const now = '2026-10-11T12:00:00.000Z';
function fact(
  listingId = 'a',
  propertyId = 'A',
  price = 10000,
  changes: Partial<ListingFact> = {},
): ListingFact {
  return {
    listingId,
    propertyId,
    askingPriceMinorUnits: price,
    areaSquareMeters: 10,
    placeId: 'block',
    sourceId: 'source-a',
    sourceListingId: listingId,
    propertyType: 'apartment',
    status: 'active',
    currency: 'BRL',
    effectiveAt: now,
    provenance: {
      sourceId: 'source-a',
      sourceListingId: listingId,
      sourceUrl: `https://source.invalid/${listingId}`,
      observedAt: now,
      runId: 'run',
      snapshotId: 'snapshot',
      contentHash: `sha256:${'a'.repeat(64)}`,
    },
    ...changes,
  };
}
describe('asking price median — ADR 0021', () => {
  it('counts actual properties once, rounds odd/even medians and handles empty scopes', () => {
    const facts = [fact(), fact('b', 'A', 15000), fact('c', 'B', 20000)];
    expect(askingPriceMedian(facts, ['block'], now)).toMatchObject({
      value: { minorUnits: 1500, currency: 'BRL' },
      recordCount: 2,
      freshness: { status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 0 },
    });
    expect(
      askingPriceMedian([...facts, fact('d', 'C', 17000)], ['block'], now).value?.minorUnits,
    ).toBe(1700);
    expect(
      askingPriceMedian([fact('a', 'A', 10005), fact('b', 'B', 10015)], ['block'], now).value
        ?.minorUnits,
    ).toBe(1002);
    expect(askingPriceMedian([], ['block'], now)).toMatchObject({
      state: 'insufficient-data',
      value: null,
      sources: [],
      recordCount: 0,
    });
  });
  it('selects globally before geography and never substitutes for a null-area minimum', () => {
    expect(
      askingPriceMedian(
        [fact('a', 'A', 10000, { placeId: 'outside' }), fact('b', 'A', 15000)],
        ['block'],
        now,
      ).value,
    ).toBeNull();
    expect(
      askingPriceMedian(
        [fact('a', 'A', 10000, { areaSquareMeters: null }), fact('b', 'A', 15000)],
        ['block'],
        now,
      ).value,
    ).toBeNull();
    expect(
      askingPriceMedian(
        [fact('a', 'A', 10000, { status: 'removed' }), fact('b', 'A', 15000)],
        ['block'],
        now,
      ).value?.minorUnits,
    ).toBe(1500);
    expect(askingPriceMedian([fact()], [], now).value).toBeNull();
  });
  it('uses listing IDs for price ties, latest contributing source observations and source ties', () => {
    const older = fact('a', 'A');
    const later = fact('b', 'B', 20000);
    const third = fact('c', 'C', 30000, { sourceId: 'source-b' });
    Reflect.set(older.provenance, 'observedAt', '2026-10-10T12:00:00.000Z');
    const result = askingPriceMedian(
      [third, later, older, fact('z', 'A', 10000, { areaSquareMeters: null })],
      ['block'],
      now,
    );
    expect(result.sources.map((source) => source.id)).toEqual(['source-a', 'source-b']);
    expect(result.sources[0]).toMatchObject({
      label: 'source-a',
      url: 'https://source.invalid/b',
      collectedAt: now,
    });
    expect(askingPriceMedian([later, fact('a', 'A')], ['block'], now).sources[0]!.url).toBe(
      'https://source.invalid/a',
    );
    Reflect.set(result.sources[0]!, 'url', 'mutated');
    expect(askingPriceMedian([later], ['block'], now).sources[0]!.url).toBe(
      'https://source.invalid/b',
    );
    expect(later.provenance.sourceUrl).toBe('https://source.invalid/b');
  });
  it('avoids even-median overflow and rejects an unrepresentable positive price rounding to zero', () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    expect(
      askingPriceMedian(
        [
          fact('a', 'A', maximum, { areaSquareMeters: 1 }),
          fact('b', 'B', maximum - 1, { areaSquareMeters: 1 }),
        ],
        ['block'],
        now,
      ).value?.minorUnits,
    ).toBe(maximum);
    expect(() =>
      askingPriceMedian([fact('a', 'A', 1, { areaSquareMeters: 1_000_000 })], ['block'], now),
    ).toThrow('Unsafe price per square meter');
    expect(
      askingPriceMedian([fact('a', 'A', 1, { areaSquareMeters: 0.01 })], ['block'], now).value
        ?.minorUnits,
    ).toBe(100);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe asking price %s',
    (price) => {
      expect(() => askingPriceMedian([fact('a', 'A', price)], ['block'], now)).toThrow();
    },
  );
  it.each([0, -1, 0.009, 1_000_001, NaN, Infinity])(
    'rejects invalid area %s',
    (areaSquareMeters) => {
      expect(() =>
        askingPriceMedian([fact('a', 'A', 1, { areaSquareMeters })], ['block'], now),
      ).toThrow();
    },
  );
  it('rejects division overflow, invalid computation dates and future observations', () => {
    expect(() =>
      askingPriceMedian(
        [fact('a', 'A', Number.MAX_SAFE_INTEGER, { areaSquareMeters: 0.01 })],
        ['block'],
        now,
      ),
    ).toThrow('Unsafe price per square meter');
    expect(() => askingPriceMedian([], [], 'invalid')).toThrow();
    expect(() => askingPriceMedian([fact()], ['block'], '2026-10-10T12:00:00.000Z')).toThrow(
      'Observation follows computation',
    );
  });
});
