import { DomainValidationError, type ListingFact, type PlaceDetail } from '@rei/domain';
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
  return { service: new MarketQueryService({ read }, locations), read, getPlace, scope, locations };
}
describe('Market facade query orchestration', () => {
  it('translates stored-fact validation failures without changing malformed-request errors', async () => {
    const f = fixture();
    const invalidFact = new DomainValidationError('Invalid stored fact.', 'event');
    const readFigures = vi.fn(async () => {
      throw invalidFact;
    });
    const service = new MarketQueryService({ read: f.read }, f.locations, {
      facts: { readCompletions: async () => [], readCurrent: async () => [], readFigures },
      clock: { now: () => date },
    });
    await expect(service.getPlaceMarket('child')).rejects.toMatchObject({
      name: 'Error',
      message: 'Stored Market price facts could not be evaluated.',
      cause: invalidFact,
    });
    await expect(service.neighbours('child')).rejects.toMatchObject({
      message: 'Stored Market price facts could not be evaluated.',
      cause: invalidFact,
    });
    await expect(service.monthlySeries('child')).rejects.toMatchObject({
      message: 'Stored Market price facts could not be evaluated.',
      cause: invalidFact,
    });
    await expect(service.monthlySeries('BAD')).rejects.toBeInstanceOf(DomainValidationError);
    await expect(service.getPlaceMarket('BAD')).rejects.toBeInstanceOf(DomainValidationError);
    await expect(service.neighbours('BAD')).rejects.toBeInstanceOf(DomainValidationError);
    expect(readFigures).toHaveBeenCalledTimes(3);
  });
  it.each(['child', 'parent'])(
    'translates an unrepresentable live %s median into a server failure',
    async (placeId) => {
      const f = fixture();
      const fact: ListingFact = {
        listingId: 'listing',
        propertyId: 'property',
        sourceId: 'synthetic-source',
        sourceListingId: 'listing',
        placeId,
        propertyType: 'apartment',
        status: 'active',
        askingPriceMinorUnits: 1,
        currency: 'BRL',
        areaSquareMeters: 1_000_000,
        effectiveAt: date,
        provenance: {
          sourceId: 'synthetic-source',
          sourceListingId: 'listing',
          sourceUrl: 'https://source.invalid/listing',
          observedAt: date,
          runId: 'run',
          snapshotId: 'snapshot',
          contentHash: `sha256:${'a'.repeat(64)}`,
        },
      };
      const service = new MarketQueryService({ read: f.read }, f.locations, {
        facts: {
          readCompletions: async () => [],
          readCurrent: async () => [fact],
          readFigures: async () => ({
            representatives: [fact],
            current: [fact],
            history: [],
            priceChanges: [],
          }),
        },
        clock: { now: () => date },
      });
      await expect(service.getPlaceMarket('child')).rejects.toMatchObject({
        name: 'Error',
        message: 'Stored Market price facts could not be evaluated.',
        cause: expect.any(DomainValidationError),
      });
    },
  );
  it('explicitly injects a live read and clock, uses actual scopes once and never falls back on failure', async () => {
    const f = fixture();
    const readFigures = vi.fn(async () => ({
      representatives: [],
      current: [],
      history: [],
      priceChanges: [],
    }));
    const now = vi.fn(() => '2026-10-11T12:00:00.000Z');
    const service = new MarketQueryService({ read: f.read }, f.locations, {
      facts: { readCompletions: async () => [], readCurrent: async () => [], readFigures },
      clock: { now },
    });
    const result = (await service.getPlaceMarket('child'))!;
    expect(result).toMatchObject({
      basis: 'event-fed-place-figures',
      evaluatedAt: '2026-10-11T12:00:00.000Z',
      counts: { properties: 0, activeListings: 0, sources: 0 },
      figures: {
        medianAskingPricePerSquareMeter: {
          value: null,
          recordCount: 0,
          freshness: { status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 0 },
        },
      },
      parentMedian: { place: { id: 'parent' }, median: { value: null } },
    });
    expect(readFigures).toHaveBeenCalledTimes(1);
    expect(f.scope.mock.calls).toEqual([['child'], ['parent']]);
    expect(await service.getPlaceMarket('unknown')).toBeNull();
    expect(readFigures).toHaveBeenCalledTimes(1);
    const neighbors = (await service.neighbours('child'))!;
    expect(neighbors.basis).toBe('event-fed-place-figures');
    expect(neighbors.items[0]!.median.value).toBeNull();
    expect(readFigures).toHaveBeenCalledTimes(2);
    expect(now).toHaveBeenCalledTimes(4);
    expect(result).not.toHaveProperty('preparedEvaluatedAt');
    expect(result).not.toHaveProperty('preparedSections');
    const series = (await service.monthlySeries('child'))!;
    expect(series.basis).toBe('event-fed-place-figures');
    expect(series.points).toHaveLength(12);
    expect(series.comparisonPlace?.id).toBe('parent');
    expect(
      series.points.every(
        (point) => point.median.value === null && point.parentMedian?.value === null,
      ),
    ).toBe(true);
    expect(readFigures).toHaveBeenCalledTimes(3);
    expect(now).toHaveBeenCalledTimes(6);
    Reflect.set(series.metadata, 'fixtureVersion', 'mutated');
    expect((await service.monthlySeries('child'))!.metadata.fixtureVersion).toBe('fixture');
    expect((await service.monthlySeries('parent'))!.comparisonPlace).toBeNull();
    readFigures.mockRejectedValue(new Error('Live dependency failed'));
    await expect(service.getPlaceMarket('child')).rejects.toThrow('Live dependency failed');
    await expect(service.neighbours('child')).rejects.toThrow('Live dependency failed');
    await expect(service.monthlySeries('child')).rejects.toThrow('Live dependency failed');
  });
  it('counts the represented population without an area filter and evaluates only registered neighbours coherently', async () => {
    const f = fixture();
    f.scope.mockImplementation(async (id) =>
      id === 'parent'
        ? ['child', 'child-block', 'neighbor', 'empty', 'sibling']
        : [id, `${id}-block`],
    );
    const getPlace = f.getPlace.getMockImplementation()!;
    f.getPlace.mockImplementation(async (id) => {
      const response = await getPlace(id);
      return response
        ? {
            ...response,
            place: {
              ...response.place,
              adjacentPlaceIds: id === 'child' ? ['neighbor', 'empty'] : [],
            },
          }
        : null;
    });
    const listing = (
      id: string,
      property: string,
      place: string,
      price: number,
      area: number | null = 10,
      source = 'source-a',
    ): ListingFact => ({
      listingId: id,
      propertyId: property,
      placeId: place,
      sourceId: source,
      sourceListingId: id,
      propertyType: 'apartment',
      status: 'active',
      askingPriceMinorUnits: price,
      currency: 'BRL',
      areaSquareMeters: area,
      effectiveAt: date,
      provenance: {
        sourceId: source,
        sourceListingId: id,
        sourceUrl: `https://source.invalid/${id}`,
        observedAt: date,
        runId: 'run',
        snapshotId: 'snapshot',
        contentHash: `sha256:${'a'.repeat(64)}`,
      },
    });
    const current = [
      listing('a', 'one', 'child-block', 10000),
      listing('b', 'one', 'neighbor', 20000, 10, 'source-b'),
      listing('c', 'null-area', 'child', 5000, null),
      listing('d', 'outside-minimum', 'neighbor', 1000),
      listing('e', 'outside-minimum', 'child', 30000),
      listing('f', 'sibling', 'sibling', 90000),
    ];
    const representatives = [current[0]!, current[2]!, current[3]!, current[5]!];
    const readFigures = vi.fn(async () => ({
      representatives,
      current,
      history: current.map((listing) => ({ listing, revision: 1 })),
      priceChanges: [],
    }));
    const now = vi.fn(() => date);
    const service = new MarketQueryService({ read: f.read }, f.locations, {
      facts: {
        readCompletions: async () => [],
        readCurrent: async () => representatives,
        readFigures,
      },
      clock: { now },
    });
    const overview = (await service.getPlaceMarket('child'))!;
    expect(overview.counts).toEqual({ properties: 2, activeListings: 3, sources: 2 });
    expect(overview.figures.medianAskingPricePerSquareMeter).toMatchObject({
      recordCount: 1,
      value: { minorUnits: 1000 },
    });
    expect(overview.parentMedian?.median).toMatchObject({
      recordCount: 3,
      value: { minorUnits: 1000 },
    });
    const neighbors = (await service.neighbours('child'))!;
    expect(readFigures).toHaveBeenCalledTimes(2);
    expect(now).toHaveBeenCalledTimes(4);
    expect(neighbors.items.map((item) => item.place.id)).toEqual(['neighbor', 'empty']);
    expect(neighbors.items[0]!.median).toMatchObject({
      recordCount: 1,
      value: { minorUnits: 100 },
    });
    expect(neighbors.items[1]!.median).toMatchObject({ recordCount: 0, value: null });
    for (const item of neighbors.items) {
      expect(item.median.computedAt).toBe(date);
      expect(item.movement.computedAt).toBe(date);
    }
    Reflect.set(neighbors.items[0]!.median.sources[0]!, 'url', 'mutated');
    expect((await service.neighbours('child'))!.items[0]!.median.sources[0]!.url).toBe(
      'https://source.invalid/d',
    );
    const series = (await service.monthlySeries('child'))!;
    expect(series.comparisonPlace?.id).toBe('parent');
    expect(series.points[10]!.median.value).toBeNull();
    expect(series.points[11]!.median).toMatchObject({
      recordCount: 1,
      value: { minorUnits: 1000 },
    });
    expect(series.points[11]!.parentMedian).toMatchObject({
      recordCount: 3,
      value: { minorUnits: 1000 },
    });
    Reflect.set(series.points[11]!.median.sources[0]!, 'url', 'mutated');
    expect((await service.monthlySeries('child'))!.points[11]!.median.sources[0]!.url).toBe(
      'https://source.invalid/a',
    );
    expect((await service.neighbours('parent'))!.items).toEqual([]);
    expect(f.scope.mock.calls.map(([id]) => id)).not.toContain('sibling');
  });
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

it('uses one snapshot and a later completion read for exact stale evidence across all live surfaces', async () => {
  const f = fixture();
  const computedAt = '2026-09-30T23:59:59.000Z';
  const completedAt = '2026-09-30T23:59:59.500Z';
  const evaluatedAt = '2026-10-01T00:00:01.250Z';
  const fact: ListingFact = {
    listingId: 'listing',
    propertyId: 'property',
    sourceId: 'source-a',
    sourceListingId: 'listing',
    placeId: 'child',
    propertyType: 'apartment',
    status: 'active',
    askingPriceMinorUnits: 10000,
    currency: 'BRL',
    areaSquareMeters: 10,
    effectiveAt: '2026-01-01T00:00:00.000Z',
    provenance: {
      sourceId: 'source-a',
      sourceListingId: 'listing',
      sourceUrl: 'https://source.invalid/listing',
      observedAt: '2026-01-01T00:00:00.000Z',
      runId: 'run',
      snapshotId: 'snapshot',
      contentHash: `sha256:${'a'.repeat(64)}`,
    },
  };
  f.scope.mockImplementation(async (id) =>
    id === 'parent' || id === 'neighbor' ? ['child'] : [id],
  );
  const snapshot = {
    representatives: [fact],
    current: [fact],
    history: [{ revision: 1, listing: fact }],
    priceChanges: [],
  };
  const readFigures = vi.fn(async () => snapshot);
  const readCompletions = vi.fn(async () => [{ sourceId: 'source-a', completedAt }]);
  let ticks = 0;
  const now = vi.fn(() => (ticks++ % 2 === 0 ? computedAt : evaluatedAt));
  const service = new MarketQueryService({ read: f.read }, f.locations, {
    facts: { readCurrent: async () => [fact], readFigures, readCompletions },
    clock: { now },
  });
  const overview = (await service.getPlaceMarket('child'))!;
  for (const figure of [...Object.values(overview.figures), overview.parentMedian!.median]) {
    expect(figure.computedAt).toBe(computedAt);
    expect(figure.freshness).toEqual({
      status: figure.sources.length ? 'stale' : 'untracked',
      latestCollectionCompletedAt: figure.sources.length ? completedAt : null,
      ageSeconds: 2.25,
    });
  }
  expect(overview.figures.medianAskingPricePerSquareMeter.value?.minorUnits).toBe(1000);
  const neighbours = (await service.neighbours('child'))!;
  expect(neighbours.items[0]!.median.freshness.status).toBe('stale');
  const series = (await service.monthlySeries('child'))!;
  expect(series.points.at(-1)!.month).toBe('2026-10');
  if (series.basis !== 'event-fed-place-figures') throw new Error('Expected live series');
  expect(series.points.at(-1)!.asOf).toBe(evaluatedAt);
  expect(series.points[0]!.median.freshness.status).toBe('untracked');
  expect(series.points.at(-1)!.median.freshness).toEqual({
    status: 'stale',
    latestCollectionCompletedAt: completedAt,
    ageSeconds: 2.25,
  });
  expect(series.points.every((point) => point.median.computedAt === computedAt)).toBe(true);
  expect(readFigures).toHaveBeenCalledTimes(3);
  expect(readCompletions).toHaveBeenCalledTimes(3);
  expect(readCompletions).toHaveBeenCalledWith(['source-a']);
  expect(readFigures.mock.invocationCallOrder[0]).toBeLessThan(now.mock.invocationCallOrder[0]!);
  expect(now.mock.invocationCallOrder[0]).toBeLessThan(
    readCompletions.mock.invocationCallOrder[0]!,
  );
  expect(readCompletions.mock.invocationCallOrder[0]).toBeLessThan(
    now.mock.invocationCallOrder[1]!,
  );
  Reflect.set(overview.figures.medianAskingPricePerSquareMeter.sources[0]!, 'url', 'mutated');
  expect(fact.provenance.sourceUrl).toBe('https://source.invalid/listing');
});
