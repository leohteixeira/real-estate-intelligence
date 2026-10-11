import { describe, expect, it } from 'vitest';
import { rankLargestReductions, type ReductionCandidate } from './largest-reductions.js';

const date = (day: number) => `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`;
function candidate(id: string, prices: readonly [number, number, number][]): ReductionCandidate {
  return {
    propertyId: id,
    listingId: `listing-${id}`,
    place: { id: 'block', kind: 'street-block', name: { en: 'Block', ptBR: 'Block' } },
    asOf: date(10),
    priceChanges: prices.map(([day, previousMinorUnits, currentMinorUnits]) => ({
      type: 'price-changed',
      effectiveAt: date(day),
      previousMinorUnits,
      currentMinorUnits,
      provenance: {
        sourceId: 'source',
        sourceListingId: id,
        sourceUrl: 'https://example.test',
        runId: 'run',
        snapshotId: 'snapshot',
        contentHash: 'sha256:hash',
        observedAt: date(day),
      },
    })),
  };
}
describe('persisted largest reductions rule', () => {
  it('selects latest dated negative effect, retaining it after a rise or removal', () => {
    const row = candidate('a', [
      [4, 100, 50],
      [8, 50, 45],
      [6, 45, 40],
      [9, 40, 80],
      [11, 80, 20],
    ]);
    expect(rankLargestReductions([row], date(10))[0]).toMatchObject({
      effectiveAt: date(8),
      previousMinorUnits: 50,
      currentMinorUnits: 45,
      reductionPercent: 10,
    });
  });
  it('breaks equal dates by canonical position and ignores unchanged/increased prices', () => {
    expect(
      rankLargestReductions(
        [
          candidate('a', [
            [8, 100, 80],
            [8, 80, 70],
          ]),
        ],
        date(10),
      )[0],
    ).toMatchObject({ previousMinorUnits: 80, currentMinorUnits: 70 });
    expect(
      rankLargestReductions(
        [
          candidate('a', [
            [8, 100, 100],
            [9, 100, 110],
          ]),
          candidate('b', []),
        ],
        date(10),
      ),
    ).toEqual([]);
  });
  it('orders exact positive ratios descending and equal ratios by property ID without mutation', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const rows = [
      candidate('z', [[8, 100, 80]]),
      candidate('a', [[8, 200, 160]]),
      candidate('c', [[8, max, max - 1]]),
      candidate('b', [[8, max - 1, max - 2]]),
    ];
    const before = structuredClone(rows);
    const result = rankLargestReductions(rows, date(10));
    expect(result.map((row) => row.propertyId)).toEqual(['a', 'z', 'b', 'c']);
    expect(result[2]!.reductionPercent).toBeGreaterThan(0);
    Reflect.set(result[0]!.place.name, 'en', 'Changed');
    expect(rows).toEqual(before);
  });
});
