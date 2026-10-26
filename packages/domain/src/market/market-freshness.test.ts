import { describe, expect, it } from 'vitest';
import { marketFreshness } from './market-freshness.js';
import type { MarketEvidence } from './market.read.types.js';

const computedAt = '2026-10-01T00:00:00.000Z';
const evaluatedAt = '2026-10-01T00:00:10.250Z';
const before = '2026-09-30T23:59:59.000Z';
const during = '2026-10-01T00:00:05.000Z';
const source = (id: string) => ({
  id,
  label: id,
  url: `https://${id}.invalid/`,
  collectedAt: computedAt,
});
const figure: MarketEvidence = {
  recordCount: 2,
  sources: [source('a'), source('b')],
  computedAt,
  freshness: { status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 0 },
};
describe('per-contributor Market completion freshness', () => {
  it.each([
    [[], 'untracked', null],
    [[{ sourceId: 'a', completedAt: during }], 'untracked', null],
    [[{ sourceId: 'other', completedAt: during }], 'untracked', null],
    [
      [
        { sourceId: 'a', completedAt: before },
        { sourceId: 'b', completedAt: before },
      ],
      'fresh',
      before,
    ],
    [
      [
        { sourceId: 'a', completedAt: computedAt },
        { sourceId: 'b', completedAt: before },
      ],
      'fresh',
      computedAt,
    ],
    [
      [
        { sourceId: 'a', completedAt: during },
        { sourceId: 'b', completedAt: before },
      ],
      'stale',
      during,
    ],
  ] as const)('uses exact complete contributor coverage %#', (completions, status, latest) => {
    const result = marketFreshness(figure, completions, evaluatedAt);
    expect(result.freshness).toEqual({
      status,
      latestCollectionCompletedAt: latest,
      ageSeconds: 10.25,
    });
    expect(result.computedAt).toBe(computedAt);
    expect(result.sources).toEqual(figure.sources);
    expect(result.sources).not.toBe(figure.sources);
    expect(figure.freshness.ageSeconds).toBe(0);
  });
  it('uses maximum per source, excludes unrelated contributors and keeps empty evidence untracked', () => {
    const completions = [
      { sourceId: 'a', completedAt: during },
      { sourceId: 'a', completedAt: before },
      { sourceId: 'b', completedAt: before },
      { sourceId: 'other', completedAt: evaluatedAt },
    ];
    expect(
      marketFreshness(figure, completions, evaluatedAt).freshness.latestCollectionCompletedAt,
    ).toBe(during);
    expect(
      marketFreshness({ ...figure, recordCount: 0, sources: [] }, completions, evaluatedAt)
        .freshness,
    ).toEqual({ status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 10.25 });
    // An observation from a running collection may follow the last completed collection.
    expect(marketFreshness(figure, completions, evaluatedAt, evaluatedAt).freshness.status).toBe(
      'fresh',
    );
  });
  it('fails closed for invalid/future stored completion, observation, computation or evaluation', () => {
    for (const completedAt of ['invalid', '2026-02-30T00:00:00Z', '2026-10-01T00:00:11Z'])
      expect(() =>
        marketFreshness(figure, [{ sourceId: 'a', completedAt }], evaluatedAt),
      ).toThrow();
    expect(() => marketFreshness(figure, [], 'invalid')).toThrow();
    expect(() => marketFreshness(figure, [], before)).toThrow();
    expect(() =>
      marketFreshness(
        { ...figure, sources: [{ ...source('a'), collectedAt: '2026-10-02T00:00:00Z' }] },
        [],
        evaluatedAt,
      ),
    ).toThrow();
  });
});
