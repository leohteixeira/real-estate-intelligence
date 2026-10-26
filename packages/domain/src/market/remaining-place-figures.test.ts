import { describe, expect, it } from 'vitest';
import type { ListingFact } from '../properties/index.js';
import {
  remainingPlaceFigures,
  sixMonthsBefore,
  type MarketFiguresSnapshot,
} from './remaining-place-figures.js';
const now = '2026-10-31T12:00:00.000Z';
const prior = '2026-04-30T12:00:00.000Z';
function fact(
  listingId = 'a',
  propertyId = 'A',
  price = 10000,
  at = now,
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
    effectiveAt: at,
    provenance: {
      sourceId: 'source-a',
      sourceListingId: listingId,
      sourceUrl: `https://source.invalid/${listingId}`,
      observedAt: at,
      runId: 'run',
      snapshotId: 'snapshot',
      contentHash: `sha256:${'a'.repeat(64)}`,
    },
    ...changes,
  };
}
function snapshot(
  current: readonly ListingFact[] = [],
  history: readonly ListingFact[] = [],
  priceChanges: MarketFiguresSnapshot['priceChanges'] = [],
): MarketFiguresSnapshot {
  return {
    representatives: current,
    current,
    history: history.map((listing, index) => ({ listing, revision: index + 1 })),
    priceChanges,
  };
}
const calculate = (input: MarketFiguresSnapshot, at = now) =>
  remainingPlaceFigures(input, ['block'], at);
describe('D-096 retained place figures', () => {
  it('pairs properties once, allows different representatives, excludes a new property and reports both samples', () => {
    const old = fact('b', 'A', 20000, prior, { sourceId: 'old-source' });
    const input = snapshot(
      [fact(), fact('b', 'A', 30000, now, { sourceId: 'old-source' }), fact('c', 'B', 90000)],
      [old, fact('a', 'A', 40000, prior)],
    );
    const result = calculate(input);
    expect(result.askingPriceMovement).toMatchObject({
      value: -50,
      recordCount: 1,
      windowMonths: 6,
      sources: [{ id: 'old-source' }, { id: 'source-a' }],
    });
    expect(result.listingsPerProperty).toMatchObject({ value: 1.5, recordCount: 2 });
    expect(result.priceReductions).toMatchObject({
      value: { count: 0, percentage: 0 },
      recordCount: 3,
    });
    expect(result.recordedSalePricePerSquareMeter).toMatchObject({
      state: 'not-recorded',
      value: null,
      recordCount: 0,
      sources: [],
    });
  });
  it('clamps UTC calendar month ends, including leap years and preserves time', () => {
    expect(sixMonthsBefore(now)).toBe(prior);
    expect(sixMonthsBefore('2024-08-31T03:04:05.006Z')).toBe('2024-02-29T03:04:05.006Z');
    expect(sixMonthsBefore('2025-08-31T03:04:05.006Z')).toBe('2025-02-28T03:04:05.006Z');
    expect(sixMonthsBefore('2026-01-15T03:04:05.006Z')).toBe('2025-07-15T03:04:05.006Z');
  });
  it('uses the highest revision meeting both inclusive cutoff conditions, never latest timestamps', () => {
    const old = fact('a', 'A', 20000, prior);
    const observedLate = {
      ...old,
      askingPriceMinorUnits: 90000,
      provenance: { ...old.provenance, observedAt: '2026-04-30T12:00:00.001Z' },
    };
    const effectiveLate = { ...old, effectiveAt: '2026-04-30T12:00:00.001Z' };
    const input = snapshot(
      [fact()],
      [fact('a', 'A', 30000, '2026-04-29T00:00:00.000Z'), old, observedLate, effectiveLate],
    );
    expect(calculate(input).askingPriceMovement.value).toBe(-50);
    expect(
      calculate(snapshot([fact()], [observedLate, effectiveLate])).askingPriceMovement.value,
    ).toBeNull();
  });
  it('retains causal revision order when timestamps regress and honors removal at the prior cutoff', () => {
    const active = fact('a', 'A', 20000, prior);
    const higher = fact('a', 'A', 40000, '2026-04-29T12:00:00.000Z');
    const input = {
      ...snapshot([fact()]),
      history: [
        { revision: 10, listing: higher },
        { revision: 2, listing: active },
      ],
    };
    expect(calculate(input).askingPriceMovement.value).toBe(-75);
    expect(
      calculate({
        ...input,
        history: [...input.history, { revision: 11, listing: { ...higher, status: 'removed' } }],
      }).askingPriceMovement.value,
    ).toBeNull();
  });
  it('selects globally before scope and area at both instants and breaks price ties by listing ID', () => {
    expect(
      calculate(
        snapshot(
          [fact('a', 'A', 10000, now, { placeId: 'outside' }), fact('b', 'A', 20000)],
          [fact('b', 'A', 20000, prior)],
        ),
      ).listingsPerProperty.value,
    ).toBeNull();
    const result = calculate(
      snapshot(
        [fact('a', 'A', 10000, now, { areaSquareMeters: null }), fact('b', 'A', 10000)],
        [fact('a', 'A', 20000, prior)],
      ),
    );
    expect(result.askingPriceMovement.value).toBeNull();
    expect(result.listingsPerProperty.value).toBe(2);
    expect(result.medianTimeOnMarketDays.value).toBe(184);
    expect(
      calculate(
        snapshot(
          [fact()],
          [fact('a', 'A', 20000, prior, { placeId: 'outside' }), fact('b', 'A', 30000, prior)],
        ),
      ).askingPriceMovement.value,
    ).toBeNull();
  });
  it('keeps removed member history and reappearance age, using the median of observed elapsed days', () => {
    const removed = fact('removed', 'A', 10000, now, { status: 'removed' });
    const result = calculate(
      snapshot(
        [fact(), removed, fact('b', 'B')],
        [
          fact('removed', 'A', 10000, '2026-10-01T00:00:00.000Z'),
          fact('b', 'B', 10000, '2026-10-21T00:00:00.000Z'),
        ],
      ),
    );
    expect(result.medianTimeOnMarketDays).toMatchObject({ value: 20.5, recordCount: 2 });
    expect(result.listingsPerProperty.value).toBe(1);
    expect(result.medianTimeOnMarketDays.sources[0]?.url).toBe('https://source.invalid/b');
  });
  it('counts confirmed active listing decreases once in the lower-exclusive upper-inclusive interval', () => {
    const a = fact();
    const at = (date: string, id = 'a') => fact(id, 'A', 10000, date);
    const changes = [
      { listing: at('2026-10-01T12:00:00.000Z'), previousMinorUnits: 20000 },
      { listing: at('2026-10-01T12:00:00.001Z'), previousMinorUnits: 20000 },
      { listing: a, previousMinorUnits: 30000 },
      { listing: at('2026-10-31T12:00:00.001Z', 'b'), previousMinorUnits: 20000 },
      { listing: fact('b', 'A'), previousMinorUnits: 9000 },
      { listing: fact('removed', 'A'), previousMinorUnits: 20000 },
    ];
    expect(
      calculate(
        snapshot(
          [a, fact('b', 'A'), fact('removed', 'A', 1, now, { status: 'removed' })],
          [],
          changes,
        ),
      ).priceReductions,
    ).toMatchObject({ value: { count: 1, percentage: 50 }, recordCount: 2 });
    expect(calculate(snapshot([a], [], [changes[0]!])).priceReductions.value).toEqual({
      count: 0,
      percentage: 0,
    });
  });
  it('returns honest empty and absent-baseline states, with independent live provenance', () => {
    const empty = calculate(snapshot());
    for (const [key, value] of Object.entries(empty)) {
      expect(value).toMatchObject({
        value: null,
        recordCount: 0,
        sources: [],
        computedAt: now,
        freshness: { status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 0 },
      });
      expect(value.state).toBe(
        key === 'recordedSalePricePerSquareMeter' ? 'not-recorded' : 'insufficient-data',
      );
    }
    expect(calculate(snapshot([fact()])).askingPriceMovement.value).toBeNull();
    expect(calculate(snapshot([fact()])).medianTimeOnMarketDays.value).toBe(0);
  });
  it('fails closed on unsafe arithmetic, malformed revisions and future contributing observations', () => {
    expect(() =>
      calculate(
        snapshot([fact('a', 'A', Number.MAX_SAFE_INTEGER, now, { areaSquareMeters: 0.01 })]),
      ),
    ).toThrow();
    expect(() =>
      calculate(snapshot([fact()], [fact('a', 'A', 1, prior, { areaSquareMeters: 1000000 })])),
    ).toThrow();
    expect(() =>
      calculate({ ...snapshot(), history: [{ revision: 0, listing: fact() }] }),
    ).toThrow();
    const future = fact('a', 'A', 10000, '2026-11-01T00:00:00.000Z');
    expect(() => calculate(snapshot([future]))).toThrow();
    expect(() =>
      calculate(snapshot([fact()], [], [{ listing: future, previousMinorUnits: 1.5 }])),
    ).toThrow();
    expect(() =>
      calculate(
        snapshot(
          [fact()],
          [],
          [{ listing: { ...fact(), provenance: future.provenance }, previousMinorUnits: 20000 }],
        ),
      ),
    ).toThrow();
    expect(() =>
      calculate(
        snapshot(
          [fact('a', 'A', Number.MAX_SAFE_INTEGER, now, { areaSquareMeters: 1 })],
          [fact('a', 'A', 1, prior, { areaSquareMeters: 1 })],
        ),
      ),
    ).toThrow('Unsafe movement');
  });
});
