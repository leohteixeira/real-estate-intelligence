import type { PlaceDetail } from '@rei/domain';
import { describe, expect, it, vi } from 'vitest';
import type { LocationsFacade } from '../locations/index.js';
import type { PreparedMarketSample } from './market-fixture-read.port.js';
import { MarketQueryService } from './market-query.service.js';

const date = '2026-10-01T12:00:00.000Z';
const proof = {
  recordCount: 0,
  sources: [],
  computedAt: date,
  freshness: { status: 'fresh' as const, latestCollectionCompletedAt: null, ageSeconds: 0 },
};
const unavailable = { ...proof, state: 'insufficient-data' as const, value: null };
const sample: PreparedMarketSample = {
  metadata: { dataMode: 'synthetic-stub', fixtureVersion: 'fixture', asOf: date },
  basis: 'prepared-market-example',
  evaluatedAt: date,
  counts: { properties: 0, activeListings: 0, sources: 0 },
  figures: {
    medianAskingPricePerSquareMeter: unavailable,
    askingPriceMovement: { ...unavailable, windowMonths: 6 },
    medianTimeOnMarketDays: unavailable,
    priceReductions: { ...unavailable, windowDays: 30 },
    listingsPerProperty: unavailable,
    recordedSalePricePerSquareMeter: { ...proof, state: 'not-recorded', value: null },
  },
  points: [{ month: '2026-10', median: unavailable }],
};
function fixture() {
  const place: PlaceDetail = {
    id: 'child',
    kind: 'neighborhood',
    name: { en: 'Child', ptBR: 'Child' },
    parentId: 'parent',
    breadcrumbs: [],
    adjacentPlaceIds: ['neighbor'],
    propertyCount: 0,
    coordinates: null,
    block: null,
  };
  const getPlace = vi.fn(async (id: string) => {
    if (id === 'unknown') return null;
    return {
      metadata: sample.metadata,
      place: {
        ...place,
        id,
        parentId: id === 'parent' ? null : 'parent',
        kind: id === 'parent' ? ('country' as const) : place.kind,
      },
    };
  });
  const scope = vi.fn(async (id: string): Promise<readonly string[] | null> => [id]);
  const locations: LocationsFacade = {
    getPlace,
    registeredScopeIds: scope,
    resolveFixtureAddress: async () => null,
    resolvePublishedAddress: async () => null,
    roots: async () => ({ metadata: sample.metadata, items: [] }),
    children: async () => null,
  };
  const read = vi.fn(async () => sample);
  return { service: new MarketQueryService({ read }, locations), read, getPlace, scope };
}
describe('Market facade query orchestration', () => {
  it('keeps known empty scopes readable, obtains actual parents and detaches fixture state', async () => {
    const { service, read, scope } = fixture();
    const result = (await service.getPlaceMarket('child'))!;
    expect(result.counts.properties).toBe(0);
    expect(result.parentMedian?.place.id).toBe('parent');
    expect(scope.mock.calls).toEqual([['child'], ['parent']]);
    expect(read.mock.calls).toHaveLength(2);
    Reflect.set(result.metadata, 'fixtureVersion', 'mutated');
    expect((await service.getPlaceMarket('child'))!.metadata.fixtureVersion).toBe('fixture');
    expect((await service.getPlaceMarket('parent'))!.parentMedian).toBeNull();
    expect((await service.monthlySeries('parent'))!.points[0]!.parentMedian).toBeNull();
    expect((await service.neighbours('child'))!.items[0]!.place.id).toBe('neighbor');
    expect((await service.monthlySeries('child'))!.comparisonPlace?.id).toBe('parent');
  });
  it('returns null for unknown places before reading a fixture', async () => {
    const { service, read } = fixture();
    for (const method of ['getPlaceMarket', 'neighbours', 'monthlySeries'] as const)
      expect(await service[method]('unknown')).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it.each(['BAD', 'with space', '', 'a'.repeat(201)])('rejects malformed ID %s', async (id) => {
    await expect(fixture().service.getPlaceMarket(id)).rejects.toThrow('Invalid place identifier');
  });
  it('propagates dependency failures and inconsistent registration', async () => {
    const brokenScope = fixture();
    brokenScope.scope.mockResolvedValue(null);
    await expect(brokenScope.service.getPlaceMarket('child')).rejects.toThrow('scope unavailable');
    const brokenRead = fixture();
    brokenRead.read.mockRejectedValue(new Error('fixture failed'));
    await expect(brokenRead.service.getPlaceMarket('child')).rejects.toThrow('fixture failed');
    const brokenLocation = fixture();
    brokenLocation.getPlace.mockRejectedValue(new Error('database failed'));
    await expect(brokenLocation.service.getPlaceMarket('child')).rejects.toThrow('database failed');
    for (const [method, absent] of [
      ['getPlaceMarket', 'parent'],
      ['neighbours', 'neighbor'],
      ['monthlySeries', 'parent'],
    ] as const) {
      const broken = fixture();
      const original = broken.getPlace.getMockImplementation()!;
      broken.getPlace.mockImplementation((id) =>
        id === absent ? Promise.resolve(null) : original(id),
      );
      await expect(broken.service[method]('child')).rejects.toThrow('unavailable');
    }
    const misaligned = fixture();
    misaligned.read
      .mockResolvedValueOnce(sample)
      .mockResolvedValueOnce({ ...sample, points: [{ month: '2026-09', median: unavailable }] });
    await expect(misaligned.service.monthlySeries('child')).rejects.toThrow('misaligned');
  });
});
