import { describe, expect, it, vi } from 'vitest';
import type { PropertySummary, SearchQuery, PlaceDetail } from '@rei/domain';
import { SearchPropertiesService } from './search-properties.service.js';
import { median, normalizePropertySearchQuery, searchProperties } from './property-search.js';
const at = '2026-10-01T12:00:00.000Z';
function summary(id: string, overrides: Partial<PropertySummary> = {}): PropertySummary {
  return {
    id,
    fixtureLabel: 'Synthetic',
    propertyType: 'apartment',
    place: { id: 'block', kind: 'street-block', name: { en: 'Block', ptBR: 'Block' } },
    breadcrumbs: [{ id: 'sao-paulo', kind: 'city', name: { en: 'City', ptBR: 'City' } }],
    areaSquareMeters: 100,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    askingPrice: {
      minorUnits: 10000,
      currency: 'BRL',
      listingId: `listing-${id}`,
      provenance: {
        sourceId: 'owned',
        sourceListingId: id,
        sourceUrl: 'https://example.test',
        runId: 'run',
        snapshotId: 'snapshot',
        contentHash: 'sha256:hash',
        observedAt: at,
      },
    },
    pricePerSquareMeter: 100,
    timeOnMarketDays: 31,
    firstCollectedAt: at,
    lastCollectedAt: at,
    activeListingCount: 1,
    priceReduced: false,
    returnedToMarket: false,
    belowMedianPercent: null,
    neighborhoodComparison: null,
    ...overrides,
  };
}
function fixture(
  rows = [
    summary('c', { pricePerSquareMeter: 300 }),
    summary('b', { pricePerSquareMeter: 200 }),
    summary('a'),
  ],
) {
  const repository = {
    readCurrent: vi.fn(async () =>
      rows.map((summary) => ({ summary, asOf: summary.lastCollectedAt })),
    ),
  };
  const city: PlaceDetail = {
    id: 'sao-paulo',
    kind: 'city',
    name: { en: 'City', ptBR: 'City' },
    parentId: null,
    breadcrumbs: [],
    propertyCount: 0,
    coordinates: null,
    block: null,
    adjacentPlaceIds: [],
  };
  const locations = {
    registeredScopeIds: vi.fn(async (id: string) =>
      id === 'unknown' ? null : ['sao-paulo', 'block'],
    ),
    roots: vi.fn(async () => ({
      metadata: { dataMode: 'synthetic-stub' as const, fixtureVersion: 'places', asOf: at },
      items: [city],
    })),
    children: vi.fn(async () => null),
  };
  const clock = { now: vi.fn(() => '2026-10-25T00:00:00.000Z') };
  return {
    repository,
    locations,
    clock,
    service: new SearchPropertiesService(repository, locations, clock),
  };
}
describe('current persisted property search', () => {
  it('calculates the whole filtered odd/even median, signed deviation and stable ordering before paging', async () => {
    const f = fixture();
    const first = await f.service.execute({ pageSize: 1 });
    expect(first).toMatchObject({
      totalItems: 3,
      medianPricePerSquareMeter: 200,
      metadata: { asOf: at, fixtureVersion: 'persisted-synthetic-search-v1' },
      placeCounts: [{ placeId: 'sao-paulo', totalItems: 3 }],
    });
    expect(first.items.map((item) => [item.id, item.belowMedianPercent])).toEqual([['a', 50]]);
    const second = await f.service.execute({
      placeId: 'sao-paulo',
      sort: 'furthest-below-median',
      pageSize: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items[0]!.id).toBe('b');
    expect(second.totalItems).toBe(3);
    expect(second.medianPricePerSquareMeter).toBe(200);
    const third = await f.service.execute({ pageSize: 1, cursor: second.nextCursor! });
    expect(third.items.map((item) => [item.id, item.belowMedianPercent])).toEqual([['c', -50]]);
    expect(third.nextCursor).toBeNull();
    expect(
      (await f.service.execute({ minPricePerSquareMeter: 200 })).medianPricePerSquareMeter,
    ).toBe(250);
    expect(median([100, 101])).toBe(101);
    expect(f.repository.readCurrent).toHaveBeenCalledWith();
    expect(f.locations.registeredScopeIds).toHaveBeenCalledWith('sao-paulo');
    Reflect.set(first.items[0]!.place.name, 'en', 'Changed');
    expect((await f.service.execute({})).items[0]!.place.name.en).toBe('Block');
  });
  it('uses a maximum observed clock, preserves empty/null results and has no market comparison', async () => {
    const f = fixture([
      summary('a'),
      summary('removed', {
        askingPrice: null,
        pricePerSquareMeter: null,
        lastCollectedAt: '2026-10-10T12:00:00.000Z',
      }),
    ]);
    expect(await f.service.execute({})).toMatchObject({
      metadata: { asOf: '2026-10-10T12:00:00.000Z' },
      totalItems: 2,
      medianPricePerSquareMeter: 100,
    });
    expect((await f.service.execute({})).items.map((item) => item.id)).toEqual(['a', 'removed']);
    for (const item of (await f.service.execute({})).items)
      expect(item.neighborhoodComparison).toBeNull();
    expect(
      (await fixture([summary('null', { pricePerSquareMeter: null })]).service.execute({}))
        .medianPricePerSquareMeter,
    ).toBeNull();
    expect(await fixture([]).service.execute({})).toMatchObject({
      items: [],
      totalItems: 0,
      nextCursor: null,
      medianPricePerSquareMeter: null,
      metadata: { asOf: f.clock.now() },
    });
    expect(await f.service.execute({ placeId: 'unknown' })).toMatchObject({
      items: [],
      totalItems: 0,
    });
  });
  it.each([
    { propertyType: 'house' },
    { minAskingPrice: 10001 },
    { maxAskingPrice: 9999 },
    { minPricePerSquareMeter: 101 },
    { maxPricePerSquareMeter: 99 },
    { minArea: 101 },
    { maxArea: 99 },
    { minBedrooms: 3 },
    { minBathrooms: 3 },
    { minParkingSpaces: 2 },
    { priceReduced: true },
    { returnedToMarket: true },
    { multipleListings: true },
  ] satisfies SearchQuery[])(
    'filters exact independent scalar and boolean bounds %o',
    async (query) => {
      expect((await fixture([summary('a')]).service.execute(query)).totalItems).toBe(0);
    },
  );
  it('composes inclusive bounds, explicit false, scope and missing numeric attributes', () => {
    const query: SearchQuery = {
      minAskingPrice: 10000,
      maxAskingPrice: 10000,
      minPricePerSquareMeter: 100,
      maxPricePerSquareMeter: 100,
      minArea: 100,
      maxArea: 100,
      minBedrooms: 2,
      minBathrooms: 2,
      minParkingSpaces: 1,
      priceReduced: false,
      returnedToMarket: false,
      multipleListings: false,
    };
    expect(
      searchProperties([summary('a')], query, () => true).items.map((item) => item.id),
    ).toEqual(['a']);
    expect(searchProperties([summary('a')], query, () => false).items).toEqual([]);
    for (const field of [
      'askingPrice',
      'pricePerSquareMeter',
      'areaSquareMeters',
      'bedrooms',
      'bathrooms',
      'parkingSpaces',
    ] as const)
      expect(searchProperties([summary('a', { [field]: null })], query, () => true).items).toEqual(
        [],
      );
    for (const field of ['priceReduced', 'returnedToMarket'] as const)
      expect(
        searchProperties([summary('a', { [field]: true })], { [field]: false }, () => true).items,
      ).toEqual([]);
    expect(
      searchProperties(
        [summary('a', { activeListingCount: 2 })],
        { multipleListings: false },
        () => true,
      ).items,
    ).toEqual([]);
  });
  it.each([
    ['up-to-30', [0, 30]],
    ['31-to-90', [31, 90]],
    ['over-90', [91, 180, 181]],
    ['over-180', [181]],
  ] as const)('preserves time band boundaries %s', (timeOnMarket, expected) => {
    const values = [0, 30, 31, 90, 91, 180, 181];
    expect(
      searchProperties(
        values.map((days) => summary(String(days), { timeOnMarketDays: days })),
        { timeOnMarket },
        () => true,
      )
        .items.map((item) => item.timeOnMarketDays)
        .sort((a, b) => a - b),
    ).toEqual(expected);
  });
  it('orders all four sorts with ID ties and keeps missing prices last', () => {
    const rows = [
      summary('b'),
      summary('a'),
      summary('c', {
        pricePerSquareMeter: 300,
        timeOnMarketDays: 90,
        firstCollectedAt: '2026-10-02T12:00:00.000Z',
      }),
      summary('null-z', { pricePerSquareMeter: null }),
      summary('null-a', { pricePerSquareMeter: null }),
    ];
    for (const sort of ['furthest-below-median', 'lowest-price-per-square-meter'] as const)
      expect(searchProperties(rows, { sort }, () => true).items.map((item) => item.id)).toEqual([
        'a',
        'b',
        'c',
        'null-a',
        'null-z',
      ]);
    for (const sort of ['longest-on-market', 'most-recent'] as const)
      expect(searchProperties(rows, { sort }, () => true).items.map((item) => item.id)).toEqual([
        'c',
        'a',
        'b',
        'null-a',
        'null-z',
      ]);
  });
  it('rejects invalid queries/cross-query cursors and propagates failed reads', async () => {
    const f = fixture();
    for (const query of [
      { minArea: 2, maxArea: 1 },
      { priceReduced: 'false' },
      { pageSize: 21 },
      { extra: 'secret' },
    ])
      await expect(f.service.execute(query as never)).rejects.toThrow('Invalid read query');
    expect(f.locations.registeredScopeIds).not.toHaveBeenCalled();
    const cursor = (await f.service.execute({ pageSize: 1 })).nextCursor!;
    for (const query of [
      { pageSize: 2, cursor },
      { pageSize: 1, minArea: 1, cursor },
      { cursor: 'bad' },
    ])
      await expect(f.service.execute(query)).rejects.toThrow('Invalid read query');
    f.repository.readCurrent.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(f.service.execute({})).rejects.toThrow('Database unavailable');
    f.locations.registeredScopeIds.mockRejectedValueOnce(new Error('Locations unavailable'));
    await expect(f.service.execute({})).rejects.toThrow('Locations unavailable');
    expect(normalizePropertySearchQuery({})).toEqual({
      placeId: 'sao-paulo',
      sort: 'furthest-below-median',
      pageSize: 20,
    });
  });
});
